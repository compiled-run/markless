import type { ProtocolStatePayload, ProtocolSyncPolicyCondition, ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import { assertProtocolStateCellPayload, payloadInvalidError } from '../../../serializer/src/protocol-validation.ts';
import type { SerializedGraphPayload, SerializedSlot } from '../../../serializer/src/value-decode-client.ts';
import type {
	EventOnlyResumeContainer,
	EventOnlyResumeDomElement,
	EventOnlyResumeDomNode,
	EventOnlyResumeRecord,
	EventOnlyResumeSymbol,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './types.ts';
import { marklessUpdateText } from '../fns/update-text.ts';
import { marklessWriteScalar } from '../fns/write-scalar.ts';

export type RuntimeDemandMap = {
	readonly recordKinds?: ReadonlyArray<{ readonly kind: string; readonly replaced: boolean }>;
	readonly actions?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly recordKind: string;
		readonly recordKinds?: ReadonlyArray<string>;
		readonly payloadRecordIds?: ReadonlyArray<string>;
		readonly plan?: LeanActionPlan;
	}>;
};

export type LeanActionPlan = {
	readonly version: 1;
	readonly kind: 'scalar' | 'row';
	readonly symbolId: string;
	readonly cell: string;
	readonly write: { readonly kind: 'assign' | 'update'; readonly value?: unknown; readonly valueKind?: 'undefined'; readonly localPath?: ReadonlyArray<string>; readonly updateOperator?: '++' | '--' };
	readonly textUpdates: ReadonlyArray<{ readonly hostNodeId: string; readonly graphNodeId: string; readonly symbolId: string; readonly prefix?: string }>;
	readonly repeatId?: string;
	readonly fullDecodeCells?: ReadonlyArray<string>;
};

export type LeanPlan = {
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly locators: ReadonlyArray<ProtocolViewPayload['locators'][number]>;
	readonly domUpdates: ProtocolViewPayload['domUpdates'];
	readonly keyedRepeats: NonNullable<ProtocolViewPayload['keyedRepeats']>;
	readonly cells: ProtocolStatePayload['cells'];
	readonly fullDecodeCellIds: ReadonlySet<string>;
};

export async function createLeanScalarGraph(
	plan: LeanPlan,
	elementsByHostId: Map<string, EventOnlyResumeDomElement>,
	_loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'],
): Promise<EventOnlyResumeContainer['graph']> {
	const cells = new Map<string, unknown>();
	const payloads = new Map(plan.cells.map((cell) => [cell.graphNodeId, cell.value]));
	const dirty: Array<{ readonly graphNodeId: string }> = [];
	for (const graphNodeId of plan.fullDecodeCellIds) {
		const payload = payloads.get(graphNodeId) as SerializedGraphPayload | undefined;
		cells.set(graphNodeId, payload ? await decodeFullCell(payload) : undefined);
	}
	const materialize = (graphNodeId: string) => {
		if (cells.has(graphNodeId)) return;
		const payload = payloads.get(graphNodeId) as { readonly root?: SerializedSlot } | undefined;
		cells.set(graphNodeId, payload ? decodeScalarSlot(payload.root) : undefined);
	};
	const graph: EventOnlyResumeContainer['graph'] = {
		read(graphNodeId, path = []) {
			materialize(graphNodeId);
			return readPath(cells.get(graphNodeId), path);
		},
		write(write) {
			if ((write.path?.length ?? 0) > 0) return leanEscalation('write-path');
			materialize(write.graphNodeId);
			if (Object.is(cells.get(write.graphNodeId), write.value)) return;
			cells.set(write.graphNodeId, write.value);
			dirty.push({ graphNodeId: write.graphNodeId });
		},
		update(update) {
			if ((update.path?.length ?? 0) > 0) return leanEscalation('update-path');
			materialize(update.graphNodeId);
			const previous = cells.get(update.graphNodeId);
			const next = update.update(previous);
			if (!Object.is(previous, next)) {
				cells.set(update.graphNodeId, next);
				dirty.push({ graphNodeId: update.graphNodeId });
			}
			return update.returnValue === 'previous' ? previous : update.returnValue === 'next' ? next : undefined;
		},
		call() {
			return leanEscalation('graph-call');
		},
		async flush() {
			while (dirty.length > 0) {
				const pending = dirty.splice(0);
				for (const update of plan.domUpdates) {
					if (!pending.some((path) => path.graphNodeId === update.graphNodeId)) continue;
					const element = elementsByHostId.get(update.hostNodeId);
					if (!element || !update.symbolId) continue;
					const result = marklessUpdateText({
						domUpdate: update,
						value: graph.read(update.graphNodeId),
					}, update.hostNodeId);
					applyTextJournal(result, elementsByHostId);
				}
			}
		},
	};
	return graph;
}

export function materializeHostLocator(
	root: EventOnlyResumeDomElement,
	locators: LeanPlan['locators'],
	elementsByHostId: Map<string, EventOnlyResumeDomElement>,
	hostNodeId: string,
): EventOnlyResumeDomElement | undefined {
	const cached = elementsByHostId.get(hostNodeId);
	if (cached) return cached;
	const locator = locators.find((candidate) => candidate.hostNodeId === hostNodeId);
	if (!locator) return undefined;
	const element = findElementAtDomOrderIndex(root, locator.index);
	if (!element || (locator.tagName !== '*' && element.tagName.toLowerCase() !== locator.tagName.toLowerCase())) return undefined;
	elementsByHostId.set(hostNodeId, element);
	return element;
}

export function syncPolicyGraphNodeIds(policy: EventOnlyResumeRecord['syncPolicy']): ReadonlyArray<string> {
	if (!policy) return [];
	const branches = 'branches' in policy ? policy.branches : [policy];
	return uniqueStrings(branches.flatMap((branch) => conditionGraphNodeIds(branch.when)));
}

export function cellValueNeedsFullDecode(value: unknown): boolean {
	return Boolean(value && typeof value === 'object' && Array.isArray((value as { readonly records?: unknown }).records) && (value as { readonly records: ReadonlyArray<unknown> }).records.length > 0);
}

export function readLeanStateCells(
	cells: unknown,
	cellIds: ReadonlySet<string>,
): ProtocolStatePayload['cells'] {
	if (!Array.isArray(cells)) {
		throw leanPayloadShapeError('Invalid markless/state payload: expected cells array.');
	}
	const matchingCells: ProtocolStatePayload['cells'][number][] = [];
	for (const [index, cell] of cells.entries()) {
		const graphNodeId = cell && typeof cell === 'object'
			? (cell as { readonly graphNodeId?: unknown }).graphNodeId
			: undefined;
		if (typeof graphNodeId !== 'string' || !cellIds.has(graphNodeId)) continue;
		assertProtocolStateCellPayload(cell, `markless/state cell[${index}]`);
		matchingCells.push(cell);
	}
	return matchingCells;
}

export function readLeanComputedEntries(computed: unknown): ReadonlyArray<unknown> {
	if (!Array.isArray(computed)) {
		throw leanPayloadShapeError('Invalid markless/state payload: expected computed array.');
	}
	return computed;
}

export async function resumeFullEventOnly(input: ResumeEventOnlyFromPayloadDocumentInput): Promise<EventOnlyResumeContainer> {
	if (import.meta.env?.DEV) console.warn('markless: lean resume fell back to full event container');
	const { resumeEventOnlyFromPayloadDocument } = await import('../event-only-resume.ts');
	return resumeEventOnlyFromPayloadDocument(input);
}

export async function resolveSymbol(value: EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>): Promise<EventOnlyResumeSymbol> {
	return isPromiseLike(value) ? await value : value;
}

export async function resolveResult(value: ReturnType<EventOnlyResumeSymbol>): Promise<Awaited<ReturnType<EventOnlyResumeSymbol>>> {
	return isPromiseLike(value) ? await value : value;
}

export function uniqueStrings(values: ReadonlyArray<string>): string[] {
	return [...new Set(values)].sort();
}

export function executeLeanActionPlanWrite(
	graph: EventOnlyResumeContainer['graph'],
	plan: LeanActionPlan,
	locals: Record<string, unknown> = {},
): void {
	if (plan.write.kind === 'update') {
		marklessWriteScalar({ graph }, {
			graphNodeId: plan.cell,
			returnValue: 'next',
			update(value) {
				return Number(value) + (plan.write.updateOperator === '--' ? -1 : 1);
			},
		});
		return;
	}
	marklessWriteScalar({ graph }, {
		graphNodeId: plan.cell,
		value: plan.write.localPath ? readPath(locals, plan.write.localPath) : plan.write.valueKind === 'undefined' ? undefined : plan.write.value,
	});
}

export function shadowLeanActionPlanGraph(graph: EventOnlyResumeContainer['graph']): EventOnlyResumeContainer['graph'] {
	return {
		...graph,
		write() {},
		update(update) {
			const value = graph.read(update.graphNodeId, update.path ?? []);
			return update.returnValue === 'previous' || update.returnValue === 'next' ? value : undefined;
		},
	};
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value as Record<string, unknown> | null | undefined;
	for (const key of path) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}

function findElementAtDomOrderIndex(root: EventOnlyResumeDomElement, index: number): EventOnlyResumeDomElement | undefined {
	let currentIndex = 0;
	let found: EventOnlyResumeDomElement | undefined;
	const visit = (node: EventOnlyResumeDomNode): void => {
		if (found) return;
		if (node.nodeType === 1) {
			if (currentIndex === index) {
				found = node as EventOnlyResumeDomElement;
				return;
			}
			currentIndex++;
		}
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	};
	visit(root);
	return found;
}

function applyTextJournal(result: Awaited<ReturnType<EventOnlyResumeSymbol>>, elementsByHostId: Map<string, EventOnlyResumeDomElement>): void {
	if (!result || typeof result === 'function') return;
	const entries = Array.isArray(result) ? result : [result];
	for (const entry of entries) {
		if (entry.type !== 'setText') return leanEscalation('journal-type');
		const target = elementsByHostId.get(entry.locator);
		if (target) target.textContent = entry.value == null ? '' : String(entry.value);
	}
}

function conditionGraphNodeIds(condition: ProtocolSyncPolicyCondition): ReadonlyArray<string> {
	if (condition.type === 'graph-truthy') return [condition.graphNodeId];
	if (condition.type === 'and' || condition.type === 'or') return uniqueStrings(condition.conditions.flatMap(conditionGraphNodeIds));
	if (condition.type === 'not') return conditionGraphNodeIds(condition.condition);
	return [];
}

function decodeScalarSlot(slot: SerializedSlot | undefined): unknown {
	if (slot === null || typeof slot === 'string' || typeof slot === 'number' || typeof slot === 'boolean') return slot;
	if (slot?.$type === 'undefined') return undefined;
	if (slot?.$type === 'bigint') return BigInt(slot.value);
	if (slot?.$type === 'date') return new Date(slot.value);
	return undefined;
}

async function decodeFullCell(payload: SerializedGraphPayload): Promise<unknown> {
	if (payload.records.length === 0) return decodeScalarSlot(payload.root);
	const { deserializeGraphValueForClient } = await import('../../../serializer/src/value-decode-client.ts');
	return deserializeGraphValueForClient(payload);
}

function leanEscalation(site?: string): never {
	throw Object.assign(new Error('MARKLESS_SCALAR_LEAN_ESCALATE'), {
		code: 'MARKLESS_SCALAR_LEAN_ESCALATE',
		site: site ?? '?',
	});
}

function leanPayloadShapeError(message: string): Error {
	return payloadInvalidError(
		'markless/state',
		message,
		'The markless/state payload did not match the resumability protocol shape required by this runtime.',
		[{ message: 'Regenerate the markless/state payload with the matching markless compiler/runtime version.' }],
	);
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof (value as { readonly then?: unknown }).then === 'function';
}
