import type {
	ProtocolEventActionKind,
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '@markless/serializer';
import type { RenderedPayloadScripts } from '@markless/serializer';
import type { CompilerDiagnostic, SourceSpan } from './diagnostics.ts';

export type { CompilerDiagnostic, DiagnosticSuggestion, SourceSpan } from './diagnostics.ts';

export type SemanticGraphInput = {
	readonly filename: string;
	readonly source: string;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly artifactChildMaterializations?: Readonly<Record<string, ArtifactChildMaterialization>>;
	readonly additionalFrameworkApiSources?: readonly string[];
};

export type ArtifactChildMaterialization = {
	readonly html: string;
	readonly elementCount: number;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
	readonly coordinates?: Readonly<Record<string, unknown>>;
	readonly structure?: Readonly<Record<string, unknown>>;
	readonly structureTokens?: ReadonlyArray<Readonly<Record<string, unknown>>>;
};

export type SemanticComponent = {
	readonly name: string;
};

// An authored prop binding is identified by its declaration span, not by the
// shared legacy prop graph cell. This lets lazy-symbol consumers distinguish
// same-named props declared by different components while package 2 migrates
// emitted reads away from `prop:props`.
export type SemanticComponentPropDeclaration = {
	readonly componentId: string;
	readonly componentName: string;
	readonly bindingId: string;
	readonly localName: string;
	readonly propPath: ReadonlyArray<string>;
	readonly sourceSpan: SourceSpan;
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
			readonly parameters?: ReadonlyArray<string>;
			readonly value?: unknown;
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
	readonly bindingId?: string;
	readonly componentId?: string;
	readonly componentName?: string;
	readonly sourceSpan?: SourceSpan;
	readonly sharedDefinitionId?: string;
	readonly declarationKind?: 'const' | 'let' | 'var';
	readonly writable: boolean;
	readonly valueKind?: 'scalar' | 'object' | 'array' | 'unknown';
	readonly initialValue?: unknown;
	readonly initialValueKnown?: boolean;
	readonly initializerSource?: string;
	readonly storage?: { readonly key: string };
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
	readonly render: {
		readonly version: 1;
		readonly components: ReadonlyArray<{
			readonly componentName: string;
			readonly rootChunkId: string;
			readonly childChunks: ReadonlyArray<{
				readonly id: string;
				readonly kind: SemanticMarkupChunk['kind'];
				readonly slotCount: number;
			}>;
			readonly inputs: ReadonlyArray<{
				readonly localName: string;
				readonly path: ReadonlyArray<string>;
			}>;
		}>;
	};
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
	readonly armTests?: ReadonlyArray<unknown>;
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
		| 'MARKLESS_STORAGE_KEY_STATIC'
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
		| 'MARKLESS_ROW_ELEMENT_HANDLE_UNSUPPORTED'
		| 'MARKLESS_ELEMENT_HANDLE_UNBOUND'
		| 'MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED'
		| 'MARKLESS_ELEMENT_MODULE_SCOPE'
		| 'MARKLESS_ELEMENT_HANDLE_RENDER_READ'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED'
		| 'MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED'
		| 'MARKLESS_OVERLAY_VALUE_UNSUPPORTED'
		| 'MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED'
		| 'MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION'
		| 'MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED'
		| 'MARKLESS_EVENT_SPREAD_UNSUPPORTED'
		| 'MARKLESS_SPREAD_STATIC_SNAPSHOT'
		| 'MARKLESS_ATTRIBUTE_OBJECT_VALUE'
		| 'MARKLESS_ATTRIBUTE_DUPLICATE'
		| 'MARKLESS_STYLE_OBJECT_UNSUPPORTED'
		| 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE'
		| 'MARKLESS_REPEAT_KEY_REQUIRED'
		| 'MARKLESS_REPEAT_KEY_IS_INDEX'
		| 'MARKLESS_REPEAT_KEY_UNSTABLE'
		| 'MARKLESS_REPEAT_COLLECTION_UNREADABLE'
		| 'MARKLESS_TEMPLATE_AS_VALUE'
		| 'MARKLESS_SUBMODULE_UNSUPPORTED'
		| 'MARKLESS_ALLOW_ERROR_UNSUPPRESSIBLE'
		| 'MARKLESS_ALLOW_REASON_REQUIRED'
		| 'MARKLESS_ALLOW_STALE';
	// The external TSRX parser fails before the graph pass runs; that diagnostic carries phase 'parse'.
	readonly phase: 'parse' | 'semantic-graph' | 'sync-policy';
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
	readonly bindingId?: string;
	readonly componentName?: string;
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
	readonly bindingId?: string;
	readonly componentId?: string;
	readonly componentName?: string;
	readonly propPath?: ReadonlyArray<string>;
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
	readonly rowOwner?: {
		readonly repeatId: string;
		readonly keyPath: ReadonlyArray<string>;
	};
};

/**
 * One authored relationship between an element that carries an IDREF attribute
 * and the element that an element() handle is bound to. markless has no useId:
 * an id has no render lifecycle to hook into, so the author names the
 * relationship and never sees a string.
 *
 * This is deliberately its own family rather than a field on
 * SemanticElementHandleBinding, because the two records answer different
 * questions with different owners. A binding says "this handle locates that
 * host"; an IDREF reference says "this OTHER host points at it through this
 * attribute". Folding them together would make `hostNodeId` mean two things.
 *
 * Like SemanticOverlay it carries no inputs: identity is structural and can
 * never re-run. And like SemanticOverlay it records the relationship only. There
 * is no id string anywhere in this record - spelling the id, and writing it onto
 * `boundHostNodeId`, is the consuming emitter's lowering concern.
 */
export type SemanticElementHandleIdref = {
	/** The host element that carries the IDREF attribute. */
	readonly hostNodeId: string;
	/** The IDREF attribute on that host, e.g. `aria-labelledby`. */
	readonly attributeName: string;
	/** The resolved element() handle binding name. */
	readonly handleName: string;
	/** The authored expression, which differs from handleName through an alias. */
	readonly source: string;
	/** The host element bound with `el={handle}`; the element that needs the id. */
	readonly boundHostNodeId: string;
	readonly componentName?: string;
	readonly sourceSpan?: SourceSpan;
	// Document order of the IDREF references in this file; stable across compiles.
	readonly order: number;
	readonly keyedRepeatScopeIds?: ReadonlyArray<string>;
	readonly asyncBoundaryId?: string;
};

export type SemanticBehavior = {
	readonly hostNodeId: string;
	readonly source: string;
	readonly functionSource: string;
	readonly inputSources: ReadonlyArray<string>;
	readonly keyedRepeatScopeIds?: ReadonlyArray<string>;
};

/**
 * An element marked for cross-platform elevation: it renders above the rest of
 * the UI, escaping clipping and stacking ancestors. Elevation only - no
 * dismissal, focus, positioning, ARIA, or animation policy rides on this record.
 *
 * There is deliberately no `inputs` field. No inputs means no dependencies,
 * which means this record can never re-run: elevation is structural, not
 * reactive. Elevation must never be driven by shown-ness. `@if` owns whether the
 * element exists; a reactive `overlay={isOpen}` would re-elevate the host on
 * every toggle. Adaptive elevation is a recorded non-goal for the same reason: a
 * value that varies with nothing declared to depend on is incoherent, and the
 * missing `inputs` field is what makes non-reactivity structural rather than a
 * convention a later pass could quietly break.
 */
export type SemanticOverlay = {
	readonly hostNodeId: string;
	readonly componentName?: string;
	// Document order of the overlay marks in this file; stable across compiles.
	readonly order: number;
	readonly keyedRepeatScopeIds?: ReadonlyArray<string>;
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
	readonly bindingId?: string;
	readonly lexicalScopeId?: string;
	readonly declarationKind?: SemanticGraphBinding['declarationKind'] | 'function';
	readonly declarationSpan?: SourceSpan;
	readonly writeCount?: number;
	readonly initializer?: {
		readonly kind: 'arrow-function' | 'function-expression' | 'function-declaration';
		readonly source: string;
		readonly sourceSpan: SourceSpan;
		readonly bodySpan?: SourceSpan;
		readonly parameters: ReadonlyArray<string>;
	};
};

export type SemanticSyncPolicyConstant = {
	readonly name: string;
	readonly value: unknown;
};

export type SemanticMarkupSlotCoordinate =
	| { readonly kind: 'child-index'; readonly path: ReadonlyArray<number> }
	| { readonly kind: 'comment-anchor'; readonly path: ReadonlyArray<number> };

export type SemanticMarkupResidue =
	| {
			readonly kind: 'graph-read';
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly kind: 'repeat-item';
			readonly repeatId: string;
			readonly path: ReadonlyArray<string>;
	  }
	| { readonly kind: 'authored-expression'; readonly source: string };

type SemanticMarkupLocatedSlot = {
	readonly coordinate: SemanticMarkupSlotCoordinate;
	// Server rendering interleaves the residue after this statics entry.
	readonly staticIndex: number;
};

export type SemanticMarkupSlot = SemanticMarkupLocatedSlot &
	(
		| { readonly kind: 'text'; readonly residue: SemanticMarkupResidue; readonly raw?: boolean }
		| {
				readonly kind: 'attribute';
				readonly name: string;
				readonly residue: SemanticMarkupResidue;
				readonly directClassMatch?: {
					readonly stateGraphNodeId: string;
					readonly statePath: ReadonlyArray<string>;
					readonly itemPath: ReadonlyArray<string>;
					readonly trueClass: string;
					readonly falseClass: string;
				};
		  }
		| {
				readonly kind: 'spread-attributes';
				readonly residue: SemanticMarkupResidue;
				readonly excludeNames: ReadonlyArray<string>;
		  }
		| {
				readonly kind: 'child-component';
				readonly componentEdgeId: string;
				readonly childComponentName: string;
				readonly childTemplateId: string;
				readonly projectionChunkId?: string;
		  }
		| {
				readonly kind: 'branch';
				readonly branchSiteId: string;
				readonly armTemplateIds: ReadonlyArray<string>;
		  }
		| {
				readonly kind: 'repeat';
				readonly repeatId: string;
				readonly rowTemplateId: string;
				readonly emptyTemplateId?: string;
		  }
		| {
				readonly kind: 'async';
				readonly boundaryId: string;
				readonly armTemplateIds: Readonly<{
					readonly try: string;
					readonly pending?: string;
					readonly catch?: string;
				}>;
		  }
		| {
				readonly kind: 'dynamic-host';
				readonly hostNodeId: string;
				readonly cardinality: 'zero-or-one';
				readonly nullishTag: 'omit';
				readonly tag: SemanticMarkupResidue;
				readonly staticAttributes: Readonly<Record<string, string>>;
				readonly attributeSlots: ReadonlyArray<
					| {
							readonly kind: 'attribute';
							readonly name: string;
							readonly residue: SemanticMarkupResidue;
					  }
					| { readonly kind: 'spread'; readonly residue: SemanticMarkupResidue }
				>;
				readonly childChunkId: string;
		  }
	);

export type SemanticMarkupChunk = {
	readonly id: string;
	readonly kind:
		| 'template'
		| 'branch-arm'
		| 'async-arm'
		| 'repeat-row'
		| 'repeat-empty'
		| 'component-projection'
		| 'dynamic-host-children';
	readonly componentName: string;
	readonly statics: ReadonlyArray<string>;
	readonly hosts: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly tagName: string;
		readonly coordinate: { readonly kind: 'child-index'; readonly path: ReadonlyArray<number> };
	}>;
	readonly slots: ReadonlyArray<SemanticMarkupSlot>;
};

