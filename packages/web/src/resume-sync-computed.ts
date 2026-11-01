import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeRuntimeInput,
	ResumeSymbol,
} from './resume-types.ts';

// The node to write and the symbol that derives it: all a refresh needs, and the
// shape both a sync computed and a shared seed's follow record have. A seed also
// says which read each of its routes answers, because its symbol reads the props
// its component was rendered with and the live value moved to the parent's node.
type ResumeSyncComputedRecord = {
	readonly graphNodeId: string;
	readonly deriveSymbolId: string;
	readonly dependencies?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
		readonly reads?: {
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		};
	}>;
	readonly hostScope?: string;
};

/**
 * The live-roster reader, loaded through the app's own resume module.
 *
 * The `import()` specifier is NOT written here: every sync computed on every
 * resumed page runs this file, so naming the module - or `fns/instance-scope`
 * behind it - would emit a chunk for all of them. Reached through the global,
 * the roster module imports instance-scope STATICALLY, so it links the chunk
 * the dispatch core already carries instead of forcing a re-export shim.
 */
type RosterResumeModule = typeof import('./fns/roster-resume.ts');
type RosterResumeHost = {
	readonly __marklessRosterResume?: () => Promise<RosterResumeModule>;
};

// One import per loader: every import() of an evaluated module still resolves a task later.
const rosterLoads = new WeakMap<() => Promise<RosterResumeModule>, Promise<RosterResumeModule>>();
const rosters = new WeakMap<() => Promise<RosterResumeModule>, RosterResumeModule>();
function loadRosterResume(): Promise<RosterResumeModule> | undefined {
	const load = (globalThis as RosterResumeHost).__marklessRosterResume;
	if (!load) return undefined;
	let pending = rosterLoads.get(load);
	if (!pending) {
		pending = load().then(
			(roster) => (rosters.set(load, roster), roster),
			(error: unknown) => {
				rosterLoads.delete(load);
				throw error;
			},
		);
		rosterLoads.set(load, pending);
	}
	return pending;
}

/** The roster reader a synchronous derive still waits for; `undefined` when none is needed or it is here. */
export function pendingRosterResume(): Promise<unknown> | undefined {
	const load = (globalThis as RosterResumeHost).__marklessRosterResume;
	return load && !rosters.has(load) ? loadRosterResume() : undefined;
}

type RefreshInput = Parameters<typeof refreshSyncComputed>[0];

function derive(input: RefreshInput, symbol: ResumeSymbol, roster: RosterResumeModule | undefined) {
	const graph = seedSourceGraph(input.graph, input.computed);
	return symbol({
		graph,
		read: graph.read,
		element: input.root,
		getElementHandle: input.elementHandles.get,
		rosterPosition: roster?.createRosterPositionReader(input),
		rosterCount: roster?.createRosterCountReader(input),
	});
}

/**
 * Derives the computed at once and writes it, or once its value settles when the
 * symbol answers a promise; false when its roster reader or an async ancestor is
 * not ready.
 */
export function deriveSyncComputedNow(
	input: RefreshInput,
	symbol: ResumeSymbol,
): boolean | Promise<unknown> {
	const load = (globalThis as RosterResumeHost).__marklessRosterResume;
	const roster = load && rosters.get(load);
	if (
		(load && !roster) ||
		(input.records && awaitsAsyncAncestor(input.computed, input.records, input.graph))
	)
		return false;
	const write = (value: unknown) =>
		input.graph.write({ graphNodeId: input.computed.graphNodeId, value });
	const value = derive(input, symbol, roster || undefined);
	if (typeof (value as PromiseLike<unknown> | null)?.then === 'function')
		return Promise.resolve(value).then(write);
	write(value);
	return true;
}

