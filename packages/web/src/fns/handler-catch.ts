import type { ResumeDomElement, ResumeSymbolContext } from '../resume-types.ts';
import { marklessNearerCatch } from './enclosing-catch.ts';

type HandlerCatchContext = {
	readonly graph?: {
		readonly failHandler?: (graphNodeId: string, error: unknown) => void;
		readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
	};
	readonly element?: ResumeDomElement;
	readonly catchScope?: ResumeSymbolContext['catchScope'];
};

// An async handler rejected inside a `@try`: its boundary's own gate fails the way a refresh would, so `@catch` renders after the kept content.
export function marklessHandlerCatch(
	context: HandlerCatchContext | undefined,
	runnerGraphNodeId: string,
	error: unknown,
): void {
	const graph = context?.graph;
	if (!context || !graph?.failHandler) return;
	const qualify = graph.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	const own = qualify(runnerGraphNodeId);
	graph.failHandler(
		(context.catchScope &&
			marklessNearerCatch(
				context.catchScope.boundaries(),
				context.catchScope.graph,
				context.element,
				own,
			)) ??
			own,
		error,
	);
}

// A plain handler's returned promise: its rejection renders in the nearest `@catch` too.
export function marklessHandlerCatchReturned<T>(
	context: HandlerCatchContext | undefined,
	runnerGraphNodeId: string,
	value: T,
): T | Promise<unknown> {
	if (typeof (value as { readonly then?: unknown } | null)?.then !== 'function') return value;
	return Promise.resolve(value).catch((error: unknown) =>
		marklessHandlerCatch(context, runnerGraphNodeId, error),
	);
}
