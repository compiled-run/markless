import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolStatePayloadFromArena,
	lowerStateAccess,
	planPayloadArena,
} from '../src/index.ts';

const source = `
import { state, computed, element } from '@markless/core';
import { makeChart } from './chart';

export function App({ label }: { label: string }) @{
	let count = state(0);
	const menu = state({ open: true, title: 'Menu', meta: { label: 'Main' } });
	const { title: menuTitle } = menu;
	const { meta: { label: menuLabel } } = menu;
	const { title: restTitle, ...menuRest } = menu;
	const doubled = computed(() => count * 2);
	const details = computed(async ({ signal }) => {
		const id = menu.title;
		const response = await fetch('/api/details/' + id, { signal });
		return await response.json();
	});
	let input = element<HTMLInputElement>();

	<section>
		<input
			el={input}
			value={menu.title}
			onKeyDown={(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					menu.open = false;
				}
			}}
		/>
		<button onClick={() => count++}>{label}: {count} and {doubled} and {menuTitle} and {menuLabel} and {menuRest.meta.label}</button>
		<canvas attach={makeChart(details)} />
		@try {
			<p>{details.title}</p>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
}
`;

const sharedSource = `
import { shared, state, computed } from '@markless/core';

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
}, { scope: 'page' });

export function Header() @{
	const currentSession = session();

	<button onClick={() => currentSession.logout()}>{currentSession.status}</button>
}
`;

const sharedDependencySource = `
import { shared, state } from '@markless/core';

export const session = shared(() => {
	const data = state({ user: null });
	return data;
});

export const cart = shared(() => {
	const s = session();
	const items = state([]);

	return {
		items,
		user: s.user,
	};
}, { scope: 'container' });

export function CartButton() @{
	const activeCart = cart();

	<button>{activeCart.items.length}</button>
}
`;

// Defect 86. The component's `box` is a shared-instance local, not a graph
// binding, so `box.items` only resolves through the shared-instance arm; without
// it the repeat kept `box.items` as an authored expression and the SSR module
// re-emitted it into a scope holding no `box`.
const sharedRepeatSource = `
import { shared, state } from '@markless/core';

export const listBox = shared(() => {
	const box = state({ items: [{ id: 'a', label: 'A' }] });

	return { ...box };
}, { scope: 'widget' });

export function List() @{
	const box = listBox();

	<ul>
		@for (const item of box.items; key item.id) {
			<li>{item.label}</li>
		}
	</ul>
}
`;

// Defect 90's shape: a factory returning its state binding bare registers no
// returned properties, so `box.items` reaches no cell and the repeat must refuse.
const bareReturnRepeatSource = `
import { shared, state } from '@markless/core';

export const listBox = shared(() => {
	const box = state({ items: [{ id: 'a', label: 'A' }] });

	return box;
}, { scope: 'widget' });

export function List() @{
	const box = listBox();

	<ul>
		@for (const item of box.absent; key item.id) {
			<li>{item.label}</li>
		}
	</ul>
}
`;

const keyedPanelSource = `
import { state } from '@markless/core';

export function App() @{
	const panels = state([]);
	const active = state(null);

	<aside>
		<section>
			@for (const panel of panels; key panel.slug) {
				<article class={active === panel.slug ? 'active' : ''}>
					<h3>{panel.title}</h3>
					<p>{panel.summary}</p>
				</article>
			}
		</section>
	</aside>
}
`;

const keyedListSource = `
import { state } from '@markless/core';

export function App() @{
	const items = state([]);

	<section>
		<ul>
			@for (const item of items; key item.key) {
				<li>
					<button onClick={() => console.log(item.key)}>{item.name}</button>
				</li>
			}
		</ul>
	</section>
}
`;

const indexedKeyedListSource = `
import { state } from '@markless/core';

export function App() @{
	const items = state([]);

	<section>
		<ul>
			@for (const item of items; index i; key item.key) {
				<li>
					<button onClick={() => console.log(item.key)}>{item.name}</button>
				</li>
			}
		</ul>
	</section>
}
`;

