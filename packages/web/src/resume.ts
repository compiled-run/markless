import type { ProtocolViewPayload } from '@markless/serializer';
import type {
	DomJournalEntry,
	DomJournalResult,
	RuntimeGraph,
	RuntimeGraphSharedPatch,
} from '@markless/runtime';

export type ResumeDomNode = {
	readonly nodeType: number;
	readonly childNodes?: ReadonlyArray<ResumeDomNode>;
};

export type ResumeDomElement = ResumeDomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes?: ReadonlyArray<ResumeDomNode>;
	readonly parentElement?: ResumeDomElement | null;
	readonly addEventListener?: (
		type: string,
		listener: (event: ResumeDomEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
	readonly dispatchEvent?: (event: ResumeSharedPatchEvent) => boolean;
};

export type ResumeSharedPatchEvent = {
	readonly type: 'async:shared-patch';
	readonly detail: RuntimeGraphSharedPatch;
	readonly bubbles: true;
	readonly cancelable: false;
	readonly composed: true;
};

export type ResumeDomComment = ResumeDomNode & {
	readonly nodeType: 8;
	readonly data?: string;
};

export type ResumeDomEvent = {
	readonly type: string;
	readonly target: ResumeDomElement | null;
	readonly [key: string]: unknown;
	readonly preventDefault?: () => void;
	readonly stopPropagation?: () => void;
};

export type ResumeVisibilityEntry = {
	readonly target: ResumeDomElement;
	readonly isIntersecting?: boolean;
	readonly intersectionRatio?: number;
};

export type ResumeVisibilityObserver = {
	readonly observe: (element: ResumeDomElement) => void;
	readonly unobserve?: (element: ResumeDomElement) => void;
	readonly disconnect?: () => void;
};

export type ResumeVisibilityObserverFactory = (
	callback: (entries: ReadonlyArray<ResumeVisibilityEntry>) => void,
) => ResumeVisibilityObserver;

type ResumeVisibilityObserverConstructor = new (
	callback: (entries: ReadonlyArray<ResumeVisibilityEntry>) => void,
) => ResumeVisibilityObserver;

export type ResumeRemovalRecord = {
	readonly removedNodes: Iterable<ResumeDomNode>;
};

export type ResumeRemovalObserver = {
	readonly observe: (
		element: ResumeDomElement,
		options?: { readonly childList?: boolean; readonly subtree?: boolean },
	) => void;
	readonly disconnect?: () => void;
};

export type ResumeRemovalObserverFactory = (
	callback: (records: ReadonlyArray<ResumeRemovalRecord>) => void,
) => ResumeRemovalObserver;

type ResumeRemovalObserverConstructor = new (
	callback: (records: ReadonlyArray<ResumeRemovalRecord>) => void,
) => ResumeRemovalObserver;

export type ResumeSyncPolicyCondition =
	| {
			readonly type: 'and';
			readonly conditions: ReadonlyArray<ResumeSyncPolicyCondition>;
	  }
	| {
			readonly type: 'or';
			readonly conditions: ReadonlyArray<ResumeSyncPolicyCondition>;
	  }
	| {
			readonly type: 'not';
			readonly condition: ResumeSyncPolicyCondition;
	  }
	| {
			readonly type: 'graph-truthy';
			readonly graphNodeId: string;
			readonly path?: ReadonlyArray<string>;
	  }
	| {
			readonly type: 'constant-truthy';
			readonly value: unknown;
	  }
	| {
			readonly type: 'event-equals';
			readonly field: string;
			readonly value: unknown;
	  };

export type ResumeSyncPolicyBranch = {
	readonly when: ResumeSyncPolicyCondition;
	readonly actions: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
};

export type ResumeSyncPolicy =
	| ResumeSyncPolicyBranch
	| {
			readonly branches: ReadonlyArray<ResumeSyncPolicyBranch>;
	  };

export type ResumeEventRecord = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly syncPolicy?: ResumeSyncPolicy;
	readonly symbolIds: ReadonlyArray<string>;
};

export type ResumeAsyncBoundaryRecord = {
	readonly id: string;
	readonly startAnchor: ResumeDomComment;
	readonly endAnchor: ResumeDomComment;
	readonly asyncReads: ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'];
};

export type ResumeAsyncBoundaryRead =
	ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'][number];

export type ResumeBehaviorRecord = ProtocolViewPayload['behaviors'][number];

export type ResumeKeyedRepeatRecord = NonNullable<ProtocolViewPayload['keyedRepeats']>[number];

export type ResumeKeyedRepeatRowEvent = ResumeKeyedRepeatRecord['rowEvents'][number];

// One materialized row event host with the row root that positions it.
type ResumeRowEventMatch = {
	readonly repeat: ResumeKeyedRepeatRecord;
	readonly parent: ResumeDomElement;
	readonly rowRoot: ResumeDomElement;
	readonly rowEvent: ResumeKeyedRepeatRowEvent;
};

type ResumeRowEventRecords = WeakMap<ResumeDomElement, Map<string, ResumeRowEventMatch>>;

type ResumeDispatchMatch =
	| { readonly element: ResumeDomElement; readonly eventRecord: ResumeEventRecord }
	| { readonly element: ResumeDomElement; readonly rowMatch: ResumeRowEventMatch };

export type ResumeBranchRecord = {
	readonly id: string;
	readonly startAnchor: ResumeDomComment;
	readonly endAnchor: ResumeDomComment;
	readonly symbolId: string;
	readonly testReads: NonNullable<
		NonNullable<ProtocolViewPayload['branches']>[number]['testReads']
	>;
	readonly armTests?: ReadonlyArray<unknown>;
};

// A lazy branch-update symbol returns the newly selected arm plus the rebuilt
// HTML for the range between the branch comment anchors.
export type ResumeBranchUpdate = {
	readonly arm: number;
	readonly html: string;
};

