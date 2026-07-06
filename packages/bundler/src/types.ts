export type MarklessEnvironment = 'client' | 'server' | 'lib';
export type MarklessClientOutput = 'full' | 'symbols-only';
export type MarklessExecutionLogMode = 'auto' | 'never' | 'always';

export interface MarklessDevServer {
	transformRequest: (url: string, environment: MarklessEnvironment) => Promise<unknown> | unknown;
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

export type MarklessVirtualModuleType = 'payload' | 'resolver' | 'resume' | 'symbol' | 'style';

export interface MarklessVirtualModule {
	id: string;
	type: MarklessVirtualModuleType;
	source: string;
	symbolId?: string;
	exportName?: string;
}

export interface TransformTsrxModuleInput {
	filename: string;
	source: string;
	devResumeReexport?: boolean;
	buildId?: string;
	environment?: MarklessEnvironment;
	clientOutput?: MarklessClientOutput;
	resumeModuleUrl?: string;
	headInjections?: GlobalInjections[];
	executionLog?: MarklessExecutionLogMode;
	executionLogModuleHooks?: boolean;
}

export interface TransformTsrxModuleResult {
	code: string;
	map: null;
	virtualModules: MarklessVirtualModule[];
	manifest: MarklessTransformManifest;
}

export interface MarklessTransformManifest {
	source: string;
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

export type RuntimeDemandMapManifest = Omit<import('@markless/compiler').RuntimeDemandMapArtifact, 'passId'>;

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
	invalidateGeneratedModules: (parent: string, environment?: MarklessEnvironment) => string[];
};
