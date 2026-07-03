import type { InputOptions, Plugin } from 'rolldown';
import { isAbsolute, relative, resolve } from 'pathe';
import { joinURL, parsePath, withQuery, withoutLeadingSlash } from 'ufo';
import { type MarklessBuildMetadataBundle, createBuildMetadata } from './build/build-metadata.ts';
import { MARKLESS_BUILD_PREFIX, MARKLESS_BUNDLE_GRAPH, outputDefaults } from './build/chunking.ts';
import { collectModulePreloadInjections, injectHeadLinks } from './build/head-links.ts';
import { stripEmptyVitePreloadWrappers } from './build/preload-cleanup.ts';
import {
	compactGeneratedDirectSymbolLoaders,
	rewriteGeneratedSymbolFacadeImports,
	rewriteGeneratedSymbolInitExports,
} from './build/symbol-facade-cleanup.ts';
import { rewriteGeneratedSymbolTableUrls } from './build/symbol-table.ts';
import { createMarklessDevGraph } from './dev.ts';
import { MARKLESS_VIRTUAL_PREFIX, transformTsrxModule } from './transform.ts';
import type {
	MarklessEnvironment,
	MarklessRolldownOptions,
	MarklessRolldownPluginApi,
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleResult,
} from './types.ts';

export type {
	BundleGraphAdder,
	GlobalInjections,
	PreloadGraphContext,
	PreloadGraphEntries,
	PreloadGraphEntriesAdder,
	MarklessAsset,
	MarklessBuildMetadata,
	MarklessBundle,
	MarklessBundleGraph,
	MarklessDevServer,
	MarklessEnvironment,
	MarklessManifest,
	MarklessRolldownOptions,
	MarklessRolldownPluginApi,
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';

type Environment = MarklessEnvironment | ((context: unknown) => MarklessEnvironment);
export type MarklessRolldownPlugin = Plugin & { api: MarklessRolldownPluginApi };
type InternalMarklessRolldownOptions = MarklessRolldownOptions & {
	publicPath?: (fileName: string) => string;
};

const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;
const MARKLESS_SYMBOL_SOURCE_QUERY_RE = /[?&]markless-symbols(?:[&#]|$)/;
const SYMBOL_VIRTUAL_ID_RE = /^virtual:markless:symbol:([^:]+):[^:]+$/;
const SYMBOL_VIRTUAL_STRING_RE = /(["'`])((?:virtual:markless:symbol:)[^"'`]+)\1/g;

export const marklessClient = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'client', options });
export const marklessServer = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'server', options });
export const marklessLib = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'lib', options });

