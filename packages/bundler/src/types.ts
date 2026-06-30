export type ArcadeEnvironment = 'client' | 'server' | 'lib';
export type ArcadeClientOutput = 'full' | 'symbols-only';

export interface ArcadeDevServer {
	transformRequest: (url: string, environment: ArcadeEnvironment) => Promise<unknown> | unknown;
}

export interface ArcadeRolldownOptions {
	dev?: boolean;
	devInjections?: GlobalInjections[];
	devServer?: ArcadeDevServer;
	hmr?: boolean;
	bundleGraphAdders?: Set<BundleGraphAdder>;
	onManifest?: (manifest: ArcadeBuildMetadata) => void;
	emitManifestJson?: boolean;
	rootDir?: string;
	buildId?: string;
}

export type ArcadeVirtualModuleType = 'payload' | 'resolver' | 'symbol';

export interface ArcadeVirtualModule {
	id: string;
	type: ArcadeVirtualModuleType;
	source: string;
	symbolId?: string;
	exportName?: string;
}

export interface TransformTsrxModuleInput {
	filename: string;
	source: string;
	buildId?: string;
	environment?: ArcadeEnvironment;
	clientOutput?: ArcadeClientOutput;
	resumeModuleUrl?: string;
}

export interface TransformTsrxModuleResult {
	code: string;
	map: null;
	virtualModules: ArcadeVirtualModule[];
	manifest: ArcadeTransformManifest;
}

export interface ArcadeTransformManifest {
	source: string;
	payload: ArcadeBuildModuleReference;
	resolver: ArcadeBuildModuleReference;
	symbols: ArcadeSymbolManifestEntry[];
}

export interface ArcadeBuildModuleReference {
	virtualModuleId: string;
	fileName?: string;
}

export interface ArcadeSymbolManifestEntry extends ArcadeBuildModuleReference {
	symbolId: string;
	exportName: string;
	kind: string;
}

export interface ArcadeBuildMetadata {
	version: number;
	modules: ArcadeTransformManifest[];
	bundles: Record<string, ArcadeBundle>;
	assets?: Record<string, ArcadeAsset>;
	bundleGraph?: ArcadeBundleGraph;
	bundleGraphAsset?: string;
	injections?: GlobalInjections[];
}

export type ArcadeManifest = ArcadeBuildMetadata;

export interface ArcadeBundle {
	size: number;
	total: number;
	symbols?: string[];
	imports?: string[];
	dynamicImports?: string[];
	origins?: string[];
}

export type ArcadeAsset = {
	name: string | undefined;
	size: number;
};

export type GlobalInjections = {
	tag: string;
	attributes?: Record<string, string>;
	location: 'head' | 'body';
};

export type ArcadeBundleGraph = Array<string | number>;

export type PreloadGraphEntries = Record<string, { imports?: string[]; dynamicImports?: string[] }>;

export interface PreloadGraphContext {
	readonly manifest: ArcadeBuildMetadata;
	readonly hasBundle: (bundleName: string) => boolean;
	readonly bundlesForOrigins: (origins: readonly string[]) => string[];
}

export type PreloadGraphEntriesAdder = (
	context: PreloadGraphContext,
) => PreloadGraphEntries | undefined;

export type BundleGraphAdder = (manifest: ArcadeBuildMetadata) => PreloadGraphEntries | undefined;

export type ArcadeRolldownPluginApi = {
	invalidateGeneratedModules: (parent: string, environment?: ArcadeEnvironment) => string[];
};
