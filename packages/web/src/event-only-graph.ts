import type { SerializedGraphPayload } from '../../serializer/src/value-decode-client.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '../../serializer/src/protocol.ts';
import type {
	DomJournalEntry,
	DomJournalResult,
	RuntimeGraphCall,
	RuntimeGraphUpdate,
	RuntimeGraphWrite,
} from '@markless/runtime';
import type {
	EventOnlyResumeDomElement,
	EventOnlyResumeSymbol,
} from './event-only-lean/types.ts';
import {
	decodeScalarSlot,
	eventOnlyGraphCells,
	pathsIntersect,
	readPath,
	writePath,
} from './event-only-lean/scalar.ts';
export type EventOnlyResumeGraph = {
	read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
	write(write: RuntimeGraphWrite): void;
	update(update: RuntimeGraphUpdate): unknown;
	call(call: RuntimeGraphCall): unknown;
	flush(): Promise<void>;
	materializeAll?(): Promise<void>;
};
type DirtyPath = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};
type EventOnlySyncComputedRecord = ProtocolStatePayload['computed'][number] & {
	readonly deriveSymbolId: string;
};
const noElementHandle = () => undefined;
export async function createEventOnlyResumeGraph(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: (symbolId: string) => EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>;
	readonly root: EventOnlyResumeDomElement;
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
	readonly resolveElementByHostId?: (hostNodeId: string) => Promise<EventOnlyResumeDomElement | undefined>;
}): Promise<EventOnlyResumeGraph> {
	const cells = eventOnlyGraphCells(input.root);
	const cellPayloads = new Map(input.state.cells.map((cell) => [cell.graphNodeId, cell.value]));
	const dirtyPaths: DirtyPath[] = [];
	const materializeCell = (graphNodeId: string): void => {
		if (cells.has(graphNodeId)) return;
		const payload = cellPayloads.get(graphNodeId);
		if (payload === undefined) {
			cells.set(graphNodeId, undefined);
			return;
		}
		const graphPayload = payload as SerializedGraphPayload;
		if (graphPayload.records.length > 0) throw leanGraphEscalation(graphNodeId);
		cells.set(graphNodeId, decodeScalarSlot(graphPayload.root));
	};
	const materializeAll = async (): Promise<void> => {
		for (const [graphNodeId, payload] of cellPayloads) {
			if (cells.has(graphNodeId)) continue;
			cells.set(
				graphNodeId,
				payload === undefined
					? undefined
					: await decodeEventOnlyCellValue(payload as SerializedGraphPayload),
			);
		}
	};
	const graph: EventOnlyResumeGraph = {
		read(graphNodeId, path = []) {
			materializeCell(graphNodeId);
			return readPath(cells.get(graphNodeId), path);
		},
		write(write) {
			const path = write.path ?? [];
			if (!cells.has(write.graphNodeId) && path.length === 0) {
				cells.set(write.graphNodeId, write.value);
				dirtyPaths.push({ graphNodeId: write.graphNodeId, path });
				return;
			}
			materializeCell(write.graphNodeId);
			const currentValue = readPath(cells.get(write.graphNodeId), path);
			if (Object.is(currentValue, write.value)) return;
			cells.set(write.graphNodeId, writePath(cells.get(write.graphNodeId), path, write.value));
			dirtyPaths.push({ graphNodeId: write.graphNodeId, path });
		},
		update(update) {
			const path = update.path ?? [];
			materializeCell(update.graphNodeId);
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
		call(call) {
			const path = call.path ?? [];
			materializeCell(call.graphNodeId);
			const target = readPath(cells.get(call.graphNodeId), path) as
				| Record<string, unknown>
				| undefined;
			const method = target?.[call.method];
			if (typeof method !== 'function') {
				throw new TypeError(`Unsupported graph collection method "${call.method}".`);
			}
			const result = Reflect.apply(method, target, [...(call.args ?? [])]);
			dirtyPaths.push({ graphNodeId: call.graphNodeId, path });
			return result;
		},
		async flush() {
			while (dirtyPaths.length > 0) {
				const pending = dirtyPaths.splice(0);
				await flushSyncComputeds({
					graph,
					pending,
					state: input.state,
					loadSymbol: input.loadSymbol,
					root: input.root,
				});
				await flushDomUpdates({
					graph,
					pending,
					view: input.view,
					loadSymbol: input.loadSymbol,
					elementsByHostId: input.elementsByHostId,
					resolveElementByHostId: input.resolveElementByHostId,
				});
			}
		},
		materializeAll,
	};
	return graph;
}

function leanGraphEscalation(graphNodeId: string): Error {
	const error = new Error(`Event-only lean graph needs full decode for ${graphNodeId}.`);
	(error as { code?: string }).code = 'MARKLESS_EVENT_ONLY_LEAN_ESCALATE';
	return error;
}
async function decodeEventOnlyCellValue(payload: SerializedGraphPayload): Promise<unknown> {
	if (payload.records.length === 0) return decodeScalarSlot(payload.root);
	const { deserializeGraphValueForClient } = await import('../../serializer/src/value-decode-client.ts');
	return deserializeGraphValueForClient(payload);
}
async function flushSyncComputeds(input: {
	readonly graph: EventOnlyResumeGraph;
	readonly pending: ReadonlyArray<DirtyPath>;
	readonly state: ProtocolStatePayload;
	readonly loadSymbol: (symbolId: string) => EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>;
	readonly root: EventOnlyResumeDomElement;
}): Promise<void> {
	const ranComputeds = new Set<string>();
	for (const computed of syncComputedRecords(input.state)) {
		const dirty = (computed.dependencies ?? []).some((dependency) =>
			input.pending.some(
				(path) =>
					path.graphNodeId === dependency.graphNodeId &&
					pathsIntersect(path.path, dependency.path),
			),
		);
		if (!dirty || ranComputeds.has(computed.graphNodeId)) continue;
		ranComputeds.add(computed.graphNodeId);
		const symbol = await resolveSymbol(input.loadSymbol(computed.deriveSymbolId));
		const value = await resolveResult(
			symbol({
				graph: input.graph,
				element: input.root,
				getElementHandle: noElementHandle,
			}),
		);
		input.graph.write({ graphNodeId: computed.graphNodeId, value });
	}
}
async function flushDomUpdates(input: {
	readonly graph: EventOnlyResumeGraph;
	readonly pending: ReadonlyArray<DirtyPath>;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: (symbolId: string) => EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>;
	readonly elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>;
	readonly resolveElementByHostId?: (hostNodeId: string) => Promise<EventOnlyResumeDomElement | undefined>;
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
		const element =
			input.elementsByHostId.get(domUpdate.hostNodeId) ??
			(await input.resolveElementByHostId?.(domUpdate.hostNodeId));
		if (!element) continue;
		const symbol = await resolveSymbol(input.loadSymbol(domUpdate.symbolId));
		const result = await resolveResult(
			symbol({
				graph: input.graph,
				element,
				getElementHandle: noElementHandle,
				domUpdate,
				value: input.graph.read(domUpdate.graphNodeId, domUpdate.path),
			}),
		);
		if (typeof result !== 'function') applyDomJournalResult(result, input.elementsByHostId);
	}
}
export function applyDomJournalResult(
	result: DomJournalResult | void,
	elementsByHostId: ReadonlyMap<string, EventOnlyResumeDomElement>,
): void {
	if (!result) return;
	const entries = Array.isArray(result) ? result : [result];
	for (const entry of entries) applyDomJournalEntry(entry, elementsByHostId);
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
function syncComputedRecords(state: ProtocolStatePayload): EventOnlySyncComputedRecord[] {
	return state.computed.filter(
		(computed): computed is EventOnlySyncComputedRecord =>
			computed.async === false &&
			typeof (computed as EventOnlySyncComputedRecord).deriveSymbolId === 'string',
	);
}
function stringifyDomValue(value: unknown): string {
	if (value == null) return '';
	return String(value);
}
async function resolveSymbol(
	value: EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>,
): Promise<EventOnlyResumeSymbol> {
	return isPromiseLike(value) ? await value : value;
}
async function resolveResult(
	value: ReturnType<EventOnlyResumeSymbol>,
): Promise<Awaited<ReturnType<EventOnlyResumeSymbol>>> {
	return isPromiseLike(value) ? await value : value;
}
function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}
