import type { ProtocolStatePayload, ProtocolSyncPolicyCondition, ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import type { SerializedGraphPayload, SerializedSlot } from '../../../serializer/src/value-decode-client.ts';
import type { EventOnlyResumeContainer, EventOnlyResumeDomElement, EventOnlyResumeDomEvent, EventOnlyResumeDomNode, EventOnlyResumeRecord, EventOnlyResumeSymbol, ResumeEventOnlyFromPayloadDocumentInput } from './types.ts';
import type { ResumeDomElement } from '../resume-types.ts';

type RuntimeDemandMap = {
	readonly recordKinds?: ReadonlyArray<{ readonly kind: string; readonly replaced: boolean }>;
	readonly actions?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly recordKind: string;
		readonly recordKinds?: ReadonlyArray<string>;
		readonly payloadRecordIds?: ReadonlyArray<string>;
	}>;
};

type ScalarPlan = {
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly locators: ReadonlyArray<ProtocolViewPayload['locators'][number]>;
	readonly domUpdates: ProtocolViewPayload['domUpdates'];
	readonly keyedRepeats: NonNullable<ProtocolViewPayload['keyedRepeats']>;
	readonly cells: ProtocolStatePayload['cells'];
	readonly fullDecodeCellIds: ReadonlySet<string>;
};

export async function resumeScalarEventFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	const { decodePayloadScriptsFromDocument } = await import('../inline/payload-document.ts');
	const { state, view } = decodePayloadScriptsFromDocument(input.document);
	const plan = scalarLeanResumePlan({
		state,
		view,
		eventRecord: input.eventRecord,
		eventName: input.event.type,
		runtimeDemandMap: input.runtimeDemandMap,
	});
	if (!plan) return resumeFullEventOnly(input);

	const elementsByHostId = new Map<string, EventOnlyResumeDomElement>();
	const graph = await createScalarGraph(plan, elementsByHostId, input.loadSymbol);
	const rowDispatch = !plan.eventRecord
		? await findLeanRowDispatch({ input, plan, graph, elementsByHostId })
		: undefined;
	if (!plan.eventRecord && !rowDispatch) return resumeFullEventOnly(input);
	const activeRecord = plan.eventRecord ?? rowDispatch?.match.rowEvent;
	if (!activeRecord) return resumeFullEventOnly(input);
	const element = plan.eventRecord
		? input.element ??
			materializeHostLocator(input.root, plan.locators, elementsByHostId, plan.eventRecord.hostNodeId) ??
			input.event.target
		: rowDispatch?.element;
	if (!element) return resumeFullEventOnly(input);
	// Direct SSR container children include single-root and fragment sibling roots; keep them on the proven full path for now.
	if (element.parentElement === input.root) return resumeFullEventOnly(input);
	for (const update of plan.domUpdates) {
		if (!materializeHostLocator(input.root, plan.locators, elementsByHostId, update.hostNodeId)) {
			return resumeFullEventOnly(input);
		}
	}

	if (activeRecord.syncPolicy && !input.syncPolicyAlreadyApplied) {
		const { runSyncPolicyActions } = await import('../inline/sync-policy-core.ts');
		runSyncPolicyActions(activeRecord.syncPolicy, graph, input.event);
	}
	let rowLocals: Readonly<Record<string, unknown>> | undefined;
	if (rowDispatch) {
		const { findRepeatItemByKey, readKeyedRepeatCollection, validateOneRepeat } = await import('../resume-keyed-repeats.ts');
		validateOneRepeat(graph as never, rowDispatch.match.repeat);
		rowLocals = {
			[rowDispatch.match.repeat.itemName]: findRepeatItemByKey(
				readKeyedRepeatCollection(graph as never, rowDispatch.match.repeat),
				rowDispatch.match.repeat,
				rowDispatch.match.rowKey,
			),
		};
	}
	for (const symbolId of activeRecord.symbolIds) {
		const symbol = await resolveSymbol(input.loadSymbol(symbolId));
		const result = await resolveResult(symbol({
			graph,
			event: input.event,
			element,
			getElementHandle: () => undefined,
			locals: rowLocals,
		}));
		// Handler symbol returns are user values (e.g. the numeric result of count++),
		// never journal entries — journal semantics apply only to dom-update symbols.
		void result;
	}
	await graph.flush();
	return {
		graph,
		view: {
			version: view.version,
			locators: plan.locators,
			events: plan.eventRecord ? [plan.eventRecord] : [],
			domUpdates: plan.domUpdates,
			behaviors: [],
			elementHandles: [],
			keyedRepeats: plan.keyedRepeats,
			branches: [],
			asyncBoundaries: [],
		},
		dispatch(event) {
			return resumeFullEventOnly({ ...input, event }).then(() => undefined);
		},
		dispose() {
			delete input.root.__marklessEventOnlyGraph;
		},
	};
}

