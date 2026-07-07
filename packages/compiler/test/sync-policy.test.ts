import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	compileTsrxModule,
	lowerStateAccess,
	planPayloadArena,
} from '../src/index.ts';

const source = `
import { state } from '@markless/core';

export function Menu() @{
	const menu = state({ open: true });

	<input
		onKeyDown={(event) => {
			if (menu.open && event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				menu.open = false;
			}
		}}
	/>
}
`;

const negatedGuardSource = `
import { state } from '@markless/core';

export function Menu() @{
	const menu = state({ open: false });

	<input
		onKeyDown={(event) => {
			if (!menu.open || event.key === 'Escape') {
				event.stopPropagation();
			}
		}}
	/>
}
`;

const constantGuardSource = `
export function Menu() @{
	const allowEscape = true;

	<input
		onKeyDown={(event) => {
			if (allowEscape && event.key === 'Escape') {
				event.preventDefault();
			}
		}}
	/>
}
`;

const objectConstantGuardSource = `
export function Menu() @{
	const shortcut = { allowEscape: true };

	<input
		onKeyDown={(event) => {
			if (shortcut.allowEscape && event.key === 'Escape') {
				event.preventDefault();
			}
		}}
	/>
}
`;

const computedConstantGuardSource = `
export function Menu() @{
	const allowEscape = (2 > 1) && !false;

	<input
		onKeyDown={(event) => {
			if (allowEscape && event.key === 'Escape') {
				event.preventDefault();
			}
		}}
	/>
}
`;

const arrayConstantGuardSource = `
export function Menu() @{
	const shortcut = [2 > 1];

	<input
		onKeyDown={(event) => {
			if (shortcut[0] && event.key === 'Escape') {
				event.preventDefault();
			}
		}}
	/>
}
`;

const moduleConstantGuardSource = `
const allowEscape = true;

export function Menu() @{
	<input
		onKeyDown={(event) => {
			if (allowEscape && event.key === 'Escape') {
				event.preventDefault();
			}
		}}
	/>
}
`;

const handlerArraySyncPolicySource = `
import { state } from '@markless/core';

export function Menu() @{
	const menu = state({ open: true, locked: true });

	<input
		onKeyDown={[
			(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
				}
			},
			(event) => {
				if (menu.locked && event.key === 'Enter') {
					event.stopPropagation();
				}
			},
		]}
	/>
}
`;

const unconditionalSubmitSource = `import { state } from '@markless/core'; export function Form() @{ let count = state(0); <form onSubmit={(event) => { event.preventDefault(); count++; }}><button>Save {count}</button></form> }`;
const aliasedSubmitSource = `import { state } from '@markless/core'; export function Form() @{ let count = state(0); const submit = (event) => { event.preventDefault(); count++; }; <form onSubmit={submit}><button>Save {count}</button></form> }`;
const constantEqualityGuardSource = `const MODE = 'strict'; export function Menu() @{ <input onKeyDown={(event) => { if (MODE === 'strict') event.preventDefault(); }} /> }`;

test('compiler extracts sync preventDefault policy while keeping writes lazy', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy: {
				when: {
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', graphNodeId: 'state:menu', path: ['open'] },
						{ type: 'event-equals', field: 'key', value: 'Escape' },
					],
				},
				actions: ['preventDefault', 'stopPropagation'],
			},
		}),
	]);

	expect(stateLowering.writes).toEqual([
		expect.objectContaining({
			source: 'menu.open',
			graphNodeId: 'state:menu',
			path: ['open'],
			operation: 'assign',
			method: undefined,
			valueSource: 'false',
		}),
	]);

	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy: {
				when: {
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', graphNodeId: 'state:menu', path: ['open'] },
						{ type: 'event-equals', field: 'key', value: 'Escape' },
					],
				},
				actions: ['preventDefault', 'stopPropagation'],
			},
		}),
	]);
});

