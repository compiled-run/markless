import { expect, test } from 'vitest';
import { createRuntimeGraphFromResumePayload } from '../src/payload-graph-construct.ts';

// A sync computed is not a `compute` node in the browser: the resume runtime
// re-runs its derive only when a dependency is WRITTEN. Until that first write
// the graph answers with whatever cell the page was served, and the protocol's
// computed record carries no value of its own. That is why an event handler
// reading a computed before anything moved gets undefined (NaN in arithmetic) —
// an open framework gap, pinned here so the mechanism is on the record.

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

function payload(servedTotal: number | undefined) {
	return {
		version: 1,
		cells: [
			{
				graphNodeId: 'shared:spike/state:s',
				name: 's',
				valueKind: 'object',
				directValue: { base: 2, step: 3 },
			},
			...(servedTotal === undefined
				? []
				: [
						{
							graphNodeId: 'shared:spike/computed:total',
							name: 'total',
							valueKind: 'unknown',
							directValue: servedTotal,
						},
					]),
		],
		computed: [
			{
				graphNodeId: 'shared:spike/computed:total',
				name: 'total',
				async: false,
				deriveSymbolId: 'symbol:derive',
				dependencies: [
					{ graphNodeId: 'shared:spike/state:s', path: ['base'] },
					{ graphNodeId: 'shared:spike/state:s', path: ['step'] },
				],
			},
		],
		sharedDefinitions: [],
		storage: [],
	};
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

test('a computed with no served value is the undefined a handler reads', async () => {
	const graph = await resumedGraph(undefined);

	expect(graph.read('shared:spike/computed:total')).toBeUndefined();
	// The NaN a slider thumb keydown reported: arithmetic over that undefined.
	expect((graph.read('shared:spike/computed:total') as number) + 1).toBeNaN();
});

test('a refresh after a dependency write replaces the served value', async () => {
	const graph = await resumedGraph(5);
	const { refreshSyncComputed } = await import('../src/resume-sync-computed.ts');

	graph.write({ graphNodeId: 'shared:spike/state:s', path: ['base'], value: 10 });
	await refreshSyncComputed({
		computed: payload(5).computed[0]!,
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
