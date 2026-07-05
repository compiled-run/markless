import type { RuntimeGraph } from '@markless/runtime';
import type { ElementHandleRegistry, ResumeBehaviorCleanup, ResumeBehaviorRecord, ResumeDomElement, ResumeDomNode, ResumeRemovalObserver, ResumeRemovalObserverFactory, ResumeRemovalRecord, ResumeRuntimeInput, ResumeViewRecord, ResumeVisibilityEntry, ResumeVisibilityObserver, ResumeVisibilityObserverFactory } from './resume-types.ts';

type CleanupKind = 'visibility' | 'behavior';
type HostCleanup = { readonly kind: CleanupKind; readonly cleanup: ResumeBehaviorCleanup };
type VisibilityObserverConstructor = new (callback: (entries: ReadonlyArray<ResumeVisibilityEntry>) => void) => ResumeVisibilityObserver;
type RemovalObserverConstructor = new (callback: (records: ReadonlyArray<ResumeRemovalRecord>) => void) => ResumeRemovalObserver;

export function createBehaviorRuntime(input: {
	readonly root: ResumeDomElement; readonly graph: RuntimeGraph; readonly view: ResumeViewRecord; readonly loadSymbol: ResumeRuntimeInput['loadSymbol']; readonly elementHandles: ElementHandleRegistry;
	readonly elementsByHostId: Map<string, ResumeDomElement>; readonly disposedHosts: Set<string>; readonly eventRecords: WeakMap<ResumeDomElement, Map<string, import('./resume-types.ts').ResumeEventRecord>>;
	readonly flushRuntimeGraph: () => Promise<void>; readonly storeHostSubscription: (hostNodeId: string, release: () => void) => void; readonly hostSubscriptionReleases: Map<string, Array<() => void>>;
	readonly createVisibilityObserver?: ResumeVisibilityObserverFactory; readonly createRemovalObserver?: ResumeRemovalObserverFactory; readonly disposeHost: (hostNodeId: string) => void;
}) {
	const hostCleanups = new Map<string, HostCleanup[]>(), behaviorRecordsByHostId = groupBehaviorRecords(input.view.behaviors), activeBehaviorHosts = new Set<string>();
	let visibilityObserver: ResumeVisibilityObserver | undefined, removalObserver: ResumeRemovalObserver | undefined;
	const visibleElementsByHostId = new Map<string, ResumeDomElement>();
	for (const behaviorRecord of input.view.behaviors) subscribeBehaviorInputs(behaviorRecord);
	function addBehaviorRecords(hostNodeId: string, records: ResumeBehaviorRecord[]): void { behaviorRecordsByHostId.set(hostNodeId, records); for (const record of records) subscribeBehaviorInputs(record); }
	function subscribeBehaviorInputs(record: ResumeBehaviorRecord): void {
		for (const read of record.inputGraphReads ?? []) input.storeHostSubscription(record.hostNodeId, input.graph.subscribe({ id: `behavior-input:${record.hostNodeId}:${read.inputIndex}:${read.graphNodeId}:${read.path.join('.')}`, graphNodeId: read.graphNodeId, path: read.path, async run() { if (activeBehaviorHosts.has(record.hostNodeId)) await activateBehaviors(record.hostNodeId, { flush: false }); } }));
	}
	function behaviorHostIdsForAncestors(element: ResumeDomElement | undefined): string[] {
		const hostIdByElement = new Map<ResumeDomElement, string>(); for (const id of behaviorRecordsByHostId.keys()) { const el = input.elementsByHostId.get(id); if (el) hostIdByElement.set(el, id); }
		const ids: string[] = []; let current: ResumeDomElement | undefined = element; while (current) { const id = hostIdByElement.get(current); if (id) ids.push(id); current = current.parentElement ?? undefined; } return ids;
	}
	function activateBehaviorsFromTrigger(hostNodeId: string): Promise<void> | undefined { return activeBehaviorHosts.has(hostNodeId) || (behaviorRecordsByHostId.get(hostNodeId) ?? []).length === 0 ? undefined : activateBehaviors(hostNodeId, { flush: false }); }
	async function activateBehaviors(hostNodeId: string, options: { readonly flush?: boolean } = {}): Promise<void> {
		if (input.disposedHosts.has(hostNodeId)) return; const element = connectedElement(input.root, input.elementsByHostId.get(hostNodeId)); if (!element) return;
		const records = behaviorRecordsByHostId.get(hostNodeId) ?? []; if (records.length === 0) return; activeBehaviorHosts.add(hostNodeId); runHostCleanups(hostNodeId, 'behavior');
		try {
			for (const record of records) { if (!record.symbolId) continue; const symbol = await input.loadSymbol(record.symbolId); const result = await symbol({ graph: input.graph, element, getElementHandle: input.elementHandles.get, behaviorInputs: behaviorInputs(record, input.graph) }); if (typeof result === 'function') storeHostCleanup(hostNodeId, 'behavior', result); }
		} finally { if (options.flush !== false) await input.flushRuntimeGraph(); }
	}
	function storeHostCleanup(hostNodeId: string, kind: CleanupKind, cleanup: ResumeBehaviorCleanup): void { const cleanups = hostCleanups.get(hostNodeId) ?? []; cleanups.push({ kind, cleanup }); hostCleanups.set(hostNodeId, cleanups); }
	function runHostCleanups(hostNodeId: string, kind?: CleanupKind): void {
		const cleanups = hostCleanups.get(hostNodeId) ?? [], remaining = kind ? cleanups.filter((entry) => entry.kind !== kind) : [];
		for (const entry of [...cleanups].reverse()) if (!kind || entry.kind === kind) entry.cleanup();
		remaining.length > 0 ? hostCleanups.set(hostNodeId, remaining) : hostCleanups.delete(hostNodeId);
	}
	function disposeBehaviorHost(hostNodeId: string): void {
		const visible = visibleElementsByHostId.get(hostNodeId);
		if (visible) { visibilityObserver?.unobserve?.(visible); visibleElementsByHostId.delete(hostNodeId); }
		activeBehaviorHosts.delete(hostNodeId); runHostCleanups(hostNodeId);
	}
	function installRemovalObserver(): void {
		const createObserver = input.createRemovalObserver ?? defaultRemovalObserverFactory(); if (!createObserver || input.view.locators.length === 0) return;
		removalObserver = createObserver((records) => { const removed = new Set<ResumeDomElement>(); for (const record of records) for (const node of record.removedNodes) collectRemovedElements(node, removed); for (const id of hostIdsInsideRemovedElements(input.elementsByHostId, removed)) input.disposeHost(id); });
		removalObserver.observe(input.root, { childList: true, subtree: true });
	}
	function installVisibilityObserver(): void {
		const visible = input.view.events.flatMap((eventRecord) => {
			const element = eventRecord.eventName === 'visible' ? input.elementsByHostId.get(eventRecord.hostNodeId) : undefined;
			return element ? [{ element, eventRecord }] : [];
		});
		const createObserver = input.createVisibilityObserver ?? defaultVisibilityObserverFactory(); if (visible.length === 0 || !createObserver) return;
		const records = new WeakMap<ResumeDomElement, import('./resume-types.ts').ResumeEventRecord>(), fired = new WeakSet<ResumeDomElement>();
		for (const entry of visible) records.set(entry.element, entry.eventRecord);
		visibilityObserver = createObserver((entries) => {
			for (const entry of entries) { if (!isVisibleEntry(entry) || fired.has(entry.target)) continue; const record = records.get(entry.target); if (!record || input.disposedHosts.has(record.hostNodeId)) continue;
				fired.add(entry.target); records.delete(entry.target); visibilityObserver?.unobserve?.(entry.target); void runVisibleEvent(entry.target, record);
			}
		});
		for (const entry of visible) if (!input.disposedHosts.has(entry.eventRecord.hostNodeId)) { visibleElementsByHostId.set(entry.eventRecord.hostNodeId, entry.element); visibilityObserver.observe(entry.element); }
	}
	async function runVisibleEvent(element: ResumeDomElement, eventRecord: import('./resume-types.ts').ResumeEventRecord): Promise<void> {
		try {
			const activation = activateBehaviorsFromTrigger(eventRecord.hostNodeId); if (activation) await activation;
			for (const symbolId of eventRecord.symbolIds) { const symbol = await input.loadSymbol(symbolId); const result = await symbol({ graph: input.graph, read: input.graph.read, element, getElementHandle: input.elementHandles.get }); if (typeof result === 'function') storeHostCleanup(eventRecord.hostNodeId, 'visibility', result); }
		} finally { await input.flushRuntimeGraph(); }
	}
	function disconnect(): void { visibilityObserver?.disconnect?.(); removalObserver?.disconnect?.(); visibilityObserver = undefined; removalObserver = undefined; }
	return { behaviorRecordsByHostId, activeBehaviorHosts, addBehaviorRecords, behaviorHostIdsForAncestors, activateBehaviorsFromTrigger, activateBehaviors, installVisibilityObserver, installRemovalObserver, disposeBehaviorHost, runHostCleanups, disconnect };
}

