type HandlerCatchGraph = {
	readonly failHandler?: (graphNodeId: string, error: unknown) => void;
	readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
};

// An async handler rejected inside a `@try`: its boundary's own gate fails the way a refresh would, so `@catch` renders after the kept content.
export function marklessHandlerCatch(
	graph: HandlerCatchGraph | undefined,
	runnerGraphNodeId: string,
	error: unknown,
): void {
	if (!graph?.failHandler) return;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	graph.failHandler(qualify(runnerGraphNodeId), error);
}
