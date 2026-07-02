import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type {
	DomJournalEntry,
	DomJournalResult,
	RuntimeGraphUpdate,
	RuntimeGraphWrite,
} from '@markless/runtime';

export type EventOnlyResumeDomNode = {
	readonly nodeType: number;
	readonly childNodes?: ArrayLike<EventOnlyResumeDomNode>;
};

export type EventOnlyResumeDomElement = EventOnlyResumeDomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly parentElement?: EventOnlyResumeDomElement | null;
	textContent?: string | null;
	addEventListener?: (
		type: string,
		listener: (event: EventOnlyResumeDomEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

export type EventOnlyResumeDomEvent = {
	readonly type: string;
	readonly target: EventOnlyResumeDomElement | null;
	readonly [key: string]: unknown;
};

export type EventOnlyResumePayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};

export type EventOnlyResumePayloadDocument = {
	readonly querySelector: (selector: string) => EventOnlyResumePayloadScriptElement | null;
};

export type EventOnlyResumeRecord = ProtocolViewPayload['events'][number];
export type EventOnlyResumeDomUpdateRecord = ProtocolViewPayload['domUpdates'][number];
export type EventOnlyResumeBehaviorRecord = ProtocolViewPayload['behaviors'][number];

export type EventOnlyResumeGraph = {
	read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
	write(write: RuntimeGraphWrite): void;
	update(update: RuntimeGraphUpdate): unknown;
	flush(): Promise<void>;
};

export type EventOnlyResumeSymbolContext = {
	readonly graph: EventOnlyResumeGraph;
	readonly event?: EventOnlyResumeDomEvent;
	readonly element: EventOnlyResumeDomElement;
	readonly getElementHandle: () => undefined;
	readonly domUpdate?: EventOnlyResumeDomUpdateRecord;
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly value?: unknown;
	readonly behaviorInputs?: ReadonlyArray<unknown>;
};

export type EventOnlyResumeBehaviorCleanup = () => void;

export type EventOnlyResumeSymbol = (
	context: EventOnlyResumeSymbolContext,
) =>
	| void
	| DomJournalResult
	| EventOnlyResumeBehaviorCleanup
	| Promise<void | DomJournalResult | EventOnlyResumeBehaviorCleanup>;

export type ResumeEventOnlyFromPayloadDocumentInput = {
	readonly document: EventOnlyResumePayloadDocument;
	readonly root: EventOnlyResumeDomElement;
	readonly event: EventOnlyResumeDomEvent;
	readonly element?: EventOnlyResumeDomElement;
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly loadSymbol: (
		symbolId: string,
	) => EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>;
};

export type CreateEventOnlyResumeContainerInput = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: EventOnlyResumeDomElement;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
};

export type EventOnlyResumeContainer = {
	readonly graph: EventOnlyResumeGraph;
	readonly view: ProtocolViewPayload;
	readonly dispatch: (
		event: EventOnlyResumeDomEvent,
		options?: {
			readonly element?: EventOnlyResumeDomElement;
			readonly eventRecord?: EventOnlyResumeRecord;
		},
	) => Promise<void>;
};

type DirtyPath = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

type EventOnlyResumeContainerState = EventOnlyResumeContainer & {
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
	readonly activeBehaviorHosts: Set<string>;
};

const containers = new WeakMap<EventOnlyResumeDomElement, EventOnlyResumeContainerState>();
const noElementHandle = () => undefined;

export async function resumeEventOnlyFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	let container = containers.get(input.root);
	if (!container) {
		const state = readPayloadJson<ProtocolStatePayload>(input.document, 'markless/state');
		const view = readPayloadJson<ProtocolViewPayload>(input.document, 'markless/view');
		container = createEventOnlyResumeContainerState({
			state,
			view,
			root: input.root,
			loadSymbol: input.loadSymbol,
		});
		containers.set(input.root, container);
	}

	await container.dispatch(input.event, {
		element: input.element,
		eventRecord: input.eventRecord,
	});
	return container;
}

