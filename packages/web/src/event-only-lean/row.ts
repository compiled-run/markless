import type {
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '../../../serializer/src/protocol.ts';
import type {
	EventOnlyResumeContainer,
	EventOnlyResumeDomElement,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './types.ts';
import type { ResumeDomElement } from '../resume-types.ts';
import {
	cellValueNeedsFullDecode,
	createLeanScalarGraph,
	executeLeanActionPlanWrite,
	type LeanActionPlan,
	type LeanPlan,
	materializeHostLocator,
	readLeanComputedEntries,
	readLeanStateCells,
	type RuntimeDemandMap,
	resolveResult,
	resolveSymbol,
	resumeFullEventOnly,
	shadowLeanActionPlanGraph,
	syncPolicyGraphNodeIds,
} from './lean-shared.ts';

export async function resumeScalarRowEventFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	const action = rowAction(input.event.type, input.runtimeDemandMap);
	if (!action?.plan) return resumeFullEventOnly(input);
	const state = readPayloadScript(input.document, 'markless/state') as ProtocolStatePayload;
	const view = readPayloadScript(input.document, 'markless/view') as ProtocolViewPayload;
	const plan = scalarRowLeanResumePlan({
		state,
		view,
		actionPlan: action.plan,
		eventName: input.event.type,
	});
	if (!plan) return resumeFullEventOnly(input);

	const elementsByHostId = new Map<string, EventOnlyResumeDomElement>();
	const graph = await createLeanScalarGraph(plan, elementsByHostId, input.loadSymbol);
	const {
		findKeyedRepeatRowEventMatch,
		findRepeatItemByKey,
		readKeyedRepeatCollection,
		validateOneRepeat,
	} = await import('../resume-keyed-repeats.ts');
	const rowDispatch = findKeyedRepeatRowEventMatch({
		graph: graph as never,
		view: { keyedRepeats: plan.keyedRepeats },
		elementsByHostId: elementsByHostId as never,
		target: (input.element ?? input.event.target) as ResumeDomElement | null | undefined,
		eventName: input.event.type,
		materializeHost: (hostNodeId) =>
			materializeHostLocator(input.root, plan.locators, elementsByHostId, hostNodeId) as
				| ResumeDomElement
				| undefined,
	});
	if (!rowDispatch) return resumeFullEventOnly(input);
	for (const update of plan.domUpdates) {
		if (!materializeHostLocator(input.root, plan.locators, elementsByHostId, update.hostNodeId))
			return resumeFullEventOnly(input);
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
	executeLeanActionPlanWrite(graph, action.plan, rowLocals);
	for (const symbolId of activeRecord.symbolIds) {
		const symbol = await resolveSymbol(input.loadSymbol(symbolId));
		void (await resolveResult(
			symbol({
				graph: shadowLeanActionPlanGraph(graph),
				event: input.event,
				element: rowDispatch.element,
				getElementHandle: () => undefined,
				locals: rowLocals,
			}),
		));
	}
	await graph.flush();
	if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
		await import('../debug-channel.ts')
			.then((debug) =>
				debug.__marklessDebugStartContainer(input.root as unknown as Element, 'ssr-lean'),
			)
			.catch(() => {});
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
			if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
				void import('../debug-channel.ts')
					.then((debug) =>
						debug.__marklessDebugDisposeContainer(input.root as unknown as Element),
					)
					.catch(() => {});
		},
	};
}

export function isScalarRowLeanResumeShape(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly eventName?: string;
	readonly runtimeDemandMap?: unknown;
}): boolean {
	const action = rowAction(input.eventName, input.runtimeDemandMap);
	return (
		!!action?.plan && scalarRowLeanResumePlan({ ...input, actionPlan: action.plan }) !== null
	);
}

function scalarRowLeanResumePlan(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly eventName?: string;
	readonly actionPlan: LeanActionPlan;
}): LeanPlan | null {
	if (
		readLeanComputedEntries(input.state.computed).some(
			(computed) => (computed as { readonly async?: unknown }).async === false,
		)
	)
		return null;
	if ((input.view.elementHandles?.length ?? 0) > 0) return null;
	if (
		input.actionPlan.kind !== 'row' ||
		input.actionPlan.version !== 1 ||
		!input.actionPlan.repeatId
	)
		return null;
	const keyedRepeats = (input.view.keyedRepeats ?? []).filter(
		(record) => record.id === input.actionPlan.repeatId,
	);
	if (keyedRepeats.length !== 1) return null;
	const repeat = keyedRepeats[0]!;
	if (!repeat.collectionGraphNodeId) return null;
	const rowEvent = repeat.rowEvents.find(
		(event) => !input.eventName || event.eventName === input.eventName,
	);
	if (!rowEvent) return null;
	const domUpdates = planDomUpdates(input.view, input.actionPlan);
	if (
		domUpdates.length === 0 ||
		domUpdates.some((record) => !record.symbolId || record.target?.kind !== 'text')
	)
		return null;
	const scalarCellIds = new Set([
		input.actionPlan.cell,
		...syncPolicyGraphNodeIds(rowEvent.syncPolicy),
	]);
	const fullDecodeCellIds = new Set(
		input.actionPlan.fullDecodeCells ?? [repeat.collectionGraphNodeId],
	);
	const cellIds = new Set([...scalarCellIds, ...fullDecodeCellIds]);
	const cells = readLeanStateCells(input.state.cells, cellIds);
	if (cells.length !== cellIds.size) return null;
	if (
		cells.some(
			(cell) =>
				scalarCellIds.has(cell.graphNodeId) &&
				(cell.valueKind !== 'scalar' || cellValueNeedsFullDecode(cell.value)),
		)
	)
		return null;
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

function rowAction(eventName: string | undefined, runtimeDemandMap: unknown) {
	const demandMap = runtimeDemandMap as RuntimeDemandMap | undefined;
	if (!eventName || !demandMap?.recordKinds || !demandMap.actions) return undefined;
	const replaced = new Map(demandMap.recordKinds.map((record) => [record.kind, record.replaced]));
	if (replaced.get('keyed-repeat') !== true || replaced.get('dom-update') !== true)
		return undefined;
	return demandMap.actions.find(
		(candidate) =>
			candidate.recordKind === 'keyed-repeat-row' &&
			candidate.eventName === eventName &&
			candidate.plan?.version === 1 &&
			candidate.plan.kind === 'row',
	);
}

function planDomUpdates(
	view: ProtocolViewPayload,
	actionPlan: LeanActionPlan,
): ProtocolViewPayload['domUpdates'] {
	return actionPlan.textUpdates.flatMap((plan) => {
		const record = view.domUpdates.find(
			(candidate) =>
				candidate.hostNodeId === plan.hostNodeId &&
				candidate.graphNodeId === plan.graphNodeId &&
				candidate.symbolId === plan.symbolId &&
				candidate.target?.kind === 'text',
		);
		return record ? [record] : [];
	});
}

function readPayloadScript(
	document: ResumeEventOnlyFromPayloadDocumentInput['document'],
	type: 'markless/state' | 'markless/view',
) {
	const element = document.querySelector(`script[type="${type}"]`);
	const text = element?.textContent ?? element?.text ?? element?.innerHTML;
	if (text == null) {
		throw Object.assign(new Error('MARKLESS_LEAN_PAYLOAD_MISSING'), {
			code: 'MARKLESS_LEAN_PAYLOAD_MISSING',
			site: type,
		});
	}
	return JSON.parse(text);
}
