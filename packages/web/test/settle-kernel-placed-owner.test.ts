import { beforeEach, expect, test, vi } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { renderPrerenderBoundary } from '../src/fns/prerender-resume.ts';
import { isSettleKernelUnsupported, renderSettledArm } from '../src/settle-kernel.ts';

// A list component placed in rows of a same-module parent, its async value fed by a prop:
// the settle kernel fills its @try arm from the arm's chunks, never the whole-module evaluator.
const evaluator = vi.hoisted(() => ({ renderPrerenderBoundary: vi.fn() }));
vi.mock('../src/prerender/evaluator.ts', () => evaluator);

beforeEach(() => {
	evaluator.renderPrerenderBoundary.mockReset();
	evaluator.renderPrerenderBoundary.mockResolvedValue({
		html: '<evaluated>',
		armRecords: { locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [], branches: [] },
		computed: [],
	});
});

const noRecords = { locators: [], events: [], behaviors: [], elementHandles: [] };

type Names = { readonly page: string; readonly list: string; readonly field: string };

function placedListSurface({ page, list, field }: Names) {
	const listTemplate = `template:${list}`;
	const tryArm = `async:boundary:3:arm:try`;
	const row = `repeat:repeat:4:row`;
	const items = `computed:${list}.items`;
	return {
		rootComponentName: page,
		renderData: {
			root: { componentName: page, templateId: `template:${page}` },
			chunks: [
				{
					id: `template:${page}`,
					kind: 'template',
					componentName: page,
					statics: ['<main><button>go</button></main>'],
					hosts: [{ hostNodeId: 'h1', tagName: 'button', coordinate: { kind: 'child-index', path: [0, 0] } }],
					slots: [],
				},
				{
					id: listTemplate,
					kind: 'template',
					componentName: list,
					statics: ['<section><!--markless-slot:0-->', '</section>'],
					hosts: [],
					slots: [
						{
							kind: 'async',
							boundaryId: 'boundary:3',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							armTemplateIds: { try: tryArm, pending: 'async:boundary:3:arm:pending', catch: 'async:boundary:3:arm:catch' },
						},
					],
				},
				{
					id: tryArm,
					kind: 'async-arm',
					componentName: list,
					statics: ['<ol><!--markless-slot:0-->', '</ol><small>try <!--markless-slot:1-->', '</small>'],
					hosts: [{ hostNodeId: 'h7', tagName: 'ol', coordinate: { kind: 'child-index', path: [0] } }],
					slots: [
						{
							kind: 'repeat',
							repeatId: 'repeat:4',
							rowTemplateId: row,
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
						},
						{
							kind: 'text',
							staticIndex: 1,
							coordinate: { kind: 'comment-anchor', path: [1, 1] },
							residue: { kind: 'authored-expression', source: 'attempt + 1' },
						},
					],
					inertElements: [0, 0, 1],
				},
				{
					id: row,
					kind: 'repeat-row',
					componentName: list,
					statics: ['<li><!--markless-slot:0-->', ' <button>Pick</button></li>'],
					hosts: [],
					slots: [
						{
							kind: 'text',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							residue: { kind: 'repeat-item', repeatId: 'repeat:4', path: [field] },
						},
					],
					inertElements: [1, 1],
				},
				...['pending', 'catch'].map((arm) => ({
					id: `async:boundary:3:arm:${arm}`,
					kind: 'async-arm',
					componentName: list,
					statics: [`<p>${arm}</p>`],
					hosts: [],
					slots: [],
				})),
			],
			repeats: [{ repeatId: 'repeat:4', collectionGraphNodeId: items, collectionPath: [], keyPath: ['id'], rowChunkId: row }],
		},
		components: {
			[page]: {
				name: page,
				state: { version: 1, cells: [{ graphNodeId: 'state:rate', name: 'rate' }], computed: [] },
				view: {
					version: 1,
					locators: [{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' }],
					// Another component's bound handler: it is not in this arm, so it does not stop the kernel.
					events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['bound:symbol%3A2:0/1'] }],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					branches: [],
					asyncBoundaries: [],
				},
				rootChunkId: `template:${page}`,
				stateGraphNodeIds: ['state:rate'],
				initialValues: [
					{ graphNodeId: 'state:rate', value: { kind: 'symbol-function', symbolId: 'symbol:9' } },
					{ graphNodeId: 'computed:label', value: { kind: 'symbol-function', symbolId: 'symbol:10' } },
				],
				boundaries: [],
				edges: [{ id: 'component-edge:0', childComponentName: list, hostPrefix: 'c0:', symbolPrefix: 'c0:', props: [] }],
				propCellId: null,
			},
			[list]: {
				name: list,
				state: {
					version: 1,
					cells: [{ graphNodeId: 'state:rate', name: 'rate' }],
					computed: [{ graphNodeId: items, name: 'items', async: true, dependencies: [{ graphNodeId: 'prop:props', path: ['query'] }] }],
				},
				view: {
					version: 1,
					locators: [],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					keyedRepeats: [
						{
							id: 'repeat:4',
							parentHostNodeId: 'h7',
							collectionGraphNodeId: items,
							collectionPath: ['value'],
							keyPath: ['id'],
							itemName: 'entry',
							rowElementCount: 2,
							rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['bound:symbol%3A5:0/1[b=;k=repeat%3A4]'] }],
						},
					],
					branches: [],
					asyncBoundaries: [
						{
							id: 'boundary:3',
							runnerGraphNodeId: items,
							initiallyServedArm: 1,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [],
							armRecords: [{ ...noRecords, locators: [{ hostNodeId: 'h7', index: 0, tagName: 'ol' }] }, noRecords, noRecords],
						},
					],
				},
				rootChunkId: listTemplate,
				stateGraphNodeIds: ['prop:props', items],
				stateComputedIndexes: [0],
				initialValues: [
					{ graphNodeId: 'state:rate', value: { kind: 'symbol-function', symbolId: 'symbol:9' } },
					{ graphNodeId: 'computed:label', value: { kind: 'symbol-function', symbolId: 'symbol:10' } },
				],
				boundaries: [
					{
						boundaryId: 'boundary:3',
						runnerGraphNodeId: items,
						armChunkIds: { try: tryArm, pending: 'async:boundary:3:arm:pending', catch: 'async:boundary:3:arm:catch' },
					},
				],
				edges: [],
				propCellId: 'prop:props',
				readResidue: (residue: { readonly source: string }, context: { readonly read: (id: string) => unknown }) => {
					if (residue.source !== 'attempt + 1') throw new Error(`MARKLESS_PRERENDER_RESIDUE_MISSING: ${residue.source}`);
					return (context.read('state:attempt') as number) + 1;
				},
			},
		},
		imports: {},
	};
}

