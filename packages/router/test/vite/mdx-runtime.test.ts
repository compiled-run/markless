import { describe, expect, it } from 'vitest';
import {
	composeMdxState,
	composeMdxView,
	loadMdxSymbol,
	type MdxChild,
	renderMdxChild,
} from '../../src/vite/runtime/mdx-route.ts';
import {
	ASYNC_PROTOCOL_VERSION,
	protocolInstancePath,
	protocolStateVersion,
	STORAGE_PROTOCOL_VERSION,
} from '../../../serializer/src/protocol-constants.ts';
import { transformMdxRoute } from '../../src/vite/mdx.ts';

// A loader answers with a symbol, and the route scopes what it gets back, so a
// stand-in has to be callable for its answer to survive the round trip.
type MdxTestSymbol = (context: unknown) => unknown;

describe('Markless Router MDX route runtime helpers', () => {
	it('composes child state payloads for one MDX route container', () => {
		const state = composeMdxState([
			{
				componentIndex: 0,
				hostPrefix: 'm0:',
				symbolPrefix: 'm0:',
				output: {
					state: {
						version: 1,
						cells: [{ id: 'count' }],
						computed: [],
					},
				},
			},
		]);

		expect(state).toEqual({
			version: 1,
			cells: [{ id: 'count' }],
			computed: [],
		});
	});

	it('offsets and prefixes child view records inside markdown element order', () => {
		const view = composeMdxView(
			[
				{ kind: 'html', elementCount: 2 },
				{ kind: 'component', componentIndex: 0 },
			],
			[
				{
					componentIndex: 0,
					hostPrefix: 'm0:',
					symbolPrefix: 'm0:',
					output: {
						view: {
							version: 1,
							locators: [
								{
									hostNodeId: 'h0',
									strategy: 'dom-order',
									index: 0,
									tagName: 'button',
								},
							],
							events: [
								{
									hostNodeId: 'h0',
									eventName: 'click',
									symbolIds: ['symbol:click'],
								},
							],
							domUpdates: [
								{
									hostNodeId: 'h0',
									graphNodeId: 'count',
									path: [],
									symbolId: 'symbol:text',
								},
							],
							behaviors: [],
							elementHandles: [],
						},
					},
				},
			],
			0,
		);

		expect(view?.locators).toEqual([
			expect.objectContaining({ hostNodeId: 'm0:h0', index: 2 }),
		]);
		expect(view?.events).toEqual([
			expect.objectContaining({
				hostNodeId: 'm0:h0',
				symbolIds: ['m0:symbol:click'],
			}),
		]);
		expect(view?.domUpdates).toEqual([
			expect.objectContaining({
				hostNodeId: 'm0:h0',
				symbolId: 'm0:symbol:text',
			}),
		]);
		expect(view?.asyncBoundaries).toEqual([]);
	});

	// The answer arrives scoped, so the stand-in has to be callable for it to
	// survive the round trip; which loader answered is what this pins.
	it('loads symbols from live CSR children before falling back to static MDX loaders', () => {
		const symbol = loadMdxSymbol(
			'm0:symbol:click',
			[
				{
					componentIndex: 0,
					hostPrefix: 'm0:',
					symbolPrefix: 'm0:',
					output: {
						loadSymbol(symbolId) {
							return () => `live:${symbolId}`;
						},
					},
				},
			],
			[
				{
					prefix: 'm0:',
					loadSymbol(symbolId) {
						return () => `static:${symbolId}`;
					},
				},
			],
		) as MdxTestSymbol;

		expect(symbol({})).toBe('live:symbol:click');
	});
});

describe('renderMdxChild with async compiled artifacts', () => {
	it('awaits an async renderSsr and returns its html', async () => {
		// Compiled marklessRenderSsr is async since the initial-render awaiting
		// work. The unawaited Promise passed the truthy guard while .html read
		// undefined — the MDX child (counter AND home Link) silently dropped,
		// which broke both router-dev-routes and router-preload-strategy.
		const children: MdxChild[] = [];
		const html = await renderMdxChild(
			children,
			{
				renderSsr: async () => ({
					html: '<div data-mdx-counter>MDX Count 0</div>',
					state: { version: 1, cells: [], computed: [] },
				}),
			} as never,
			{},
			{ componentIndex: 0, hostPrefix: 'm0:', symbolPrefix: 'm0:' } as never,
		);

		expect(html).toBe('<div data-mdx-counter>MDX Count 0</div>');
		expect(children).toHaveLength(1);
		expect((children[0] as { output: { html: string } }).output.html).toBe(
			'<div data-mdx-counter>MDX Count 0</div>',
		);
	});
});

