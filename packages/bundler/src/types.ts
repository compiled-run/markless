import type {
	ArtifactChildMaterialization,
	ModuleGraphInterfaceArtifact,
	SemanticGraphArtifact,
	SemanticGraphInput,
} from '@markless/compiler';

export type MarklessEnvironment = 'client' | 'server' | 'lib';
export type MarklessClientOutput = 'full' | 'symbols-only';
export type MarklessExecutionLogMode = 'auto' | 'never' | 'always';

export interface MarklessDevServer {
	transformRequest: (url: string, environment: MarklessEnvironment) => Promise<unknown> | unknown;
	invalidateModule?: (id: string, environment: MarklessEnvironment) => boolean;
	// Executes a module through the server environment's pipeline. A dependency
	// shipped as TypeScript source has no other loader: Node refuses to
	// type-strip anything under node_modules.
	importModule?: (source: string) => Promise<unknown>;
}

export interface MarklessRolldownOptions {
	dev?: boolean;
	devInjections?: GlobalInjections[];
	devServer?: MarklessDevServer;
	executionLog?: MarklessExecutionLogMode;
	hmr?: boolean;
	bundleGraphAdders?: Set<BundleGraphAdder>;
	rootDir?: string;
	buildId?: string;
}

export type MarklessVirtualModuleType =
	| 'payload'
	| 'prerender-wake'
	| 'render-data'
	| 'resolver'
	| 'resume'
	| 'settle'
	| 'symbol'
	| 'symbol-bundle'
	| 'trigger-group'
	| 'style';

export type BuiltPrerenderRecords = {
	readonly state: import('@markless/serializer').ProtocolStatePayload;
	readonly view: import('@markless/serializer').ProtocolViewPayload;
};

export interface MarklessVirtualModule {
	id: string;
	type: MarklessVirtualModuleType;
	source: string;
	symbolId?: string;
	exportName?: string;
	canonicalRenderData?: boolean;
	symbolClaims?: ReadonlyArray<string>;
	/** `symbol-bundle` only: the symbol module ids this bundle ships as one chunk. */
	bundledSymbolModuleIds?: ReadonlyArray<string>;
}

export interface TransformTsrxModuleInput {
	filename: string;
	source: string;
	dev?: boolean;
	importedModuleInterfaces?: SemanticGraphInput['importedModuleInterfaces'];
	renderDataImportSources?: Readonly<Record<string, string>>;
	artifactChildMaterializations?: Readonly<Record<string, ArtifactChildMaterialization>>;
	symbols?: import('@markless/compiler').SymbolResolverModuleInput['symbols'];
	devResumeReexport?: boolean;
	buildId?: string;
	environment?: MarklessEnvironment;
	clientOutput?: MarklessClientOutput;
	resumeModuleUrl?: string;
	prerenderWakeModuleUrl?: string;
	settleModuleUrl?: string;
	headInjections?: GlobalInjections[];
	styleModuleUrl?: (virtualModuleId: string) => string;
	executionLog?: MarklessExecutionLogMode;
	executionLogModuleHooks?: boolean;
	inlineResumerDebug?: boolean;
	prerenderRecords?: boolean;
	directCsr?: boolean;
	prerenderWakeVariant?: boolean;
	prerenderWakeFacade?: boolean;
	preserveWakeSiblingClaims?: boolean;
	prerenderRecordData?: BuiltPrerenderRecords;
	runtimeDemandClass?: import('@markless/compiler').RuntimeDemandClass;
}

export interface TransformTsrxModuleResult {
	code: string;
	map: null;
	virtualModules: MarklessVirtualModule[];
	manifest: MarklessTransformManifest;
	moduleGraphInterface: ModuleGraphInterfaceArtifact;
	interfaceHash: string;
	moduleImports: SemanticGraphArtifact['moduleImports'];
	artifactChildren: ReadonlyArray<ArtifactChildCandidate>;
}

export type ArtifactChildCandidate = {
	readonly edgeId: string;
	readonly componentName: string;
	readonly importSource: string;
	readonly importKind: 'default' | 'named' | 'namespace';
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

export type MarklessModuleLinkArtifact = Pick<
	TransformTsrxModuleResult,
	'interfaceHash' | 'moduleGraphInterface' | 'moduleImports'
>;

export interface MarklessTransformManifest {
	source: string;
	captureMetadata?: import('@markless/compiler').CaptureAnalysisArtifact;
	symbolRoutes?: ReadonlyArray<{
		readonly prefix: string;
		readonly importSource: string;
		readonly componentEdgeId?: string;
	}>;
	payload: MarklessBuildModuleReference;
	resolver: MarklessBuildModuleReference;
	symbols: MarklessSymbolManifestEntry[];
	runtimeDemandMap?: RuntimeDemandMapManifest;
}

export interface MarklessBuildModuleReference {
	virtualModuleId: string;
	fileName?: string;
}

export interface MarklessSymbolManifestEntry extends MarklessBuildModuleReference {
	symbolId: string;
	exportName: string;
	kind: string;
}

export type RuntimeDemandMapManifest = Omit<
	import('@markless/compiler').RuntimeDemandMapArtifact,
	'passId'
>;

export interface MarklessBuildMetadata {
	version: number;
	modules: MarklessTransformManifest[];
	bundles: Record<string, MarklessBundle>;
	assets?: Record<string, MarklessAsset>;
	bundleGraph?: MarklessBundleGraph;
	bundleGraphAsset?: string;
	injections?: GlobalInjections[];
}

export type MarklessManifest = MarklessBuildMetadata;

export interface MarklessBundle {
	size: number;
	total: number;
	symbols?: string[];
	imports?: string[];
	dynamicImports?: string[];
	origins?: string[];
}

export type MarklessAsset = {
	name: string | undefined;
	size: number;
};

export type GlobalInjections = {
	tag: string;
	attributes?: Record<string, string>;
	children?: string;
	location: 'head' | 'body';
};

export type MarklessBundleGraph = Array<string | number>;

export type PreloadGraphEntries = Record<string, { imports?: string[]; dynamicImports?: string[] }>;

export interface PreloadGraphContext {
	readonly manifest: MarklessBuildMetadata;
	readonly hasBundle: (bundleName: string) => boolean;
	readonly bundlesForOrigins: (origins: readonly string[]) => string[];
}

export type PreloadGraphEntriesAdder = (
	context: PreloadGraphContext,
) => PreloadGraphEntries | undefined;

export type BundleGraphAdder = (manifest: MarklessBuildMetadata) => PreloadGraphEntries | undefined;

export type MarklessRolldownPluginApi = {
	invalidateGeneratedModules: (
		parent: string,
		environment?: MarklessEnvironment,
		nextSource?: string,
	) => string[] | Promise<string[]>;
};