export function createEventOnlyResumeContainerFromPayloads(
	input: CreateEventOnlyResumeContainerInput,
): EventOnlyResumeContainer {
	return createEventOnlyResumeContainerState(input);
}

function createEventOnlyResumeContainerState(
	input: CreateEventOnlyResumeContainerInput,
): EventOnlyResumeContainerState {
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	const activeBehaviorHosts = new Set<string>();
	const graph = createEventOnlyResumeGraph({
		state: input.state,
		view: input.view,
		loadSymbol: input.loadSymbol,
		elementsByHostId,
	});

	return {
		graph,
		view: input.view,
		elementsByHostId,
		activeBehaviorHosts,
		dispatch(event, options = {}) {
			return dispatchEvent({
				event,
				view: input.view,
				graph,
				loadSymbol: input.loadSymbol,
				elementsByHostId,
				activeBehaviorHosts,
				element: options.element,
				eventRecord: options.eventRecord,
			});
		},
	};
}

function readPayloadJson<T>(document: EventOnlyResumePayloadDocument, type: string): T {
	const script = document.querySelector(`script[type="${type}"]`);
	const text = script?.textContent ?? script?.text ?? script?.innerHTML;
	if (text == null) throw new Error(`Missing ${type} payload script.`);

	const payload = JSON.parse(text) as { readonly version?: unknown };
	if (payload.version !== 1) throw new Error(`Unsupported ${type} payload version.`);
	return payload as T;
}

function createEventOnlyResumeGraph(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
}): EventOnlyResumeGraph {
	const cells = new Map<string, unknown>();
	const dirtyPaths: DirtyPath[] = [];

	for (const cell of input.state.cells) {
		cells.set(
			cell.graphNodeId,
			cell.value === undefined ? undefined : deserializeEventOnlyGraphValue(cell.value),
		);
	}

	const graph: EventOnlyResumeGraph = {
		read(graphNodeId, path = []) {
			return readPath(cells.get(graphNodeId), path);
		},
		write(write) {
			const path = write.path ?? [];
			const currentValue = readPath(cells.get(write.graphNodeId), path);
			if (Object.is(currentValue, write.value)) return;
			cells.set(
				write.graphNodeId,
				writePath(cells.get(write.graphNodeId), path, write.value),
			);
			dirtyPaths.push({ graphNodeId: write.graphNodeId, path });
		},
		update(update) {
			const path = update.path ?? [];
			const currentValue = readPath(cells.get(update.graphNodeId), path);
			const nextValue = update.update(currentValue);
			if (!Object.is(currentValue, nextValue)) {
				cells.set(
					update.graphNodeId,
					writePath(cells.get(update.graphNodeId), path, nextValue),
				);
				dirtyPaths.push({ graphNodeId: update.graphNodeId, path });
			}
			if (update.returnValue === 'previous') return currentValue;
			if (update.returnValue === 'next') return nextValue;
		},
		async flush() {
			while (dirtyPaths.length > 0) {
				await flushDomUpdates({
					graph,
					pending: dirtyPaths.splice(0),
					view: input.view,
					loadSymbol: input.loadSymbol,
					elementsByHostId: input.elementsByHostId,
				});
			}
		},
	};

	return graph;
}