const componentEdgeSource = `
import { state } from '@markless/core';
import { Player } from './Player.tsrx';
export function App() @{
	let current = state({ name: 'First' });
	let playing = state(false);
	<main><Player currentSong={current} isPlaying={playing} onNext={() => { playing = true; current.name = 'Second'; }} /></main>
}
`;

const scopedComponentEdgeSource = `
import { state } from '@markless/core';
import { Row } from './Row.tsrx';
export function App() @{
	const open = state(true);
	const rows = state([]);
	<section>@if (open) { @for (const row of rows; key row.id) { <Row row={row} /> } }</section>
}
`;

test('buildSemanticGraph creates the first production compiler artifact', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});

	expect(graph.passId).toBe('tsrx-semantic-graph');
	expect(graph.components).toEqual([{ name: 'App', exportName: 'App' }]);
	expect(graph.moduleImports).toEqual([
		{
			localName: 'makeChart',
			importedName: 'makeChart',
			source: './chart',
			kind: 'named',
		},
	]);

	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'count',
				kind: 'state',
				writable: true,
				valueKind: 'scalar',
			}),
			expect.objectContaining({
				name: 'menu',
				kind: 'state',
				writable: true,
				valueKind: 'object',
			}),
			expect.objectContaining({
				name: 'doubled',
				kind: 'computed',
				writable: false,
				async: false,
			}),
			expect.objectContaining({
				name: 'details',
				kind: 'computed',
				writable: false,
				async: true,
			}),
			expect.objectContaining({
				name: 'input',
				kind: 'element',
				writable: false,
			}),
			expect.objectContaining({
				name: 'props',
				kind: 'prop',
				writable: false,
				valueKind: 'object',
			}),
		]),
	);

	expect(graph.hostNodes.map((node) => node.tagName)).toEqual([
		'section',
		'input',
		'button',
		'canvas',
		'p',
		'p',
		'p',
	]);

	expect(graph.aliases).toEqual([
		expect.objectContaining({
			name: 'label',
			target: 'props.label',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		}),
		{
			name: 'menuTitle',
			target: 'menu.title',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuLabel',
			target: 'menu.meta.label',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'restTitle',
			target: 'menu.title',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuRest',
			target: 'menu',
			declarationKind: 'const',
			excludedPaths: [['title']],
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
	]);

	expect(graph.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				eventName: 'keydown',
				handlerParameters: ['event'],
				hasSyncPolicyCandidate: true,
			}),
			expect.objectContaining({
				eventName: 'click',
				handlerParameters: [],
				hasSyncPolicyCandidate: false,
			}),
		]),
	);

	expect(graph.behaviors).toEqual([
		expect.objectContaining({
			source: 'makeChart(details)',
			functionSource: 'makeChart',
			inputSources: ['details'],
		}),
	]);

	expect(graph.templateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'menu.title' }),
			expect.objectContaining({ source: 'label' }),
			expect.objectContaining({ source: 'count' }),
			expect.objectContaining({ source: 'doubled' }),
			expect.objectContaining({ source: 'menuTitle' }),
			expect.objectContaining({ source: 'menuLabel' }),
			expect.objectContaining({ source: 'menuRest.meta.label' }),
			expect.objectContaining({ source: 'details.title' }),
			expect.objectContaining({ source: 'error.message' }),
		]),
	);

	expect(graph.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ target: 'menu.open', operation: 'assign' }),
			expect.objectContaining({ target: 'count', operation: 'update' }),
		]),
	);

	expect(graph.asyncBoundaries).toHaveLength(1);
});