export async function refreshSyncComputed(
	input: {
		readonly computed: ResumeSyncComputedRecord;
		readonly graph: RuntimeGraph;
		readonly root: ResumeDomElement;
		readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
		readonly elementHandles: ElementHandleRegistry;
		readonly derive?: ResumeSymbol;
		readonly records?: ReadonlyArray<
			Omit<ResumeSyncComputedRecord, 'deriveSymbolId'> & {
				readonly async?: boolean;
				readonly deriveSymbolId?: string;
				readonly deriveOnRead?: true;
			}
		>;
	},
	deriving = new Set<string>(),
): Promise<void> {
	// No value is served for a computed only other computeds read: derive it before its reader.
	deriving.add(input.computed.graphNodeId);
	for (const { graphNodeId } of input.computed.dependencies ?? []) {
		const record = input.records?.find(
			(r) => r.graphNodeId === graphNodeId && r.async === false && r.deriveSymbolId,
		);
		if (record && !deriving.has(graphNodeId) && input.graph.read(graphNodeId, []) === undefined)
			await refreshSyncComputed(
				{ ...input, computed: record as ResumeSyncComputedRecord, derive: undefined },
				deriving,
			);
	}
	// Spec 03: a sync computed over an unsettled async ancestor stays pending instead of running.
	if (input.records && awaitsAsyncAncestor(input.computed, input.records, input.graph)) return;
	const roster = await loadRosterResume();
	const result = derive(
		input,
		input.derive ?? (await input.loadSymbol(input.computed.deriveSymbolId)),
		roster,
	);
	input.graph.write({
		graphNodeId: input.computed.graphNodeId,
		value: await result,
	});
}

type DependencyRecord = {
	readonly graphNodeId: string;
	readonly async?: boolean;
	readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
};

function awaitsAsyncAncestor(
	computed: Pick<DependencyRecord, 'dependencies'>,
	records: ReadonlyArray<DependencyRecord>,
	graph: RuntimeGraph,
	visited = new Set<string>(),
): boolean {
	for (const { graphNodeId } of computed.dependencies ?? []) {
		if (visited.has(graphNodeId)) continue;
		visited.add(graphNodeId);
		const record = records.find((candidate) => candidate.graphNodeId === graphNodeId);
		if (record?.async === true) {
			if (!hasReadableValue(graph.read(graphNodeId, []))) return true;
		} else if (record && awaitsAsyncAncestor(record, records, graph, visited)) return true;
	}
	return false;
}

// A re-run keeps its prior settled value readable (spec D8), so only a first run or a rejection has nothing to read.
function hasReadableValue(snapshot: unknown): boolean {
	const { status, value } =
		(snapshot as { readonly status?: unknown; readonly value?: unknown } | null) ?? {};
	return status === 'fulfilled' || (status === 'pending' && value !== undefined);
}

// A shared seed re-runs its own authored expression, so its prop reads have to
// reach the value the enclosing instance now holds rather than the props its
// component was rendered with once. The symbol runs instance-scoped, so the ids
// reaching here are already qualified and the record's read matches exactly.
function seedSourceGraph(graph: RuntimeGraph, record: ResumeSyncComputedRecord): RuntimeGraph {
	const routes = record.dependencies;
	if (!routes?.some((route) => route.reads)) return graph;
	const read: RuntimeGraph['read'] = (graphNodeId, path = []) => {
		const route = routes.find(
			(candidate) =>
				candidate.reads?.graphNodeId === graphNodeId &&
				candidate.reads.path.join(' ') === path.join(' '),
		);
		return route ? graph.read(route.graphNodeId, route.path) : graph.read(graphNodeId, path);
	};
	return { ...graph, read };
}

type OnReadRecord = ResumeSyncComputedRecord & {
	readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
};

type OnReadNode = {
	readonly record: OnReadRecord;
	stale: boolean;
	version: number;
	derive?: ResumeSymbol;
	loading?: Promise<void>;
	pending?: Promise<void>;
};

type OnReadGraph = {
	readonly nodes: Map<string, OnReadNode>;
	readonly readers: Map<string, Set<string>>;
	// The demand subscriptions on each node, which read nothing themselves.
	readonly own: Map<string, number>;
	// Read by an async computed, which the graph re-runs from the value itself.
	readonly asyncRead: Set<string>;
	scanned: number;
};

const onReadGraphs = new WeakMap<RuntimeGraph, OnReadGraph>();

/**
 * Spec 03 for a computed only markup reads: a dependency write marks it stale,
 * and it re-derives in that pass only while something shown subscribes to it,
 * otherwise at its next read.
 */
