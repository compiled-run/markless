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
	SemanticKeyedRepeat,
	SemanticLocalBinding,
	SemanticStateRead,
	SemanticStateWrite,
	SemanticTemplateRead,
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
	keyedRepeats: SemanticKeyedRepeat[];
	events: SemanticEvent[];
	syncPolicyConstants: SemanticSyncPolicyConstant[];
	behaviors: SemanticBehavior[];
	elementHandleBindings: SemanticElementHandleBinding[];
	localBindings: SemanticLocalBinding[];
	aliases: SemanticGraphAlias[];
	stateReads: SemanticStateRead[];
	templateReads: SemanticTemplateRead[];
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
	currentAsyncBoundaryId: string | null;
	currentSharedDefinitionId: string | null;
	nextHostId: number;
	nextEventId: number;
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
		keyedRepeats: [],
		events: [],
		syncPolicyConstants: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
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
		currentAsyncBoundaryId: null,
		currentSharedDefinitionId: null,
		nextHostId: 0,
		nextEventId: 0,
		nextBoundaryId: 0,
	};
}

export type ModuleScopeDeclarationNode = AnyNode;