export type SemanticMarkupArtifact = {
	readonly root: { readonly componentName: string; readonly templateId: string } | null;
	readonly chunks: ReadonlyArray<SemanticMarkupChunk>;
};

export type SemanticGraphArtifact = {
	readonly passId: 'tsrx-semantic-graph';
	readonly filename: string;
	readonly components: ReadonlyArray<SemanticComponent>;
	readonly componentPropBindings: ReadonlyArray<SemanticComponentPropDeclaration>;
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
	readonly overlays: ReadonlyArray<SemanticOverlay>;
	readonly elementHandleBindings: ReadonlyArray<SemanticElementHandleBinding>;
	readonly elementHandleIdrefs: ReadonlyArray<SemanticElementHandleIdref>;
	readonly localBindings: ReadonlyArray<SemanticLocalBinding>;
	readonly localDeclarations: ReadonlyArray<SemanticLocalDeclaration>;
	readonly aliases: ReadonlyArray<SemanticGraphAlias>;
	readonly stateReads: ReadonlyArray<SemanticStateRead>;
	readonly templateReads: ReadonlyArray<SemanticTemplateRead>;
	readonly stateWrites: ReadonlyArray<SemanticStateWrite>;
	readonly asyncBoundaries: ReadonlyArray<{
		readonly id: string;
		readonly anchorOrder: number;
		readonly parentBoundaryId?: string;
	}>;
	readonly branchSites: ReadonlyArray<SemanticBranchSite>;
	readonly markup: SemanticMarkupArtifact;
	readonly moduleGraphInterface: ModuleGraphInterfaceArtifact;
	readonly diagnostics: ReadonlyArray<SemanticGraphDiagnostic>;
};

