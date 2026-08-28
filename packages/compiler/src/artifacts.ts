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
	/** How this module exports the component: `default`, the export name, or absent. */
	readonly exportName?: string;
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
	// The authored destructuring default, applied only when the prop is undefined.
	readonly defaultSource?: string;
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
			// A consumer's event callback becomes a real event record on whatever
			// element the child spreads it onto, so its browser-critical policy has
			// to cross the edge with it or the default action wins.
			readonly hasSyncPolicyCandidate?: boolean;
			readonly syncPolicy?: SemanticSyncPolicy;
	  }
	// An element() handle written into an IDREF attribute on a CHILD COMPONENT
	// tag. The value that crosses the edge is the id minted for the referenced
	// element, not the handle: the PARENT renders that element, so only the
	// parent can spell the id, and the child writes it as an ordinary attribute
	// through its `{...rest}`. Carrying the handle itself instead would hand the
	// child a DOM object to stringify into an IDREF that names nothing.
	// The field is `graphNodeId`, the same name the other id-carrying kinds use,
	// so the value rides the generic prop transport into the emitted component
	// definitions instead of needing a second passthrough. `kind` is what says
	// how to read it: an element node here is an identity to mint, never a value
	// to seed, and every consumer that treats a graph node as a dependency is
	// gated on `kind` rather than on the field being present.
	| {
			readonly name: string;
			readonly source: string;
			readonly kind: 'element-handle-id';
			readonly graphNodeId: string;
			// Always empty: a handle resolves to an element node with nothing left of
			// the path, or it is not a handle. Carried so the pair travels through
			// the generic transport that moves every id-carrying prop.
			readonly path: ReadonlyArray<string>;
			readonly sourceSpan?: SourceSpan;
	  }
	// `{...rest}` written on a CHILD COMPONENT tag. It carries no single name: the
	// whole props object the parent was handed crosses the edge, minus what the
	// parent's signature took out of the rest binding.
	| {
			readonly name: string;
			readonly source: string;
			readonly kind: 'spread';
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			readonly excludeNames: ReadonlyArray<string>;
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
	// element() only: the declared type argument was written as an array, so this
	// handle names an ordered SET of elements rather than one.
	readonly plural?: boolean;
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

/** `export { default as root } from './x.tsrx'` as the module authored it. */
export type ModuleGraphInterfaceReexport = {
	readonly exportName: string;
	readonly source: string;
	/** `default`, a named export, or `*` for `export * as ns from`. */
	readonly importedName: string;
};

/**
 * A component a barrel module re-exports, with the specifier already rebased to
 * the module that imports the barrel. Linkers produce this; compiling a module
 * alone cannot, because only the linker resolves specifiers.
 */
export type ModuleGraphInterfaceLinkedComponent = {
	readonly exportPath: ReadonlyArray<string>;
	readonly source: string;
	readonly importKind: SemanticModuleImport['kind'];
	readonly importedName?: string;
	readonly componentName: string;
};

/**
 * A `shared()` definition this module exports, published whole: the definition
 * record its own parts resolve, plus the factory graph nodes its returned
 * properties name. An importing module adopts both, so `family.state()` there
 * resolves to the same definition — same id, same nodes — as `family()` here.
 *
 * The definition travels whole, so `factoryModuleImports` and
 * `factoryModuleScope` travel with it: that is how a module copying one of this
 * factory's expressions can bind the free names the copy carries.
 */
export type ModuleGraphInterfaceSharedDefinition = {
	readonly exportName: string;
	readonly definition: SemanticSharedDefinition;
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
};

export type ModuleGraphInterfaceArtifact = {
	readonly passId: 'module-graph-interface';
	readonly filename: string;
	readonly exports: ReadonlyArray<ModuleGraphInterfaceExport>;
	readonly reexports?: ReadonlyArray<ModuleGraphInterfaceReexport>;
	readonly linkedComponents?: ReadonlyArray<ModuleGraphInterfaceLinkedComponent>;
	readonly sharedDefinitions?: ReadonlyArray<ModuleGraphInterfaceSharedDefinition>;
	readonly render: {
		readonly version: 1;
		readonly components: ReadonlyArray<{
			readonly componentName: string;
			readonly exportName?: string;
			readonly rootChunkId: string;
			readonly childChunks: ReadonlyArray<{
				readonly id: string;
				readonly kind: SemanticMarkupChunk['kind'];
				readonly slotCount: number;
				readonly elementCount: ModuleGraphInterfaceElementCount;
			}>;
			readonly inputs: ReadonlyArray<{
				readonly localName: string;
				readonly path: ReadonlyArray<string>;
			}>;
			readonly elementCount: ModuleGraphInterfaceElementCount;
			// Absent on an interface built before this field existed, which reads as 'unknown'.
			readonly constructReach?: ModuleGraphInterfaceConstructReach;
			readonly projection?: ModuleGraphInterfaceProjection;
			readonly spreadHosts?: ReadonlyArray<ModuleGraphInterfaceSpreadHost>;
			readonly armMaterial?: ModuleGraphInterfaceArmMaterial;
			readonly seedsFromProps?: ReadonlyArray<ModuleGraphInterfaceSeedFromProp>;
		}>;
	};
};

/**
 * A shared cell this component writes before it renders, taken from one of its
 * own props. `prop` is the prop the seed reads and `statePath` the cell it
 * writes.
 *
 * A module that places this component reads it back to answer a question its own
 * source cannot: the seed is a fact of the component's file, but whether the
 * value the placement passes can reach that seed is decided where the placement
 * is written. Absent when the component seeds nothing from a prop, and absent on
 * an interface built before this field existed.
 */
export type ModuleGraphInterfaceSeedFromProp = {
	readonly prop: string;
	readonly statePath: string;
};

/**
 * The compiled markup an importing module can rebuild this component from
 * without running it: its own chunks, published only when the component's body
 * is markup and prop reads. A caller that shows the component inside a
 * flippable `@if` arm replaces the arm wholesale from these chunks, the way it
 * already does for a component written in its own file.
 */
export type ModuleGraphInterfaceArmMaterial = {
	readonly chunks: ReadonlyArray<SemanticMarkupChunk>;
};

/**
 * One element of a component's markup that spreads the component's own props.
 * A parent reads this off the child's interface to decide, at build time, which
 * of the function props it passes reach that element: the name lists say what
 * the spread can never carry — what the element already writes itself
 * (`excludeNames`) and what the signature took out of the rest binding
 * (`destructuredNames`).
 */
export type ModuleGraphInterfaceSpreadHost = {
	readonly hostNodeId: string;
	readonly excludeNames: ReadonlyArray<string>;
	readonly destructuredNames: ReadonlyArray<string>;
};

/**
 * How many ELEMENTS one position renders in DOCUMENT order — a host counts
 * itself plus its whole subtree, so the number is what a preorder element walk
 * (the census) would meet, not a child index. `'unknown'` is the honest answer
 * whenever render time decides the number: a repeat's rows, an async boundary's
 * arm, a dynamic host that may be omitted, a branch whose arms disagree, or a
 * child component whose markup this module never saw.
 */
export type ModuleGraphInterfaceElementCount = number | 'unknown';

/**
 * Which constructs one exported component's whole reachable tree carries -
 * branches (`@if`/`@switch`), repeats (`@for`, and a host whose tag the render
 * may omit), async boundaries (`@try`), or none of them.
 *
 * They are named apart because they resolve apart. A branch's anchors are a
 * pair of comments a client-minted tree can count in its OWN fragment, the way
 * it already counts its elements, so `'branches'` still admits a mint. A
 * repeat's row count and an omittable host's presence are render-time facts, so
 * a client rebuilding a tree around one has no number to place its nodes
 * against. A boundary's settle bookkeeping has no row-relative reading at all,
 * so `'boundaries'` is the worst answer of the four.
 *
 * The answer is TRANSITIVE and computed in the component's own module, where
 * its chunks and the interfaces of the components it imports are both in hand:
 * a child behind an import contributes the same fact off its own interface, so
 * the recursion grounds out one module at a time.
 *
 * `'free'` is a proof, not an absence of evidence: `'unknown'` is the honest
 * answer whenever a chunk or a child's interface was not visible, and an
 * importer that cannot see a component's tree must refuse rather than assume -
 * an unseen chunk could hold a boundary, so `'unknown'` outranks `'branches'`.
 */
export type ModuleGraphInterfaceConstructReach =
	| 'free'
	| 'branches'
	| 'repeats'
	| 'boundaries'
	| 'unknown';

/**
 * Where a component's `{children}` hole sits among the elements around it, in
 * DOCUMENT-order element counts (each host counts its whole subtree), so an
 * importer can say — while compiling, never at render time — how many elements
 * a preorder walk meets before and after the children it passes.
 *
 * The counts are of ELEMENTS only: static text and a `{text}` slot render no
 * element, so they do not shift the projected children. Anything whose element count render time decides answers
 * `'unknown'` and absorbs the whole side.
 *
 * `projectionInsideConstruct` says the hole is not in the component's root
 * chunk — it sits in a branch arm, an async arm, a repeat row, a dynamic host's
 * children, or a projection this component forwards to another component. The
 * counts still describe the hole's own chunk, but whether that chunk renders at
 * all is decided elsewhere, so a consumer must not treat them as a fixed
 * position in the served DOM. `projectionChunkId` names that chunk.
 *
 * `parentHostNodeId` is the host element the hole sits directly inside, in this
 * component's OWN id space. An importer prefixes it with the child edge's host
 * prefix to name the same element in page space, which is the only way markup
 * the importer wrote inside `{children}` can say which element it renders into.
 * Absent when the hole is at the chunk root, where the enclosing element is the
 * importer's own.
 */
export type ModuleGraphInterfaceProjection = {
	readonly elementsBeforeProjection: ModuleGraphInterfaceElementCount;
	readonly elementsAfterProjection: ModuleGraphInterfaceElementCount;
	readonly projectionInsideConstruct: boolean;
	readonly projectionChunkId?: string;
	readonly parentHostNodeId?: string;
};

export type SemanticSharedScope = 'request' | 'container' | 'page' | 'widget';

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
	  }
	| {
			// A function-typed placeholder on the returned object: a slot the widget
			// root fills with its own callback prop. It never becomes a graph node,
			// so it has no initial value and never reaches the payload.
			readonly kind: 'callback-slot';
			readonly name: string;
			readonly source: string;
			readonly sourceSpan?: SourceSpan;
	  };