export type ResumeViewRecord = {
	readonly locators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly strategy: 'dom-order';
		readonly index: number;
		readonly tagName: string;
	}>;
	readonly events: ReadonlyArray<ResumeEventRecord>;
	readonly domUpdates: ProtocolViewPayload['domUpdates'];
	readonly behaviors: ProtocolViewPayload['behaviors'];
	readonly elementHandles: ProtocolViewPayload['elementHandles'];
	readonly asyncBoundaries: ProtocolViewPayload['asyncBoundaries'];
	readonly branches?: ProtocolViewPayload['branches'];
	readonly keyedRepeats?: ProtocolViewPayload['keyedRepeats'];
};

export type ResumeSymbolContext = {
	readonly graph: RuntimeGraph;
	readonly read?: RuntimeGraph['read'];
	readonly key?: unknown;
	readonly signal?: AbortSignal;
	readonly event?: ResumeDomEvent;
	readonly element: ResumeDomElement;
	readonly getElementHandle: (handleIdOrName: string) => ResumeDomElement | undefined;
	// Keyed repeat row values; lowered symbols read context.locals.<itemName>.
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly behaviorInputs?: ReadonlyArray<unknown>;
	readonly domUpdate?: ProtocolViewPayload['domUpdates'][number];
	readonly value?: unknown;
	readonly asyncBoundary?: ResumeAsyncBoundaryRecord;
	readonly asyncRead?: ResumeAsyncBoundaryRead;
};

export type ResumeBehaviorCleanup = () => void;

export type ResumeSymbol = (
	context: ResumeSymbolContext,
) =>
	| void
	| DomJournalResult
	| ResumeBehaviorCleanup
	| ResumeBranchUpdate
	| Promise<void | DomJournalResult | ResumeBehaviorCleanup | ResumeBranchUpdate>;

export type ResumeRuntimeErrorContext = {
	readonly phase: 'event';
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly symbolId?: string;
	readonly event: ResumeDomEvent;
	readonly element: ResumeDomElement;
};

export type ResumeRuntimeErrorHook = (
	error: unknown,
	context: ResumeRuntimeErrorContext,
) => void | Promise<void>;

export type ResumeSharedPatchDispatcher = (patch: RuntimeGraphSharedPatch) => void | Promise<void>;

export type ResumeRuntimeInput = {
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly view: ResumeViewRecord;
	readonly loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>;
	// Builds DOM nodes from branch-update HTML; browser default arrives with S6.
	readonly renderBranchHtml?: (html: string) => ReadonlyArray<ResumeDomNode>;
	readonly createVisibilityObserver?: ResumeVisibilityObserverFactory;
	readonly createRemovalObserver?: ResumeRemovalObserverFactory;
	readonly applyDomJournal?: (entries: ReadonlyArray<DomJournalEntry>) => void | Promise<void>;
	readonly dispatchSharedPatch?: ResumeSharedPatchDispatcher;
	readonly onError?: ResumeRuntimeErrorHook;
};

export type ResumeDispatchOptions = {
	readonly syncPolicyAlreadyApplied?: boolean;
};

export type ResumeRuntime = {
	readonly start: () => Promise<void>;
	readonly dispatch: (event: ResumeDomEvent, options?: ResumeDispatchOptions) => Promise<void>;
	readonly activateBehaviors: (hostNodeId: string) => Promise<void>;
	readonly getElement: (hostNodeId: string) => ResumeDomElement | undefined;
	readonly getAsyncBoundary: (boundaryId: string) => ResumeAsyncBoundaryRecord | undefined;
	readonly getBranch: (branchId: string) => ResumeBranchRecord | undefined;
	readonly disposeHost: (hostNodeId: string) => void;
};

export type RuntimeResumeErrorCode =
	| 'MARKLESS_RESUME_LOCATOR_MISSING'
	| 'MARKLESS_RESUME_LOCATOR_MISMATCH';

