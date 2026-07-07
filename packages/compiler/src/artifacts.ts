import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { RenderedPayloadScripts } from '@markless/serializer';
import type { CompilerDiagnostic, SourceSpan } from './diagnostics.ts';

export type { CompilerDiagnostic, DiagnosticSuggestion, SourceSpan } from './diagnostics.ts';

export type SemanticGraphInput = {
	readonly filename: string;
	readonly source: string;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
};

export type SemanticComponent = {
	readonly name: string;
};

export type SemanticComponentPropBinding =
	| {
			readonly name: string;
			readonly source: string;
			readonly kind: 'graph-reference';
			readonly graphNodeId: string;
			readonly graphBindingKind: SemanticGraphBinding['kind'];
			readonly path: ReadonlyArray<string>;
			readonly sourceSpan?: SourceSpan;
	  }
	| {
			readonly name: string;
			readonly source: string;
			readonly kind: 'callback' | 'serializable' | 'opaque';
			readonly sourceSpan?: SourceSpan;
	  };

export type SemanticComponentEdge = {
	readonly id: string;
	readonly parentComponentName: string;
	readonly childComponentName: string;
	// Present when the component renders inside an @try arm: its graph-reference
	// props are boundary reads (need 10 — the arm may touch the async computed
	// only through child props).
	readonly asyncBoundaryId?: string;
	readonly importSource?: string;
	readonly importKind?: SemanticModuleImport['kind'];
	readonly importedName?: string;
	readonly sourceSpan?: SourceSpan;
	readonly props: ReadonlyArray<SemanticComponentPropBinding>;
	readonly children: {
		readonly childCount: number;
	};
	readonly branchScopeIds: ReadonlyArray<string>;
	readonly keyedRepeatScopeIds: ReadonlyArray<string>;
};

export type SemanticModuleImport = {
	readonly localName: string;
	readonly source: string;
	readonly kind: 'default' | 'named' | 'namespace';
	readonly importedName?: string;
};

export type SemanticGraphBinding = {
	readonly id: string;
	readonly name: string;
	readonly kind: 'state' | 'computed' | 'element' | 'prop';
	readonly sharedDefinitionId?: string;
	readonly declarationKind?: 'const' | 'let' | 'var';
	readonly writable: boolean;
	readonly valueKind?: 'scalar' | 'object' | 'array' | 'unknown';
	readonly initialValue?: unknown;
	readonly async?: boolean;
	readonly asyncCapable?: boolean;
	readonly dependencies?: ReadonlyArray<SemanticGraphDependency>;
	readonly functionSource?: string;
};

export type ModuleGraphInterfaceHelperReturn = {
	readonly kind: 'state' | 'computed';
	readonly localName: string;
	readonly declarationKind?: SemanticGraphBinding['declarationKind'];
	readonly writable: boolean;
	readonly valueKind?: SemanticGraphBinding['valueKind'];
	readonly initialValue?: unknown;
	readonly initializerSource?: string;
	readonly async?: boolean;
	readonly asyncCapable?: boolean;
	readonly functionSource?: string;
};

export type ModuleGraphInterfaceExport =
	| {
			readonly exportName: string;
			readonly localName: string;
			readonly kind: 'function';
			readonly returns: ModuleGraphInterfaceHelperReturn;
	  }
	| {
			readonly exportName: string;
			readonly localName: string;
			readonly kind: 'graph-binding';
			readonly bindingKind: 'state' | 'computed';
	  };

export type ModuleGraphInterfaceArtifact = {
	readonly passId: 'module-graph-interface';
	readonly filename: string;
	readonly exports: ReadonlyArray<ModuleGraphInterfaceExport>;
};

export type SemanticSharedScope = 'request' | 'container' | 'page';

