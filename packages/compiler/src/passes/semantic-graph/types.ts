import type { AnyNode } from '../../ast/nodes.ts';
import type {
	SemanticComponent,
	SemanticBehavior,
	SemanticElementHandleBinding,
	SemanticEvent,
	SemanticGraphAlias,
	SemanticGraphBinding,
	SemanticGraphDiagnostic,
	SemanticModuleImport,
	SemanticSharedDefinition,
	SemanticSharedInstance,
	SemanticSyncPolicyConstant,
	SemanticHostNode,
	SemanticLocalBinding,
	SemanticStateRead,
	SemanticTemplateNode,
	SemanticStateWrite,
	SemanticTemplateRead,
	SemanticTemplateRoot,
} from '../../artifacts.ts';
import type { FrameworkApiName } from './imports.ts';

export type MutableSemanticGraphArtifact = {
	passId: 'tsrx-semantic-graph';
	filename: string;
	components: SemanticComponent[];
	moduleImports: SemanticModuleImport[];
	graphBindings: SemanticGraphBinding[];
	sharedDefinitions: SemanticSharedDefinition[];
	sharedInstances: SemanticSharedInstance[];
	hostNodes: SemanticHostNode[];
	events: SemanticEvent[];
	syncPolicyConstants: SemanticSyncPolicyConstant[];
	behaviors: SemanticBehavior[];
	elementHandleBindings: SemanticElementHandleBinding[];
	localBindings: SemanticLocalBinding[];
	aliases: SemanticGraphAlias[];
	stateReads: SemanticStateRead[];
	templateReads: SemanticTemplateRead[];
	templateRoots: SemanticTemplateRoot[];
	templateNodes: SemanticTemplateNode[];
	stateWrites: SemanticStateWrite[];
	asyncBoundaries: Array<{ readonly id: string }>;
	diagnostics: SemanticGraphDiagnostic[];
};

export type WalkState = {
	readonly filename: string;
	readonly source: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly frameworkApiImports: ReadonlyMap<string, FrameworkApiName>;
	readonly hostIds: WeakMap<object, string>;
	currentHostNodeId: string | null;
	currentTemplateElementId: string | null;
	currentTemplateParentId: string | null;
	currentComponentName: string | null;
	currentAsyncBoundaryId: string | null;
	currentSharedDefinitionId: string | null;
	nextHostId: number;
	nextEventId: number;
	nextTemplateId: number;
	nextBoundaryId: number;
};

export type SemanticGraphWalk = (node: AnyNode | null | undefined, state: WalkState) => void;

export function createMutableSemanticGraphArtifact(filename: string): MutableSemanticGraphArtifact {
	return {
		passId: 'tsrx-semantic-graph',
		filename,
		components: [],
		moduleImports: [],
		graphBindings: [],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		events: [],
		syncPolicyConstants: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		templateRoots: [],
		templateNodes: [],
		stateWrites: [],
		asyncBoundaries: [],
		diagnostics: [],
	};
}

export function createWalkState(input: {
	readonly filename: string;
	readonly source: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly frameworkApiImports: ReadonlyMap<string, FrameworkApiName>;
}): WalkState {
	return {
		filename: input.filename,
		source: input.source,
		graph: input.graph,
		frameworkApiImports: input.frameworkApiImports,
		hostIds: new WeakMap<object, string>(),
		currentHostNodeId: null,
		currentTemplateElementId: null,
		currentTemplateParentId: null,
		currentComponentName: null,
		currentAsyncBoundaryId: null,
		currentSharedDefinitionId: null,
		nextHostId: 0,
		nextEventId: 0,
		nextTemplateId: 0,
		nextBoundaryId: 0,
	};
}

export type ModuleScopeDeclarationNode = AnyNode;