export type RuntimeResumeDiagnostic = {
	readonly code: RuntimeResumeErrorCode;
	readonly severity: 'error';
	readonly phase: 'resume';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly hostNodeId?: string;
	readonly boundaryId?: string;
	readonly elementLocator?: string;
	readonly expectedTagName?: string;
	readonly actualTagName?: string;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class RuntimeResumeError extends Error implements RuntimeResumeDiagnostic {
	readonly code: RuntimeResumeErrorCode;
	readonly severity: 'error';
	readonly phase: 'resume';
	readonly title: string;
	readonly why: string;
	readonly hostNodeId?: string;
	readonly boundaryId?: string;
	readonly elementLocator?: string;
	readonly expectedTagName?: string;
	readonly actualTagName?: string;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;

	constructor(diagnostic: RuntimeResumeDiagnostic) {
		super(diagnostic.message);
		this.name = 'RuntimeResumeError';
		this.code = diagnostic.code;
		this.severity = diagnostic.severity;
		this.phase = diagnostic.phase;
		this.title = diagnostic.title;
		this.why = diagnostic.why;
		this.hostNodeId = diagnostic.hostNodeId;
		this.boundaryId = diagnostic.boundaryId;
		this.elementLocator = diagnostic.elementLocator;
		this.expectedTagName = diagnostic.expectedTagName;
		this.actualTagName = diagnostic.actualTagName;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
	}
}

type ResumeCleanupKind = 'visibility' | 'behavior';

type ResumeHostCleanup = {
	readonly kind: ResumeCleanupKind;
	readonly cleanup: ResumeBehaviorCleanup;
};

const SHARED_PATCH_EVENT_TYPE = 'async:shared-patch';

export function createResumeRuntime(input: ResumeRuntimeInput): ResumeRuntime {
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	const asyncBoundariesById = materializeAsyncBoundaryLocators(
		input.root,
		input.view.asyncBoundaries,
	);
	const eventRecords = new WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>();
	const visibleRecords = new WeakMap<ResumeDomElement, ResumeEventRecord>();
	const visibleEntries: Array<{
		readonly element: ResumeDomElement;
		readonly eventRecord: ResumeEventRecord;
	}> = [];
	const visibleElementsByHostId = new Map<string, ResumeDomElement>();
	const activeVisibleElements = new Set<ResumeDomElement>();
	const disposedHosts = new Set<string>();
	const eventTypes = new Set<string>();
	const elementHandles = materializeElementHandles(
		input.root,
		elementsByHostId,
		input.view.elementHandles,
	);
	const hostCleanups = new Map<string, ResumeHostCleanup[]>();
	const behaviorRecordsByHostId = groupBehaviorRecords(input.view.behaviors);
	const activeBehaviorHosts = new Set<string>();
	const dispatchSharedPatch =
		input.dispatchSharedPatch ?? defaultSharedPatchDispatcher(input.root);
	if (input.applyDomJournal) {
		input.graph.subscribeJournal(input.applyDomJournal);
	}
	let visibilityObserver: ResumeVisibilityObserver | undefined;
	let removalObserver: ResumeRemovalObserver | undefined;

	for (const eventRecord of input.view.events) {
		const element = elementsByHostId.get(eventRecord.hostNodeId);
		if (!element) continue;

		if (eventRecord.eventName === 'visible') {
			visibleRecords.set(element, eventRecord);
			visibleEntries.push({ element, eventRecord });
			visibleElementsByHostId.set(eventRecord.hostNodeId, element);
			continue;
		}

		let recordsByEventName = eventRecords.get(element);
		if (!recordsByEventName) {
			recordsByEventName = new Map();
			eventRecords.set(element, recordsByEventName);
		}
		recordsByEventName.set(eventRecord.eventName, eventRecord);
		eventTypes.add(eventRecord.eventName);
	}

	// SSR renders keyed repeat rows as the parent's first items.length element
	// children; @empty replaces the rows, so an empty collection maps to none.
	const rowEventRecords: ResumeRowEventRecords = new WeakMap();
	for (const repeat of input.view.keyedRepeats ?? []) {
		const parent = elementsByHostId.get(repeat.parentHostNodeId);
		if (!parent) continue;

		const items = readRepeatCollection(input.graph, repeat);
		for (const rowRoot of elementChildren(parent).slice(0, items.length)) {
			for (const rowEvent of repeat.rowEvents) {
				const host = rowEventHost(rowRoot, rowEvent.hostPath);
				if (!host) continue;

				let recordsByEventName = rowEventRecords.get(host);
				if (!recordsByEventName) {
					recordsByEventName = new Map();
					rowEventRecords.set(host, recordsByEventName);
				}
				recordsByEventName.set(rowEvent.eventName, { repeat, parent, rowRoot, rowEvent });
				eventTypes.add(rowEvent.eventName);
			}
		}
	}

	for (const domUpdate of input.view.domUpdates) {
		if (!domUpdate.symbolId) continue;

		const element = elementsByHostId.get(domUpdate.hostNodeId);
		if (!element) continue;

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
		});
	}

	for (const asyncBoundary of asyncBoundariesById.values()) {
		for (const asyncRead of asyncBoundary.asyncReads) {
			input.graph.subscribe({
				id: `async-boundary:${asyncBoundary.id}:${asyncRead.graphNodeId}:${asyncRead.path.join('.')}`,
				graphNodeId: asyncRead.graphNodeId,
				path: [],
				run(snapshot) {
					return createAsyncBoundaryJournalEntries(asyncBoundary, asyncRead, snapshot);
				},
			});
		}
	}

	const branchesById = new Map<string, ResumeBranchRecord>();
	for (const branch of materializeBranchLocators(input.root, input.view.branches ?? [])) {
		branchesById.set(branch.id, branch);
		// Seed the arm from the current test value; no symbol load until a flip.
		let currentArm = readBranchArm(input.graph, branch);
		for (const testRead of branch.testReads) {
			input.graph.subscribe({
				id: `branch-test:${branch.id}:${testRead.graphNodeId}:${testRead.path.join('.')}`,
				graphNodeId: testRead.graphNodeId,
				path: testRead.path,
				async run() {
					const newArm = readBranchArm(input.graph, branch);
					if (newArm === currentArm) return;

					const loadedSymbol = input.loadSymbol(branch.symbolId);
					const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
					const maybeUpdate = symbol({
						graph: input.graph,
						element: input.root,
						getElementHandle: elementHandles.get,
					});
					const update = isPromiseLike(maybeUpdate) ? await maybeUpdate : maybeUpdate;
					if (!isResumeBranchUpdate(update)) return;

					currentArm = update.arm;
					const fragment = input.renderBranchHtml
						? input.renderBranchHtml(update.html)
						: update.html;
					return [
						{ type: 'removeRange', locator: `branch:${branch.id}` },
						{ type: 'insertRange', locator: `branch:${branch.id}:start`, fragment },
					];
				},
			});
		}
	}

	for (const behaviorRecord of input.view.behaviors) {
		for (const inputGraphRead of behaviorRecord.inputGraphReads ?? []) {
			input.graph.subscribe({
				id: `behavior-input:${behaviorRecord.hostNodeId}:${inputGraphRead.inputIndex}:${inputGraphRead.graphNodeId}:${inputGraphRead.path.join('.')}`,
				graphNodeId: inputGraphRead.graphNodeId,
				path: inputGraphRead.path,
				async run() {
					if (!activeBehaviorHosts.has(behaviorRecord.hostNodeId)) return;

					await activateBehaviors(behaviorRecord.hostNodeId, { flush: false });
				},
			});
		}
	}

	async function dispatch(
		event: ResumeDomEvent,
		options: ResumeDispatchOptions = {},
	): Promise<void> {
		const target = event.target;
		if (!target) return;

		const matched = findDispatchMatch(target, event.type, eventRecords, rowEventRecords);
		if (!matched) return;

		if ('rowMatch' in matched) {
			await dispatchRowEvent(matched.element, matched.rowMatch, event, options);
			return;
		}

		const { element, eventRecord } = matched;

		if (eventRecord.syncPolicy && !options.syncPolicyAlreadyApplied)
			runSyncPolicyActions(eventRecord.syncPolicy, input.graph, event);

		let activeSymbolId: string | undefined;
		try {
			const behaviorActivation = activateBehaviorsFromTrigger(eventRecord.hostNodeId);
			if (behaviorActivation) await behaviorActivation;

			for (const symbolId of eventRecord.symbolIds) {
				activeSymbolId = symbolId;
				const loadedSymbol = input.loadSymbol(symbolId);
				const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
				const result = symbol({
					graph: input.graph,
					event,
					element,
					getElementHandle: elementHandles.get,
				});
				if (isPromiseLike(result)) await result;
			}
		} catch (error) {
			await reportRuntimeError(error, {
				phase: 'event',
				hostNodeId: eventRecord.hostNodeId,
				eventName: eventRecord.eventName,
				symbolId: activeSymbolId,
				event,
				element,
			});
			throw error;
		} finally {
			await flushRuntimeGraph();
		}
	}

	async function dispatchRowEvent(
		element: ResumeDomElement,
		match: ResumeRowEventMatch,
		event: ResumeDomEvent,
		options: ResumeDispatchOptions,
	): Promise<void> {
		const { repeat, parent, rowRoot, rowEvent } = match;

		if (rowEvent.syncPolicy && !options.syncPolicyAlreadyApplied)
			runSyncPolicyActions(rowEvent.syncPolicy, input.graph, event);

		let activeSymbolId: string | undefined;
		try {
			// Row identity is positional: the row index among the parent's element
			// children and the collection are both read fresh at dispatch time.
			const rowIndex = elementChildren(parent).indexOf(rowRoot);
			const items = readRepeatCollection(input.graph, repeat);
			const locals = { [repeat.itemName]: rowIndex >= 0 ? items[rowIndex] : undefined };

			for (const symbolId of rowEvent.symbolIds) {
				activeSymbolId = symbolId;
				const loadedSymbol = input.loadSymbol(symbolId);
				const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
				const result = symbol({
					graph: input.graph,
					event,
					element,
					getElementHandle: elementHandles.get,
					locals,
				});
				if (isPromiseLike(result)) await result;
			}
		} catch (error) {
			await reportRuntimeError(error, {
				phase: 'event',
				hostNodeId: repeat.parentHostNodeId,
				eventName: rowEvent.eventName,
				symbolId: activeSymbolId,
				event,
				element,
			});
			throw error;
		} finally {
			await flushRuntimeGraph();
		}
	}

	async function reportRuntimeError(
		error: unknown,
		context: ResumeRuntimeErrorContext,
	): Promise<void> {
		if (!input.onError) return;

		try {
			const result = input.onError(error, context);
			if (isPromiseLike(result)) await result;
		} catch {
			// Preserve the original runtime failure that triggered the hook.
		}
	}

	async function flushRuntimeGraph(): Promise<void> {
		await input.graph.flush();
		if (!dispatchSharedPatch) return;

		for (const patch of input.graph.takeSharedPatches()) {
			const result = dispatchSharedPatch(patch);
			if (isPromiseLike(result)) await result;
		}
	}

	async function receiveSharedPatch(
		event: ResumeDomEvent | ResumeSharedPatchEvent,
	): Promise<void> {
		if (!isResumeSharedPatchEvent(event)) return;
		if (input.graph.applySharedPatch(event.detail)) await flushRuntimeGraph();
	}

	function activateBehaviorsFromTrigger(hostNodeId: string): Promise<void> | undefined {
		if (activeBehaviorHosts.has(hostNodeId)) return undefined;
		if ((behaviorRecordsByHostId.get(hostNodeId) ?? []).length === 0) return undefined;

		return activateBehaviors(hostNodeId, { flush: false });
	}

	function storeHostCleanup(
		hostNodeId: string,
		kind: ResumeCleanupKind,
		cleanup: ResumeBehaviorCleanup,
	): void {
		const cleanups = hostCleanups.get(hostNodeId) ?? [];
		cleanups.push({ kind, cleanup });
		hostCleanups.set(hostNodeId, cleanups);
	}

	function runHostCleanups(hostNodeId: string, kind?: ResumeCleanupKind): void {
		const cleanups = hostCleanups.get(hostNodeId) ?? [];
		const remaining = kind ? cleanups.filter((entry) => entry.kind !== kind) : [];

		for (const entry of [...cleanups].reverse()) {
			if (!kind || entry.kind === kind) {
				entry.cleanup();
			}
		}

		if (remaining.length > 0) {
			hostCleanups.set(hostNodeId, remaining);
		} else {
			hostCleanups.delete(hostNodeId);
		}
	}

	async function activateBehaviors(
		hostNodeId: string,
		options: { readonly flush?: boolean } = {},
	): Promise<void> {
		if (disposedHosts.has(hostNodeId)) return;

		const element = connectedElement(input.root, elementsByHostId.get(hostNodeId));
		if (!element) return;

		const behaviorRecords = behaviorRecordsByHostId.get(hostNodeId) ?? [];
		if (behaviorRecords.length === 0) return;

		activeBehaviorHosts.add(hostNodeId);
		runHostCleanups(hostNodeId, 'behavior');

		try {
			for (const behaviorRecord of behaviorRecords) {
				if (!behaviorRecord.symbolId) continue;

				const loadedSymbol = input.loadSymbol(behaviorRecord.symbolId);
				const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
				const maybeResult = symbol({
					graph: input.graph,
					element,
					getElementHandle: elementHandles.get,
					behaviorInputs: behaviorInputs(behaviorRecord, input.graph),
				});
				const result = isPromiseLike(maybeResult) ? await maybeResult : maybeResult;

				if (typeof result === 'function') {
					storeHostCleanup(hostNodeId, 'behavior', result);
				}
			}
		} finally {
			if (options.flush !== false) await flushRuntimeGraph();
		}
	}

	async function runVisibleEvent(
		element: ResumeDomElement,
		eventRecord: ResumeEventRecord,
	): Promise<void> {
		try {
			const behaviorActivation = activateBehaviorsFromTrigger(eventRecord.hostNodeId);
			if (behaviorActivation) await behaviorActivation;

			for (const symbolId of eventRecord.symbolIds) {
				const loadedSymbol = input.loadSymbol(symbolId);
				const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
				const maybeResult = symbol({
					graph: input.graph,
					read: input.graph.read,
					element,
					getElementHandle: elementHandles.get,
				});
				const result = isPromiseLike(maybeResult) ? await maybeResult : maybeResult;

				if (typeof result === 'function') {
					storeHostCleanup(eventRecord.hostNodeId, 'visibility', result);
				}
			}
		} finally {
			await flushRuntimeGraph();
		}
	}

	function installVisibilityObserver(): void {
		const createObserver = input.createVisibilityObserver ?? defaultVisibilityObserverFactory();
		if (visibleEntries.length === 0 || !createObserver) return;

		const fired = new WeakSet<ResumeDomElement>();
		const observer = createObserver((entries) => {
			for (const entry of entries) {
				if (!isVisibleEntry(entry) || fired.has(entry.target)) continue;

				const eventRecord = visibleRecords.get(entry.target);
				if (!eventRecord) continue;
				if (disposedHosts.has(eventRecord.hostNodeId)) continue;

				fired.add(entry.target);
				visibleRecords.delete(entry.target);
				activeVisibleElements.delete(entry.target);
				visibilityObserver?.unobserve?.(entry.target);
				void runVisibleEvent(entry.target, eventRecord);
			}
		});
		visibilityObserver = observer;

		for (const { element } of visibleEntries) {
			const eventRecord = visibleRecords.get(element);
			if (!eventRecord || disposedHosts.has(eventRecord.hostNodeId)) continue;

			activeVisibleElements.add(element);
			observer.observe(element);
		}
	}

	function installRemovalObserver(): void {
		const createObserver = input.createRemovalObserver ?? defaultRemovalObserverFactory();
		if (!createObserver || input.view.locators.length === 0) return;

		removalObserver = createObserver((records) => {
			const removedElements = new Set<ResumeDomElement>();
			for (const record of records) {
				for (const node of record.removedNodes) {
					collectRemovedElements(node, removedElements);
				}
			}
			if (removedElements.size === 0) return;

			for (const hostNodeId of hostIdsInsideRemovedElements(
				elementsByHostId,
				removedElements,
			)) {
				disposeHost(hostNodeId);
			}
		});
		removalObserver.observe(input.root, { childList: true, subtree: true });
	}

	function disposeHost(hostNodeId: string): void {
		disposedHosts.add(hostNodeId);
		const element = elementsByHostId.get(hostNodeId);
		const visibleElement = visibleElementsByHostId.get(hostNodeId) ?? element;
		if (element) {
			eventRecords.delete(element);
			elementsByHostId.delete(hostNodeId);
		}
		if (visibleElement) {
			visibleRecords.delete(visibleElement);
			if (activeVisibleElements.has(visibleElement)) {
				visibilityObserver?.unobserve?.(visibleElement);
				activeVisibleElements.delete(visibleElement);
			}
		}
		visibleElementsByHostId.delete(hostNodeId);
		elementHandles.deleteHost(hostNodeId);
		activeBehaviorHosts.delete(hostNodeId);

		runHostCleanups(hostNodeId);

		if (elementsByHostId.size === 0) {
			removalObserver?.disconnect?.();
			removalObserver = undefined;
		}
	}

	return {
		async start() {
			for (const eventType of eventTypes) {
				input.root.addEventListener?.(eventType, dispatch, { capture: true });
			}
			if (input.graph.listSharedDefinitions().length > 0) {
				input.root.addEventListener?.(
					SHARED_PATCH_EVENT_TYPE,
					receiveSharedPatch as (event: ResumeDomEvent) => Promise<void>,
					{ capture: true },
				);
			}

			installVisibilityObserver();
			installRemovalObserver();
		},
		dispatch,
		activateBehaviors,
		getElement(hostNodeId) {
			return connectedElement(input.root, elementsByHostId.get(hostNodeId));
		},
		getAsyncBoundary(boundaryId) {
			return asyncBoundariesById.get(boundaryId);
		},
		getBranch(branchId) {
			return branchesById.get(branchId);
		},
		disposeHost,
	};
}

