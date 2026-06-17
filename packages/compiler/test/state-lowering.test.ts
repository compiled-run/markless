import { expect, test } from 'vitest';
import type { SemanticGraphArtifact } from '../src/artifacts.ts';
import { buildSemanticGraph } from '../src/index.ts';
import { lowerStateAccess } from '../src/passes/state-lowering.ts';

const source = `
import { state, computed } from '@arcadejs/core';

export function Counter() @{
	let count = state(0);
	let total = state(0);
	let increment = state(2);
	const items = state([]);
	const nextItem = state('first');
	const menu = state({ open: false, title: 'Menu', meta: { label: 'Main' } });
	const { title: menuTitle } = menu;
	const { meta: { label: menuLabel } } = menu;
	const { title: restTitle, ...menuRest } = menu;
	let { open: menuOpen } = menu;
	const chartConfig = state({ palette: 'warm' });
	const analytics = state({ enabled: true });
	const hidden = state(1);
	const doubled = computed(() => count * 2);
	const hiddenDoubled = computed(() => hidden * 2);

	<section>
		<button
			onClick={() => {
				count++;
				total += increment;
				items.push(nextItem);
				menu.open = !menu.open;
				menuOpen = !menuOpen;
				report(analytics.enabled);
			}}
		>
			{count} {doubled} {menu.title} {menuTitle} {menuLabel} {menuRest.meta.label} {menuRest.title}
		</button>
		<canvas attach={renderChart(chartConfig.palette)} />
	</section>
}
`;

const readOnlyWriteSource = `
import { state, computed } from '@arcadejs/core';

export function Counter() @{
	let count = state(0);
	const doubled = computed(() => count * 2);

	<button onClick={() => doubled = 4}>{doubled}</button>
}
`;

const propReadOnlySource = `
export function Greeting({ label }: { label: string }) @{
	<button onClick={() => label = 'Updated'}>{label}</button>
}
`;

const constReassignmentSource = `
import { state } from '@arcadejs/core';

export function Counter() @{
	const frozenCount = state(0);
	const menu = state({ open: false });
	const { open: menuOpen } = menu;

	<button
		onClick={() => {
			frozenCount++;
			menuOpen = true;
			menu.open = true;
		}}
	>
		{frozenCount}
	</button>
}
`;

const nestedAliasSource = `
import { state } from '@arcadejs/core';

export function Queue() @{
	const groups = state([['first'], { meta: { label: 'second' } }]);
	const [[firstItem], { meta: { label: secondLabel } }] = groups;
	let [editableGroup] = groups;

	<button
		onClick={() => {
			editableGroup = ['next'];
		}}
	>
		{firstItem} {secondLabel} {editableGroup[0]}
	</button>
}
`;

const sharedFactorySource = `
import { shared, state, computed } from '@arcadejs/core';

export const session = shared(() => {
	const data = state({ user: null, status: 'anonymous' });
	const signedIn = computed(() => data.user !== null);

	return {
		...data,
		signedIn,
		logout() {
			data.user = null;
			data.status = 'anonymous';
		},
	};
});

export function Header() @{
	const currentSession = session();

	<button
		onClick={() => {
			currentSession.status = 'ready';
		}}
	>
		{currentSession.status} {currentSession.signedIn}
	</button>
}
`;

const sharedDynamicPathSource = `
import { shared, state } from '@arcadejs/core';

export const session = shared(() => {
	const data = state({ status: 'anonymous' });

	return {
		...data,
	};
});

export function Header() @{
	const currentSession = session();
	const statusKey = 'status';

	<button
		onClick={() => {
			currentSession[statusKey] = 'ready';
		}}
	>
		{currentSession[statusKey]}
	</button>
}
`;