export type SemanticSharedDependency = {
	readonly definitionId: string;
	readonly definitionName: string;
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticSharedReturnProperty =
	| {
			readonly kind: 'graph';
			readonly name: string;
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			readonly sourceSpan?: SourceSpan;
	  }
	| {
			readonly kind: 'method';
			readonly name: string;
			readonly source: string;
			readonly sourceSpan?: SourceSpan;
	  };

export type SemanticSharedDefinition = {
	readonly id: string;
	readonly name: string;
	readonly exportedName: string;
	readonly scope?: SemanticSharedScope;
	readonly factorySource: string;
	readonly dependencies?: ReadonlyArray<SemanticSharedDependency>;
	readonly returnProperties?: ReadonlyArray<SemanticSharedReturnProperty>;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticSharedInstance = {
	readonly definitionId: string;
	readonly definitionName: string;
	readonly localName: string;
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticGraphDependency = {
	readonly source: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export type SemanticHostNode = {
	readonly id: string;
	readonly tagName: string;
	// Present when the element renders inside an @try/@pending/@catch arm:
	// the boundary owns the element's coordinates (D3 arm-relative records).
	// asyncBoundaryArm is the arm index (0 = @try, 1 = @pending, 2 = @catch).
	readonly asyncBoundaryId?: string;
	readonly asyncBoundaryArm?: number;
};

export type SemanticKeyedRepeat = {
	readonly id: string;
	readonly parentHostNodeId: string;
	// Present when the repeat renders inside an @try/@pending/@catch arm: the
	// boundary owns the repeat's async collection read.
	readonly asyncBoundaryId?: string;
	readonly rowHostNodeId?: string;
	readonly itemName: string;
	readonly indexName?: string;
	readonly collectionSource: string;
	readonly collectionGraphNodeId?: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly keySource: string;
	readonly keyPath: ReadonlyArray<string>;
};

// A reactive branch site (@if or @switch) sharing the unified document-order
// comment-anchor allocator with async boundaries.
export type SemanticBranchSite = {
	readonly id: string;
	readonly kind: 'if' | 'switch';
	readonly armCount: number;
	readonly testSource: string;
	readonly anchorOrder: number;
	// Inside an @try arm: excluded from the page comment-anchor stream; flip
	// wiring (if any) lives in the owning boundary's arm coordinate space.
	readonly asyncBoundaryId?: string;
	// Arm index inside the owning boundary (0 = @try, 1 = @pending, 2 = @catch).
	readonly asyncBoundaryArm?: number;
};

export type SemanticSyncPolicyCondition =
	| {
			readonly type: 'and';
			readonly conditions: ReadonlyArray<SemanticSyncPolicyCondition>;
	  }
	| {
			readonly type: 'or';
			readonly conditions: ReadonlyArray<SemanticSyncPolicyCondition>;
	  }
	| {
			readonly type: 'not';
			readonly condition: SemanticSyncPolicyCondition;
	  }
	| {
			readonly type: 'graph-truthy';
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly type: 'constant-truthy';
			readonly value: unknown;
	  }
	| {
			readonly type: 'event-equals';
			readonly field: string;
			readonly value: unknown;
	  };

export type SemanticSyncPolicyAction = 'preventDefault' | 'stopPropagation';

export type SemanticSyncPolicyBranch = {
	readonly when: SemanticSyncPolicyCondition;
	readonly actions: ReadonlyArray<SemanticSyncPolicyAction>;
};

export type SemanticSyncPolicy =
	| SemanticSyncPolicyBranch
	| {
			readonly branches: ReadonlyArray<SemanticSyncPolicyBranch>;
	  };

export type SemanticEvent = {
	readonly id: string;
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly handlerCount: number;
	readonly handlerSources: ReadonlyArray<string>;
	readonly handlerSpans: ReadonlyArray<SourceSpan | undefined>;
	readonly handlerParameters: ReadonlyArray<ReadonlyArray<string>>;
	readonly hasSyncPolicyCandidate: boolean;
	readonly syncPolicy?: SemanticSyncPolicy;
};

export type SemanticGraphDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'MARKLESS_PARSE_ERROR'
		| 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED'
		| 'MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED'
		| 'MARKLESS_STATE_MODULE_SCOPE'
		| 'MARKLESS_STATE_CREATION_SITE_UNSTABLE'
		| 'MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED'
		| 'MARKLESS_STATE_CROSS_MODULE_IMPORT'
		| 'MARKLESS_STATE_NESTED_CREATION'
		| 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE'
		| 'MARKLESS_ASYNC_POST_AWAIT_READ'
		| 'MARKLESS_ASYNC_BOUNDARY_REQUIRED'
		| 'MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED'
		| 'MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE'
		| 'MARKLESS_STATE_WRITE_IN_TEMPLATE'
		| 'MARKLESS_STATE_WRITE_IN_COMPUTED'
		| 'MARKLESS_SHARED_DEFINITION_CYCLE'
		| 'MARKLESS_SHARED_SCOPE_INVALID'
		| 'MARKLESS_ELEMENT_HANDLE_REQUIRED'
		| 'MARKLESS_ELEMENT_HANDLE_DUPLICATE'
		| 'MARKLESS_ELEMENT_HANDLE_UNBOUND'
		| 'MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED'
		| 'MARKLESS_ELEMENT_MODULE_SCOPE'
		| 'MARKLESS_ELEMENT_HANDLE_RENDER_READ'
		| 'MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED'
		| 'MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION'
		| 'MARKLESS_EVENT_SPREAD_UNSUPPORTED' | 'MARKLESS_SPREAD_STATIC_SNAPSHOT'
		| 'MARKLESS_ATTRIBUTE_OBJECT_VALUE' | 'MARKLESS_ATTRIBUTE_DUPLICATE'
		| 'MARKLESS_STYLE_OBJECT_UNSUPPORTED'
		| 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE'
		| 'MARKLESS_REPEAT_KEY_REQUIRED'
		| 'MARKLESS_REPEAT_KEY_IS_INDEX'
		| 'MARKLESS_REPEAT_KEY_UNSTABLE'
		| 'MARKLESS_SUBMODULE_UNSUPPORTED'
		| 'MARKLESS_ALLOW_ERROR_UNSUPPRESSIBLE'
		| 'MARKLESS_ALLOW_REASON_REQUIRED'
		| 'MARKLESS_ALLOW_STALE';
	readonly phase: 'semantic-graph' | 'sync-policy';
	readonly passId: 'tsrx-semantic-graph';
};

export type SemanticStateWrite = {
	readonly target: string;
	readonly sharedDefinitionId?: string;
	readonly targetSpan?: SourceSpan;
	readonly writeScope?: 'component' | 'handler' | 'helper' | 'computed' | 'module';
	readonly componentName?: string;
	readonly operation: 'assign' | 'update' | 'call' | 'delete';
	readonly assignmentOperator?: string;
	readonly valueSource?: string;
	readonly optional?: boolean;
	readonly prefix?: boolean;
	readonly updateOperator?: '++' | '--';
	readonly method?: string;
	readonly argumentSources?: ReadonlyArray<string>;
};

export type SemanticStateRead = {
	readonly source: string;
	readonly sharedDefinitionId?: string;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticTemplateBindingTarget =
	| {
			readonly kind: 'text';
			readonly prefix?: string;
			readonly suffix?: string;
			readonly trueValue?: string;
			readonly falseValue?: string;
	  }
	| {
			readonly kind: 'attribute';
			readonly name: string;
	  }
	| {
			readonly kind: 'property';
			readonly name: string;
	  }
	| {
			readonly kind: 'class';
			readonly trueValue?: string;
			readonly falseValue?: string;
	  }
	| {
			readonly kind: 'style';
	  };

export type SemanticGraphAlias = {
	readonly name: string;
	readonly target: string;
	readonly sharedDefinitionId?: string;
	readonly excludedPaths?: ReadonlyArray<ReadonlyArray<string>>;
	readonly declarationKind?: SemanticGraphBinding['declarationKind'];
	readonly sourceSpan?: SourceSpan;
};

export type SemanticTemplateRead = {
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
	readonly hostNodeId: string;
	readonly target: SemanticTemplateBindingTarget;
	readonly asyncBoundaryId?: string;
	readonly computedGraphNodeId?: string;
};

export type SemanticElementHandleBinding = {
	readonly hostNodeId: string;
	readonly handleName: string;
	readonly componentName?: string;
	readonly sourceSpan?: SourceSpan;
	readonly keyedRepeatScopeIds: ReadonlyArray<string>;
};

export type SemanticBehavior = {
	readonly hostNodeId: string;
	readonly source: string;
	readonly functionSource: string;
	readonly inputSources: ReadonlyArray<string>;
};

export type SemanticLocalBinding = {
	readonly name: string;
	readonly kind: 'function' | 'class-instance' | 'dom-node' | 'non-serializable-constant';
	readonly declarationKind?: SemanticGraphBinding['declarationKind'];
	readonly sourceSpan?: SourceSpan;
};

export type SemanticLocalDeclaration = {
	readonly name: string;
	readonly scope: 'module' | 'component' | 'function';
	readonly componentName?: string;
	readonly aliasOf?: string;
};

export type SemanticSyncPolicyConstant = {
	readonly name: string;
	readonly value: unknown;
};

export type SemanticGraphArtifact = {
	readonly passId: 'tsrx-semantic-graph';
	readonly filename: string;
	readonly components: ReadonlyArray<SemanticComponent>;
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly moduleImports: ReadonlyArray<SemanticModuleImport>;
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
	readonly sharedDefinitions: ReadonlyArray<SemanticSharedDefinition>;
	readonly sharedInstances: ReadonlyArray<SemanticSharedInstance>;
	readonly hostNodes: ReadonlyArray<SemanticHostNode>;
	readonly keyedRepeats: ReadonlyArray<SemanticKeyedRepeat>;
	readonly events: ReadonlyArray<SemanticEvent>;
	readonly syncPolicyConstants?: ReadonlyArray<SemanticSyncPolicyConstant>;
	readonly behaviors: ReadonlyArray<SemanticBehavior>;
	readonly elementHandleBindings: ReadonlyArray<SemanticElementHandleBinding>;
	readonly localBindings: ReadonlyArray<SemanticLocalBinding>;
	readonly localDeclarations: ReadonlyArray<SemanticLocalDeclaration>;
	readonly aliases: ReadonlyArray<SemanticGraphAlias>;
	readonly stateReads: ReadonlyArray<SemanticStateRead>;
	readonly templateReads: ReadonlyArray<SemanticTemplateRead>;
	readonly stateWrites: ReadonlyArray<SemanticStateWrite>;
	readonly asyncBoundaries: ReadonlyArray<{ readonly id: string; readonly anchorOrder: number }>;
	readonly branchSites: ReadonlyArray<SemanticBranchSite>;
	readonly moduleGraphInterface: ModuleGraphInterfaceArtifact;
	readonly diagnostics: ReadonlyArray<SemanticGraphDiagnostic>;
};

export type StateLoweringInput = {
	readonly semanticGraph: SemanticGraphArtifact;
};

export type StateLoweringDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'MARKLESS_STATE_UNRESOLVED_WRITE'
		| 'MARKLESS_STATE_DYNAMIC_PATH_READ'
		| 'MARKLESS_STATE_DYNAMIC_PATH_WRITE'
		| 'MARKLESS_STATE_OPTIONAL_CHAIN_WRITE'
		| 'MARKLESS_STATE_REST_ALIAS_EXCLUDED_PATH'
		| 'MARKLESS_STATE_READ_ONLY_WRITE'
		| 'MARKLESS_STATE_CONST_REASSIGNMENT'
		| 'MARKLESS_STATE_STALE_LOCAL_WRITE'
		| 'MARKLESS_STATE_MODULE_ESCAPE'
		| 'MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE'
		| 'MARKLESS_TEMPLATE_EXPRESSION_STATIC';
	readonly phase: 'state-lowering';
	readonly passId: 'state-lowering';
	readonly source: string;
};

export type LoweredStateRead = {
	readonly source: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export type LoweredStateWrite = {
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly operation: SemanticStateWrite['operation'];
	readonly assignmentOperator?: string;
	readonly valueSource?: string;
	readonly prefix?: boolean;
	readonly updateOperator?: SemanticStateWrite['updateOperator'];
	readonly method?: string;
	readonly argumentSources?: ReadonlyArray<string>;
};

export type StateLoweringArtifact = {
	readonly passId: 'state-lowering';
	readonly reads: ReadonlyArray<LoweredStateRead>;
	readonly writes: ReadonlyArray<LoweredStateWrite>;
	readonly diagnostics: ReadonlyArray<StateLoweringDiagnostic>;
};

export type PayloadArenaInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly stateLowering: StateLoweringArtifact;
};

export type PayloadArenaDiagnostic = StateLoweringDiagnostic;

// One record set per boundary arm (index 0 = @try, 1 = @pending, 2 = @catch).
// Locator indexes are ARM-RELATIVE: 0 names the first element after the
// boundary's start anchor in that arm's rendered content. Resume adds the
// start anchor's live element-walk offset at materialization time (D3).
export type PayloadArmRecordSet = {
	readonly locators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly strategy: 'arm-relative';
		readonly index: number;
		readonly tagName: string;
	}>;
	readonly events: SemanticGraphArtifact['events'];
	readonly behaviors: ReadonlyArray<PayloadBehavior>;
	readonly elementHandles: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly handleId: string;
		readonly name: string;
	}>;
};

export type PayloadAsyncBoundary = {
	readonly id: string;
	readonly kind: 'async-boundary';
	readonly anchorOrder: number;
	readonly startAnchor: {
		readonly strategy: 'dom-order-comment';
		readonly index: number;
	};
	readonly endAnchor: {
		readonly strategy: 'dom-order-comment';
		readonly index: number;
	};
	readonly asyncReads: ReadonlyArray<{
		readonly source: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
	readonly armRecords: ReadonlyArray<PayloadArmRecordSet>;
};

export type PayloadBehavior = SemanticBehavior & {
	readonly inputValues?: ReadonlyArray<unknown>;
	readonly inputGraphReads?: ReadonlyArray<{
		readonly inputIndex: number;
		readonly source: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
};

export type PayloadKeyedRepeat = {
	readonly id: string;
	readonly parentHostNodeId: string;
	readonly rowHostNodeId?: string;
	readonly collectionGraphNodeId: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly keyPath: ReadonlyArray<string>;
};

export type PayloadArenaArtifact = {
	readonly passId: 'payload-arena';
	readonly state: {
		readonly cells: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly name: string;
			readonly valueKind: SemanticGraphBinding['valueKind'];
		}>;
		readonly computed: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly name: string;
			readonly async: boolean;
			readonly functionSource?: string;
			readonly dependencies?: ReadonlyArray<SemanticGraphDependency>;
		}>;
		readonly sharedDefinitions: ReadonlyArray<{
			readonly id: string;
			readonly name: string;
			readonly exportedName: string;
			readonly scope?: SemanticSharedScope;
			readonly dependencies?: ReadonlyArray<SemanticSharedDependency>;
			readonly returnProperties?: ReadonlyArray<SemanticSharedReturnProperty>;
			readonly graphNodeIds: ReadonlyArray<string>;
		}>;
	};
	readonly view: {
		readonly locators: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly strategy: 'dom-order';
			readonly index: number;
			readonly tagName: string;
		}>;
		readonly keyedRepeats: ReadonlyArray<PayloadKeyedRepeat>;
		readonly events: SemanticGraphArtifact['events'];
		readonly domUpdates: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			readonly target: SemanticTemplateBindingTarget;
		}>;
		readonly behaviors: ReadonlyArray<PayloadBehavior>;
		readonly elementHandles: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly handleId: string;
			readonly name: string;
		}>;
		readonly asyncBoundaries: ReadonlyArray<PayloadAsyncBoundary>;
		readonly branchSites: ReadonlyArray<{ readonly id: string; readonly anchorOrder: number }>;
	};
	readonly diagnostics: ReadonlyArray<PayloadArenaDiagnostic>;
};

