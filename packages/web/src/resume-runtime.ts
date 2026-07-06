import type { DomJournalEntry, DomJournalResult } from '@markless/runtime';
import type {
	ResumeAsyncBoundaryRecord, ResumeBehaviorRecord, ResumeDispatchOptions, ResumeDomElement, ResumeDomEvent, ResumePreparedCore, ResumeRuntime, ResumeRuntimeErrorContext, ResumeRuntimeInput, ResumeSharedPatchDispatcher,
} from './resume-types.ts';

const SHARED_PATCH_EVENT_TYPE = 'async:shared-patch';
type BehaviorRuntime = ReturnType<typeof import('./resume-behaviors.ts')['createBehaviorRuntime']>;
type BranchRuntime = ReturnType<typeof import('./resume-branches.ts')['wireBranches']>;
type EventWiring = ReturnType<typeof import('./resume-events.ts')['createEventWiring']>;

export function createResumeRuntime(input: ResumeRuntimeInput, prepared: ResumePreparedCore): ResumeRuntime {
	const { elementsByHostId, elementHandles } = prepared;
	const eventTypes = new Set<string>(), disposedHosts = new Set<string>();
	const hostSubscriptionReleases = new Map<string, Array<() => void>>(), containerSubscriptionReleases: Array<() => void> = [];
	let asyncBoundariesById = prepared.asyncBoundariesById;
	let behaviorRuntime: BehaviorRuntime | undefined, branchRuntime: BranchRuntime | undefined, syncComputedRuntimeWired = false;
	let events: EventWiring | undefined, fallbackSharedPatchDispatcher: ResumeSharedPatchDispatcher | undefined;
	const behaviorHostIds = new Set(input.view.behaviors.map((behavior) => behavior.hostNodeId));

	const storeHostSubscription = (hostNodeId: string, release: () => void) => {
		if (typeof release !== 'function') return;
		const releases = hostSubscriptionReleases.get(hostNodeId) ?? [];
		releases.push(release); hostSubscriptionReleases.set(hostNodeId, releases);
	};
	const storeContainerSubscription = (release: () => void) => { if (typeof release === 'function') containerSubscriptionReleases.push(release); };
	const flushRuntimeGraph = async () => {
		await input.graph.flush();
		const patches = input.graph.takeSharedPatches?.() ?? []; if (patches.length === 0) return;
		const dispatchSharedPatch = await getSharedPatchDispatcher(); if (!dispatchSharedPatch) return;
		for (const patch of patches) {
			const result = dispatchSharedPatch(patch); if (isPromiseLike(result)) await result;
		}
	};
	const reportRuntimeError = async (error: unknown, context: ResumeRuntimeErrorContext) => {
		if (!input.onError) return;
		try { const result = input.onError(error, context); if (isPromiseLike(result)) await result; } catch {}
	};
	async function getSharedPatchDispatcher(): Promise<ResumeSharedPatchDispatcher | undefined> {
		if (input.dispatchSharedPatch) return input.dispatchSharedPatch;
		if (fallbackSharedPatchDispatcher || !input.root.dispatchEvent) return fallbackSharedPatchDispatcher;
		fallbackSharedPatchDispatcher = (await import('./resume-handoff.ts')).defaultSharedPatchDispatcher(input.root);
		return fallbackSharedPatchDispatcher;
	}
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
	function wireAsyncBoundariesWithoutLoadingCapability(): void {
		for (const boundary of asyncBoundariesById.values()) {
			for (const asyncRead of boundary.asyncReads) storeContainerSubscription(input.graph.subscribe({
				id: `async-boundary:${boundary.id}:${asyncRead.graphNodeId}:${asyncRead.path.join('.')}`,
				graphNodeId: asyncRead.graphNodeId,
				path: [],
				run(snapshot) {
					if (!boundary.updateSymbolId) return [
						{ type: 'removeRange', locator: `async-boundary:${boundary.id}` },
						{ type: 'insertRange', locator: `async-boundary:${boundary.id}:start`, fragment: { type: 'async-boundary-snapshot', boundaryId: boundary.id, graphNodeId: asyncRead.graphNodeId, path: asyncRead.path, snapshot } },
					] as DomJournalEntry[];
					return settleAsyncBoundaryRange(boundary, snapshot);
				},
			}));
			if (boundary.updateSymbolId) for (const asyncRead of boundary.asyncReads) input.graph.read(asyncRead.graphNodeId, ['status']);
		}
	}
	function wireSyncComputedDemandTriggersWithoutLoadingCapability(): void {
		const records = (input.state?.computed ?? []).filter((computed) => computed.async === false && typeof (computed as { readonly deriveSymbolId?: unknown }).deriveSymbolId === 'string') as Array<NonNullable<ResumeRuntimeInput['state']>['computed'][number] & { readonly deriveSymbolId: string }>;
		for (const computed of records) for (const dependency of computed.dependencies ?? []) storeContainerSubscription(input.graph.subscribe({
			id: `sync-computed-demand:${computed.graphNodeId}:${dependency.graphNodeId}:${dependency.path.join('.')}`,
			graphNodeId: dependency.graphNodeId,
			path: dependency.path,
			async run() { if (syncComputedRuntimeWired) return; syncComputedRuntimeWired = true; (await import('./resume-sync-computed.ts')).wireSyncComputed({ graph: input.graph, state: input.state, root: input.root, loadSymbol: input.loadSymbol, elementHandles, storeContainerSubscription }); },
		}));
	}
	async function settleAsyncBoundaryRange(boundary: ResumeAsyncBoundaryRecord, snapshot: unknown): Promise<DomJournalResult | void> {
		const status = (snapshot as { readonly status?: unknown } | null)?.status;
		if (status !== 'fulfilled' && status !== 'rejected') return;
		const symbol = await input.loadSymbol(boundary.updateSymbolId!);
		const update = await symbol({ graph: input.graph, status, element: input.root, getElementHandle: elementHandles.get, asyncBoundary: boundary });
		if (!isResumeBranchUpdate(update)) return;
		const fragment = input.renderBranchHtml ? input.renderBranchHtml(update.html) : update.html;
		return [{ type: 'removeRange', locator: `async-boundary:${boundary.id}` }, { type: 'insertRange', locator: `async-boundary:${boundary.id}:start`, fragment }];
	}
	async function receiveSharedPatch(event: ResumeDomEvent): Promise<void> {
		const { isResumeSharedPatchEvent } = await import('./resume-handoff.ts');
		if (isResumeSharedPatchEvent(event) && input.graph.applySharedPatch(event.detail)) await flushRuntimeGraph();
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
		wireSyncComputedDemandTriggersWithoutLoadingCapability();
		if ((input.view.keyedRepeats ?? []).length > 0) {
			(await import('./resume-keyed-repeats.ts')).wireKeyedRepeats({ graph: input.graph, view: input.view, elementsByHostId, events, storeContainerSubscription });
		}
		if (input.view.asyncBoundaries.length > 0) wireAsyncBoundariesWithoutLoadingCapability();
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
	function isResumeBranchUpdate(value: unknown): value is { readonly arm: number; readonly html: string } {
		const update = value as { readonly arm?: unknown; readonly html?: unknown } | null;
		return typeof update?.arm === 'number' && typeof update?.html === 'string';
	}
}

function connectedElement(root: ResumeDomElement, element: ResumeDomElement | undefined): ResumeDomElement | undefined { return element && containsElement(root, element) ? element : undefined; }
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? []) if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof (value as { readonly then?: unknown }).then === 'function';
}