export async function refreshWhenShown(
	input: RefreshInput,
	batches: ReadonlyArray<NonNullable<RefreshInput['records']>>,
): Promise<void> {
	const { graph } = input;
	let state = onReadGraphs.get(graph);
	if (!state) {
		onReadGraphs.set(
			graph,
			(state = {
				nodes: new Map(),
				readers: new Map(),
				own: new Map(),
				asyncRead: new Set(),
				scanned: 0,
			}),
		);
		// A gesture, and a flip, wait for the derives already loading or settling.
		graph.subscribeWrite?.({
			graphNodeId: input.computed.graphNodeId,
			settle() {
				const waits = [...state!.nodes.values()].flatMap((node) =>
					[node.loading, node.pending].filter((wait) => wait !== undefined),
				);
				return waits.length ? Promise.all(waits).then(() => undefined) : undefined;
			},
			run() {},
		});
	}
	const { nodes, readers, own, asyncRead } = state;
	const base = { ...input, records: batches.flat() };
	const at = (record: OnReadRecord, derive?: ResumeSymbol) => ({
		...base,
		computed: record,
		derive,
	});
	const track = (node: OnReadNode, loading: Promise<unknown>) =>
		(node.loading = loading.then(
			() => void (node.loading = undefined),
			() => void (node.loading = undefined),
		));
	// Loads the derive symbol without running it.
	const prepare = (node: OnReadNode): Promise<void> | undefined => {
		if (node.loading) return node.loading;
		if (!node.derive) {
			const symbol = input.loadSymbol(node.record.deriveSymbolId);
			if (typeof symbol !== 'function')
				return track(
					node,
					symbol.then((derive) => ((node.derive = derive), pendingRosterResume())),
				);
			node.derive = symbol;
		}
		const roster = pendingRosterResume();
		return roster && track(node, roster);
	};
	const shown = (graphNodeId: string, seen = new Set<string>()): boolean => {
		if (seen.has(graphNodeId)) return false;
		seen.add(graphNodeId);
		if (graph.subscriptionCount!(graphNodeId) > (own.get(graphNodeId) ?? 0)) return true;
		if (asyncRead.has(graphNodeId)) return true;
		for (const reader of readers.get(graphNodeId) ?? []) if (shown(reader, seen)) return true;
		return false;
	};
	const refresh = async (node: OnReadNode) => {
		const version = node.version;
		await prepare(node);
		await refreshSyncComputed(at(node.record, node.derive));
		if (node.version === version) node.stale = false;
	};
	const pull = (node: OnReadNode) => {
		if (!node.stale) return;
		const id = node.record.graphNodeId;
		// A read while the derive settles still answers the held value; the next one derives.
		if (node.pending) return graph.pullBeforeRead!(id, () => pull(node));
		const derived = node.derive && deriveSyncComputedNow(at(node.record), node.derive);
		if (derived === true) node.stale = false;
		else if (derived) {
			const version = node.version;
			// A rejected derive wrote nothing, so the node stays stale for its next read.
			const settled = (fulfilled: boolean) => {
				node.pending = undefined;
				if (fulfilled && node.version === version) node.stale = false;
				else graph.pullBeforeRead!(id, () => pull(node));
			};
			node.pending = derived.then(
				() => settled(true),
				() => settled(false),
			);
		} else {
			// Read before its symbol arrived: a flip reads again once it has, and a shown reader refreshes.
			graph.pullBeforeRead!(id, () => pull(node));
			const cleared = () => void (node.pending = undefined);
			// Held in pending, so a flip settling the write observers waits for this derive too.
			node.pending = Promise.resolve(prepare(node))
				.then(() => (node.stale && shown(id) ? refresh(node) : undefined))
				.then(cleared, cleared);
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
	const fresh: OnReadRecord[] = [];
	for (const batch of batches.slice(state.scanned))
		for (const record of batch) {
			if (record.async === true)
				for (const { graphNodeId } of record.dependencies ?? []) asyncRead.add(graphNodeId);
			else if (
				record.deriveOnRead &&
				record.deriveSymbolId &&
				!nodes.has(record.graphNodeId)
			) {
				const onRead = record as OnReadRecord;
				fresh.push(onRead);
				nodes.set(record.graphNodeId, { record: onRead, stale: false, version: 0 });
				for (const { graphNodeId } of record.dependencies ?? []) {
					readers.set(
						graphNodeId,
						(readers.get(graphNodeId) ?? new Set()).add(record.graphNodeId),
					);
					own.set(graphNodeId, (own.get(graphNodeId) ?? 0) + 1);
				}
			}
		}
	state.scanned = batches.length;
	// No value is served for a computed only other computeds read: it derives at its first read.
	for (const record of fresh.filter(
		(candidate) =>
			candidate.graphNodeId !== input.computed.graphNodeId &&
			graph.read(candidate.graphNodeId, []) === undefined,
	))
		markStale(record.graphNodeId);
	markStale(input.computed.graphNodeId);
	if (shown(input.computed.graphNodeId)) await refresh(nodes.get(input.computed.graphNodeId)!);
}