async function dispatchEvent(input: {
	readonly event: EventOnlyResumeDomEvent;
	readonly view: ProtocolViewPayload;
	readonly graph: EventOnlyResumeGraph;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
	readonly activeBehaviorHosts: Set<string>;
	readonly element?: EventOnlyResumeDomElement;
	readonly eventRecord?: EventOnlyResumeRecord;
}): Promise<void> {
	const matched = input.eventRecord
		? {
				element:
					input.element ??
					input.elementsByHostId.get(input.eventRecord.hostNodeId) ??
					input.event.target,
				eventRecord: input.eventRecord,
			}
		: findEventRecord(input.event.target, input.event.type, input.view, input.elementsByHostId);
	if (!matched?.element) return;

	try {
		for (const symbolId of matched.eventRecord.symbolIds) {
			const loadedSymbol = input.loadSymbol(symbolId);
			const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
			const result = symbol({
				graph: input.graph,
				event: input.event,
				element: matched.element,
				getElementHandle: noElementHandle,
			});
			const journalResult = isPromiseLike(result) ? await result : result;
			if (typeof journalResult !== 'function') {
				applyDomJournalResult(journalResult, input.elementsByHostId);
			}
		}
	} finally {
		await input.graph.flush();
	}

	if (input.view.behaviors.some((behavior) => !!behavior.symbolId)) {
		const behaviorRuntime = await import('./event-only-behaviors.ts');
		await behaviorRuntime.activateBehaviorsFromEventHost({
			element: matched.element,
			view: input.view,
			graph: input.graph,
			loadSymbol: input.loadSymbol,
			elementsByHostId: input.elementsByHostId,
			activeBehaviorHosts: input.activeBehaviorHosts,
		});
	}
}

async function flushDomUpdates(input: {
	readonly graph: EventOnlyResumeGraph;
	readonly pending: ReadonlyArray<DirtyPath>;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
}): Promise<void> {
	const ranDomUpdates = new Set<string>();

	for (const domUpdate of input.view.domUpdates) {
		if (!domUpdate.symbolId) continue;
		const dirty = input.pending.some(
			(path) =>
				path.graphNodeId === domUpdate.graphNodeId &&
				pathsIntersect(path.path, domUpdate.path),
		);
		if (!dirty) continue;

		const key = `${domUpdate.hostNodeId}\n${domUpdate.graphNodeId}\n${domUpdate.path.join('.')}`;
		if (ranDomUpdates.has(key)) continue;
		ranDomUpdates.add(key);

		const element = input.elementsByHostId.get(domUpdate.hostNodeId);
		if (!element) continue;

		const loadedSymbol = input.loadSymbol(domUpdate.symbolId);
		const symbol = isPromiseLike(loadedSymbol) ? await loadedSymbol : loadedSymbol;
		const result = symbol({
			graph: input.graph,
			element,
			getElementHandle: noElementHandle,
			domUpdate,
			value: input.graph.read(domUpdate.graphNodeId, domUpdate.path),
		});
		const journalResult = isPromiseLike(result) ? await result : result;
		if (typeof journalResult !== 'function') {
			applyDomJournalResult(journalResult, input.elementsByHostId);
		}
	}
}

function applyDomJournalResult(
	result: DomJournalResult | void,
	elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>,
): void {
	if (!result) return;
	const entries = isDomJournalEntryArray(result) ? result : [result];
	for (const entry of entries) applyDomJournalEntry(entry, elementsByHostId);
}

function isDomJournalEntryArray(
	result: DomJournalResult,
): result is ReadonlyArray<DomJournalEntry> {
	return Array.isArray(result);
}

function applyDomJournalEntry(
	entry: DomJournalEntry,
	elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>,
): void {
	const target = elementsByHostId.get(entry.locator);
	if (!target) return;

	if (entry.type === 'setText') {
		target.textContent = stringifyDomValue(entry.value);
		return;
	}
	if (entry.type === 'setAttr') {
		if (entry.value == null || entry.value === false) {
			target.removeAttribute?.(entry.name);
			return;
		}
		target.setAttribute?.(entry.name, stringifyDomValue(entry.value));
		return;
	}
	if (entry.type === 'setProp') {
		(target as Record<string, unknown>)[entry.name] = entry.value;
	}
}