describe('composeMdxState symbol namespacing', () => {
	const childrenWithComputeds: MdxChild[] = [
		{
			componentIndex: 0,
			hostPrefix: 'm0:',
			symbolPrefix: 'm0:',
			output: {
				state: {
					version: 1,
					cells: [{ graphNodeId: 'count', name: 'count' }],
					computed: [
						{
							graphNodeId: 'computed:double',
							name: 'double',
							async: false,
							deriveSymbolId: 'symbol:2',
						},
					],
				},
				loadSymbol(symbolId) {
					return () => `child0:${symbolId}`;
				},
			},
		},
		{
			componentIndex: 1,
			hostPrefix: 'm1:',
			symbolPrefix: 'm1:',
			output: {
				state: {
					version: 1,
					cells: [{ graphNodeId: 'price', name: 'price' }],
					computed: [
						{
							graphNodeId: 'computed:total',
							name: 'total',
							async: false,
							deriveSymbolId: 'c0:symbol:5',
						},
						{ graphNodeId: 'computed:pending', name: 'pending', async: true },
					],
				},
				loadSymbol(symbolId) {
					return () => `child1:${symbolId}`;
				},
			},
		},
	];

	// The view side prefixed host node ids and symbol ids while state shipped them
	// raw, so a resumed computed asked for an id no loader was keyed by.
	it('prefixes each child computed deriveSymbolId with that child symbol prefix', () => {
		const state = composeMdxState(childrenWithComputeds);

		expect(state?.computed).toEqual([
			expect.objectContaining({
				graphNodeId: 'm0:computed:double',
				deriveSymbolId: 'm0:symbol:2',
			}),
			expect.objectContaining({
				graphNodeId: 'm1:computed:total',
				deriveSymbolId: 'm1:c0:symbol:5',
			}),
			expect.objectContaining({ graphNodeId: 'm1:computed:pending' }),
		]);
		expect(state?.computed?.[2]).not.toHaveProperty('deriveSymbolId');
	});

	// Each island's own segment, and nothing shorter: two islands of one component
	// compose from their own roots and spell identical child-local ids, so a merge
	// that left them alone put both islands' cells on one node.
	it('gives every child cell the island segment its own symbols are scoped by', () => {
		const state = composeMdxState(childrenWithComputeds);

		expect(state?.cells).toEqual([
			{ graphNodeId: 'm0:count', name: 'count' },
			{ graphNodeId: 'm1:price', name: 'price' },
		]);
	});

	it('resolves every composed deriveSymbolId through the owning child loader', () => {
		const state = composeMdxState(childrenWithComputeds);
		const symbolIds = (state?.computed ?? []).flatMap((record) =>
			record.deriveSymbolId ? [record.deriveSymbolId] : [],
		);

		expect(
			symbolIds.map((symbolId) =>
				(loadMdxSymbol(symbolId, childrenWithComputeds, []) as MdxTestSymbol)({}),
			),
		).toEqual(['child0:symbol:2', 'child1:c0:symbol:5']);
	});

	it('keeps an unprefixed child resolvable without adding a second prefix', () => {
		const children: MdxChild[] = [
			{
				componentIndex: 0,
				hostPrefix: '',
				symbolPrefix: '',
				output: {
					state: {
						version: 1,
						cells: [],
						computed: [
							{
								graphNodeId: 'computed:total',
								name: 'total',
								async: false,
								deriveSymbolId: 'symbol:5',
							},
						],
					},
					loadSymbol(symbolId) {
						return `child0:${symbolId}`;
					},
				},
			},
		];
		const state = composeMdxState(children);
		const symbolId = state?.computed?.[0]?.deriveSymbolId;

		expect(symbolId).toBe('symbol:5');
		expect(loadMdxSymbol(symbolId!, children, [])).toBe('child0:symbol:5');
	});

	it('hands a prefixed id to the static loader keyed by that prefix', () => {
		const state = composeMdxState(childrenWithComputeds);
		const symbolId = state?.computed?.[1]?.deriveSymbolId;

		expect(
			(
				loadMdxSymbol(
					symbolId!,
					[],
					[
						{
							prefix: 'm1:',
							loadSymbol(id) {
								return () => `static:${id.slice('m1:'.length)}`;
							},
						},
					],
				) as MdxTestSymbol
			)({}),
		).toBe('static:c0:symbol:5');
	});
});