export type SymbolResolverInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly payloadArena: PayloadArenaArtifact;
	readonly stateLowering?: StateLoweringArtifact;
};

export type PlannedSymbol =
	| {
			readonly id: string;
			readonly kind: 'event-handler';
			readonly hostNodeId: string;
			readonly eventName: string;
			readonly source: string;
			readonly sourceSpan?: SourceSpan;
			readonly parameters: ReadonlyArray<string>;
			readonly moduleImports?: ReadonlyArray<SemanticModuleImport>;
			readonly order: number;
			readonly reads?: ReadonlyArray<LoweredStateRead>;
			readonly writes?: ReadonlyArray<LoweredStateWrite>;
			// Method calls on element() handles inside the handler, with their
			// offset into the handler source for statement-order emission.
			readonly elementHandleCalls?: ReadonlyArray<{
				readonly handleName: string;
				readonly method: string;
				readonly source: string;
				readonly argumentSources: ReadonlyArray<string>;
				readonly offset: number;
				readonly endOffset: number;
			}>;
	  }
	| {
			readonly id: string;
			readonly kind: 'callback-prop';
			readonly componentEdgeId: string;
			readonly propName: string;
			readonly source: string;
			readonly sourceSpan?: SourceSpan;
			readonly moduleImports?: ReadonlyArray<SemanticModuleImport>;
			readonly reads?: ReadonlyArray<LoweredStateRead>;
			readonly writes?: ReadonlyArray<LoweredStateWrite>;
	  }
	| {
			readonly id: string;
			readonly kind: 'dom-update';
			readonly hostNodeId: string;
			readonly source: string;
			readonly graphNodeId: string;
			readonly target: PayloadArenaArtifact['view']['domUpdates'][number]['target'];
	  }
	| {
			readonly id: string;
			readonly kind: 'behavior';
			readonly hostNodeId: string;
			readonly source: string;
			readonly functionSource: string;
			readonly inputSources: ReadonlyArray<string>;
			readonly moduleImport?: SemanticModuleImport;
			readonly order: number;
	  }
	| {
			readonly id: string;
			readonly kind: 'async-computed-runner';
			readonly graphNodeId: string;
			readonly name: string;
			readonly source: string;
			readonly dependencies?: ReadonlyArray<SemanticGraphDependency>;
			readonly moduleImports?: ReadonlyArray<SemanticModuleImport>;
	  }
	| {
			readonly id: string;
			readonly kind: 'sync-computed-derive';
			readonly graphNodeId: string;
			readonly name: string;
			readonly source: string;
			readonly dependencies?: ReadonlyArray<SemanticGraphDependency>;
			readonly moduleImports?: ReadonlyArray<SemanticModuleImport>;
	  }
	| {
			readonly id: string;
			readonly kind: 'async-boundary-update';
			readonly boundaryId: string;
			readonly graphNodeId: string;
	  }
	| {
			readonly id: string;
			readonly kind: 'branch-update';
			readonly branchSiteId: string;
			readonly testSource: string;
			readonly testReads: ReadonlyArray<{
				readonly source: string;
				readonly graphNodeId: string;
				readonly path: ReadonlyArray<string>;
			}>;
	  };