export function createMarklessRolldownPlugin(input: {
	environment: Environment;
	options?: MarklessRolldownOptions;
}): MarklessRolldownPlugin {
	const environment = input.environment;
	const internalOptions = (input.options ?? {}) as InternalMarklessRolldownOptions;
	const virtualModules = new Map<string, MarklessVirtualModule>();
	const transformManifests = new Map<string, MarklessTransformManifest>();
	const sourceVirtualModules = new Map<string, Set<string>>();
	const clientSymbolEntrySources = new Set<string>();
	const dev = createMarklessDevGraph();
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
			invalidateGeneratedModules(parent: string, currentEnvironment?: MarklessEnvironment) {
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
			clientSymbolEntrySources.clear();
			virtualModules.clear();
			transformManifests.clear();
			sourceVirtualModules.clear();
			dev.reset();

			const currentRoot = getRoot();
			if (getEnvironment(this) === 'client') {
				for (const source of clientSymbolEntries(input.input, currentRoot)) {
					clientSymbolEntrySources.add(source);
				}
			}
		},
		outputOptions(output) {
			return outputDefaults(output, getEnvironment(this));
		},
		async resolveId(source, importer) {
			const normalized = normalizeVirtualId(source);
			if (virtualModules.has(normalized)) {
				return { id: resolveVirtualId(normalized), moduleSideEffects: true };
			}

			const symbolSource = sourceForSymbolVirtualImporter(importer);
			if (symbolSource && isRelativeImport(source)) {
				return await this.resolve(source, symbolSource, { skipSelf: true });
			}

			return null;
		},
		load(id) {
			const module = virtualModules.get(normalizeVirtualId(id));
			if (module) {
				return virtualModuleSourceForLoad(module, {
					dev: internalOptions.dev === true && getEnvironment(this) === 'client',
					publicPath: internalOptions.publicPath,
				});
			}
			return null;
		},
		async transform(code, id) {
			const currentEnvironment = getEnvironment(this);
			const virtualId = normalizeVirtualId(id);
			if (!TSRX_SOURCE_FILE.test(id)) {
				return null;
			}
			if (virtualId.startsWith(MARKLESS_VIRTUAL_PREFIX)) {
				return null;
			}
			const source = pathname(id);
			clearSourceVirtualModules(source, virtualModules, sourceVirtualModules);
			const transformed = await transformTsrxModule({
				filename: source,
				source: code,
				buildId: internalOptions.buildId,
				environment: currentEnvironment,
				clientOutput:
					currentEnvironment === 'client' &&
					(clientSymbolEntrySources.has(source) || isSymbolOnlySourceRequest(id))
						? 'symbols-only'
						: undefined,
				resumeModuleUrl:
					internalOptions.dev === true && currentEnvironment === 'server'
						? devBrowserSourceModuleUrl(source, getRoot(), internalOptions.publicPath)
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

			return transformed;
		},
		generateBundle: {
			order: 'post',
			handler(_, bundle) {
				if (getEnvironment(this) !== 'client') return;

				stripEmptyPreloadWrappersFromChunks(bundle);
				const removedSymbolFacades = rewriteGeneratedSymbolFacadeImports(bundle);
				rewriteGeneratedSymbolInitExports(bundle);
				compactGeneratedDirectSymbolLoaders(bundle);
				const manifestBundle = bundleWithoutRemovedChunks(bundle, removedSymbolFacades);
				const tableRewrite = rewriteGeneratedSymbolTableUrls(manifestBundle);
				if (tableRewrite.unresolved.length > 0) {
					this.error(
						`Markless symbol resolver table contains unresolved generated symbol chunks: ${tableRewrite.unresolved.join(', ')}`,
					);
				}

				const clientManifest = createBuildMetadata(
					manifestBundle,
					transformManifests.values(),
					getRoot(),
					{
						bundleGraphAsset: MARKLESS_BUNDLE_GRAPH,
						bundleGraphAdders: internalOptions.bundleGraphAdders,
						canonPath: stripBuildPrefix,
						publicPath: internalOptions.publicPath,
						injections: internalOptions.devInjections,
					},
				);

				injectHeadLinks(
					bundle,
					collectModulePreloadInjections(clientManifest.bundleGraph, {
						publicPath: internalOptions.publicPath,
						entryChunks: Object.values(bundle)
							.filter(
								(output): output is { fileName: string } =>
									!!output &&
									typeof output === 'object' &&
									(output as { type?: string }).type === 'chunk' &&
									(output as { isEntry?: boolean }).isEntry === true,
							)
							.map((chunk) => stripBuildPrefix(chunk.fileName)),
					}),
				);

				this.emitFile({
					type: 'asset',
					fileName: MARKLESS_BUNDLE_GRAPH,
					source: JSON.stringify(clientManifest.bundleGraph),
				});
			},
		},
	} satisfies Plugin & { api: MarklessRolldownPluginApi };

	return plugin;
}

function bundleWithoutRemovedChunks(
	bundle: MarklessBuildMetadataBundle,
	removedFileNames: ReadonlySet<string>,
) {
	if (removedFileNames.size === 0) return bundle;

	const next: MarklessBuildMetadataBundle = {};
	for (const [key, output] of Object.entries(bundle)) {
		if (isChunkFile(output) && removedFileNames.has(output.fileName)) continue;
		next[key] = output;
	}
	return next;
}

function stripEmptyPreloadWrappersFromChunks(bundle: Record<string, unknown>) {
	for (const output of Object.values(bundle)) {
		if (!isChunkWithCode(output)) continue;

		const nextCode = stripEmptyVitePreloadWrappers(output.code);
		if (nextCode !== output.code) {
			output.code = nextCode;
		}
	}
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

function isChunkWithCode(output: unknown): output is {
	readonly type: 'chunk';
	code: string;
} {
	if (!output || typeof output !== 'object') return false;
	const chunk = output as {
		readonly type?: unknown;
		readonly code?: unknown;
	};
	return chunk.type === 'chunk' && typeof chunk.code === 'string';
}

function pluginName(environment: Environment) {
	if (typeof environment === 'function') {
		return 'markless:rolldown';
	}

	return `markless:rolldown:${environment}`;
}

function registerTransformArtifacts(input: {
	source: string;
	result: TransformTsrxModuleResult;
	virtualModules: Map<string, MarklessVirtualModule>;
	transformManifests: Map<string, MarklessTransformManifest>;
	sourceVirtualModules: Map<string, Set<string>>;
	dev: ReturnType<typeof createMarklessDevGraph>;
	environment: MarklessEnvironment;
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
	virtualModules: Map<string, MarklessVirtualModule>,
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
	return fileName.startsWith(MARKLESS_BUILD_PREFIX)
		? fileName.slice(MARKLESS_BUILD_PREFIX.length)
		: fileName;
}

function virtualModuleSourceForLoad(
	module: MarklessVirtualModule,
	options: {
		readonly dev: boolean;
		readonly publicPath?: (fileName: string) => string;
	},
) {
	if (!options.dev || module.type !== 'resolver') return module.source;
	if (!module.source.includes('moduleUrls[row[0]]')) return module.source;

	return module.source.replace(SYMBOL_VIRTUAL_STRING_RE, (_match, _quote, virtualId) =>
		JSON.stringify(devBrowserVirtualModuleUrl(virtualId, options.publicPath)),
	);
}

function devBrowserVirtualModuleUrl(
	virtualId: string,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const path = joinURL('@id', resolveVirtualId(virtualId).replace('\0', '__x00__'));
	return publicPath ? publicPath(path) : joinURL('/', path);
}

function devBrowserSourceModuleUrl(
	source: string,
	root: string | undefined,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const relativeSource = root ? relative(root, source) : '';
	const fileName =
		root && isRootRelativePath(relativeSource)
			? relativeSource
			: joinURL('@fs', withoutLeadingSlash(source));
	const path = withQuery(fileName, { import: null });
	return publicPath ? publicPath(path) : joinURL('/', path);
}

function isRootRelativePath(path: string): boolean {
	return path !== '' && path !== '..' && !path.startsWith('../') && !isAbsolute(path);
}

function clientSymbolEntries(input: unknown, root: string | undefined): string[] {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return [];
	}

	const sources: string[] = [];
	for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
		if (!/symbol/i.test(name)) continue;
		for (const entry of inputEntryValues(value)) {
			if (typeof entry === 'string' && TSRX_SOURCE_FILE.test(entry)) {
				sources.push(normalizeInputSource(entry, root));
			}
		}
	}
	return sources;
}

function inputEntryValues(value: unknown): unknown[] {
	return Array.isArray(value) ? value.flatMap(inputEntryValues) : [value];
}

function normalizeInputSource(source: string, root: string | undefined) {
	const path = pathname(source);
	if (isAbsolute(path)) return path;
	return pathname(resolve(root ?? '', path));
}

function isSymbolOnlySourceRequest(id: string): boolean {
	return MARKLESS_SYMBOL_SOURCE_QUERY_RE.test(id);
}

function sourceForSymbolVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	const match = normalizeVirtualId(importer).match(SYMBOL_VIRTUAL_ID_RE);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isRelativeImport(source: string): boolean {
	return source.startsWith('./') || source.startsWith('../');
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

export { MARKLESS_BUNDLE_GRAPH, MARKLESS_BUILD_PREFIX, outputDefaults } from './build/chunking.ts';
export { createBuildMetadata } from './build/build-metadata.ts';
export { convertManifestToBundleGraph, createPreloadGraphAdder } from './build/bundle-graph.ts';
export { collectHeadLinkInjections } from './build/head-links.ts';
export { MARKLESS_VIRTUAL_PREFIX, transformTsrxModule } from './transform.ts';
