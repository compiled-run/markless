import { expect, test } from 'vitest';
import { createRuntimeGraphFromResumePayload } from '../src/payload-graph-construct.ts';
import { wireSyncComputedDemandRecordsWithoutLoadingCapability } from '../src/resume-sync-demand.ts';

// The served shape of a keyed list of row components: each row holds computeds over
// its own props and one over a list-wide cell and a row computed no value is served for.
type Shape = {
	readonly shared: string;
	readonly row: (index: number) => string;
	readonly fields: readonly [string, string];
	// Markup-only computeds derive when read; others re-derive on every write.
	readonly onRead: boolean;
};

function rowsPayload(count: number, shape: Shape) {
	const ids = Array.from({ length: count }, (_, index) => shape.row(index));
	const cells = [
		{ graphNodeId: shape.shared, name: 'shared', valueKind: 'array', directValue: [] },
		...ids.map((id, index) => ({
			graphNodeId: `${id}:prop:props`,
			name: 'props',
			valueKind: 'object',
			directValue: {
				item: { [shape.fields[0]]: `k${index}`, [shape.fields[1]]: `Item ${index}` },
			},
		})),
	];
	const computed = ids.flatMap((id) => [
		{
			graphNodeId: `${id}:computed:text`,
			name: 'text',
			async: false,
			deriveSymbolId: `${id}:symbol:text`,
			dependencies: [{ graphNodeId: `${id}:prop:props`, path: ['item', shape.fields[1]] }],
			...(shape.onRead && { deriveOnRead: true as const }),
		},
		{
			graphNodeId: `${id}:computed:key`,
			name: 'key',
			async: false,
			deriveSymbolId: `${id}:symbol:key`,
			dependencies: [{ graphNodeId: `${id}:prop:props`, path: ['item', shape.fields[0]] }],
			...(shape.onRead && { deriveOnRead: true as const }),
		},
		{
			graphNodeId: `${id}:computed:mark`,
			name: 'mark',
			async: false,
			deriveSymbolId: `${id}:symbol:mark`,
			dependencies: [
				{ graphNodeId: shape.shared, path: [] },
				{ graphNodeId: `${id}:computed:key`, path: [] },
			],
			...(shape.onRead && { deriveOnRead: true as const }),
		},
	]);
	return { ids, cells, computed };
}

// Reads of a record's node id one write to the list-wide cell makes before every row has repainted.
async function recordReadsOnFirstWrite(count: number, shape: Shape) {
	const { ids, cells, computed } = rowsPayload(count, shape);
	let reads = 0;
	const counted = computed.map(
		(record) =>
			new Proxy(record, {
				get(target, key, receiver) {
					if (key === 'graphNodeId') reads++;
					return Reflect.get(target, key, receiver);
				},
			}),
	);
	type Read = { readonly graph: { read: (id: string, path?: string[]) => unknown } };
	const loadSymbol = (symbolId: string) => {
		const id = symbolId.slice(0, symbolId.indexOf(':symbol:'));
		const kind = symbolId.slice(symbolId.lastIndexOf(':') + 1);
		if (kind === 'mark')
			return ({ graph }: Read) =>
				(graph.read(shape.shared, []) as string[]).includes(
					graph.read(`${id}:computed:key`, []) as string,
				)
					? 'on'
					: 'off';
		const field = shape.fields[kind === 'key' ? 0 : 1];
		return ({ graph }: Read) => graph.read(`${id}:prop:props`, ['item', field]);
	};
	const root = { nodeType: 1, tagName: 'MAIN', childNodes: [] };
	const graph = await createRuntimeGraphFromResumePayload({
		state: { version: 1, cells, computed: [], sharedDefinitions: [], storage: [] },
		view: {
			version: 1,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
			asyncRunners: {},
		},
		root,
		loadSymbol,
	} as never);
	await wireSyncComputedDemandRecordsWithoutLoadingCapability({
		graph,
		computed: counted,
		root,
		loadSymbol,
		elementHandles: { get: () => undefined },
		storeContainerSubscription() {},
	} as never);
	const painted = new Map<string, unknown>();
	for (const id of ids)
		graph.subscribe({
			id: `paint:${id}`,
			graphNodeId: `${id}:computed:mark`,
			path: [],
			run(value: unknown) {
				painted.set(id, value);
			},
		});
	await graph.flush();
	reads = 0;
	graph.write({ graphNodeId: shape.shared, path: [], value: ['k1'] });
	for (let turn = 0; turn < 4; turn++) await graph.flush();
	expect(painted.get(ids[1]!)).toBe('on');
	expect(painted.get(ids[0]!)).toBe('off');
	expect(painted.size).toBe(count);
	return reads;
}

const SHAPES: ReadonlyArray<Shape> = [
	{
		shared: 'state:selected',
		row: (index) => `r:u${index}:c0`,
		fields: ['id', 'name'],
		onRead: true,
	},
	{
		shared: 'm2:state:starred',
		row: (index) => `m2:r:t-${index}:c3`,
		fields: ['slug', 'title'],
		onRead: true,
	},
	{
		shared: 'state:selected',
		row: (index) => `r:u${index}:c0`,
		fields: ['id', 'name'],
		onRead: false,
	},
	{
		shared: 'm2:state:starred',
		row: (index) => `m2:r:t-${index}:c3`,
		fields: ['slug', 'title'],
		onRead: false,
	},
];

test.each(SHAPES)(
	'a write every row reads costs node id reads linear in the rows ($shared, on read: $onRead)',
	async (shape) => {
		const small = await recordReadsOnFirstWrite(200, shape);
		const large = await recordReadsOnFirstWrite(400, shape);
		// About 17 per record when the records are indexed once; a search per dependency read over 1,000 at 400 rows.
		expect(large / (400 * 3)).toBeLessThanOrEqual(25);
		expect(large).toBeLessThan(small * 2.2);
	},
);
