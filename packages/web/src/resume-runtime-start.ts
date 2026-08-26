import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import type { AsyncBoundarySettleTracker } from './resume-async-wiring.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import type { OverlayHiddenBoundRoot } from './overlay-handoff.ts';
import type {
	ResumeAsyncBoundaryRecord,
	ResumeDomElement,
	ResumePreparedCore,
	ResumeRuntimeInput,
} from './resume-types.ts';

type BehaviorRuntime = ReturnType<
	(typeof import('./resume-behaviors.ts'))['createBehaviorRuntime']
>;
type BranchRuntime = Awaited<
	ReturnType<(typeof import('./resume-branches.ts'))['wireBranches']>
>;
type EventWiring = ReturnType<(typeof import('./resume-events.ts'))['createEventWiring']>;
type RuntimeShared = ReturnType<
	(typeof import('./resume-runtime-shared.ts'))['createResumeRuntimeShared']
>;

/**
 * Where the app's own emitted module leaves its overlay installer, and the whole
 * cost of elevation to an app that has no `overlay` mark: one optional call.
 *
 * A global rather than a module slot, and an installer rather than a loader,
 * because both alternatives put bytes in modules every app ships to carry a
 * capability most of them do not have - the same trap the `import()` specifier
 * itself is. The mark query and the import both live on the emitted side, so an
 * app without the capability pays for neither.
 */
type MarklessOverlayHost = {
	__marklessOverlay?: (root: Element) => Promise<(() => void) | undefined> | undefined;
};

/**
 * The hosts whose `hidden` attribute a payload record writes.
 *
 * This is the whole signal that separates a surface served open from an element
 * with no visibility gating at all - the served DOM spells both the same way.
 * Read off `domUpdates` rather than the DOM because the DOM cannot answer it.
 */
function hiddenBoundElements(
	view: ResumeRuntimeInput['view'],
	elementsByHostId: ResumePreparedCore['elementsByHostId'],
): ReadonlyArray<Element> {
	const bound: Element[] = [];
	for (const update of view.domUpdates) {
		if (update.target?.kind !== 'attribute' || update.target.name !== 'hidden') continue;
		const element = elementsByHostId.get(update.hostNodeId);
		if (element) bound.push(element as unknown as Element);
	}
	return bound;
}

