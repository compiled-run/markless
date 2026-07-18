import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import type { ProtocolStatePayload } from '@markless/serializer';
import { boundaryArmRecordSet } from './resume-arm-records.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import type {
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumePreparedCore,
	ResumeRuntimeInput,
} from './resume-types.ts';

// Spec D8 + T119 ruling (12-arm-rendering): pending UI is DEADLINE-GATED
// everywhere — first appearances render @pending structurally, navigations
// hold the outgoing page, and RE-settles hold the prior settled content until
// the client deadline (resume-resettle-hold.ts), then commit the boundary's
// @pending arm with a minimum visible duration. This tracker is the settle
// path's synchronous bookkeeping core:
// - which boundaries currently render SETTLED content, so a re-run of their
//   async computed keeps the prior snapshot instead of flashing @pending
// - a promise that resolves once every tracked boundary settled (the router
//   races it against the navigation deadline before committing a swap)
// - a commit floor: once pending UI became visible (deadline swap OR deadline
//   re-settle), settle commits wait out the minimum-visibility window. The
//   re-settle hold raises the floor BEFORE its pending-arm commit, so a
//   racing settle commit always waits it out — one ordering mechanism.
export type AsyncBoundarySettleTracker = {
	readonly hasSettledContent: (boundaryId: string) => boolean;
	readonly markSettled: (boundaryId: string) => void;
	readonly whenAllSettled: () => Promise<void>;
	readonly holdSettleCommitsFor: (minVisibleMs: number) => void;
	// Waits out the active commit floor; resolves true iff it actually waited
	// (callers then re-check for a superseding newer run before committing).
	readonly waitOutCommitHold: () => Promise<boolean>;
};

// Injectable so the D8 hold/min-duration semantics are property-tested under
// a fake clock; production defaults to Date.now/setTimeout.
export type SettleTrackerClock = {
	readonly now?: () => number;
	readonly wait?: (durationMs: number) => Promise<void>;
};

// An async snapshot only commits once its runner settled either way.
function isSettledStatus(status: unknown): boolean {
	return status === 'fulfilled' || status === 'rejected';
}

