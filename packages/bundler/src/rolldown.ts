import type { InputOptions, Plugin } from 'rolldown';
import { parsePath } from 'ufo';
import { ARCADE_BUILD_PREFIX, outputDefaults } from './build/chunking.ts';
import {
	ARCADE_MANIFEST,
	ARCADE_MANIFEST_FILE,
	createManifest,
	devTagsManifest,
	injectManifest,
} from './build/manifest.ts';
import { rewriteGeneratedSymbolFacadeImports } from './build/symbol-facade-cleanup.ts';
import { rewriteGeneratedSymbolTableUrls } from './build/symbol-table.ts';
import { createArcadeDevGraph } from './dev.ts';
import {
	bundlerTsrxSourceFileWithQueryMatcher,
	bundlerVitePreloadHelperMatcher,
} from './source-patterns.ts';
import { ARCADE_VIRTUAL_PREFIX, transformTsrxModule } from './transform.ts';
import type {
	ArcadeEnvironment,
	ArcadeManifest,
	ArcadeRolldownOptions,
	ArcadeRolldownPluginApi,
	ArcadeTransformManifest,
	ArcadeVirtualModule,
	ServerArcadeManifest,
	TransformTsrxModuleResult,
} from './types.ts';

export type {
	GlobalInjections,
	ArcadeAsset,
	ArcadeBundle,
	ArcadeBundleGraph,
	ArcadeDevServer,
	ArcadeEnvironment,
	ArcadeManifest,
	ArcadeRolldownOptions,
	ArcadeRolldownPluginApi,
	ArcadeTransformManifest,
	ArcadeVirtualModule,
	ServerArcadeManifest,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';

type Environment = ArcadeEnvironment | ((context: unknown) => ArcadeEnvironment);
export type ArcadeRolldownPlugin = Plugin & { api: ArcadeRolldownPluginApi };
type InternalArcadeRolldownOptions = ArcadeRolldownOptions & {
	publicPath?: (fileName: string) => string;
};

const manifests = new Map<string, ArcadeManifest>();
const tsrxSourceFileWithQueryMatcher = bundlerTsrxSourceFileWithQueryMatcher;
const vitePreloadHelperMatcher = bundlerVitePreloadHelperMatcher;
const arcadeVitePreloadIdentityHelperSource = [
	'export const __vitePreload = (baseModule) => baseModule();',
	'export const init_preload_helper = () => {};',
	'',
].join('\n');

export const arcadeClient = (options: ArcadeRolldownOptions = {}) =>
	createArcadeRolldownPlugin({ environment: 'client', options });
export const arcadeServer = (options: ArcadeRolldownOptions = {}) =>
	createArcadeRolldownPlugin({ environment: 'server', options });
export const arcadeLib = (options: ArcadeRolldownOptions = {}) =>
	createArcadeRolldownPlugin({ environment: 'lib', options });

export function createArcadeRolldownPlugin(input: {
	environment: Environment;
	options?: ArcadeRolldownOptions;
}): ArcadeRolldownPlugin {
	const environment = input.environment;
	const internalOptions = (input.options ?? {}) as InternalArcadeRolldownOptions;
	const virtualModules = new Map<string, ArcadeVirtualModule>();
	const transformManifests = new Map<string, ArcadeTransformManifest>();
	const sourceVirtualModules = new Map<string, Set<string>>();
	const dev = createArcadeDevGraph();
	let manifest: ArcadeManifest | ServerArcadeManifest | null = null;
	let root = internalOptions.rootDir;
	const name = pluginName(environment);

	function getEnvironment(context: unknown) {
		if (typeof environment === 'function') {
			return environment(context);
		}

		return environment;
	}

	function getRoot() {
		return root ?? internalOptions.rootDir;
	}

	const plugin = {
		api: {
			invalidateGeneratedModules(parent: string, currentEnvironment?: ArcadeEnvironment) {
				const ids = dev.clear(parent, currentEnvironment);
				for (const id of ids) {
					virtualModules.delete(id);
				}
				return ids.map(resolveVirtualId);
			},
		},
		name,
		options(input: InputOptions) {
			const currentEnvironment = getEnvironment(this);
			if (currentEnvironment !== 'client') {
				return input;
			}

			return {
				...input,
				preserveEntrySignatures: input.preserveEntrySignatures ?? 'allow-extension',
			};
		},
		async buildStart(input) {
			if (!root) {
				root = internalOptions.rootDir ?? input.cwd;
			}
			virtualModules.clear();
			transformManifests.clear();
			sourceVirtualModules.clear();
			dev.reset();

			const currentRoot = getRoot();
			manifest = null;
			if (currentRoot) {
				manifest = manifests.get(currentRoot) ?? null;
			}
		},
		outputOptions(output) {
			return outputDefaults(output, getEnvironment(this));
		},
		resolveId(source) {
			const normalized = normalizeVirtualId(source);
			if (virtualModules.has(normalized)) {
				return { id: resolveVirtualId(normalized), moduleSideEffects: true };
			}
			return null;
		},
		load(id) {
			const virtualId = normalizeVirtualId(id);
			if (vitePreloadHelperMatcher.test(virtualId)) {
				return arcadeVitePreloadIdentityHelperSource;
			}

			const module = virtualModules.get(virtualId);
			if (module) {
				return module.source;
			}
			return null;
		},
		async transform(code, id) {
			const currentEnvironment = getEnvironment(this);
			const virtualId = normalizeVirtualId(id);
			if (!tsrxSourceFileWithQueryMatcher.test(id)) {
				return null;
			}
			if (virtualId.startsWith(ARCADE_VIRTUAL_PREFIX)) {
				return null;
			}
			const source = pathname(id);
			clearSourceVirtualModules(source, virtualModules, sourceVirtualModules);
			const transformed = await transformTsrxModule({
				filename: source,
				source: code,
				buildId: internalOptions.buildId,
				symbolRuntimeUrl:
					currentEnvironment === 'client' && internalOptions.dev
						? (virtualModuleId) =>
								devVirtualModuleUrl(virtualModuleId, internalOptions.publicPath)
						: undefined,
			});
			registerTransformArtifacts({
				source,
				result: transformed,
				virtualModules,
				transformManifests,
				sourceVirtualModules,
				dev,
				environment: currentEnvironment,
			});

			if (currentEnvironment === 'client' && !internalOptions.dev) {
				for (const module of transformed.virtualModules.filter(
					(item) => item.type === 'symbol',
				)) {
					this.emitFile({
						type: 'chunk',
						id: module.id,
						preserveSignature: 'strict',
					});
				}
			}

			if (currentEnvironment === 'server') {
				let serverManifest = manifest;
				if (
					!serverManifest &&
					internalOptions.dev &&
					internalOptions.devInjections?.length
				) {
					serverManifest = devTagsManifest(internalOptions.devInjections);
				}
				return {
					code: injectManifest(transformed.code, serverManifest),
					map: transformed.map,
				};
			}

			return transformed;
		},
		generateBundle: {
			order: 'post',
			handler(_, bundle) {
				if (getEnvironment(this) !== 'client') return;

				const removedSymbolFacades = rewriteGeneratedSymbolFacadeImports(bundle);
				const manifestBundle = bundleWithoutRemovedChunks(bundle, removedSymbolFacades);
				const tableRewrite = rewriteGeneratedSymbolTableUrls(manifestBundle);
				if (tableRewrite.unresolved.length > 0) {
					this.error(
						`Arcade symbol resolver table contains unresolved generated symbol chunks: ${tableRewrite.unresolved.join(', ')}`,
					);
				}

				const clientManifest = createManifest(
					manifestBundle,
					transformManifests.values(),
					getRoot(),
					{
						canonPath: stripBuildPrefix,
						publicPath: internalOptions.publicPath,
						injections: internalOptions.devInjections,
					},
				);
				manifest = clientManifest;
				const currentRoot = getRoot();
				if (currentRoot) {
					manifests.set(currentRoot, clientManifest);
				}
				internalOptions.onManifest?.(clientManifest);

				if (internalOptions.emitManifestJson === true) {
					this.emitFile({
						type: 'asset',
						fileName: ARCADE_MANIFEST_FILE,
						source: JSON.stringify(clientManifest, null, '\t'),
					});
				}
			},
		},
	} satisfies Plugin & { api: ArcadeRolldownPluginApi };

	return plugin;
}

function bundleWithoutRemovedChunks(
	bundle: Record<string, unknown>,
	removedFileNames: ReadonlySet<string>,
) {
	if (removedFileNames.size === 0) return bundle;

	const next: Record<string, unknown> = {};
	for (const [key, output] of Object.entries(bundle)) {
		if (isChunkFile(output) && removedFileNames.has(output.fileName)) continue;
		next[key] = output;
	}
	return next;
}

function isChunkFile(output: unknown): output is {
	readonly type: 'chunk';
	readonly fileName: string;
} {
	if (!output || typeof output !== 'object') return false;
	const chunk = output as {
		readonly type?: unknown;
		readonly fileName?: unknown;
	};
	return chunk.type === 'chunk' && typeof chunk.fileName === 'string';
}

function pluginName(environment: Environment) {
	if (typeof environment === 'function') {
		return 'arcade:rolldown';
	}

	return `arcade:rolldown:${environment}`;
}

function registerTransformArtifacts(input: {
	source: string;
	result: TransformTsrxModuleResult;
	virtualModules: Map<string, ArcadeVirtualModule>;
	transformManifests: Map<string, ArcadeTransformManifest>;
	sourceVirtualModules: Map<string, Set<string>>;
	dev: ReturnType<typeof createArcadeDevGraph>;
	environment: ArcadeEnvironment;
}) {
	const ids = new Set<string>();
	for (const module of input.result.virtualModules) {
		input.virtualModules.set(module.id, module);
		ids.add(module.id);
	}
	input.transformManifests.set(input.source, input.result.manifest);
	input.sourceVirtualModules.set(input.source, ids);
	input.dev.record(input.source, ids, input.environment);
}

function clearSourceVirtualModules(
	source: string,
	virtualModules: Map<string, ArcadeVirtualModule>,
	sourceVirtualModules: Map<string, Set<string>>,
) {
	const stale = sourceVirtualModules.get(source);
	if (!stale) return;
	for (const id of stale) {
		virtualModules.delete(id);
	}
	sourceVirtualModules.delete(source);
}

function stripBuildPrefix(fileName: string) {
	return fileName.startsWith(ARCADE_BUILD_PREFIX)
		? fileName.slice(ARCADE_BUILD_PREFIX.length)
		: fileName;
}

function devVirtualModuleUrl(
	virtualModuleId: string,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const idPath = `/@id/${virtualModuleId}`;
	return publicPath ? publicPath(idPath) : idPath;
}

function normalizeVirtualId(id: string) {
	if (id.startsWith('\0')) {
		return id.slice(1);
	}

	return id;
}

function resolveVirtualId(id: string) {
	if (id.startsWith('\0')) {
		return id;
	}

	return `\0${id}`;
}

function pathname(id: string) {
	return parsePath(id).pathname;
}

export { ARCADE_BUNDLE_GRAPH, ARCADE_BUILD_PREFIX, outputDefaults } from './build/chunking.ts';
export {
	ARCADE_MANIFEST,
	ARCADE_MANIFEST_FILE,
	createManifest,
	devTagsManifest,
	injectManifest,
} from './build/manifest.ts';
export { ARCADE_VIRTUAL_PREFIX, transformTsrxModule } from './transform.ts';
