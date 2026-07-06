import type { ProtocolStatePayload, ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import type { EventOnlyResumeContainer, EventOnlyResumeDomElement, ResumeEventOnlyFromPayloadDocumentInput } from './types.ts';
import type { ResumeDomElement } from '../resume-types.ts';
import {
	cellValueNeedsFullDecode,
	createLeanScalarGraph,
	type LeanPlan,
	materializeHostLocator,
	type RuntimeDemandMap,
	resolveResult,
	resolveSymbol,
	resumeFullEventOnly,
	syncPolicyGraphNodeIds,
} from './lean-shared.ts';

export async function resumeScalarRowEventFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	const { readRowPayloadRecordsFromDocument } = await import('./payload-records.ts');
	const payload = readRowPayloadRecordsFromDocument(input.document, {
		eventName: input.event.type,
		runtimeDemandMap: input.runtimeDemandMap,
	});
	if (!payload) return resumeFullEventOnly(input);
	const { state, view } = payload;
	const plan = scalarRowLeanResumePlan({ state, view, runtimeDemandMap: input.runtimeDemandMap, eventName: input.event.type });
	if (!plan) return resumeFullEventOnly(input);

	const elementsByHostId = new Map<string, EventOnlyResumeDomElement>();
	const graph = await createLeanScalarGraph(plan, elementsByHostId, input.loadSymbol);
	const { findKeyedRepeatRowEventMatch, findRepeatItemByKey, readKeyedRepeatCollection, validateOneRepeat } = await import('../resume-keyed-repeats.ts');
	const rowDispatch = findKeyedRepeatRowEventMatch({
		graph: graph as never,
		view: { keyedRepeats: plan.keyedRepeats },
		elementsByHostId: elementsByHostId as never,
		target: (input.element ?? input.event.target) as ResumeDomElement | null | undefined,
		eventName: input.event.type,
		materializeHost: (hostNodeId) =>
			materializeHostLocator(input.root, plan.locators, elementsByHostId, hostNodeId) as ResumeDomElement | undefined,
	});
	if (!rowDispatch) return resumeFullEventOnly(input);
	for (const update of plan.domUpdates) {
		if (!materializeHostLocator(input.root, plan.locators, elementsByHostId, update.hostNodeId)) return resumeFullEventOnly(input);
	}
	const activeRecord = rowDispatch.match.rowEvent;
	if (activeRecord.syncPolicy && !input.syncPolicyAlreadyApplied) {
		const { runSyncPolicyActions } = await import('../inline/sync-policy-core.ts');
		runSyncPolicyActions(activeRecord.syncPolicy, graph, input.event);
	}
	validateOneRepeat(graph as never, rowDispatch.match.repeat);
	const rowLocals = {
		[rowDispatch.match.repeat.itemName]: findRepeatItemByKey(
			readKeyedRepeatCollection(graph as never, rowDispatch.match.repeat),
			rowDispatch.match.repeat,
			rowDispatch.match.rowKey,
		),
	};
	for (const symbolId of activeRecord.symbolIds) {
		const symbol = await resolveSymbol(input.loadSymbol(symbolId));
		void await resolveResult(symbol({
			graph,
			event: input.event,
			element: rowDispatch.element,
			getElementHandle: () => undefined,
			locals: rowLocals,
		}));
	}
	await graph.flush();
	return {
		graph,
		view: {
			version: view.version,
			locators: plan.locators,
			events: [],
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

export function isScalarRowLeanResumeShape(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly eventName?: string;
	readonly runtimeDemandMap?: unknown;
}): boolean {
	return scalarRowLeanResumePlan(input) !== null;
}

function scalarRowLeanResumePlan(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly eventName?: string;
	readonly runtimeDemandMap?: unknown;
}): LeanPlan | null {
	if (input.state.computed.some((computed) => computed.async === false)) return null;
	if ((input.view.elementHandles?.length ?? 0) > 0) return null;
	const demandMap = input.runtimeDemandMap as RuntimeDemandMap | undefined;
	if (!demandMap?.recordKinds || !demandMap.actions) return null;
	const replaced = new Map(demandMap.recordKinds.map((record) => [record.kind, record.replaced]));
	if (replaced.get('keyed-repeat') !== true || replaced.get('dom-update') !== true) return null;
	const action = demandMap.actions.find((candidate) =>
		candidate.recordKind === 'keyed-repeat-row' &&
		(!input.eventName || candidate.eventName === input.eventName)
	);
	if (!action?.payloadRecordIds) return null;
	if ((action.recordKinds ?? []).some((kind) => kind !== 'keyed-repeat' && kind !== 'dom-update')) return null;
	const recordIds = new Set(action.payloadRecordIds);
	const keyedRepeats = (input.view.keyedRepeats ?? []).filter((record) => recordIds.has(`keyed-repeat:${record.id}`));
	if (keyedRepeats.length !== 1) return null;
	const repeat = keyedRepeats[0]!;
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
