import { marklessCodedError } from '../coded-error.ts';

type ResetGraph = { readonly retry?: (graphNodeId: string) => boolean };

/** `reset` from `@catch (error, reset)`: re-runs the failed async values its block reads. */
export function marklessCatchReset(
	graph: ResetGraph | undefined,
	graphNodeIds: ReadonlyArray<string>,
): void {
	if (!graph?.retry)
		throw marklessCodedError(
			'MarklessCatchResetError',
			'MARKLESS_CATCH_RESET_GRAPH_MISSING',
			'This @catch reset ran without a graph that can re-run async values.',
			{ graphNodeIds },
		);
	for (const graphNodeId of graphNodeIds) graph.retry(graphNodeId);
}
