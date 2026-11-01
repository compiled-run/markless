import type { RuntimeGraph } from '@markless/runtime';
import type { ResumePreparedCore, ResumeRuntimeInput, ResumeSymbol } from './resume-types.ts';

// Held once loaded: every import() of an evaluated module still resolves a task later.
let syncComputedModule: typeof import('./resume-sync-computed.ts') | undefined;
const loadModule = async () => (syncComputedModule ??= await import('./resume-sync-computed.ts'));

// Both record kinds answer the same two questions: which node to write, and
// which symbol derives it. A sync computed derives its own value; a shared seed
// re-runs the component's own seed expression over the props it reads.
type DemandRecord = {
	readonly graphNodeId: string;
	readonly deriveSymbolId: string;
	readonly deriveOnRead?: true;
	readonly dependencies?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
};

type Records = NonNullable<ResumeRuntimeInput['state']>['computed'];

// Spec 03: a sync computed re-derives when read. A dependency write marks it
// stale, and it re-derives in that pass only while something shown reads it.
type Lazy = {
	readonly record: DemandRecord;
	stale: boolean;
	version: number;
	derive?: ResumeSymbol;
	loading?: Promise<void>;
	pending?: Promise<void>;
};

type LazyGraph = {
	readonly nodes: Map<string, Lazy>;
	readonly readers: Map<string, Set<string>>;
	// Subscriptions this module holds per node, which are no reader of their own.
	readonly own: Map<string, number>;
	// Read by an async computed, which the graph re-runs from the value itself.
	readonly asyncRead: Set<string>;
};

const lazyGraphs = new WeakMap<RuntimeGraph, LazyGraph>();

