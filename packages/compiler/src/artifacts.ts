import type {
	ProtocolComputedExpression,
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '@arcade/protocol';
import type { RenderedPayloadScripts } from '@arcade/serializer';
import type { CompilerDiagnostic, SourceSpan } from './diagnostics.ts';

export type { CompilerDiagnostic, DiagnosticSuggestion, SourceSpan } from './diagnostics.ts';

export type SemanticComponent = {
	readonly name: string;
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

export type ImportedSharedDefinition = {
	readonly definition: SemanticSharedDefinition;
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
};

export type SemanticGraphInput = {
	readonly filename: string;
	readonly source: string;
	readonly importedSharedDefinitions?: ReadonlyArray<ImportedSharedDefinition>;
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
	readonly handlerParameters: ReadonlyArray<ReadonlyArray<string>>;
	readonly hasSyncPolicyCandidate: boolean;
	readonly syncPolicy?: SemanticSyncPolicy;
};

export type SemanticGraphDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'ARCADE_FRAMEWORK_IMPORT_REQUIRED'
		| 'ARCADE_STATE_MODULE_SCOPE'
		| 'ARCADE_ASYNC_POST_AWAIT_READ'
		| 'ARCADE_ASYNC_BOUNDARY_REQUIRED'
		| 'ARCADE_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED'
		| 'ARCADE_STATE_ELEMENT_HANDLE_UNSERIALIZABLE'
		| 'ARCADE_SHARED_DEFINITION_CYCLE'
		| 'ARCADE_ELEMENT_HANDLE_REQUIRED'
		| 'ARCADE_ELEMENT_HANDLE_DUPLICATE'
		| 'ARCADE_ATTACH_HOST_ELEMENT_REQUIRED'
		| 'ARCADE_SYNC_POLICY_UNEXTRACTABLE';
	readonly phase: 'semantic-graph' | 'sync-policy';
	readonly passId: 'tsrx-semantic-graph';
};

export type SemanticStateWrite = {
	readonly target: string;
	readonly sharedDefinitionId?: string;
	readonly targetSpan?: SourceSpan;
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
};

export type SemanticTemplateStaticAttribute = {
	readonly kind: 'static';
	readonly name: string;
	readonly value: string | number | boolean | null;
};

export type SemanticTemplateBindingAttribute = {
	readonly kind: 'binding';
	readonly name: string;
	readonly source: string;
	readonly target: Exclude<SemanticTemplateBindingTarget, { readonly kind: 'text' }>;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticTemplateAttribute =
	| SemanticTemplateStaticAttribute
	| SemanticTemplateBindingAttribute;

export type SemanticTemplateNode =
	| {
			readonly id: string;
			readonly kind: 'element';
			readonly hostNodeId: string;
			readonly tagName: string;
			readonly parentId: string | null;
			readonly attributes: ReadonlyArray<SemanticTemplateAttribute>;
			readonly childNodeIds: ReadonlyArray<string>;
	  }
	| {
			readonly id: string;
			readonly kind: 'text';
			readonly parentId: string | null;
			readonly value: string;
	  }
	| {
			readonly id: string;
			readonly kind: 'binding';
			readonly parentId: string | null;
			readonly hostNodeId: string;
			readonly source: string;
			readonly target: SemanticTemplateBindingTarget;
			readonly sourceSpan?: SourceSpan;
	  };

export type SemanticTemplateRoot = {
	readonly componentName: string;
	readonly nodeIds: ReadonlyArray<string>;
};

export type SemanticElementHandleBinding = {
	readonly hostNodeId: string;
	readonly handleName: string;
	readonly sourceSpan?: SourceSpan;
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

export type SemanticSyncPolicyConstant = {
	readonly name: string;
	readonly value: unknown;
};

export type SemanticGraphArtifact = {
	readonly passId: 'tsrx-semantic-graph';
	readonly filename: string;
	readonly components: ReadonlyArray<SemanticComponent>;
	readonly moduleImports: ReadonlyArray<SemanticModuleImport>;
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
	readonly sharedDefinitions: ReadonlyArray<SemanticSharedDefinition>;
	readonly sharedInstances: ReadonlyArray<SemanticSharedInstance>;
	readonly hostNodes: ReadonlyArray<SemanticHostNode>;
	readonly events: ReadonlyArray<SemanticEvent>;
	readonly syncPolicyConstants?: ReadonlyArray<SemanticSyncPolicyConstant>;
	readonly behaviors: ReadonlyArray<SemanticBehavior>;
	readonly elementHandleBindings: ReadonlyArray<SemanticElementHandleBinding>;
	readonly localBindings: ReadonlyArray<SemanticLocalBinding>;
	readonly aliases: ReadonlyArray<SemanticGraphAlias>;
	readonly stateReads: ReadonlyArray<SemanticStateRead>;
	readonly templateReads: ReadonlyArray<SemanticTemplateRead>;
	readonly templateRoots: ReadonlyArray<SemanticTemplateRoot>;
	readonly templateNodes: ReadonlyArray<SemanticTemplateNode>;
	readonly stateWrites: ReadonlyArray<SemanticStateWrite>;
	readonly asyncBoundaries: ReadonlyArray<{ readonly id: string }>;
	readonly diagnostics: ReadonlyArray<SemanticGraphDiagnostic>;
};

export type StateLoweringInput = {
	readonly semanticGraph: SemanticGraphArtifact;
};

export type StateLoweringDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'ARCADE_STATE_UNRESOLVED_WRITE'
		| 'ARCADE_STATE_DYNAMIC_PATH_READ'
		| 'ARCADE_STATE_DYNAMIC_PATH_WRITE'
		| 'ARCADE_STATE_OPTIONAL_CHAIN_WRITE'
		| 'ARCADE_STATE_REST_ALIAS_EXCLUDED_PATH'
		| 'ARCADE_STATE_READ_ONLY_WRITE'
		| 'ARCADE_STATE_CONST_REASSIGNMENT';
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

export type TemplateViewInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly stateLowering: StateLoweringArtifact;
};

export type TemplateViewAttribute =
	| SemanticTemplateStaticAttribute
	| (SemanticTemplateBindingAttribute & {
			readonly graphNodeId?: string;
			readonly path?: ReadonlyArray<string>;
			readonly initialValue?: unknown;
	  });

export type TemplateViewNode =
	| {
			readonly id: string;
			readonly kind: 'element';
			readonly hostNodeId: string;
			readonly tagName: string;
			readonly parentId: string | null;
			readonly attributes: ReadonlyArray<TemplateViewAttribute>;
			readonly childNodeIds: ReadonlyArray<string>;
	  }
	| {
			readonly id: string;
			readonly kind: 'text';
			readonly parentId: string | null;
			readonly value: string;
	  }
	| {
			readonly id: string;
			readonly kind: 'binding';
			readonly parentId: string | null;
			readonly hostNodeId: string;
			readonly source: string;
			readonly graphNodeId?: string;
			readonly path?: ReadonlyArray<string>;
			readonly target: SemanticTemplateBindingTarget;
			readonly initialValue?: unknown;
	  };

export type TemplateViewComponent = {
	readonly name: string;
	readonly rootNodeIds: ReadonlyArray<string>;
	readonly initialHtml: string;
};

export type TemplateViewArtifact = {
	readonly passId: 'template-view';
	readonly components: ReadonlyArray<TemplateViewComponent>;
	readonly nodes: ReadonlyArray<TemplateViewNode>;
	readonly diagnostics: ReadonlyArray<StateLoweringDiagnostic>;
};

export type PayloadArenaInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly stateLowering: StateLoweringArtifact;
};

export type PayloadArenaDiagnostic = StateLoweringDiagnostic;

export type PayloadAsyncBoundary = {
	readonly id: string;
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
			readonly expression?: ProtocolComputedExpression;
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
		readonly events: SemanticGraphArtifact['events'];
		readonly domUpdates: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			readonly target: NonNullable<ProtocolViewPayload['domUpdates'][number]['target']>;
		}>;
		readonly behaviors: ReadonlyArray<PayloadBehavior>;
		readonly elementHandles: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly handleId: string;
			readonly name: string;
		}>;
		readonly asyncBoundaries: ReadonlyArray<PayloadAsyncBoundary>;
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
			readonly parameters: ReadonlyArray<string>;
			readonly moduleImports?: ReadonlyArray<SemanticModuleImport>;
			readonly order: number;
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
	readonly code: 'ARCADE_CAPTURE_UNSUPPORTED_VALUE';
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
};

export type ProtocolViewPayloadInput = {
	readonly payloadArena: PayloadArenaArtifact;
	readonly symbolResolver: SymbolResolverPlan;
};

export type PayloadScriptsInput = {
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
};

export type PayloadScriptsArtifact = {
	readonly payloadScripts: RenderedPayloadScripts;
	readonly renderShell: string;
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
	readonly stateLowering: StateLoweringArtifact;
	readonly templateView: TemplateViewArtifact;
	readonly payloadArena: PayloadArenaArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis: CaptureAnalysisArtifact;
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
	readonly payloadScripts: RenderedPayloadScripts;
	readonly renderShell: string;
	readonly symbolModules: SymbolModulesArtifact;
	readonly symbolResolverModule: string;
	readonly symbolResolverModuleManifest: SymbolResolverModuleManifest;
};