// `checkbox.onChange?.(next)` inside a factory method: the call site that a
// dispatching handler routes to the enclosing widget root's callback prop.
export type SemanticSharedCallbackInvocation = {
	readonly definitionId: string;
	readonly slotName: string;
	// The authored callee text (`checkbox.onChange`), which the inlined method
	// body still spells inside the handler symbol that calls the method.
	readonly calleeSource: string;
	readonly sourceSpan?: SourceSpan;
};

// `checkbox.onChange = onChange` in the widget root: the compile-time routing
// fact that this component's callback prop fills that slot. Comptime only —
// it emits no runtime seed.
export type SemanticSharedCallbackBinding = {
	readonly definitionId: string;
	readonly slotName: string;
	readonly componentName: string;
	readonly propName: string;
	readonly sourceSpan?: SourceSpan;
};

/** One module-scope declaration of the file a shared() factory was written in. */
export type SemanticSharedModuleDeclaration = {
	readonly names: ReadonlyArray<string>;
	/** The declaration as authored, without an `export` keyword. */
	readonly source: string;
};

export type SemanticSharedDefinition = {
	readonly id: string;
	readonly name: string;
	readonly exportedName: string;
	readonly scope?: SemanticSharedScope;
	readonly factorySource: string;
	readonly dependencies?: ReadonlyArray<SemanticSharedDependency>;
	readonly returnProperties?: ReadonlyArray<SemanticSharedReturnProperty>;
	/**
	 * The module scope the factory's expressions were written in, narrowed to
	 * what `factorySource` names. A module that serves a page by copying one of
	 * those expressions rebases these specifiers onto its own path and emits
	 * them beside the copy; without them the copy names nothing.
	 * Specifiers are relative to the defining file, which `id` spells.
	 */
	readonly factoryModuleImports?: ReadonlyArray<SemanticModuleImport>;
	readonly factoryModuleScope?: ReadonlyArray<SemanticSharedModuleDeclaration>;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticSharedInstance = {
	readonly definitionId: string;
	readonly definitionName: string;
	readonly localName: string;
	// The component whose body resolved the definition; widget scope needs it to
	// decide which composed instances belong to one rendered widget.
	readonly componentName?: string;
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
	// A repeat written inside a child component's `{children}` renders into the
	// element that child wraps the hole in, not into the enclosing element of the
	// markup that wrote it. Set when that retarget happened: the parent host above
	// is the child's, in page space, and these are how many elements the child
	// renders in front of the hole and which element the OWNER's own markup
	// encloses the rows in.
	readonly projectedElementsBefore?: number;
	readonly ownerHostNodeId?: string;
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
	// Empty means the item ITSELF is the key (`key row`), which a list of scalars
	// is; `indexKey` is what says a row has no data identity at all.
	readonly keyPath: ReadonlyArray<string>;
	readonly indexKey?: true;
};

// A reactive branch site (@if or @switch) sharing the unified document-order
// comment-anchor allocator with async boundaries.
export type SemanticBranchSite = {
	readonly id: string;
	readonly kind: 'if' | 'switch';
	readonly armCount: number;
	readonly testSource: string;
	// Set when the condition recombined reads the graph cannot name on their own
	// (`!open`, `a === b`, `list.includes(x)`) into one synthetic computed. The
	// site tests THAT node; `testSource` stays the authored text so a diagnostic
	// quotes what the file says rather than a generated name.
	readonly testComputedGraphNodeId?: string;
	readonly anchorOrder: number;
	// Inside an @try arm: excluded from the page comment-anchor stream; flip
	// wiring (if any) lives in the owning boundary's arm coordinate space.
	readonly asyncBoundaryId?: string;
	// Arm index inside the owning boundary (0 = @try, 1 = @pending, 2 = @catch).
	readonly asyncBoundaryArm?: number;
	readonly armTests?: ReadonlyArray<unknown>;
	// The component body the condition was authored in. Without it the test text
	// resolves module-wide and a bare instance local matches a same-named local
	// declared in a sibling component (defect 46). Absent outside every component.
	readonly componentName?: string;
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
	// One handler per event attribute; absent when the attribute carries no value.
	readonly handlerSource?: string;
	readonly handlerSpan?: SourceSpan;
	readonly handlerParameters: ReadonlyArray<string>;
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
		| 'MARKLESS_SHARED_CALL_UNRESOLVED'
		| 'MARKLESS_SHARED_CALL_UNBOUND'
		| 'MARKLESS_SHARED_RETURN_UNNAMED'
		| 'MARKLESS_SHARED_SEED_UNRESOLVED_VALUE'
		| 'MARKLESS_SHARED_SCOPE_INVALID'
		| 'MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT'
		| 'MARKLESS_ELEMENT_HANDLE_REQUIRED'
		| 'MARKLESS_ELEMENT_HANDLE_DUPLICATE'
		| 'MARKLESS_ELEMENT_HANDLE_PLURAL_IDREF'
		| 'MARKLESS_ROW_ELEMENT_HANDLE_UNSUPPORTED'
		| 'MARKLESS_ELEMENT_HANDLE_UNBOUND'
		| 'MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED'
		| 'MARKLESS_ELEMENT_MODULE_SCOPE'
		| 'MARKLESS_ELEMENT_HANDLE_RENDER_READ'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT'
		| 'MARKLESS_ELEMENT_HANDLE_IDREF_ID_CONFLICT'
		| 'MARKLESS_CSS_ANCHOR_ATTRIBUTE'
		| 'MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED'
		| 'MARKLESS_OVERLAY_VALUE_UNSUPPORTED'
		| 'MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED'
		| 'MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION'
		| 'MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED'
		| 'MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED'
		| 'MARKLESS_COMPONENT_SPREAD_UNSUPPORTED'
		| 'MARKLESS_CALLBACK_SLOT_SOURCE_UNSUPPORTED'
		| 'MARKLESS_CALLBACK_SLOT_UNBOUND'
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
		| 'MARKLESS_REPEAT_ROWS_FROZEN'
		| 'MARKLESS_BRANCH_ELSE_SPELLING'
		| 'MARKLESS_BARE_ARM_INTERPOLATION'
		| 'MARKLESS_TEMPLATE_AS_VALUE'
		| 'MARKLESS_SUBMODULE_UNSUPPORTED'
		| 'MARKLESS_COMPONENT_TAG_UNRESOLVED'
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
	readonly valueSpan?: SourceSpan;
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
			/** Class names every write must keep — the module's style scope, which the runtime would otherwise overwrite. */
			readonly constantClass?: string;
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
	readonly defaultSource?: string;
	readonly declarationKind?: SemanticGraphBinding['declarationKind'];
	readonly sourceSpan?: SourceSpan;
};

export type SemanticTemplateRead = {
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
	readonly hostNodeId: string;
	readonly target: SemanticTemplateBindingTarget;
	readonly asyncBoundaryId?: string;
	// The branch site whose arm body holds this read directly, with no host of
	// its own. Such a read drives the arm's range, never the enclosing element.
	readonly armScopeBranchSiteId?: string;
	readonly computedGraphNodeId?: string;
	// The component body this read was authored in, for the same reason the branch
	// site carries one: `{w.label}` in two components is two reads of two different
	// instances, and without the component they lower to a single node (defect 46).
	readonly componentName?: string;
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
	// The host element that carries the IDREF attribute, or null when the
	// attribute was written on a component/part tag: no element of THIS markup
	// carries it, the value crosses the component edge and the child writes it.
	// The record still belongs here, because the element that must carry the
	// minted id is the one this component renders.
	readonly hostNodeId: string | null;
	/** The IDREF attribute on that host, e.g. `aria-labelledby`. */
	readonly attributeName: string;
	/** The resolved element() handle binding name. */
	readonly handleName: string;
	/** The graph node the handle declares; what the minted id is derived from. */
	readonly handleGraphNodeId: string;
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

/**
 * The one derive-time handle read the compiler answers instead of refusing: a
 * part asking where it sits in its family's roster.
 *
 * Every other handle read in a `computed()` stays refused, because a handle is a
 * DOM locator and a derive body holds no DOM. This shape is different in kind:
 * the roster and the part's own handle are bound on ONE element of the part
 * (`el={[w.itemEls, mine]}`), so the question is about render order, which the
 * framework knows on both sides — emission order within the widget instance at
 * server render, the roster's live document order after resume. They agree, so
 * one lowered call answers both.
 */
export type SemanticElementRosterPosition = {
	/** The `computed()` whose whole body is the position query. */
	readonly computedGraphNodeId: string;
	readonly computedName: string;
	/** The part that declared both the derive and its own handle. */
	readonly componentName: string;
	/** The plural element() handle the position is measured in. */
	readonly rosterGraphNodeId: string;
	readonly rosterSource: string;
	/** The part's own singular handle, one member of that roster. */
	readonly handleGraphNodeId: string;
	readonly handleName: string;
	/** The host element both handles are bound on; the proof they are the same element. */
	readonly hostNodeId: string;
	/** The authored call this replaces, matched verbatim when lowering. */
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
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
	| { readonly kind: 'authored-expression'; readonly source: string }
	// The id minted for one element() handle: written on the element `el=` bound
	// it and on every IDREF position that named it, so both sides spell one
	// string the author never sees.
	| {
			readonly kind: 'element-handle-id';
			readonly handleGraphNodeId: string;
			// Set on the REFERENCING side only. An IDREF names an element some other
			// part renders, so it is the one side that can find nothing to name and
			// must then write no attribute at all; the id-carrying side renders with
			// its own element or not at all.
			readonly idref?: true;
	  }
	// The space-joined ids of several handles named by one IDREF position that
	// HTML defines as a list. Referencing side only, and each entry is omitted on
	// the same terms the single form is, so a description and an error can be
	// named together without either dangling when its part never rendered.
	| {
			readonly kind: 'element-handle-id-list';
			readonly handleGraphNodeIds: ReadonlyArray<string>;
	  }

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
				// The name and quotes are already in the statics: this value can
				// never be absent, so the slot renders the value alone.
				readonly alwaysPresent?: true;
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
				// Prop names the component signature already took out of the rest
				// binding, so they never reach this spread at all.
				readonly destructuredNames?: ReadonlyArray<string>;
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
	readonly sharedCallbackInvocations: ReadonlyArray<SemanticSharedCallbackInvocation>;
	readonly sharedCallbackBindings: ReadonlyArray<SemanticSharedCallbackBinding>;
	readonly hostNodes: ReadonlyArray<SemanticHostNode>;
	readonly keyedRepeats: ReadonlyArray<SemanticKeyedRepeat>;
	readonly events: ReadonlyArray<SemanticEvent>;
	readonly syncPolicyConstants?: ReadonlyArray<SemanticSyncPolicyConstant>;
	readonly behaviors: ReadonlyArray<SemanticBehavior>;
	readonly overlays: ReadonlyArray<SemanticOverlay>;
	readonly elementHandleBindings: ReadonlyArray<SemanticElementHandleBinding>;
	readonly elementHandleIdrefs: ReadonlyArray<SemanticElementHandleIdref>;
	// Omitted when empty: a module with no roster-position derive carries no key
	// for one, so every artifact that predates this record is byte-unchanged.
	readonly elementRosterPositions?: ReadonlyArray<SemanticElementRosterPosition>;
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
	readonly testComputedGraphNodeId?: string;
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
	// See SemanticKeyedRepeat: set only for a repeat projected into a child.
	readonly ownerHostNodeId?: string;
	readonly rowHostNodeId?: string;
	readonly itemName: string;
	readonly collectionGraphNodeId?: string;
	// The authored collection expression, carried only when the collection is
	// not a graph read: the renderer has no graph node to read the rows from.
	readonly collectionSource?: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly keyPath: ReadonlyArray<string>;
	// Set only for `key row`: the empty path means read the item itself, not that
	// the row is unkeyed. A position key stays a semantic-graph fact.
	readonly itemKey?: true;
	readonly rowChunkId: string;
	readonly emptyChunkId?: string;
	readonly rowElementCount: number;
	// How many element children of the parent the rows start after. Absent is the
	// ordinary case - the rows start the parent - so it costs nothing to say.
	// 'unknown' means the prefix holds a sibling whose element count is not a
	// compile-time constant, so no offset exists and the repeat is not resumable.
	readonly rowStartOffset?: number | 'unknown';
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
		| 'MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED'
		| 'MARKLESS_SHARED_SEED_UNSUPPORTED'
		| 'MARKLESS_SHARED_SEED_UNKNOWN_FIELD'
		| 'MARKLESS_SHARED_MEMBER_UNKNOWN'
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

/**
 * One place a handler reads an `element()` handle as a VALUE.
 *
 * State lowering resolves `panel` and `tabs.panelEl` to the element binding's
 * graph node, which is not a graph value: reading it through `graph.read`
 * answers `undefined`. This record says the read is a handle, so the emitter can
 * lower it to `context.getElementHandle(...)`, which the resume registry answers
 * with the live DOM node. `handleId` is the registry's precise key; `handleName`
 * is the authored name it also accepts.
 */
export type LoweredElementHandleRead = {
	readonly source: string;
	readonly handleId: string;
	readonly handleName: string;
	/**
	 * The DOM property tail read off the handle, when the source reads one:
	 * `box.tagName.length` records `["tagName", "length"]`. Absent when the read
	 * is of the handle itself. Without it the record said only "this text is a
	 * handle" and the emitter replaced the whole chain with the handle, so
	 * `measure(box.tagName.length)` shipped as `measure(<the element>)`.
	 */
	readonly path?: ReadonlyArray<string>;
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
		readonly plural?: boolean;
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
	// See SemanticKeyedRepeat: set only for a repeat projected into a child.
	readonly ownerHostNodeId?: string;
	readonly rowHostNodeId?: string;
	readonly collectionGraphNodeId: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly keyPath: ReadonlyArray<string>;
	readonly rowElementHandles?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly handleId: string;
		readonly name: string;
		readonly plural?: boolean;
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
			readonly plural?: boolean;
		}>;
		readonly asyncBoundaries: ReadonlyArray<PayloadAsyncBoundary>;
		// Reads authored directly in a branch arm, with no host of their own.
		// They refresh the arm's own range instead of the enclosing element.
		readonly branchContentReads?: ReadonlyArray<{
			readonly branchSiteId: string;
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
		}>;
		readonly branchSites: ReadonlyArray<{ readonly id: string; readonly anchorOrder: number }>;
	};
	readonly diagnostics: ReadonlyArray<PayloadArenaDiagnostic>;
};

export type SymbolResolverInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly payloadArena: PayloadArenaArtifact;
	readonly stateLowering?: StateLoweringArtifact;
};