test('lowerStateAccess resolves plain reads and writes to graph operations', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Counter.tsrx',
		source,
	});

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.passId).toBe('state-lowering');
	expect(lowered.reads).toEqual(
		expect.arrayContaining([
			{
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
			},
			{
				source: 'doubled',
				graphNodeId: 'computed:doubled',
				path: [],
			},
			{
				source: 'total',
				graphNodeId: 'state:total',
				path: [],
			},
			{
				source: 'increment',
				graphNodeId: 'state:increment',
				path: [],
			},
			{
				source: 'nextItem',
				graphNodeId: 'state:nextItem',
				path: [],
			},
			{
				source: 'menu.title',
				graphNodeId: 'state:menu',
				path: ['title'],
			},
			{
				source: 'menuTitle',
				graphNodeId: 'state:menu',
				path: ['title'],
			},
			{
				source: 'menuLabel',
				graphNodeId: 'state:menu',
				path: ['meta', 'label'],
			},
			{
				source: 'menuRest.meta.label',
				graphNodeId: 'state:menu',
				path: ['meta', 'label'],
			},
			{
				source: 'menuOpen',
				graphNodeId: 'state:menu',
				path: ['open'],
			},
			{
				source: 'menu.open',
				graphNodeId: 'state:menu',
				path: ['open'],
			},
			{
				source: 'chartConfig.palette',
				graphNodeId: 'state:chartConfig',
				path: ['palette'],
			},
			{
				source: 'analytics.enabled',
				graphNodeId: 'state:analytics',
				path: ['enabled'],
			},
			{
				source: 'hidden',
				graphNodeId: 'state:hidden',
				path: [],
			},
		]),
	);

	expect(lowered.writes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				operation: 'update',
			}),
			expect.objectContaining({
				source: 'menu.open',
				graphNodeId: 'state:menu',
				path: ['open'],
				operation: 'assign',
				valueSource: '!menu.open',
			}),
			expect.objectContaining({
				source: 'menuOpen',
				graphNodeId: 'state:menu',
				path: ['open'],
				operation: 'assign',
				valueSource: '!menuOpen',
			}),
			expect.objectContaining({
				source: 'total',
				graphNodeId: 'state:total',
				path: [],
				operation: 'assign',
				assignmentOperator: '+=',
				valueSource: 'increment',
			}),
			expect.objectContaining({
				source: 'items',
				graphNodeId: 'state:items',
				path: [],
				operation: 'call',
				method: 'push',
				argumentSources: ['nextItem'],
			}),
		]),
	);
	expect(lowered.reads).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ source: 'items.push' })]),
	);
	expect(lowered.reads).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ source: 'menuRest.title' })]),
	);

	expect(lowered.diagnostics).toEqual([]);
});

test('lowerStateAccess resolves parser-collected nested destructured aliases', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Queue.tsrx',
		source: nestedAliasSource,
	});

	const lowered = lowerStateAccess({ semanticGraph });

	expect(semanticGraph.aliases).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'firstItem',
				target: 'groups.0.0',
				declarationKind: 'const',
			}),
			expect.objectContaining({
				name: 'secondLabel',
				target: 'groups.1.meta.label',
				declarationKind: 'const',
			}),
			expect.objectContaining({
				name: 'editableGroup',
				target: 'groups.0',
				declarationKind: 'let',
			}),
		]),
	);
	expect(lowered.reads).toEqual(
		expect.arrayContaining([
			{
				source: 'firstItem',
				graphNodeId: 'state:groups',
				path: ['0', '0'],
			},
			{
				source: 'secondLabel',
				graphNodeId: 'state:groups',
				path: ['1', 'meta', 'label'],
			},
			{
				source: 'editableGroup[0]',
				graphNodeId: 'state:groups',
				path: ['0', '0'],
			},
		]),
	);
	expect(lowered.writes).toEqual([
		{
			source: 'editableGroup',
			graphNodeId: 'state:groups',
			path: ['0'],
			operation: 'assign',
			valueSource: "['next']",
		},
	]);
	expect(lowered.diagnostics).toEqual([]);
});