function createAsyncBoundaryJournalEntries(
	boundary: ResumeAsyncBoundaryRecord,
	asyncRead: ResumeAsyncBoundaryRead,
	snapshot: unknown,
): DomJournalEntry[] {
	return [
		{ type: 'removeRange', locator: asyncBoundaryRangeLocator(boundary.id) },
		{
			type: 'insertRange',
			locator: asyncBoundaryStartLocator(boundary.id),
			fragment: {
				type: 'async-boundary-snapshot',
				boundaryId: boundary.id,
				graphNodeId: asyncRead.graphNodeId,
				path: asyncRead.path,
				snapshot,
			},
		},
	];
}

function asyncBoundaryRangeLocator(boundaryId: string): string {
	return `async-boundary:${boundaryId}`;
}

function asyncBoundaryStartLocator(boundaryId: string): string {
	return `async-boundary:${boundaryId}:start`;
}

// testReads[0] is the branch test expression: truthy selects arm 0, else arm 1.
function readBranchArm(graph: RuntimeGraph, branch: ResumeBranchRecord): number {
	const testRead = branch.testReads[0]!;
	const value = graph.read(testRead.graphNodeId, testRead.path);
	// Switch sites select by literal case tests with @default as fallback;
	// if-sites select by truthiness.
	if (branch.armTests) {
		for (let index = 0; index < branch.armTests.length; index++) {
			if (branch.armTests[index] !== null && value === branch.armTests[index]) {
				return index;
			}
		}
		return branch.armTests.indexOf(null);
	}
	return value ? 0 : 1;
}