export function isScalarLeanResumeShape(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly eventName?: string;
	readonly runtimeDemandMap?: unknown;
}): boolean {
	return scalarLeanResumePlan(input) !== null;
}

function scalarLeanResumePlan(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly eventName?: string;
	readonly runtimeDemandMap?: unknown;
}): ScalarPlan | null {
	if ((input.view.elementHandles?.length ?? 0) > 0) return null;
	const demandMap = input.runtimeDemandMap as RuntimeDemandMap | undefined;
	if (!demandMap?.recordKinds || !demandMap.actions) return null;
	const replaced = new Map(demandMap.recordKinds.map((record) => [record.kind, record.replaced]));
	if (input.eventRecord) {
		return scalarEventLeanResumePlan({ state: input.state, view: input.view, eventRecord: input.eventRecord }, demandMap, replaced);
	}
	return scalarRowLeanResumePlan(input, demandMap, replaced, input.eventName);
}

function scalarEventLeanResumePlan(
	input: {
		readonly state: ProtocolStatePayload;
		readonly view: ProtocolViewPayload;
		readonly eventRecord: EventOnlyResumeRecord;
	},
	demandMap: RuntimeDemandMap,
	replaced: ReadonlyMap<string, boolean>,
): ScalarPlan | null {
	if (input.state.computed.length > 0) return null;
	if ((input.view.behaviors?.length ?? 0) > 0 || (input.view.keyedRepeats?.length ?? 0) > 0) return null;
	if ((input.view.branches?.length ?? 0) > 0 || (input.view.asyncBoundaries?.length ?? 0) > 0) return null;
	if (replaced.get('event') !== true || replaced.get('dom-update') !== true) return null;
	const action = demandMap.actions.find((candidate) =>
		candidate.recordKind === 'event' &&
		candidate.hostNodeId === input.eventRecord.hostNodeId &&
		candidate.eventName === input.eventRecord.eventName,
	);
	if (!action?.payloadRecordIds) return null;
	if ((action.recordKinds ?? []).some((kind) => kind !== 'event' && kind !== 'dom-update')) return null;
	const recordIds = new Set(action.payloadRecordIds);
	if (!recordIds.has(`event:${input.eventRecord.hostNodeId}:${input.eventRecord.eventName}`)) return null;
	const domUpdates = input.view.domUpdates.filter((record) =>
		recordIds.has(`dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`),
	);
	if (domUpdates.some((record) => !record.symbolId || record.target?.kind !== 'text')) return null;
	const cellIds = new Set([
		...domUpdates.map((record) => record.graphNodeId),
		...syncPolicyGraphNodeIds(input.eventRecord.syncPolicy),
	]);
	const cells = input.state.cells.filter((cell) => cellIds.has(cell.graphNodeId));
	if (cells.length !== cellIds.size) return null;
	if (cells.some((cell) => cell.valueKind !== 'scalar' || cellValueNeedsFullDecode(cell.value))) return null;
	const locatorHostIds = new Set([
		input.eventRecord.hostNodeId,
		...domUpdates.map((record) => record.hostNodeId),
	]);
	return {
		eventRecord: input.eventRecord,
		locators: input.view.locators.filter((locator) => locatorHostIds.has(locator.hostNodeId)),
		domUpdates,
		keyedRepeats: [],
		cells,
		fullDecodeCellIds: new Set(),
	};
}