export type SymbolResolverPlan = {
	readonly passId: 'symbol-resolver';
	readonly dynamicImportOwner: 'generated-symbol-resolver';
	readonly symbols: ReadonlyArray<PlannedSymbol>;
	readonly syncPolicies: ReadonlyArray<{
		readonly eventId: string;
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly syncPolicy?: SemanticSyncPolicy;
	}>;
	readonly diagnostics: ReadonlyArray<PayloadArenaDiagnostic>;
};

export type CaptureAnalysisInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly symbolResolver: SymbolResolverPlan;
};

export type CaptureAnalysisDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE'
		| 'MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED'
		| 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED';
	readonly phase: 'capture-analysis';
	readonly passId: 'capture-analysis';
	readonly symbolId?: string;
	readonly source: string;
};

export type CaptureAnalysisArtifact = {
	readonly passId: 'capture-analysis';
	readonly extractedSymbols: ReadonlyArray<{
		readonly symbolId: string;
		readonly kind: PlannedSymbol['kind'];
		readonly source: string;
	}>;
	readonly diagnostics: ReadonlyArray<CaptureAnalysisDiagnostic>;
};

export type SymbolModulesInput = {
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis: CaptureAnalysisArtifact;
	readonly publicRenderPlan?: PublicRenderPlanArtifact;
};

