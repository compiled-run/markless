import type { AnyNode } from '../../ast/nodes.ts';
import type { SourceSpan } from '../../diagnostics.ts';
import type {
	SemanticComponent,
	SemanticComponentPropDeclaration,
	SemanticComponentEdge,
	SemanticBehavior,
	SemanticElementHandleBinding,
	SemanticElementHandleIdref,
	SemanticEvent,
	SemanticGraphAlias,
	SemanticGraphBinding,
	SemanticGraphDiagnostic,
	ModuleGraphInterfaceArtifact,
	SemanticModuleImport,
	SemanticSharedDefinition,
	SemanticSharedInstance,
	SemanticSyncPolicyConstant,
	SemanticHostNode,
	SemanticKeyedRepeat,
	SemanticLocalBinding,
	SemanticLocalDeclaration,
	SemanticMarkupArtifact,
	SemanticOverlay,
	SemanticBranchSite,
	SemanticStateRead,
	SemanticStateWrite,
	SemanticTemplateBindingTarget,
	SemanticTemplateRead,
} from '../../artifacts.ts';
import type { FrameworkApiName } from './imports.ts';
import type { StyleConstResolver } from './style-object.ts';

export type MutableSemanticGraphArtifact = {
	passId: 'tsrx-semantic-graph';
	filename: string;
	components: SemanticComponent[];
	componentPropBindings: SemanticComponentPropDeclaration[];
	componentEdges: SemanticComponentEdge[];
	moduleImports: SemanticModuleImport[];
	graphBindings: SemanticGraphBinding[];
	sharedDefinitions: SemanticSharedDefinition[];
	sharedInstances: SemanticSharedInstance[];
	hostNodes: SemanticHostNode[];
	keyedRepeats: SemanticKeyedRepeat[];
	events: SemanticEvent[];
	syncPolicyConstants: SemanticSyncPolicyConstant[];
	behaviors: SemanticBehavior[];
	overlays: SemanticOverlay[];
	elementHandleBindings: SemanticElementHandleBinding[];
	elementHandleIdrefs: SemanticElementHandleIdref[];
	localBindings: SemanticLocalBinding[];
	localDeclarations: SemanticLocalDeclaration[];
	aliases: SemanticGraphAlias[];
	stateReads: SemanticStateRead[];
	templateReads: SemanticTemplateRead[];
	stateWrites: SemanticStateWrite[];
	asyncBoundaries: Array<{
		readonly id: string;
		readonly anchorOrder: number;
		readonly parentBoundaryId?: string;
	}>;
	branchSites: SemanticBranchSite[];
	markup: SemanticMarkupArtifact;
	diagnostics: SemanticGraphDiagnostic[];
	moduleGraphInterface: ModuleGraphInterfaceArtifact;
};

/**
 * An IDREF reference seen during the walk, before the graph knows whether its
 * handle is ever bound. `boundHostNodeId` is exactly what the walk cannot know
 * yet - `el={handle}` may appear later in the file - so it is missing here and
 * supplied by the resolution pass, which is also where a never-bound handle
 * becomes an error instead of a record.
 */
export type PendingElementHandleIdref = Omit<
	SemanticElementHandleIdref,
	'boundHostNodeId' | 'order'
>;