/**
 * A shared() method body this symbol adopted from a file other than the one
 * being compiled.
 *
 * The splice copies authored text, not scope: the definition module's own
 * imports never travel with it, and this module's imports are matched against
 * the copied text by name alone. Both halves are recorded here because both are
 * silent otherwise — the first ships a free name that throws on the first
 * dispatch, the second binds the foreign body's name to the consumer's value.
 */
export type PlannedSymbolCrossModuleInline = {
	/** The files the adopted bodies were authored in. */
	readonly definitionFilenames: ReadonlyArray<string>;
	/** The `instance.method` calls whose bodies were adopted. */
	readonly methods: ReadonlyArray<string>;
	/** This module's import locals whose names occur in the adopted text. */
	readonly capturedImportNames: ReadonlyArray<string>;
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
			readonly crossModuleInline?: PlannedSymbolCrossModuleInline;
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
			readonly elementHandleReads?: ReadonlyArray<LoweredElementHandleRead>;
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
			readonly crossModuleInline?: PlannedSymbolCrossModuleInline;
			readonly reads?: ReadonlyArray<LoweredStateRead>;
			readonly writes?: ReadonlyArray<LoweredStateWrite>;
			readonly elementHandleReads?: ReadonlyArray<LoweredElementHandleRead>;
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
			// A component body assigning into its shared instance
			// (`s.disabled = props.disabled`). The function returns the whole node
			// value with the assigned property merged in, so it can replace the
			// factory initial for that component's instance alone.
			readonly id: string;
			readonly kind: 'shared-seed';
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			readonly componentName: string;
			readonly name: string;
			readonly source: string;
			readonly moduleImports?: ReadonlyArray<SemanticModuleImport>;
			// A callback-slot seed reads no authored expression: its value is the id
			// of the symbol this component's own callback prop was compiled into,
			// which the composing edge already hands the root among its props.
			readonly callbackSlotPropName?: string;
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
			// Present when the whole body is a roster position query, which lowers to
			// one call instead of to graph reads of two DOM locators.
			readonly rosterPosition?: SemanticElementRosterPosition;
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
	// The rendered instance the base symbol's own graph nodes were composed
	// under: one segment per imported component edge in the ancestry.
	readonly instancePath?: string;
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
	// The instance path this module's render emission spells for each of its
	// composed component edges. The bundler registers one symbol route per entry
	// instead of restating the instance grammar.
	readonly componentEdgeInstancePaths?: ReadonlyArray<{
		readonly componentEdgeId: string;
		readonly instancePath: string;
	}>;
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
		| 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED'
		| 'MARKLESS_SHARED_FACTORY_CLASS_INSTANCE'
		| 'MARKLESS_STATE_PROPERTY_CLASS_INSTANCE';
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
			// A widget part invokes a callback slot on its shared instance. The family
			// module cannot name the consumer's handler, so a composing module resolves
			// this against the enclosing widget root's edge and replaces it with the
			// ordinary callback route that edge proves.
			readonly kind: 'widget-callback-route';
			readonly componentEdgeId?: string;
			readonly componentEdgePath?: ReadonlyArray<string>;
			readonly sharedDefinitionId: string;
			readonly slotName: string;
			// The widget root's own prop name, which need not match the slot name.
			readonly rootPropName: string;
			readonly rootComponentName: string;
	  }
	| {
			// The resolved widget-callback escape: the answering symbol id is a graph
			// node of the widget's own definition, so the part's dispatch reaches it
			// through the same instance-qualified graph its other reads resolve by.
			readonly kind: 'callback-slot-route';
			readonly componentEdgeId?: string;
			readonly componentEdgePath?: ReadonlyArray<string>;
			readonly graphNodeId: string;
			// Which of this module's own callback props answers the slot, so the
			// emitted symbol for it binds the dispatched arguments rather than the event.
			readonly rootPropName: string;
			readonly rootComponentName: string;
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
			// The consumer passed no such prop, so the diagnostic names the missing
			// prop instead of an authored runtime expression.
			readonly absentProp?: true;
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
	// This symbol reads or writes a page-space graph id (a shared() graph, a
	// storage slot). A composing module that instance-scopes it must ask the
	// runtime which space an id belongs to instead of prefixing the path.
	readonly touchesPageSpaceGraph?: true;
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
};

