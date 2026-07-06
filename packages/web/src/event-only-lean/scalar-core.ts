import type { EventOnlyResumeContainer, EventOnlyResumeDomElement, EventOnlyResumeRecord, ResumeEventOnlyFromPayloadDocumentInput } from './types.ts';
import type { LeanActionPlan, LeanPlan, RuntimeDemandMap } from './lean-shared.ts';
import {
	cellValueNeedsFullDecode,
	executeLeanActionPlanWrite,
	readLeanComputedEntries,
	readLeanStateCells,
	shadowLeanActionPlanGraph,
} from './lean-shared.ts';
import { marklessLocateHost } from '../fns/locate-host.ts';
import { marklessResolveResult } from '../fns/resolve-result.ts';
import { marklessCreateScalarCoreGraph } from '../fns/scalar-core-graph.ts';
import { marklessSyncPolicyGraphIds } from '../fns/sync-policy-graph-ids.ts';

export async function resumeScalarCoreEventFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	if (!input.eventRecord) return resumeFullEventOnly(input);
	const action = scalarAction(input.eventRecord, input.runtimeDemandMap);
	if (!action?.plan) return resumeFullEventOnly(input);
	const graphNodeIds = marklessSyncPolicyGraphIds(input.eventRecord.syncPolicy);
	const plan = readScalarCorePlanFromDocument(input, action.plan, graphNodeIds);
	if (!plan) return resumeFullEventOnly(input);

	const elementsByHostId = new Map<string, EventOnlyResumeDomElement>();
	const graph = marklessCreateScalarCoreGraph(plan, elementsByHostId, input.loadSymbol) as EventOnlyResumeContainer['graph'];
	const element = input.element ??
		marklessLocateHost(input.root, plan.locators, elementsByHostId, plan.eventRecord.hostNodeId) ??
		input.event.target;
	if (!element) return resumeFullEventOnly(input);
	if (element.parentElement === input.root) return resumeFullEventOnly(input);
	for (const update of plan.domUpdates) {
		if (!marklessLocateHost(input.root, plan.locators, elementsByHostId, update.hostNodeId)) return resumeFullEventOnly(input);
	}
	if (plan.eventRecord.syncPolicy && !input.syncPolicyAlreadyApplied) {
		const { runSyncPolicyActions } = await import('../inline/sync-policy-core.ts');
		runSyncPolicyActions(plan.eventRecord.syncPolicy, graph, input.event);
	}
	executeLeanActionPlanWrite(graph, action.plan);
	for (const symbolId of plan.eventRecord.symbolIds) {
		const symbol = await marklessResolveResult(input.loadSymbol(symbolId));
		void await marklessResolveResult(symbol({
			graph: shadowLeanActionPlanGraph(graph),
			event: input.event,
			element,
			getElementHandle: () => undefined,
		}));
	}
	await graph.flush();
	return {
		graph,
		view: {
			version: 1,
			locators: plan.locators,
			events: [plan.eventRecord],
			domUpdates: plan.domUpdates,
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
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

export function isScalarCoreLeanResumeShape(input: {
	readonly state: { readonly cells: ReadonlyArray<unknown>; readonly computed: ReadonlyArray<unknown> };
	readonly view: { readonly domUpdates: ReadonlyArray<unknown>; readonly locators: ReadonlyArray<unknown> };
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly runtimeDemandMap?: unknown;
}): boolean {
	const action = input.eventRecord ? scalarAction(input.eventRecord, input.runtimeDemandMap) : undefined;
	return !!action?.plan && readScalarCorePlan({
		state: input.state,
		view: input.view,
		eventRecord: input.eventRecord,
		plan: action.plan,
		graphNodeIds: marklessSyncPolicyGraphIds(input.eventRecord?.syncPolicy),
	}) !== null;
}

async function resumeFullEventOnly(input: ResumeEventOnlyFromPayloadDocumentInput): Promise<EventOnlyResumeContainer> {
	if (import.meta.env?.DEV) console.warn('markless: scalar-core lean resume fell back to full event container');
	const { resumeEventOnlyFromPayloadDocument } = await import('../event-only-resume.ts');
	return resumeEventOnlyFromPayloadDocument(input);
}

function scalarAction(eventRecord: EventOnlyResumeRecord, runtimeDemandMap: unknown) {
	const demandMap = runtimeDemandMap as RuntimeDemandMap | undefined;
	if (!demandMap?.recordKinds || !demandMap.actions) return undefined;
	const replaced = new Map(demandMap.recordKinds.map((record) => [record.kind, record.replaced]));
	if (replaced.get('event') !== true || replaced.get('dom-update') !== true) return undefined;
	return demandMap.actions.find((candidate) =>
		candidate.recordKind === 'event' &&
		candidate.hostNodeId === eventRecord.hostNodeId &&
		candidate.eventName === eventRecord.eventName &&
		candidate.plan?.version === 1 &&
		candidate.plan.kind === 'scalar',
	);
}

function readScalarCorePlanFromDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput & { readonly eventRecord: EventOnlyResumeRecord },
	actionPlan: LeanActionPlan,
	graphNodeIds: ReadonlyArray<string>,
): LeanPlan | null {
	return readScalarCorePlan({
		state: readPayloadScript(input.document, 'markless/state'),
		view: readPayloadScript(input.document, 'markless/view'),
		eventRecord: input.eventRecord,
		plan: actionPlan,
		graphNodeIds,
	});
}

function readScalarCorePlan(input: {
	readonly state: { readonly cells: ReadonlyArray<any>; readonly computed: ReadonlyArray<any> };
	readonly view: { readonly locators: ReadonlyArray<any>; readonly domUpdates: ReadonlyArray<any> };
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly plan: LeanActionPlan;
	readonly graphNodeIds: ReadonlyArray<string>;
}): LeanPlan | null {
	if (!input.eventRecord || readLeanComputedEntries(input.state.computed).length > 0) return null;
	const cellIds = new Set([input.plan.cell, ...input.graphNodeIds]);
	const cells = readLeanStateCells(input.state.cells, cellIds);
	if (cells.length !== cellIds.size) return null;
	if (cells.some((cell) => cell.valueKind !== 'scalar' || cellValueNeedsFullDecode(cell.value))) return null;
	const domUpdates = input.plan.textUpdates.flatMap((update) => {
		const record = input.view.domUpdates.find((candidate) =>
			candidate.hostNodeId === update.hostNodeId &&
			candidate.graphNodeId === update.graphNodeId &&
			candidate.symbolId === update.symbolId &&
			candidate.target?.kind === 'text',
		);
		return record ? [record] : [];
	});
	if (domUpdates.length !== input.plan.textUpdates.length) return null;
	const locatorHostIds = new Set([input.eventRecord.hostNodeId, ...domUpdates.map((record) => record.hostNodeId)]);
	return {
		eventRecord: input.eventRecord,
		locators: input.view.locators.filter((locator) => locatorHostIds.has(locator.hostNodeId)),
		domUpdates,
		keyedRepeats: [],
		cells,
		fullDecodeCellIds: new Set(),
	};
}

function readPayloadScript(document: ResumeEventOnlyFromPayloadDocumentInput['document'], type: 'markless/state' | 'markless/view') {
	const element = document.querySelector(`script[type="${type}"]`);
	const text = element?.textContent ?? element?.text ?? element?.innerHTML;
	if (text == null) {
		throw Object.assign(new Error('MARKLESS_LEAN_PAYLOAD_MISSING'), { code: 'MARKLESS_LEAN_PAYLOAD_MISSING', site: type });
	}
	return JSON.parse(text);
}
