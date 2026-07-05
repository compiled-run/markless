import type { DomJournalEntry, DomJournalResult, RuntimeGraph } from '@markless/runtime';
import { RuntimeResumeError } from './inline/resume-errors.ts';
import type { ElementHandleRegistry, ResumeAsyncBoundaryRead, ResumeAsyncBoundaryRecord, ResumeDomComment, ResumeDomElement, ResumeDomNode, ResumeRuntimeInput, ResumeViewRecord } from './resume-types.ts';

export function wireAsyncBoundaries(input: { readonly root: ResumeDomElement; readonly graph: RuntimeGraph; readonly view: ResumeViewRecord; readonly loadSymbol: ResumeRuntimeInput['loadSymbol']; readonly renderBranchHtml?: ResumeRuntimeInput['renderBranchHtml']; readonly elementHandles: ElementHandleRegistry; readonly storeContainerSubscription: (release: () => void) => void }): Map<string, ResumeAsyncBoundaryRecord> {
	const boundaries = materializeAsyncBoundaryLocators(input.root, input.view.asyncBoundaries);
	for (const boundary of boundaries.values()) {
		for (const asyncRead of boundary.asyncReads) input.storeContainerSubscription(input.graph.subscribe({ id: `async-boundary:${boundary.id}:${asyncRead.graphNodeId}:${asyncRead.path.join('.')}`, graphNodeId: asyncRead.graphNodeId, path: [], run(snapshot) {
			return boundary.updateSymbolId ? settleAsyncBoundaryRange(input, boundary, snapshot) : createAsyncBoundaryJournalEntries(boundary, asyncRead, snapshot);
		} }));
		if (boundary.updateSymbolId) for (const asyncRead of boundary.asyncReads) input.graph.read(asyncRead.graphNodeId, ['status']);
	}
	return boundaries;
}
async function settleAsyncBoundaryRange(input: { readonly graph: RuntimeGraph; readonly root: ResumeDomElement; readonly loadSymbol: ResumeRuntimeInput['loadSymbol']; readonly renderBranchHtml?: ResumeRuntimeInput['renderBranchHtml']; readonly elementHandles: ElementHandleRegistry }, boundary: ResumeAsyncBoundaryRecord, snapshot: unknown): Promise<DomJournalResult | void> {
	const status = (snapshot as { readonly status?: unknown } | null)?.status;
	if (status !== 'fulfilled' && status !== 'rejected') return;
	const symbol = await input.loadSymbol(boundary.updateSymbolId!);
	const update = await symbol({ graph: input.graph, status, element: input.root, getElementHandle: input.elementHandles.get, asyncBoundary: boundary });
	if (!isResumeBranchUpdate(update)) return;
	const fragment = input.renderBranchHtml ? input.renderBranchHtml(update.html) : update.html;
	return [{ type: 'removeRange', locator: asyncBoundaryRangeLocator(boundary.id) }, { type: 'insertRange', locator: asyncBoundaryStartLocator(boundary.id), fragment }];
}
export function createAsyncBoundaryJournalEntries(boundary: ResumeAsyncBoundaryRecord, asyncRead: ResumeAsyncBoundaryRead, snapshot: unknown): DomJournalEntry[] {
	return [{ type: 'removeRange', locator: asyncBoundaryRangeLocator(boundary.id) }, { type: 'insertRange', locator: asyncBoundaryStartLocator(boundary.id), fragment: { type: 'async-boundary-snapshot', boundaryId: boundary.id, graphNodeId: asyncRead.graphNodeId, path: asyncRead.path, snapshot } }];
}
export function asyncBoundaryRangeLocator(boundaryId: string): string { return `async-boundary:${boundaryId}`; }
export function asyncBoundaryStartLocator(boundaryId: string): string { return `async-boundary:${boundaryId}:start`; }
function isResumeBranchUpdate(value: unknown): value is { readonly arm: number; readonly html: string } {
	const update = value as { readonly arm?: unknown; readonly html?: unknown } | null;
	return typeof update?.arm === 'number' && typeof update?.html === 'string';
}
function materializeAsyncBoundaryLocators(root: ResumeDomElement, boundaries: ResumeViewRecord['asyncBoundaries']): Map<string, ResumeAsyncBoundaryRecord> {
	const comments = walkComments(root), byId = new Map<string, ResumeAsyncBoundaryRecord>();
	for (const boundary of boundaries) {
		const startAnchor = comments[boundary.startAnchor.index], endAnchor = comments[boundary.endAnchor.index];
		if (!startAnchor) throw missingCommentAnchorError(boundary.id, 'startAnchor', boundary.startAnchor.index);
		if (!endAnchor) throw missingCommentAnchorError(boundary.id, 'endAnchor', boundary.endAnchor.index);
		byId.set(boundary.id, { id: boundary.id, updateSymbolId: boundary.updateSymbolId, startAnchor, endAnchor, asyncReads: boundary.asyncReads });
	}
	return byId;
}
function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	const comments: ResumeDomComment[] = [];
	(function visit(node: ResumeDomNode): void { if (node.nodeType === 8) comments.push(node as ResumeDomComment); for (const child of node.childNodes ?? []) visit(child); })(root);
	return comments;
}
function missingCommentAnchorError(id: string, name: 'startAnchor' | 'endAnchor', index: number): RuntimeResumeError {
	return new RuntimeResumeError({ code: 'MARKLESS_RESUME_LOCATOR_MISSING', message: `Resume locator ${id} ${name} expected a comment at DOM order index ${String(index)}.`, docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING' });
}
