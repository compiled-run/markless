import type { EventOnlyResumeContainer, EventOnlyResumeDomElement, EventOnlyResumeRecord, ResumeEventOnlyFromPayloadDocumentInput } from './types.ts';
import type { LeanPlan } from './lean-shared.ts';
import { marklessLocateHost } from '../fns/locate-host.ts';
import { marklessResolveResult } from '../fns/resolve-result.ts';
import { marklessCreateScalarCoreGraph } from '../fns/scalar-core-graph.ts';
import { marklessScalarCorePlan } from '../fns/scalar-core-plan.ts';
import { marklessSyncPolicyGraphIds } from '../fns/sync-policy-graph-ids.ts';

export async function resumeScalarCoreEventFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	if (!input.eventRecord) return resumeFullEventOnly(input);
	const { readScalarCorePayloadRecordsFromDocument } = await import('./payload-records.ts');
	const graphNodeIds = marklessSyncPolicyGraphIds(input.eventRecord.syncPolicy);
	const payload = readScalarCorePayloadRecordsFromDocument(input.document, {
		eventRecord: input.eventRecord,
		runtimeDemandMap: input.runtimeDemandMap,
		graphNodeIds,
	});
	if (!payload) return resumeFullEventOnly(input);
	const { state, view } = payload;
	const plan = marklessScalarCorePlan(state, view, input.eventRecord, graphNodeIds) as LeanPlan | null;
	if (!plan?.eventRecord) return resumeFullEventOnly(input);

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
	for (const symbolId of plan.eventRecord.symbolIds) {
		const symbol = await marklessResolveResult(input.loadSymbol(symbolId));
		void await marklessResolveResult(symbol({
			graph,
			event: input.event,
			element,
			getElementHandle: () => undefined,
		}));
	}
	await graph.flush();
	return {
		graph,
		view: {
			version: view.version,
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
	readonly state: { readonly computed: ReadonlyArray<unknown> };
	readonly view: { readonly domUpdates: ReadonlyArray<unknown>; readonly locators: ReadonlyArray<unknown> };
	readonly eventRecord?: EventOnlyResumeRecord;
}): boolean {
	return marklessScalarCorePlan(input.state, input.view, input.eventRecord, marklessSyncPolicyGraphIds(input.eventRecord?.syncPolicy)) !== null;
}

async function resumeFullEventOnly(input: ResumeEventOnlyFromPayloadDocumentInput): Promise<EventOnlyResumeContainer> {
	if (import.meta.env?.DEV) console.warn('markless: scalar-core lean resume fell back to full event container');
	const { resumeEventOnlyFromPayloadDocument } = await import('../event-only-resume.ts');
	return resumeEventOnlyFromPayloadDocument(input);
}
