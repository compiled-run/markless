import type { RuntimeGraph } from '@markless/runtime';
import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeRuntimeInput,
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
function loadRosterResume(): Promise<RosterResumeModule> | undefined {
	const load = (globalThis as RosterResumeHost).__marklessRosterResume;
	if (!load) return undefined;
	let pending = rosterLoads.get(load);
	if (!pending) {
		pending = load().catch((error: unknown) => {
			rosterLoads.delete(load);
			throw error;
		});
		rosterLoads.set(load, pending);
	}
	return pending;
}

export async function refreshSyncComputed(
	input: {
		readonly computed: ResumeSyncComputedRecord;
		readonly graph: RuntimeGraph;
		readonly root: ResumeDomElement;
		readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
		readonly elementHandles: ElementHandleRegistry;
		readonly records?: ReadonlyArray<
			Omit<ResumeSyncComputedRecord, 'deriveSymbolId'> & {
				readonly async?: boolean;
				readonly deriveSymbolId?: string;
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
				{ ...input, computed: record as ResumeSyncComputedRecord },
				deriving,
			);
	}
	// Spec 03: a sync computed over an unsettled async ancestor stays pending instead of running.
	if (input.records && awaitsAsyncAncestor(input.computed, input.records, input.graph)) return;
	const graph = seedSourceGraph(input.graph, input.computed);
	const roster = await loadRosterResume();
	const result = (await input.loadSymbol(input.computed.deriveSymbolId))({
		graph,
		read: graph.read,
		element: input.root,
		getElementHandle: input.elementHandles.get,
		rosterPosition: roster?.createRosterPositionReader(input),
		rosterCount: roster?.createRosterCountReader(input),
	});
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

// A re-run keeps its prior settled value readable (spec D8), so only a run with no settled value before it has nothing to read.
function hasReadableValue(snapshot: unknown): boolean {
	const { status, value } = (snapshot as { readonly status?: unknown; readonly value?: unknown } | null) ?? {};
	return status === 'fulfilled' || value !== undefined;
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
