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
	/**
	 * Packs a client production build's lazily loaded modules into a few chunks instead of one
	 * chunk per module, cut by what each route's page load, first interactions and navigation
	 * need, so a page preloads what its first interactions run in one round and nothing waits on a
	 * waterfall. On by default; `false` ships one chunk per module. Dev builds are never packed.
	 */
	packing?: boolean;
	/** @deprecated Packing is on by default. Remove the option, or use `packing: false` to opt out. */
	experimentalNativePacking?: boolean;
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
	// `export *` of the render data: every lazy import names this, every static import the render data.
	| 'render-data-entry'
	| 'resolver'
	| 'resume'
	| 'settle'
	| 'symbol'
	// `export *` of a symbol module that render data imports statically: loaders `import()` this instead.
	| 'symbol-entry'
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
	/** Symbols and resolvers may resolve during linking, but never serve first-pass code. */
	provisional?: boolean;
}

export interface TransformTsrxModuleInput {
	experimentalNativePacking?: boolean;
	filename: string;
	/** Root-relative id the compiler spells every minted id from; defaults to `filename`. */
	moduleId?: string;
	source: string;
	dev?: boolean;
	importedModuleInterfaces?: SemanticGraphInput['importedModuleInterfaces'];
	importedModuleConstants?: SemanticGraphInput['importedModuleConstants'];
	renderDataImportSources?: Readonly<Record<string, string>>;
	artifactChildMaterializations?: Readonly<Record<string, ArtifactChildMaterialization>>;
	symbols?: import('@markless/compiler').SymbolResolverModuleInput['symbols'];
	devResumeReexport?: boolean;
	buildId?: string;
	environment?: MarklessEnvironment;
	clientOutput?: MarklessClientOutput;
	includeScalarActionPlans?: boolean;
	resumeModuleUrl?: string;
	prerenderWakeModuleUrl?: string;
	settleModuleUrl?: string;
	headInjections?: GlobalInjections[];
	styleModuleUrl?: (virtualModuleId: string) => string;
	/** Scoped-style modules of the linked children, so a dev page links its whole tree. */
	linkedStyleModuleIds?: readonly string[];
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
	// A client module served as a payload document: a conservative demand class still runs
	// plain-ssr scalar plans, resolved only through served locators.
	servedScalarPlans?: boolean;
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
	/** Imported constants a prop reads that this compile was not given. */
	importedConstantRequests?: ReadonlyArray<{
		readonly source: string;
		readonly exportName: string;
	}>;
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
> & {
	/** The module composes a child this build did not compile, so only its reached render data is canonical. */
	readonly delegateChildren?: boolean;
};

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
	/** Whether client chunks import each other through specifiers that the document's import map resolves. */
	chunkImportMap: () => boolean;
	/** A plugin that writes every document the app serves turns chunk import maps on. */
	enableChunkImportMap: () => void;
	invalidateGeneratedModules: (
		parent: string,
		environment?: MarklessEnvironment,
		nextSource?: string,
	) => string[] | Promise<string[]>;
	runtimeDemandMaps: () => Iterable<RuntimeDemandMapManifest | undefined>;
	runtimeDemandSources: () => Iterable<{
		readonly source: string;
		readonly map: RuntimeDemandMapManifest | undefined;
	}>;
};
