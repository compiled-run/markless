import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolViewPayload,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';

const source = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const menu = state({ open: true });

	<section>
		<input
			onKeyDown={(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
					menu.open = false;
				}
			}}
		/>
		<button onClick={[() => count++, () => menu.open = true]}>{count}</button>
		<canvas attach={[chart(menu), resizeCanvas]} />
	</section>
}
`;

const asyncBoundarySource = `
import { computed } from '@markless/core';

export function App() @{
	const details = computed(async ({ signal }) => {
		const response = await fetch('/api/details', { signal });
		return await response.json();
	});

	<section>
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

test('createProtocolViewPayload links payload arena records to lazy symbol IDs', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const view = createProtocolViewPayload({
		payloadArena,
		symbolResolver,
		publicRenderPlan: allSupportedPlan(payloadArena),
	});

	expect(view.version).toBe(1);
	expect(view.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				hostNodeId: 'h1',
				eventName: 'keydown',
				symbolIds: ['symbol:0'],
				syncPolicy: expect.objectContaining({
					actions: ['preventDefault'],
				}),
			}),
			expect.objectContaining({
				hostNodeId: 'h2',
				eventName: 'click',
				symbolIds: ['symbol:1', 'symbol:2'],
			}),
		]),
	);
	expect(view.domUpdates).toEqual([
		{
			hostNodeId: 'h2',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: {
				kind: 'text',
			},
			symbolId: 'symbol:3',
		},
	]);
	expect(view.behaviors).toEqual([
		{
			hostNodeId: 'h3',
			source: 'chart(menu)',
			functionSource: 'chart',
			inputSources: ['menu'],
			inputValues: [{ open: true }],
			inputGraphReads: [
				{
					inputIndex: 0,
					source: 'menu',
					graphNodeId: 'state:menu',
					path: [],
				},
			],
			symbolId: 'symbol:4',
		},
		{
			hostNodeId: 'h3',
			source: 'resizeCanvas',
			functionSource: 'resizeCanvas',
			inputSources: [],
			symbolId: 'symbol:5',
		},
	]);
});

test('createProtocolViewPayload links async boundary reads to runner symbols', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/AsyncBoundary.tsrx',
		source: asyncBoundarySource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const view = createProtocolViewPayload({
		payloadArena,
		symbolResolver,
		publicRenderPlan: allSupportedPlan(payloadArena),
	});

	expect(view.asyncBoundaries).toEqual([
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
					runnerSymbolId: 'symbol:1',
				},
			],
		},
	]);
});

test('createProtocolViewPayload keeps binding symbols distinct by target', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/RepeatedTarget.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	const count = state(0);

	<button title={count}>{count}</button>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const view = createProtocolViewPayload({
		payloadArena,
		symbolResolver,
		publicRenderPlan: allSupportedPlan(payloadArena),
	});

	expect(view.domUpdates).toEqual([
		{
			hostNodeId: 'h0',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: {
				kind: 'attribute',
				name: 'title',
			},
			symbolId: 'symbol:0',
		},
		{
			hostNodeId: 'h0',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: {
				kind: 'text',
			},
			symbolId: 'symbol:1',
		},
	]);
});

function allSupportedPlan(payloadArena: {
	readonly view: { readonly asyncBoundaries: ReadonlyArray<{ readonly id: string }> };
}) {
	return {
		asyncBoundaryGates: payloadArena.view.asyncBoundaries.map((boundary) => ({
			boundaryId: boundary.id,
			supported: true as const,
		})),
		branchReactivityGates: [],
		keyedRepeats: [],
	} as never;
}
