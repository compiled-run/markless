import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import type {
	ResumeBehaviorRecord, ResumeDispatchOptions, ResumeDomElement, ResumeDomEvent, ResumePreparedCore, ResumeRuntime, ResumeRuntimeInput,
} from './resume-types.ts';

const SHARED_PATCH_EVENT_TYPE = 'async:shared-patch';
type BehaviorRuntime = ReturnType<typeof import('./resume-behaviors.ts')['createBehaviorRuntime']>;
type BranchRuntime = ReturnType<typeof import('./resume-branches.ts')['wireBranches']>;
type EventWiring = ReturnType<typeof import('./resume-events.ts')['createEventWiring']>;
type RuntimeShared = ReturnType<typeof import('./resume-runtime-shared.ts')['createResumeRuntimeShared']>;

export function createResumeRuntime(input: ResumeRuntimeInput, prepared: ResumePreparedCore): ResumeRuntime {
	const { elementsByHostId, elementHandles } = prepared;
	const eventTypes = new Set<string>(), disposedHosts = new Set<string>();
	const hostSubscriptionReleases = new Map<string, Array<() => void>>(), containerSubscriptionReleases: Array<() => void> = [];
	let asyncBoundariesById = prepared.asyncBoundariesById;
	let behaviorRuntime: BehaviorRuntime | undefined, branchRuntime: BranchRuntime | undefined;
	let events: EventWiring | undefined, runtimeShared: RuntimeShared | undefined;
	const behaviorHostIds = new Set(input.view.behaviors.map((behavior) => behavior.hostNodeId));
	const getRuntimeShared = async (): Promise<RuntimeShared> =>
		runtimeShared ??= (await import('./resume-runtime-shared.ts')).createResumeRuntimeShared(input);
	const flushRuntimeGraph = async () => (await getRuntimeShared()).flushRuntimeGraph();
	const receiveSharedPatch = async (event: ResumeDomEvent) =>
		(await getRuntimeShared()).receiveSharedPatch(event);
	const reportRuntimeError: RuntimeShared['reportRuntimeError'] = async (error, context) =>
		(await getRuntimeShared()).reportRuntimeError(error, context);

	const storeHostSubscription = (hostNodeId: string, release: () => void) => {
		if (typeof release !== 'function') return;
		const releases = hostSubscriptionReleases.get(hostNodeId) ?? [];
		releases.push(release); hostSubscriptionReleases.set(hostNodeId, releases);
	};
	const storeContainerSubscription = (release: () => void) => { if (typeof release === 'function') containerSubscriptionReleases.push(release); };
	async function getEvents(): Promise<EventWiring> {
		if (events) return events;
		const { createEventWiring } = await import('./resume-events.ts');
		events = createEventWiring({
			graph: input.graph, loadSymbol: input.loadSymbol, elementsByHostId, elementHandles, eventTypes, disposedHosts, flushRuntimeGraph, reportRuntimeError,
			activateBehaviorsFromTrigger: async (hostNodeId) => {
				if (!behaviorHostIds.has(hostNodeId) && !behaviorRuntime) return;
				return (await loadBehaviorRuntime()).activateBehaviorsFromTrigger(hostNodeId);
			},
			behaviorHostIdsForAncestors: (element) => behaviorRuntime?.behaviorHostIdsForAncestors(element) ?? pendingBehaviorHostIdsForAncestors(element),
		});
		for (const eventRecord of input.view.events) {
			if (eventRecord.eventName === 'visible') continue;
			const element = elementsByHostId.get(eventRecord.hostNodeId);
			if (element) events.addEventRecord(element, eventRecord);
		}
		return events;
	}
	for (const domUpdate of input.view.domUpdates) {
		if (!domUpdate.symbolId) continue;
		const element = elementsByHostId.get(domUpdate.hostNodeId); if (!element) continue;
		storeHostSubscription(domUpdate.hostNodeId, input.graph.subscribe({
			id: `view-dom-update:${domUpdate.hostNodeId}:${domUpdate.graphNodeId}:${domUpdate.path.join('.')}`, graphNodeId: domUpdate.graphNodeId, path: domUpdate.path,
			async run(value) {
				const symbol = await input.loadSymbol(domUpdate.symbolId!);
				return await symbol({ graph: input.graph, element, getElementHandle: elementHandles.get, domUpdate, value }) as DomJournalResult | void;
			},
		}));
	}

	async function loadBehaviorRuntime(): Promise<BehaviorRuntime> {
		if (behaviorRuntime) return behaviorRuntime;
		const eventState = await getEvents();
		const { createBehaviorRuntime } = await import('./resume-behaviors.ts');
		behaviorRuntime = createBehaviorRuntime({
			root: input.root, graph: input.graph, view: input.view, loadSymbol: input.loadSymbol, elementHandles, elementsByHostId, disposedHosts,
			eventRecords: eventState.eventRecords, flushRuntimeGraph, storeHostSubscription, hostSubscriptionReleases,
			createVisibilityObserver: input.createVisibilityObserver, createRemovalObserver: input.createRemovalObserver, disposeHost,
		});
		return behaviorRuntime;
	}
	async function loadBranchRuntime(options: { readonly skipStartupBranchIds?: ReadonlySet<string> } = {}): Promise<BranchRuntime> {
		if (branchRuntime) return branchRuntime;
		const eventTypesBefore = new Set(eventTypes), behaviors = viewHasBranchArmBehaviors(input.view) ? await loadBehaviorRuntime() : undefined;
		branchRuntime = (await import('./resume-branches.ts')).wireBranches({
			root: input.root, graph: input.graph, view: input.view, loadSymbol: input.loadSymbol, renderBranchHtml: input.renderBranchHtml, elementsByHostId, disposedHosts, elementHandles, events: await getEvents(), eventTypes, storeContainerSubscription, storeHostSubscription, addBehaviorRecords: behaviors?.addBehaviorRecords ?? (() => {}),
			skipStartupBranchIds: options.skipStartupBranchIds,
		});
		for (const eventType of eventTypes) if (!eventTypesBefore.has(eventType)) input.root.addEventListener?.(eventType, events!.dispatch, { capture: true });
		for (const hostNodeId of branchRuntime.startupArmBehaviorHostIds) await behaviorRuntime?.activateBehaviors(hostNodeId, { flush: false });
		if (branchRuntime.startupArmBehaviorHostIds.length > 0) await flushRuntimeGraph();
		return branchRuntime;
	}
	function viewHasBranchArmBehaviors(view: ResumeRuntimeInput['view']): boolean {
		return (view.branches ?? []).some((branch) => (branch.armRecords ?? []).some((arm) => (arm.behaviors?.length ?? 0) > 0));
	}
	function pendingBehaviorHostIdsForAncestors(element: ResumeDomElement | undefined): string[] {
		const ids: string[] = [];
		for (let current = element; current; current = current.parentElement ?? undefined) {
			for (const hostNodeId of behaviorHostIds) {
				if (elementsByHostId.get(hostNodeId) === current) ids.push(hostNodeId);
			}
		}
		return ids;
	}
	function disposeHost(hostNodeId: string): void {
		disposedHosts.add(hostNodeId);
		const element = elementsByHostId.get(hostNodeId);
		if (element) { events?.eventRecords.delete(element); elementsByHostId.delete(hostNodeId); }
		elementHandles.deleteHost(hostNodeId); behaviorRuntime?.disposeBehaviorHost(hostNodeId);
		for (const release of hostSubscriptionReleases.get(hostNodeId) ?? []) release();
		hostSubscriptionReleases.delete(hostNodeId);
	}
	function dispose(): void {
		for (const eventType of eventTypes) input.root.removeEventListener?.(eventType, events.dispatch, { capture: true });
		input.root.removeEventListener?.(SHARED_PATCH_EVENT_TYPE, receiveSharedPatch, { capture: true });
		behaviorRuntime?.disconnect();
		for (const hostNodeId of Array.from(elementsByHostId.keys())) disposeHost(hostNodeId);
		for (const release of containerSubscriptionReleases.splice(0)) release();
	}
	async function start(): Promise<void> {
		const events = await getEvents();
		const rowEvents = (input.view.keyedRepeats ?? []).flatMap((repeat) => repeat.rowEvents);
		await events.prepareSyncPolicy(input.view.events, rowEvents);
		if (input.applyDomJournal) storeContainerSubscription(input.graph.subscribeJournal(async (entries) => {
			await disposeRemovedAsyncRangeHosts(entries);
			branchRuntime?.disposeRemovedRangeHosts(entries, disposeHost, asyncBoundariesById);
			await input.applyDomJournal!(entries);
			await branchRuntime?.materializeFlippedBranchArms(entries, (hostNodeId) => behaviorRuntime!.activateBehaviors(hostNodeId, { flush: false }));
		}));
		if ((input.state?.computed ?? []).some((computed) => computed.async === false && typeof (computed as { readonly deriveSymbolId?: unknown }).deriveSymbolId === 'string')) {
			(await import('./resume-sync-demand.ts')).wireSyncComputedDemandTriggersWithoutLoadingCapability({ graph: input.graph, state: input.state, root: input.root, loadSymbol: input.loadSymbol, elementHandles, storeContainerSubscription });
		}
		if ((input.view.keyedRepeats ?? []).length > 0) {
			(await import('./resume-keyed-repeats.ts')).wireKeyedRepeats({ graph: input.graph, view: input.view, elementsByHostId, events, storeContainerSubscription });
		}
		if (input.view.asyncBoundaries.length > 0) {
			(await import('./resume-async-wiring.ts')).wireAsyncBoundariesWithoutLoadingCapability({ asyncBoundariesById, graph: input.graph, root: input.root, loadSymbol: input.loadSymbol, renderBranchHtml: input.renderBranchHtml, elementHandles, storeContainerSubscription });
		}
		if (input.view.events.some((event) => event.eventName === 'visible')) {
			const behaviors = await loadBehaviorRuntime(); behaviors.installVisibilityObserver(); behaviors.installRemovalObserver();
		}
		// Branches wire eagerly when DECLARED (spec 06 gate 2: wiring is bounded by the
		// records present). Write-demand-triggered branch loading broke flipped-in arm
		// event wiring and child-prop branch resume twice (T007/T007b); revisit only with
		// a hardened trigger design. Declared-but-absent capabilities still never load.
		if ((input.view.branches ?? []).length > 0) await loadBranchRuntime();
		for (const eventType of eventTypes) input.root.addEventListener?.(eventType, events.dispatch, { capture: true });
		if ((input.graph.listSharedDefinitions?.() ?? []).length > 0) input.root.addEventListener?.(SHARED_PATCH_EVENT_TYPE, receiveSharedPatch, { capture: true });
	}
	return {
		start,
		dispatch: async (event: ResumeDomEvent, options?: ResumeDispatchOptions) => (await getEvents()).dispatch(event, options),
		activateBehaviors: async (hostNodeId: string) => (await loadBehaviorRuntime()).activateBehaviors(hostNodeId),
		getElement: (hostNodeId: string) => connectedElement(input.root, elementsByHostId.get(hostNodeId)),
		getAsyncBoundary: (boundaryId: string) => asyncBoundariesById.get(boundaryId),
		getBranch: (branchId: string) => branchRuntime?.branchesById.get(branchId),
		disposeHost,
		dispose,
	};

	async function disposeRemovedAsyncRangeHosts(entries: ReadonlyArray<DomJournalEntry>): Promise<void> {
		let locators: typeof import('./resume-locators.ts') | undefined;
		for (const entry of entries) {
			if (entry.type !== 'removeRange' || !entry.locator.startsWith('async-boundary:')) continue;
			const boundary = asyncBoundariesById.get(entry.locator.slice('async-boundary:'.length)); if (!boundary) continue;
			locators ??= await import('./resume-locators.ts');
			const removed = locators.elementsBetweenAnchors(input.root, boundary.startAnchor, boundary.endAnchor);
			for (const id of locators.hostIdsInsideRemovedElements(elementsByHostId, removed)) disposeHost(id);
		}
	}
}

function connectedElement(root: ResumeDomElement, element: ResumeDomElement | undefined): ResumeDomElement | undefined { return element && containsElement(root, element) ? element : undefined; }
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? []) if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