// Stands at the list instance, as the boundary's settle graph does: local ids answer for that instance.
function instanceGraph(list: string, field: string, instancePath?: string) {
	const rows = [{ id: 1, [field]: 'Dune' }, { id: 2, [field]: 'Emma <3' }];
	const snapshot = { status: 'fulfilled', version: 2, key: null, value: rows };
	const reads: string[] = [];
	return {
		reads,
		graph: {
			...(instancePath !== undefined && { marklessInstancePath: instancePath }),
			read(graphNodeId: string, path: ReadonlyArray<string> = []) {
				reads.push(graphNodeId);
				const head =
					graphNodeId === `computed:${list}.items` ? snapshot : graphNodeId === 'state:attempt' ? 2 : undefined;
				let current: unknown = head;
				for (const segment of path) current = (current as Record<string, unknown> | undefined)?.[segment];
				return current;
			},
		},
	};
}

const shapes: ReadonlyArray<Names> = [
	{ page: 'Library', list: 'Shelf', field: 'title' },
	{ page: 'Board', list: 'Column', field: 'label' },
];

for (const names of shapes) {
	test(`a prop-fed list placed in a parent's rows settles through the kernel (${names.list})`, async () => {
		const { graph } = instanceGraph(names.list, names.field, 'c1:r:2:c0:');
		const rendered = (await renderPrerenderBoundary(
			placedListSurface(names) as never,
			'boundary:3',
			'fulfilled',
			graph,
			async () => {
				throw new Error('the kernel loads no symbol');
			},
			'c1:r:2:c0:boundary:3',
		)) as { html: string; armRecords: { keyedRepeats?: ReadonlyArray<{ rowEvents: unknown }> }; moduleRootPath?: string };

		expect(evaluator.renderPrerenderBoundary).not.toHaveBeenCalled();
		expect(rendered.html).toBe(
			'<ol><li>Dune <button>Pick</button></li><li>Emma &lt;3 <button>Pick</button></li></ol><small>try 3</small>',
		);
		expect(rendered.moduleRootPath).toBe('c1:');
		expect(rendered.armRecords.keyedRepeats?.[0]?.rowEvents).toEqual([
			{ hostPath: [0], eventName: 'click', symbolIds: ['bound:symbol%3A5:0/1[b=;k=repeat%3A4]'] },
		]);
	});

	test(`a placed list on a graph that does not stand at it falls back to the evaluator (${names.list})`, async () => {
		const { graph } = instanceGraph(names.list, names.field);
		const rendered = await renderPrerenderBoundary(
			placedListSurface(names) as never,
			'boundary:3',
			'fulfilled',
			graph,
			async () => undefined,
			'c1:r:2:c0:boundary:3',
		);

		expect(evaluator.renderPrerenderBoundary).toHaveBeenCalledOnce();
		expect(rendered.html).toBe('<evaluated>');
	});

	test(`a placed list settled outside its update symbol stays with the evaluator (${names.list})`, async () => {
		const { graph } = instanceGraph(names.list, names.field, 'c1:r:2:c0:');
		await renderPrerenderBoundary(placedListSurface(names) as never, 'boundary:3', 'fulfilled', graph, async () => undefined);

		expect(evaluator.renderPrerenderBoundary).toHaveBeenCalledOnce();
	});
}