test('B914 extracts unconditional and aliased onSubmit policies', async () => {
	const syncPolicy = {
		when: { type: 'constant-truthy', value: true },
		actions: ['preventDefault'],
	};

	for (const source of [unconditionalSubmitSource, aliasedSubmitSource]) {
		const semanticGraph = await buildSemanticGraph({ filename: 'src/Form.tsrx', source });
		const stateLowering = lowerStateAccess({ semanticGraph });
		const payload = planPayloadArena({ semanticGraph, stateLowering });

		expect(semanticGraph.events[0]).toEqual(expect.objectContaining({
			eventName: 'submit',
			handlerSources: ['(event) => { event.preventDefault(); count++; }'],
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}));
		expect(semanticGraph.diagnostics).toEqual([]);
		expect(stateLowering.writes[0]).toEqual(expect.objectContaining({ source: 'count', graphNodeId: 'state:count' }));
		expect(payload.view.events[0]).toEqual(expect.objectContaining({ syncPolicy }));
	}

	const compiled = await compileTsrxModule({
		filename: 'src/Form.tsrx',
		source: unconditionalSubmitSource,
		symbols: [],
	});
	const submitSymbol = compiled.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'event-handler' && symbol.eventName === 'submit',
	);
	const submitModule = compiled.symbolModules.modules.find(
		(module) => module.symbolId === submitSymbol?.id,
	);
	expect(submitModule?.source).not.toContain('event.preventDefault();');
	expect(submitModule?.source).toContain('graphNodeId: "state:count"');
});

test('compiler extracts module-scope serializable constants in sync event policy guards', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: moduleConstantGuardSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		when: {
			type: 'and',
			conditions: [
				{ type: 'constant-truthy', value: true },
				{ type: 'event-equals', field: 'key', value: 'Escape' },
			],
		},
		actions: ['preventDefault'],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});

test('B914 folds module constant equality in sync event policy guards', async () => {
	const semanticGraph = await buildSemanticGraph({ filename: 'src/Menu.tsrx', source: constantEqualityGuardSource });

	expect(semanticGraph.events[0]?.syncPolicy).toEqual({
		when: { type: 'constant-truthy', value: true },
		actions: ['preventDefault'],
	});
	expect(semanticGraph.diagnostics).toEqual([]);
});

test('compiler preserves sync policy branches for handler arrays', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: handlerArraySyncPolicySource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		branches: [
			{
				when: {
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', graphNodeId: 'state:menu', path: ['open'] },
						{ type: 'event-equals', field: 'key', value: 'Escape' },
					],
				},
				actions: ['preventDefault'],
			},
			{
				when: {
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', graphNodeId: 'state:menu', path: ['locked'] },
						{ type: 'event-equals', field: 'key', value: 'Enter' },
					],
				},
				actions: ['stopPropagation'],
			},
		],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			handlerCount: 2,
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});

test('compiler extracts serializable literal constants in sync event policy guards', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: constantGuardSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		when: {
			type: 'and',
			conditions: [
				{ type: 'constant-truthy', value: true },
				{ type: 'event-equals', field: 'key', value: 'Escape' },
			],
		},
		actions: ['preventDefault'],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});

test('compiler extracts static property reads from serializable constants in sync event policy guards', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: objectConstantGuardSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		when: {
			type: 'and',
			conditions: [
				{ type: 'constant-truthy', value: true },
				{ type: 'event-equals', field: 'key', value: 'Escape' },
			],
		},
		actions: ['preventDefault'],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});

test('compiler extracts computed serializable constants in sync event policy guards', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: computedConstantGuardSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		when: {
			type: 'and',
			conditions: [
				{ type: 'constant-truthy', value: true },
				{ type: 'event-equals', field: 'key', value: 'Escape' },
			],
		},
		actions: ['preventDefault'],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});

test('compiler extracts static array index reads from serializable constants in sync event policy guards', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: arrayConstantGuardSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		when: {
			type: 'and',
			conditions: [
				{ type: 'constant-truthy', value: true },
				{ type: 'event-equals', field: 'key', value: 'Escape' },
			],
		},
		actions: ['preventDefault'],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});

test('compiler extracts negated graph-state guards in sync event policy', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: negatedGuardSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		when: {
			type: 'or',
			conditions: [
				{
					type: 'not',
					condition: {
						type: 'graph-truthy',
						graphNodeId: 'state:menu',
						path: ['open'],
					},
				},
				{ type: 'event-equals', field: 'key', value: 'Escape' },
			],
		},
		actions: ['stopPropagation'],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});