function isResumeBranchUpdate(value: unknown): value is ResumeBranchUpdate {
	const update = value as { readonly arm?: unknown; readonly html?: unknown } | null;
	return typeof update?.arm === 'number' && typeof update?.html === 'string';
}

function materializeBranchLocators(
	root: ResumeDomElement,
	branches: NonNullable<ResumeViewRecord['branches']>,
): ResumeBranchRecord[] {
	const records: ResumeBranchRecord[] = [];
	if (branches.length === 0) return records;

	// Branch anchors and async boundary anchors index one flat document-order
	// comment stream, so both kinds share the same absolute indexes.
	const comments = walkComments(root);
	for (const branch of branches) {
		// Records without an update symbol or test reads are static: skipped entirely.
		if (!branch.symbolId || !branch.testReads || branch.testReads.length === 0) continue;

		const startAnchor = comments[branch.startAnchor.index];
		const endAnchor = comments[branch.endAnchor.index];
		if (!startAnchor) {
			throw missingCommentAnchorError(branch.id, 'startAnchor', branch.startAnchor.index);
		}
		if (!endAnchor) {
			throw missingCommentAnchorError(branch.id, 'endAnchor', branch.endAnchor.index);
		}

		records.push({
			id: branch.id,
			startAnchor,
			endAnchor,
			symbolId: branch.symbolId,
			testReads: branch.testReads,
			armTests: branch.armTests,
		});
	}

	return records;
}