function refusal(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		expect(isSettleKernelUnsupported(error)).toBe(true);
		return String((error as Error).message);
	}
	throw new Error('expected the kernel to refuse');
}

const placement = () => ({ moduleRootPath: 'c1:', ownerPath: 'r:2:c0:' });

test("a placed list's @catch arm stays with the evaluator", () => {
	const { graph } = instanceGraph('Shelf', 'title', 'c1:r:2:c0:');
	expect(
		refusal(() =>
			renderSettledArm({
				surface: placedListSurface(shapes[0]!) as never,
				boundaryId: 'boundary:3',
				status: 'rejected',
				read: graph.read,
				placement,
			}),
		),
	).toContain('placed @catch arm');
});

test('a placed arm that reads a derived value it does not own refuses instead of reading a stale one', () => {
	const surface = placedListSurface(shapes[0]!);
	const arm = surface.renderData.chunks.find((chunk) => chunk.id === 'async:boundary:3:arm:try')!;
	(arm.slots[1] as { residue: unknown }).residue = { kind: 'graph-read', graphNodeId: 'computed:label', path: [] };
	const { graph } = instanceGraph('Shelf', 'title', 'c1:r:2:c0:');
	expect(
		refusal(() =>
			renderSettledArm({
				surface: surface as never,
				boundaryId: 'boundary:3',
				status: 'fulfilled',
				read: graph.read,
				placement,
			}),
		),
	).toContain('initial value needs a symbol loader: computed:label');
});

test('a placed arm whose own record holds a bound update refuses', () => {
	const surface = placedListSurface(shapes[0]!);
	const list = surface.components.Shelf as unknown as { view: { domUpdates: unknown[] } };
	list.view.domUpdates = [
		{ hostNodeId: 'h7', graphNodeId: 'state:rate', path: [], target: { kind: 'attribute', name: 'data-rate' }, symbolId: 'bound:symbol%3A6:0/1' },
	];
	(surface.components.Shelf as unknown as { view: { locators: unknown[] } }).view.locators = [
		{ hostNodeId: 'h7', strategy: 'dom-order', index: 7, tagName: 'ol' },
	];
	const { graph } = instanceGraph('Shelf', 'title', 'c1:r:2:c0:');
	expect(
		refusal(() =>
			renderSettledArm({
				surface: surface as never,
				boundaryId: 'boundary:3',
				status: 'fulfilled',
				read: graph.read,
				placement,
			}),
		),
	).toContain('bound symbol id');
});

