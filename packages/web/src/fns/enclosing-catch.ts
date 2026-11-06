import type { ResumeAsyncBoundaryRecord, ResumeDomElement } from '../resume-types.ts';
import type { RuntimeGraph } from '@markless/runtime';

type Range = Pick<ResumeAsyncBoundaryRecord, 'startAnchor' | 'endAnchor'>;
const holds = (range: Range, node: unknown) =>
	(range.startAnchor as unknown as Node).isConnected &&
	!!((range.startAnchor as unknown as Node).compareDocumentPosition(node as Node) & 4) &&
	!!((range.endAnchor as unknown as Node).compareDocumentPosition(node as Node) & 2);

// A handler the compiler could not place, such as a child component's own, rejects into the innermost `@try` around its element whose `@catch` takes handlers.
export function marklessFailEnclosingCatch(
	boundaries: Iterable<ResumeAsyncBoundaryRecord> | undefined,
	graph: Pick<RuntimeGraph, 'read' | 'failHandler'>,
	element: ResumeDomElement,
	error: unknown,
): boolean {
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
	if (!target || !graph.failHandler) return false;
	graph.failHandler(target.runnerGraphNodeId!, error);
	return true;
}