export type CaptureAnalysisArtifact = {
	readonly passId: 'capture-analysis';
	readonly boundResolverRows?: ReadonlyArray<BoundSymbolResolverRow>;
	readonly componentEdgeInstancePaths?: BoundSymbolResolverArtifact['componentEdgeInstancePaths'];
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

// A branch flip whose module this pass refuses to emit, rather than let the payload name it.
export type SymbolModulesDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED'
		| 'MARKLESS_MODULE_INSTANCE_DIVERGENT_HANDLERS'
		| 'MARKLESS_SHARED_METHOD_CROSS_MODULE'
		| 'MARKLESS_SHARED_INSTANCE_EXPORTED_FUNCTION'
		| 'MARKLESS_SHARED_COMPUTED_CROSS_MODULE'
		| 'MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE';
	readonly phase: 'public-render';
	readonly passId: 'symbol-modules';
};

/**
 * A branch this pass could build no arm parts for, whose every refusal was a
 * same-module component that has to run. Rebuilding the markup here is
 * impossible, but re-rendering the page through the prerender evaluator does
 * run the component, so the link pass may fulfill the candidate with an
 * escalation symbol. Until something fulfills it, the refusal beside it stands.
 */
export type ArmEscalationCandidate = {
	readonly branchSiteId: string;
	readonly symbolId: string;
};

