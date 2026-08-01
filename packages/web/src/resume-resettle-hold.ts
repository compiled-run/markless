import {
	MARKLESS_PENDING_MIN_VISIBLE_MS,
	settleOrPendingDeadline,
	type PendingTimingClock,
} from './pending-timing.ts';
import type { AsyncBoundarySettleTracker } from './resume-async-wiring.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import type { ResumeAsyncBoundaryRecord } from './resume-types.ts';

// T119/T120 deadline-gated @pending on RE-settles. When a settled boundary's
// async computed re-runs, the boundary holds its prior settled content (the
// pending snapshot retains the prior value); only a refresh still pending at
// the client deadline commits the boundary's @pending arm, which then stays
// visible at least the pending minimum before the settled content commits.
// Lives with the runtime-start wiring because its dependencies do: the
// pending-arm HTML capture (live DOM at mount) and the commitArm primitive.
//
// Ordering without a commit queue: the deadline task raises the tracker's
// commit floor BEFORE re-checking status and committing the pending arm.
// Every settle commit waits the floor out (settleAsyncBoundaryRange), so a
// settle racing the deadline lands strictly AFTER the pending commit — and a
// settle that already reached the graph before the deadline makes the status
// re-check bail (the raised floor then only holds the prior content briefly;
// documented tie-window trade, property-tested).

export type ResettleHold = (boundary: ResumeAsyncBoundaryRecord, snapshot: unknown) => void;

export function createResettleHold(deps: {
	readonly tracker: AsyncBoundarySettleTracker;
	// Whether the client knows this boundary's @pending arm HTML. Boundaries
	// without it (server-settled) never start a deadline race: their slow
	// re-settles keep holding the prior content (recorded gap).
	readonly hasPendingArm: (boundaryId: string) => boolean;
	// Live graph status for the boundary's async read — the deadline task
	// re-checks it so a settle that raced the deadline wins.
	readonly readStatus: (graphNodeId: string) => unknown;
	// Commits the boundary's @pending arm between its anchors.
	readonly commitPendingArm: (boundary: ResumeAsyncBoundaryRecord) => Promise<void>;
	readonly clock?: { readonly wait?: PendingTimingClock['wait'] };
}): ResettleHold {
	// One in-flight refresh hold per boundary: a second refresh while the first
	// is still pending must NOT restart the deadline (content has been stale
	// since the first refresh began — spin-delay/busyDelay semantics).
	const refreshResolvers = new Map<string, () => void>();
	return (boundary, snapshot) => {
		const status = (snapshot as { readonly status?: unknown } | null)?.status;
		if (status === 'fulfilled' || status === 'rejected') {
			refreshResolvers.get(boundary.id)?.();
			refreshResolvers.delete(boundary.id);
			return;
		}
		// Pending over settled content starts the deadline race exactly once;
		// first appearances (no settled content yet) render @pending structurally.
		if (
			!deps.hasPendingArm(boundary.id) ||
			!deps.tracker.hasSettledContent(boundary.id) ||
			refreshResolvers.has(boundary.id)
		) {
			return;
		}
		const settled = new Promise<void>((resolve) => refreshResolvers.set(boundary.id, resolve));
		void (async () => {
			if ((await settleOrPendingDeadline(settled, deps.clock?.wait)) === 'settled') return;
			// Floor first (ordering, see module header), then the status
			// re-check, then the commit. A commit failure rejects unhandled —
			// a broken anchor census must fail loudly (D2), never silently.
			deps.tracker.holdSettleCommitsFor(MARKLESS_PENDING_MIN_VISIBLE_MS);
			if (
				boundary.runnerGraphNodeId === null ||
				deps.readStatus(boundary.runnerGraphNodeId) !== 'pending'
			)
				return;
			await deps.commitPendingArm(boundary);
		})();
	};
}

// Wires the hold for a page's boundaries at runtime start. Boundaries that
// mount showing @pending (CSR mounts, streamed shells, navigation deadline
// swaps) keep that arm's HTML for later deadline commits. Server-settled
// boundaries never shipped their @pending arm to the client; their slow
// re-settles keep holding the prior content (gap: needs a compiler-emitted
// pending renderer). Pages with no capturable pending arm skip the hold.
export function wireResettleHold(input: {
	readonly tracker: AsyncBoundarySettleTracker;
	readonly boundaries: Iterable<ResumeAsyncBoundaryRecord>;
	readonly readStatus: (graphNodeId: string) => unknown;
	readonly commitArm: (
		boundary: ResumeAsyncBoundaryRecord,
		update: ArmCommitUpdate,
	) => Promise<void>;
	readonly hasHtmlRenderer: boolean;
}): ResettleHold | undefined {
	if (!input.hasHtmlRenderer) return undefined;
	const pendingArmHtmlById = new Map<string, string>();
	for (const boundary of input.boundaries) {
		if (!boundary.updateSymbolId || input.tracker.hasSettledContent(boundary.id)) continue;
		const pendingHtml = capturePendingArmHtml(boundary);
		if (pendingHtml !== undefined) pendingArmHtmlById.set(boundary.id, pendingHtml);
	}
	if (pendingArmHtmlById.size === 0) return undefined;
	return createResettleHold({
		tracker: input.tracker,
		hasPendingArm: (boundaryId) => pendingArmHtmlById.has(boundaryId),
		readStatus: input.readStatus,
		commitPendingArm: (boundary) =>
			// The pending arm's own records stay unregistered (plain-host
			// content; matches first-appearance pending behavior).
			input.commitArm(boundary, {
				html: pendingArmHtmlById.get(boundary.id)!,
				armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
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
