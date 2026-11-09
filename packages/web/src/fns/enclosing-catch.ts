import type { ResumeAsyncBoundaryRecord, ResumeDomElement } from '../resume-types.ts';
import type { RuntimeGraph } from '@markless/runtime';

type Range = Pick<ResumeAsyncBoundaryRecord, 'startAnchor' | 'endAnchor'>;
const holds = (range: Range, node: unknown) =>
	(range.startAnchor as unknown as Node).isConnected &&
	!!((range.startAnchor as unknown as Node).compareDocumentPosition(node as Node) & 4) &&
	!!((range.endAnchor as unknown as Node).compareDocumentPosition(node as Node) & 2);

// The innermost `@try` around the element whose `@catch` takes handlers and is not already showing.
export function marklessInnermostCatch(
	boundaries: Iterable<ResumeAsyncBoundaryRecord> | undefined,
	graph: Pick<RuntimeGraph, 'read'>,
	element: ResumeDomElement,
): ResumeAsyncBoundaryRecord | undefined {
	let target: ResumeAsyncBoundaryRecord | undefined;
	for (const boundary of boundaries ?? [])
		if (
			boundary.catchesHandlers &&
			boundary.runnerGraphNodeId &&
			holds(boundary, element) &&
			// A @catch already showing: its own content's handlers belong to the next one out.
			graph.read(boundary.runnerGraphNodeId, ['status']) !== 'rejected' &&
			(!target || holds(target, boundary.startAnchor))
		)
			target = boundary;
	return target;
}

// The compiler's choice is the nearest `@catch` in the handler's own markup; one the element renders inside, deeper in a child, is nearer.
export function marklessNearerCatch(
	boundaries: Iterable<ResumeAsyncBoundaryRecord> | undefined,
	graph: Pick<RuntimeGraph, 'read'>,
	element: ResumeDomElement | undefined,
	runnerGraphNodeId: string,
): string | undefined {
	if (!element) return undefined;
	const list = [...(boundaries ?? [])];
	const own = list.find((boundary) => boundary.runnerGraphNodeId === runnerGraphNodeId);
	const target = marklessInnermostCatch(list, graph, element);
	return own && target && target !== own && holds(own, target.startAnchor)
		? target.runnerGraphNodeId!
		: undefined;
}

// A handler the compiler could not place, such as a child component's own, rejects into the innermost `@try` around its element whose `@catch` takes handlers.
export function marklessFailEnclosingCatch(
	boundaries: Iterable<ResumeAsyncBoundaryRecord> | undefined,
	graph: Pick<RuntimeGraph, 'read' | 'asyncPlane'>,
	element: ResumeDomElement,
	error: unknown,
): boolean {
	const target = marklessInnermostCatch(boundaries, graph, element);
	const plane = graph.asyncPlane?.();
	if (!target || !plane) return false;
	plane.failHandler(target.runnerGraphNodeId!, error);
	return true;
}