function behaviorInputs(
	behaviorRecord: ResumeBehaviorRecord,
	graph: RuntimeGraph,
): ReadonlyArray<unknown> {
	const graphReads = behaviorRecord.inputGraphReads ?? [];
	const inputCount = Math.max(
		behaviorRecord.inputSources.length,
		...graphReads.map((read) => read.inputIndex + 1),
	);
	const inputs =
		behaviorRecord.inputValues !== undefined
			? [...behaviorRecord.inputValues]
			: Array.from({ length: inputCount }, () => undefined);

	for (const graphRead of graphReads) {
		inputs[graphRead.inputIndex] = graph.read(graphRead.graphNodeId, graphRead.path);
	}

	return inputs;
}

function groupBehaviorRecords(
	behaviors: ResumeViewRecord['behaviors'],
): Map<string, ResumeBehaviorRecord[]> {
	const byHostId = new Map<string, ResumeBehaviorRecord[]>();

	for (const behavior of behaviors) {
		const records = byHostId.get(behavior.hostNodeId) ?? [];
		records.push(behavior);
		byHostId.set(behavior.hostNodeId, records);
	}

	return byHostId;
}

function isVisibleEntry(entry: ResumeVisibilityEntry): boolean {
	return entry.isIntersecting === true || (entry.intersectionRatio ?? 0) > 0;
}

function defaultVisibilityObserverFactory(): ResumeVisibilityObserverFactory | undefined {
	const observer = (
		globalThis as unknown as {
			readonly IntersectionObserver?: ResumeVisibilityObserverConstructor;
		}
	).IntersectionObserver;
	if (!observer) return undefined;

	return (callback) => new observer(callback);
}

function defaultRemovalObserverFactory(): ResumeRemovalObserverFactory | undefined {
	const observer = (
		globalThis as unknown as {
			readonly MutationObserver?: ResumeRemovalObserverConstructor;
		}
	).MutationObserver;
	if (!observer) return undefined;

	return (callback) => new observer(callback);
}

function defaultSharedPatchDispatcher(
	root: ResumeDomElement,
): ResumeSharedPatchDispatcher | undefined {
	if (!root.dispatchEvent) return undefined;

	return (patch) => {
		root.dispatchEvent?.(createSharedPatchEvent(patch));
	};
}

type ResumeCustomEventConstructor = new (
	type: typeof SHARED_PATCH_EVENT_TYPE,
	init: {
		readonly detail: RuntimeGraphSharedPatch;
		readonly bubbles: true;
		readonly cancelable: false;
		readonly composed: true;
	},
) => ResumeSharedPatchEvent;

function createSharedPatchEvent(patch: RuntimeGraphSharedPatch): ResumeSharedPatchEvent {
	const CustomEventConstructor = (
		globalThis as {
			readonly CustomEvent?: ResumeCustomEventConstructor;
		}
	).CustomEvent;
	const init = {
		detail: patch,
		bubbles: true,
		cancelable: false,
		composed: true,
	} as const;

	if (CustomEventConstructor) {
		return new CustomEventConstructor(SHARED_PATCH_EVENT_TYPE, init);
	}

	return {
		type: SHARED_PATCH_EVENT_TYPE,
		...init,
	};
}

function isResumeSharedPatchEvent(
	event: ResumeDomEvent | ResumeSharedPatchEvent,
): event is ResumeSharedPatchEvent {
	return (
		event.type === SHARED_PATCH_EVENT_TYPE &&
		isRuntimeGraphSharedPatch((event as { readonly detail?: unknown }).detail)
	);
}

