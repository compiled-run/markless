import {
	MARKLESS_STATE_SCRIPT_TYPE,
	MARKLESS_VIEW_SCRIPT_TYPE,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer';
import type {
	DomJournalEntry,
	DomJournalResult,
	RuntimeGraph,
	RuntimeGraphCall,
	RuntimeGraphDelete,
	RuntimeGraphSubscription,
	RuntimeGraphUpdate,
	RuntimeGraphWrite,
} from '@markless/runtime';

export type EventResumeDomNode = {
	readonly nodeType: number;
	readonly childNodes?: ArrayLike<EventResumeDomNode>;
};

export type EventResumeDomElement = EventResumeDomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly parentElement?: EventResumeDomElement | null;
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

export type EventResumeDomEvent = {
	readonly type: string;
	readonly target: EventResumeDomElement | null;
	readonly [key: string]: unknown;
};

export type EventResumePayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};

export type EventResumePayloadDocument = {
	readonly querySelector: (selector: string) => EventResumePayloadScriptElement | null;
};

export type EventResumeRecord = ProtocolViewPayload['events'][number];
export type EventResumeDomUpdateRecord = ProtocolViewPayload['domUpdates'][number];

export type EventResumeGraph = Pick<
	RuntimeGraph,
	| 'read'
	| 'readShared'
	| 'writeShared'
	| 'getSharedDefinition'
	| 'listSharedDefinitions'
	| 'takeSharedPatches'
	| 'applySharedPatch'
	| 'write'
	| 'update'
	| 'call'
	| 'delete'
	| 'subscribe'
	| 'subscribeJournal'
	| 'flush'
	| 'takeJournal'
>;

export type EventResumeSymbolContext = {
	readonly graph: EventResumeGraph;
	readonly event?: EventResumeDomEvent;
	readonly element: EventResumeDomElement;
	readonly getElementHandle: (handleIdOrName: string) => EventResumeDomElement | undefined;
	readonly domUpdate?: EventResumeDomUpdateRecord;
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly value?: unknown;
};

export type EventResumeSymbol = (
	context: EventResumeSymbolContext,
) => void | DomJournalResult | Promise<void | DomJournalResult>;

export type ResumeEventFromPayloadDocumentInput = {
	readonly document: EventResumePayloadDocument;
	readonly root: EventResumeDomElement;
	readonly event: EventResumeDomEvent;
	readonly element?: EventResumeDomElement;
	readonly eventRecord?: EventResumeRecord;
	readonly loadSymbol: (symbolId: string) => EventResumeSymbol | Promise<EventResumeSymbol>;
};

export type EventResumeContainer = {
	readonly graph: EventResumeGraph;
	readonly view: ProtocolViewPayload;
	readonly dispatch: (
		event: EventResumeDomEvent,
		options?: {
			readonly element?: EventResumeDomElement;
			readonly eventRecord?: EventResumeRecord;
		},
	) => Promise<void>;
};

export type CreateEventResumeContainerInput = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: EventResumeDomElement;
	readonly loadSymbol: ResumeEventFromPayloadDocumentInput['loadSymbol'];
};

type DirtyPath = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

type EventResumeContainerState = EventResumeContainer & {
	readonly elementsByHostId: ReadonlyMap<string, EventResumeDomElement>;
};

const containers = new WeakMap<EventResumeDomElement, Promise<EventResumeContainerState>>();

export async function resumeEventFromPayloadDocument(
	input: ResumeEventFromPayloadDocumentInput,
): Promise<EventResumeContainer> {
	let container = containers.get(input.root);
	if (!container) {
		const state = readPayloadJson<ProtocolStatePayload>(input.document, MARKLESS_STATE_SCRIPT_TYPE);
		const view = readPayloadJson<ProtocolViewPayload>(input.document, MARKLESS_VIEW_SCRIPT_TYPE);
		container = createEventResumeContainerState({
			state,
			view,
			root: input.root,
			loadSymbol: input.loadSymbol,
		});
		containers.set(input.root, container);
	}

	const resumed = await container;
	await resumed.dispatch(input.event, {
		element: input.element,
		eventRecord: input.eventRecord,
	});
	return resumed;
}

export async function createEventResumeContainerFromPayloads(
	input: CreateEventResumeContainerInput,
): Promise<EventResumeContainer> {
	return createEventResumeContainerState(input);
}

async function createEventResumeContainerState(
	input: CreateEventResumeContainerInput,
): Promise<EventResumeContainerState> {
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	const elementHandles = materializeElementHandles(input.root, elementsByHostId, input.view);
	const graph = createEventResumeGraph({
		state: input.state,
		view: input.view,
		loadSymbol: input.loadSymbol,
		elementsByHostId,
		getElementHandle: elementHandles.get,
	});

	return {
		graph,
		view: input.view,
		elementsByHostId,
		dispatch(event, options = {}) {
			return dispatchEvent({
				event,
				view: input.view,
				graph,
				loadSymbol: input.loadSymbol,
				elementsByHostId,
				getElementHandle: elementHandles.get,
				element: options.element,
				eventRecord: options.eventRecord,
			});
		},
	};
}

