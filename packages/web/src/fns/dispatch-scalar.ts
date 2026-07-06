import type { ProtocolStatePayload, ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import type {
	DomJournalEntry,
	DomJournalResult,
	RuntimeGraphUpdate,
	RuntimeGraphWrite,
} from '@markless/runtime';
import type {
	EventOnlyResumeDomElement,
	EventOnlyResumeDomEvent,
	EventOnlyResumeRecord,
	EventOnlyResumeSymbol,
} from '../event-only-lean/types.ts';
import {
	decodeScalarSlot,
	eventOnlyGraphCells,
	pathsIntersect,
	readPath,
	writePath,
} from '../event-only-lean/scalar.ts';

type DirtyPath = {
	readonly graphNodeId: string;
	readonly path: readonly string[];
};

export async function marklessDispatchScalarEvent(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: EventOnlyResumeDomElement;
	readonly event: EventOnlyResumeDomEvent;
	readonly element?: EventOnlyResumeDomElement;
	readonly eventRecord?: EventOnlyResumeRecord | null;
	readonly loadSymbol: (
		symbolId: string,
	) => EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>;
}): Promise<void> {
	const cells = eventOnlyGraphCells(input.root);
	const payloads = new Map(input.state.cells.map((cell) => [cell.graphNodeId, cell.value]));
	const dirtyPaths: DirtyPath[] = [];
	const locators = new Map(input.view.locators.map((locator) => [locator.hostNodeId, locator]));
	const elements = new Map<string, EventOnlyResumeDomElement>();
	const graph = {
		read(graphNodeId: string, path: readonly string[] = []) {
			materializeCell(cells, payloads, graphNodeId);
			return readPath(cells.get(graphNodeId), path);
		},
		write(write: RuntimeGraphWrite) {
			const path = write.path ?? [];
			materializeCell(cells, payloads, write.graphNodeId);
			const current = readPath(cells.get(write.graphNodeId), path);
			if (Object.is(current, write.value)) return;
			cells.set(write.graphNodeId, writePath(cells.get(write.graphNodeId), path, write.value));
			dirtyPaths.push({ graphNodeId: write.graphNodeId, path });
		},
		update(update: RuntimeGraphUpdate) {
			const path = update.path ?? [];
			materializeCell(cells, payloads, update.graphNodeId);
			const current = readPath(cells.get(update.graphNodeId), path);
			const next = update.update(current);
			if (!Object.is(current, next)) {
				cells.set(update.graphNodeId, writePath(cells.get(update.graphNodeId), path, next));
				dirtyPaths.push({ graphNodeId: update.graphNodeId, path });
			}
			return update.returnValue === 'previous' ? current : next;
		},
		call() {
			throw new TypeError('Scalar dispatch does not support graph collection calls.');
		},
		async flush() {
			while (dirtyPaths.length > 0) {
				const pending = dirtyPaths.splice(0);
				for (const domUpdate of input.view.domUpdates) {
					if (!domUpdate.symbolId) continue;
					if (
						!pending.some(
							(path) =>
								path.graphNodeId === domUpdate.graphNodeId &&
								pathsIntersect(path.path, domUpdate.path),
						)
					) continue;
					const element = materializeHost(input.root, locators, elements, domUpdate.hostNodeId);
					if (!element) continue;
					const symbol = await resolve(input.loadSymbol(domUpdate.symbolId));
					applyDomJournalResult(
						await resolve(symbol({
							graph,
							element,
							getElementHandle: () => undefined,
							domUpdate,
							value: graph.read(domUpdate.graphNodeId, domUpdate.path),
						})),
						elements,
					);
				}
			}
		},
	};
	if (input.eventRecord === null) return;
	const matched = input.eventRecord
		? {
				record: input.eventRecord,
				element:
					input.element ??
					materializeHost(input.root, locators, elements, input.eventRecord.hostNodeId) ??
					input.root,
			}
		: findEventRecord({
				target: input.event.target,
				eventName: input.event.type,
				root: input.root,
				events: input.view.events,
				locators,
				elements,
			});
	if (!matched) return;
	for (const symbolId of matched.record.symbolIds) {
		const symbol = await resolve(input.loadSymbol(symbolId));
		applyDomJournalResult(
			await resolve(
				symbol({
					graph,
					event: input.event,
					element: matched.element,
					getElementHandle: () => undefined,
				}),
			),
			elements,
		);
	}
	await graph.flush();
}

function findEventRecord(input: {
	readonly target: EventOnlyResumeDomElement | null;
	readonly eventName: string;
	readonly root: EventOnlyResumeDomElement;
	readonly events: ReadonlyArray<EventOnlyResumeRecord>;
	readonly locators: ReadonlyMap<string, ProtocolViewPayload['locators'][number]>;
	readonly elements: Map<string, EventOnlyResumeDomElement>;
}):
	| { readonly record: EventOnlyResumeRecord; readonly element: EventOnlyResumeDomElement }
	| undefined {
	for (let element = input.target; element; element = element.parentElement ?? null) {
		for (const record of input.events) {
			if (record.eventName !== input.eventName) continue;
			const host = materializeHost(input.root, input.locators, input.elements, record.hostNodeId);
			if (host === element) return { record, element };
		}
	}
}

function materializeCell(
	cells: Map<string, unknown>,
	payloads: ReadonlyMap<string, unknown>,
	graphNodeId: string,
): void {
	if (cells.has(graphNodeId)) return;
	const payload = payloads.get(graphNodeId) as SerializedGraphPayload | undefined;
	cells.set(graphNodeId, payload ? decodeScalarSlot(payload.root) : undefined);
}

function materializeHost(
	root: EventOnlyResumeDomElement,
	locators: ReadonlyMap<string, ProtocolViewPayload['locators'][number]>,
	elements: Map<string, EventOnlyResumeDomElement>,
	hostNodeId: string,
): EventOnlyResumeDomElement | undefined {
	const cached = elements.get(hostNodeId);
	if (cached) return cached;
	const locator = locators.get(hostNodeId);
	const element = locator ? findElementAtDomOrderIndex(root, locator.index) : undefined;
	if (element) elements.set(hostNodeId, element);
	return element;
}

function findElementAtDomOrderIndex(
	root: EventOnlyResumeDomElement,
	targetIndex: number,
): EventOnlyResumeDomElement | undefined {
	let index = -1;
	const visit = (node: {
		readonly nodeType: number;
		readonly childNodes?: ArrayLike<unknown>;
	}): EventOnlyResumeDomElement | undefined => {
		if (node.nodeType === 1) {
			index++;
			if (index === targetIndex) return node as EventOnlyResumeDomElement;
		}
		for (const child of Array.from(node.childNodes ?? [])) {
			const found = visit(child as {
				readonly nodeType: number;
				readonly childNodes?: ArrayLike<unknown>;
			});
			if (found) return found;
		}
	};
	return visit(root);
}

function applyDomJournalResult(
	result: DomJournalResult | void,
	elements: ReadonlyMap<string, EventOnlyResumeDomElement>,
): void {
	const entries = !result ? [] : Array.isArray(result) ? result : [result];
	for (const entry of entries) applyDomJournalEntry(entry, elements);
}

function applyDomJournalEntry(
	entry: DomJournalEntry,
	elements: ReadonlyMap<string, EventOnlyResumeDomElement>,
): void {
	const target = elements.get(entry.locator);
	if (!target) return;
	if (entry.type === 'setText') target.textContent = entry.value == null ? '' : String(entry.value);
}

async function resolve<T>(value: T | Promise<T>): Promise<T> {
	return value && typeof (value as { readonly then?: unknown }).then === 'function'
		? await value
		: value;
}
