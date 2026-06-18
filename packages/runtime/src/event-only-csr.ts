import type { ProtocolStatePayload, ProtocolViewPayload } from '@arcade/protocol';
import type {
	DomJournalEntry,
	DomJournalResult,
	RuntimeGraphUpdate,
	RuntimeGraphWrite,
} from './graph.ts';
import type { ResumeDomElement, ResumeDomEvent } from './resume.ts';

export type EventOnlyCsrDomElement = ResumeDomElement & {
	readonly parentElement?: EventOnlyCsrDomElement | null;
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
};

export type EventOnlyCsrGraph = {
	read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
	write(write: RuntimeGraphWrite): void;
	update(update: RuntimeGraphUpdate): unknown;
	flush(): Promise<void>;
};

export type EventOnlyCsrSymbol = (context: {
	readonly graph: EventOnlyCsrGraph;
	readonly event?: ResumeDomEvent;
	readonly element: EventOnlyCsrDomElement;
	readonly getElementHandle: () => undefined;
	readonly domUpdate?: ProtocolViewPayload['domUpdates'][number];
	readonly value?: unknown;
}) => unknown | void | DomJournalResult | Promise<unknown | void | DomJournalResult>;

export type EventOnlyCsrContainer = {
	readonly graph: EventOnlyCsrGraph;
	readonly view: ProtocolViewPayload;
	readonly dispatch: (event: ResumeDomEvent) => Promise<void>;
};

type EventOnlyCsrDirtyPath = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

const noElementHandle = () => undefined;

export function startEventOnlyCsrRuntime(
	root: ResumeDomElement,
	view: ProtocolViewPayload,
	runtime: EventOnlyCsrContainer,
): void {
	const eventNames = new Set(view.events.map((event) => event.eventName));
	for (const eventName of eventNames) {
		root.addEventListener?.(
			eventName,
			async (event: ResumeDomEvent) => {
				await runtime.dispatch(event);
			},
			{ capture: true },
		);
	}
}

export function createEventOnlyCsrContainer(input: {
	readonly root: ResumeDomElement;
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: (symbolId: string) => EventOnlyCsrSymbol | Promise<EventOnlyCsrSymbol>;
}): EventOnlyCsrContainer {
	const root = input.root as EventOnlyCsrDomElement;
	const elementsByHostId = materializeCsrDomLocators(root, input.view.locators);
	const graph = createEventOnlyCsrGraph({
		state: input.state,
		view: input.view,
		loadSymbol: input.loadSymbol,
		elementsByHostId,
	});

	return {
		graph,
		view: input.view,
		dispatch(event) {
			return dispatchEventOnlyCsrEvent({
				event,
				view: input.view,
				graph,
				loadSymbol: input.loadSymbol,
				elementsByHostId,
			});
		},
	};
}