function readPayloadJson<T>(document: EventResumePayloadDocument, type: string): T {
	const script = document.querySelector(`script[type="${type}"]`);
	const text = script?.textContent ?? script?.text ?? script?.innerHTML;
	if (text == null) throw new Error(`Missing ${type} payload script.`);

	const payload = JSON.parse(text) as { readonly version?: unknown };
	if (payload.version !== 1) throw new Error(`Unsupported ${type} payload version.`);
	return payload as T;
}

function createEventResumeGraph(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: ResumeEventFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: ReadonlyMap<string, EventResumeDomElement>;
	readonly getElementHandle: (handleIdOrName: string) => EventResumeDomElement | undefined;
}): EventResumeGraph {
	const cells = new Map<string, unknown>();
	const dirtyPaths: DirtyPath[] = [];
	const subscriptions: RuntimeGraphSubscription[] = [];
	const journal: DomJournalEntry[] = [];
	const journalListeners: Array<
		(entries: ReadonlyArray<DomJournalEntry>) => void | Promise<void>
	> = [];

	for (const cell of input.state.cells) {
		cells.set(
			cell.graphNodeId,
			cell.value === undefined ? undefined : deserializeEventGraphValue(cell.value),
		);
	}

	const graph: EventResumeGraph = {
		read(graphNodeId, path = []) {
			return readPath(cells.get(graphNodeId), path);
		},
		readShared() {
			return undefined;
		},
		writeShared() {
			return false;
		},
		getSharedDefinition() {
			return undefined;
		},
		listSharedDefinitions() {
			return [];
		},
		takeSharedPatches() {
			return [];
		},
		applySharedPatch() {
			return false;
		},
		write(write: RuntimeGraphWrite) {
			const path = write.path ?? [];
			const currentValue = readPath(cells.get(write.graphNodeId), path);
			if (Object.is(currentValue, write.value)) return;
			cells.set(
				write.graphNodeId,
				writePath(cells.get(write.graphNodeId), path, write.value),
			);
			markDirty(write.graphNodeId, path);
		},
		update(update: RuntimeGraphUpdate) {
			const path = update.path ?? [];
			const currentValue = readPath(cells.get(update.graphNodeId), path);
			const nextValue = update.update(currentValue);
			if (!Object.is(currentValue, nextValue)) {
				cells.set(
					update.graphNodeId,
					writePath(cells.get(update.graphNodeId), path, nextValue),
				);
				markDirty(update.graphNodeId, path);
			}
			if (update.returnValue === 'previous') return currentValue;
			if (update.returnValue === 'next') return nextValue;
		},
		call(call: RuntimeGraphCall) {
			const path = call.path ?? [];
			const target = readPath(cells.get(call.graphNodeId), path) as
				| Record<string, unknown>
				| undefined;
			const method = target?.[call.method];
			if (typeof method !== 'function') {
				throw new TypeError(`Unsupported graph collection method "${call.method}".`);
			}
			const result = Reflect.apply(method, target, [...(call.args ?? [])]);
			markDirty(call.graphNodeId, path);
			return result;
		},
		delete(deletion: RuntimeGraphDelete) {
			const result = deletePath(cells.get(deletion.graphNodeId), deletion.path);
			if (result) markDirty(deletion.graphNodeId, deletion.path);
			return result;
		},
		subscribe(subscription) {
			subscriptions.push(subscription);
		},
		subscribeJournal(listener) {
			journalListeners.push(listener);
			return () => {
				const index = journalListeners.indexOf(listener);
				if (index >= 0) journalListeners.splice(index, 1);
			};
		},
		async flush() {
			while (dirtyPaths.length > 0) {
				const pending = dirtyPaths.splice(0);
				await flushDomUpdates({
					graph,
					pending,
					view: input.view,
					loadSymbol: input.loadSymbol,
					elementsByHostId: input.elementsByHostId,
					getElementHandle: input.getElementHandle,
					journal,
				});
				for (const subscription of subscriptions) {
					const subscriptionPath = subscription.path ?? [];
					const dirty = pending.some(
						(path) =>
							path.graphNodeId === subscription.graphNodeId &&
							pathsIntersect(path.path, subscriptionPath),
					);
					if (!dirty) continue;
					appendJournalResult(
						journal,
						await subscription.run(
							graph.read(subscription.graphNodeId, subscriptionPath),
						),
					);
				}
			}

			if (journalListeners.length > 0 && journal.length > 0) {
				const entries = journal.splice(0);
				for (const listener of journalListeners) await listener(entries);
			}
		},
		takeJournal() {
			return journal.splice(0);
		},
	};

	function markDirty(graphNodeId: string, path: ReadonlyArray<string>): void {
		dirtyPaths.push({ graphNodeId, path });
	}

	return graph;
}

async function dispatchEvent(input: {
	readonly event: EventResumeDomEvent;
	readonly view: ProtocolViewPayload;
	readonly graph: EventResumeGraph;
	readonly loadSymbol: ResumeEventFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: ReadonlyMap<string, EventResumeDomElement>;
	readonly getElementHandle: (handleIdOrName: string) => EventResumeDomElement | undefined;
	readonly element?: EventResumeDomElement;
	readonly eventRecord?: EventResumeRecord;
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
				getElementHandle: input.getElementHandle,
			});
			applyDomJournalResult(
				isPromiseLike(result) ? await result : result,
				input.elementsByHostId,
			);
		}
	} finally {
		await input.graph.flush();
	}
}