test('lowerStateAccess resolves shared factory graph reads and writes to shared-scoped ids', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedFactorySource,
	});

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.reads).toEqual(
		expect.arrayContaining([
			{
				source: 'data.user',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['user'],
			},
		]),
	);
	expect(lowered.writes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'data.user',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['user'],
				operation: 'assign',
				valueSource: 'null',
			}),
			expect.objectContaining({
				source: 'data.status',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['status'],
				operation: 'assign',
				valueSource: "'anonymous'",
			}),
		]),
	);
	expect(lowered.diagnostics).toEqual([]);
});

test('lowerStateAccess resolves shared instance return property reads and writes', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedFactorySource,
	});

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.reads).toEqual(
		expect.arrayContaining([
			{
				source: 'currentSession.status',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['status'],
			},
			{
				source: 'currentSession.signedIn',
				graphNodeId: 'shared:src/session.tsrx#session/computed:signedIn',
				path: [],
			},
		]),
	);
	expect(lowered.writes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'currentSession.status',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['status'],
				operation: 'assign',
				valueSource: "'ready'",
			}),
		]),
	);
	expect(lowered.diagnostics).toEqual([]);
});

test('lowerStateAccess reports dynamic graph path diagnostics for shared instance properties', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedDynamicPathSource,
	});

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'ARCADE_STATE_DYNAMIC_PATH_READ',
				source: 'currentSession[statusKey]',
			}),
			expect.objectContaining({
				code: 'ARCADE_STATE_DYNAMIC_PATH_WRITE',
				source: 'currentSession[statusKey]',
			}),
		]),
	);
});

test('lowerStateAccess resolves array destructured aliases to indexed graph paths', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Queue.tsrx',
		components: [{ name: 'Queue' }],
		graphBindings: [
			{
				id: 'state:items',
				name: 'items',
				kind: 'state',
				declarationKind: 'const',
				writable: true,
				valueKind: 'array',
				initialValue: ['first', 'second'],
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [{ id: 'h0', tagName: 'button' }],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [
			{
				name: 'firstItem',
				target: 'items.0',
				declarationKind: 'let',
			},
			{
				name: 'secondItem',
				target: 'items.1',
				declarationKind: 'let',
			},
		],
		stateReads: [{ source: 'secondItem' }],
		templateReads: [{ hostNodeId: 'h0', source: 'firstItem' }],
		stateWrites: [{ target: 'firstItem', operation: 'assign', valueSource: "'next'" }],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;
	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.reads).toEqual(
		expect.arrayContaining([
			{
				source: 'firstItem',
				graphNodeId: 'state:items',
				path: ['0'],
			},
			{
				source: 'secondItem',
				graphNodeId: 'state:items',
				path: ['1'],
			},
		]),
	);
	expect(lowered.writes).toEqual([
		{
			source: 'firstItem',
			graphNodeId: 'state:items',
			path: ['0'],
			operation: 'assign',
			valueSource: "'next'",
		},
	]);
	expect(lowered.diagnostics).toEqual([]);
});

test('lowerStateAccess reports a structured diagnostic for dynamic graph path writes', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Queue.tsrx',
		components: [{ name: 'Queue' }],
		graphBindings: [
			{
				id: 'state:items',
				name: 'items',
				kind: 'state',
				declarationKind: 'const',
				writable: true,
				valueKind: 'array',
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [{ source: 'index' }],
		templateReads: [],
		stateWrites: [
			{
				target: 'items[index]',
				targetSpan: {
					filename: 'src/Queue.tsrx',
					start: 42,
					end: 54,
				},
				operation: 'assign',
			},
		],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).toEqual([]);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_DYNAMIC_PATH_WRITE',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot write to a dynamic graph path',
			message:
				'Cannot write to "items[index]" because graph write paths must be statically resolvable.',
			why: 'The resumable state graph records path-level writes in the payload and runtime journal. A dynamic property expression cannot be represented as a stable graph path by the current compiler pass.',
			primarySpan: {
				filename: 'src/Queue.tsrx',
				start: 42,
				end: 54,
			},
			statePath: 'items[index]',
			source: 'items[index]',
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_DYNAMIC_PATH_WRITE',
		}),
	]);
});

