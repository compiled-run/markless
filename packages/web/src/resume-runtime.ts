import type { DomJournalResult } from '@markless/runtime';
import type { AsyncBoundarySettleTracker } from './resume-async-wiring.ts';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import type {
	ResumeAsyncBoundaryRecord,
	ResumeDispatchOptions,
	ResumeDomElement,
	ResumeDomEvent,
	ResumePreparedCore,
	ResumeRuntime,
	ResumeRuntimeInput,
} from './resume-types.ts';

const SHARED_PATCH_EVENT_TYPE = 'async:shared-patch';
type BehaviorRuntime = ReturnType<
	(typeof import('./resume-behaviors.ts'))['createBehaviorRuntime']
>;
type BranchRuntime = ReturnType<(typeof import('./resume-branches.ts'))['wireBranches']>;
type EventWiring = ReturnType<(typeof import('./resume-events.ts'))['createEventWiring']>;
type RuntimeShared = ReturnType<
	(typeof import('./resume-runtime-shared.ts'))['createResumeRuntimeShared']
>;

export function createResumeRuntime(
	input: ResumeRuntimeInput,
	prepared: ResumePreparedCore,
): ResumeRuntime {
	const { elementsByHostId, elementHandles } = prepared;
	let disposed = false,
		debugModule: typeof import('./debug-channel.ts') | undefined;
	const debugRoot =
		typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
			? new WeakRef(input.root as unknown as Element)
			: undefined;
	const debugReady = debugRoot
		? import('./debug-channel.ts')
				.then((debug) => {
					debugModule = debug;
					const root = debugRoot.deref();
					if (!disposed && root)
						debug.__marklessDebugStartContainer(root, 'ssr-resume', false);
				})
				.catch(() => {})
		: undefined;
	const eventTypes = new Set<string>(),
		disposedHosts = new Set<string>();
	const ignoredDisposedEventTargets = new WeakSet<ResumeDomElement>();
	const hostSubscriptionReleases = new Map<string, Array<() => void>>(),
		containerSubscriptionReleases: Array<() => void> = [];
	const asyncBoundariesById = prepared.asyncBoundariesById;
	// D8 settled-content tracker: created by the demand-loaded start wiring
	// when the page has async boundaries (deadline-gated pending, navigation
	// transition settle promise, pending minimum duration — T119/T120).
	let settleTracker: AsyncBoundarySettleTracker | undefined;
	let behaviorRuntime: BehaviorRuntime | undefined, branchRuntime: BranchRuntime | undefined;
	let events: EventWiring | undefined, runtimeShared: RuntimeShared | undefined;
	const behaviorHostIds = new Set(input.view.behaviors.map((behavior) => behavior.hostNodeId));
	const getRuntimeShared = async (): Promise<RuntimeShared> =>
		(runtimeShared ??= (await import('./resume-runtime-shared.ts')).createResumeRuntimeShared(
			input,
		));
	const prepareRuntimeShared = async () => {
		await getRuntimeShared();
	};
	const flushRuntimeGraph = async () => (await getRuntimeShared()).flushRuntimeGraph();
	const receiveSharedPatch = async (event: ResumeDomEvent) =>
		(await getRuntimeShared()).receiveSharedPatch(event);
	const reportRuntimeError: RuntimeShared['reportRuntimeError'] = async (error, context) =>
		(await getRuntimeShared()).reportRuntimeError(error, context);

	const storeHostSubscription = (hostNodeId: string, release: () => void) => {
		if (typeof release !== 'function') return;
		const releases = hostSubscriptionReleases.get(hostNodeId) ?? [];
		releases.push(release);
		hostSubscriptionReleases.set(hostNodeId, releases);
	};
	const storeContainerSubscription = (release: () => void) => {
		if (typeof release !== 'function') return;
		if (
			typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' &&
			__MARKLESS_DEBUG_ENABLED__ &&
			disposed
		)
			release();
		else containerSubscriptionReleases.push(release);
	};
	async function getEvents(): Promise<EventWiring> {
		if (events) return events;
		const { createEventWiring } = await import('./resume-events.ts');
		events = createEventWiring({
			root: input.root,
			graph: input.graph,
			loadSymbol: input.loadSymbol,
			elementsByHostId,
			elementHandles,
			view: input.view,
			eventTypes,
			disposedHosts,
			ignoredDisposedEventTargets,
			prepareRuntimeShared,
			flushRuntimeGraph,
			reportRuntimeError,
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
			else if (
				typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' &&
				__MARKLESS_DEBUG_ENABLED__
			)
				void debugReady?.then(() =>
					debugModule?.__marklessDebugRecordViolation({
						code: 'MARKLESS_DEBUG_EVENT_HOST_MISSING',
						message: `Debug registration skipped missing event host ${eventRecord.hostNodeId}.`,
					}),
				);
		}
		return events;
	}
	for (const domUpdate of input.view.domUpdates) {
		if (!domUpdate.symbolId) continue;
		const element = elementsByHostId.get(domUpdate.hostNodeId);
		if (!element) continue;
		storeHostSubscription(
			domUpdate.hostNodeId,
			input.graph.subscribe({
				id: `view-dom-update:${domUpdate.hostNodeId}:${domUpdate.graphNodeId}:${domUpdate.path.join('.')}`,
				graphNodeId: domUpdate.graphNodeId,
				path: domUpdate.path,
				async run(value) {
					const symbol = await input.loadSymbol(domUpdate.symbolId!);
					return (await symbol({
						graph: input.graph,
						element,
						getElementHandle: elementHandles.get,
						domUpdate,
						value,
					})) as DomJournalResult | void;
				},
			}),
		);
	}

	async function loadBehaviorRuntime(): Promise<BehaviorRuntime> {
		if (behaviorRuntime) return behaviorRuntime;
		const eventState = await getEvents();
		const { createBehaviorRuntime } = await import('./resume-behaviors.ts');
		behaviorRuntime = createBehaviorRuntime({
			root: input.root,
			graph: input.graph,
			view: input.view,
			loadSymbol: input.loadSymbol,
			elementHandles,
			elementsByHostId,
			disposedHosts,
			eventRecords: eventState.eventRecords,
			flushRuntimeGraph,
			storeHostSubscription,
			hostSubscriptionReleases,
			createVisibilityObserver: input.createVisibilityObserver,
			createRemovalObserver: input.createRemovalObserver,
			disposeHost,
		});
		return behaviorRuntime;
	}
	// The escalated-flip re-settle path and the pending-flip hold are built by
	// the demand-loaded start wiring (resume-runtime-start.ts, where the
	// settle tracker and re-settle hold live) and connected here before any
	// branch runtime loads.
	let branchWiring:
		| {
				readonly resettleBoundary: (boundaryId: string) => Promise<DomJournalResult | void>;
				readonly holdPendingFlip: (graphNodeId: string) => boolean;
		  }
		| undefined;
	async function loadBranchRuntime(
		options: { readonly skipStartupBranchIds?: ReadonlySet<string> } = {},
	): Promise<BranchRuntime> {
		if (branchRuntime) return branchRuntime;
		const eventTypesBefore = new Set(eventTypes),
			behaviors = viewHasBranchArmBehaviors(input.view)
				? await loadBehaviorRuntime()
				: undefined;
		branchRuntime = (await import('./resume-branches.ts')).wireBranches({
			root: input.root,
			graph: input.graph,
			view: input.view,
			loadSymbol: input.loadSymbol,
			renderBranchHtml: input.renderBranchHtml,
			elementsByHostId,
			disposedHosts,
			elementHandles,
			events: await getEvents(),
			eventTypes,
			storeContainerSubscription,
			storeHostSubscription,
			addBehaviorRecords: behaviors?.addBehaviorRecords ?? (() => {}),
			resettleBoundary: branchWiring?.resettleBoundary,
			holdPendingFlip: branchWiring?.holdPendingFlip,
			skipStartupBranchIds: options.skipStartupBranchIds,
		});
		for (const eventType of eventTypes)
			if (!eventTypesBefore.has(eventType))
				input.root.addEventListener?.(eventType, dispatchCaptured, { capture: true });
		for (const hostNodeId of branchRuntime.startupArmBehaviorHostIds)
			await behaviorRuntime?.activateBehaviors(hostNodeId, { flush: false });
		if (branchRuntime.startupArmBehaviorHostIds.length > 0) await flushRuntimeGraph();
		return branchRuntime;
	}
	// Stable-identity capture wrapper: container listeners see every DOM event of
	// a registered type, including non-markless ones (router links) — unmatched
	// passes through. Same reference is used for add and remove.
	function dispatchCaptured(event: ResumeDomEvent): Promise<void> | void {
		return events?.dispatch(event, { ignoreUnmatched: true });
	}
	// D1 tier 4: bind the runtime's live capabilities (event wiring, behavior
	// runtime, dispose paths) to the commitArm primitive, and give any event
	// type a committed arm introduces its container capture listener.
	async function commitBoundaryArm(
		boundary: ResumeAsyncBoundaryRecord,
		update: ArmCommitUpdate,
	): Promise<void> {
		const eventWiring = await getEvents();
		const behaviors =
			update.armRecords.behaviors.length > 0 ? await loadBehaviorRuntime() : undefined;
		const eventTypesBefore = new Set(eventTypes);
		const { createArmCommitter } = await import('./resume-commit-arm.ts');
		await createArmCommitter({
			root: input.root,
			renderHtml: input.renderBranchHtml,
			elementsByHostId,
			disposedHosts,
			disposeHost,
			addEventRecord: eventWiring.addEventRecord,
			registerElementHandle: elementHandles.register,
			addBehaviors: behaviors
				? async (hostNodeId, records) => {
						behaviorHostIds.add(hostNodeId);
						behaviors.addBehaviorRecords(hostNodeId, records);
						await behaviors.activateBehaviors(hostNodeId, { flush: false });
					}
				: undefined,
			// Fresh arm-branch anchors: rewire the boundary's flips (T104).
			registerArmBranches: async (boundaryId, records) => {
				const branches = await loadBranchRuntime();
				for (const hostNodeId of branches.registerArmBranches(
					boundaryId,
					records as never,
				)) {
					await behaviorRuntime?.activateBehaviors(hostNodeId, { flush: false });
				}
			},
		})(boundary, update);
		for (const eventType of eventTypes) {
			if (!eventTypesBefore.has(eventType))
				input.root.addEventListener?.(eventType, dispatchCaptured, { capture: true });
		}
	}
	function disposeHost(
		hostNodeId: string,
		options: { readonly ignoreFutureEvents?: boolean } = {},
	): void {
		disposedHosts.add(hostNodeId);
		const element = elementsByHostId.get(hostNodeId);
		if (element) {
			if (options.ignoreFutureEvents) ignoredDisposedEventTargets.add(element);
			events?.eventRecords.delete(element);
			if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
				const root = debugRoot?.deref();
				if (root && debugModule)
					debugModule.__marklessDebugInvalidateElement(
						root,
						element as unknown as Element,
					);
			}
			elementsByHostId.delete(hostNodeId);
		}
		elementHandles.deleteHost(hostNodeId);
		behaviorRuntime?.disposeBehaviorHost(hostNodeId);
		for (const release of hostSubscriptionReleases.get(hostNodeId) ?? []) release();
		hostSubscriptionReleases.delete(hostNodeId);
	}
	function dispose(): void {
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
			if (disposed) return;
			disposed = true;
		}
		for (const eventType of eventTypes)
			input.root.removeEventListener?.(eventType, dispatchCaptured, { capture: true });
		input.root.removeEventListener?.(SHARED_PATCH_EVENT_TYPE, receiveSharedPatch, {
			capture: true,
		});
		behaviorRuntime?.disconnect();
		for (const hostNodeId of Array.from(elementsByHostId.keys())) disposeHost(hostNodeId);
		for (const release of containerSubscriptionReleases.splice(0)) release();
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
			const root = debugRoot?.deref();
			if (root && debugModule) debugModule.__marklessDebugDisposeContainer(root);
			else
				void debugReady?.then(() => {
					const lateRoot = debugRoot?.deref();
					if (lateRoot) debugModule?.__marklessDebugDisposeContainer(lateRoot);
				});
		}
	}
	function viewHasBranchArmBehaviors(view: ResumeRuntimeInput['view']): boolean {
		return (view.branches ?? []).some((branch) =>
			(branch.armRecords ?? []).some((arm) => (arm.behaviors?.length ?? 0) > 0),
		);
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
		settleTracker = await (
			await import('./resume-runtime-start.ts')
		).startResumeRuntime({
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
			commitArm: commitBoundaryArm,
			connectBranchWiring: (wiring) => {
				branchWiring = wiring;
			},
			receiveSharedPatch,
			sharedPatchEventType: SHARED_PATCH_EVENT_TYPE,
		});
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__) {
			if (disposed) return;
			await debugReady;
			await events?.whenDebugRegistered?.();
			if (disposed) return;
			const root = debugRoot?.deref();
			if (!root || !debugModule) return;
			debugModule.__marklessDebugActivateContainer(root);
			debugModule.__marklessDebugSetBoundaries(root, debugBoundarySnapshots());
			for (const boundary of asyncBoundariesById.values()) {
				for (const read of boundary.asyncReads) {
					storeContainerSubscription(
						input.graph.subscribe({
							id: `debug-boundary:${boundary.id}:${read.graphNodeId}`,
							graphNodeId: read.graphNodeId,
							path: [],
							run() {
								debugModule?.__marklessDebugSetBoundaries(
									root,
									debugBoundarySnapshots(),
								);
							},
						}),
					);
				}
			}
		}
	}
	const pendingRuns = new Map<string, { readonly version: number; readonly since: number }>();
	function debugBoundarySnapshots(): import('./debug-channel.ts').MarklessDebugBoundarySnapshot[] {
		return [...asyncBoundariesById.values()].flatMap((boundary) =>
			boundary.asyncReads.map((read, readIndex) => {
				let snapshot: { readonly status?: unknown; readonly version?: unknown } | undefined;
				try {
					snapshot = input.graph.peekAsyncSnapshot(read.graphNodeId) as typeof snapshot;
					if (!snapshot) throw new Error('missing async snapshot');
				} catch {
					return {
						boundaryId: boundary.id,
						readIndex,
						graphNodeId: read.graphNodeId,
						status: 'missing' as const,
						runVersion: null,
						pendingSince: null,
						hasSettledContent: settleTracker?.hasSettledContent(boundary.id) === true,
						missingReason: 'graph-read-missing' as const,
					};
				}
				const status = snapshot?.status;
				const version = snapshot?.version;
				if (
					(status !== 'pending' && status !== 'fulfilled' && status !== 'rejected') ||
					typeof version !== 'number'
				) {
					return {
						boundaryId: boundary.id,
						readIndex,
						graphNodeId: read.graphNodeId,
						status: 'missing' as const,
						runVersion: null,
						pendingSince: null,
						hasSettledContent: settleTracker?.hasSettledContent(boundary.id) === true,
						missingReason: 'snapshot-invalid' as const,
					};
				}
				const key = `${boundary.id}:${readIndex}`;
				if (status === 'pending' && pendingRuns.get(key)?.version !== version)
					pendingRuns.set(key, { version, since: Date.now() });
				if (status !== 'pending') pendingRuns.delete(key);
				return {
					boundaryId: boundary.id,
					readIndex,
					graphNodeId: read.graphNodeId,
					status,
					runVersion: version,
					pendingSince:
						status === 'pending' ? (pendingRuns.get(key)?.since ?? null) : null,
					hasSettledContent:
						status === 'fulfilled' ||
						status === 'rejected' ||
						settleTracker?.hasSettledContent(boundary.id) === true,
				};
			}),
		);
	}
	return {
		start,
		dispatch: async (event: ResumeDomEvent, options?: ResumeDispatchOptions) =>
			(await getEvents()).dispatch(event, options),
		activateBehaviors: async (hostNodeId: string) =>
			(await loadBehaviorRuntime()).activateBehaviors(hostNodeId),
		// D8 navigation transitions: settled means every boundary committed its
		// content AND the flush that carried it fully applied.
		whenAsyncBoundariesSettled: async () => {
			if (!settleTracker) return;
			await settleTracker.whenAllSettled();
			await input.graph.flush();
		},
		holdPendingSettleCommits: (minVisibleMs: number) => {
			settleTracker?.holdSettleCommitsFor(minVisibleMs);
		},
		getElement: (hostNodeId: string) =>
			connectedElement(input.root, elementsByHostId.get(hostNodeId)),
		getAsyncBoundary: (boundaryId: string) => asyncBoundariesById.get(boundaryId),
		getBranch: (branchId: string) => branchRuntime?.branchesById.get(branchId),
		disposeHost: (hostNodeId: string) => disposeHost(hostNodeId, { ignoreFutureEvents: true }),
		dispose,
	};
}

// Local copies of the resume-locators helpers: importing that module here
// regroups the wall-counted chunk graph, which costs more than the
// duplication saves (T120 measurement; re-confirmed on this tree).
function connectedElement(
	root: ResumeDomElement,
	element: ResumeDomElement | undefined,
): ResumeDomElement | undefined {
	return element && containsElement(root, element) ? element : undefined;
}
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? [])
		if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