export type WalkState = {
	readonly filename: string;
	readonly source: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly frameworkApiImports: ReadonlyMap<string, FrameworkApiName>;
	readonly importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly hostIds: WeakMap<object, string>;
	currentComponentName: string | null;
	currentComponentId: string | null;
	shadowedBindingNames: Set<string>;
	currentBranchScopeIds: string[];
	currentKeyedRepeatScopeIds: string[];
	currentHostNodeId: string | null;
	currentTextTarget: SemanticTemplateBindingTarget | null;
	currentAsyncBoundaryId: string | null;
	// Arm index inside the current boundary: 0 = @try, 1 = @pending, 2 = @catch.
	currentAsyncBoundaryArm: number | null;
	currentSharedDefinitionId: string | null;
	currentCreationSite: 'computed' | 'handler' | 'helper' | 'branch' | 'loop' | null;
	currentFunctionSite: 'computed' | 'handler' | 'helper' | null;
	// Names bound by the computed body currently being walked. They shadow any
	// graph binding of the same name, so a write to one is never a graph write.
	computedBodyLocalNames: ReadonlySet<string> | null;
	deferredComputedWrites: DeferredComputedWrite[];
	pendingElementHandleIdrefs: PendingElementHandleIdref[];
	currentHelperCall: HelperStateCallSite | null;
	helperFunctions: Map<string, AnyNode>;
	// Lazily created once per file: style attributes that reference same-file
	// consts resolve through it.
	styleConstResolver: StyleConstResolver | null;
	pendingComputedDependencies: Array<{
		readonly graphNodeId: string;
		readonly body: AnyNode | undefined;
		readonly sharedDefinitionId: string | null;
	}>;
	componentLocalBindings: Map<
		string,
		{
			readonly declaration: SemanticLocalDeclaration;
			readonly initializerNode?: AnyNode;
		}
	>;
	resolvedComponentLocalBindingIds: WeakMap<object, string>;
	resolvedComponentLocalBindingsBySpan: Map<string, string>;
	walk: SemanticGraphWalk | null;
	nextComponentEdgeId: number;
	nextBranchId: number;
	nextHostId: number;
	nextEventId: number;
	nextBoundaryId: number;
	nextBranchSiteId: number;
	nextAnchorOrder: number;
};

// A write recorded inside a computed body whose target has not yet been proven
// to be graph state. Resolved after the walk, when every graph binding exists.
export type DeferredComputedWrite = {
	readonly writeIndex: number;
	readonly targetSource: string;
	readonly diagnosticInput: {
		readonly source: string;
		readonly target: string;
		readonly targetSpan?: SourceSpan;
		readonly filename: string;
	};
	readonly sharedDefinitionId: string | null;
	readonly componentName: string | null;
};

export type SemanticGraphWalk = (node: AnyNode | null | undefined, state: WalkState) => void;

export function createMutableSemanticGraphArtifact(filename: string): MutableSemanticGraphArtifact {
	return {
		passId: 'tsrx-semantic-graph',
		filename,
		components: [],
		componentPropBindings: [],
		componentEdges: [],
		moduleImports: [],
		graphBindings: [],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		keyedRepeats: [],
		events: [],
		syncPolicyConstants: [],
		behaviors: [],
		overlays: [],
		elementHandleBindings: [],
		elementHandleIdrefs: [],
		localBindings: [],
		localDeclarations: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [],
		asyncBoundaries: [],
		branchSites: [],
		markup: { root: null, chunks: [] },
		moduleGraphInterface: {
			passId: 'module-graph-interface',
			filename,
			exports: [],
			render: { version: 1, components: [] },
		},
		diagnostics: [],
	};
}

export function createWalkState(input: {
	readonly filename: string;
	readonly source: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly frameworkApiImports: ReadonlyMap<string, FrameworkApiName>;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): WalkState {
	return {
		filename: input.filename,
		source: input.source,
		graph: input.graph,
		frameworkApiImports: input.frameworkApiImports,
		importedModuleInterfaces: input.importedModuleInterfaces ?? {},
		hostIds: new WeakMap<object, string>(),
		currentComponentName: null,
		currentComponentId: null,
		shadowedBindingNames: new Set(),
		currentBranchScopeIds: [],
		currentKeyedRepeatScopeIds: [],
		currentHostNodeId: null,
		currentTextTarget: null,
		currentAsyncBoundaryId: null,
		currentAsyncBoundaryArm: null,
		currentSharedDefinitionId: null,
		currentCreationSite: null,
		currentFunctionSite: null,
		computedBodyLocalNames: null,
		deferredComputedWrites: [],
		pendingElementHandleIdrefs: [],
		currentHelperCall: null,
		helperFunctions: new Map(),
		styleConstResolver: null,
		pendingComputedDependencies: [],
		componentLocalBindings: new Map(),
		resolvedComponentLocalBindingIds: new WeakMap<object, string>(),
		resolvedComponentLocalBindingsBySpan: new Map(),
		walk: null,
		nextComponentEdgeId: 0,
		nextBranchId: 0,
		nextHostId: 0,
		nextEventId: 0,
		nextBoundaryId: 0,
		nextBranchSiteId: 0,
		nextAnchorOrder: 0,
	};
}

export type ModuleScopeDeclarationNode = AnyNode;

export type HelperStateCallSite = {
	readonly componentName: string;
	readonly localName: string;
	readonly helperName: string;
};