// The playground port's shape, compiled: an imported page root, a same-module child, and its keyed rows of lists.
const compiledShapes = [
	{
		page: 'Root',
		middle: 'App',
		list: 'Todos',
		source: `import { computed, state } from '@markless/core';
async function load(filter: string) { return [{ id: 1, name: 'Dune' + filter }, { id: 2, name: 'Emma' + filter }]; }
export default function Root() @{
	let rate = state(Math.random());
	<div><input value={rate} /><App /></div>
}
function App() @{
	let reload = state(0);
	let views = state([{ id: 0, filter: '' }, { id: 1, filter: 'x' }]);
	<section>
		<button onClick={() => reload++}>Reload</button>
		@for (const view of views; key view.id) {
			<div><Todos initialFilter={view.filter} reload={reload} /></div>
		}
	</section>
}
function Todos({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let filter = state(initialFilter);
	const data = computed(async () => { void reload; return load(filter); });
	<div>
		<input value={filter} onInput={(e) => (filter = e.target.value)} />
		@try {
			<ul>@for (const todo of data; key todo.id) { <li>{todo.name}</li> }</ul>
		} @pending { <span>Loading</span> } @catch { <span>Failed</span> }
	</div>
}`,
		html: '<ul><li>Dune</li><li>Emma</li></ul>',
	},
	{
		page: 'Library',
		middle: 'Shelves',
		list: 'Shelf',
		source: `import { computed, state } from '@markless/core';
async function books(topic: string) { return [{ isbn: 'b', title: topic + ' one' }, { isbn: 'c', title: topic + ' two' }]; }
function Shelf({ topic, poll }: { topic: string; poll: number }) @{
	let seen = state(topic);
	const shelf = computed(async () => { void poll; return books(seen); });
	<article>
		<p>{seen}</p>
		@try {
			<ol>@for (const book of shelf; key book.isbn) { <li><b>{book.title}</b></li> }</ol>
		} @pending { <em>wait</em> } @catch { <em>broken</em> }
	</article>
}
function Shelves() @{
	let poll = state(1);
	let topics = state(['sea', 'sky']);
	<aside>
		@for (const topic of topics; key topic) {
			<Shelf topic={topic} poll={poll} />
		}
		<button onClick={() => poll++}>Poll</button>
	</aside>
}
export default function Library() @{
	let seed = state(Date.now());
	<main data-seed={seed}><Shelves /></main>
}`,
		html: '<ol><li><b>sea one</b></li><li><b>sea two</b></li></ol>',
	},
] as const;

type CompiledDefinition = {
	readonly name: string;
	readonly boundaries?: ReadonlyArray<{ readonly boundaryId: string }>;
	readonly edges?: ReadonlyArray<{ readonly childComponentName: string; readonly symbolPrefix: string }>;
	readonly state: { readonly computed: ReadonlyArray<{ readonly graphNodeId: string; readonly async?: boolean }> };
	readonly stateComputedIndexes?: ReadonlyArray<number>;
};

