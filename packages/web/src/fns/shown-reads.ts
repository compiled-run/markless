import type { RuntimeGraph } from '@markless/runtime';

type ShownReadsContext = { readonly graph?: RuntimeGraph };
type ScopedGraph = RuntimeGraph & {
	readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
};

/** A handler reads the inputs paired with a refreshing value as the screen shows them. */
export function marklessShownReads<T extends ShownReadsContext>(
	context: T,
	reads: ReadonlyArray<{ readonly graphNodeId: string; readonly path: ReadonlyArray<string> }>,
): T {
	const graph = context.graph as ScopedGraph | undefined;
	if (!graph?.shownRead) return context;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	const shown = graph.shownRead(
		reads.map((read) => ({ graphNodeId: qualify(read.graphNodeId), path: read.path })),
	);
	if (!shown) return context;
	const read: RuntimeGraph['read'] = (graphNodeId, path) => shown(qualify(graphNodeId), path);
	return { ...context, graph: Object.assign(Object.create(graph) as RuntimeGraph, { read }) };
}
