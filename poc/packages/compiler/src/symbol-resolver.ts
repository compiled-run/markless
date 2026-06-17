import { buildSemanticGraph, type SemanticGraphInput } from './semantic-graph.ts';
import { extractSyncEventPolicies, type SyncPolicyMethod } from './sync-event-policy.ts';

export type SymbolResolverInput = SemanticGraphInput;

export type SymbolImportOwner = 'generated-symbol-resolver' | 'inline-event-wiring';

export type GeneratedResolverPlan = {
	readonly ownsDynamicImport: true;
	readonly importOwner: 'generated-symbol-resolver';
	readonly authoredSourceContainsDynamicImport: boolean;
};

export type EventHandlerSymbolRecord = {
	readonly kind: 'event-handler';
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly symbolId: string;
	readonly lazy: true;
	readonly emitsDomClosure: false;
	readonly importOwner: 'generated-symbol-resolver';
};

export type BindingUpdateKind = 'attribute-or-property' | 'text';

export type BindingUpdateSymbolRecord = {
	readonly kind: 'binding-update';
	readonly source: string;
	readonly hostNodeId: string;
	readonly symbolId: string;
	readonly bindingKind: BindingUpdateKind;
	readonly importOwner: 'generated-symbol-resolver';
};

export type BehaviorSymbolRecord = {
	readonly kind: 'behavior';
	readonly expression: string;
	readonly hostNodeId: string;
	readonly symbolId: string;
	readonly importOwner: 'generated-symbol-resolver';
};

export type AsyncRunnerSymbolRecord = {
	readonly kind: 'async-computed-runner';
	readonly name: string;
	readonly symbolId: string;
	readonly importOwner: 'generated-symbol-resolver';
};

export type InlineSyncPolicyRecord = {
	readonly kind: 'inline-sync-policy';
	readonly policyId: string;
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly methods: ReadonlyArray<SyncPolicyMethod>;
	readonly guardSource: string;
	readonly handlerSymbolId: string;
	readonly importOwner: 'inline-event-wiring';
};

export type FailClosedSymbolCase = {
	readonly code: 'ARCADE_SYMBOL_UNKNOWN' | 'ARCADE_SYMBOL_MANIFEST_MISMATCH';
	readonly stage: 'symbol-resolution';
	readonly action: 'fail-closed';
	readonly message: string;
};

export type SymbolResolverPlanningArtifact = {
	readonly passId: 'symbol-resolver-planning';
	readonly filename: string;
	readonly generatedResolver: GeneratedResolverPlan;
	readonly domEventClosures: ReadonlyArray<never>;
	readonly eventHandlerSymbols: ReadonlyArray<EventHandlerSymbolRecord>;
	readonly bindingUpdateSymbols: ReadonlyArray<BindingUpdateSymbolRecord>;
	readonly behaviorSymbols: ReadonlyArray<BehaviorSymbolRecord>;
	readonly asyncRunnerSymbols: ReadonlyArray<AsyncRunnerSymbolRecord>;
	readonly syncPolicyRecords: ReadonlyArray<InlineSyncPolicyRecord>;
	readonly failClosedCases: ReadonlyArray<FailClosedSymbolCase>;
};

export async function planSymbolResolver(
	input: SymbolResolverInput,
): Promise<SymbolResolverPlanningArtifact> {
	const graph = await buildSemanticGraph(input);
	const syncEventPolicy = extractSyncEventPolicies(input);

	return {
		passId: 'symbol-resolver-planning',
		filename: input.filename,
		generatedResolver: {
			ownsDynamicImport: true,
			importOwner: 'generated-symbol-resolver',
			authoredSourceContainsDynamicImport: input.source.includes('import('),
		},
		domEventClosures: [],
		eventHandlerSymbols: syncEventPolicy.eventHandlers.map((handler) => ({
			kind: 'event-handler',
			eventName: handler.eventName,
			hostNodeId: handler.hostNodeId,
			symbolId: handler.symbolId,
			lazy: true,
			emitsDomClosure: false,
			importOwner: 'generated-symbol-resolver',
		})),
		bindingUpdateSymbols: [
			...graph.bindingReads.map((binding, index) => ({
				kind: 'binding-update' as const,
				source: binding.source,
				hostNodeId: binding.hostNodeId,
				symbolId: `${input.filename}#binding_${index}`,
				bindingKind: 'attribute-or-property' as const,
				importOwner: 'generated-symbol-resolver' as const,
			})),
			...graph.textBindings.map((binding, index) => ({
				kind: 'binding-update' as const,
				source: binding.source,
				hostNodeId: binding.hostNodeId,
				symbolId: `${input.filename}#text_binding_${index}`,
				bindingKind: 'text' as const,
				importOwner: 'generated-symbol-resolver' as const,
			})),
		],
		behaviorSymbols: graph.behaviorProps.map((behavior, index) => ({
			kind: 'behavior',
			expression: behavior.expression,
			hostNodeId: behavior.hostNodeId,
			symbolId: `${input.filename}#behavior_${index}`,
			importOwner: 'generated-symbol-resolver',
		})),
		asyncRunnerSymbols: graph.computedSites
			.filter((site) => site.async)
			.map((site, index) => ({
				kind: 'async-computed-runner',
				name: site.name,
				symbolId: `${input.filename}#async_computed_${site.name}_${index}`,
				importOwner: 'generated-symbol-resolver',
			})),
		syncPolicyRecords: syncEventPolicy.syncPolicies.map((policy, index) => ({
			kind: 'inline-sync-policy',
			policyId: `${input.filename}#sync_policy_${index}`,
			eventName: policy.eventName,
			hostNodeId: policy.hostNodeId,
			methods: policy.methods,
			guardSource: policy.guardSource,
			handlerSymbolId: policy.symbolId,
			importOwner: 'inline-event-wiring',
		})),
		failClosedCases: [
			{
				code: 'ARCADE_SYMBOL_UNKNOWN',
				stage: 'symbol-resolution',
				action: 'fail-closed',
				message:
					'Reject a resume or event dispatch request when the symbol ID is not present.',
			},
			{
				code: 'ARCADE_SYMBOL_MANIFEST_MISMATCH',
				stage: 'symbol-resolution',
				action: 'fail-closed',
				message:
					'Reject a resume or event dispatch request when manifest hashes do not match.',
			},
		],
	};
}
