import type { InputOptions, Plugin } from 'rolldown';
import { dirname, isAbsolute, resolve } from 'pathe';
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
import {
	rewriteGeneratedSymbolTableUrls,
	verifyGeneratedSymbolTableRoutes,
} from './build/symbol-table.ts';
import { createMarklessDevGraph } from './dev.ts';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	MARKLESS_EXECUTION_SIZES,
	createExecutionSizesAsset,
	executionLogActivationInjection,
	executionLogVirtualModuleSource,
	injectExecutionLogModuleHook,
	normalizeExecutionLogMode,
	requalifyExecutionLogModuleHook,
} from './execution-log.ts';
import { encodedSymbolSource, symbolVirtualModuleSourceFile } from './source-module.ts';
import {
	MARKLESS_VIRTUAL_PREFIX,
	resumeVirtualModuleId,
	transformTsrxModule,
} from './transform.ts';
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
	emitResumeModules?: boolean;
	publicPath?: (fileName: string) => string;
};

const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;
const MARKLESS_SYMBOL_SOURCE_QUERY_RE = /[?&]markless-symbols(?:[&#]|$)/;
const MARKLESS_RESUME_SOURCE_QUERY_RE = /[?&]markless-resume(?:[&#]|$)/;
const RESUME_VIRTUAL_ID_RE = /^virtual:markless:resume:([^:]+)$/;
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
	const executionLogEstimatedSizes = new Map<string, number>();
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
			executionLogEstimatedSizes.clear();
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
			// Emitted modules import runtime catalog functions as '@markless/web/fns/*'
			// and conditional inline helpers as '@markless/web/inline/*'.
			// Apps depend on @markless/core only, so the bundler resolves the catalog
			// from its own dependency on @markless/web (generated-code-only surface).
			if (source.startsWith('@markless/web/fns/')) {
				const resolved = import.meta.resolve(source);
				if (resolved?.startsWith('file://')) {
					return { id: decodeURIComponent(resolved.slice('file://'.length)) };
				}
			}
			if (source.startsWith('@markless/web/inline/')) {
				const resolvedRoot = import.meta.resolve('@markless/web');
				if (resolvedRoot?.startsWith('file://') && resolvedRoot.endsWith('/index.ts')) {
					const helperPath = source.slice('@markless/web/'.length);
					return {
						id: decodeURIComponent(
							resolvedRoot.slice('file://'.length, -'index.ts'.length) +
								`${helperPath}.ts`,
						),
					};
				}
			}
			const normalized = normalizeVirtualId(source);
			if (normalized === MARKLESS_EXECUTION_LOG_MODULE_ID) {
				return {
					id: resolveVirtualId(MARKLESS_EXECUTION_LOG_MODULE_ID),
					moduleSideEffects: true,
				};
			}
			if (virtualModules.has(normalized)) {
				return { id: resolveVirtualId(normalized), moduleSideEffects: true };
			}

			const symbolSource = sourceForSymbolVirtualImporter(importer);
			if (symbolSource && isRelativeImport(source)) {
				return await this.resolve(source, symbolSource, { skipSelf: true });
			}
			const resumeSource = sourceForResumeVirtualImporter(importer);
			if (resumeSource && isRelativeImport(source)) {
				return await this.resolve(source, resumeSource, { skipSelf: true });
			}

			return null;
		},
		load(id) {
			if (normalizeVirtualId(id) === MARKLESS_EXECUTION_LOG_MODULE_ID) {
				return executionLogVirtualModuleSource({
					moduleSizes:
						internalOptions.dev === true && getEnvironment(this) === 'client'
							? executionLogEstimatedSizes
							: undefined,
					sizesUrl:
						internalOptions.dev === true
							? undefined
							: (internalOptions.publicPath?.(MARKLESS_EXECUTION_SIZES) ??
								`/${MARKLESS_EXECUTION_SIZES}`),
				});
			}
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
				if (
					currentEnvironment === 'client' &&
					internalOptions.dev === true &&
					normalizeExecutionLogMode(internalOptions.executionLog) !== 'never' &&
					isMarklessRuntimeModule(id)
				) {
					executionLogEstimatedSizes.set(executionLogRuntimeModuleId(id), code.length);
					return {
						code: injectExecutionLogModuleHook(
							code,
							executionLogRuntimeModuleId(id),
							internalOptions.executionLog,
						),
						map: null,
					};
				}
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
				executionLog: normalizeExecutionLogMode(internalOptions.executionLog),
				executionLogModuleHooks:
					internalOptions.dev === true && currentEnvironment === 'client',
				environment: currentEnvironment,
				clientOutput:
					currentEnvironment === 'client' &&
					(clientSymbolEntrySources.has(source) || isSymbolOnlySourceRequest(id))
						? 'symbols-only'
						: undefined,
				// Dev resume URL points at the SOURCE module (not the virtual resume
				// module): loading the .tsrx keeps it in the client module graph, which
				// is what lets Vite's own no-accepting-boundary full-reload fire on
				// edits (commit e3c5bcc's design). The source client module re-exports
				// resumeContainerEvent from the virtual resume module in dev only;
				// production builds keep the split (CSR emits no resume code).
				resumeModuleUrl:
					internalOptions.dev === true && currentEnvironment === 'server'
						? devBrowserSourceModuleUrl(source, getRoot(), internalOptions.publicPath)
						: undefined,
				headInjections:
					internalOptions.dev === true && currentEnvironment === 'server'
						? internalOptions.devInjections
						: undefined,
				devResumeReexport: internalOptions.dev === true && currentEnvironment === 'client',
			});
			registerTransformArtifacts({
				source,
				result: transformed,
				virtualModules,
				transformManifests,
				sourceVirtualModules,
				executionLogEstimatedSizes,
				dev,
				environment: currentEnvironment,
			});
			if (currentEnvironment === 'client' && isResumeSourceRequest(id)) {
				const resumeModule = transformed.virtualModules.find(
					(module) => module.type === 'resume',
				);
				if (resumeModule) return { code: resumeModule.source, map: null };
			}

			if (currentEnvironment === 'client' && !internalOptions.dev) {
				for (const module of transformed.virtualModules.filter(
					(item) =>
						item.type === 'symbol' ||
						(item.type === 'resume' &&
							internalOptions.emitResumeModules === true &&
							clientSymbolEntrySources.has(source)),
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
			async handler(_, bundle) {
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
				const tableIntegrity = verifyGeneratedSymbolTableRoutes(
					manifestBundle,
					transformManifests.values(),
				);
				if (tableIntegrity.errors.length > 0) {
					this.error(
						`Markless symbol resolver table integrity check failed:\n${tableIntegrity.errors
							.map(
								(error) =>
									`- ${error.symbolId} -> ${error.claimedChunk}: ${error.reason}`,
							)
							.join('\n')}`,
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

				const executionLogInjection = executionLogActivationInjection(
					internalOptions.executionLog,
				);
				if (executionLogInjection) injectHeadLinks(bundle, [executionLogInjection]);
				injectHeadLinks(
					bundle,
					collectModulePreloadInjections(clientManifest, {
						publicPath: internalOptions.publicPath,
						entryChunks: Object.values(bundle)
							.filter(
								(output) =>
									!!output &&
									typeof output === 'object' &&
									(output as { type?: string }).type === 'chunk' &&
									(output as { isEntry?: boolean }).isEntry === true,
							)
							.map((chunk) =>
								stripBuildPrefix((chunk as { fileName: string }).fileName),
							),
					}),
				);

				this.emitFile({
					type: 'asset',
					fileName: MARKLESS_BUNDLE_GRAPH,
					source: JSON.stringify(clientManifest.bundleGraph),
				});
				this.emitFile(
					await createExecutionSizesAsset(
						manifestBundle,
						clientManifest,
						stripBuildPrefix,
						executionLogInjection
							? executionAttributionTables(transformManifests, getRoot())
							: undefined,
					),
				);
				// The demand map lives in payload-module exports (tree-shaken from built
				// pages by design); ship it as a build asset so witness boxes and tooling
				// can derive allowed execution sets against real builds.
				this.emitFile({
					type: 'asset',
					fileName: `${MARKLESS_BUILD_PREFIX}execution-demand.json`,
					source: JSON.stringify(
						Object.fromEntries(
							clientManifest.modules
								.filter((module) => module.runtimeDemandMap)
								.map((module) => [module.source, module.runtimeDemandMap]),
						),
					),
				});
			},
		},
	} satisfies Plugin & { api: MarklessRolldownPluginApi };

	return plugin;
}

function executionAttributionRoots(
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
): string[] {
	const children = new Set<string>();
	for (const manifest of manifests.values()) {
		for (const route of manifest.symbolRoutes ?? []) {
			children.add(resolve(dirname(manifest.source), route.importSource.split('?')[0]!));
		}
	}
	return [...manifests.keys()].filter((source) => !children.has(source));
}

function executionAttributionTables(
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
	root: string | undefined,
): Record<string, Record<string, string>> {
	return Object.fromEntries(
		executionAttributionRoots(manifests)
			.sort()
			.map((source) => [
				executionAttributionRouteKey(source, root),
				flattenExecutionAttributionScopes(source, manifests),
			]),
	);
}

function executionAttributionRouteKey(source: string, root: string | undefined): string {
	const prefix = root ? `${root.replace(/[/\\]+$/, '')}/` : '';
	return (prefix && source.startsWith(prefix) ? source.slice(prefix.length) : source).replace(
		/^[/\\]+/,
		'',
	);
}

function flattenExecutionAttributionScopes(
	root: string,
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
): Record<string, string> {
	const scopes: Record<string, string> = {};
	const visit = (source: string, scope: string, seen: ReadonlySet<string>) => {
		if (seen.has(source)) return;
		scopes[scope] = encodedSymbolSource(source);
		const manifest = manifests.get(source);
		for (const route of manifest?.symbolRoutes ?? []) {
			const child = resolve(dirname(source), route.importSource.split('?')[0]!);
			visit(child, scope + route.prefix, new Set([...seen, source]));
		}
	};
	visit(root, '', new Set());
	return scopes;
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
	executionLogEstimatedSizes: Map<string, number>;
	dev: ReturnType<typeof createMarklessDevGraph>;
	environment: MarklessEnvironment;
}) {
	const ids = new Set<string>();
	for (const module of input.result.virtualModules) {
		const isClientSymbol = input.environment === 'client' && module.type === 'symbol';
		// The symbol virtual module id embeds the source filename, so it is the
		// collision-free execution-log id: re-key the injected hook (dev builds)
		// and the size estimate to that same id so the join always resolves.
		const stored = isClientSymbol
			? { ...module, source: requalifyExecutionLogModuleHook(module.source, module.id) }
			: module;
		input.virtualModules.set(module.id, stored);
		ids.add(module.id);
		if (isClientSymbol) {
			input.executionLogEstimatedSizes.set(module.id, stored.source.length);
		}
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

// Always the /@fs/<absolute> form, even for sources under the Vite root: a
// root-relative source URL (e.g. /pages/r/[repo]/index.tsrx?import) collides
// with the app's own route space on framework dev servers (nitro routes it
// and 404s), which kills the first full-resume wake in dev. Vite serves
// /@fs URLs for any allowed path and resolves them to the same module-graph
// entry, so the HMR full-reload contract is unchanged.
function devBrowserSourceModuleUrl(
	source: string,
	_root: string | undefined,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const path = withQuery(joinURL('@fs', withoutLeadingSlash(source)), { import: null });
	return publicPath ? publicPath(path) : joinURL('/', path);
}

function devBrowserVirtualModuleUrl(
	virtualId: string,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const path = joinURL('@id', resolveVirtualId(virtualId).replace('\0', '__x00__'));
	return publicPath ? publicPath(path) : joinURL('/', path);
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

function isResumeSourceRequest(id: string): boolean {
	return MARKLESS_RESUME_SOURCE_QUERY_RE.test(id);
}

function sourceForSymbolVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	return symbolVirtualModuleSourceFile(normalizeVirtualId(importer));
}

function sourceForResumeVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	const match = normalizeVirtualId(importer).match(RESUME_VIRTUAL_ID_RE);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isRelativeImport(source: string): boolean {
	return source.startsWith('./') || source.startsWith('../');
}

function isMarklessRuntimeModule(id: string): boolean {
	const path = pathname(id);
	return /[/\\](?:web|runtime|serializer)[/\\]src[/\\].+\.ts$/.test(path);
}

function executionLogRuntimeModuleId(id: string): string {
	const path = pathname(id);
	const match = path.match(/[/\\](web|runtime|serializer)[/\\]src[/\\]([^?#]+)\.ts$/);
	return match ? `${match[1]}:${match[2].replace(/[/\\]/g, '/')}` : path;
}

function normalizeVirtualId(id: string) {
	const bare = id.startsWith('\0') ? id.slice(1) : id;
	if (!bare.startsWith(MARKLESS_VIRTUAL_PREFIX)) return bare;
	// Markless virtual ids embed the encodeURIComponent'd source path and END
	// in .tsrx, so dev requests arrive mangled twice: Vite's import analysis
	// appends `?import` as if they were assets, and the /@id middleware
	// decodeURI()s the path — %2F survives (reserved) but %5B/%5D decode to
	// raw brackets, so ids for pages like pages/r/[repo] come in
	// half-decoded. Strip the query and re-canonicalize each colon segment to
	// the registered encoding, or the first full-resume wake in dev 404s on
	// its payload/view imports.
	const queryIndex = bare.indexOf('?');
	const withoutQuery = queryIndex === -1 ? bare : bare.slice(0, queryIndex);
	const segments = withoutQuery
		.slice(MARKLESS_VIRTUAL_PREFIX.length)
		.split(':')
		.map((segment) => {
			try {
				return encodeURIComponent(decodeURIComponent(segment));
			} catch {
				return segment;
			}
		});
	return `${MARKLESS_VIRTUAL_PREFIX}${segments.join(':')}`;
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
export {
	MARKLESS_VIRTUAL_PREFIX,
	resumeVirtualModuleId,
	transformTsrxModule,
} from './transform.ts';