export type RenderDataInitialValue = {
	readonly graphNodeId: string;
	readonly value:
		| { readonly kind: 'constant'; readonly value: unknown }
		| { readonly kind: 'symbol-function'; readonly symbolId: string };
};

export type RenderDataBranch = {
	readonly branchSiteId: string;
	readonly kind: SemanticBranchSite['kind'];
	readonly testSource: string;
	readonly testReads: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
	readonly armChunkIds: ReadonlyArray<string>;
	readonly anchorOrder: number;
	readonly asyncBoundaryId?: string;
	readonly asyncBoundaryArm?: number;
	readonly armTests?: ReadonlyArray<unknown>;
	readonly declaredEmptyArms?: ReadonlyArray<number>;
	readonly update: 'range' | 'boundary';
};

export type RenderDataRepeat = {
	readonly repeatId: string;
	readonly parentHostNodeId: string;
	readonly rowHostNodeId?: string;
	readonly itemName: string;
	readonly collectionGraphNodeId?: string;
	// The authored collection expression, carried only when the collection is
	// not a graph read: the renderer has no graph node to read the rows from.
	readonly collectionSource?: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly keyPath: ReadonlyArray<string>;
	readonly rowChunkId: string;
	readonly emptyChunkId?: string;
	readonly rowElementCount: number;
	readonly parentPath?: ReadonlyArray<number>;
	readonly classWrites?: ReadonlyArray<PublicRenderPlanClassWrite>;
	readonly eventControls?: ReadonlyArray<PublicRenderPlanEventControl>;
	readonly rowElementHandles?: PublicRenderPlanKeyedRepeat['rowElementHandles'];
	readonly rowBehaviors?: PublicRenderPlanKeyedRepeat['rowBehaviors'];
	readonly directSupported: boolean;
};