async function graphAndProtocolState(source: string) {
	const semanticGraph = await buildSemanticGraph({ filename: 'src/App.tsrx', source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	return {
		semanticGraph,
		protocolState: createProtocolStatePayloadFromArena({ semanticGraph, payloadArena }),
	};
}

const unstableCreationCases = [
	{
		name: 'computed derives',
		code: 'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
		message: 'inside the computed',
		cell: 'state:tmp',
		source: `import { state, computed } from '@markless/core'; export function App() @{ const total = computed(() => { const tmp = state(0); return tmp + 1; }); <p>{total}</p> }`,
	},
	{
		name: 'event handlers',
		code: 'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
		message: 'inside an event handler',
		cell: 'state:draft',
		source: `import { state } from '@markless/core'; export function App() @{ <button onClick={() => { let draft = state(''); draft = 'hello'; }}>New</button> }`,
	},
	{
		name: 'branches',
		code: 'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
		message: 'inside a branch',
		cell: 'state:extra',
		source: `import { state } from '@markless/core'; export function App() @{ const flag = state(true); if (flag) { const extra = state(0); } <p>{flag}</p> }`,
	},
	{
		name: 'loops',
		code: 'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
		message: 'inside a loop',
		cell: 'state:item',
		source: `import { state } from '@markless/core'; export function App() @{ for (let i = 0; i < 3; i++) { const item = state(i); } <p>done</p> }`,
	},
] as const;

for (const scenario of unstableCreationCases) {
	test(`buildSemanticGraph rejects state creation inside ${scenario.name} without shipping a cell`, async () => {
		const { semanticGraph, protocolState } = await graphAndProtocolState(scenario.source);

		expect(semanticGraph.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: scenario.code,
					message: expect.stringContaining(scenario.message),
				}),
			]),
		);
		expect(semanticGraph.graphBindings.map((binding) => binding.id)).not.toContain(
			scenario.cell,
		);
		expect(protocolState.cells.map((cell) => cell.graphNodeId)).not.toContain(scenario.cell);
	});
}

test('buildSemanticGraph keeps stable component-body and module-scope creation artifacts unchanged', async () => {
	const { semanticGraph, protocolState } = await graphAndProtocolState(
		`import { state, computed } from '@markless/core'; const leaked = state(1); export const doubled = computed(() => leaked * 2); export function App() @{ let count = state(0); const label = computed(() => count + 1); <p>{count} {label}</p> }`,
	);

	expect(semanticGraph.graphBindings).toEqual([
		expect.objectContaining({ id: 'state:count', name: 'count', kind: 'state' }),
		expect.objectContaining({ id: 'computed:label', name: 'label', kind: 'computed' }),
	]);
	expect(semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_STATE_MODULE_SCOPE',
		'MARKLESS_STATE_MODULE_SCOPE',
	]);
	expect(protocolState.cells.map((cell) => cell.graphNodeId)).toEqual(['state:count']);
});

test('B905s2 helper-created state records call-site cells and keeps unsupported sites gated', async () => {
	const [same, two, branch, cross] = await Promise.all([
		buildSemanticGraph({
			filename: 'src/HelperCounter.tsrx',
			source: `import { state } from '@markless/core'; function counterPair() { const n = state(3); return n; } export function App() @{ const count = counterPair(); <button onClick={() => count++}>{count}</button> }`,
		}),
		buildSemanticGraph({
			filename: 'src/TwoCounters.tsrx',
			source: `import { state } from '@markless/core'; function counterPair() { const n = state(1); return n; } export function Left() @{ const left = counterPair(); <button onClick={() => left++}>{left}</button> } export function Right() @{ const right = counterPair(); <button onClick={() => right++}>{right}</button> }`,
		}),
		buildSemanticGraph({
			filename: 'src/HelperBranch.tsrx',
			source: `import { state } from '@markless/core'; function makeToggle() { if (true) { const enabled = state(false); return enabled; } return false; } export function App() @{ const active = makeToggle(); <p>{active}</p> }`,
		}),
		buildSemanticGraph({
			filename: 'src/App.tsrx',
			source: `import { counterPair } from './helpers.tsrx'; export function App() @{ const count = counterPair(); <button onClick={() => count++}>{count}</button> }`,
		}),
	]);

	expect(same.diagnostics).toEqual([]);
	expect(same.graphBindings).toEqual([
		expect.objectContaining({
			id: 'state:App.count.counterPair.n',
			name: 'App_count_counterPair_n',
			initialValue: 3,
		}),
	]);
	expect(same.aliases).toEqual([
		expect.objectContaining({
			name: 'count',
			target: 'App_count_counterPair_n',
			declarationKind: 'let',
		}),
	]);
	expect(same.stateWrites).toEqual([expect.objectContaining({ target: 'count' })]);
	expect(two.graphBindings.map((binding) => binding.id)).toEqual([
		'state:Left.left.counterPair.n',
		'state:Right.right.counterPair.n',
	]);
	expect(branch.diagnostics[0]).toEqual(
		expect.objectContaining({ code: 'MARKLESS_STATE_CREATION_SITE_UNSTABLE' }),
	);
	expect(cross.diagnostics[0]).toEqual(
		expect.objectContaining({ code: 'MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED' }),
	);
});

