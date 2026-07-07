import type { DomJournalResult } from '@markless/runtime';
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
	const ignoredDisposedEventTargets = new WeakSet<ResumeDomElement>();
	const hostSubscriptionReleases = new Map<string, Array<() => void>>(), containerSubscriptionReleases: Array<() => void> = [];
		const asyncBoundariesById = prepared.asyncBoundariesById;
	let behaviorRuntime: BehaviorRuntime | undefined, branchRuntime: BranchRuntime | undefined;
	let events: EventWiring | undefined, runtimeShared: RuntimeShared | undefined;
	const behaviorHostIds = new Set(input.view.behaviors.map((behavior) => behavior.hostNodeId));
	const getRuntimeShared = async (): Promise<RuntimeShared> =>
		runtimeShared ??= (await import('./resume-runtime-shared.ts')).createResumeRuntimeShared(input);
	const prepareRuntimeShared = async () => { await getRuntimeShared(); };
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
			root: input.root, graph: input.graph, loadSymbol: input.loadSymbol, elementsByHostId, elementHandles, view: input.view, eventTypes, disposedHosts, ignoredDisposedEventTargets, prepareRuntimeShared, flushRuntimeGraph, reportRuntimeError,
				activateBehaviorsFromTrigger: async (hostNodeId) => {
					if (!behaviorHostIds.has(hostNodeId) && !behaviorRuntime) return;
					return (await loadBehaviorRuntime()).activateBehaviorsFromTrigger(hostNodeId);
				},
				behaviorHostIdsForAncestors: (element) =>
					behaviorRuntime?.behaviorHostIdsForAncestors(element) ??
					pendingBehaviorHostIdsForAncestors(element),
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
		for (const eventType of eventTypes) if (!eventTypesBefore.has(eventType)) input.root.addEventListener?.(eventType, dispatchCaptured, { capture: true });
		for (const hostNodeId of branchRuntime.startupArmBehaviorHostIds) await behaviorRuntime?.activateBehaviors(hostNodeId, { flush: false });
		if (branchRuntime.startupArmBehaviorHostIds.length > 0) await flushRuntimeGraph();
		return branchRuntime;
	}
		// Stable-identity capture wrapper: container listeners see every DOM event of
	// a registered type, including non-markless ones (router links) — unmatched
	// passes through. Same reference is used for add and remove.
	function dispatchCaptured(event: ResumeDomEvent): Promise<void> | void {
		return events?.dispatch(event, { ignoreUnmatched: true });
	}
	function disposeHost(hostNodeId: string, options: { readonly ignoreFutureEvents?: boolean } = {}): void {
			disposedHosts.add(hostNodeId);
			const element = elementsByHostId.get(hostNodeId);
		if (element) { if (options.ignoreFutureEvents) ignoredDisposedEventTargets.add(element); events?.eventRecords.delete(element); elementsByHostId.delete(hostNodeId); }
		elementHandles.deleteHost(hostNodeId); behaviorRuntime?.disposeBehaviorHost(hostNodeId);
		for (const release of hostSubscriptionReleases.get(hostNodeId) ?? []) release();
		hostSubscriptionReleases.delete(hostNodeId);
	}
	function dispose(): void {
		for (const eventType of eventTypes) input.root.removeEventListener?.(eventType, dispatchCaptured, { capture: true });
		input.root.removeEventListener?.(SHARED_PATCH_EVENT_TYPE, receiveSharedPatch, { capture: true });
		behaviorRuntime?.disconnect();
		for (const hostNodeId of Array.from(elementsByHostId.keys())) disposeHost(hostNodeId);
			for (const release of containerSubscriptionReleases.splice(0)) release();
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
		async function start(): Promise<void> {
			await (await import('./resume-runtime-start.ts')).startResumeRuntime({
				runtimeInput: input,
				prepared,
				eventTypes,
				getEvents,
				loadBehaviorRuntime,
				loadBranchRuntime,
				behaviorRuntime: () => behaviorRuntime,
				branchRuntime: () => branchRuntime,
				storeContainerSubscription,
				disposeHost,
				receiveSharedPatch,
				sharedPatchEventType: SHARED_PATCH_EVENT_TYPE,
			});
		}
	return {
		start,
		dispatch: async (event: ResumeDomEvent, options?: ResumeDispatchOptions) => (await getEvents()).dispatch(event, options),
		activateBehaviors: async (hostNodeId: string) => (await loadBehaviorRuntime()).activateBehaviors(hostNodeId),
		getElement: (hostNodeId: string) => connectedElement(input.root, elementsByHostId.get(hostNodeId)),
		getAsyncBoundary: (boundaryId: string) => asyncBoundariesById.get(boundaryId),
		getBranch: (branchId: string) => branchRuntime?.branchesById.get(branchId),
		disposeHost: (hostNodeId: string) => disposeHost(hostNodeId, { ignoreFutureEvents: true }),
		dispose,
	};
	}

	function connectedElement(root: ResumeDomElement, element: ResumeDomElement | undefined): ResumeDomElement | undefined { return element && containsElement(root, element) ? element : undefined; }
	function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
		if (root === target) return true;
		for (const child of root.childNodes ?? []) if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
		return false;
	}