function createEventOnlyCsrGraph(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: (symbolId: string) => EventOnlyCsrSymbol | Promise<EventOnlyCsrSymbol>;
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyCsrDomElement>;
}): EventOnlyCsrGraph {
	const cells = new Map<string, unknown>();
	const dirtyPaths: EventOnlyCsrDirtyPath[] = [];

	for (const cell of input.state.cells) {
		cells.set(
			cell.graphNodeId,
			cell.value === undefined ? undefined : deserializeCsrGraphValue(cell.value),
		);
	}

	const graph: EventOnlyCsrGraph = {
		read(graphNodeId, path = []) {
			return readPath(cells.get(graphNodeId), path);
		},
		write(write) {
			const path = write.path ?? [];
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
			cells.set(
				update.graphNodeId,
				writePath(cells.get(update.graphNodeId), path, nextValue),
			);
			dirtyPaths.push({ graphNodeId: update.graphNodeId, path });
			if (update.returnValue === 'previous') return currentValue;
			if (update.returnValue === 'next') return nextValue;
		},
		async flush() {
			while (dirtyPaths.length > 0) {
				await flushEventOnlyCsrDomUpdates({
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

async function dispatchEventOnlyCsrEvent(input: {
	readonly event: ResumeDomEvent;
	readonly view: ProtocolViewPayload;
	readonly graph: EventOnlyCsrGraph;
	readonly loadSymbol: (symbolId: string) => EventOnlyCsrSymbol | Promise<EventOnlyCsrSymbol>;
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyCsrDomElement>;
}): Promise<void> {
	const matched = findEventOnlyCsrRecord(
		input.event.target as EventOnlyCsrDomElement | null,
		input.event.type,
		input.view,
		input.elementsByHostId,
	);
	if (!matched) return;

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
			applyEventOnlyCsrDomJournal(
				isPromiseLike(result) ? await result : result,
				input.elementsByHostId,
			);
		}
	} finally {
		await input.graph.flush();
	}
}

async function flushEventOnlyCsrDomUpdates(input: {
	readonly graph: EventOnlyCsrGraph;
	readonly pending: ReadonlyArray<EventOnlyCsrDirtyPath>;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: (symbolId: string) => EventOnlyCsrSymbol | Promise<EventOnlyCsrSymbol>;
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyCsrDomElement>;
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
		applyEventOnlyCsrDomJournal(
			isPromiseLike(result) ? await result : result,
			input.elementsByHostId,
		);
	}
}

function applyEventOnlyCsrDomJournal(
	result: DomJournalResult | void,
	elementsByHostId: ReadonlyMap<string, EventOnlyCsrDomElement>,
): void {
	if (!result) return;
	const entries = Array.isArray(result) ? result : [result];
	for (const entry of entries) applyEventOnlyCsrDomJournalEntry(entry, elementsByHostId);
}

function applyEventOnlyCsrDomJournalEntry(
	entry: DomJournalEntry,
	elementsByHostId: ReadonlyMap<string, EventOnlyCsrDomElement>,
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

function materializeCsrDomLocators(
	root: EventOnlyCsrDomElement,
	locators: ProtocolViewPayload['locators'],
): Map<string, EventOnlyCsrDomElement> {
	const elements = collectCsrElements(root);
	const byHostId = new Map<string, EventOnlyCsrDomElement>();

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

function collectCsrElements(root: EventOnlyCsrDomElement): EventOnlyCsrDomElement[] {
	const elements: EventOnlyCsrDomElement[] = [];
	const visit = (node: ResumeDomElement): void => {
		if (node.nodeType === 1) elements.push(node as EventOnlyCsrDomElement);
		for (const child of Array.from(node.childNodes ?? [])) visit(child as ResumeDomElement);
	};

	visit(root);
	return elements;
}

function findEventOnlyCsrRecord(
	target: EventOnlyCsrDomElement | null,
	eventName: string,
	view: ProtocolViewPayload,
	elementsByHostId: ReadonlyMap<string, EventOnlyCsrDomElement>,
):
	| {
			readonly element: EventOnlyCsrDomElement;
			readonly eventRecord: ProtocolViewPayload['events'][number];
	  }
	| undefined {
	for (let element = target; element; element = element.parentElement ?? null) {
		for (const eventRecord of view.events) {
			if (
				eventRecord.eventName === eventName &&
				elementsByHostId.get(eventRecord.hostNodeId) === element
			) {
				return { element, eventRecord };
			}
		}
	}
}

function deserializeCsrGraphValue(payload: unknown): unknown {
	if (!isRecord(payload)) return payload;
	const records = new Map<number, Record<string, unknown>>();
	for (const record of Array.isArray(payload.records) ? payload.records : []) {
		if (isRecord(record) && typeof record.id === 'number') records.set(record.id, record);
	}
	return deserializeCsrSlot(payload.root, records);
}

function deserializeCsrSlot(
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
				if (typeof key === 'string') object[key] = deserializeCsrSlot(value, records);
			}
			return object;
		}
		if (record.type === 'array') {
			return (Array.isArray(record.items) ? record.items : []).map((value) =>
				deserializeCsrSlot(value, records),
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