test('buildSemanticGraph records component edges from TSRX AST', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: componentEdgeSource,
	});
	const scopedGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: scopedComponentEdgeSource,
	});
	const edge = graph.componentEdges[0];

	expect(edge).toMatchObject({
		parentComponentName: 'App',
		childComponentName: 'Player',
		importSource: './Player.tsrx',
	});
	expect(edge?.props).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: 'currentSong', kind: 'graph-reference' }),
			expect.objectContaining({ name: 'isPlaying', graphNodeId: 'state:playing' }),
			expect.objectContaining({ name: 'onNext', kind: 'callback' }),
		]),
	);
	expect(graph.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ target: 'playing', operation: 'assign' }),
			expect.objectContaining({ target: 'current.name', operation: 'assign' }),
		]),
	);
	expect(scopedGraph.componentEdges[0]).toMatchObject({
		childComponentName: 'Row',
		branchScopeIds: ['branch:0'],
		keyedRepeatScopeIds: ['repeat:0'],
		props: [expect.objectContaining({ name: 'row', source: 'row', kind: 'opaque' })],
	});
});

test('component edges classify supported destructured callback parameters as callbacks', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Callbacks.tsrx',
		source: `
function Child({ onObject, onArray }) @{
	<button onClick={() => { onObject({ count: 1, source: 'object' }); onArray([2, 'array']); }}>Run</button>
}

export function App() @{
	<Child
		onObject={({ count: nextCount, source }) => console.log(nextCount, source)}
		onArray={([count, source]) => console.log(count, source)}
	/>
}
`,
	});

	expect(graph.componentEdges[0]?.props).toEqual([
		expect.objectContaining({
			name: 'onObject',
			kind: 'callback',
			parameters: ['{ count: nextCount, source }'],
		}),
		expect.objectContaining({
			name: 'onArray',
			kind: 'callback',
			parameters: ['[count, source]'],
		}),
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('B918 records element handle props and accepts same-module prop forwarding', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/ForwardedHandle.tsrx',
		source: `import { element } from '@markless/core'; function Field(props: { input: unknown }) @{ <input el={props.input} /> } export function App() @{ const field = element<HTMLInputElement>(); <section><Field input={field} /><button onClick={() => field.focus()}>Focus</button></section> }`,
	});

	expect(graph.diagnostics).toEqual([]);
	expect(graph.componentEdges[0]).toEqual(
		expect.objectContaining({
			parentComponentName: 'App',
			childComponentName: 'Field',
			props: [
				expect.objectContaining({
					name: 'input',
					source: 'field',
					kind: 'graph-reference',
					graphBindingKind: 'element',
					graphNodeId: 'element:field',
					path: [],
				}),
			],
		}),
	);
	expect(graph.elementHandleBindings).toEqual([
		expect.objectContaining({
			hostNodeId: 'h0',
			handleName: 'props.input',
			componentName: 'Field',
		}),
	]);
});

test('B918 records element handle props on imported child edges', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: `import { element } from '@markless/core'; import { Field } from './Field.tsrx'; export function App() @{ const field = element<HTMLInputElement>(); <section><Field input={field} /><button onClick={() => field.focus()}>Focus</button></section> }`,
	});

	expect(graph.diagnostics).toEqual([]);
	expect(graph.componentEdges[0]).toEqual(
		expect.objectContaining({
			childComponentName: 'Field',
			importSource: './Field.tsrx',
			props: [
				expect.objectContaining({
					name: 'input',
					graphBindingKind: 'element',
					graphNodeId: 'element:field',
				}),
			],
		}),
	);
});