export async function startResumeRuntime(input: {
	readonly runtimeInput: ResumeRuntimeInput;
	readonly prepared: ResumePreparedCore;
	readonly eventTypes: Set<string>;
	readonly getEvents: () => Promise<EventWiring>;
	readonly loadBehaviorRuntime: () => Promise<BehaviorRuntime>;
	readonly loadBranchRuntime: () => Promise<BranchRuntime>;
	readonly behaviorRuntime: () => BehaviorRuntime | undefined;
	readonly branchRuntime: () => BranchRuntime | undefined;
	readonly storeContainerSubscription: (release: () => void) => void;
	readonly disposeHost: (hostNodeId: string) => void;
	readonly commitArm: (
		boundary: ResumeAsyncBoundaryRecord,
		update: ArmCommitUpdate,
	) => Promise<void>;
	// Receives the branch-runtime hooks built here (escalated-flip re-settle +
	// pending-flip hold) before any branch runtime loads.
	readonly connectBranchWiring: (wiring: {
		readonly resettleBoundary: (boundaryId: string) => Promise<DomJournalResult | void>;
		readonly holdPendingFlip: (graphNodeId: string) => boolean;
	}) => void;
	readonly receiveSharedPatch: RuntimeShared['receiveSharedPatch'];
	readonly sharedPatchEventType: string;
	// Handed straight to the repeat runtime, which hands it to a component row's
	// bridge: the registrar a row born after boot registers its records through.
	readonly armRegistrationDeps: (
		records: import('./resume-commit-arm.ts').ArmCommitUpdate['armRecords'],
	) => Promise<import('./resume-commit-arm.ts').ArmRegistrationDeps>;
	readonly installArmEventType: (eventType: string) => void;
}): Promise<AsyncBoundarySettleTracker | undefined> {
	const {
		runtimeInput,
		prepared,
		eventTypes,
		getEvents,
		loadBehaviorRuntime,
		loadBranchRuntime,
		storeContainerSubscription,
		disposeHost,
		receiveSharedPatch,
		sharedPatchEventType,
	} = input;
	const events = await getEvents();
	const rowEvents = (runtimeInput.view.keyedRepeats ?? []).flatMap((repeat) => repeat.rowEvents);
	await events.prepareSyncPolicy(runtimeInput.view.events, rowEvents);
	if (runtimeInput.applyDomJournal) {
		storeContainerSubscription(
			runtimeInput.graph.subscribeJournal(async (entries) => {
				await disposeRemovedAsyncRangeHosts(runtimeInput, prepared, entries, disposeHost);
				const branchRuntime = input.branchRuntime();
				if (branchRuntime) {
					await branchRuntime.disposeRemovedRangeHosts(
						entries,
						disposeHost,
						prepared.asyncBoundariesById,
					);
				}
				await runtimeInput.applyDomJournal!(entries);
				await input
					.branchRuntime()
					?.materializeFlippedBranchArms(entries, (hostNodeId) =>
						input.behaviorRuntime()!.activateBehaviors(hostNodeId, { flush: false }),
					);
			}),
		);
	}
	if ((runtimeInput.view.keyedRepeats ?? []).length > 0) {
		const keyedRepeats = await import('./resume-keyed-repeats.ts');
		await keyedRepeats.primeKeyedRepeatCollections({
			graph: runtimeInput.graph,
			repeats: runtimeInput.view.keyedRepeats ?? [],
			computed: runtimeInput.state?.computed ?? [],
			root: runtimeInput.root,
			loadSymbol: runtimeInput.loadSymbol,
			elementHandles: prepared.elementHandles,
		});
		keyedRepeats.wireKeyedRepeats(
			{
				graph: runtimeInput.graph,
				view: runtimeInput.view,
				elementsByHostId: prepared.elementsByHostId,
				events,
				storeContainerSubscription,
				renderData: runtimeInput.renderData,
			},
			{
				runtimeInput,
				armRegistrationDeps: input.armRegistrationDeps,
				installArmEventType: input.installArmEventType,
			},
		);
	}
	let settleTracker: AsyncBoundarySettleTracker | undefined;
	if (runtimeInput.view.asyncBoundaries.length > 0) {
		const asyncWiring = await import('./resume-async-wiring.ts');
		// D8: settled-content tracking (deadline-gated pending, the navigation-
		// transition settle promise, pending minimum duration).
		settleTracker = asyncWiring.createAsyncBoundarySettleTracker({
			boundaries: prepared.asyncBoundariesById.values(),
		});
		// T119/T120: deadline-gated @pending on re-settles (captures the mounted
		// @pending arms before the runners are demanded below).
		const { wireResettleHold } = await import('./resume-resettle-hold.ts');
		const onAsyncSnapshot = wireResettleHold({
			tracker: settleTracker,
			boundaries: prepared.asyncBoundariesById.values(),
			readStatus: (graphNodeId) => runtimeInput.graph.read(graphNodeId, ['status']),
			commitArm: input.commitArm,
			hasHtmlRenderer: !!runtimeInput.renderBranchHtml,
		});
		asyncWiring.wireAsyncBoundariesWithoutLoadingCapability({
			asyncBoundariesById: prepared.asyncBoundariesById,
			graph: runtimeInput.graph,
			root: runtimeInput.root,
			loadSymbol: runtimeInput.loadSymbol,
			renderBranchHtml: runtimeInput.renderBranchHtml,
			renderAsyncBoundary: runtimeInput.renderAsyncBoundary,
			elementHandles: prepared.elementHandles,
			storeContainerSubscription,
			commitArm: input.commitArm,
			demandOnStart: runtimeInput.demandAsyncBoundaries === true,
			settleTracker,
			onAsyncSnapshot,
		});
	}
	for (const computed of runtimeInput.state?.computed ?? []) {
		if (
			computed.snapshot?.status === 'pending' &&
			(runtimeInput.view.asyncRunners?.[computed.graphNodeId] ||
				runtimeInput.view.asyncBoundaries.some((boundary) =>
					boundary.asyncReads.some(
						(read) =>
							read.graphNodeId === computed.graphNodeId && !!read.runnerSymbolId,
					),
				))
		) {
			runtimeInput.graph.read(computed.graphNodeId, ['status']);
		}
	}
	// Branch-runtime hooks live here with the settle machinery they depend on;
	// the runtime core only carries their connection point.
	input.connectBranchWiring({
		// Escalated arm-scoped toggles (T104): re-run the boundary's settle path
		// with the current snapshot so the whole arm re-renders through commitArm.
		resettleBoundary: async (boundaryId): Promise<DomJournalResult | void> => {
			const boundary = prepared.asyncBoundariesById.get(boundaryId);
			if (!boundary?.updateSymbolId || boundary.runnerGraphNodeId === null) return;
			const { settleAsyncBoundaryRange } = await import('./resume-async-wiring.ts');
			return settleAsyncBoundaryRange(
				{
					graph: runtimeInput.graph,
					root: runtimeInput.root,
					loadSymbol: runtimeInput.loadSymbol,
					renderBranchHtml: runtimeInput.renderBranchHtml,
					renderAsyncBoundary: runtimeInput.renderAsyncBoundary,
					elementHandles: prepared.elementHandles,
					commitArm: input.commitArm,
					settleTracker,
				},
				boundary,
				runtimeInput.graph.read(boundary.runnerGraphNodeId, []),
			);
		},
		// Spec D8: a branch flip whose deciding test read goes THROUGH an async
		// computed that is re-running holds its prior arm — the pending snapshot
		// has no value, so the test would evaluate lies; the boundary's settle
		// re-commit renders the truthful arm.
		holdPendingFlip: (graphNodeId) =>
			runtimeInput.graph.read(graphNodeId, ['status']) === 'pending' &&
			[...prepared.asyncBoundariesById.values()].some((boundary) =>
				boundary.asyncReads.some((read) => read.graphNodeId === graphNodeId),
			),
	});
	if (runtimeInput.view.events.some((event) => event.eventName === 'visible')) {
		const behaviors = await loadBehaviorRuntime();
		behaviors.installVisibilityObserver();
		behaviors.installRemovalObserver();
	}
	if ((runtimeInput.view.branches ?? []).length > 0) {
		const branches = await loadBranchRuntime();
		// An escalating branch's served arm is already in the DOM; it registers the
		// way a served boundary arm does, against the branch's own anchor pair.
		let registerArm: typeof import('./resume-commit-arm.ts').registerArmRecordSet | undefined;
		for (const branch of branches.branchesById.values()) {
			const armRecords = branch.servedArmRecords;
			if (!armRecords) continue;
			registerArm ??= (await import('./resume-commit-arm.ts')).registerArmRecordSet;
			await registerArm(
				await input.armRegistrationDeps(armRecords),
				input.installArmEventType,
				branch,
				{ armRecords },
			);
		}
	}
	// Pay-per-use in two stages, because fetching less is not the same as shipping
	// less. The chunk is EMITTED only for an app the compiler recorded an `overlay`
	// demand for: that app's own module is the ONLY place the `import()` specifier
	// is written, because a specifier in this module - which every app loads -
	// makes every app ship the chunk. It is then FETCHED only once a root turns out
	// to carry a marked element, which is why the installer takes the root and
	// answers `undefined` for a root with no mark on it.
	const installOverlay = (globalThis as MarklessOverlayHost).__marklessOverlay;
	if (installOverlay) {
		// The installer's own gate is the mark query; this scan is behind the same
		// `undefined` an app with no `overlay` demand already answers, so a page
		// without elevation walks no records.
		(runtimeInput.root as unknown as OverlayHiddenBoundRoot).__marklessOverlayHiddenBound =
			hiddenBoundElements(runtimeInput.view, prepared.elementsByHostId);
		const overlayTeardown = await installOverlay(runtimeInput.root as unknown as Element);
		if (overlayTeardown) storeContainerSubscription(overlayTeardown);
	}
	// Container capture listeners see every DOM event of a registered type,
	// including non-markless ones (router links): unmatched must pass through.
	const dispatchCaptured = (event: Parameters<typeof events.dispatch>[0]) =>
		events.dispatch(event, { ignoreUnmatched: true });
	if (!runtimeInput.root.__marklessDelegatedDispatch)
		for (const eventType of eventTypes) {
			runtimeInput.root.addEventListener?.(eventType, dispatchCaptured, { capture: true });
			// The wrapper has its own identity; pair removal with registration so
			// dispose drops these listeners too.
			storeContainerSubscription(() =>
				runtimeInput.root.removeEventListener?.(eventType, dispatchCaptured, {
					capture: true,
				}),
			);
		}
	events.armFocusPreload();
	storeContainerSubscription(() => events.releaseFocusPreload());
	// The focus that woke this runtime fired its focusin before the wiring existed.
	events.preloadFocusKeySymbols(marklessActiveElement(runtimeInput.root));
	if ((runtimeInput.graph.listSharedDefinitions?.() ?? []).length > 0) {
		runtimeInput.root.addEventListener?.(sharedPatchEventType, receiveSharedPatch, {
			capture: true,
		});
	}
	return settleTracker;
}