for (const shape of compiledShapes) {
	test(`a compiled list in a child's keyed rows settles through the kernel (${shape.list})`, async () => {
		const compiled = await compileTsrxModule({ filename: `src/${shape.page}.tsrx`, source: shape.source, symbols: [] });
		const definitions = compiled.publicRenderModule.componentDefinitions as ReadonlyArray<CompiledDefinition>;
		const named = (name: string) => definitions.find((definition) => definition.name === name)!;
		const edgeInto = (from: string, to: string) =>
			named(from).edges!.find((edge) => edge.childComponentName === to)!.symbolPrefix;
		const owner = named(shape.list);
		const boundaryId = owner.boundaries![0]!.boundaryId;
		const runner = owner.state.computed.find((computed, index) => computed.async && owner.stateComputedIndexes?.includes(index))!;
		// The page composes the module root at c0:, and the second list sits in row 0 of the child.
		const instancePath = `c0:${edgeInto(shape.page, shape.middle)}r:0:${edgeInto(shape.middle, shape.list)}`;
		const rows = shape.list === 'Todos'
			? [{ id: 1, name: 'Dune' }, { id: 2, name: 'Emma' }]
			: [{ isbn: 'b', title: 'sea one' }, { isbn: 'c', title: 'sea two' }];
		const snapshot = { status: 'fulfilled', version: 1, key: null, value: rows };
		const graph = {
			marklessInstancePath: instancePath,
			read(graphNodeId: string, path: ReadonlyArray<string> = []) {
				let current: unknown = graphNodeId === runner.graphNodeId ? snapshot : undefined;
				for (const segment of path) current = (current as Record<string, unknown> | undefined)?.[segment];
				return current;
			},
		};
		const surface = {
			rootComponentName: compiled.renderData.root!.componentName,
			renderData: compiled.renderData,
			components: Object.fromEntries(definitions.map((definition) => [definition.name, definition])),
			imports: {},
		};

		const rendered = (await renderPrerenderBoundary(
			surface as never,
			boundaryId,
			'fulfilled',
			graph,
			async () => {
				throw new Error('the kernel loads no symbol');
			},
			`c0:${instancePath}${boundaryId}`,
		)) as { html: string; moduleRootPath?: string; armRecords: { keyedRepeats?: ReadonlyArray<unknown> } };

		expect(evaluator.renderPrerenderBoundary).not.toHaveBeenCalled();
		expect(rendered.html).toBe(shape.html);
		expect(rendered.moduleRootPath).toBe('c0:');
		expect(rendered.armRecords.keyedRepeats).toHaveLength(1);
	});
}

test('an authored expression that throws in the reader hands the arm to the evaluator', () => {
	const surface = placedListSurface(shapes[0]!);
	(surface.components.Shelf as unknown as { readResidue: () => unknown }).readResidue = () => {
		throw new TypeError("Cannot read properties of undefined (reading 'message')");
	};
	const { graph } = instanceGraph('Shelf', 'title', 'c1:r:2:c0:');
	expect(
		refusal(() =>
			renderSettledArm({
				surface: surface as never,
				boundaryId: 'boundary:3',
				status: 'fulfilled',
				read: graph.read,
				placement,
			}),
		),
	).toContain('authored residue: attempt + 1');
});

// An update symbol hands the kernel the served render data a row build already ran; the whole module loads only for a refusal.
test('a served surface the kernel draws from never loads the whole render data', async () => {
	const { graph } = instanceGraph('Shelf', 'title', 'c1:r:2:c0:');
	const whole = vi.fn(async () => placedListSurface(shapes[0]!));
	const rendered = await renderPrerenderBoundary(
		placedListSurface(shapes[0]!) as never,
		'boundary:3',
		'fulfilled',
		graph,
		async () => undefined,
		'c1:r:2:c0:boundary:3',
		whole,
	);
	expect(rendered.html).toContain('Dune');
	expect(whole).not.toHaveBeenCalled();
	expect(evaluator.renderPrerenderBoundary).not.toHaveBeenCalled();
});

test('a render the kernel refuses on the served surface goes to the evaluator with the whole render data', async () => {
	const { graph } = instanceGraph('Shelf', 'title', 'c1:r:2:c0:');
	const wholeSurface = placedListSurface(shapes[0]!);
	const whole = vi.fn(async () => wholeSurface);
	await renderPrerenderBoundary(
		placedListSurface(shapes[0]!) as never,
		'boundary:3',
		'rejected',
		graph,
		async () => undefined,
		'c1:r:2:c0:boundary:3',
		whole,
	);
	expect(whole).toHaveBeenCalledOnce();
	expect(evaluator.renderPrerenderBoundary.mock.calls[0]![0]).toBe(wholeSurface);
});