test('buildSemanticGraph records keyed repeat structure across alternate host shapes', async () => {
	const panelGraph = await buildSemanticGraph({
		filename: 'src/Panels.tsrx',
		source: keyedPanelSource,
	});
	const panelParent = panelGraph.hostNodes.find((hostNode) => hostNode.tagName === 'section');
	const panelRow = panelGraph.hostNodes.find((hostNode) => hostNode.tagName === 'article');

	expect(panelGraph.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId: panelParent?.id,
			rowHostNodeId: panelRow?.id,
			itemName: 'panel',
			collectionSource: 'panels',
			collectionGraphNodeId: 'state:panels',
			collectionPath: [],
			keySource: 'panel.slug',
			keyPath: ['slug'],
		},
	]);

	const listGraph = await buildSemanticGraph({
		filename: 'src/ItemList.tsrx',
		source: keyedListSource,
	});
	const listParent = listGraph.hostNodes.find((hostNode) => hostNode.tagName === 'ul');
	const listRow = listGraph.hostNodes.find((hostNode) => hostNode.tagName === 'li');

	expect(listGraph.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId: listParent?.id,
			rowHostNodeId: listRow?.id,
			itemName: 'item',
			collectionSource: 'items',
			collectionGraphNodeId: 'state:items',
			collectionPath: [],
			keySource: 'item.key',
			keyPath: ['key'],
		},
	]);
});

test('buildSemanticGraph keeps keyed repeats registered when an index clause is authored', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/IndexedList.tsrx',
		source: indexedKeyedListSource,
	});
	const parent = graph.hostNodes.find((hostNode) => hostNode.tagName === 'ul');
	const row = graph.hostNodes.find((hostNode) => hostNode.tagName === 'li');

	expect(graph.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId: parent?.id,
			rowHostNodeId: row?.id,
			itemName: 'item',
			indexName: 'i',
			collectionSource: 'items',
			collectionGraphNodeId: 'state:items',
			collectionPath: [],
			keySource: 'item.key',
			keyPath: ['key'],
		},
	]);
});

test('buildSemanticGraph diagnoses dynamic repeats that omit a key', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/MissingKey.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let records = state([{ uuid: 'x', title: 'One' }]);

	<ol>
		@for (const record of records) {
			<li>{record.title}</li>
		}
	</ol>
}
`,
	});

	expect(graph.keyedRepeats).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_KEY_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
		}),
	]);
});

test('buildSemanticGraph accepts positional repeat keys and warns about slot identity', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/PositionKey.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let records = state([{ uuid: 'x', title: 'One' }]);

	<ol>
		@for (const record of records; index slot; key slot) {
			<li>{record.title}</li>
		}
	</ol>
}
`,
	});
	const parent = graph.hostNodes.find((hostNode) => hostNode.tagName === 'ol');
	const row = graph.hostNodes.find((hostNode) => hostNode.tagName === 'li');

	expect(graph.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId: parent?.id,
			rowHostNodeId: row?.id,
			itemName: 'record',
			indexName: 'slot',
			collectionSource: 'records',
			collectionGraphNodeId: 'state:records',
			collectionPath: [],
			keySource: 'slot',
			keyPath: [],
			// An empty key path alone would read the same as `key record`.
			indexKey: true,
		},
	]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_KEY_IS_INDEX',
			severity: 'warning',
			phase: 'semantic-graph',
		}),
	]);
});

test('buildSemanticGraph diagnoses repeat keys that are not stable item identity', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/RandomKey.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let records = state([{ uuid: 'x', title: 'One' }]);

	<ol>
		@for (const record of records; key Math.random()) {
			<li>{record.title}</li>
		}
	</ol>
}
`,
	});

	expect(graph.keyedRepeats).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_KEY_UNSTABLE',
			severity: 'error',
			phase: 'semantic-graph',
		}),
	]);
});

test('buildSemanticGraph recognizes arrow-function components', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/ArrowApp.tsrx',
		source: `
import { state } from '@markless/core';

export const App = () => @{
	let count = state(0);

	<main>
		<button onClick={() => count++}>{count}</button>
	</main>
}
`,
	});

	expect(graph.components).toEqual([{ name: 'App', exportName: 'App' }]);
	expect(graph.diagnostics).toEqual([]);
	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([expect.objectContaining({ id: 'state:count', name: 'count' })]),
	);
	expect(graph.hostNodes.map((host) => host.tagName)).toEqual(['main', 'button']);
});

test('buildSemanticGraph diagnoses TSRX submodules as unsupported', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/ServerData.tsrx',
		source: `