export function wireSyncComputedDemandTriggersWithoutLoadingCapability(input: {
	readonly graph: ResumeRuntimeInput['graph'];
	readonly state: ResumeRuntimeInput['state'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ResumePreparedCore['elementHandles'];
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	wireSyncComputedDemandRecordsWithoutLoadingCapability({
		...input,
		computed: input.state?.computed ?? [],
		sharedSeeds: input.state?.sharedSeeds,
	});
}

export function wireSyncComputedDemandRecordsWithoutLoadingCapability(input: {
	readonly graph: ResumeRuntimeInput['graph'];
	readonly computed: Records;
	readonly allComputed?: Records;
	readonly sharedSeeds?: NonNullable<ResumeRuntimeInput['state']>['sharedSeeds'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ResumePreparedCore['elementHandles'];
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	const { graph } = input;
	const all = input.allComputed ?? input.computed;
	const computed = input.computed.filter(
		(record) => record.async === false && typeof record.deriveSymbolId === 'string',
	) as ReadonlyArray<DemandRecord>;
	let lazy = lazyGraphs.get(graph);
	if (
		!lazy &&
		graph.pullBeforeRead &&
		graph.subscriptionCount &&
		computed.some((record) => record.deriveOnRead)
	)
		lazyGraphs.set(
			graph,
			(lazy = { nodes: new Map(), readers: new Map(), own: new Map(), asyncRead: new Set() }),
		);
	for (const record of lazy ? all : [])
		if (record.async === true)
			for (const { graphNodeId } of record.dependencies ?? [])
				lazy!.asyncRead.add(graphNodeId);
	const { nodes, readers, own, asyncRead } = lazy ?? ({} as LazyGraph);
	const refreshInput = (record: DemandRecord, derive?: ResumeSymbol) => ({
		computed: record,
		records: all,
		graph,
		root: input.root,
		loadSymbol: input.loadSymbol,
		elementHandles: input.elementHandles,
		derive,
	});
	const track = (node: Lazy, loading: Promise<unknown>) =>
		(node.loading = loading.then(
			() => void (node.loading = undefined),
			() => void (node.loading = undefined),
		));
	// Loads the derive symbol without running it.
	const prepare = (node: Lazy): Promise<void> | undefined => {
		if (node.loading) return node.loading;
		const roster = () =>
			syncComputedModule
				? syncComputedModule.pendingRosterResume()
				: loadModule().then((module) => module.pendingRosterResume());
		if (!node.derive) {
			const symbol = input.loadSymbol(node.record.deriveSymbolId);
			if (typeof symbol !== 'function')
				return track(
					node,
					symbol.then((derive) => ((node.derive = derive), roster())),
				);
			node.derive = symbol;
		}
		const pending = roster();
		return pending && track(node, pending);
	};
	const shown = (graphNodeId: string, seen = new Set<string>()): boolean => {
		if (seen.has(graphNodeId)) return false;
		seen.add(graphNodeId);
		if (graph.subscriptionCount!(graphNodeId) > (own.get(graphNodeId) ?? 0)) return true;
		if (asyncRead.has(graphNodeId)) return true;
		for (const reader of readers.get(graphNodeId) ?? []) if (shown(reader, seen)) return true;
		return false;
	};
	const refresh = async (record: DemandRecord, node?: Lazy) => {
		const module = await loadModule();
		if (!node) return module.refreshSyncComputed(refreshInput(record));
		const version = node.version;
		await prepare(node);
		await module.refreshSyncComputed(refreshInput(record, node.derive));
		if (node.version === version) node.stale = false;
	};
	const pull = (node: Lazy) => {
		if (!node.stale || node.pending) return;
		const id = node.record.graphNodeId;
		const derived =
			node.derive &&
			syncComputedModule?.deriveSyncComputedNow(refreshInput(node.record), node.derive);
		if (derived === true) node.stale = false;
		else if (derived) {
			const version = node.version;
			const settled = () => {
				node.pending = undefined;
				if (node.version === version) node.stale = false;
				else graph.pullBeforeRead!(id, () => pull(node));
			};
			node.pending = derived.then(settled, settled);
		} else {
			// Read before its symbol arrived: a flip reads again once it has, and a shown reader refreshes.
			graph.pullBeforeRead!(id, () => pull(node));
			const loaded = () => {
				if (node.stale && shown(id)) void refresh(node.record, node);
			};
			const loading = prepare(node);
			if (loading) void loading.then(loaded);
			else loaded();
		}
	};
	const markStale = (graphNodeId: string, seen = new Set<string>()) => {
		if (seen.has(graphNodeId)) return;
		seen.add(graphNodeId);
		const node = nodes.get(graphNodeId);
		if (node) {
			node.version++;
			graph.pullBeforeRead!(graphNodeId, () => pull(node));
			node.stale = true;
		}
		for (const reader of readers.get(graphNodeId) ?? []) markStale(reader, seen);
	};
	const seeds = (input.sharedSeeds ?? []) as ReadonlyArray<DemandRecord>;
	for (const record of [...computed, ...seeds]) {
		const node: Lazy | undefined =
			lazy && record.deriveOnRead ? { record, stale: false, version: 0 } : undefined;
		if (node) {
			nodes.set(record.graphNodeId, node);
			const release = graph.subscribeWrite?.({
				graphNodeId: record.graphNodeId,
				settle: () => node.loading ?? node.pending,
				run() {},
			});
			if (release) input.storeContainerSubscription(release);
		}
		for (const dependency of record.dependencies ?? []) {
			const id = dependency.graphNodeId;
			if (node) {
				readers.set(id, (readers.get(id) ?? new Set()).add(record.graphNodeId));
				own.set(id, (own.get(id) ?? 0) + 1);
			}
			const release = graph.subscribe({
				id: `sync-computed-demand:${record.graphNodeId}:${record.deriveSymbolId}:${id}:${dependency.path.join('.')}`,
				graphNodeId: id,
				path: dependency.path,
				async run() {
					await loadModule();
					if (node) {
						markStale(record.graphNodeId);
						if (!shown(record.graphNodeId)) return;
					}
					await refresh(record, node);
				},
			});
			input.storeContainerSubscription(
				node
					? () => {
							release();
							own.set(id, (own.get(id) ?? 1) - 1);
						}
					: release,
			);
		}
		// No value is served for a computed only other computeds read: it derives at its first read.
		if (node && graph.read(record.graphNodeId, []) === undefined) markStale(record.graphNodeId);
	}
}