function materializeDomLocators(
	root: EventOnlyResumeDomElement,
	locators: ProtocolViewPayload['locators'],
): Map<string, EventOnlyResumeDomElement> {
	const elements = collectElements(root);
	const byHostId = new Map<string, EventOnlyResumeDomElement>();

	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) throw new Error(`Missing resume locator ${locator.hostNodeId}.`);
		if (element.tagName.toLowerCase() !== locator.tagName.toLowerCase()) {
			throw new Error(`Mismatched resume locator ${locator.hostNodeId}.`);
		}
		byHostId.set(locator.hostNodeId, element);
	}

	return byHostId;
}

function collectElements(root: EventOnlyResumeDomElement): EventOnlyResumeDomElement[] {
	const elements: EventOnlyResumeDomElement[] = [];
	const visit = (node: EventOnlyResumeDomNode): void => {
		if (node.nodeType === 1) elements.push(node as EventOnlyResumeDomElement);
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	};
	visit(root);
	return elements;
}

function findEventRecord(
	target: EventOnlyResumeDomElement | null,
	eventName: string,
	view: ProtocolViewPayload,
	elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>,
):
	| {
			readonly element: EventOnlyResumeDomElement;
			readonly eventRecord: EventOnlyResumeRecord;
	  }
	| undefined {
	for (let element = target; element; element = element.parentElement ?? null) {
		for (const eventRecord of view.events) {
			if (eventRecord.eventName !== eventName) continue;
			if (elementsByHostId.get(eventRecord.hostNodeId) === element) {
				return { element, eventRecord };
			}
		}
	}
}

function deserializeEventOnlyGraphValue(payload: unknown): unknown {
	if (!isRecord(payload)) return payload;
	const records = new Map<number, Record<string, unknown>>();
	for (const record of Array.isArray(payload.records) ? payload.records : []) {
		if (isRecord(record) && typeof record.id === 'number') records.set(record.id, record);
	}
	return deserializeSlot(payload.root, records);
}

function deserializeSlot(
	slot: unknown,
	records: ReadonlyMap<number, Record<string, unknown>>,
): unknown {
	if (
		slot === null ||
		typeof slot === 'string' ||
		typeof slot === 'number' ||
		typeof slot === 'boolean'
	) {
		return slot;
	}
	if (!isRecord(slot)) return undefined;
	if ('$ref' in slot && typeof slot.$ref === 'number') {
		const record = records.get(slot.$ref);
		if (!record) return undefined;
		if (record.type === 'object') {
			const object: Record<string, unknown> = {};
			for (const [key, value] of Array.isArray(record.fields) ? record.fields : []) {
				if (typeof key === 'string') object[key] = deserializeSlot(value, records);
			}
			return object;
		}
		if (record.type === 'array') {
			return (Array.isArray(record.items) ? record.items : []).map((value) =>
				deserializeSlot(value, records),
			);
		}
		return undefined;
	}
	if (slot.$type === 'undefined') return undefined;
	if (slot.$type === 'bigint' && typeof slot.value === 'string') return BigInt(slot.value);
	return undefined;
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value as Record<string, unknown> | null | undefined;
	for (const key of path) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}

function writePath(value: unknown, path: ReadonlyArray<string>, nextValue: unknown): unknown {
	if (path.length === 0) return nextValue;

	const root = isRecord(value) ? value : {};
	let cursor = root;
	for (const key of path.slice(0, -1)) {
		const child = cursor[key];
		if (!isRecord(child)) cursor[key] = {};
		cursor = cursor[key] as Record<string, unknown>;
	}
	cursor[path[path.length - 1]!] = nextValue;
	return root;
}

function pathsIntersect(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
	return startsWithPath(a, b) || startsWithPath(b, a);
}

function startsWithPath(path: ReadonlyArray<string>, prefix: ReadonlyArray<string>): boolean {
	if (path.length < prefix.length) return false;
	return prefix.every((part, index) => path[index] === part);
}

function stringifyDomValue(value: unknown): string {
	if (value == null) return '';
	return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}