import { state } from '@markless/core';

module server {
	export function loadData() {
		return 'from-server';
	}
}

import { loadData } from server;

export function App() @{
	let label = state('Hi');

	<main>
		<p>{label}</p>
	</main>
}
`,
	});

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SUBMODULE_UNSUPPORTED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			primarySpan: expect.objectContaining({ filename: 'src/ServerData.tsrx' }),
			docsUrl: 'https://markless.dev/errors/MARKLESS_SUBMODULE_UNSUPPORTED',
		}),
		expect.objectContaining({
			code: 'MARKLESS_SUBMODULE_UNSUPPORTED',
			message: expect.stringContaining('import'),
		}),
	]);
});

test('buildSemanticGraph records branch sites with anchor order shared with async boundaries', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/BranchSites.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let value = state('ready');

	<section>
		@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }
		@try { <em>{value}</em> } @pending { <em>Loading</em> } @catch { <em>Broken</em> }
	</section>
}
`,
	});

	expect(graph.branchSites).toEqual([
		expect.objectContaining({
			id: 'branch-site:0',
			kind: 'if',
			armCount: 2,
			testSource: 'open',
			anchorOrder: 0,
		}),
	]);
	// The async boundary shares the same document-order anchor allocator.
	expect(graph.asyncBoundaries).toEqual([
		expect.objectContaining({ id: 'boundary:0', anchorOrder: 1 }),
	]);
});

test('buildSemanticGraph records branch scopes for @switch cases', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/SwitchScopes.tsrx',
		source: `
import { state } from '@markless/core';
import { Badge } from './Badge.tsrx';

export function App() @{
	let kind = state('a');

	<section>
		@switch (kind) {
			@case 'a': { <Badge label="A" /> }
			@default: { <Badge label="D" /> }
		}
	</section>
}
`,
	});

	expect(graph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'Badge',
			branchScopeIds: ['branch:0'],
		}),
		expect.objectContaining({
			childComponentName: 'Badge',
			branchScopeIds: ['branch:1'],
		}),
	]);
});

