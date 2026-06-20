import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess } from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';

const source = `
import { state, computed, element } from '@arcadejs/core';

export function App() @{
	let count = state(0);
	const menu = state({ open: true, title: 'Menu' });
	const details = computed(async ({ signal }) => {
		const title = menu.title;
		const response = await fetch('/api/details/' + title, { signal });
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
					menu.open = false;
				}
			}}
		/>
		<button onClick={() => count++}>{count}</button>
		<canvas attach={chart(details)} />
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
}, { scope: 'page' });

export function Header() @{
	const currentSession = session();

	<button>{currentSession.status}</button>
}
`;

const keyedListSource = `
import { state } from '@arcadejs/core';

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

test('planPayloadArena separates graph state from view wiring metadata', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.passId).toBe('payload-arena');
	expect(payload.state.cells).toEqual(
		expect.arrayContaining([
			{
				graphNodeId: 'state:count',
				name: 'count',
				valueKind: 'scalar',
			},
			{
				graphNodeId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
			},
		]),
	);
	expect(payload.state.computed).toEqual([
		{
			graphNodeId: 'computed:details',
			name: 'details',
			async: true,
			functionSource: expect.stringContaining("await fetch('/api/details/' + title"),
			dependencies: [
				{
					source: 'menu.title',
					graphNodeId: 'state:menu',
					path: ['title'],
				},
			],
		},
	]);

	expect(payload.view.locators).toEqual([
		{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
		{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
		{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
		{ hostNodeId: 'h3', strategy: 'dom-order', index: 3, tagName: 'canvas' },
		{ hostNodeId: 'h4', strategy: 'dom-order', index: 4, tagName: 'p' },
		{ hostNodeId: 'h5', strategy: 'dom-order', index: 5, tagName: 'p' },
		{ hostNodeId: 'h6', strategy: 'dom-order', index: 6, tagName: 'p' },
	]);

	expect(payload.view.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				hostNodeId: 'h1',
				eventName: 'keydown',
				hasSyncPolicyCandidate: true,
			}),
			expect.objectContaining({
				hostNodeId: 'h2',
				eventName: 'click',
				hasSyncPolicyCandidate: false,
			}),
		]),
	);
	expect(payload.view.domUpdates).toEqual(
		expect.arrayContaining([
			{
				hostNodeId: 'h1',
				source: 'menu.title',
				graphNodeId: 'state:menu',
				path: ['title'],
				target: {
					kind: 'property',
					name: 'value',
				},
			},
			{
				hostNodeId: 'h2',
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				target: {
					kind: 'text',
				},
			},
			{
				hostNodeId: 'h4',
				source: 'details.title',
				graphNodeId: 'computed:details',
				path: ['title'],
				target: {
					kind: 'text',
				},
			},
		]),
	);
	expect(payload.view.behaviors).toEqual([
		{
			hostNodeId: 'h3',
			source: 'chart(details)',
			functionSource: 'chart',
			inputSources: ['details'],
			inputGraphReads: [
				{
					inputIndex: 0,
					source: 'details',
					graphNodeId: 'computed:details',
					path: [],
				},
			],
		},
	]);
	expect(payload.view.elementHandles).toEqual([
		{
			hostNodeId: 'h1',
			handleId: 'element:input',
			name: 'input',
		},
	]);
	expect(payload.view.asyncBoundaries).toEqual([
		{
			id: 'boundary:0',
			startAnchor: {
				strategy: 'dom-order-comment',
				index: 0,
			},
			endAnchor: {
				strategy: 'dom-order-comment',
				index: 1,
			},
			asyncReads: [
				{
					source: 'details.title',
					graphNodeId: 'computed:details',
					path: ['title'],
				},
			],
		},
	]);
	expect(payload.diagnostics).toEqual([]);
});

test('planPayloadArena carries keyed repeat metadata into the resumable view plan', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ItemList.tsrx',
		source: keyedListSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const parentHostNodeId = semanticGraph.hostNodes.find(
		(hostNode) => hostNode.tagName === 'ul',
	)?.id;
	const rowHostNodeId = semanticGraph.hostNodes.find((hostNode) => hostNode.tagName === 'li')?.id;

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.view.keyedRepeats).toEqual([
		{
			id: 'repeat:0',
			parentHostNodeId,
			rowHostNodeId,
			collectionGraphNodeId: 'state:items',
			collectionPath: [],
			keyPath: ['key'],
		},
	]);
});

test('planPayloadArena keeps distinct targets for repeated graph reads on one host', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/RepeatedTarget.tsrx',
		source: `