export type RenderDataBoundary = {
	readonly boundaryId: string;
	readonly anchorOrder: number;
	readonly runnerGraphNodeId: string | null;
	readonly initiallyServedArm: PayloadAsyncBoundary['initiallyServedArm'];
	readonly reads: ReadonlyArray<{
		readonly source: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
	readonly unresolvedSources: ReadonlyArray<string>;
	readonly armChunkIds: Readonly<{
		readonly try: string;
		readonly pending?: string;
		readonly catch?: string;
	}>;
	readonly protocolSupported: boolean;
};

export type RenderDataInteraction = {
	readonly eventId: string;
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly symbolIds: ReadonlyArray<string>;
};

export type RenderDataArtifact = {
	readonly passId: 'render-data';
	readonly filename: string;
	readonly root: SemanticMarkupArtifact['root'];
	readonly chunks: SemanticMarkupArtifact['chunks'];
	readonly hosts: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly tagName: string;
		readonly asyncBoundaryId?: string;
		readonly asyncBoundaryArm?: number;
	}>;
	readonly initialValues: ReadonlyArray<RenderDataInitialValue>;
	readonly branches: ReadonlyArray<RenderDataBranch>;
	readonly repeats: ReadonlyArray<RenderDataRepeat>;
	readonly boundaries: ReadonlyArray<RenderDataBoundary>;
	readonly interactions: ReadonlyArray<RenderDataInteraction>;
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
	readonly sourceSpan?: SourceSpan;
	readonly bindingId?: string;
	readonly componentName?: string;
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
	readonly renderData?: RenderDataArtifact;
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
	readonly runnerGraphNodeId: ProtocolViewPayload['asyncBoundaries'][number]['runnerGraphNodeId'];
	readonly initiallyServedArm: ProtocolViewPayload['asyncBoundaries'][number]['initiallyServedArm'];
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
	readonly rowElementHandles?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly handleId: string;
		readonly name: string;
	}>;
	readonly rowBehaviors?: ReadonlyArray<PayloadBehavior>;
};