export function behaviorInputs(record: ResumeBehaviorRecord, graph: RuntimeGraph): ReadonlyArray<unknown> {
	const reads = record.inputGraphReads ?? [], inputCount = Math.max(record.inputSources.length, ...reads.map((read) => read.inputIndex + 1));
	const inputs = record.inputValues !== undefined ? [...record.inputValues] : Array.from({ length: inputCount }, () => undefined);
	for (const read of reads) inputs[read.inputIndex] = graph.read(read.graphNodeId, read.path);
	return inputs;
}
export function groupBehaviorRecords(behaviors: ResumeViewRecord['behaviors']): Map<string, ResumeBehaviorRecord[]> {
	const byHostId = new Map<string, ResumeBehaviorRecord[]>(); for (const behavior of behaviors) { const records = byHostId.get(behavior.hostNodeId) ?? []; records.push(behavior); byHostId.set(behavior.hostNodeId, records); } return byHostId;
}
function defaultRemovalObserverFactory(): ResumeRemovalObserverFactory | undefined {
	const observer = (globalThis as unknown as { readonly MutationObserver?: RemovalObserverConstructor }).MutationObserver; return observer ? (callback) => new observer(callback) : undefined;
}
function defaultVisibilityObserverFactory(): ResumeVisibilityObserverFactory | undefined {
	const observer = (globalThis as unknown as { readonly IntersectionObserver?: VisibilityObserverConstructor }).IntersectionObserver; return observer ? (callback) => new observer(callback) : undefined;
}
function isVisibleEntry(entry: ResumeVisibilityEntry): boolean { return entry.isIntersecting === true || (entry.intersectionRatio ?? 0) > 0; }
function connectedElement(root: ResumeDomElement, element: ResumeDomElement | undefined): ResumeDomElement | undefined { return element && containsElement(root, element) ? element : undefined; }
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? []) if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
function collectRemovedElements(node: ResumeDomNode, removed: Set<ResumeDomElement>): void {
	if (node.nodeType !== 1) return; const element = node as ResumeDomElement; removed.add(element); for (const child of element.childNodes ?? []) collectRemovedElements(child, removed);
}
function hostIdsInsideRemovedElements(elementsByHostId: Map<string, ResumeDomElement>, removed: Set<ResumeDomElement>): string[] {
	const ids: string[] = []; for (const [id, element] of elementsByHostId) for (const removedElement of removed) if (containsElement(removedElement, element)) { ids.push(id); break; }
	return ids;
}
