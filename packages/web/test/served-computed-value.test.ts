import { expect, test } from 'vitest';
import { createRuntimeGraphFromResumePayload } from '../src/payload-graph-construct.ts';
import { marklessSsrServeComputed } from '../src/fns/state-payload.ts';

// A sync computed is not a `compute` node in the browser: the resume runtime
// re-runs its derive only when a dependency is WRITTEN. Until that first write
// the graph answers out of the cells map, which is where the served value goes.

type FakeNode = { readonly nodeType: 1; readonly tagName: string; readonly childNodes: FakeNode[] };

const root: FakeNode = { nodeType: 1, tagName: 'SECTION', childNodes: [] };

const view = {
	version: 1,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
	asyncRunners: {},
};

const computedRecord = {
	graphNodeId: 'shared:spike/computed:total',
	name: 'total',
	async: false,
	deriveSymbolId: 'symbol:derive',
	dependencies: [
		{ graphNodeId: 'shared:spike/state:s', path: ['base'] },
		{ graphNodeId: 'shared:spike/state:s', path: ['step'] },
	],
};

function payload(servedTotal: number | undefined) {
	const state = {
		version: 1,
		cells: [
			{
				graphNodeId: 'shared:spike/state:s',
				name: 's',
				valueKind: 'object',
				directValue: { base: 2, step: 3 },
			},
		],
		computed: [{ ...computedRecord }],
		sharedDefinitions: [],
		storage: [],
	};
	if (servedTotal !== undefined)
		marklessSsrServeComputed(state, new Map([[computedRecord.graphNodeId, servedTotal]]), [
			computedRecord.graphNodeId,
		]);
	return state;
}

async function resumedGraph(servedTotal: number | undefined) {
	return await createRuntimeGraphFromResumePayload({
		state: payload(servedTotal),
		view,
		root,
		loadSymbol: () => () => undefined,
	} as never);
}

test('a served computed value answers the first read, before any write', async () => {
	const graph = await resumedGraph(5);

	expect(graph.read('shared:spike/computed:total')).toBe(5);
	// The same read a compiled event handler makes: no path argument.
	expect(graph.read('shared:spike/computed:total', [])).toBe(5);
});

test('the served value is the envelope a cell value uses, on the computed record', () => {
	const served = payload(5).computed[0] as { readonly value?: { readonly version: number } };

	expect(served.value).toMatchObject({ version: 1 });
	// No cell record is minted for a computed: that design was measured broken.
	expect(payload(5).cells.map((cell) => cell.graphNodeId)).toEqual(['shared:spike/state:s']);
});

test('serving a value replaces the record instead of mutating the shared one', () => {
	const state = { computed: [computedRecord] };
	marklessSsrServeComputed(state, new Map([[computedRecord.graphNodeId, 5]]), [
		computedRecord.graphNodeId,
	]);

	expect(state.computed[0]).not.toBe(computedRecord);
	expect(computedRecord).not.toHaveProperty('value');
});

test('a computed the render never derived carries no value', () => {
	const state = { computed: [{ ...computedRecord }] };
	marklessSsrServeComputed(state, new Map(), [computedRecord.graphNodeId]);

	expect(state.computed[0]).not.toHaveProperty('value');
});

// A CSR mount hands the payload over in memory, so its computed value travels on
// the same live channel cells use rather than through an envelope.
test('a live directValue answers the first read too', async () => {
	const graph = await createRuntimeGraphFromResumePayload({
		state: {
			version: 1,
			cells: [
				{
					graphNodeId: 'shared:spike/state:s',
					name: 's',
					valueKind: 'object',
					directValue: { base: 2, step: 3 },
				},
			],
			computed: [{ ...computedRecord, directValue: 5 }],
			sharedDefinitions: [],
			storage: [],
		},
		view,
		root,
		loadSymbol: () => () => undefined,
	} as never);

	expect(graph.read('shared:spike/computed:total')).toBe(5);
});

test('a computed with no served value is the undefined a handler used to read', async () => {
	const graph = await resumedGraph(undefined);

	expect(graph.read('shared:spike/computed:total')).toBeUndefined();
	expect((graph.read('shared:spike/computed:total') as number) + 1).toBeNaN();
});

test('a refresh after a dependency write replaces the served value', async () => {
	const graph = await resumedGraph(5);
	const { refreshSyncComputed } = await import('../src/resume-sync-computed.ts');

	graph.write({ graphNodeId: 'shared:spike/state:s', path: ['base'], value: 10 });
	await refreshSyncComputed({
		computed: computedRecord,
		graph,
		root: root as never,
		loadSymbol: () =>
			(({ graph: derived }: { readonly graph: { read: (id: string, path?: string[]) => unknown } }) =>
				(derived.read('shared:spike/state:s', ['base']) as number) +
				(derived.read('shared:spike/state:s', ['step']) as number)) as never,
		elementHandles: { get: () => undefined } as never,
	});

	expect(graph.read('shared:spike/computed:total')).toBe(13);
});

// A served value changes what the first refresh sees. It used to write over
// undefined and always dirty the node; now a refresh that derives the value
// already served takes the graph's Object.is early return and journals nothing.
test('a refresh deriving the served value again writes nothing', async () => {
	const graph = await resumedGraph(5);
	const { refreshSyncComputed } = await import('../src/resume-sync-computed.ts');
	graph.takeJournal();

	await refreshSyncComputed({
		computed: computedRecord,
		graph,
		root: root as never,
		loadSymbol: () => (() => 5) as never,
		elementHandles: { get: () => undefined } as never,
	});
	await graph.flush();

	expect(graph.read('shared:spike/computed:total')).toBe(5);
	expect(graph.takeJournal()).toEqual([]);
});