test('lowerStateAccess reports a structured diagnostic for dynamic graph path reads', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Queue.tsrx',
		components: [{ name: 'Queue' }],
		graphBindings: [
			{
				id: 'state:items',
				name: 'items',
				kind: 'state',
				declarationKind: 'const',
				writable: true,
				valueKind: 'array',
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [{ id: 'h0', tagName: 'p' }],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [
			{
				hostNodeId: 'h0',
				source: 'items[index]',
				sourceSpan: {
					filename: 'src/Queue.tsrx',
					start: 24,
					end: 36,
				},
			},
		],
		stateWrites: [],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.reads).toEqual([]);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_DYNAMIC_PATH_READ',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot read from a dynamic graph path',
			message:
				'Cannot read "items[index]" because graph read paths must be statically resolvable.',
			why: 'The resumable state graph records path-level subscriptions in the payload. A dynamic property expression cannot be represented as a stable graph subscription by the current compiler pass.',
			primarySpan: {
				filename: 'src/Queue.tsrx',
				start: 24,
				end: 36,
			},
			statePath: 'items[index]',
			source: 'items[index]',
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_DYNAMIC_PATH_READ',
		}),
	]);
});

test('lowerStateAccess reports a structured diagnostic for writes to paths excluded by object rest aliases', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Menu.tsrx',
		components: [{ name: 'Menu' }],
		graphBindings: [
			{
				id: 'state:menu',
				name: 'menu',
				kind: 'state',
				declarationKind: 'const',
				writable: true,
				valueKind: 'object',
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [
			{
				name: 'menuRest',
				target: 'menu',
				excludedPaths: [['title']],
				declarationKind: 'const',
			},
		],
		stateReads: [],
		templateReads: [],
		stateWrites: [
			{
				target: 'menuRest.title',
				targetSpan: {
					filename: 'src/Menu.tsrx',
					start: 64,
					end: 78,
				},
				operation: 'assign',
			},
		],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).toEqual([]);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_REST_ALIAS_EXCLUDED_PATH',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot write through an object-rest excluded path',
			message:
				'Cannot write to "menuRest.title" because "title" was excluded when "menuRest" was created.',
			why: 'Object rest destructuring creates an alias for the remaining graph paths only. Paths explicitly destructured out of the source object are not owned by the rest alias.',
			primarySpan: {
				filename: 'src/Menu.tsrx',
				start: 64,
				end: 78,
			},
			statePath: 'menuRest.title',
			source: 'menuRest.title',
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_REST_ALIAS_EXCLUDED_PATH',
		}),
	]);
});

test('lowerStateAccess reports a structured diagnostic for optional graph writes', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Queue.tsrx',
		components: [{ name: 'Queue' }],
		graphBindings: [
			{
				id: 'state:items',
				name: 'items',
				kind: 'state',
				declarationKind: 'let',
				writable: true,
				valueKind: 'array',
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [
			{
				target: 'items',
				targetSpan: {
					filename: 'src/Queue.tsrx',
					start: 42,
					end: 47,
				},
				operation: 'call',
				method: 'push',
				argumentSources: ['nextItem'],
				optional: true,
			},
		],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).toEqual([]);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_OPTIONAL_CHAIN_WRITE',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot write graph state through optional chaining',
			message:
				'Cannot write to "items" through optional chaining because graph writes must have definite targets.',
			why: 'Optional chaining can skip the method call and its arguments at runtime. The current graph write artifact cannot preserve that short-circuit behavior safely across resume.',
			primarySpan: {
				filename: 'src/Queue.tsrx',
				start: 42,
				end: 47,
			},
			statePath: 'items',
			source: 'items',
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_OPTIONAL_CHAIN_WRITE',
		}),
	]);
});

