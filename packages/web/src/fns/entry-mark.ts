import type { RuntimeGraph } from '@markless/runtime';

type EntryMarkContext = {
	readonly graph?: RuntimeGraph & {
		readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
	};
	readonly userActionToken?: { readonly open: boolean };
};

// The end undoes what the start did, even when the token closed in between.
const opened = new WeakSet<object>();

/** Marks each async value busy from the handler's entry, ahead of the write that refreshes it; only inside a user action. */
export function marklessEntryMarkStart(
	context: EntryMarkContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph;
	if (!graph?.markEntry || context.userActionToken?.open !== true) return;
	opened.add(context);
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) graph.markEntry(qualify(graphNodeId));
}

/** Undoes `marklessEntryMarkStart` when the handler never reached the write; a no-op once the real refresh has started. */
export function marklessEntryMarkEnd(
	context: EntryMarkContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph;
	if (!graph?.endEntry || !opened.delete(context)) return;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) graph.endEntry(qualify(graphNodeId));
}
