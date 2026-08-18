import { expect, test, vi } from 'vitest';

// The runtime unit tests already pin what the reconcile plane computes. What
// this file pins is the WIRING a real app gets: the module the bundler emits
// for a computed-using app (`@markless/web/fns/reconcile-plane`) has to reach
// the graph the resume path builds, and an app that never loads that module
// has to keep the pre-reconciliation whole-node behavior.
//
// The path exercised here is the one a resumed page actually takes. A sync
// computed is not a `compute` node in the browser: the resume runtime
// subscribes to its dependencies and, when one is written, re-runs the derive
// symbol and commits the whole derived value with `graph.write`. Both of those
// modules are used directly below, so the only thing the test supplies is the
// payload and the derive symbol.
//
// The count is the one `demos/derived-reconcile` reports: how many DOM
// expressions re-check after a write to one field of one record. Each
// `view-dom-update:*` subscription is one such expression, exactly as a repeat
// row's text binding is.

const ROW_COUNT = 6;
const CHANGED_ROW = 2;

type FakeNode = { readonly nodeType: 1; readonly tagName: string; readonly childNodes: FakeNode[] };

function element(tagName: string, childNodes: FakeNode[] = []): FakeNode {
	return { nodeType: 1, tagName, childNodes };
}

async function freshResumeModules() {
	// The plane slot is module state, so each direction needs its own registry.
	vi.resetModules();
	const construct = await import('../src/payload-graph-construct.ts');
	const demand = await import('../src/resume-sync-demand.ts');
	const refresh = await import('../src/resume-sync-computed.ts');
	const plane = await import('../src/fns/reconcile-plane.ts');
	return {
		createRuntimeGraphFromResumePayload: construct.createRuntimeGraphFromResumePayload,
		wireSyncComputedDemandRecordsWithoutLoadingCapability:
			demand.wireSyncComputedDemandRecordsWithoutLoadingCapability,
		refreshSyncComputed: refresh.refreshSyncComputed,
		installMarklessDerivedReconcile: plane.installMarklessDerivedReconcile,
	};
}

/**
 * One state cell holding a list of records and one sync computed deriving a
 * display row per record. The computed carries no reconcile keys because the
 * payload protocol has no field for them: this is the shape a built app ships.
 */
function resumePayload(headline: (rowCount: number) => string) {
	const source = {
		items: Array.from({ length: ROW_COUNT }, (_, index) => ({
			id: `id-${index}`,
			done: false,
			hidden: false,
		})),
	};
	const state = {
		version: 1,
		cells: [
			{ graphNodeId: 'state:source', name: 'source', valueKind: 'object', directValue: source },
		],
		computed: [
			{
				graphNodeId: 'computed:rows',
				name: 'rows',
				async: false,
				deriveSymbolId: 'symbol:derive',
				dependencies: [{ graphNodeId: 'state:source', path: [] }],
			},
		],
		sharedDefinitions: [],
		storage: [],
	};
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
	const root = element('SECTION');
	// A derive of the shape real apps write: it selects records rather than
	// rebuilding them, so an unchanged row is still the very object the state
	// cell holds. That is what lets reconciliation narrow a rebuilt collection
	// down to the field the write touched.
	const derive = ({ graph }: { readonly graph: { read: (id: string) => unknown } }) => {
		const current = graph.read('state:source') as typeof source;
		return {
			label: headline(current.items.length),
			items: current.items.filter((item) => !item.hidden),
		};
	};
	return { source, state, view, root, derive };
}

/** DOM expressions that re-checked after one field of one record was written. */
async function reCheckedRows(input: {
	readonly installPlane: boolean;
	readonly headline: (rowCount: number) => string;
}): Promise<ReadonlyArray<string>> {
	const modules = await freshResumeModules();
	if (input.installPlane) modules.installMarklessDerivedReconcile();

	const payload = resumePayload(input.headline);
	const loadSymbol = (symbolId: string) => {
		expect(symbolId).toBe('symbol:derive');
		return payload.derive;
	};

	const graph = await modules.createRuntimeGraphFromResumePayload({
		state: payload.state,
		view: payload.view,
		root: payload.root,
		loadSymbol,
	} as never);

	// The real resume wiring: one subscription per dependency, which re-runs the
	// derive symbol and commits the whole derived value.
	modules.wireSyncComputedDemandRecordsWithoutLoadingCapability({
		graph,
		computed: payload.state.computed,
		root: payload.root,
		loadSymbol,
		elementHandles: { get: () => undefined },
		storeContainerSubscription() {},
	} as never);

	// First paint: the derived node has no value until something derives it, so
	// prime it through the same refresh the demand subscription calls.
	await modules.refreshSyncComputed({
		computed: payload.state.computed[0],
		graph,
		root: payload.root,
		loadSymbol,
		elementHandles: { get: () => undefined },
	} as never);
	await graph.flush();
	await graph.flush();

	const reChecked: string[] = [];
	for (let index = 0; index < ROW_COUNT; index++) {
		graph.subscribe({
			id: `view-dom-update:row-${index}`,
			graphNodeId: 'computed:rows',
			path: ['items', String(index), 'done'],
			run() {
				reChecked.push(`row-${index}`);
			},
		});
	}
	await graph.flush();
	reChecked.length = 0;

	// The write a row's checkbox handler makes: one field of one record.
	graph.write({
		graphNodeId: 'state:source',
		path: ['items', String(CHANGED_ROW), 'done'],
		value: true,
	});
	await graph.flush();
	await graph.flush();

	const rows = graph.read('computed:rows') as { items: ReadonlyArray<{ done: boolean }> };
	// The derived value really did re-derive, so an empty count would mean
	// "nothing re-checked", never "nothing happened".
	expect(rows.items[CHANGED_ROW]!.done).toBe(true);
	return [...new Set(reChecked)].sort();
}

test('a computed-using app that loads the emitted plane module re-checks only the changed row', async () => {
	expect(await reCheckedRows({ installPlane: true, headline: (count) => `${count} rows` })).toEqual(
		[`row-${CHANGED_ROW}`],
	);
});

test('the same wiring holds for a differently shaped derived row', async () => {
	// Hardcoding resistance: same structure, different derived label shape.
	expect(
		await reCheckedRows({
			installPlane: true,
			headline: (count) => `Track list of ${count}`,
		}),
	).toEqual([`row-${CHANGED_ROW}`]);
});

test('an app that never loads the plane module keeps whole-node invalidation', async () => {
	expect(
		await reCheckedRows({ installPlane: false, headline: (count) => `${count} rows` }),
	).toEqual(Array.from({ length: ROW_COUNT }, (_, index) => `row-${index}`).sort());
});