function scalarRowLeanResumePlan(
	input: {
		readonly state: ProtocolStatePayload;
		readonly view: ProtocolViewPayload;
	},
	demandMap: RuntimeDemandMap,
	replaced: ReadonlyMap<string, boolean>,
	eventName?: string,
): ScalarPlan | null {
	if (input.state.computed.some((computed) => computed.async === false)) return null;
	if ((input.view.elementHandles?.length ?? 0) > 0) return null;
	if (replaced.get('keyed-repeat') !== true || replaced.get('dom-update') !== true) return null;
	const action = demandMap.actions.find((candidate) =>
		candidate.recordKind === 'keyed-repeat-row' &&
		(!eventName || candidate.eventName === eventName)
	);
	if (!action?.payloadRecordIds) return null;
	if ((action.recordKinds ?? []).some((kind) => kind !== 'keyed-repeat' && kind !== 'dom-update')) return null;
	const recordIds = new Set(action.payloadRecordIds);
	const keyedRepeats = (input.view.keyedRepeats ?? []).filter((record) => recordIds.has(`keyed-repeat:${record.id}`));
	if (keyedRepeats.length !== 1) return null;
	const repeat = keyedRepeats[0];
	if (!repeat.collectionGraphNodeId) return null;
	const rowEvent = repeat.rowEvents.find((event) => event.eventName === action.eventName);
	if (!rowEvent) return null;
	const domUpdates = input.view.domUpdates.filter((record) =>
		recordIds.has(`dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`),
	);
	if (domUpdates.length === 0 || domUpdates.some((record) => !record.symbolId || record.target?.kind !== 'text')) return null;
	const scalarCellIds = new Set([
		...domUpdates.map((record) => record.graphNodeId),
		...syncPolicyGraphNodeIds(rowEvent.syncPolicy),
	]);
	const fullDecodeCellIds = new Set([repeat.collectionGraphNodeId]);
	const cellIds = new Set([...scalarCellIds, ...fullDecodeCellIds]);
	const cells = input.state.cells.filter((cell) => cellIds.has(cell.graphNodeId));
	if (cells.length !== cellIds.size) return null;
	if (cells.some((cell) =>
		scalarCellIds.has(cell.graphNodeId) &&
		(cell.valueKind !== 'scalar' || cellValueNeedsFullDecode(cell.value))
	)) return null;
	const locatorHostIds = new Set([
		repeat.parentHostNodeId,
		...domUpdates.map((record) => record.hostNodeId),
	]);
	return {
		locators: input.view.locators.filter((locator) => locatorHostIds.has(locator.hostNodeId)),
		domUpdates,
		keyedRepeats,
		cells,
		fullDecodeCellIds,
	};
}

async function findLeanRowDispatch(input: {
	readonly input: ResumeEventOnlyFromPayloadDocumentInput;
	readonly plan: ScalarPlan;
	readonly graph: EventOnlyResumeContainer['graph'];
	readonly elementsByHostId: Map<string, EventOnlyResumeDomElement>;
}) {
	const { findKeyedRepeatRowEventMatch } = await import('../resume-keyed-repeats.ts');
	return findKeyedRepeatRowEventMatch({
		graph: input.graph as never,
		view: { keyedRepeats: input.plan.keyedRepeats },
		elementsByHostId: input.elementsByHostId as never,
		target: (input.input.element ?? input.input.event.target) as ResumeDomElement | null | undefined,
		eventName: input.input.event.type,
		materializeHost: (hostNodeId) =>
			materializeHostLocator(input.input.root, input.plan.locators, input.elementsByHostId, hostNodeId) as ResumeDomElement | undefined,
	});
}

async function createScalarGraph(
	plan: ScalarPlan,
	elementsByHostId: Map<string, EventOnlyResumeDomElement>,
	loadSymbol: ResumeEventOnlyFromPayloadDocumentInput['loadSymbol'],
): Promise<EventOnlyResumeContainer['graph']> {
	const cells = new Map<string, unknown>();
	const payloads = new Map(plan.cells.map((cell) => [cell.graphNodeId, cell.value]));
	const dirty: Array<{ readonly graphNodeId: string; readonly path: ReadonlyArray<string> }> = [];
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
			if ((write.path?.length ?? 0) > 0) return resumeEscalation('write-path');
			materialize(write.graphNodeId);
			if (Object.is(cells.get(write.graphNodeId), write.value)) return;
			cells.set(write.graphNodeId, write.value);
			dirty.push({ graphNodeId: write.graphNodeId, path: [] });
		},
		update(update) {
			if ((update.path?.length ?? 0) > 0) return resumeEscalation('update-path');
			materialize(update.graphNodeId);
			const previous = cells.get(update.graphNodeId);
			const next = update.update(previous);
			if (!Object.is(previous, next)) {
				cells.set(update.graphNodeId, next);
				dirty.push({ graphNodeId: update.graphNodeId, path: [] });
			}
			return update.returnValue === 'previous' ? previous : update.returnValue === 'next' ? next : undefined;
		},
		call() {
			return resumeEscalation('graph-call');
		},
		async flush() {
			while (dirty.length > 0) {
				const pending = dirty.splice(0);
				for (const update of plan.domUpdates) {
					if (!pending.some((path) => path.graphNodeId === update.graphNodeId)) continue;
					const element = elementsByHostId.get(update.hostNodeId);
					if (!element || !update.symbolId) continue;
					const symbol = await resolveSymbol(loadSymbol(update.symbolId));
					const result = await resolveResult(symbol({
						graph,
						element,
						getElementHandle: () => undefined,
						domUpdate: update,
						value: graph.read(update.graphNodeId),
					}));
					applyTextJournal(result, elementsByHostId);
				}
			}
		},
	};
	return graph;
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value as Record<string, unknown> | null | undefined;
	for (const key of path) { if (cursor == null) return undefined; cursor = cursor[key] as Record<string, unknown> | null | undefined; }
	return cursor;
}

