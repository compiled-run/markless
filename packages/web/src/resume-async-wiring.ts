import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import type {
	ResumeAsyncBoundaryRecord,
	ResumePreparedCore,
	ResumeRuntimeInput,
} from './resume-types.ts';

export function wireAsyncBoundariesWithoutLoadingCapability(input: {
	readonly asyncBoundariesById: ReadonlyMap<string, ResumeAsyncBoundaryRecord>;
	readonly graph: ResumeRuntimeInput['graph'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly renderBranchHtml: ResumeRuntimeInput['renderBranchHtml'];
	readonly elementHandles: ResumePreparedCore['elementHandles'];
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	for (const boundary of input.asyncBoundariesById.values()) {
		for (const asyncRead of boundary.asyncReads) {
			input.storeContainerSubscription(
				input.graph.subscribe({
					id: `async-boundary:${boundary.id}:${asyncRead.graphNodeId}:${asyncRead.path.join('.')}`,
					graphNodeId: asyncRead.graphNodeId,
					path: [],
					run(snapshot) {
						if (!boundary.updateSymbolId) {
							return [
								{ type: 'removeRange', locator: `async-boundary:${boundary.id}` },
								{
									type: 'insertRange',
									locator: `async-boundary:${boundary.id}:start`,
									fragment: {
										type: 'async-boundary-snapshot',
										boundaryId: boundary.id,
										graphNodeId: asyncRead.graphNodeId,
										path: asyncRead.path,
										snapshot,
									},
								},
							] as DomJournalEntry[];
						}
						return settleAsyncBoundaryRange(input, boundary, snapshot);
					},
				}),
			);
		}
		if (boundary.updateSymbolId) {
			for (const asyncRead of boundary.asyncReads) input.graph.read(asyncRead.graphNodeId, ['status']);
		}
	}
}

export async function settleAsyncBoundaryRange(
	input: Pick<
		Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0],
		'graph' | 'root' | 'loadSymbol' | 'renderBranchHtml' | 'elementHandles'
	>,
	boundary: ResumeAsyncBoundaryRecord,
	snapshot: unknown,
): Promise<DomJournalResult | void> {
	const status = (snapshot as { readonly status?: unknown } | null)?.status;
	if (status !== 'fulfilled' && status !== 'rejected') return;
	const symbol = await input.loadSymbol(boundary.updateSymbolId!);
	const update = await symbol({
		graph: input.graph,
		status,
		element: input.root,
		getElementHandle: input.elementHandles.get,
		asyncBoundary: boundary,
	});
	if (!isResumeBranchUpdate(update)) return;
	const fragment = input.renderBranchHtml ? input.renderBranchHtml(update.html) : update.html;
	return [
		{ type: 'removeRange', locator: `async-boundary:${boundary.id}` },
		{ type: 'insertRange', locator: `async-boundary:${boundary.id}:start`, fragment },
	];
}

function isResumeBranchUpdate(value: unknown): value is { readonly arm: number; readonly html: string } {
	const update = value as { readonly arm?: unknown; readonly html?: unknown } | null;
	return typeof update?.arm === 'number' && typeof update?.html === 'string';
}
