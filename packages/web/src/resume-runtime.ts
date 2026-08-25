import type { DomJournalResult } from '@markless/runtime';
import type { ProtocolStatePayload } from '@markless/serializer';
import type { AsyncBoundarySettleTracker } from './resume-async-wiring.ts';
import type { ArmCommitUpdate, ArmRegistrationDeps } from './resume-commit-arm.ts';
import type {
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDispatchOptions,
	ResumeDomElement,
	ResumeDomEvent,
	ResumePreparedCore,
	ResumeRuntime,
	ResumeRuntimeInput,
} from './resume-types.ts';

const SHARED_PATCH_EVENT_TYPE = 'async:shared-patch';
type RuntimeShared = ReturnType<
	(typeof import('./resume-runtime-shared.ts'))['createResumeRuntimeShared']
>;
type BehaviorRuntime = ReturnType<
	(typeof import('./resume-behaviors.ts'))['createBehaviorRuntime']
>;
type BranchRuntime = ReturnType<(typeof import('./resume-branches.ts'))['wireBranches']>;
type EventWiring = ReturnType<(typeof import('./resume-events.ts'))['createEventWiring']>;

export function createResumeRuntime(
	input: ResumeRuntimeInput,
	prepared: ResumePreparedCore,
	onRegisterComputedRefreshes?: (
		register: (records: ProtocolStatePayload['computed']) => Promise<void>,
	) => void,
): ResumeRuntime {
	const { elementsByHostId, elementHandles } = prepared;
	let storagePlane: import('./storage-plane.ts').StoragePlane | undefined;
	const hasStorageCells = (input.state?.storage?.length ?? 0) > 0;
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
	let captureListenersStarted = false;
	const ignoredDisposedEventTargets = new WeakSet<ResumeDomElement>();
	const hostSubscriptionReleases = new Map<string, Array<() => void>>(),
		containerSubscriptionReleases: Array<() => void> = [];
	const asyncBoundariesById = prepared.asyncBoundariesById;
	let settleTracker: AsyncBoundarySettleTracker | undefined;
	let behaviorRuntime: BehaviorRuntime | undefined, branchRuntime: BranchRuntime | undefined;
	let events: EventWiring | undefined, runtimeShared: RuntimeShared | undefined;
	const behaviorHostIds = new Set(input.view.behaviors.map((behavior) => behavior.hostNodeId));
	const graphNodeIds =
		typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
			? registrationGraphNodeCensus(input.state)
			: undefined;
	const registeredComputedRefreshIds = new Set<string>();
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
		if (disposed) release();
		else containerSubscriptionReleases.push(release);
	};
	const registerComputedRefreshes = async (
		records: ProtocolStatePayload['computed'],
		sharedSeeds?: ProtocolStatePayload['sharedSeeds'],
	) => {
		const fresh = records.filter(
			(record) =>
				record.async === false &&
				typeof record.deriveSymbolId === 'string' &&
				!registeredComputedRefreshIds.has(record.graphNodeId),
		);
		// Seeds arrive once, with the page's own state, so they need no fresh check:
		// one node carries a seed per property, which the node id cannot tell apart.
		if (fresh.length === 0 && !sharedSeeds?.length) return;
		for (const record of fresh) {
			registeredComputedRefreshIds.add(record.graphNodeId);
			graphNodeIds?.add(record.graphNodeId);
		}
		(
			await import('./resume-sync-demand.ts')
		).wireSyncComputedDemandRecordsWithoutLoadingCapability({
			graph: input.graph,
			computed: fresh,
			sharedSeeds,
			root: input.root,
			loadSymbol: input.loadSymbol,
			elementHandles,
			storeContainerSubscription,
		});
	};
	onRegisterComputedRefreshes?.(registerComputedRefreshes);
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
			registerDelegatedEventRecord: input.registerDelegatedEventRecord,
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
				// Target in the id: one graph node can drive two attributes on a host.
				id: `view-dom-update:${domUpdate.hostNodeId}:${domUpdate.target?.kind ?? ''}:${domUpdate.target && 'name' in domUpdate.target ? domUpdate.target.name : ''}:${domUpdate.graphNodeId}:${domUpdate.path.join('.')}`,
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
	const branchWiring: {
		resettleBoundary?: (boundaryId: string) => Promise<DomJournalResult | void>;
		holdPendingFlip?: (graphNodeId: string) => boolean;
	} = {};
	async function loadBranchRuntime(
		options: { readonly skipStartupBranchIds?: ReadonlySet<string> } = {},
	): Promise<BranchRuntime> {
		if (branchRuntime) return branchRuntime;
		const eventTypesBefore = new Set(eventTypes),
			behaviors =
				behaviorRuntime ??
				(viewHasBranchArmBehaviors(input.view) ? await loadBehaviorRuntime() : undefined);
		branchRuntime = (await import('./resume-branches.ts')).wireBranches(
			Object.assign(branchWiring, {
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
				skipStartupBranchIds: options.skipStartupBranchIds,
			}),
		);
		for (const eventType of eventTypes)
			if (!eventTypesBefore.has(eventType) && !input.root.__marklessDelegatedDispatch)
				input.root.addEventListener?.(eventType, dispatchCaptured, { capture: true });
		for (const hostNodeId of branchRuntime.startupArmBehaviorHostIds)
			await behaviorRuntime?.activateBehaviors(hostNodeId, { flush: false });
		if (branchRuntime.startupArmBehaviorHostIds.length > 0) await flushRuntimeGraph();
		return branchRuntime;
	}
	function dispatchCaptured(event: ResumeDomEvent): Promise<void> | void {
		return events?.dispatch(event, { ignoreUnmatched: true });
	}
	async function commitBoundaryArm(
		boundary: ResumeAsyncBoundaryRecord,
		update: ArmCommitUpdate,
	): Promise<void> {
		const registration = await armRegistrationDeps(update.armRecords);
		const { createArmCommitter } = await import('./resume-commit-arm.ts');
		await createArmCommitter(
			{ ...registration, renderHtml: input.renderBranchHtml },
			installArmEventType,
		)(boundary, update);
	}
	async function armRegistrationDeps(
		records: ArmCommitUpdate['armRecords'],
	): Promise<ArmRegistrationDeps> {
		const eventWiring = await getEvents();
		const behaviors = records.behaviors.length > 0 ? await loadBehaviorRuntime() : undefined;
		return {
			root: input.root,
			elementsByHostId,
			disposedHosts,
			disposeHost,
			addEventRecord: eventWiring.addEventRecord,
			registerElementHandle: elementHandles.register,
			graph: input.graph,
			...(graphNodeIds ? { graphNodeIds } : {}),
			registerComputedRefreshes,
			loadSymbol: input.loadSymbol,
			getElementHandle: elementHandles.get,
			storeHostSubscription,
			registerKeyedRepeats: async (records) => {
				await eventWiring.prepareSyncPolicy(
					[],
					records.flatMap((repeat) => repeat.rowEvents),
				);
				const { wireKeyedRepeats } = await import('./resume-keyed-repeats.ts');
				wireKeyedRepeats({
					graph: input.graph,
					view: { ...input.view, keyedRepeats: records },
					elementsByHostId,
					events: eventWiring,
					storeContainerSubscription,
				});
			},
			addBehaviors: behaviors
				? async (hostNodeId, records) => {
						behaviorHostIds.add(hostNodeId);
						behaviors.addBehaviorRecords(hostNodeId, records);
						await behaviors.activateBehaviors(hostNodeId, { flush: false });
					}
				: undefined,
			registerArmBranches: async (boundaryId, records) => {
				const branches = await loadBranchRuntime();
				for (const hostNodeId of branches.registerArmBranches(boundaryId, records as never))
					await behaviorRuntime?.activateBehaviors(hostNodeId, { flush: false });
			},
		};
	}
	function installArmEventType(eventType: string): void {
		if (eventTypes.has(eventType)) return;
		eventTypes.add(eventType);
		if (captureListenersStarted && !input.root.__marklessDelegatedDispatch)
			input.root.addEventListener?.(eventType, dispatchCaptured, { capture: true });
	}
	async function registerServedBoundaryArms(): Promise<void> {
		const { registerArmRecordSet } = await import('./resume-commit-arm.ts');
		for (const boundary of asyncBoundariesById.values()) {
			// Array.isArray cannot narrow the readonly per-arm plan out of the union.
			const armRecords = boundary.armRecords as ResumeArmRecordSet | undefined;
			if (!armRecords || Array.isArray(armRecords)) continue;
			await registerArmRecordSet(
				await armRegistrationDeps(armRecords),
				installArmEventType,
				boundary,
				{ armRecords },
			);
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
		if (disposed) return;
		disposed = true;
		for (const eventType of eventTypes)
			input.root.removeEventListener?.(eventType, dispatchCaptured, { capture: true });
		input.root.removeEventListener?.(SHARED_PATCH_EVENT_TYPE, receiveSharedPatch, {
			capture: true,
		});
		behaviorRuntime?.disconnect();
		// A dispatch after container teardown is never an unmatched defect.
		for (const hostNodeId of Array.from(elementsByHostId.keys()))
			disposeHost(hostNodeId, { ignoreFutureEvents: true });
		for (const release of containerSubscriptionReleases.splice(0)) release();
		storagePlane?.dispose();
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
			for (const hostNodeId of behaviorHostIds)
				if (elementsByHostId.get(hostNodeId) === current) ids.push(hostNodeId);
		}
		return ids;
	}
	async function start(): Promise<void> {
		if (hasStorageCells && !storagePlane)
			storagePlane = (await import('./storage-plane.ts')).createStoragePlane({
				graph: input.graph,
				state: input.state,
			});
		await registerComputedRefreshes(input.state?.computed ?? [], input.state?.sharedSeeds);
		await registerServedBoundaryArms();
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
				Object.assign(branchWiring, wiring);
			},
			receiveSharedPatch,
			sharedPatchEventType: SHARED_PATCH_EVENT_TYPE,
			armRegistrationDeps,
			installArmEventType,
		});
		captureListenersStarted = true;
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
					snapshot = input.graph.peekAsyncSnapshot?.(read.graphNodeId);
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
	const runtime: ResumeRuntime = {
		start,
		dispatch: async (event: ResumeDomEvent, options?: ResumeDispatchOptions) => {
			if (disposed) return;
			const wiring = await getEvents();
			if (!disposed) await wiring.dispatch(event, options);
		},
		activateBehaviors: async (hostNodeId: string) =>
			(await loadBehaviorRuntime()).activateBehaviors(hostNodeId),
		// Settled means every boundary committed its content AND the flush that
		// carried it fully applied.
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
	return runtime;
}

export function registrationGraphNodeCensus(state: ResumeRuntimeInput['state']): Set<string> {
	const ids = new Set<string>();
	for (const cell of state?.cells ?? []) ids.add(cell.graphNodeId);
	for (const computed of state?.computed ?? []) ids.add(computed.graphNodeId);
	return ids;
}

// Local copies of the resume-locators helpers: importing that module regroups
// the wall-counted chunk graph, which costs more than the duplication saves.
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
