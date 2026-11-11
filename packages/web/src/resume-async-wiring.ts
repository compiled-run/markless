import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import { boundaryArmRecordSet, composedArmRecordQualifier } from './resume-arm-records.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import { asyncPlanes } from './reconcile-plane-slot.ts';
import { setBoundaryBusy } from './resume-refresh-busy.ts';
import { reaskOnReturn, registerWriteRefresh } from './resume-return-reask.ts';
import type {
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomElement,
	ResumeSymbolContext,
	ResumePreparedCore,
	ResumeRuntimeInput,
} from './resume-types.ts';

declare const __MARKLESS_DEV_ENABLED__: boolean;

// Spec D8 (12-arm-rendering): first appearances render @pending structurally,
// navigations hold the outgoing page, and RE-settles keep the prior settled
// content busy until the new content commits, however long that takes. This
// tracker is the settle path's synchronous bookkeeping core:
// - which boundaries currently render SETTLED content, so a re-run of their
//   async computed keeps the prior snapshot instead of flashing @pending
// - a promise that resolves once every tracked boundary settled (the router
//   races it against the navigation deadline before committing a swap)
// - a commit floor: once a deadline swap made pending UI visible, settle
//   commits wait out the minimum-visibility window.
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
	// `shown` names, per async read, the settled snapshot version the arm already shows.
	readonly add: (boundary: ResumeAsyncBoundaryRecord, shown?: ReadonlyMap<string, unknown>) => void;
	// A handler's rejection reaches the @catch around its element; false when none takes it.
	readonly failEnclosingCatch: (element: ResumeDomElement, error: unknown) => Promise<boolean>;
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
	// D8 settled-content tracking, navigation transitions and the deadline swap's commit floor.
	readonly settleTracker?: AsyncBoundarySettleTracker;
}): AsyncBoundaryWiring {
	const releasesById = new Map<string, Array<() => void>>();
	const release = (boundaryId: string) => {
		for (const done of releasesById.get(boundaryId) ?? []) done();
		releasesById.delete(boundaryId);
	};
	let disposed = false;
	let stopReasking: (() => void) | undefined;
	let stopWriteRefresh: (() => void) | undefined;
	input.storeContainerSubscription(() => {
		disposed = true;
		stopReasking?.();
		stopWriteRefresh?.();
		for (const boundaryId of releasesById.keys()) release(boundaryId);
	});
	const wire = (
		boundary: ResumeAsyncBoundaryRecord,
		demand: boolean,
		catchUp: boolean,
		shown?: Map<string, unknown>,
	) => {
		if (disposed) return;
		const releases: Array<() => void> = [];
		releasesById.set(boundary.id, releases);
		const painted = new Map(shown);
		// A settle that resolves after disposal claims nothing, so it commits nothing.
		const claimFor = (graphNodeId: string, snapshot: unknown) => {
			const claim = claimSettle(painted, graphNodeId, snapshot);
			return () => !disposed && claim();
		};
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
					asyncPlanes.busy?.note(
						boundary,
						asyncRead.graphNodeId,
						snapshot,
						input.settleTracker?.hasSettledContent(boundary.id) === true,
					);
					const claim = claimFor(asyncRead.graphNodeId, snapshot);
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
							(asyncPlanes.busy?.set ?? setBoundaryBusy)(boundary, true);
							return;
						}
						if (settled) {
							if (!claim()) return;
							input.settleTracker?.markSettled(boundary.id);
							(asyncPlanes.busy?.set ?? setBoundaryBusy)(boundary, false);
						}
						return boundaryRangeJournal(boundary.id, {
							type: 'async-boundary-snapshot',
							boundaryId: boundary.id,
							graphNodeId: asyncRead.graphNodeId,
							path: asyncRead.path,
							snapshot,
						});
					}
					const settled = isSettledStatus((snapshot as { readonly status?: unknown } | null)?.status);
					if (!settled && (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__))
						preloadTryArm(input.loadSymbol, boundary.updateSymbolId);
					if (!settled && input.settleTracker?.hasSettledContent(boundary.id))
						(asyncPlanes.busy?.set ?? setBoundaryBusy)(boundary, true);
					return settleAsyncBoundaryRange(input, boundary, snapshot, claim).then((result) => {
						// After the pass: what updates in place lands with the rest of this flush.
						if (!disposed) void input.graph.flush().then(() => asyncPlanes.busy?.apply(boundary));
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
				void settleAsyncBoundaryRange(
					input,
					boundary,
					snapshot,
					claimFor(read.graphNodeId, input.graph.read(read.graphNodeId, [])),
				);
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
	if (!disposed) {
		stopReasking = reaskOnReturn(input.root, input.graph, input.asyncBoundariesById);
		stopWriteRefresh = registerWriteRefresh(input.graph, input.asyncBoundariesById);
	}
	return {
		add(boundary, shown) {
			release(boundary.id);
			input.asyncBoundariesById.set(boundary.id, boundary);
			input.settleTracker?.track(boundary);
			const settled = input.settleTracker?.hasSettledContent(boundary.id) === true;
			wire(boundary, !settled, !settled, settled && shown ? new Map(shown) : undefined);
		},
		async failEnclosingCatch(element, error) {
			return (await import('./fns/enclosing-catch.ts')).marklessFailEnclosingCatch(
				input.asyncBoundariesById.values(),
				input.graph,
				element,
				error,
			);
		},
	};
}

// Dev only, where symbols load on demand: a waiting block fetches its @try arm's code beside its data.
function preloadTryArm(loadSymbol: WiringInput['loadSymbol'], updateSymbolId: string): void {
	void Promise.resolve(loadSymbol(updateSymbolId))
		.then(async (symbol) => {
			const arms = (await symbol({ armRecordsOnly: true } as ResumeSymbolContext)) as unknown;
			const records = Array.isArray(arms) ? (arms[0] as ResumeArmRecordSet | undefined) : undefined;
			for (const update of records?.domUpdates ?? [])
				if (update.symbolId) void Promise.resolve(loadSymbol(update.symbolId)).catch(() => {});
		})
		.catch(() => {});
}

// A settle heard twice (it landed in the task that started it) commits once, or the second commit replaces rows under a press.
function claimSettle(painted: Map<string, unknown>, graphNodeId: string, snapshot: unknown) {
	const { status, version } = (snapshot ?? {}) as { readonly status?: unknown; readonly version?: unknown };
	return (): boolean =>
		!isSettledStatus(status) ||
		version === undefined ||
		(painted.get(graphNodeId) !== version && !!painted.set(graphNodeId, version));
}

type WiringInput = Parameters<typeof wireAsyncBoundariesWithoutLoadingCapability>[0];

// D8 settle tracking and boundary wiring, started together when the first @try needs them.
export function startAsyncBoundaries(
	input: Omit<WiringInput, 'settleTracker'> & {
		readonly commitArm: NonNullable<WiringInput['commitArm']>;
	},
): AsyncBoundaryWiring & { readonly settleTracker: AsyncBoundarySettleTracker } {
	const settleTracker = createAsyncBoundarySettleTracker({
		boundaries: input.asyncBoundariesById.values(),
	});
	return {
		settleTracker,
		...wireAsyncBoundariesWithoutLoadingCapability({ ...input, settleTracker }),
	};
}

// What a boundary's range shows, as this runtime last committed it: one of its arms, or its @try content kept with the @catch drawn after it.
const SHOWN_TRY_KEPT = ASYNC_BOUNDARY_ARM.catch + 1;
const shownArms = new WeakMap<ResumeAsyncBoundaryRecord, number>();
const showsTry = (boundary: ResumeAsyncBoundaryRecord): boolean => {
	const shown = shownArms.get(boundary) ?? boundary.initiallyServedArm;
	return shown === ASYNC_BOUNDARY_ARM.try || shown === SHOWN_TRY_KEPT;
};
const noRecords = (): ResumeArmRecordSet => ({ locators: [], events: [], behaviors: [], elementHandles: [] });

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
	claim?: () => boolean,
	rerender?: true,
): Promise<DomJournalResult | void> {
	const status = (snapshot as { readonly status?: unknown } | null)?.status;
	if (!isSettledStatus(status)) return;
	// D8 minimum pending visibility: once a deadline route swap showed the
	// @pending arm, the settle commit waits until it was visible for the
	// minimum duration (no blink).
	const runnerStatus = () =>
		boundary.runnerGraphNodeId === null
			? status
			: input.graph.read(boundary.runnerGraphNodeId, ['status']);
	// The runner can be a sync computed with no status, so the async values the boundary reads (those with a runner symbol) are checked too.
	const newerRunPending = () =>
		runnerStatus() === 'pending' ||
		boundary.asyncReads.some(
			(read) => !!read.runnerSymbolId && input.graph.read(read.graphNodeId, ['status']) === 'pending',
		);
	// A newer run that started while this settle waited or rendered owns the boundary: its own settle commits, and the hold keeps what is shown.
	if (
		(await input.settleTracker?.waitOutCommitHold()) === true &&
		(runnerStatus() !== status || newerRunPending())
	)
		return;
	// A refresh over the shown @try arm updates it in place: its bindings, branches, rows and nested blocks follow the graph.
	const kept = shownArms.get(boundary) === SHOWN_TRY_KEPT;
	if (
		status === 'fulfilled' &&
		!rerender &&
		!boundary.rerendersOnRefresh &&
		input.commitArm &&
		showsTry(boundary) &&
		// Rows written straight into the arm insert inside the @catch drawn after kept content, so only a full commit recovers them.
		!(kept && input.root.__marklessBranchArms?.get(boundary.id)?.listeners.size)
	) {
		if (claim?.() === false) return;
		shownArms.set(boundary, ASYNC_BOUNDARY_ARM.try);
		const after = kept && asyncPlanes.busy?.afterRange(boundary, false);
		if (after) await input.commitArm(after as ResumeAsyncBoundaryRecord, { nodes: [], armRecords: noRecords(), after: true });
		input.settleTracker?.markSettled(boundary.id);
		return;
	}
	const source = resolveBoundarySettleSource(input, boundary);
	const arm = status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try;
	// Only an arm committed with its own records carries the value bindings an in-place refresh needs.
	const commit = async (update: Omit<ArmCommitUpdate, 'arm' | 'after'>, ownRecords = true) => {
		const rows = update.armRecords.keyedRepeats;
		const moved = rows?.length
			? (await import('./resume-keyed-repeats-lazy.ts')).movedSincePaint(input.graph, rows)
			: undefined;
		// A failed refresh over shown @try content keeps it and draws the @catch in a range opened after it.
		const after =
			arm === ASYNC_BOUNDARY_ARM.catch && showsTry(boundary)
				? asyncPlanes.busy?.afterRange(boundary, true)
				: undefined;
		if (after) shownArms.set(boundary, SHOWN_TRY_KEPT);
		else if (ownRecords || arm !== ASYNC_BOUNDARY_ARM.try) shownArms.set(boundary, arm);
		else shownArms.delete(boundary);
		await input.commitArm!((after ?? boundary) as ResumeAsyncBoundaryRecord, {
			...update,
			...(moved && { moved }),
			arm,
			...(after && { after: true }),
		});
		input.settleTracker?.markSettled(boundary.id);
	};
	// A composed child's arm records are minted in the child's own id space; the
	// qualifier that re-spells them in page space is installed only by pages the
	// bundler gave component edges (fns/composed-arm-records).
	if (source === 'renderAsyncBoundary') {
		const rendered = await input.renderAsyncBoundary!(boundary.id, status, input.graph);
		if (newerRunPending() || claim?.() === false) return;
		const armRecords = boundaryArmRecordSet(rendered.armRecords);
		if (!armRecords) throw emptySettleRenderError(boundary.id);
		await commit({
			...rendered,
			html: rendered.html,
			armRecords: (composedArmRecordQualifier()?.(boundary, armRecords, input.graph) ?? armRecords),
		});
		return;
	}
	const symbol = await input.loadSymbol(source.symbolId);
	const update = await symbol({
		graph: composedArmRecordQualifier()?.graph?.(input.graph, boundary) ?? input.graph,
		status,
		element: input.root,
		getElementHandle: input.elementHandles.get,
		asyncBoundary: boundary,
	});
	if (!isResumeBranchUpdate(update)) throw emptySettleRenderError(boundary.id);
	if (newerRunPending()) return;
	if (input.commitArm) {
		const rawArmRecords = (update as { readonly armRecords?: unknown }).armRecords;
		const plannedArmRecords = Array.isArray(boundary.armRecords)
			? boundary.armRecords[arm]
			: undefined;
		const armRecords =
			boundaryArmRecordSet(rawArmRecords) ?? boundaryArmRecordSet(plannedArmRecords);
		if (rawArmRecords !== undefined && !armRecords) throw emptySettleRenderError(boundary.id);
		if (armRecords) {
			if (claim?.() === false) return;
			const { computed, cells, renderedBoundaryId } = update as Pick<ArmCommitUpdate, 'computed' | 'cells'> & {
				readonly renderedBoundaryId?: string;
			};
			const own = { ...(computed && { computed }), ...(cells && { cells }), armRecords };
			await commit(
				{
					...(composedArmRecordQualifier()?.boundaryUpdate?.(boundary, own, input.graph, renderedBoundaryId) ?? own),
					html: update.html,
				},
				rawArmRecords !== undefined,
			);
			return;
		}
		// A failure commits, so shown @try content can stay with the @catch drawn after it; a journal swap replaces the range.
		// Rows written straight into this arm follow its commits; a journal swap would leave them holding the old nodes.
		if (arm === ASYNC_BOUNDARY_ARM.catch || input.root.__marklessBranchArms?.has(boundary.id)) {
			if (claim?.() === false) return;
			await commit({ html: update.html, armRecords: noRecords() }, false);
			return;
		}
	}
	// Plain .html updates (cheap parts tier) keep the journal string path.
	const fragment = input.renderBranchHtml ? input.renderBranchHtml(update.html) : update.html;
	if (arm === ASYNC_BOUNDARY_ARM.try) shownArms.delete(boundary);
	else shownArms.set(boundary, arm);
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