export function createAsyncBoundarySettleTracker(input: {
	readonly boundaries: Iterable<ResumeAsyncBoundaryRecord>;
	readonly state?: ProtocolStatePayload;
	readonly clock?: SettleTrackerClock;
}): AsyncBoundarySettleTracker {
	const now = input.clock?.now ?? Date.now;
	// SSR-resumed pages arrive with settled snapshots in the state payload;
	// their boundaries already show settled content before any runner re-runs.
	const settledGraphNodeIds = new Set<string>();
	const syncGraphNodeIds = new Set<string>();
	for (const computed of input.state?.computed ?? []) {
		if (computed.async === false) syncGraphNodeIds.add(computed.graphNodeId);
		if (isSettledStatus(computed.snapshot?.status)) {
			settledGraphNodeIds.add(computed.graphNodeId);
		}
	}
	const settledById = new Map<string, boolean>();
	for (const boundary of input.boundaries) {
		settledById.set(
			boundary.id,
			boundary.asyncReads.length > 0 &&
				boundary.asyncReads.every(
					(read) =>
						syncGraphNodeIds.has(read.graphNodeId) ||
						settledGraphNodeIds.has(read.graphNodeId),
				),
		);
	}
	let commitFloor = 0;
	let allSettled: Promise<void> | undefined;
	let resolveAllSettled = () => {};
	const isAllSettled = () => [...settledById.values()].every(Boolean);
	return {
		hasSettledContent: (boundaryId) => settledById.get(boundaryId) === true,
		markSettled(boundaryId) {
			if (settledById.get(boundaryId) !== false) return;
			settledById.set(boundaryId, true);
			if (isAllSettled()) resolveAllSettled();
		},
		whenAllSettled() {
			if (isAllSettled()) return Promise.resolve();
			allSettled ??= new Promise((resolve) => {
				resolveAllSettled = resolve;
			});
			return allSettled;
		},
		holdSettleCommitsFor(minVisibleMs) {
			commitFloor = Math.max(commitFloor, now() + minVisibleMs);
		},
		async waitOutCommitHold() {
			const holdMs = commitFloor - now();
			if (holdMs <= 0) return false;
			await (input.clock?.wait?.(holdMs) ??
				new Promise((resolve) => setTimeout(resolve, holdMs)));
			return true;
		},
	};
}

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
	// D8 settled-content tracking + navigation transitions (T110) + the
	// commit floor the re-settle hold raises (T120).
	readonly settleTracker?: AsyncBoundarySettleTracker;
	// T120: the re-settle hold (resume-resettle-hold.ts) observes every
	// snapshot of an update-symbol boundary to deadline-gate @pending.
	readonly onAsyncSnapshot?: (boundary: ResumeAsyncBoundaryRecord, snapshot: unknown) => void;
}): void {
	for (const boundary of input.asyncBoundariesById.values()) {
		for (const asyncRead of boundary.asyncReads) {
			input.storeContainerSubscription(
				input.graph.subscribe({
					id: `async-boundary:${boundary.id}:${asyncRead.graphNodeId}:${asyncRead.path.join('.')}`,
					graphNodeId: asyncRead.graphNodeId,
					path: [],
					run(snapshot) {
						snapshot = boundaryGateSnapshot(
							input.graph,
							boundary,
							asyncRead.graphNodeId,
							snapshot,
						);
						if (!boundary.updateSymbolId) {
							const settled = isSettledStatus(
								(snapshot as { readonly status?: unknown } | null)?.status,
							);
							// D8: once the range shows settled content, a re-run
							// keeps rendering the prior snapshot — the structural
							// pending journal never replaces visible content.
							if (!settled && input.settleTracker?.hasSettledContent(boundary.id)) {
								return;
							}
							if (settled) input.settleTracker?.markSettled(boundary.id);
							return boundaryRangeJournal(boundary.id, {
								type: 'async-boundary-snapshot',
								boundaryId: boundary.id,
								graphNodeId: asyncRead.graphNodeId,
								path: asyncRead.path,
								snapshot,
							});
						}
						// T120: report the snapshot to the re-settle hold (deadline-
						// gated @pending), then settle through the shared path.
						input.onAsyncSnapshot?.(boundary, snapshot);
						return settleAsyncBoundaryRange(input, boundary, snapshot);
					},
				}),
			);
		}
		if (boundary.updateSymbolId || input.demandOnStart === true) {
			for (const asyncRead of boundary.asyncReads)
				input.graph.read(asyncRead.graphNodeId, ['status']);
		}
	}
}

function boundaryGateSnapshot(
	graph: Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0]['graph'],
	boundary: ResumeAsyncBoundaryRecord,
	observedGraphNodeId: string,
	observedSnapshot: unknown,
): unknown {
	let fulfilled: unknown = observedSnapshot;
	const observedStatus = (observedSnapshot as { readonly status?: unknown } | null)?.status;
	let pending: unknown =
		observedStatus === 'pending' || observedStatus === 'idle' ? observedSnapshot : undefined;
	let blocked = pending !== undefined;
	for (const read of boundary.asyncReads) {
		const snapshot = (
			read.graphNodeId === observedGraphNodeId
				? observedSnapshot
				: graph.read(read.graphNodeId, [])
		) as {
			readonly status?: unknown;
			readonly error?: unknown;
			readonly value?: unknown;
		} | null;
		if (snapshot?.status === 'rejected') {
			return { status: 'rejected', error: snapshot.error };
		}
		if (snapshot?.status === 'fulfilled') fulfilled = snapshot;
		else if (snapshot?.status === 'pending' || snapshot?.status === 'idle') {
			blocked = true;
			pending ??= snapshot;
		} else if (snapshot === undefined) {
			blocked = true;
		}
	}
	return blocked ? (pending ?? { status: 'pending' }) : fulfilled;
}

