import { marklessCodedError } from '../coded-error.ts';

type ResetGraph = { readonly rerun?: (graphNodeId: string) => boolean | undefined };

/**
 * `reset` from `@catch (error, reset)`: re-runs the failed async values its block reads. Each entry
 * is a value followed by the async values it reads, upstream first, so a re-run input takes the
 * place of the values waiting on it.
 */
export function marklessCatchReset(
	graph: ResetGraph | undefined,
	resets: ReadonlyArray<ReadonlyArray<string>>,
): void {
	if (!graph?.rerun)
		throw marklessCodedError(
			'MarklessCatchResetError',
			'MARKLESS_CATCH_RESET_GRAPH_MISSING',
			'This @catch reset ran without a graph that can re-run async values.',
			{ resets },
		);
	const rerun = new Set<string>();
	for (const [graphNodeId, ...inputs] of resets)
		if (inputs.some((input) => rerun.has(input)) || graph.rerun(graphNodeId))
			rerun.add(graphNodeId!);
}
