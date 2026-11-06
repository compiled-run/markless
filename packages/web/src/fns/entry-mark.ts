import type { RuntimeGraph } from '@markless/runtime';
import { marklessUserActionIsLive, type UserActionContext } from './user-action.ts';

type ScopedGraph = RuntimeGraph & {
	readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
};

/** A handler writing an input of a visible async value's key marks it busy from the moment it starts, not from the write (submit-quiet-design.md Q1 option 1); only inside a user action, since that mark is always shown loud. */
export function marklessEntryMarkStart(
	context: UserActionContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph as ScopedGraph | undefined;
	if (!graph?.markEntry || !marklessUserActionIsLive(context)) return;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) graph.markEntry(qualify(graphNodeId));
}

/** Undoes `marklessEntryMarkStart` when the handler never reached the write; a no-op once the real refresh has started. */
export function marklessEntryMarkEnd(
	context: UserActionContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph as ScopedGraph | undefined;
	if (!graph?.endEntry || !marklessUserActionIsLive(context)) return;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) graph.endEntry(qualify(graphNodeId));
}