function isRuntimeGraphSharedPatch(value: unknown): value is RuntimeGraphSharedPatch {
	if (!value || typeof value !== 'object') return false;

	const patch = value as {
		readonly id?: unknown;
		readonly scope?: unknown;
		readonly version?: unknown;
		readonly patch?: unknown;
	};
	if (typeof patch.id !== 'string') return false;
	if (patch.scope !== undefined && typeof patch.scope !== 'string') return false;
	if (typeof patch.version !== 'number' || !Number.isInteger(patch.version)) return false;
	if (!Array.isArray(patch.patch)) return false;

	return patch.patch.every((operation) => {
		if (!Array.isArray(operation) || operation.length !== 3) return false;
		const [type, path] = operation;
		return (
			type === 'set' &&
			Array.isArray(path) &&
			path.every((segment) => typeof segment === 'string')
		);
	});
}

function collectRemovedElements(
	removedNode: ResumeDomNode,
	removedElements: Set<ResumeDomElement>,
): void {
	if (removedNode.nodeType !== 1) return;

	const element = removedNode as ResumeDomElement;
	removedElements.add(element);
	for (const child of element.childNodes ?? []) {
		collectRemovedElements(child, removedElements);
	}
}

function hostIdsInsideRemovedElements(
	elementsByHostId: Map<string, ResumeDomElement>,
	removedElements: Set<ResumeDomElement>,
): string[] {
	const hostNodeIds: string[] = [];

	for (const [hostNodeId, element] of elementsByHostId) {
		for (const removedElement of removedElements) {
			if (containsElement(removedElement, element)) {
				hostNodeIds.push(hostNodeId);
				break;
			}
		}
	}

	return hostNodeIds;
}

function materializeElementHandles(
	root: ResumeDomElement,
	elementsByHostId: Map<string, ResumeDomElement>,
	handles: ResumeViewRecord['elementHandles'],
): {
	readonly get: (handleIdOrName: string) => ResumeDomElement | undefined;
	readonly deleteHost: (hostNodeId: string) => void;
} {
	const byHandleId = new Map<string, ResumeDomElement>();
	const byName = new Map<string, ResumeDomElement>();
	const keysByHostId = new Map<string, { readonly handleId: string; readonly name: string }>();

	for (const handle of handles) {
		const element = elementsByHostId.get(handle.hostNodeId);
		if (!element) continue;

		byHandleId.set(handle.handleId, element);
		byName.set(handle.name, element);
		keysByHostId.set(handle.hostNodeId, {
			handleId: handle.handleId,
			name: handle.name,
		});
	}

	return {
		get(handleIdOrName) {
			return connectedElement(
				root,
				byHandleId.get(handleIdOrName) ?? byName.get(handleIdOrName),
			);
		},
		deleteHost(hostNodeId) {
			const keys = keysByHostId.get(hostNodeId);
			if (!keys) return;

			byHandleId.delete(keys.handleId);
			byName.delete(keys.name);
			keysByHostId.delete(hostNodeId);
		},
	};
}

function connectedElement(
	root: ResumeDomElement,
	element: ResumeDomElement | undefined,
): ResumeDomElement | undefined {
	if (!element) return undefined;
	return containsElement(root, element) ? element : undefined;
}

function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;

	for (const child of root.childNodes ?? []) {
		if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) {
			return true;
		}
	}

	return false;
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}

function materializeAsyncBoundaryLocators(
	root: ResumeDomElement,
	boundaries: ResumeViewRecord['asyncBoundaries'],
): Map<string, ResumeAsyncBoundaryRecord> {
	const comments = walkComments(root);
	const byBoundaryId = new Map<string, ResumeAsyncBoundaryRecord>();

	for (const boundary of boundaries) {
		const startAnchor = comments[boundary.startAnchor.index];
		const endAnchor = comments[boundary.endAnchor.index];
		if (!startAnchor) {
			throw missingCommentAnchorError(boundary.id, 'startAnchor', boundary.startAnchor.index);
		}
		if (!endAnchor) {
			throw missingCommentAnchorError(boundary.id, 'endAnchor', boundary.endAnchor.index);
		}

		byBoundaryId.set(boundary.id, {
			id: boundary.id,
			startAnchor,
			endAnchor,
			asyncReads: boundary.asyncReads,
		});
	}

	return byBoundaryId;
}

// One walk from the event target toward the root: the closest element with
// either a keyed repeat row event record or an ordinary host record wins.
function findDispatchMatch(
	target: ResumeDomElement,
	eventName: string,
	eventRecords: WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>,
	rowEventRecords: ResumeRowEventRecords,
): ResumeDispatchMatch | null {
	let current: ResumeDomElement | null | undefined = target;

	while (current) {
		const rowMatch = rowEventRecords.get(current)?.get(eventName);
		if (rowMatch) return { element: current, rowMatch };

		const eventRecord = eventRecords.get(current)?.get(eventName);
		if (eventRecord) return { element: current, eventRecord };

		current = current.parentElement;
	}

	return null;
}

function elementChildren(element: ResumeDomElement): ResumeDomElement[] {
	const children: ResumeDomElement[] = [];
	for (const child of element.childNodes ?? []) {
		if (child.nodeType === 1) children.push(child as ResumeDomElement);
	}
	return children;
}

// hostPath mirrors the compiler row plan (public-render/plan.ts collectRowPlan)
// and the generated direct-DOM path: each segment indexes childNodes directly,
// because row HTML renders without ignorable whitespace nodes.
function rowEventHost(
	rowRoot: ResumeDomElement,
	hostPath: ReadonlyArray<number>,
): ResumeDomElement | undefined {
	let current: ResumeDomNode | undefined = rowRoot;
	for (const index of hostPath) {
		current = current.childNodes?.[index];
		if (!current) return undefined;
	}
	return current.nodeType === 1 ? (current as ResumeDomElement) : undefined;
}