function materializeHostLocator(
	root: EventOnlyResumeDomElement,
	locators: ScalarPlan['locators'],
	elementsByHostId: Map<string, EventOnlyResumeDomElement>,
	hostNodeId: string,
): EventOnlyResumeDomElement | undefined {
	const cached = elementsByHostId.get(hostNodeId);
	if (cached) return cached;
	const locator = locators.find((candidate) => candidate.hostNodeId === hostNodeId);
	if (!locator) return undefined;
	const element = findElementAtDomOrderIndex(root, locator.index);
	if (!element || (locator.tagName !== '*' && element.tagName.toLowerCase() !== locator.tagName.toLowerCase())) {
		return undefined;
	}
	elementsByHostId.set(hostNodeId, element);
	return element;
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
		if (entry.type !== 'setText') return resumeEscalation('journal-type');
		const target = elementsByHostId.get(entry.locator);
		if (target) target.textContent = entry.value == null ? '' : String(entry.value);
	}
}

function syncPolicyGraphNodeIds(policy: EventOnlyResumeRecord['syncPolicy']): ReadonlyArray<string> {
	if (!policy) return [];
	const branches = 'branches' in policy ? policy.branches : [policy];
	return uniqueStrings(branches.flatMap((branch) => conditionGraphNodeIds(branch.when)));
}

function conditionGraphNodeIds(condition: ProtocolSyncPolicyCondition): ReadonlyArray<string> {
	if (condition.type === 'graph-truthy') return [condition.graphNodeId];
	if (condition.type === 'and' || condition.type === 'or') return uniqueStrings(condition.conditions.flatMap(conditionGraphNodeIds));
	if (condition.type === 'not') return conditionGraphNodeIds(condition.condition);
	return [];
}

function cellValueNeedsFullDecode(value: unknown): boolean {
	return Boolean(value && typeof value === 'object' && Array.isArray((value as { readonly records?: unknown }).records) && (value as { readonly records: ReadonlyArray<unknown> }).records.length > 0);
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

function resumeEscalation(site?: string): never {
	throw Object.assign(new Error('MARKLESS_SCALAR_LEAN_ESCALATE: Scalar lean cannot serve site=' + (site ?? '?')), {
		code: 'MARKLESS_SCALAR_LEAN_ESCALATE',
		severity: 'error',
		phase: 'runtime',
		docsUrl: 'https://markless.dev/errors/MARKLESS_SCALAR_LEAN_ESCALATE',
	});
}

async function resumeFullEventOnly(input: ResumeEventOnlyFromPayloadDocumentInput): Promise<EventOnlyResumeContainer> {
	if (import.meta.env?.DEV) console.warn('markless: scalar lean resume fell back to full event container');
	const { resumeEventOnlyFromPayloadDocument } = await import('../event-only-resume.ts');
	return resumeEventOnlyFromPayloadDocument(input);
}

async function resolveSymbol(value: EventOnlyResumeSymbol | Promise<EventOnlyResumeSymbol>): Promise<EventOnlyResumeSymbol> {
	return isPromiseLike(value) ? await value : value;
}

async function resolveResult(value: ReturnType<EventOnlyResumeSymbol>): Promise<Awaited<ReturnType<EventOnlyResumeSymbol>>> {
	return isPromiseLike(value) ? await value : value;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof (value as { readonly then?: unknown }).then === 'function';
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
	return [...new Set(values)].sort();
}