test('lowerStateAccess reports a structured diagnostic for computed writes', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ReadOnly.tsrx',
		source: readOnlyWriteSource,
	});
	const targetStart = readOnlyWriteSource.indexOf('doubled = 4');

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ graphNodeId: 'computed:doubled' })]),
	);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_READ_ONLY_WRITE',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot write to a read-only graph binding',
			message: 'Cannot write to "doubled" because computed() values are read-only.',
			why: 'computed() creates derived graph state. Mutating it would make the serialized graph ambiguous after resume.',
			primarySpan: {
				filename: 'src/ReadOnly.tsrx',
				start: targetStart,
				end: targetStart + 'doubled'.length,
			},
			suggestions: [
				{
					message:
						'Write to the source state that the computed value derives from, or make a separate state() value for mutable data.',
				},
			],
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_READ_ONLY_WRITE',
		}),
	]);
});

test('lowerStateAccess resolves prop reads and reports prop writes as read-only', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Greeting.tsrx',
		source: propReadOnlySource,
	});
	const targetStart = propReadOnlySource.indexOf("label = 'Updated'");

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.reads).toEqual(
		expect.arrayContaining([
			{
				source: 'label',
				graphNodeId: 'prop:props',
				path: ['label'],
			},
		]),
	);
	expect(lowered.writes).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ graphNodeId: 'prop:props' })]),
	);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_READ_ONLY_WRITE',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot write to a read-only graph binding',
			message: 'Cannot write to "label" because prop bindings are read-only.',
			why: 'Props are owned by the parent graph projection. Mutating a child prop binding would create resume state that has no stable owner.',
			primarySpan: {
				filename: 'src/Greeting.tsrx',
				start: targetStart,
				end: targetStart + 'label'.length,
			},
			suggestions: [
				{
					message:
						'Write to state owned by the parent graph, or pass an event handler/shared graph method that performs the update at the owner.',
				},
			],
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_READ_ONLY_WRITE',
		}),
	]);
});

test('lowerStateAccess reports a structured diagnostic for const graph binding reassignment', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ConstState.tsrx',
		source: constReassignmentSource,
	});
	const targetStart = constReassignmentSource.indexOf('frozenCount++');
	const aliasTargetStart = constReassignmentSource.indexOf('menuOpen = true');

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).toEqual(
		expect.arrayContaining([
			{
				source: 'menu.open',
				graphNodeId: 'state:menu',
				path: ['open'],
				operation: 'assign',
				method: undefined,
				valueSource: 'true',
			},
		]),
	);
	expect(lowered.writes).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ graphNodeId: 'state:frozenCount' })]),
	);
	expect(lowered.writes).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ source: 'menuOpen' })]),
	);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_CONST_REASSIGNMENT',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot reassign a const graph binding',
			message:
				'Cannot update "frozenCount" because it was declared with const. JavaScript const binding semantics are preserved for state().',
			why: 'state() removes marker syntax, but it does not change JavaScript binding rules. A const binding cannot be reassigned during resume or initial render.',
			primarySpan: {
				filename: 'src/ConstState.tsrx',
				start: targetStart,
				end: targetStart + 'frozenCount'.length,
			},
			suggestions: [
				{
					message:
						'Use let for scalar state you reassign, or mutate a property path on object state such as menu.open.',
				},
			],
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_CONST_REASSIGNMENT',
		}),
		expect.objectContaining({
			code: 'ARCADE_STATE_CONST_REASSIGNMENT',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot reassign a const graph binding',
			message:
				'Cannot update "menuOpen" because it was declared with const. JavaScript const binding semantics are preserved for state().',
			primarySpan: {
				filename: 'src/ConstState.tsrx',
				start: aliasTargetStart,
				end: aliasTargetStart + 'menuOpen'.length,
			},
			docsUrl: 'https://arcadejs.com/errors/ARCADE_STATE_CONST_REASSIGNMENT',
		}),
	]);
});