export type SymbolModulesArtifact = {
	readonly passId: 'symbol-modules';
	readonly modules: ReadonlyArray<GeneratedSymbolModule>;
	readonly diagnostics: ReadonlyArray<CaptureAnalysisDiagnostic | SymbolModulesDiagnostic>;
	readonly armEscalationCandidates?: ReadonlyArray<ArmEscalationCandidate>;
};

export type RuntimeDemandMapRecordKind =
	| ProtocolEventActionKind
	| 'async-boundary'
	| 'behavior'
	| 'branch'
	| 'dom-update'
	| 'element-handle'
	| 'keyed-repeat'
	| 'overlay';

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
		// The component that declares this claim in the child module. A module
		// publishes one claim manifest for every component it exports, so an edge
		// is offered its siblings' claims too; the owner is what tells them apart.
		readonly ownerComponentName?: string;
		// Why the parent has to bind this row; a widget-callback claim binds the
		// callback slot alone and leaves the child's own captures to the child.
		readonly claimKind?: 'prop-bound' | 'widget-callback';
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
	readonly semanticGraph?: SemanticGraphArtifact;
	readonly source?: Pick<CompileTsrxModuleInput, 'importedModuleInterfaces'>;
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
	readonly contentReads?: NonNullable<
		NonNullable<ProtocolViewPayload['branches']>[number]['contentReads']
	>;
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
		readonly plural?: boolean;
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
	/** SSR entry per exported component, for a module that serves more than one. */
	readonly ssrComponentExports?: ReadonlyArray<{
		readonly exportName: string;
		readonly ssrFunctionName: string;
	}>;
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
		| 'boundSymbolResolver'
		| 'protocolView'
		| 'publicRenderModule'
		| 'semanticGraph'
		| 'symbolModules'
		| 'symbolResolver'
	>;
	readonly link: LinkedInterfaceCompleteness;
	// The linker owns the client-environment gate and virtual module naming, so
	// both arrive as inputs rather than being derived here.
	readonly clientLink: boolean;
	readonly renderDataId: string;
	readonly resolverId: string;
	readonly symbolModuleId: (symbolId: string) => string;
	readonly boundaryExportName: (index: number) => string;
	/**
	 * Names the export for a branch whose arms hold a component that has to run.
	 * A linker that supplies no name fulfills no escalation candidate, so the
	 * refusal the symbol-modules pass recorded beside it stands.
	 */
	readonly branchExportName?: (index: number) => string;
};