export type GeneratedSymbolModule = {
	readonly symbolId: string;
	readonly kind: PlannedSymbol['kind'];
	readonly exportName: string;
	readonly source: string;
};

export type SymbolModulesArtifact = {
	readonly passId: 'symbol-modules';
	readonly modules: ReadonlyArray<GeneratedSymbolModule>;
	readonly diagnostics: ReadonlyArray<CaptureAnalysisDiagnostic>;
};

export type RuntimeDemandMapRecord = {
	readonly recordId: string;
	readonly kind: string;
	readonly hostNodeId?: string;
	readonly eventName?: string;
	readonly symbolIds?: ReadonlyArray<string>;
	readonly runtimeModuleIds: ReadonlyArray<string>;
};

export type RuntimeDemandMapAction = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly recordKind: 'event' | 'keyed-repeat-row';
	readonly recordKinds: ReadonlyArray<string>;
	readonly payloadRecordIds: ReadonlyArray<string>;
	readonly runtimeModuleIds: ReadonlyArray<string>;
	readonly plan?: RuntimeDemandMapActionPlan;
};

export type RuntimeDemandMapActionPlan = {
	readonly version: 1;
	readonly kind: 'scalar' | 'row';
	readonly symbolId: string;
	readonly cell: string;
	readonly write: { readonly kind: 'assign' | 'update'; readonly value?: unknown; readonly valueKind?: 'undefined'; readonly localPath?: ReadonlyArray<string>; readonly updateOperator?: '++' | '--' };
	readonly textUpdates: ReadonlyArray<{ readonly hostNodeId: string; readonly graphNodeId: string; readonly symbolId: string; readonly prefix?: string }>;
	readonly repeatId?: string;
	readonly fullDecodeCells?: ReadonlyArray<string>;
};

