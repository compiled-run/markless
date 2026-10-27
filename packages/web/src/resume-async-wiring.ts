import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import {
	boundaryArmRecordSet,
	composedArmRecordQualifier,
	composedBoundaryGraph,
} from './resume-arm-records.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import { setBoundaryBusy } from './resume-refresh-busy.ts';
import type {
	ResumeAsyncBoundaryRecord,
	ResumePreparedCore,
	ResumeRuntimeInput,
} from './resume-types.ts';

// Spec D8 (12-arm-rendering): first appearances render @pending structurally,
// navigations hold the outgoing page, and RE-settles hold the prior settled
// content busy until it commits or stalls (resume-resettle-hold.ts). This
// tracker is the settle path's synchronous bookkeeping core:
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
	readonly track: (boundary: ResumeAsyncBoundaryRecord) => void;
	readonly forget: (boundaryId: string) => void;
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
function isSettledStatus(status: unknown): status is 'fulfilled' | 'rejected' {
	return status === 'fulfilled' || status === 'rejected';
}

export function createAsyncBoundarySettleTracker(input: {
	readonly boundaries: Iterable<ResumeAsyncBoundaryRecord>;
	readonly clock?: SettleTrackerClock;
}): AsyncBoundarySettleTracker {
	const now = input.clock?.now ?? Date.now;
	const settledById = new Map<string, boolean>();
	const track = (boundary: ResumeAsyncBoundaryRecord) =>
		void settledById.set(
			boundary.id,
			boundary.initiallyServedArm === ASYNC_BOUNDARY_ARM.try ||
				boundary.initiallyServedArm === ASYNC_BOUNDARY_ARM.catch,
		);
	for (const boundary of input.boundaries) track(boundary);
	let commitFloor = 0;
	let allSettled: Promise<void> | undefined;
	let resolveAllSettled = () => {};
	const isAllSettled = () => [...settledById.values()].every(Boolean);
	const announceIfAllSettled = () => {
		if (!isAllSettled()) return;
		resolveAllSettled();
		allSettled = undefined;
	};
	return {
		hasSettledContent: (boundaryId) => settledById.get(boundaryId) === true,
		markSettled(boundaryId) {
			if (settledById.get(boundaryId) !== false) return;
			settledById.set(boundaryId, true);
			announceIfAllSettled();
		},
		track,
		forget(boundaryId) {
			settledById.delete(boundaryId);
			announceIfAllSettled();
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

export type AsyncBoundaryWiring = {
	// A boundary an arm commit rendered: rewires it against its fresh anchors.
	readonly add: (boundary: ResumeAsyncBoundaryRecord) => void;
};

export function wireAsyncBoundariesWithoutLoadingCapability(input: {
	readonly asyncBoundariesById: Map<string, ResumeAsyncBoundaryRecord>;
	readonly graph: ResumeRuntimeInput['graph'];
	readonly root: ResumeRuntimeInput['root'];
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly renderBranchHtml: ResumeRuntimeInput['renderBranchHtml'];
	readonly renderAsyncBoundary?: ResumeRuntimeInput['renderAsyncBoundary'];
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
	// The re-settle hold (resume-resettle-hold.ts) observes every snapshot of an update-symbol boundary.
	readonly onAsyncSnapshot?: (boundary: ResumeAsyncBoundaryRecord, snapshot: unknown) => void;
}): AsyncBoundaryWiring {
	const releasesById = new Map<string, Array<() => void>>();
	const release = (boundaryId: string) => {
		for (const done of releasesById.get(boundaryId) ?? []) done();
		releasesById.delete(boundaryId);
	};
	let disposed = false;
	input.storeContainerSubscription(() => {
		disposed = true;
		for (const boundaryId of releasesById.keys()) release(boundaryId);
	});
	const wire = (boundary: ResumeAsyncBoundaryRecord, demand: boolean, catchUp: boolean) => {
		if (disposed) return;
		const releases: Array<() => void> = [];
		releasesById.set(boundary.id, releases);
		for (const asyncRead of boundary.asyncReads) {
			const subscribed = input.graph.subscribe({
				id: `async-boundary:${boundary.id}:${asyncRead.graphNodeId}:${asyncRead.path.join('.')}`,
				graphNodeId: asyncRead.graphNodeId,
				path: [],
				run(snapshot) {
					// A boundary whose range an outer commit replaced has nothing left to settle.
					if (detached(input.root, boundary.startAnchor)) {
						if (input.asyncBoundariesById.get(boundary.id) !== boundary) return;
						input.asyncBoundariesById.delete(boundary.id);
						input.settleTracker?.forget(boundary.id);
						return release(boundary.id);
					}
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
						// Once the range shows settled content, a re-run keeps the prior snapshot on screen.
						if (!settled && input.settleTracker?.hasSettledContent(boundary.id)) {
							setBoundaryBusy(boundary, true);
							return;
						}
						if (settled) {
							input.settleTracker?.markSettled(boundary.id);
							setBoundaryBusy(boundary, false);
						}
						return boundaryRangeJournal(boundary.id, {
							type: 'async-boundary-snapshot',
							boundaryId: boundary.id,
							graphNodeId: asyncRead.graphNodeId,
							path: asyncRead.path,
							snapshot,
						});
					}
					// The re-settle hold sees every snapshot before the shared settle path.
					input.onAsyncSnapshot?.(boundary, snapshot);
					return settleAsyncBoundaryRange(input, boundary, snapshot).then((result) => {
						clearBusyUnlessRerun(input.graph, boundary);
						return result;
					});
				},
			});
			releases.push(subscribed);
		}
		if (!demand) return;
		for (const asyncRead of boundary.asyncReads)
			input.graph.read(asyncRead.graphNodeId, ['status']);
		// A runner another reader demanded first can settle before this subscribed, and no write follows to announce it.
		const read = boundary.asyncReads[0];
		if (catchUp && boundary.updateSymbolId && read && !input.settleTracker?.hasSettledContent(boundary.id)) {
			const snapshot = boundaryGateSnapshot(input.graph, boundary, read.graphNodeId, input.graph.read(read.graphNodeId, []));
			if (isSettledStatus((snapshot as { readonly status?: unknown } | null)?.status)) {
				input.onAsyncSnapshot?.(boundary, snapshot);
				void settleAsyncBoundaryRange(input, boundary, snapshot);
			}
		}
	};
	for (const boundary of input.asyncBoundariesById.values())
		wire(
			boundary,
			(!!boundary.updateSymbolId && !input.settleTracker?.hasSettledContent(boundary.id)) ||
				input.demandOnStart === true,
			input.demandOnStart === true,
		);
	return {
		add(boundary) {
			release(boundary.id);
			input.asyncBoundariesById.set(boundary.id, boundary);
			input.settleTracker?.track(boundary);
			const settled = input.settleTracker?.hasSettledContent(boundary.id) === true;
			wire(boundary, !settled, !settled);
		},
	};
}

function clearBusyUnlessRerun(
	graph: ResumeRuntimeInput['graph'],
	boundary: ResumeAsyncBoundaryRecord,
): void {
	if (boundary.runnerGraphNodeId !== null && graph.read(boundary.runnerGraphNodeId, ['status']) === 'pending')
		return;
	setBoundaryBusy(boundary, false);
}

// A removed ancestor ends the parent chain short of the root; a host without parent links counts as attached.
function detached(root: unknown, node: unknown): boolean {
	type Linked = { readonly parentNode?: Linked | null };
	for (let at = node as Linked | null | undefined; at; at = at.parentNode)
		if (at === root || at.parentNode === undefined) return false;
	return !!node;
}

function boundaryGateSnapshot(
	graph: Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0]['graph'],
	boundary: ResumeAsyncBoundaryRecord,
	observedGraphNodeId: string,
	observedSnapshot: unknown,
): unknown {
	const snapshots = boundary.asyncReads.map(
		(read) =>
			(read.graphNodeId === observedGraphNodeId
				? observedSnapshot
				: graph.read(read.graphNodeId, [])) as {
				readonly status?: unknown;
				readonly error?: unknown;
			} | null | undefined,
	);
	const rejected = snapshots.find((snapshot) => snapshot?.status === 'rejected');
	if (rejected) return { status: 'rejected', error: rejected.error };
	return (
		snapshots.find(
			(snapshot) => snapshot?.status === 'pending' || snapshot?.status === 'idle',
		) ??
		(snapshots.includes(undefined)
			? { status: 'pending' }
			: snapshots.findLast((snapshot) => snapshot?.status === 'fulfilled'))
	);
}

export async function settleAsyncBoundaryRange(
	input: Pick<
		Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0],
		| 'graph'
		| 'root'
		| 'loadSymbol'
		| 'renderBranchHtml'
		| 'renderAsyncBoundary'
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
		// A newer run superseded this settle while it waited; its own settle
		// subscription commits the fresher snapshot.
		if (
			boundary.runnerGraphNodeId !== null &&
			input.graph.read(boundary.runnerGraphNodeId, ['status']) !== status
		)
			return;
	}
	const source = resolveBoundarySettleSource(input, boundary);
	// A composed child's arm records are minted in the child's own id space; the
	// qualifier that re-spells them in page space is installed only by pages the
	// bundler gave component edges (fns/composed-arm-records).
	if (source === 'renderAsyncBoundary') {
		const rendered = await input.renderAsyncBoundary!(boundary.id, status, input.graph);
		const armRecords = boundaryArmRecordSet(rendered.armRecords);
		if (!armRecords) throw emptySettleRenderError(boundary.id);
		await input.commitArm!(boundary, {
			...rendered,
			html: rendered.html,
			arm: status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try,
			armRecords: (composedArmRecordQualifier()?.(boundary, armRecords, input.graph) ?? armRecords),
		});
		input.settleTracker?.markSettled(boundary.id);
		return;
	}
	const symbol = await input.loadSymbol(source.symbolId);
	const update = await symbol({
		graph: composedBoundaryGraph()?.(input.graph, boundary) ?? input.graph,
		status,
		element: input.root,
		getElementHandle: input.elementHandles.get,
		asyncBoundary: boundary,
	});
	if (!isResumeBranchUpdate(update)) throw emptySettleRenderError(boundary.id);
	if (input.commitArm) {
		const rawArmRecords = (update as { readonly armRecords?: unknown }).armRecords;
		const plannedArmRecords = Array.isArray(boundary.armRecords)
			? boundary.armRecords[
					status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try
				]
			: undefined;
		const armRecords =
			boundaryArmRecordSet(rawArmRecords) ?? boundaryArmRecordSet(plannedArmRecords);
		if (rawArmRecords !== undefined && !armRecords) throw emptySettleRenderError(boundary.id);
		if (armRecords) {
			const { computed, cells } = update as Pick<ArmCommitUpdate, 'computed' | 'cells'>;
			await input.commitArm(boundary, {
				...(computed && { computed }),
				...(cells && { cells }),
				html: update.html,
				arm: status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try,
				armRecords: (composedArmRecordQualifier()?.(boundary, armRecords, input.graph) ?? armRecords),
			});
			input.settleTracker?.markSettled(boundary.id);
			return;
		}
		// Rows written straight into this arm follow its commits; a journal swap would leave them holding the old nodes.
		if (input.root.__marklessBranchArms?.has(boundary.id)) {
			await input.commitArm(boundary, {
				html: update.html,
				arm: status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try,
				armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
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

type SettleSource = 'renderAsyncBoundary' | { readonly symbolId: string };

function resolveBoundarySettleSource(
	input: Pick<
		Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0],
		'commitArm' | 'renderAsyncBoundary'
	>,
	boundary: ResumeAsyncBoundaryRecord,
): SettleSource {
	const byPrecedence = [
		input.commitArm && input.renderAsyncBoundary ? ['renderAsyncBoundary' as const] : [],
		boundary.updateSymbolId ? [{ symbolId: boundary.updateSymbolId }] : [],
	];
	for (const candidates of byPrecedence) {
		if (candidates.length > 1) throw ambiguousSettleSourceError(boundary.id);
		if (candidates[0]) return candidates[0];
	}
	throw emptySettleRenderError(boundary.id);
}

function ambiguousSettleSourceError(boundaryId: string): Error {
	return new Error(`MARKLESS_ASYNC_SETTLE_SOURCE_AMBIGUOUS: ${boundaryId}`);
}

function emptySettleRenderError(boundaryId: string): Error {
	return new Error(`MARKLESS_ASYNC_SETTLE_RECORDS_MISSING: ${boundaryId}`);
}

// The settle commit shape shared by the snapshot and html paths: replace the
// boundary's anchor range with the settled fragment.
function boundaryRangeJournal(boundaryId: string, fragment: unknown): DomJournalEntry[] {
	return [
		{ type: 'removeRange', locator: `async-boundary:${boundaryId}` },
		{ type: 'insertRange', locator: `async-boundary:${boundaryId}:start`, fragment },
	] as DomJournalEntry[];
}

function isResumeBranchUpdate(
	value: unknown,
): value is { readonly arm: number; readonly html: string } {
	const update = value as { readonly arm?: unknown; readonly html?: unknown } | null;
	return typeof update?.arm === 'number' && typeof update?.html === 'string';
}
