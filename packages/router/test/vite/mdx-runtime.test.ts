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
	protocolStateVersion,
	STORAGE_PROTOCOL_VERSION,
} from '../../../serializer/src/protocol-constants.ts';

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

	it('loads symbols from live CSR children before falling back to static MDX loaders', () => {
		expect(
			loadMdxSymbol(
				'm0:symbol:click',
				[
					{
						componentIndex: 0,
						hostPrefix: 'm0:',
						symbolPrefix: 'm0:',
						output: {
							loadSymbol(symbolId) {
								return `live:${symbolId}`;
							},
						},
					},
				],
				[
					{
						prefix: 'm0:',
						loadSymbol(symbolId) {
							return `static:${symbolId}`;
						},
					},
				],
			),
		).toBe('live:symbol:click');
	});
});

describe('renderMdxChild with async compiled artifacts', () => {
	it('awaits an async renderSsr and returns its html', async () => {
		// Compiled marklessRenderSsr is async since the initial-render awaiting
		// work. The unawaited Promise passed the truthy guard while .html read
		// undefined — the MDX child (counter AND home Link) silently dropped,
		// which broke both router-dev-routes and router-preload-strategy.
		const children: unknown[] = [];
		const html = await renderMdxChild(
			children as never,
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
					return `child0:${symbolId}`;
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
					return `child1:${symbolId}`;
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
				graphNodeId: 'computed:double',
				deriveSymbolId: 'm0:symbol:2',
			}),
			expect.objectContaining({
				graphNodeId: 'computed:total',
				deriveSymbolId: 'm1:c0:symbol:5',
			}),
			expect.objectContaining({ graphNodeId: 'computed:pending' }),
		]);
		expect(state?.computed?.[2]).not.toHaveProperty('deriveSymbolId');
	});

	it('leaves cells and graph node ids in the namespace the view records read', () => {
		const state = composeMdxState(childrenWithComputeds);

		expect(state?.cells).toEqual([
			{ graphNodeId: 'count', name: 'count' },
			{ graphNodeId: 'price', name: 'price' },
		]);
	});

	it('resolves every composed deriveSymbolId through the owning child loader', () => {
		const state = composeMdxState(childrenWithComputeds);
		const symbolIds = (state?.computed ?? []).flatMap((record) =>
			record.deriveSymbolId ? [record.deriveSymbolId] : [],
		);

		expect(
			symbolIds.map((symbolId) => loadMdxSymbol(symbolId, childrenWithComputeds, [])),
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
			loadMdxSymbol(
				symbolId!,
				[],
				[
					{
						prefix: 'm1:',
						loadSymbol(id) {
							return `static:${id.slice('m1:'.length)}`;
						},
					},
				],
			),
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