import { state } from '@arcadejs/core';

export function App() @{
	const count = state(0);

	<button title={count}>{count}</button>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.view.domUpdates).toEqual([
		{
			hostNodeId: 'h0',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: {
				kind: 'attribute',
				name: 'title',
			},
		},
		{
			hostNodeId: 'h0',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: {
				kind: 'text',
			},
		},
	]);
});

test('planPayloadArena serializes known behavior input values without running behavior code', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/BehaviorInputs.tsrx',
		source: `
import { state, computed } from '@arcadejs/core';

export function App() @{
	const menu = state({ open: true, options: { color: 'red' } });
	const details = computed(() => menu.options.color);

	<section>
		<canvas attach={chart(menu.options.color, 'line', 3, false, null)} />
		<div attach={tooltip(details)} />
	</section>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.view.behaviors).toEqual([
		{
			hostNodeId: 'h1',
			source: "chart(menu.options.color, 'line', 3, false, null)",
			functionSource: 'chart',
			inputSources: ['menu.options.color', "'line'", '3', 'false', 'null'],
			inputValues: ['red', 'line', 3, false, null],
			inputGraphReads: [
				{
					inputIndex: 0,
					source: 'menu.options.color',
					graphNodeId: 'state:menu',
					path: ['options', 'color'],
				},
			],
		},
		{
			hostNodeId: 'h2',
			source: 'tooltip(details)',
			functionSource: 'tooltip',
			inputSources: ['details'],
			inputGraphReads: [
				{
					inputIndex: 0,
					source: 'details',
					graphNodeId: 'computed:details',
					path: [],
				},
			],
		},
	]);
});

test('planPayloadArena classifies class and style binding targets', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ClassStyleTargets.tsrx',
		source: `
import { state } from '@arcadejs/core';

export function App() @{
	const activeClass = state('is-active');
	const color = state('red');

	<div class={activeClass} style={color}>{activeClass}</div>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.view.domUpdates).toEqual([
		{
			hostNodeId: 'h0',
			source: 'activeClass',
			graphNodeId: 'state:activeClass',
			path: [],
			target: {
				kind: 'class',
			},
		},
		{
			hostNodeId: 'h0',
			source: 'color',
			graphNodeId: 'state:color',
			path: [],
			target: {
				kind: 'style',
			},
		},
		{
			hostNodeId: 'h0',
			source: 'activeClass',
			graphNodeId: 'state:activeClass',
			path: [],
			target: {
				kind: 'text',
			},
		},
	]);
});

test('planPayloadArena records shared definition state planning metadata', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.state.sharedDefinitions).toEqual([
		{
			id: 'shared:src/session.tsrx#session',
			name: 'session',
			exportedName: 'session',
			scope: 'page',
			graphNodeIds: [
				'shared:src/session.tsrx#session/state:data',
				'shared:src/session.tsrx#session/computed:signedIn',
			],
			returnProperties: expect.arrayContaining([
				expect.objectContaining({
					kind: 'graph',
					name: 'user',
					graphNodeId: 'shared:src/session.tsrx#session/state:data',
					path: ['user'],
				}),
				expect.objectContaining({
					kind: 'graph',
					name: 'status',
					graphNodeId: 'shared:src/session.tsrx#session/state:data',
					path: ['status'],
				}),
				expect.objectContaining({
					kind: 'graph',
					name: 'signedIn',
					graphNodeId: 'shared:src/session.tsrx#session/computed:signedIn',
					path: [],
				}),
				expect.objectContaining({
					kind: 'method',
					name: 'logout',
				}),
			]),
		},
	]);
	expect(payload.state.cells).toEqual(
		expect.arrayContaining([
			{
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				name: 'data',
				valueKind: 'object',
			},
		]),
	);
});