export type PayloadArenaArtifact = {
	readonly passId: 'payload-arena';
	readonly state: {
		readonly cells: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly name: string;
			readonly valueKind: SemanticGraphBinding['valueKind'];
		}>;
		readonly storage: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly key: string;
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
			readonly parameters?: ReadonlyArray<string>;
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
			readonly kind: 'state-initializer';
			readonly graphNodeId: string;
			readonly name: string;
			readonly source: string;
			readonly moduleImports?: ReadonlyArray<SemanticModuleImport>;
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

export type BoundSymbolCaptureRoute = Exclude<
	CaptureSlotRoute,
	{ readonly kind: 'unsupported-opaque' }
>;

// A bound row is data only. Its opaque ID addresses one rendered component-edge
// path; the generated resolver turns the row into an adapter at load time.
export type BoundSymbolResolverRow = {
	readonly id: string;
	readonly baseSymbolId: string;
	// Imported symbols keep their child-local base ID for view composition, while
	// the parent resolver loads the edge-scoped symbol route registered by the bundler.
	readonly loaderSymbolId?: string;
	readonly componentEdgePath: ReadonlyArray<string>;
	readonly ancestry: ReadonlyArray<{
		readonly componentEdgeId: string;
		readonly branchScopeIds: ReadonlyArray<string>;
		readonly keyedRepeatScopeIds: ReadonlyArray<string>;
	}>;
	readonly captureSlots: ReadonlyArray<{
		readonly slotId: string;
		readonly path: ReadonlyArray<string>;
		readonly route: BoundSymbolCaptureRoute;
		readonly legacyGraphRead?: {
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		};
	}>;
};

export type BoundSymbolResolverArtifact = {
	readonly passId: 'bound-symbol-resolver';
	readonly rows: ReadonlyArray<BoundSymbolResolverRow>;
};

export type BoundSymbolResolverInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly captureAnalysis: CaptureAnalysisArtifact;
};

export type CaptureAnalysisInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly symbols?: SymbolResolverModuleInput['symbols'];
};

export type CaptureAnalysisDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE'
		| 'MARKLESS_CAPTURE_OPAQUE_PROP'
		| 'MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED'
		| 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED';
	readonly phase: 'capture-analysis';
	readonly passId: 'capture-analysis';
	readonly symbolId?: string;
	readonly componentEdgeId?: string;
	readonly componentName?: string;
	readonly propName?: string;
	readonly source: string;
};

export type CaptureSlotRoute =
	| {
			readonly kind: 'graph-reference';
			readonly componentEdgeId?: string;
			readonly componentEdgePath?: ReadonlyArray<string>;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly kind: 'compiler-known-constant';
			readonly componentEdgeId: string;
			readonly componentEdgePath?: ReadonlyArray<string>;
			readonly value: unknown;
	  }
	| {
			readonly kind: 'callback-route';
			readonly componentEdgeId: string;
			readonly componentEdgePath?: ReadonlyArray<string>;
			readonly callbackSymbolId: string;
	  }
	| {
			// An imported descendant reads a prop owned by this forwarding component.
			// A consuming module replaces this compiler-only route when it composes the
			// forwarding component through a concrete instance edge.
			readonly kind: 'passthrough-route';
			readonly componentEdgeId: string;
			readonly componentEdgePath?: ReadonlyArray<string>;
			readonly bindingId: string;
			readonly propName: string;
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly kind: 'unsupported-opaque';
			readonly componentEdgeId: string;
			readonly componentEdgePath?: ReadonlyArray<string>;
			readonly expression: string;
			readonly sourceSpan?: SourceSpan;
	  };

// A slot belongs to one authored binding in one component and may have one
// route per incoming component edge. Repeated child instances therefore share
// base symbol code without sharing instance values.
export type CaptureSlot = {
	readonly id: string;
	readonly bindingId: string;
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
	readonly owner: {
		readonly componentId?: string;
		readonly componentName?: string;
		readonly declarationSpan?: SourceSpan;
	};
	readonly propName?: string;
	readonly path: ReadonlyArray<string>;
	readonly routes: ReadonlyArray<CaptureSlotRoute>;
};

export type ExtractedCaptureSymbol = {
	readonly symbolId: string;
	readonly loaderSymbolId?: string;
	readonly kind: PlannedSymbol['kind'];
	readonly source: string;
	readonly owner?: {
		readonly componentId?: string;
		readonly componentName?: string;
	};
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
};

export type CaptureAnalysisArtifact = {
	readonly passId: 'capture-analysis';
	readonly boundResolverRows?: ReadonlyArray<BoundSymbolResolverRow>;
	readonly extractedSymbols: ReadonlyArray<ExtractedCaptureSymbol>;
	readonly diagnostics: ReadonlyArray<CaptureAnalysisDiagnostic>;
};