describe('composeMdxState storage records', () => {
	const storageChild = (index: number, key: string): MdxChild => ({
		componentIndex: index,
		hostPrefix: `m${index}:`,
		symbolPrefix: `m${index}:`,
		output: {
			state: {
				version: STORAGE_PROTOCOL_VERSION,
				cells: [{ graphNodeId: `storage:demo.tsrx#${key}`, name: key }],
				computed: [],
				storage: [{ graphNodeId: `storage:demo.tsrx#${key}`, key }],
			},
		},
	});

	// The composed payload kept the child's version-2 stamp while dropping the
	// storage array; the client validator refuses that shape, and refusing it took
	// every island on the page down with it.
	it('carries child storage records into a version 2 composed payload', () => {
		const state = composeMdxState([storageChild(0, 'theme')]);

		expect(state?.version).toBe(STORAGE_PROTOCOL_VERSION);
		expect(state?.storage).toEqual([{ graphNodeId: 'storage:demo.tsrx#theme', key: 'theme' }]);
	});

	it('concatenates storage across children and leaves graph node ids unprefixed', () => {
		const state = composeMdxState([storageChild(0, 'theme'), storageChild(1, 'density')]);

		expect(state?.storage).toEqual([
			{ graphNodeId: 'storage:demo.tsrx#theme', key: 'theme' },
			{ graphNodeId: 'storage:demo.tsrx#density', key: 'density' },
		]);
		// The client validator matches every storage record to a state cell by id.
		expect(state?.storage?.map((record) => record.graphNodeId)).toEqual(
			state?.cells?.map((cell) => (cell as { readonly graphNodeId: string }).graphNodeId),
		);
	});

	it('stamps version 1 and omits the field when no child declares storage', () => {
		const state = composeMdxState([
			{
				componentIndex: 0,
				hostPrefix: 'm0:',
				symbolPrefix: 'm0:',
				output: {
					state: {
						version: ASYNC_PROTOCOL_VERSION,
						cells: [{ graphNodeId: 'count', name: 'count' }],
						computed: [],
					},
				},
			},
		]);

		expect(state?.version).toBe(ASYNC_PROTOCOL_VERSION);
		expect(state).not.toHaveProperty('storage');
	});

	// Reading the first child's stamp also went wrong the other way: a
	// storage-declaring child behind a storage-free one shipped version 1.
	it('recomputes the version instead of inheriting the first child stamp', () => {
		const state = composeMdxState([
			{
				componentIndex: 0,
				hostPrefix: 'm0:',
				symbolPrefix: 'm0:',
				output: {
					state: { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] },
				},
			},
			storageChild(1, 'theme'),
		]);

		expect(state?.version).toBe(protocolStateVersion(state?.storage));
		expect(state?.version).toBe(STORAGE_PROTOCOL_VERSION);
	});
});

