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
type RosterResumeHost = {
	readonly __marklessRosterResume?: () => Promise<typeof import('./fns/roster-resume.ts')>;
};

export async function refreshSyncComputed(input: {
	readonly computed: ResumeSyncComputedRecord;
	readonly graph: RuntimeGraph;
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementHandles: ElementHandleRegistry;
}): Promise<void> {
	const graph = seedSourceGraph(input.graph, input.computed);
	const roster = await (globalThis as RosterResumeHost).__marklessRosterResume?.();
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