export type LinkedBoundarySymbol = {
	readonly row: { readonly id: string; readonly chunk: string; readonly exportName: string };
	// The branch site this symbol fulfilled, for the linker's candidate gate.
	readonly branchSiteId?: string;
	readonly manifest: {
		readonly symbolId: string;
		readonly kind: 'async-boundary-update' | 'branch-update';
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
	// Set only while linking render data that a materialized route root reached:
	// the root every child's render data below is reached from. Absent means the
	// question was never asked, and the pass records no reach at all.
	readonly renderDataReachRoot?: string;
	// Naming stays the caller's here too: the pass asks for the module source a
	// parent imports to reach a child's render data from one route root, and the
	// `?markless-render-data` / `markless-reached-from` id that carries it across
	// the bundler boundary is the caller's transport.
	readonly reachedRenderDataSource?: (source: string, root: string) => string;
};

// One `(root, source)` reach: a child's render data qualified by the route root
// it was reached from, plus the module source a parent imports for it. The pair
// is the linked fact; the id string that transports it is not.
export type RenderDataReachRecord = {
	readonly root: string;
	readonly source: string;
	readonly specifiers: ReadonlyArray<string>;
	readonly moduleSource: string;
};

export type LinkedModuleGraphArtifact = {
	readonly passId: 'module-link';
	readonly children: ReadonlyArray<LinkedModuleChild>;
	readonly interfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly routeArtifacts: Readonly<Record<string, string>>;
	// Keyed by `(root, source)`; empty unless the caller asked for a reach root.
	readonly reachedRenderData: Readonly<Record<string, RenderDataReachRecord>>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

// Delegate children (`delegate-children` link pass): the artifact-child edges a
// module composes, each one classified by what the linker resolved it to rather
// than by where the file sits on disk. `external-delegate` is the only kind a
// linker may load and render at build time; `compiled-tsrx` is this build's own
// work and is never a delegate. The rendering itself is an input, because a
// compiler pass never imports user code.
export type LinkedDelegateChild = {
	readonly edgeId: string;
	readonly componentName: string;
	readonly specifier: string;
	readonly source?: string;
	readonly kind: LinkedModuleChildKind;
	// Whether the linker should load this source and ask it to render.
	readonly loadable: boolean;
};

// One delegate's build-time rendering, keyed by edge id. Produced by the caller
// that owns `import()`; the pass only ever reads it.
export type DelegateRenderings = Readonly<Record<string, ArtifactChildMaterialization>>;

// A delegate whose compiled JavaScript the linker could not import, named by
// the edges it left unrendered so the pass can report the real cause.
export type DelegateImportFailure = {
	readonly source: string;
	readonly edgeIds: ReadonlyArray<string>;
	readonly message: string;
};

export type DelegateChildrenInput = {
	readonly children: ReadonlyArray<LinkedDelegateChild>;
	readonly renderings: DelegateRenderings;
	readonly importFailures?: ReadonlyArray<DelegateImportFailure>;
};

export type LinkedDelegateChildrenArtifact = {
	readonly passId: 'delegate-children';
	readonly children: ReadonlyArray<LinkedDelegateChild>;
	readonly materializations: Readonly<Record<string, ArtifactChildMaterialization>>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

// Either the build-known props a delegate may be rendered with, or the
// diagnostic that says why it may not be. The caller decides whether a
// diagnostic is fatal; the pass never throws.
export type DelegateChildRenderPlan =
	| { readonly ok: true; readonly props: Readonly<Record<string, unknown>> }
	| { readonly ok: false; readonly diagnostic: CompilerDiagnostic };

export type DelegateChildRenderingResult =
	| { readonly ok: true; readonly rendering: ArtifactChildMaterialization }
	| { readonly ok: false; readonly diagnostic: CompilerDiagnostic };

// The compiled outputs a link-stage cache key compares. Structural on purpose:
// the caller's richer transform result flows through unchanged, and the pass
// only ever reads these fields.
export type LinkedCompiledOutputs = {
	readonly interfaceHash: string;
	readonly code: string;
	readonly moduleImports: unknown;
	readonly manifest: unknown;
	readonly virtualModules: ReadonlyArray<{ readonly type: string }>;
};

// The `renderDataModule` artifact (`render-data-module` pass): what one emitted
// render-data module carries as a linkable unit. `contentHash` and
// `styleModules` are serializable on purpose — they are what a published
// component must ship so a consuming app can link its CSS and tell a stale
// render-data module from a fresh one. `claimManifest` always carries an empty
// `symbols`: a data-only facade owns no symbol claims.
export type RenderDataModuleArtifact<Manifest extends LinkedClaimManifest = LinkedClaimManifest> = {
	readonly passId: 'render-data-module';
	readonly source: string;
	readonly emittedModule: string;
	readonly contentHash: string;
	readonly styleModules: ReadonlyArray<string>;
	readonly claimManifest: Manifest;
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

// Linked claims (`claim-manifest` link pass): who owns a source's emitted
// symbol claims, and the merged manifest a consumer of that source reads. The
// manifest shape is structural on purpose — the caller's richer transform
// manifest flows through unchanged, and the pass only ever rewrites `source`,
// `symbols` and `resolver`.
export type LinkedClaimManifest = LinkedSymbolClaimManifest & {
	readonly source: string;
	readonly resolver: { readonly virtualModuleId: string };
};

// Per-build, never serialized: `bySource` is the merged manifest each source
// answers with, `byEmittedModule` the exact owners it was merged from.
export type LinkedClaimsArtifact<Manifest extends LinkedClaimManifest = LinkedClaimManifest> = {
	readonly passId: 'claim-manifest';
	readonly bySource: Readonly<Record<string, Manifest>>;
	readonly byEmittedModule: Readonly<Record<string, Manifest>>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export type LinkedClaimsInput<Manifest extends LinkedClaimManifest = LinkedClaimManifest> = {
	readonly source: string;
	// Virtual module naming is the caller's, so the resolver a source's siblings
	// must share arrives as an id rather than being spelled here.
	readonly resolverId: string;
	readonly claims: ReadonlyArray<Manifest>;
};

export type LinkedSourceClaimMerge<Manifest extends LinkedClaimManifest = LinkedClaimManifest> = {
	readonly manifest: Manifest | undefined;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

// Emitted-id vocabulary the claim rules need. The pass asks these questions
// rather than parsing ids, because how a variant is spelled is the bundler's.
export type LinkedClaimIdNaming = {
	readonly sourcePathOf: (id: string) => string;
	readonly isResumeRequest: (id: string) => boolean;
	readonly isWakeRequest: (id: string) => boolean;
};

export type EmittedClaimOwnershipInput<Manifest extends LinkedClaimManifest = LinkedClaimManifest> =
	{
		readonly source: string;
		readonly emittedModule: string;
		readonly manifest: Manifest;
		// The generated resolver among the modules this transform emitted, when it
		// emitted one.
		readonly resolverModuleId: string | undefined;
		// Whether the resolver this manifest names already holds claims, which is how
		// an ordinary sibling knows a wake variant took its routes.
		readonly wakeOwnsRoutes: boolean;
		// Every emitted module currently holding claims, for displacement.
		readonly claimOwners: ReadonlyArray<string>;
		readonly naming: LinkedClaimIdNaming;
	};

export type EmittedClaimOwnership<Manifest extends LinkedClaimManifest = LinkedClaimManifest> = {
	readonly owner: string;
	readonly manifest: Manifest;
	readonly displacedOwners: ReadonlyArray<string>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export type LinkedResolverClaimVerdict =
	| { readonly action: 'keep-current' | 'replace' }
	| { readonly action: 'diverged'; readonly diagnostic: CompilerDiagnostic };

export type LinkedRouteArtifactRegistration = {
	readonly action: 'already-registered' | 'register' | 'reinvalidate' | 'late';
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

// What one transform request is asking the compiler for. `route-artifact` is a
// client request for the build-time rendering of a route rather than for a
// module a browser loads, which is why it is a kind of its own.
export type TransformRequestKind =
	| 'source'
	| 'resume'
	| 'prerender-wake'
	| 'render-data'
	| 'route-artifact';

// Every field is a plain value the caller already holds. Ids are parsed by the
// caller and arrive here as answered questions, because how a variant is
// spelled in a module id is the bundler's vocabulary, not the compiler's.
export type TransformPlanInput = {
	// Undefined where the host has not resolved an environment for this request;
	// it is neither client nor server, and every client-only decision is off.
	readonly environment: string | undefined;
	// The file this request is about, and the exact id it was requested as.
	readonly source: string;
	readonly requestId: string;
	readonly request: {
		readonly resume: boolean;
		readonly prerenderWake: boolean;
		readonly renderData: boolean;
		readonly routeArtifact: boolean;
		// Whether this id is the source's own primary request rather than one of
		// its query-addressed siblings.
		readonly clientPrimary: boolean;
	};
	readonly options: {
		readonly dev: boolean;
		readonly prerender: boolean;
		readonly prerenderWakeChannel: boolean;
	};
	// Whether this build has already seen a wake-variant entry request.
	readonly hasWakeSources: boolean;
	// Whether a materialized route root reaches this request's render data.
	readonly renderDataReached: boolean;
	// Whether this source is itself a registered client route artifact.
	readonly routeArtifactSource: boolean;
	readonly clientOutput: 'symbols-only' | undefined;
	// Whether the caller can read module-graph facts at all; without them the
	// wake aggregate cannot know which sibling modules exist.
	readonly getModuleInfoAvailable: boolean;
};

export type TransformPlanArtifact = {
	readonly passId: 'transform-plan';
	readonly requestKind: TransformRequestKind;
	// The module identity the claims and artifacts of this request are filed
	// under: a query facade speaks for itself, a primary request for its file.
	readonly manifestSource: string;
	readonly publishesClientClaims: boolean;
	readonly ssrPrerenderArtifacts: boolean;
	readonly prerenderRecords: boolean;
	readonly dev: boolean;
	readonly devResumeReexport: boolean;
	// Opaque: one source requested four different ways compiles four different
	// module shapes, so each shape caches under its own key.
	readonly cacheKey: string;
	// Whether this request must recompile an aggregate variant to own the wake
	// channel's symbol routes.
	readonly aggregateEligible: boolean;
	readonly wakeCapability: (
		manifestHasBrowserTriggers: boolean,
		childHasBrowserTriggers: boolean,
	) => boolean;
};