describe('composeMdxView island element offsets', () => {
	// The client pins a census of EVERY rendered element under the container, so
	// the offset the next island starts at is the island's rendered element
	// count. A locator list names only the static template's hosts: `@for` rows
	// and arm content render elements that no top-level locator points at.
	const locator = (hostNodeId: string, tagName: string) => ({
		hostNodeId,
		strategy: 'dom-order' as const,
		index: 0,
		tagName,
	});
	const island = (componentIndex: number, output: MdxChild['output']): MdxChild => ({
		componentIndex,
		hostPrefix: `m${componentIndex}:`,
		symbolPrefix: `m${componentIndex}:`,
		output,
	});
	// div > table > tbody > tr > td: five elements, one locator.
	const tableHtml =
		'<div class="api"><table><tbody><tr><td>open</td></tr></tbody></table></div>';

	it('advances the offset by the island rendered element count, not its locator count', () => {
		const view = composeMdxView(
			[
				{ kind: 'component', componentIndex: 0 },
				{ kind: 'html', elementCount: 1 },
				{ kind: 'component', componentIndex: 1 },
			],
			[
				island(0, {
					html: tableHtml,
					elementCount: 5,
					view: {
						version: 1,
						locators: [locator('h0', 'div')],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				}),
				island(1, {
					html: '<button>toggle</button>',
					elementCount: 1,
					view: {
						version: 1,
						locators: [locator('h0', 'button')],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				}),
			],
			0,
		);

		// Hand-counted census: div,table,tbody,tr,td (0-4), the markdown element
		// (5), then the second island's button.
		expect(view?.locators).toEqual([
			expect.objectContaining({ hostNodeId: 'm0:h0', index: 0 }),
			expect.objectContaining({ hostNodeId: 'm1:h0', index: 6 }),
		]);
	});

	// A child with no view is filtered out of the composed records, but its
	// markup is still in the page the census walks.
	it('counts a viewless island markup from its own rendered html', () => {
		const view = composeMdxView(
			[
				{ kind: 'component', componentIndex: 0 },
				{ kind: 'component', componentIndex: 1 },
			],
			[
				island(0, { html: '<div><span>a</span><span>b</span></div>' }),
				island(1, {
					html: '<button>toggle</button>',
					view: {
						version: 1,
						locators: [locator('h0', 'button')],
						events: [],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				}),
			],
			0,
		);

		expect(view?.locators).toEqual([expect.objectContaining({ hostNodeId: 'm1:h0', index: 3 })]);
	});
});

describe('composeMdxView payload families', () => {
	const child: MdxChild = {
		componentIndex: 0,
		hostPrefix: 'm0:',
		symbolPrefix: 'm0:',
		output: {
			html: '<!--markless:branch:0--><ul><li>a</li></ul><!--/markless:branch:0-->',
			elementCount: 2,
			state: { version: 1, cells: [{ graphNodeId: 'state:rows' }], computed: [] },
			view: {
				version: 1,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [
					{
						id: 'repeat:0',
						parentHostNodeId: 'h1',
						collectionGraphNodeId: 'state:rows',
						collectionPath: [],
						keyPath: ['id'],
						itemName: 'row',
						rowElementCount: 1,
						instancePath: 'c0:',
						rowElementHandles: [{ hostPath: [0], handleId: 'shared:rows', name: 'rows' }],
						rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:1'] }],
					},
				],
				branches: [
					{
						id: 'branch:0',
						startAnchor: { strategy: 'dom-order-comment', index: 0 },
						endAnchor: { strategy: 'dom-order-comment', index: 1 },
						symbolId: 'symbol:2',
						testReads: [{ source: 'graph', graphNodeId: 'state:rows', path: [] }],
					},
				],
				asyncBoundaries: [
					{
						id: 'boundary:0',
						runnerGraphNodeId: 'state:rows',
						initiallyServedArm: 1,
						updateSymbolId: 'symbol:3',
						startAnchor: { strategy: 'dom-order-comment', index: 2 },
						endAnchor: { strategy: 'dom-order-comment', index: 3 },
						asyncReads: [{ source: 'graph', graphNodeId: 'state:rows', path: [] }],
					},
				],
			},
		},
	};

	// The three families were dropped on the floor by MDX composition, so an
	// island's own `@for`/`@if`/`@try` interactivity never resumed on a docs page.
	it('forwards keyed repeats, branches and boundaries island-scoped', () => {
		const view = composeMdxView(
			[
				{ kind: 'html', elementCount: 2, commentCount: 1 },
				{ kind: 'component', componentIndex: 0 },
			],
			[child],
			0,
		);

		expect(view?.keyedRepeats).toEqual([
			expect.objectContaining({
				id: 'm0:repeat:0',
				parentHostNodeId: 'm0:h1',
				collectionGraphNodeId: 'm0:state:rows',
				instancePath: 'm0:c0:',
				rowEvents: [expect.objectContaining({ symbolIds: ['m0:symbol:1'] })],
			}),
		]);
		expect(view?.branches).toEqual([
			expect.objectContaining({
				id: 'm0:branch:0',
				symbolId: 'm0:symbol:2',
				// One markdown comment stands before the island.
				startAnchor: { strategy: 'dom-order-comment', index: 1 },
				endAnchor: { strategy: 'dom-order-comment', index: 2 },
				testReads: [{ source: 'graph', graphNodeId: 'm0:state:rows', path: [] }],
			}),
		]);
		expect(view?.asyncBoundaries).toEqual([
			expect.objectContaining({
				id: 'm0:boundary:0',
				runnerGraphNodeId: 'm0:state:rows',
				updateSymbolId: 'm0:symbol:3',
				startAnchor: { strategy: 'dom-order-comment', index: 3 },
				endAnchor: { strategy: 'dom-order-comment', index: 4 },
				asyncReads: [{ source: 'graph', graphNodeId: 'm0:state:rows', path: [] }],
			}),
		]);
	});

	it('counts an island own comments into the next island anchor offset', () => {
		const second: MdxChild = {
			...child,
			componentIndex: 1,
			hostPrefix: 'm1:',
			symbolPrefix: 'm1:',
		};
		const view = composeMdxView(
			[
				{ kind: 'component', componentIndex: 0 },
				{ kind: 'component', componentIndex: 1 },
			],
			[child, second],
			0,
		);
		const branches = view?.branches as ReadonlyArray<{
			readonly id: string;
			readonly startAnchor: { readonly index: number };
		}>;

		expect(branches.map((branch) => [branch.id, branch.startAnchor.index])).toEqual([
			['m0:branch:0', 0],
			['m1:branch:0', 2],
		]);
	});
});

describe('MDX slot prefixes against the composition instance-path grammar', () => {
	// An island's slot prefix IS its instance path: composition qualifies the
	// child's cells with it and resume recovers the same segment from the symbol
	// id, so both halves name one namespace. A prefix the grammar could not read
	// back left the two halves in different spaces and every composed .tsrx child
	// on a navigated MDX route went dead on click.
	it('mints slot prefixes the protocol reads back whole as an instance path', async () => {
		const code = await transformMdxRoute(
			"import Counter from '../components/Counter.tsrx';\n\n# Docs\n\n<Counter />\n",
			'/project/pages/docs.mdx',
		);
		const prefixes = [...code.matchAll(/symbolPrefix: "([^"]*)"/g)].map((match) => match[1]!);
		expect(prefixes.length).toBeGreaterThan(0);
		for (const prefix of prefixes) expect(protocolInstancePath(prefix)).toBe(prefix);
	});

	// One namespace, both halves: whatever segment a cell takes, the view record
	// that reads that cell takes the same one, or the dom update watches a node no
	// handler ever writes.
	it('composes a child cell and the view record that reads it into one namespace', () => {
		const child: MdxChild = {
			componentIndex: 0,
			hostPrefix: 'm0:',
			symbolPrefix: 'm0:',
			output: {
				state: { version: 1, cells: [{ graphNodeId: 'state:count' }], computed: [] },
				view: {
					version: 1,
					locators: [],
					events: [],
					domUpdates: [
						{ hostNodeId: 'h1', graphNodeId: 'state:count', symbolId: 'symbol:3' },
					],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [],
				},
			},
		};
		const state = composeMdxState([child]);
		const view = composeMdxView([{ kind: 'component', componentIndex: 0 }], [child], 0);
		expect(state?.cells).toEqual([{ graphNodeId: 'm0:state:count' }]);
		expect(view?.domUpdates).toEqual([
			{ hostNodeId: 'm0:h1', graphNodeId: 'm0:state:count', symbolId: 'm0:symbol:3' },
		]);
	});

	// A child that nests its own widget ships qualified cells while its handler
	// spells the bare id. The scope the route applies is the WHOLE path — island
	// segment and the child's own `c` run — so the handler's write lands on exactly
	// the cell the composed page ships, not one segment short of it.
	it('scopes a nested child symbol onto the cell the composed page ships', () => {
		const child: MdxChild = {
			componentIndex: 0,
			hostPrefix: 'm0:',
			symbolPrefix: 'm0:',
			output: {
				state: { version: 1, cells: [{ graphNodeId: 'c0:state:count' }], computed: [] },
			},
		};
		const writes: string[] = [];
		const graph = {
			read: (graphNodeId: string) => graphNodeId,
			write: (entry: { readonly graphNodeId: string }) => {
				writes.push(entry.graphNodeId);
			},
		};
		const symbol = loadMdxSymbol(
			'm0:c0:symbol:0',
			[],
			[
				{
					prefix: 'm0:',
					loadSymbol(symbolId) {
						expect(symbolId).toBe('m0:c0:symbol:0');
						return (context: { readonly graph: typeof graph }) =>
							context.graph.write({ graphNodeId: 'state:count' });
					},
				},
			],
		) as MdxTestSymbol;

		symbol({ graph });

		const cells = composeMdxState([child])?.cells as ReadonlyArray<{
			readonly graphNodeId: string;
		}>;
		expect(writes).toEqual(['m0:c0:state:count']);
		expect(writes).toEqual([cells[0]!.graphNodeId]);
	});
});
