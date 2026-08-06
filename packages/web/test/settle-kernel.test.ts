import { expect, test } from 'vitest';
import { renderPrerenderBoundary as renderThroughKernel } from '../src/fns/prerender-resume.ts';
import { renderPrerenderBoundary as renderFullEvaluation } from '../src/prerender/evaluator.ts';
import {
	isSettleKernelUnsupported,
	renderSettledArm,
	SettleKernelUnsupportedError,
} from '../src/settle-kernel.ts';

const emptyArm = {
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	branches: [],
};

function feedSurface(options: { readonly liveChildEdge?: boolean } = {}) {
	return {
		rootComponentName: 'Feed',
		renderData: {
			root: { componentName: 'Feed', templateId: 'template:Feed' },
			chunks: [
				{
					id: 'template:Feed',
					kind: 'template',
					componentName: 'Feed',
					statics: ['<main><!--markless-slot:0-->', '</main>'],
					hosts: [{ hostNodeId: 'h0', tagName: 'main', coordinate: { kind: 'child-index', path: [0] } }],
					slots: [
						{
							kind: 'async',
							boundaryId: 'boundary:feed',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							armTemplateIds: { try: 'arm:try', pending: 'arm:pending', catch: 'arm:catch' },
						},
					],
				},
				{
					id: 'arm:try',
					kind: 'async-arm',
					componentName: 'Feed',
					statics: [
						'<ul data-update-list data-source="',
						'"><!--markless-slot:1-->',
						'</ul>',
					],
					hosts: [{ hostNodeId: 'h1', tagName: 'ul', coordinate: { kind: 'child-index', path: [0] } }],
					slots: [
						{
							kind: 'attribute',
							name: 'data-source',
							staticIndex: 0,
							coordinate: { kind: 'child-index', path: [0] },
							residue: { kind: 'graph-read', graphNodeId: 'computed:feed', path: ['value', 'source'] },
						},
						{
							kind: 'repeat',
							repeatId: 'repeat:0',
							rowTemplateId: 'arm:row',
							emptyTemplateId: 'arm:empty',
							staticIndex: 1,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
						},
						...(options.liveChildEdge
							? [
									{
										kind: 'child-component',
										componentEdgeId: 'component-edge:0',
										childComponentName: 'UpdateSummary',
										childTemplateId: 'template:UpdateSummary',
										staticIndex: 1,
										coordinate: { kind: 'comment-anchor', path: [0, 1] },
									},
								]
							: []),
					],
				},
				{
					id: 'arm:row',
					kind: 'repeat-row',
					componentName: 'Feed',
					statics: ['<li><!--markless-slot:0-->', '</li>'],
					hosts: [{ hostNodeId: 'h2', tagName: 'li', coordinate: { kind: 'child-index', path: [0] } }],
					slots: [
						{
							kind: 'text',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							residue: { kind: 'repeat-item', repeatId: 'repeat:0', path: ['label'] },
						},
					],
				},
				{
					id: 'arm:empty',
					kind: 'repeat-empty',
					componentName: 'Feed',
					statics: ['<p>No updates</p>'],
					hosts: [{ hostNodeId: 'h3', tagName: 'p', coordinate: { kind: 'child-index', path: [0] } }],
					slots: [],
				},
				...(options.liveChildEdge
					? [
							{
								id: 'template:UpdateSummary',
								kind: 'template',
								componentName: 'UpdateSummary',
								statics: ['<span>summary</span>'],
								hosts: [
									{
										hostNodeId: 'h0',
										tagName: 'span',
										coordinate: { kind: 'child-index', path: [0] },
									},
								],
								slots: [],
							},
						]
					: []),
				{
					id: 'arm:pending',
					kind: 'async-arm',
					componentName: 'Feed',
					statics: ['<p>Loading</p>'],
					hosts: [],
					slots: [],
				},
				{
					id: 'arm:catch',
					kind: 'async-arm',
					componentName: 'Feed',
					statics: ['<p>Failed</p>'],
					hosts: [],
					slots: [],
				},
			],
			repeats: [
				{
					repeatId: 'repeat:0',
					collectionGraphNodeId: 'computed:feed',
					collectionPath: ['value', 'updates'],
					rowChunkId: 'arm:row',
					emptyChunkId: 'arm:empty',
				},
			],
			boundaries: [
				{
					boundaryId: 'boundary:feed',
					runnerGraphNodeId: 'computed:feed',
					initiallyServedArm: 1,
					armChunkIds: { try: 'arm:try', pending: 'arm:pending', catch: 'arm:catch' },
				},
			],
		},
		components: {
			Feed: {
				name: 'Feed',
				state: {
					version: 1,
					cells: [],
					computed: [{ graphNodeId: 'computed:feed', name: 'feed', async: true }],
				},
				view: {
					version: 1,
					locators: [
						{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' },
						{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'ul' },
						{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'li' },
					],
					events: [{ hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:select'] }],
					domUpdates: [
						{
							hostNodeId: 'h1',
							source: 'source',
							graphNodeId: 'computed:feed',
							path: ['value', 'source'],
							target: { kind: 'attribute', name: 'data-source' },
						},
					],
					behaviors: [],
					elementHandles: [],
					keyedRepeats: [
						{
							parentHostNodeId: 'h1',
							repeatId: 'repeat:0',
							keyPath: ['id'],
							rowEvents: [{ hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:select'] }],
						},
					],
					branches: [],
					asyncBoundaries: [
						{
							id: 'boundary:feed',
							runnerGraphNodeId: 'computed:feed',
							initiallyServedArm: 1,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [],
							armRecords: [emptyArm, emptyArm, emptyArm],
						},
					],
				},
				rootChunkId: 'template:Feed',
				stateGraphNodeIds: ['computed:feed'],
				initialValues: [],
				boundaries: [
					{
						boundaryId: 'boundary:feed',
						runnerGraphNodeId: 'computed:feed',
						initiallyServedArm: 1,
						armChunkIds: { try: 'arm:try', pending: 'arm:pending', catch: 'arm:catch' },
					},
				],
				edges: options.liveChildEdge
					? [
							{
								id: 'component-edge:0',
								childComponentName: 'UpdateSummary',
								hostPrefix: 'c0:',
								symbolPrefix: 'c0:',
								props: [
									{
										name: 'updates',
										kind: 'graph-reference',
										graphNodeId: 'computed:feed',
										path: ['value', 'updates'],
									},
								],
							},
						]
					: [],
				propCellId: null,
			},
			...(options.liveChildEdge
				? {
						UpdateSummary: {
							name: 'UpdateSummary',
							state: { version: 1, cells: [], computed: [] },
							view: {
								version: 1,
								locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'span' }],
								events: [],
								domUpdates: [],
								behaviors: [],
								elementHandles: [],
								branches: [],
								asyncBoundaries: [],
							},
							rootChunkId: 'template:UpdateSummary',
							stateGraphNodeIds: [],
							initialValues: [],
							boundaries: [],
							edges: [],
							propCellId: null,
						},
					}
				: {}),
		},
		imports: {},
	};
}

function fulfilledGraph(value: unknown) {
	const snapshot = { status: 'fulfilled', version: 1, key: null, value };
	return {
		read(graphNodeId: string, path: ReadonlyArray<string> = []) {
			if (graphNodeId !== 'computed:feed') return undefined;
			let current: unknown = snapshot;
			for (const segment of path)
				current = (current as Record<string, unknown> | undefined)?.[segment];
			return current;
		},
	};
}

async function bothPaths(surface: unknown, graph: unknown) {
	const kernel = await renderThroughKernel(
		surface as never,
		'boundary:feed',
		'fulfilled',
		graph as never,
		async () => undefined,
	);
	const full = await renderFullEvaluation(
		structuredClone(surface) as never,
		'boundary:feed',
		'fulfilled',
		graph as never,
		async () => undefined,
	);
	return { kernel, full };
}

test('record parity: three rows', async () => {
	const graph = fulfilledGraph({
		source: 'live',
		updates: [
			{ id: 1, label: 'one' },
			{ id: 2, label: 'two' },
			{ id: 3, label: 'three' },
		],
	});
	const { kernel, full } = await bothPaths(feedSurface(), graph);

	expect(kernel.html).toContain('<li>one</li>');
	expect(kernel.html).toBe(full.html);
	expect(kernel.armRecords).toEqual(full.armRecords);
	expect(kernel.computed).toEqual(full.computed);
});

test('record parity: zero rows renders the empty template', async () => {
	const graph = fulfilledGraph({ source: 'live', updates: [] });
	const { kernel, full } = await bothPaths(feedSurface(), graph);

	expect(kernel.html).toContain('<p>No updates</p>');
	expect(kernel.html).toBe(full.html);
	expect(kernel.armRecords).toEqual(full.armRecords);
	expect(kernel.computed).toEqual(full.computed);
});

test('record parity: attribute hole', async () => {
	const graph = fulfilledGraph({ source: 'feed "A" & B', updates: [{ id: 1, label: 'one' }] });
	const { kernel, full } = await bothPaths(feedSurface(), graph);

	expect(kernel.html).toContain('data-source="feed &quot;A&quot; &amp; B"');
	expect(kernel.html).toBe(full.html);
	expect(kernel.armRecords).toEqual(full.armRecords);
});

test('record parity: a value carrying markup characters survives as text', async () => {
	const graph = fulfilledGraph({
		source: 'live',
		updates: [{ id: 1, label: '<script>alert("x")</script>' }],
	});
	const { kernel, full } = await bothPaths(feedSurface(), graph);

	expect(kernel.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
	expect(kernel.html).not.toContain('<script>');
	expect(kernel.html).toBe(full.html);
	expect(kernel.armRecords).toEqual(full.armRecords);
});

test('arm-relative locator indices track the rendered row count', async () => {
	const one = renderSettledArm({
		surface: feedSurface() as never,
		boundaryId: 'boundary:feed',
		status: 'fulfilled',
		read: fulfilledGraph({ source: 'live', updates: [{ id: 1, label: 'one' }] }).read,
	});
	const three = renderSettledArm({
		surface: feedSurface() as never,
		boundaryId: 'boundary:feed',
		status: 'fulfilled',
		read: fulfilledGraph({
			source: 'live',
			updates: [
				{ id: 1, label: 'one' },
				{ id: 2, label: 'two' },
				{ id: 3, label: 'three' },
			],
		}).read,
	});
	const rowIndex = (records: unknown) =>
		((records as { readonly locators: ReadonlyArray<{ hostNodeId: string; index: number }> })
			.locators.find((locator) => locator.hostNodeId === 'h2')?.index);

	expect(rowIndex(one.armRecords)).toBe(1);
	expect(rowIndex(three.armRecords)).toBe(3);
});

test('a live child edge makes the kernel throw its named error', () => {
	let thrown: unknown;
	try {
		renderSettledArm({
			surface: feedSurface({ liveChildEdge: true }) as never,
			boundaryId: 'boundary:feed',
			status: 'fulfilled',
			read: fulfilledGraph({ source: 'live', updates: [{ id: 1, label: 'one' }] }).read,
		});
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(SettleKernelUnsupportedError);
	expect(isSettleKernelUnsupported(thrown)).toBe(true);
	expect(String((thrown as Error).message)).toContain('live child edge: component-edge:0');
});

test('the live child edge falls back to the full evaluation instead of half-rendering', async () => {
	const graph = fulfilledGraph({ source: 'live', updates: [{ id: 1, label: 'one' }] });
	const surface = feedSurface({ liveChildEdge: true });
	const kernel = await renderThroughKernel(
		surface as never,
		'boundary:feed',
		'fulfilled',
		graph as never,
		async () => undefined,
	);
	const full = await renderFullEvaluation(
		structuredClone(surface) as never,
		'boundary:feed',
		'fulfilled',
		graph as never,
		async () => undefined,
	);

	expect(kernel.html).toBe(full.html);
	expect(kernel.armRecords).toEqual(full.armRecords);
});

// A materialized child whose markup depends on settled data must ship a
// hole-bearing template. live-feed's <UpdateSummary> is exactly this shape: its
// text is `updates.length * weight`, so a verbatim template would entomb the
// weighted count the build happened to compute.
const WEIGHTED_COUNT_SYMBOL = 'bound:symbol%3A1:component-edge%3A0';

function holeBearingChildSurface() {
	const surface = feedSurface({ liveChildEdge: true }) as unknown as {
		components: Record<string, { edges: Array<Record<string, unknown>> }>;
	};
	surface.components.Feed!.edges[0]!.materialized = {
		html: '<!--mh:9--><p data-weighted-count="">Weighted count <!--mh:8--></p>',
		elementCount: 1,
		view: {},
		holes: [
			{
				coordinate: 8,
				kind: 'text',
				from: {
					symbolId: WEIGHTED_COUNT_SYMBOL,
					args: [
						{ node: 'computed:feed', path: ['value', 'updates', 'length'] },
						{ node: 'state:weight', path: [] },
					],
				},
			},
			{ coordinate: 9, kind: 'attribute', name: 'data-weighted-count', from: ['value', 'source'] },
		],
	};
	return surface;
}

function weightedCountFiller(weight: number) {
	return (hole: { readonly from: unknown }, read: (node: string, path?: string[]) => unknown) => {
		const from = hole.from as { readonly symbolId?: string; readonly args?: Array<{ node: string; path: string[] }> };
		if (Array.isArray(hole.from)) return read('computed:feed', hole.from as string[]);
		if (from.symbolId !== WEIGHTED_COUNT_SYMBOL) throw new Error('unknown symbol');
		// Stands in for the compiled derive symbol the filler imports.
		const args = from.args!;
		return (read(args[0]!.node, args[0]!.path) as number) * weight;
	};
}

test('a hole-bearing materialized child is accepted, and its derived hole is filled not baked', () => {
	const render = (updates: ReadonlyArray<Record<string, unknown>>) =>
		renderSettledArm({
			surface: holeBearingChildSurface() as never,
			boundaryId: 'boundary:feed',
			status: 'fulfilled',
			read: fulfilledGraph({ source: 'live', updates }).read,
			fillHole: weightedCountFiller(2) as never,
		});

	const two = render([{ id: 1, label: 'one' }, { id: 2, label: 'two' }]);
	const three = render([{ id: 1, label: 'one' }, { id: 2, label: 'two' }, { id: 3, label: 'x' }]);

	// Accepted: no named throw, and the child's markup is present.
	expect(two.html).toContain('<p data-weighted-count="live">Weighted count 4</p>');
	// Represented, not baked: the same template renders a different count for
	// different settled data.
	expect(three.html).toContain('Weighted count 6');
	// The template itself never carried a count.
	expect(
		(holeBearingChildSurface().components.Feed!.edges[0]!.materialized as { html: string }).html,
	).not.toMatch(/Weighted count \d/);
});

test('a hole-bearing materialized child without a filler fails closed', () => {
	let thrown: unknown;
	try {
		renderSettledArm({
			surface: holeBearingChildSurface() as never,
			boundaryId: 'boundary:feed',
			status: 'fulfilled',
			read: fulfilledGraph({ source: 'live', updates: [{ id: 1, label: 'one' }] }).read,
		});
	} catch (error) {
		thrown = error;
	}

	expect(isSettleKernelUnsupported(thrown)).toBe(true);
	expect(String((thrown as Error).message)).toContain('materialized child hole needs a hole filler');
});
