import { marklessCodedError } from '../coded-error.ts';

type ResetGraph = {
	readonly asyncPlane?: () => { readonly rerun: (graphNodeId: string) => boolean } | undefined;
	readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
};

/** `reset` from `@catch (error, reset)`: re-runs the block's failed async values, each followed by the values it reads. */
export function marklessCatchReset(
	graph: ResetGraph | undefined,
	resets: ReadonlyArray<ReadonlyArray<string>>,
): void {
	if (!graph?.asyncPlane)
		throw marklessCodedError(
			'MarklessCatchResetError',
			'MARKLESS_CATCH_RESET_GRAPH_MISSING',
			'This @catch reset ran without a graph that can re-run async values.',
			{ resets },
		);
	const rerun = new Set<string>();
	// A component's graph reads in its own ids; rerun is the page graph's, so the ids are qualified here.
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const [graphNodeId, ...inputs] of resets)
		if (inputs.some((input) => rerun.has(input)) || graph.asyncPlane()?.rerun(qualify(graphNodeId!)))
			rerun.add(graphNodeId!);
}
