import type { AnyNode } from '../../ast/nodes.ts';
import type {
	SemanticComponent,
	SemanticComponentEdge,
	SemanticBehavior,
	SemanticElementHandleBinding,
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
	SemanticStateRead,
	SemanticStateWrite,
	SemanticTemplateBindingTarget,
	SemanticTemplateRead,
} from '../../artifacts.ts';
import type { FrameworkApiName } from './imports.ts';

export type MutableSemanticGraphArtifact = {
	passId: 'tsrx-semantic-graph';
	filename: string;
	components: SemanticComponent[];
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
	elementHandleBindings: SemanticElementHandleBinding[];
	localBindings: SemanticLocalBinding[];
	localDeclarations: SemanticLocalDeclaration[];
	aliases: SemanticGraphAlias[];
	stateReads: SemanticStateRead[];
	templateReads: SemanticTemplateRead[];
	stateWrites: SemanticStateWrite[];
	asyncBoundaries: Array<{ readonly id: string }>;
	diagnostics: SemanticGraphDiagnostic[];
	moduleGraphInterface: ModuleGraphInterfaceArtifact;
};

export type WalkState = {
	readonly filename: string;
	readonly source: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly frameworkApiImports: ReadonlyMap<string, FrameworkApiName>;
	readonly importedModuleInterfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
	readonly hostIds: WeakMap<object, string>;
	currentComponentName: string | null;
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
	currentHelperCall: HelperStateCallSite | null;
	helperFunctions: Map<string, AnyNode>;
	walk: SemanticGraphWalk | null;
	nextComponentEdgeId: number;
	nextBranchId: number;
	nextHostId: number;
	nextEventId: number;
	nextBoundaryId: number;
	nextBranchSiteId: number;
	nextAnchorOrder: number;
};

export type SemanticGraphWalk = (node: AnyNode | null | undefined, state: WalkState) => void;

export function createMutableSemanticGraphArtifact(filename: string): MutableSemanticGraphArtifact {
	return {
		passId: 'tsrx-semantic-graph',
		filename,
		components: [],
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
		elementHandleBindings: [],
		localBindings: [],
		localDeclarations: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [],
		asyncBoundaries: [],
		branchSites: [],
		moduleGraphInterface: {
			passId: 'module-graph-interface',
			filename,
			exports: [],
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
		currentBranchScopeIds: [],
		currentKeyedRepeatScopeIds: [],
		currentHostNodeId: null,
		currentTextTarget: null,
		currentAsyncBoundaryId: null,
		currentAsyncBoundaryArm: null,
		currentSharedDefinitionId: null,
		currentCreationSite: null,
		currentFunctionSite: null,
		currentHelperCall: null,
		helperFunctions: new Map(),
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