async function flushDomUpdates(input: {
	readonly graph: EventResumeGraph;
	readonly pending: ReadonlyArray<DirtyPath>;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: ResumeEventFromPayloadDocumentInput['loadSymbol'];
	readonly elementsByHostId: ReadonlyMap<string, EventResumeDomElement>;
	readonly getElementHandle: (handleIdOrName: string) => EventResumeDomElement | undefined;
	readonly journal: DomJournalEntry[];
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
			getElementHandle: input.getElementHandle,
			domUpdate,
			value: input.graph.read(domUpdate.graphNodeId, domUpdate.path),
		});
		appendJournalResult(input.journal, isPromiseLike(result) ? await result : result);
	}

	const entries = input.journal.splice(0);
	for (const entry of entries) applyDomJournalEntry(entry, input.elementsByHostId);
}

function appendJournalResult(journal: DomJournalEntry[], result: DomJournalResult | void): void {
	if (!result) return;
	if (isDomJournalEntryArray(result)) {
		journal.push(...result);
		return;
	}
	journal.push(result);
}

function applyDomJournalResult(
	result: DomJournalResult | void,
	elementsByHostId: ReadonlyMap<string, EventResumeDomElement>,
): void {
	const entries: DomJournalEntry[] = [];
	appendJournalResult(entries, result);
	for (const entry of entries) applyDomJournalEntry(entry, elementsByHostId);
}

function isDomJournalEntryArray(
	result: DomJournalResult,
): result is ReadonlyArray<DomJournalEntry> {
	return Array.isArray(result);
}

function applyDomJournalEntry(
	entry: DomJournalEntry,
	elementsByHostId: ReadonlyMap<string, EventResumeDomElement>,
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
	root: EventResumeDomElement,
	locators: ProtocolViewPayload['locators'],
): Map<string, EventResumeDomElement> {
	const elements = collectElements(root);
	const byHostId = new Map<string, EventResumeDomElement>();

	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) throw new Error(`Missing resume locator ${locator.hostNodeId}.`);
		// '*' marks dynamic-tag hosts whose rendered tag is unknowable at
		// compile time; skip validation like the full resume runtime does.
		if (
			locator.tagName !== '*' &&
			element.tagName.toLowerCase() !== locator.tagName.toLowerCase()
		) {
			throw new Error(`Mismatched resume locator ${locator.hostNodeId}.`);
		}
		byHostId.set(locator.hostNodeId, element);
	}

	return byHostId;
}

function collectElements(root: EventResumeDomElement): EventResumeDomElement[] {
	const elements: EventResumeDomElement[] = [];
	const visit = (node: EventResumeDomNode): void => {
		if (node.nodeType === 1) elements.push(node as EventResumeDomElement);
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	};
	visit(root);
	return elements;
}

function materializeElementHandles(
	root: EventResumeDomElement,
	elementsByHostId: ReadonlyMap<string, EventResumeDomElement>,
	view: ProtocolViewPayload,
): { readonly get: (handleIdOrName: string) => EventResumeDomElement | undefined } {
	const handles = new Map<string, EventResumeDomElement>();
	for (const handle of view.elementHandles) {
		const element = elementsByHostId.get(handle.hostNodeId);
		if (!element) continue;
		handles.set(handle.handleId, element);
		handles.set(handle.name, element);
	}

	return {
		get(handleIdOrName) {
			const element = handles.get(handleIdOrName);
			return element && containsElement(root, element) ? element : undefined;
		},
	};
}

function findEventRecord(
	target: EventResumeDomElement | null,
	eventName: string,
	view: ProtocolViewPayload,
	elementsByHostId: ReadonlyMap<string, EventResumeDomElement>,
):
	| {
			readonly element: EventResumeDomElement;
			readonly eventRecord: EventResumeRecord;
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

function deserializeEventGraphValue(payload: unknown): unknown {
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

function deletePath(value: unknown, path: ReadonlyArray<string>): boolean {
	if (path.length === 0 || !isRecord(value)) return false;
	let cursor = value;
	for (const key of path.slice(0, -1)) {
		const child = cursor[key];
		if (!isRecord(child)) return false;
		cursor = child;
	}
	return delete cursor[path[path.length - 1]!];
}

function pathsIntersect(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
	return startsWithPath(a, b) || startsWithPath(b, a);
}

function startsWithPath(path: ReadonlyArray<string>, prefix: ReadonlyArray<string>): boolean {
	if (path.length < prefix.length) return false;
	return prefix.every((part, index) => path[index] === part);
}

function containsElement(root: EventResumeDomElement, element: EventResumeDomElement): boolean {
	if (root === element) return true;
	for (const child of Array.from(root.childNodes ?? [])) {
		if (child.nodeType === 1 && containsElement(child as EventResumeDomElement, element)) {
			return true;
		}
	}
	return false;
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
