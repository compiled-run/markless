import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import { boundaryArmRecordSet } from './resume-arm-records.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
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
	// D1 tier 4: update symbols returning armRecords settle through commitArm
	// (range replace + record re-registration) instead of the string path.
	readonly commitArm?: (
		boundary: ResumeAsyncBoundaryRecord,
		update: ArmCommitUpdate,
	) => Promise<void>;
	// CSR mounts render @pending with no settled snapshot: the runner must be
	// demanded at start or the boundary never settles (need 10). SSR-resumed
	// pages hold snapshots and stay lazy (demanded-execution doctrine).
	readonly demandOnStart?: boolean;
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
		if (boundary.updateSymbolId || input.demandOnStart === true) {
			for (const asyncRead of boundary.asyncReads) input.graph.read(asyncRead.graphNodeId, ['status']);
		}
	}
}

export async function settleAsyncBoundaryRange(
	input: Pick<
		Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0],
		'graph' | 'root' | 'loadSymbol' | 'renderBranchHtml' | 'elementHandles' | 'commitArm'
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
	if (input.commitArm) {
		const armRecords = boundaryArmRecordSet(
			(update as { readonly armRecords?: unknown }).armRecords,
		);
		if (armRecords) {
			await input.commitArm(boundary, { html: update.html, armRecords });
			return;
		}
	}
	// Plain .html updates (cheap parts tier) keep the journal string path.
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
