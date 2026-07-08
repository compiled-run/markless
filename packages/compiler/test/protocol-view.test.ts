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
			armRecords: [
				{
					locators: [
						{ hostNodeId: 'h1', strategy: 'arm-relative', index: 0, tagName: 'p' },
					],
					events: [],
					behaviors: [],
					elementHandles: [],
				},
				{
					locators: [
						{ hostNodeId: 'h3', strategy: 'arm-relative', index: 0, tagName: 'p' },
					],
					events: [],
					behaviors: [],
					elementHandles: [],
				},
				{
					locators: [
						{ hostNodeId: 'h2', strategy: 'arm-relative', index: 0, tagName: 'p' },
					],
					events: [],
					behaviors: [],
					elementHandles: [],
				},
			],
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

test('createProtocolViewPayload nests in-arm records under the boundary and drops them from flat streams', async () => {
	// D3: in-arm records leave every page-absolute stream — resume registers
	// them by adding the boundary start anchor's live element offset.
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ArmEvents.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let picked = state('none');
	const roster = computed(async ({ signal }) => {
		const response = await fetch('/api/roster', { signal });
		return await response.json();
	});

	<section>
		<button onClick={() => picked = 'outside'}>Outside</button>
		@try {
			<div>
				<button onClick={() => picked = 'inside:' + roster.lead}>Pick</button>
			</div>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
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

	// Flat streams carry only page-coordinate records (h0 section, h1 button).
	expect(view.locators.map((locator) => locator.hostNodeId)).toEqual(['h0', 'h1']);
	expect(view.events).toEqual([
		expect.objectContaining({ hostNodeId: 'h1', eventName: 'click' }),
	]);

	expect(view.asyncBoundaries[0]?.armRecords).toEqual([
		{
			locators: [
				{ hostNodeId: 'h2', strategy: 'arm-relative', index: 0, tagName: 'div' },
				{ hostNodeId: 'h3', strategy: 'arm-relative', index: 1, tagName: 'button' },
			],
			events: [
				expect.objectContaining({
					hostNodeId: 'h3',
					eventName: 'click',
					symbolIds: [expect.stringMatching(/^symbol:\d+$/)],
				}),
			],
			behaviors: [],
			elementHandles: [],
		},
		{
			// Host ids follow the collector's walk order (@catch walks before
			// @pending), so the @pending arm's <p> is h5 here.
			locators: [{ hostNodeId: 'h5', strategy: 'arm-relative', index: 0, tagName: 'p' }],
			events: [],
			behaviors: [],
			elementHandles: [],
		},
		{
			locators: [{ hostNodeId: 'h4', strategy: 'arm-relative', index: 0, tagName: 'p' }],
			events: [],
			behaviors: [],
			elementHandles: [],
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
