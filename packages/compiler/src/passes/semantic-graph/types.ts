import type { AnyNode } from '../../ast/nodes.ts';
import type { SourceSpan } from '../../diagnostics.ts';
import { analyzeModule, type SemanticView } from '../../yuku-tsrx-adapter.ts';
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
	/**
	 * yuku's semantic tables for this file: the scopes, the bindings each scope
	 * declares, and every identifier use resolved to the binding it refers to.
	 * A collector that needs to know whether two identifiers are the same
	 * binding should ask this instead of comparing names, which cannot tell a
	 * shadowed local from the graph state it shadows.
	 *
	 * Analysis is a second pass over the source, so it is deferred: a walk that
	 * never asks never pays for it, and a walk that asks twice pays once.
	 */
	readonly semantic: () => SemanticView;
	readonly graph: MutableSemanticGraphArtifact;
	readonly frameworkApiImports: ReadonlyMap<string, FrameworkApiName>;
	readonly importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly hostIds: WeakMap<object, string>;
	currentComponentName: string | null;
	currentComponentId: string | null;
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
	deferredComputedWrites: DeferredComputedWrite[];
	pendingElementHandleIdrefs: PendingElementHandleIdref[];
	currentHelperCall: HelperStateCallSite | null;
	helperFunctions: Map<string, AnyNode>;
	// `checkbox.root` -> `CheckboxRoot` for module-scope objects that hold
	// components, so a member tag can name the component every pass knows.
	memberTagTargets: Map<string, string>;
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
	/** Component-local binding id per `start:end` of the use that resolves to it. */
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
	/** Overridable so a test can observe when analysis is requested. */
	readonly analyzeSemantics?: (source: string, filename: string) => SemanticView;
}): WalkState {
	const analyzeSemantics = input.analyzeSemantics ?? analyzeModule;
	let semanticView: SemanticView | undefined;
	return {
		filename: input.filename,
		source: input.source,
		semantic: () => (semanticView ??= analyzeSemantics(input.source, input.filename)),
		graph: input.graph,
		frameworkApiImports: input.frameworkApiImports,
		importedModuleInterfaces: input.importedModuleInterfaces ?? {},
		hostIds: new WeakMap<object, string>(),
		currentComponentName: null,
		currentComponentId: null,
		currentBranchScopeIds: [],
		currentKeyedRepeatScopeIds: [],
		currentHostNodeId: null,
		currentTextTarget: null,
		currentAsyncBoundaryId: null,
		currentAsyncBoundaryArm: null,
		currentSharedDefinitionId: null,
		currentCreationSite: null,
		currentFunctionSite: null,
		deferredComputedWrites: [],
		pendingElementHandleIdrefs: [],
		currentHelperCall: null,
		helperFunctions: new Map(),
		memberTagTargets: new Map(),
		styleConstResolver: null,
		pendingComputedDependencies: [],
		componentLocalBindings: new Map(),
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