export type RuntimeDemandMapArtifact = {
	readonly passId: 'runtime-demand-map';
	readonly version: 1;
	readonly recordKinds: ReadonlyArray<{
		readonly kind: string;
		readonly replaced: boolean;
	}>;
	readonly symbols: ReadonlyArray<{
		readonly symbolId: string;
		readonly kind: PlannedSymbol['kind'];
		readonly runtimeModuleIds: ReadonlyArray<string>;
	}>;
	readonly payloadRecords: ReadonlyArray<RuntimeDemandMapRecord>;
	readonly actions: ReadonlyArray<RuntimeDemandMapAction>;
	readonly unknownRecordModuleIds: ReadonlyArray<string>;
};

export type SymbolResolverModuleInput = {
	readonly buildId?: string;
	readonly resolverId?: string;
	readonly symbols: ReadonlyArray<{
		readonly id: string;
		readonly chunk: string;
		readonly exportName: string;
	}>;
};

export type SymbolResolverModuleManifest = readonly [
	protocolVersion: number,
	buildId: string | null,
	resolverId: string | null,
	moduleUrls: ReadonlyArray<string>,
	exportNames: ReadonlyArray<string>,
	symbols: Readonly<Record<string, readonly [moduleIndex: number, exportIndex: number]>>,
];

export type ProtocolStatePayloadInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly payloadArena: PayloadArenaArtifact;
	readonly symbolResolver?: SymbolResolverPlan;
};

export type ProtocolViewPayloadInput = {
	readonly payloadArena: PayloadArenaArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
};

