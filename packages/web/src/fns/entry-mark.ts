import type { RuntimeGraph } from '@markless/runtime';

type EntryMarkContext = { readonly graph?: RuntimeGraph };
type ScopedGraph = RuntimeGraph & {
	readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
};

/** Marks each async value busy from the handler's entry, ahead of the write that refreshes it. */
export function marklessEntryMarkStart(
	context: EntryMarkContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph as ScopedGraph | undefined;
	if (!graph?.markEntry) return;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) graph.markEntry(qualify(graphNodeId));
}

/** Undoes `marklessEntryMarkStart` when the handler never reached the write; a no-op once the real refresh has started. */
export function marklessEntryMarkEnd(
	context: EntryMarkContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph as ScopedGraph | undefined;
	if (!graph?.endEntry) return;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) graph.endEntry(qualify(graphNodeId));
}
