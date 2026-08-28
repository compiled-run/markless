import {
	protocolEventDispatchesMarkless,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer/protocol';
import { marklessAttributeValue } from './dom-attribute.ts';
import { marklessControlWriteHeld, marklessNoteControlEdits } from './control-edit-hold.ts';
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

export type EventResumeGraph = Omit<
	Pick<
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
	>,
	'subscribe'
> & {
	// This graph serves one dispatch and is then discarded, so it registers a
	// subscription without handing back an unsubscribe.
	readonly subscribe: (subscription: RuntimeGraphSubscription) => void;
};

export type EventResumeSymbolContext = {
	readonly graph: EventResumeGraph;
	readonly event?: EventResumeDomEvent;
	readonly element: EventResumeDomElement;
	readonly getElementHandle: (handleIdOrName: string) => EventResumeDomElement | undefined;
	readonly domUpdate?: EventResumeDomUpdateRecord;
	readonly locals?: Readonly<Record<string, unknown>>;
	readonly value?: unknown;
	readonly args?: ReadonlyArray<unknown>;
	readonly invokeCallback?: (symbolId: string, args: ReadonlyArray<unknown>) => Promise<unknown>;
	readonly invokeSymbol?: (
		symbolId: string,
		context: EventResumeSymbolContext,
	) => Promise<unknown>;
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
		const state = readPayloadJson<ProtocolStatePayload>(input.document, 'markless/state');
		const view = readPayloadJson<ProtocolViewPayload>(input.document, 'markless/view');
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
	// A pinned record is a direct invocation, not a DOM dispatch: it runs alone.
	const path = input.eventRecord
		? [
				{
					element:
						input.element ??
						input.elementsByHostId.get(input.eventRecord.hostNodeId) ??
						input.event.target,
					eventRecord: input.eventRecord,
				},
			]
		: collectDispatchPath(
				input.event.target,
				input.event.type,
				input.view,
				input.elementsByHostId,
			);
	if (path.length === 0) return;

	const propagation = trackPropagationStops(input.event);
	let stopAfterElement: EventResumeDomElement | undefined;
	const releaseControlEdits = marklessNoteControlEdits(input.event.target);
	try {
		for (const matched of path) {
			if (!matched.element) return;
			// A record owned by another system ends the markless walk, exactly as it
			// did when the innermost match was the only record that ever ran.
			if (!protocolEventDispatchesMarkless(matched.eventRecord)) return;
			if (stopAfterElement && matched.element !== stopAfterElement) return;
			await runEventRecord(input, matched.element, matched.eventRecord, propagation.stoppedImmediate);
			if (propagation.stoppedImmediate()) return;
			if (propagation.stopped()) stopAfterElement = matched.element;
		}
	} finally {
		propagation.release();
		releaseControlEdits();
	}
}

async function runEventRecord(
	input: {
		readonly event: EventResumeDomEvent;
		readonly graph: EventResumeGraph;
		readonly loadSymbol: ResumeEventFromPayloadDocumentInput['loadSymbol'];
		readonly elementsByHostId: ReadonlyMap<string, EventResumeDomElement>;
		readonly getElementHandle: (handleIdOrName: string) => EventResumeDomElement | undefined;
	},
	element: EventResumeDomElement,
	eventRecord: EventResumeRecord,
	stopsImmediately?: () => boolean,
): Promise<void> {
	try {
		const baseContext = {
			graph: input.graph,
			event: input.event,
			element,
			getElementHandle: input.getElementHandle,
		};
		const invokeSymbol = async (symbolId: string, context: EventResumeSymbolContext) => {
			const loaded = input.loadSymbol(symbolId);
			const symbol = isPromiseLike(loaded) ? await loaded : loaded;
			const result = symbol({ ...context, invokeCallback, invokeSymbol });
			return isPromiseLike(result) ? await result : result;
		};
		const invokeCallback = (symbolId: string, args: ReadonlyArray<unknown>) =>
			invokeSymbol(symbolId, { ...baseContext, args, invokeCallback, invokeSymbol });
		for (const symbolId of eventRecord.symbolIds) {
			const result = invokeSymbol(symbolId, baseContext);
			applyDomJournalResult(
				isPromiseLike(result) ? await result : result,
				input.elementsByHostId,
			);
			// One element's handlers are one listener list: stopImmediatePropagation
			// ends it here, not only at the next element up.
			if (stopsImmediately?.()) return;
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

		// The target belongs in the key: two attributes on one element can read
		// the same graph node (`disabled` and `ui-disabled` off one prop).
		const target = domUpdate.target;
		const targetKey = `${target?.kind ?? ''}:${target && 'name' in target ? target.name : ''}`;
		const key = `${domUpdate.hostNodeId}\n${targetKey}\n${domUpdate.graphNodeId}\n${domUpdate.path.join('.')}`;
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
		const text = marklessAttributeValue(entry.name, entry.value);
		if (text === null) {
			target.removeAttribute?.(entry.name);
			return;
		}
		target.setAttribute?.(entry.name, text);
		return;
	}
	if (entry.type === 'setProp') {
		if (marklessControlWriteHeld(target, entry.name, entry.value)) return;
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

// The DOM runs every listener on the target-to-root chain, innermost first, each
// on the element it was declared on. A nested widget root and the widget that
// encloses it both answer for the same key, so the walk collects the whole path
// rather than the first record it finds.
function collectDispatchPath(
	target: EventResumeDomElement | null,
	eventName: string,
	view: ProtocolViewPayload,
	elementsByHostId: ReadonlyMap<string, EventResumeDomElement>,
): Array<{
	readonly element: EventResumeDomElement;
	readonly eventRecord: EventResumeRecord;
}> {
	const path: Array<{
		readonly element: EventResumeDomElement;
		readonly eventRecord: EventResumeRecord;
	}> = [];
	for (let element = target; element; element = element.parentElement ?? null) {
		for (const eventRecord of view.events) {
			if (eventRecord.eventName !== eventName) continue;
			if (elementsByHostId.get(eventRecord.hostNodeId) === element) {
				path.push({ element, eventRecord });
			}
		}
	}
	return path;
}

// Dispatch runs from one capture listener on the container root, so the DOM's
// own propagation flags never see this synthetic walk: a handler's
// stopPropagation call has to be observed here. This entry can hold several
// records on one element, so it reads stopImmediatePropagation too.
function trackPropagationStops(event: EventResumeDomEvent): {
	readonly stopped: () => boolean;
	readonly stoppedImmediate: () => boolean;
	readonly release: () => void;
} {
	const host = event as unknown as Record<string, unknown>;
	// An entry capture may have applied the innermost record's stopPropagation
	// policy before this walk started; the DOM flag is the only trace it leaves.
	let stopped = host.cancelBubble === true;
	let immediate = false;
	let patched = false;
	const restore: Array<() => void> = [];
	const patch = (name: string, mark: () => void): void => {
		const own = Object.getOwnPropertyDescriptor(host, name);
		const native = host[name];
		try {
			Object.defineProperty(host, name, {
				configurable: true,
				enumerable: false,
				writable: true,
				value: (...args: unknown[]) => {
					mark();
					return typeof native === 'function'
						? (native as (...call: unknown[]) => unknown).apply(event, args)
						: undefined;
				},
			});
		} catch {
			// A frozen event still reports through cancelBubble below.
			return;
		}
		patched = true;
		restore.push(() => {
			if (own) Object.defineProperty(host, name, own);
			else delete host[name];
		});
	};
	patch('stopPropagation', () => {
		stopped = true;
	});
	patch('stopImmediatePropagation', () => {
		stopped = true;
		immediate = true;
	});
	return {
		stopped: () => stopped || (!patched && host.cancelBubble === true),
		stoppedImmediate: () => immediate,
		release: () => {
			for (const undo of restore) undo();
		},
	};
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
	if (slot.$type === 'number' && typeof slot.value === 'string') return Number(slot.value);
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