// Mirrors the SSR repeat helper's Array.from collection normalization.
function readRepeatCollection(
	graph: RuntimeGraph,
	repeat: ResumeKeyedRepeatRecord,
): ReadonlyArray<unknown> {
	if (!repeat.collectionGraphNodeId) return [];

	const value = graph.read(repeat.collectionGraphNodeId, repeat.collectionPath);
	if (Array.isArray(value)) return value;
	return Array.from((value ?? []) as Iterable<unknown>);
}

function materializeDomLocators(
	root: ResumeDomElement,
	locators: ResumeViewRecord['locators'],
): Map<string, ResumeDomElement> {
	const elements = walkElements(root);
	const byHostId = new Map<string, ResumeDomElement>();

	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) {
			throw missingElementLocatorError(locator);
		}

		// '*' marks compiler-planned locators for dynamic <{expr}> elements,
		// whose tag is only known at render time.
		const expectedTagName = locator.tagName.toLowerCase();
		const actualTagName = element.tagName.toLowerCase();
		if (expectedTagName !== '*' && actualTagName !== expectedTagName) {
			throw mismatchedElementLocatorError(locator, actualTagName);
		}

		byHostId.set(locator.hostNodeId, element);
	}

	return byHostId;
}

function walkElements(root: ResumeDomElement): ResumeDomElement[] {
	const elements: ResumeDomElement[] = [];

	function visit(node: ResumeDomNode): void {
		if (node.nodeType === 1) {
			elements.push(node as ResumeDomElement);
		}

		for (const child of node.childNodes ?? []) {
			visit(child);
		}
	}

	visit(root);
	return elements;
}

function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	const comments: ResumeDomComment[] = [];

	function visit(node: ResumeDomNode): void {
		if (node.nodeType === 8) {
			comments.push(node as ResumeDomComment);
		}

		for (const child of node.childNodes ?? []) {
			visit(child);
		}
	}

	visit(root);
	return comments;
}

function missingElementLocatorError(
	locator: ResumeViewRecord['locators'][number],
): RuntimeResumeError {
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISSING',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator did not match the document',
		message: `Resume locator ${locator.hostNodeId} expected <${locator.tagName}> at DOM order index ${String(locator.index)}.`,
		why: 'The markless/view payload points at an element that was not present in the resumed document. The runtime cannot safely attach events, behaviors, element handles, or DOM updates to a missing host node.',
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName: locator.tagName.toLowerCase(),
		suggestions: [
			{
				message:
					'Regenerate the markless/view payload from the same initial render output that the browser is resuming.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING',
	});
}

function mismatchedElementLocatorError(
	locator: ResumeViewRecord['locators'][number],
	actualTagName: string,
): RuntimeResumeError {
	const expectedTagName = locator.tagName.toLowerCase();
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISMATCH',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator matched a different element',
		message: `Resume locator ${locator.hostNodeId} expected <${expectedTagName}> at DOM order index ${String(locator.index)} but found <${actualTagName}>.`,
		why: 'The markless/view payload no longer matches the document being resumed. The runtime cannot safely reuse a DOM-order locator when the element at that position has a different tag.',
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName,
		actualTagName,
		suggestions: [
			{
				message:
					'Resume the exact document produced with the matching markless/view payload, or regenerate the payload after changing markup.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISMATCH',
	});
}

function missingCommentAnchorError(
	boundaryId: string,
	anchorName: 'startAnchor' | 'endAnchor',
	index: number,
): RuntimeResumeError {
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISSING',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator did not match the document',
		message: `Resume locator ${boundaryId} ${anchorName} expected a comment at DOM order index ${String(index)}.`,
		why: 'The markless/view payload references an async boundary comment anchor that was not present in the resumed document. The runtime needs both comment anchors before it can replace pending, fulfilled, or rejected boundary content.',
		boundaryId,
		elementLocator: domOrderCommentLocator(index),
		suggestions: [
			{
				message:
					'Keep compiler-generated async boundary comments in the initial render output and resume with the matching markless/view payload.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING',
	});
}

function domOrderLocator(index: number): string {
	return `dom-order:${String(index)}`;
}

function domOrderCommentLocator(index: number): string {
	return `dom-order-comment:${String(index)}`;
}

function evaluateSyncPolicy(
	condition: ResumeSyncPolicyCondition,
	graph: RuntimeGraph,
	event: ResumeDomEvent,
): boolean {
	if (condition.type === 'and') {
		return condition.conditions.every((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'or') {
		return condition.conditions.some((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'not') {
		return !evaluateSyncPolicy(condition.condition, graph, event);
	}
	if (condition.type === 'graph-truthy') {
		return Boolean(graph.read(condition.graphNodeId, condition.path ?? []));
	}
	if (condition.type === 'constant-truthy') {
		return Boolean(condition.value);
	}

	return event[condition.field] === condition.value;
}

function runSyncPolicyActions(
	policy: ResumeSyncPolicy,
	graph: RuntimeGraph,
	event: ResumeDomEvent,
): void {
	for (const branch of syncPolicyBranches(policy)) {
		if (!evaluateSyncPolicy(branch.when, graph, event)) continue;

		for (const action of branch.actions) {
			if (action === 'preventDefault') event.preventDefault?.();
			if (action === 'stopPropagation') event.stopPropagation?.();
		}
	}
}

function syncPolicyBranches(policy: ResumeSyncPolicy): ReadonlyArray<ResumeSyncPolicyBranch> {
	if ('branches' in policy) return policy.branches;

	return [policy];
}