export async function settleAsyncBoundaryRange(
	input: Pick<
		Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0],
		| 'graph'
		| 'root'
		| 'loadSymbol'
		| 'renderBranchHtml'
		| 'elementHandles'
		| 'commitArm'
		| 'settleTracker'
	>,
	boundary: ResumeAsyncBoundaryRecord,
	snapshot: unknown,
): Promise<DomJournalResult | void> {
	const status = (snapshot as { readonly status?: unknown } | null)?.status;
	if (!isSettledStatus(status)) return;
	// D8 minimum pending visibility: once the @pending arm was shown (deadline
	// route swap or deadline re-settle), the settle commit waits until the
	// pending UI was visible for the minimum duration (no blink). The re-settle
	// hold raises the floor BEFORE its pending commit, so this wait also
	// orders settle commits behind an in-flight pending-arm commit.
	if ((await input.settleTracker?.waitOutCommitHold()) === true) {
		const read = boundary.asyncReads[0];
		// A newer run superseded this settle while it waited; its own settle
		// subscription commits the fresher snapshot.
		if (read && input.graph.read(read.graphNodeId, ['status']) !== status) return;
	}
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
			await input.commitArm(boundary, {
				html: update.html,
				armRecords: composedBoundaryArmRecords(boundary.id, armRecords),
			});
			input.settleTracker?.markSettled(boundary.id);
			return;
		}
	}
	// Plain .html updates (cheap parts tier) keep the journal string path.
	const fragment = input.renderBranchHtml ? input.renderBranchHtml(update.html) : update.html;
	input.settleTracker?.markSettled(boundary.id);
	return boundaryRangeJournal(boundary.id, fragment);
}

// The settle commit shape shared by the snapshot and html paths: replace the
// boundary's anchor range with the settled fragment.
function boundaryRangeJournal(boundaryId: string, fragment: unknown): DomJournalEntry[] {
	return [
		{ type: 'removeRange', locator: `async-boundary:${boundaryId}` },
		{ type: 'insertRange', locator: `async-boundary:${boundaryId}:start`, fragment },
	] as DomJournalEntry[];
}

// Composed child-owned boundaries load their update symbol through the
// instance prefix riding boundary.id (c0:boundary:1 → prefix "c0:"). The
// arm-render module mints records in the child module's own id space, so
// committed host, symbol, and arm-branch ids take the same prefix before
// registration — host ids join the page-wide host map and symbol ids resolve
// through the same prefix routes the update symbol itself resolved through.
// Graph node ids stay untouched: composed pages share one name-based graph.
function composedBoundaryArmRecords(
	boundaryId: string,
	set: ResumeArmRecordSet,
): ResumeArmRecordSet {
	const prefix = boundaryId.slice(0, boundaryId.lastIndexOf('boundary:'));
	if (!prefix) return set;
	const prefixHost = <T extends { readonly hostNodeId: string }>(record: T): T => ({
		...record,
		hostNodeId: prefix + record.hostNodeId,
	});
	return {
		locators: set.locators.map(prefixHost),
		events: set.events.map((event) => ({
			...prefixHost(event),
			symbolIds: event.symbolIds.map((symbolId) => prefix + symbolId),
		})),
		behaviors: set.behaviors.map((behavior) => ({
			...prefixHost(behavior),
			...(behavior.symbolId ? { symbolId: prefix + behavior.symbolId } : {}),
		})),
		elementHandles: set.elementHandles.map(prefixHost),
		...(set.branches
			? {
					branches: set.branches.map((branch) => ({
						...branch,
						id: prefix + branch.id,
						...(branch.symbolId ? { symbolId: prefix + branch.symbolId } : {}),
						...(branch.armRecords
							? {
									armRecords: branch.armRecords.map((arm) => ({
										...arm,
										events: (arm.events ?? []).map((event) => ({
											...event,
											symbolIds: (event.symbolIds ?? []).map(
												(symbolId) => prefix + symbolId,
											),
										})),
									})),
								}
							: {}),
					})),
				}
			: {}),
	};
}

function isResumeBranchUpdate(
	value: unknown,
): value is { readonly arm: number; readonly html: string } {
	const update = value as { readonly arm?: unknown; readonly html?: unknown } | null;
	return typeof update?.arm === 'number' && typeof update?.html === 'string';
}