export type SymbolModulesInput = {
	readonly source?: SemanticGraphInput;
	readonly semanticGraph?: SemanticGraphArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis: CaptureAnalysisArtifact;
	readonly renderData?: RenderDataArtifact;
	readonly publicRenderPlan?: PublicRenderPlanArtifact;
	// Consumer builds drop the authored-source strings: nothing reads them at
	// runtime, and every symbol chunk pays for them at load.
	readonly omitAuthoredSource?: boolean;
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

export type RuntimeDemandMapRecordKind =
	| ProtocolEventActionKind
	| 'async-boundary'
	| 'behavior'
	| 'branch'
	| 'dom-update'
	| 'element-handle'
	| 'keyed-repeat';

export type RuntimeDemandMapRecord = {
	readonly recordId: string;
	readonly kind: RuntimeDemandMapRecordKind;
	readonly hostNodeId?: string;
	readonly eventName?: string;
	readonly symbolIds?: ReadonlyArray<string>;
	readonly runtimeModuleIds: ReadonlyArray<string>;
};

export type RuntimeDemandMapAction = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly recordKind: ProtocolEventActionKind | 'keyed-repeat-row';
	readonly recordKinds: ReadonlyArray<RuntimeDemandMapRecordKind>;
	readonly payloadRecordIds: ReadonlyArray<string>;
	readonly runtimeModuleIds: ReadonlyArray<string>;
	readonly plan?: RuntimeDemandMapActionPlan;
};

export type RuntimeDemandMapActionPlan = {
	readonly version: 1;
	readonly kind: 'scalar' | 'row';
	readonly symbolId: string;
	readonly cell: string;
	readonly write: {
		readonly kind: 'assign' | 'update';
		readonly value?: unknown;
		readonly valueKind?: 'undefined';
		readonly localPath?: ReadonlyArray<string>;
		readonly updateOperator?: '++' | '--';
	};
	readonly textUpdates: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly graphNodeId: string;
		readonly symbolId: string;
		readonly prefix?: string;
	}>;
	readonly repeatId?: string;
	readonly fullDecodeCells?: ReadonlyArray<string>;
};

export type RuntimeDemandClass = 'plain-ssr' | 'prerender';