// Wire shape of a boundary arm record set: the payload arena plan with lazy
// symbol IDs attached. The serializer protocol type gains this field when the
// streaming work (T107) reopens the protocol contract; until then the view
// payload stays structurally assignable to ProtocolViewPayload.
// An arm-scoped @if/@switch record nested under its boundary (D1 tier 3 in
// arms). Flip-capable sites carry a lazy flip symbol plus an anchor pair in
// the arm's OWN arm-branch comment census (the page census never counts
// these). Escalated sites (content needs component execution) omit them: the
// runtime routes their test reads through the boundary's arm re-render.
export type ProtocolViewArmBranchRecord = {
	readonly id: string;
	readonly testReads: ReadonlyArray<{
		readonly source: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
	readonly symbolId?: string;
	readonly armTests?: ReadonlyArray<unknown>;
	readonly declaredEmptyArms?: ReadonlyArray<number>;
	readonly startAnchor?: { readonly strategy: 'arm-branch-comment'; readonly index: number };
	readonly endAnchor?: { readonly strategy: 'arm-branch-comment'; readonly index: number };
	readonly armRecords?: NonNullable<ProtocolViewPayload['branches']>[number]['armRecords'];
};

export type ProtocolViewArmRecordSet = {
	readonly locators: PayloadArmRecordSet['locators'];
	readonly events: ProtocolViewPayload['events'];
	readonly behaviors: ProtocolViewPayload['behaviors'];
	readonly elementHandles: ProtocolViewPayload['elementHandles'];
	readonly branches?: ReadonlyArray<ProtocolViewArmBranchRecord>;
};

export type ProtocolViewPayloadWithArmRecords = Omit<ProtocolViewPayload, 'asyncBoundaries'> & {
	readonly asyncBoundaries: ReadonlyArray<
		ProtocolViewPayload['asyncBoundaries'][number] & {
			readonly armRecords?: ReadonlyArray<ProtocolViewArmRecordSet>;
		}
	>;
};

export type PayloadScriptsInput = {
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
};

export type PayloadScriptsArtifact = {
	readonly payloadScripts: RenderedPayloadScripts;
};

export type PublicRenderPlanInput = {
	readonly source: SemanticGraphInput;
	readonly semanticGraph: SemanticGraphArtifact;
	readonly payloadArena: PayloadArenaArtifact;
	readonly symbolResolver: SymbolResolverPlan;
};

export type PublicRenderPlanTextWrite = {
	readonly source: string;
	readonly itemPath: ReadonlyArray<string>;
	readonly nodePath: ReadonlyArray<number>;
};

export type PublicRenderPlanStaticTextWrite = {
	readonly source: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly nodePath: ReadonlyArray<number>;
	readonly prefix?: string;
	readonly suffix?: string;
};

export type PublicRenderPlanStaticEventControl = {
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly hostPath: ReadonlyArray<number>;
	readonly symbolIds: ReadonlyArray<string>;
};

export type PublicRenderPlanStaticHostLocator = {
	readonly hostNodeId: string;
	readonly tagName: string;
	readonly hostPath: ReadonlyArray<number>;
};

export type PublicRenderPlanClassWrite = {
	readonly source: string;
	readonly hostPath: ReadonlyArray<number>;
	readonly stateGraphNodeId: string;
	readonly statePath: ReadonlyArray<string>;
	readonly itemPath: ReadonlyArray<string>;
	readonly trueClass: string;
	readonly falseClass: string;
};

export type PublicRenderPlanKeyedItemContext = {
	readonly kind: 'keyed-repeat-item';
	readonly repeatId: string;
	readonly itemName: string;
	readonly keyPath: ReadonlyArray<string>;
};

export type PublicRenderPlanEventControl = {
	readonly eventName: string;
	readonly hostPath: ReadonlyArray<number>;
	readonly handlerSource: string;
	readonly symbolId: string;
	readonly itemContext: PublicRenderPlanKeyedItemContext;
};

export type PublicRenderPlanUnsupportedReason =
	| 'single-row-root-required'
	| 'repeat-parent-must-contain-only-repeat'
	| 'nested-repeat-unsupported'
	| 'unsupported-row-binding'
	| 'repeat-parent-locator-missing';

export type PublicRenderPlanRepeatGate =
	| {
			readonly repeatId: string;
			readonly supported: true;
			// Rows read the @for index clause: SSR emission renders them, but the
			// direct-DOM runtime stays off because it cannot rewrite index text on
			// reorder yet.
			readonly ssrOnly?: true;
			// The repeat renders inside an async boundary arm: SSR/CSR map it in
			// scope, so no top-level planned record exists (or is needed).
			readonly armScoped?: true;
	  }
	| {
			readonly repeatId: string;
			readonly supported: false;
			readonly reason: PublicRenderPlanUnsupportedReason;
	  };

export type PublicRenderPlanKeyedRepeat = {
	readonly repeatId: string;
	readonly parentHostNodeId: string;
	readonly rowElementCount?: number;
	readonly parentLocator: PayloadArenaArtifact['view']['locators'][number];
	readonly parentPath: ReadonlyArray<number>;
	readonly rowHostNodeId?: string;
	readonly itemName: string;
	readonly collectionGraphNodeId: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly keyPath: ReadonlyArray<string>;
	readonly rowTemplateHtml: string;
	// Rendered when the collection is empty; null when no supported @empty block.
	readonly emptyTemplateHtml: string | null;
	readonly textWrites: ReadonlyArray<PublicRenderPlanTextWrite>;
	readonly classWrites: ReadonlyArray<PublicRenderPlanClassWrite>;
	readonly eventControls: ReadonlyArray<PublicRenderPlanEventControl>;
};

export type PublicRenderPlanBranchArmPart =
	| { readonly text: string }
	| {
			readonly read: {
				readonly graphNodeId: string;
				readonly path: ReadonlyArray<string>;
			};
	  }
	// A keyed @for inside an arm-scoped branch arm: rows rebuild from a live
	// graph read of the collection at flip time (no keyed diffing — the flip
	// replaces the whole branch range anyway).
	| {
			readonly repeat: {
				readonly read: {
					readonly graphNodeId: string;
					readonly path: ReadonlyArray<string>;
				};
				readonly rowParts: ReadonlyArray<
					| { readonly text: string }
					| { readonly read: { readonly graphNodeId: string; readonly path: ReadonlyArray<string> } }
					| { readonly itemPath: ReadonlyArray<string> }
				>;
			};
	  };

export type PublicRenderPlanBranchArms = {
	readonly branchSiteId: string;
	readonly testRead: {
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	} | null;
	readonly arms: ReadonlyArray<ReadonlyArray<PublicRenderPlanBranchArmPart>>;
	// Switch sites: literal case-test values per arm, null for @default.
	// Absent for if-sites (truthiness selects arm 0/1).
	readonly armTests?: ReadonlyArray<unknown>;
	readonly declaredEmptyArms?: ReadonlyArray<number>;
	// Per arm: hosts addressed by arm-relative raw childNodes paths, so the
	// runtime can rewire their records after a flip.
	readonly armHosts?: ReadonlyArray<
		ReadonlyArray<{
			readonly hostPath: ReadonlyArray<number>;
			readonly hostNodeId: string;
		}>
	>;
	// Arm-scoped sites only (D1 tier 3 inside arms): the owning boundary, the
	// boundary arm the site renders in, and the site's pair rank in that arm's
	// own arm-branch comment census (page census never sees these anchors).
	readonly asyncBoundaryId?: string;
	readonly asyncBoundaryArm?: number;
	readonly armAnchorRank?: number;
	// Every host inside the flip range (including repeat rows armHosts cannot
	// claim): the boundary's own record sets must not register any of them.
	readonly ownedHostIds?: ReadonlyArray<string>;
};

export type PublicRenderPlanAsyncBoundaryArms = {
	readonly boundaryId: string;
	// arms[0] = fulfilled (@try), arms[1] = rejected (@catch).
	readonly arms: ReadonlyArray<ReadonlyArray<PublicRenderPlanBranchArmPart>>;
};

// D1 tier 4: a per-boundary lazy module that MAY execute components — used
// when the parts tier cannot rebuild the arm (components, repeats, @if,
// fragments). The plan owns the emission pieces; symbol-modules only wraps
// them in the exported update function.
export type PublicRenderPlanAsyncBoundaryArmRender = {
	readonly boundaryId: string;
	// Module-scope import statements (child components, helper catalog, value
	// imports referenced by the arm content).
	readonly imports: ReadonlyArray<string>;
	// Module-scope statements (planned record constants, helpers, authored
	// module-scope declarations the arm references).
	readonly moduleLines: ReadonlyArray<string>;
	// Statements for the exported `(context) => { ... }` update function.
	readonly bodyLines: ReadonlyArray<string>;
};

export type PublicRenderPlanBranchGate =
	| {
			readonly branchSiteId: string;
			readonly supported: true;
			// In an async arm: renders as a re-evaluated ternary on arm settle;
			// no flip wiring or anchors (need 8).
			readonly armScoped?: true;
			// Arm-scoped site with a real flip plan (D1 tier 3 inside arms):
			// html wraps it in arm-branch anchors and a flip module rebuilds
			// only the branch's own range.
			readonly armFlip?: true;
	  }
	| {
			readonly branchSiteId: string;
			readonly supported: false;
			readonly reason:
				| 'nested-branch-unsupported'
				| 'conditional-branch-unsupported'
				| 'arm-content-unsupported';
	  };

export type PublicRenderPlanAsyncBoundaryGate =
	| {
			readonly boundaryId: string;
			readonly supported: true;
	  }
	| {
			readonly boundaryId: string;
			readonly supported: false;
			readonly reason:
				| 'nested-boundary-unsupported'
				| 'conditional-boundary-unsupported'
				| 'pending-branch-unsupported';
	  };

export type PublicRenderPlanArtifact = {
	readonly passId: 'public-render-plan';
	readonly rootTemplateHtml: string | null;
	readonly directRenderTemplateHtml: string | null;
	readonly staticHostNodeIds: ReadonlyArray<string>;
	readonly staticHostLocators: ReadonlyArray<PublicRenderPlanStaticHostLocator>;
	readonly staticEventControls: ReadonlyArray<PublicRenderPlanStaticEventControl>;
	readonly staticTextWrites: ReadonlyArray<PublicRenderPlanStaticTextWrite>;
	readonly repeatGates: ReadonlyArray<PublicRenderPlanRepeatGate>;
	readonly keyedRepeats: ReadonlyArray<PublicRenderPlanKeyedRepeat>;
	readonly asyncBoundaryGates: ReadonlyArray<PublicRenderPlanAsyncBoundaryGate>;
	readonly branchReactivityGates: ReadonlyArray<PublicRenderPlanBranchGate>;
	readonly branchArms: ReadonlyArray<PublicRenderPlanBranchArms>;
	// Arm-scoped branch sites whose content needs component execution: the
	// toggle escalates to the boundary's arm re-render (D2 — diagnosed loud).
	readonly armBranchEscalations?: ReadonlyArray<{
		readonly branchSiteId: string;
		readonly asyncBoundaryId: string;
		readonly asyncBoundaryArm: number;
	}>;
	readonly asyncBoundaryArms: ReadonlyArray<PublicRenderPlanAsyncBoundaryArms>;
	readonly asyncBoundaryArmRenders: ReadonlyArray<PublicRenderPlanAsyncBoundaryArmRender>;
	readonly styleScopes: ReadonlyArray<{ readonly scopeId: string; readonly cssText: string }>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export type PublicRenderModuleInput = {
	readonly source: SemanticGraphInput;
	readonly semanticGraph: SemanticGraphArtifact;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
};

export type PublicRenderModuleArtifact = {
	readonly passId: 'public-render-module';
	readonly moduleSource: string;
	readonly rootExportName: string | null;
	readonly csrModuleSource: string;
	readonly csrExportName: string | null;
	readonly ssrModuleSource: string;
	readonly ssrExportName: string | null;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export type CompileTsrxModuleInput = SemanticGraphInput & SymbolResolverModuleInput;

export type CompilerPassDefinition = {
	readonly passId: string;
	readonly description: string;
	readonly consumes: ReadonlyArray<string>;
	readonly produces: ReadonlyArray<string>;
};

export type CompilerArtifactMap = Readonly<Record<string, unknown>>;

export type CompilerPassRunContext = {
	readonly passId: string;
	readonly inputs: CompilerArtifactMap;
};

export type RunnableCompilerPassDefinition = CompilerPassDefinition & {
	readonly run: (
		context: CompilerPassRunContext,
	) => CompilerArtifactMap | Promise<CompilerArtifactMap>;
};

export type CompilerArtifactDump = {
	readonly passId: string;
	readonly artifactKey: string;
	readonly dump: string;
};

export type CompilerArtifactDumper = (input: {
	readonly passId: string;
	readonly artifactKey: string;
	readonly value: unknown;
}) => string;

export type RunCompilerPassPipelineInput = {
	readonly passes: ReadonlyArray<RunnableCompilerPassDefinition>;
	readonly initialArtifacts: CompilerArtifactMap;
	readonly dumpArtifact?: CompilerArtifactDumper;
};

export type RunCompilerPassPipelineResult = {
	readonly passGraph: CompilerPassGraph;
	readonly artifacts: CompilerArtifactMap;
	readonly artifactDumps: ReadonlyArray<CompilerArtifactDump>;
};

export type CompilerPassGraph = {
	readonly orderedPassIds: ReadonlyArray<string>;
	readonly artifacts: ReadonlyArray<string>;
};

export type CompileTsrxModuleResult = {
	readonly passGraph: CompilerPassGraph;
	readonly semanticGraph: SemanticGraphArtifact;
	readonly moduleGraphInterface: ModuleGraphInterfaceArtifact;
	readonly stateLowering: StateLoweringArtifact;
	readonly payloadArena: PayloadArenaArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis: CaptureAnalysisArtifact;
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
	readonly payloadScripts: RenderedPayloadScripts;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
	readonly publicRenderModule: PublicRenderModuleArtifact;
	readonly symbolModules: SymbolModulesArtifact;
	readonly runtimeDemandMap: RuntimeDemandMapArtifact;
	readonly symbolResolverModule: string;
	readonly symbolResolverModuleManifest: SymbolResolverModuleManifest;
};
