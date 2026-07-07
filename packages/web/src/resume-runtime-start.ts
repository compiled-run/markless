import type { DomJournalEntry } from '@markless/runtime';
import type { ResumePreparedCore, ResumeRuntimeInput } from './resume-types.ts';

type BehaviorRuntime = ReturnType<typeof import('./resume-behaviors.ts')['createBehaviorRuntime']>;
type BranchRuntime = ReturnType<typeof import('./resume-branches.ts')['wireBranches']>;
type EventWiring = ReturnType<typeof import('./resume-events.ts')['createEventWiring']>;
type RuntimeShared = ReturnType<typeof import('./resume-runtime-shared.ts')['createResumeRuntimeShared']>;

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
	readonly receiveSharedPatch: RuntimeShared['receiveSharedPatch'];
	readonly sharedPatchEventType: string;
}): Promise<void> {
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
		storeContainerSubscription(runtimeInput.graph.subscribeJournal(async (entries) => {
			await disposeRemovedAsyncRangeHosts(runtimeInput, prepared, entries, disposeHost);
			input.branchRuntime()?.disposeRemovedRangeHosts(entries, disposeHost, prepared.asyncBoundariesById);
			await runtimeInput.applyDomJournal!(entries);
			await input.branchRuntime()?.materializeFlippedBranchArms(entries, (hostNodeId) =>
				input.behaviorRuntime()!.activateBehaviors(hostNodeId, { flush: false }),
			);
		}));
	}
	if ((runtimeInput.state?.computed ?? []).some((computed) =>
		computed.async === false &&
		typeof (computed as { readonly deriveSymbolId?: unknown }).deriveSymbolId === 'string'
	)) {
		(await import('./resume-sync-demand.ts')).wireSyncComputedDemandTriggersWithoutLoadingCapability({
			graph: runtimeInput.graph, state: runtimeInput.state, root: runtimeInput.root, loadSymbol: runtimeInput.loadSymbol,
			elementHandles: prepared.elementHandles, storeContainerSubscription,
		});
	}
	if ((runtimeInput.view.keyedRepeats ?? []).length > 0) {
		(await import('./resume-keyed-repeats.ts')).wireKeyedRepeats({
			graph: runtimeInput.graph, view: runtimeInput.view, elementsByHostId: prepared.elementsByHostId, events, storeContainerSubscription,
		});
	}
	if (runtimeInput.view.asyncBoundaries.length > 0) {
		(await import('./resume-async-wiring.ts')).wireAsyncBoundariesWithoutLoadingCapability({
			asyncBoundariesById: prepared.asyncBoundariesById, graph: runtimeInput.graph, root: runtimeInput.root,
			loadSymbol: runtimeInput.loadSymbol, renderBranchHtml: runtimeInput.renderBranchHtml, elementHandles: prepared.elementHandles, storeContainerSubscription,
		});
	}
	if (runtimeInput.view.events.some((event) => event.eventName === 'visible')) {
		const behaviors = await loadBehaviorRuntime();
		behaviors.installVisibilityObserver();
		behaviors.installRemovalObserver();
	}
	if ((runtimeInput.view.branches ?? []).length > 0) await loadBranchRuntime();
	// Container capture listeners see every DOM event of a registered type,
	// including non-markless ones (router links): unmatched must pass through.
	const dispatchCaptured = (event: Parameters<typeof events.dispatch>[0]) => events.dispatch(event, { ignoreUnmatched: true });
	for (const eventType of eventTypes) {
		runtimeInput.root.addEventListener?.(eventType, dispatchCaptured, { capture: true });
		// The wrapper has its own identity; pair removal with registration so
		// dispose drops these listeners too.
		storeContainerSubscription(() =>
			runtimeInput.root.removeEventListener?.(eventType, dispatchCaptured, { capture: true }),
		);
	}
	if ((runtimeInput.graph.listSharedDefinitions?.() ?? []).length > 0) {
		runtimeInput.root.addEventListener?.(sharedPatchEventType, receiveSharedPatch, { capture: true });
	}
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
		const boundary = prepared.asyncBoundariesById.get(entry.locator.slice('async-boundary:'.length));
		if (!boundary) continue;
		locators ??= await import('./resume-locators.ts');
		const removed = locators.elementsBetweenAnchors(input.root, boundary.startAnchor, boundary.endAnchor);
		for (const id of locators.hostIdsInsideRemovedElements(prepared.elementsByHostId, removed)) disposeHost(id);
	}
}
