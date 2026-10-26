import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import {
	MARKLESS_PENDING_MIN_VISIBLE_MS,
	MARKLESS_PENDING_REFRESH_STALL_MS,
	waitMs,
	type PendingTimingClock,
} from './pending-timing.ts';
import type { AsyncBoundarySettleTracker } from './resume-async-wiring.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import { setBoundaryBusy } from './resume-refresh-busy.ts';
import type { ResumeAsyncBoundaryRecord } from './resume-types.ts';

// Spec D8 re-settle: a refresh over settled content keeps that content with
// its host marked aria-busy; only a newest run still pending after the stall
// threshold commits the @pending arm. The stall task raises the tracker's
// commit floor BEFORE re-checking status and committing, so a settle racing
// it lands strictly after the pending commit. The settle path clears busy.

export type ResettleHold = (boundary: ResumeAsyncBoundaryRecord, snapshot: unknown) => void;

type Stall = { readonly version: unknown; readonly epoch: object; fallback: boolean };

export function createResettleHold(deps: {
	readonly tracker: AsyncBoundarySettleTracker;
	// Server-settled boundaries never shipped their @pending arm, so they get busy marking without a fallback.
	readonly hasPendingArm: (boundaryId: string) => boolean;
	readonly readStatus: (graphNodeId: string) => unknown;
	readonly commitPendingArm: (boundary: ResumeAsyncBoundaryRecord) => Promise<void>;
	readonly setBusy?: (boundary: ResumeAsyncBoundaryRecord, busy: boolean) => void;
	readonly clock?: { readonly wait?: PendingTimingClock['wait'] };
}): ResettleHold {
	const stalls = new Map<string, Stall>();
	const setBusy = deps.setBusy ?? setBoundaryBusy;
	const wait = deps.clock?.wait ?? waitMs;
	return (boundary, snapshot) => {
		const { status, version } =
			(snapshot as { readonly status?: unknown; readonly version?: unknown } | null) ?? {};
		if (status === 'fulfilled' || status === 'rejected') {
			stalls.delete(boundary.id);
			return;
		}
		if (!deps.tracker.hasSettledContent(boundary.id)) return;
		const prior = stalls.get(boundary.id);
		if (prior && Object.is(prior.version, version)) return;
		setBusy(boundary, true);
		const stall: Stall = { version, epoch: {}, fallback: prior?.fallback === true };
		stalls.set(boundary.id, stall);
		if (stall.fallback || !deps.hasPendingArm(boundary.id)) return;
		void (async () => {
			await wait(MARKLESS_PENDING_REFRESH_STALL_MS);
			if (stalls.get(boundary.id)?.epoch !== stall.epoch) return;
			deps.tracker.holdSettleCommitsFor(MARKLESS_PENDING_MIN_VISIBLE_MS);
			if (
				boundary.runnerGraphNodeId === null ||
				deps.readStatus(boundary.runnerGraphNodeId) !== 'pending'
			)
				return;
			stall.fallback = true;
			// A commit failure rejects unhandled: a broken anchor census must fail loudly (D2).
			await deps.commitPendingArm(boundary);
			if (stalls.get(boundary.id) === stall) setBusy(boundary, true);
		})();
	};
}

// Boundaries that mount showing @pending (CSR mounts, streamed shells,
// navigation deadline swaps) keep that arm's HTML for a later stall fallback.
export function wireResettleHold(input: {
	readonly tracker: AsyncBoundarySettleTracker;
	readonly boundaries: Iterable<ResumeAsyncBoundaryRecord>;
	readonly readStatus: (graphNodeId: string) => unknown;
	readonly commitArm: (
		boundary: ResumeAsyncBoundaryRecord,
		update: ArmCommitUpdate,
	) => Promise<void>;
	readonly hasHtmlRenderer: boolean;
}): ResettleHold {
	const pendingArmHtmlById = new Map<string, string>();
	for (const boundary of input.hasHtmlRenderer ? input.boundaries : []) {
		if (!boundary.updateSymbolId || input.tracker.hasSettledContent(boundary.id)) continue;
		const pendingHtml = capturePendingArmHtml(boundary);
		if (pendingHtml !== undefined) pendingArmHtmlById.set(boundary.id, pendingHtml);
	}
	return createResettleHold({
		tracker: input.tracker,
		hasPendingArm: (boundaryId) => pendingArmHtmlById.has(boundaryId),
		readStatus: input.readStatus,
		commitPendingArm: (boundary) =>
			input.commitArm(boundary, {
				html: pendingArmHtmlById.get(boundary.id)!,
				armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
				arm: ASYNC_BOUNDARY_ARM.pending,
			}),
	});
}

// Serialize the live DOM between a boundary's anchors — the @pending arm at
// mount time. Pending arms are plain hosts (elements/text only, plan-gated);
// anything else fails the capture closed and the re-settle keeps holding.
function capturePendingArmHtml(boundary: ResumeAsyncBoundaryRecord): string | undefined {
	const start = boundary.startAnchor as {
		readonly parentNode?: { readonly childNodes: ArrayLike<unknown> } | null;
	};
	const siblings = Array.from(start.parentNode?.childNodes ?? []) as Array<{
		readonly nodeType?: number;
		readonly outerHTML?: string;
		readonly textContent?: string | null;
	}>;
	const startIndex = siblings.indexOf(boundary.startAnchor as never);
	const endIndex = siblings.indexOf(boundary.endAnchor as never);
	if (startIndex === -1 || endIndex <= startIndex) return;
	let html = '';
	for (const node of siblings.slice(startIndex + 1, endIndex)) {
		if (node.nodeType === 1 && typeof node.outerHTML === 'string') html += node.outerHTML;
		else if (node.nodeType === 3 && typeof node.textContent === 'string') {
			html += node.textContent
				.replaceAll('&', '&amp;')
				.replaceAll('<', '&lt;')
				.replaceAll('>', '&gt;');
		} else return;
	}
	return html;
}