test('buildSemanticGraph records shared definitions and instance calls', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedSource,
	});
	const sharedStart = sharedSource.indexOf('shared(() =>');
	const instanceStart = sharedSource.indexOf('session();');

	expect(graph.sharedDefinitions).toEqual([
		expect.objectContaining({
			id: 'shared:src/session.tsrx#session',
			name: 'session',
			exportedName: 'session',
			scope: 'page',
			factorySource: expect.stringContaining('const data = state'),
			sourceSpan: {
				filename: 'src/session.tsrx',
				start: sharedStart,
				end: sharedSource.indexOf(';\n\nexport function Header'),
			},
		}),
	]);
	expect(graph.sharedInstances).toEqual([
		{
			definitionId: 'shared:src/session.tsrx#session',
			definitionName: 'session',
			localName: 'currentSession',
			componentName: 'Header',
			source: 'session()',
			sourceSpan: {
				filename: 'src/session.tsrx',
				start: instanceStart,
				end: instanceStart + 'session()'.length,
			},
		},
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph records imported shared instance calls with stable source identity', async () => {
	const importedSharedSource = `
import { session as useSession } from './session.tsrx';

export function Header() @{
	const currentSession = useSession();

	<button>{currentSession.status}</button>
}
`;
	const graph = await buildSemanticGraph({
		filename: 'src/Header.tsrx',
		source: importedSharedSource,
	});
	const instanceStart = importedSharedSource.indexOf('useSession();');

	expect(graph.moduleImports).toEqual([
		{
			localName: 'useSession',
			importedName: 'session',
			source: './session.tsrx',
			kind: 'named',
		},
	]);
	expect(graph.sharedDefinitions).toEqual([]);
	expect(graph.sharedInstances).toEqual([
		{
			definitionId: 'shared:./session.tsrx#session',
			definitionName: 'session',
			localName: 'currentSession',
			componentName: 'Header',
			source: 'useSession()',
			sourceSpan: {
				filename: 'src/Header.tsrx',
				start: instanceStart,
				end: instanceStart + 'useSession()'.length,
			},
		},
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph records same-module shared definition dependencies', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/cart.tsrx',
		source: sharedDependencySource,
	});
	const dependencyStart = sharedDependencySource.indexOf('session();');
	const instanceStart = sharedDependencySource.indexOf('cart();');
	const cart = graph.sharedDefinitions.find((definition) => definition.name === 'cart');

	expect(cart).toEqual(
		expect.objectContaining({
			id: 'shared:src/cart.tsrx#cart',
			name: 'cart',
			exportedName: 'cart',
			scope: 'container',
			dependencies: [
				{
					definitionId: 'shared:src/cart.tsrx#session',
					definitionName: 'session',
					source: 'session()',
					sourceSpan: {
						filename: 'src/cart.tsrx',
						start: dependencyStart,
						end: dependencyStart + 'session()'.length,
					},
				},
			],
		}),
	);
	expect(graph.sharedInstances).toEqual([
		{
			definitionId: 'shared:src/cart.tsrx#cart',
			definitionName: 'cart',
			localName: 'activeCart',
			componentName: 'CartButton',
			source: 'cart()',
			sourceSpan: {
				filename: 'src/cart.tsrx',
				start: instanceStart,
				end: instanceStart + 'cart()'.length,
			},
		},
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph records graph bindings inside shared factories', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedSource,
	});

	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'shared:src/session.tsrx#session/state:data',
				name: 'data',
				kind: 'state',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				writable: true,
				valueKind: 'object',
				initialValue: {
					user: null,
					status: 'anonymous',
				},
			}),
			expect.objectContaining({
				id: 'shared:src/session.tsrx#session/computed:signedIn',
				name: 'signedIn',
				kind: 'computed',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				writable: false,
				async: false,
				dependencies: [
					{
						source: 'data.user',
						graphNodeId: 'shared:src/session.tsrx#session/state:data',
						path: ['user'],
					},
				],
			}),
		]),
	);
	expect(graph.sharedDefinitions[0]?.returnProperties).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'graph',
				name: 'user',
				source: '...data',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['user'],
			}),
			expect.objectContaining({
				kind: 'graph',
				name: 'status',
				source: '...data',
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				path: ['status'],
			}),
			expect.objectContaining({
				kind: 'graph',
				name: 'signedIn',
				source: 'signedIn',
				graphNodeId: 'shared:src/session.tsrx#session/computed:signedIn',
				path: [],
			}),
			expect.objectContaining({
				kind: 'method',
				name: 'logout',
				source: expect.stringContaining('logout()'),
			}),
		]),
	);
	expect(graph.stateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'data.user',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
			}),
		]),
	);
	expect(graph.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				target: 'data.user',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				operation: 'assign',
				valueSource: 'null',
			}),
			expect.objectContaining({
				target: 'data.status',
				sharedDefinitionId: 'shared:src/session.tsrx#session',
				operation: 'assign',
				valueSource: "'anonymous'",
			}),
		]),
	);
	expect(graph.diagnostics).toEqual([]);
});

test('buildSemanticGraph resolves a keyed repeat over a shared instance to its graph cell', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/List.tsrx',
		source: sharedRepeatSource,
	});
	const parent = graph.hostNodes.find((hostNode) => hostNode.tagName === 'ul');
	const row = graph.hostNodes.find((hostNode) => hostNode.tagName === 'li');

	expect(graph.diagnostics).toEqual([]);
	expect(graph.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId: parent?.id,
			rowHostNodeId: row?.id,
			itemName: 'item',
			collectionSource: 'box.items',
			// Without this the repeat carried only `box.items`, and the SSR module
			// re-emitted that into a scope with no `box`: a first-render ReferenceError.
			collectionGraphNodeId: 'shared:src/List.tsrx#listBox/state:box',
			collectionPath: ['items'],
			keySource: 'item.id',
			keyPath: ['id'],
		},
	]);
});

test('buildSemanticGraph refuses a keyed repeat whose shared instance exposes no cell for it', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/List.tsrx',
		source: bareReturnRepeatSource,
	});

	expect(graph.keyedRepeats).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_COLLECTION_UNREADABLE',
			severity: 'error',
			phase: 'semantic-graph',
			title: 'This @for collection reaches no cell on its shared instance',
		}),
	]);
});
