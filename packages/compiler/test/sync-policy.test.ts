import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';

const source = `
import { state } from 'arcade';

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
import { state } from 'arcade';

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
import { state } from 'arcade';

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