export type RuntimeDemandMapArtifact = {
	readonly passId: 'runtime-demand-map';
	readonly version: 1;
	readonly recordKinds: ReadonlyArray<{
		readonly kind: RuntimeDemandMapRecordKind;
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

export type RuntimeDemandMapsArtifact = Record<RuntimeDemandClass, RuntimeDemandMapArtifact>;

export type TriggerGroupArtifact = {
	readonly passId: 'trigger-groups';
	readonly groups: ReadonlyArray<{
		readonly id: string;
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly graphNodeIds: ReadonlyArray<string>;
		readonly payloadRecordIds: ReadonlyArray<string>;
		readonly symbolIds: ReadonlyArray<string>;
	}>;
};

export type SymbolResolverModuleInput = {
	readonly buildId?: string;
	readonly resolverId?: string;
	readonly symbols: ReadonlyArray<{
		readonly id: string;
		readonly chunk: string;
		readonly exportName: string;
		readonly componentEdgeId?: string;
		readonly captureSymbol?: ExtractedCaptureSymbol;
	}>;
	readonly boundSymbols?: ReadonlyArray<BoundSymbolResolverRow>;
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
	readonly renderData?: RenderDataArtifact;
	readonly captureAnalysis?: CaptureAnalysisArtifact;
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
	| 'row-component-content-unsupported'
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
			// Rows invoke components (markup-only, item-scope props): the SSR/CSR
			// row mappers execute the component per row; the direct-DOM row
			// template path stays off (a static template cannot hold child output).
			readonly componentRows?: true;
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
	readonly rowElementHandles?: ReadonlyArray<{
		readonly hostPath: ReadonlyArray<number>;
		readonly handleId: string;
		readonly name: string;
	}>;
	readonly rowBehaviors?: ReadonlyArray<{
		readonly hostPath: ReadonlyArray<number>;
		readonly symbolId: string;
		readonly inputPaths: ReadonlyArray<ReadonlyArray<string>>;
	}>;
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
					| {
							readonly read: {
								readonly graphNodeId: string;
								readonly path: ReadonlyArray<string>;
							};
					  }
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
	readonly styleScopes: ReadonlyArray<{ readonly scopeId: string; readonly cssText: string }>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export type PublicRenderModuleInput = {
	readonly source: SemanticGraphInput;
	readonly semanticGraph: SemanticGraphArtifact;
	readonly renderData: RenderDataArtifact;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis: CaptureAnalysisArtifact;
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
};

export type PublicRenderModuleArtifact = {
	readonly passId: 'public-render-module';
	readonly renderDataModuleSource: string;
	readonly moduleSource: string;
	readonly rootExportName: string | null;
	readonly ssrModuleSource: string;
	readonly ssrExportName: string | null;
	readonly componentDefinitions: ReadonlyArray<Readonly<Record<string, unknown>>>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export type CompileTsrxModuleInput = SemanticGraphInput &
	SymbolResolverModuleInput & {
		readonly omitAuthoredSource?: boolean;
	};

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
	readonly renderData: RenderDataArtifact;
	readonly boundSymbolResolver: BoundSymbolResolverArtifact;
	readonly captureAnalysis: CaptureAnalysisArtifact;
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
	readonly payloadScripts: RenderedPayloadScripts;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
	readonly publicRenderModule: PublicRenderModuleArtifact;
	readonly symbolModules: SymbolModulesArtifact;
	readonly runtimeDemandMap: RuntimeDemandMapArtifact;
	readonly runtimeDemandMaps: RuntimeDemandMapsArtifact;
	readonly triggerGroups: TriggerGroupArtifact;
	readonly symbolResolverModule: string;
	readonly symbolResolverModuleManifest: SymbolResolverModuleManifest;
};

// Execution attribution (`execution-attribution` link pass): route key -> scope
// prefix -> encoded module source. Build output, never serialized into a
// published package.
export type ExecutionAttributionTables = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type ExecutionAttributionModuleManifest = {
	readonly source: string;
	readonly symbolRoutes?: ReadonlyArray<{
		readonly prefix: string;
		readonly importSource: string;
	}>;
};

export type ExecutionAttributionChild = {
	readonly parent: string;
	readonly specifier: string;
	readonly source: string;
};

export type ExecutionAttributionInput = {
	readonly moduleManifests: Iterable<ExecutionAttributionModuleManifest>;
	readonly childTable: Iterable<ExecutionAttributionChild>;
	readonly root?: string;
	// The linker owns specifier resolution and source encoding; the pass reads
	// them as inputs so it never needs a bundler resolve/load context.
	readonly resolveSpecifier: (parent: string, specifier: string) => string;
	readonly encodeSource: (source: string) => string;
};

export type ExecutionAttributionArtifact = {
	readonly passId: 'execution-attribution';
	readonly tables: ExecutionAttributionTables;
	readonly roots: ReadonlyArray<string>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

// Linked interfaces (`interface-link` link pass). Serializable: the signature
// is the invalidation key a published package carries so a consumer can tell a
// stale dependency artifact from a current one.
export type ModuleLinkArtifact = {
	readonly moduleGraphInterface: ModuleGraphInterfaceArtifact;
	readonly interfaceHash: string;
	readonly moduleImports: SemanticGraphArtifact['moduleImports'];
};

export type LinkedInterfaceImport = {
	readonly specifier: string;
	readonly source: string;
	readonly interfaceHash?: string;
	readonly moduleInterface?: ModuleGraphInterfaceArtifact;
};

export type LinkedInterfaceClaim = {
	readonly source: string;
	readonly symbols: ReadonlyArray<unknown>;
};

export type LinkedInterfacesInput = {
	readonly imports: ReadonlyArray<LinkedInterfaceImport>;
	readonly claims: ReadonlyArray<LinkedInterfaceClaim>;
};

export type LinkedInterfacesArtifact = {
	readonly passId: 'interface-link';
	readonly interfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly signature: string;
	readonly claimSignature: string;
};

export type LinkedInterfaceCompleteness = Pick<
	SemanticGraphInput,
	'artifactChildMaterializations' | 'importedModuleInterfaces'
>;

export type LinkedBoundarySymbolsInput = {
	readonly compiled: Pick<
		CompileTsrxModuleResult,
		'protocolView' | 'publicRenderModule' | 'semanticGraph' | 'symbolModules' | 'symbolResolver'
	>;
	readonly link: LinkedInterfaceCompleteness;
	// The linker owns the client-environment gate and virtual module naming, so
	// both arrive as inputs rather than being derived here.
	readonly clientLink: boolean;
	readonly renderDataId: string;
	readonly resolverId: string;
	readonly symbolModuleId: (symbolId: string) => string;
	readonly boundaryExportName: (index: number) => string;
};

export type LinkedBoundarySymbol = {
	readonly row: { readonly id: string; readonly chunk: string; readonly exportName: string };
	readonly manifest: {
		readonly symbolId: string;
		readonly kind: 'async-boundary-update';
		readonly exportName: string;
		readonly virtualModuleId: string;
	};
	readonly module: {
		readonly id: string;
		readonly type: 'symbol';
		readonly symbolId: string;
		readonly exportName: string;
		readonly source: string;
	};
};

export type LinkedArtifactChild = {
	readonly edgeId: string;
	readonly componentName: string;
	readonly importSource: string;
	readonly importKind: NonNullable<SemanticComponentEdge['importKind']>;
	readonly importedName?: string;
	readonly hasChildren: boolean;
	readonly props: ReadonlyArray<{
		readonly name: string;
		readonly kind: string;
		readonly value?: unknown;
		readonly source?: string;
	}>;
	readonly projection?: {
		readonly kind: 'static-markup';
		readonly markup: string;
		readonly elementCount: number;
	};
};

// Linked module graph (`module-link` link pass): the imported-child table a
// linker holds once every specifier has been resolved. A child's kind is a
// typed field decided from its resolution and its compiled artifact, so a
// filename can never stand in for a fact about a module, and an externalized
// dependency can never be mistaken for something the linker may load.
// `children`/`diagnostics` are per-build; `interfaces` is serializable.
export type LinkedModuleChildKind =
	| 'compiled-tsrx'
	| 'external-delegate'
	| 'plain-ts'
	| 'unresolved';

// Filled by the caller that owns `resolve`: `id` is the resolved module id with
// its query stripped, `external` is the resolver's own verdict, and `kind`
// records whether the id came from the resolver or from the caller's fallback.
export type ModuleLinkResolution = {
	readonly id: string;
	readonly external: boolean;
	readonly kind: 'resolved' | 'fallback';
};

export type ModuleLinkResolutionTable = Readonly<Record<string, ModuleLinkResolution>>;

export type ModuleLinkRequest = {
	readonly parent: string;
	readonly specifier: string;
	readonly componentEdgeId?: string;
};

export type LinkedModuleChildResolution = {
	readonly parent: string;
	readonly specifier: string;
	readonly source: string;
	readonly componentEdgeId?: string;
	readonly externalized: boolean;
};

export type LinkedModuleChild = LinkedModuleChildResolution & {
	readonly kind: LinkedModuleChildKind;
};

// The claim manifest half the linker publishes per source. Only the symbol rows
// matter here; naming the virtual module they live in stays with the caller.
export type LinkedSymbolClaimManifest = {
	readonly symbols: ReadonlyArray<{
		readonly symbolId: string;
		readonly exportName: string;
		readonly kind: string;
		readonly virtualModuleId: string;
	}>;
};

export type LinkedModuleGraphInput = {
	readonly children: ReadonlyArray<LinkedModuleChildResolution>;
	readonly moduleArtifacts: ReadonlyMap<string, ModuleLinkArtifact>;
	readonly captureMetadataForSource: (source: string) => CaptureAnalysisArtifact | undefined;
	// A parent mid-transform is not in the registry yet, so the caller decides
	// which capture metadata answers for it.
	readonly parentCaptureMetadataForSource: (
		parent: string,
	) => CaptureAnalysisArtifact | undefined;
	// Virtual module naming is the caller's: the pass asks for the symbol-route
	// module of a source rather than spelling the query itself.
	readonly symbolRouteSource: (source: string) => string;
};

export type LinkedModuleGraphArtifact = {
	readonly passId: 'module-link';
	readonly children: ReadonlyArray<LinkedModuleChild>;
	readonly interfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly routeArtifacts: Readonly<Record<string, string>>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

// What a linker must publish and wait for before a child's claims can be read.
// The pass decides the plan; performing it is the caller's I/O. The load source
// is decided separately because the caller must load the child before its
// capture metadata exists to plan against.
export type LinkedModuleClaimPlan = {
	readonly claimSources: ReadonlyArray<string>;
	readonly expectClaims: boolean;
	readonly seal: boolean;
};