async function disposeRemovedAsyncRangeHosts(
	input: ResumeRuntimeInput,
	prepared: ResumePreparedCore,
	entries: ReadonlyArray<DomJournalEntry>,
	disposeHost: (hostNodeId: string) => void,
): Promise<void> {
	let locators: typeof import('./resume-locators.ts') | undefined;
	for (const entry of entries) {
		if (entry.type !== 'removeRange' || !entry.locator.startsWith('async-boundary:')) continue;
		const boundary = prepared.asyncBoundariesById.get(
			entry.locator.slice('async-boundary:'.length),
		);
		if (!boundary) continue;
		locators ??= await import('./resume-locators.ts');
		const removed = locators.elementsBetweenAnchors(
			input.root,
			boundary.startAnchor,
			boundary.endAnchor,
		);
		for (const id of locators.hostIdsInsideRemovedElements(prepared.elementsByHostId, removed))
			disposeHost(id);
	}
}

// The resume DOM surface deliberately names only what resume writes to; the
// focused element is read straight off the host document instead.
function marklessActiveElement(root: ResumeDomElement): ResumeDomElement | null {
	const owner = root.ownerDocument as { readonly activeElement?: unknown } | undefined;
	const active = owner?.activeElement;
	return active && (active as ResumeDomElement).nodeType === 1
		? (active as ResumeDomElement)
		: null;
}
