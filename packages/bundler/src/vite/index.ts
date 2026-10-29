import type {
	BuildEnvironment,
	Environment,
	EnvironmentOptions,
	Plugin,
	UserConfig,
	ViteBuilder,
	ViteDevServer,
} from 'vite';
import type { OutputOptions } from 'rolldown';
import { writeFileSync } from 'node:fs';
import { resolve } from 'pathe';
import {
	DEBUGGING_PLAYBOOK_HINT,
	useCompileRunner,
	usePersistentCompileStore,
} from '@markless/compiler';
import {
	compilerFingerprint,
	createPersistentCompileCache,
	persistentCompileCacheAvailable,
	type PersistentCompileCache,
} from '../compile-store.ts';
import { joinURL, parsePath, withQuery } from 'ufo';
import { createPreloadGraphAdder } from '../build/bundle-graph.ts';
import {
	deriveBuiltPrerenderRecords,
	emitPrerenderedPage,
	type BuiltPrerenderRecords,
} from '../build/prerender.ts';
import { executionLogActivationInjection } from '../execution-log.ts';
import { usePersistentStrippedCode } from '../transform.ts';
import {
	buildWorkerCount,
	createCompileWorkerPool,
	type CompileWorkerPool,
} from '../build-workers.ts';
import { outputDefaults } from '../build/chunking.ts';
import { unwrapAsyncImportWrappers } from '../build/async-import-wrappers.ts';
import { collapseInitFacadeImports } from '../build/init-facade-imports.ts';
import { deferredRuntimePlugin } from '../build/deferred-runtime.ts';
import { clearChunkFactCaches } from '../build/chunk-ast.ts';
import { prefetchChunkDynamicImports } from '../build/chunk-workers.ts';
import { nativePackingPlugins } from '../build/native-packing.ts';
import { DEPRECATED_NATIVE_PACKING_WARNING, nativePackingEnabled } from '../packing-option.ts';
import {
	excludeSourceShippedDeps,
	includeOptimizedDeps,
	runtimeFunctionSpecifiers,
} from '../optimized-deps.ts';
import { RESUME_ENTRY_SPECIFIER, STORAGE_FREE_RESUME_ENTRY_SPECIFIER } from '../source-module.ts';
import { createMarklessRolldownPlugin } from '../rolldown.ts';
import {
	isCompilerStatefulModuleId,
	sharedReachedRenderDataRequest,
	STRING_EXPORT_QUERY,
} from '../virtual-ids.ts';

// The slice of Vitest's `configureVitest` context this plugin uses; vitest stays out of the bundler's dependencies.
type VitestCacheKeyContext = {
	readonly defineCacheKeyGenerator: (
		generator: (context: { readonly id: string }) => false | undefined,
	) => void;
};
import {
	type BundleGraphAdder,
	type GlobalInjections,
	type PreloadGraphEntriesAdder,
	type MarklessEnvironment,
	type MarklessRolldownPluginApi,
	type MarklessRolldownOptions,
} from '../types.ts';
import { createDevTags } from './dev-tags.ts';
import { createDevPrerender } from './dev-prerender.ts';
import { withDevServerExternals } from './dev-server-externals.ts';
import {
	isServerViteEnvironment,
	marklessEnvironment,
	serverModuleRunner,
	transformMarklessRequest,
	viteEnvironmentName,
} from './environment.ts';
import { createViteHmr } from './hmr.ts';
import { installDevRuntimeImportResolution } from './dev-runtime-imports.ts';
import { browserNodeGuard } from './browser-node-guard.ts';
import { constantSlicesPlugin } from '../constant-slices.ts';
import { buildClientInChildProcess, clientBuildRequest } from './separate-client-build.ts';

export type {
	BundleGraphAdder,
	GlobalInjections,
	PreloadGraphContext,
	PreloadGraphEntries,
	PreloadGraphEntriesAdder,
	MarklessBuildMetadata,
	MarklessEnvironment,
	MarklessManifest,
	MarklessRolldownOptions,
} from '../types.ts';

export interface MarklessViteOptions extends MarklessRolldownOptions {
	clientEnvironment?: string;
	debug?: boolean;
	serverEnvironment?: string;
	/**
	 * Keep each module's compile result under Vite's `cacheDir` (`markless-compile/`), keyed by the module's
	 * source, its compile inputs and the compiler's own files, so the next build reuses it. Default `true`.
	 */
	compileCache?: boolean;
}

type MarklessOutputOptions = OutputOptions | OutputOptions[] | undefined;
type InternalMarklessRolldownOptions = MarklessRolldownOptions & {
	chunkImportMap?: boolean;
	emitResumeModules?: boolean;
	inlineResumerDebug?: boolean;
	prerender?: boolean;
	productionResumeModuleUrls?: Map<string, string>;
	productionPrerenderWakeModuleUrls?: Map<string, string>;
	prerenderWakeChannel?: boolean;
	publicPath?: (fileName: string) => string;
	updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
};
type RolldownInputConfig = string | readonly string[] | Record<string, string> | undefined;
const MARKLESS_SKIP_DUPLICATE_BUILDS = Symbol('markless-skip-duplicate-builds');
const TSRX_INPUT_FILE = /\.tsrx(?:[?#].*)?$/;

export function markless(options: MarklessViteOptions = {}): Plugin[] {
	let command: 'build' | 'serve' = 'build';
	const bundleGraphAdders = new Set<BundleGraphAdder>();
	const transformedTsrxSources = new Map<string, string>();
	const prerenderRecordsBySource = new Map<string, BuiltPrerenderRecords>();
	const { experimentalNativePacking: _deprecatedPacking, ...rest } = options;
	const rolldownOptions: InternalMarklessRolldownOptions = {
		...rest,
		packing: nativePackingEnabled(options),
		chunkImportMap: options.experimentalNativePacking === true,
	};
	const prerender = process.env.MARKLESS_PRERENDER === '1';
	const explicitPrerenderWake = process.env.MARKLESS_PRERENDER_WAKE;
	rolldownOptions.prerender = false;
	rolldownOptions.prerenderWakeChannel = prerender
		? explicitPrerenderWake !== '0'
		: explicitPrerenderWake === '1';
	// Prerendered pages use staged wake by default. Non-prerender builds keep
	// native emission unless the channel is explicitly enabled; an explicit 0
	// remains the legacy-path comparison seam for prerender builds.
	const stagePrerenderWake = rolldownOptions.prerenderWakeChannel;
	rolldownOptions.productionResumeModuleUrls = new Map();
	rolldownOptions.productionPrerenderWakeModuleUrls = new Map();
	let prerenderEntry: string | null = null;
	let resolvedRoot = '';
	let chunkSizeWarningBytes: number | undefined;
	let clientOutDir = 'dist';
	rolldownOptions.bundleGraphAdders = bundleGraphAdders;
	const hmrOptions = {
		base: '/',
		clientEnvironment: viteEnvironmentName('client', options),
		enabled: false,
		invalidateGeneratedModules: (
			parent: string,
			environment?: MarklessEnvironment,
			nextSource?: string,
		) => marklessPlugin.api.invalidateGeneratedModules(parent, environment, nextSource),
		invalidatePrerenderSnapshots: undefined as
			| ((renderDataIds: readonly string[]) => void)
			| undefined,
		isPage: undefined as ((moduleId: string) => boolean) | undefined,
		pageForUrl: undefined as ((url: string) => string | undefined) | undefined,
	};
	let devPrerender: ReturnType<typeof createDevPrerender> | undefined;
	let compileCache: PersistentCompileCache | undefined;
	let compileWorkers: CompileWorkerPool | undefined;
	const flushCompileCache = async () => {
		const workers = compileWorkers;
		compileWorkers = undefined;
		useCompileRunner(undefined);
		await workers?.close();
		const cache = compileCache;
		if (!cache) return;
		compileCache = undefined;
		usePersistentCompileStore(undefined);
		usePersistentStrippedCode(undefined);
		await cache.flush();
	};
	const devTags = createDevTags();
	rolldownOptions.devInjections = devTags.tags;
	const basePlugin = createMarklessRolldownPlugin({
		environment: getBuildEnvironment,
		options: rolldownOptions,
		prerenderRecordsBySource,
	}) as Plugin & {
		api: {
			declareRouteModules: MarklessRolldownPluginApi['declareRouteModules'];
			declarePackOwnership: MarklessRolldownPluginApi['declarePackOwnership'];
			invalidateGeneratedModules: typeof hmrOptions.invalidateGeneratedModules;
			runtimeDemandMaps: MarklessRolldownPluginApi['runtimeDemandMaps'];
			clientBuildHandoff: MarklessRolldownPluginApi['clientBuildHandoff'];
			adoptClientBuildHandoff: MarklessRolldownPluginApi['adoptClientBuildHandoff'];
			runtimeDemandSources: MarklessRolldownPluginApi['runtimeDemandSources'];
			directCsrOnly: MarklessRolldownPluginApi['directCsrOnly'];
		};
	};
	const packingPlugins = nativePackingEnabled(options)
		? nativePackingPlugins(
				() => resolvedRoot,
				() => basePlugin.api.runtimeDemandMaps(),
				() => basePlugin.api.runtimeDemandSources(),
				() => basePlugin.api.directCsrOnly(),
				() => chunkSizeWarningBytes,
			)
		: undefined;
	const packOwnership = packingPlugins?.[0]?.api;
	if (packOwnership) basePlugin.api.declarePackOwnership(packOwnership);
	const hmr = createViteHmr(hmrOptions);
	const prepareClientBuild = async () => {
		if (!(prerender || stagePrerenderWake) || !prerenderEntry) return;
		const source = resolve(resolvedRoot, prerenderEntry);
		prerenderRecordsBySource.set(
			source,
			await deriveBuiltPrerenderRecords({
				entry: source,
				serverPlugin: createMarklessRolldownPlugin({
					environment: 'server',
					options: { ...rolldownOptions, rootDir: resolvedRoot, dev: false },
				}),
			}),
		);
	};

	const marklessPlugin = {
		...basePlugin,
		name: 'vite-plugin-markless',
		enforce: 'post',
		sharedDuringBuild: true,
		api: {
			...basePlugin.api,
			declareRouteModules: (isRoute: (moduleId: string) => boolean) => {
				basePlugin.api.declareRouteModules(isRoute);
				hmrOptions.isPage = isRoute;
			},
			declarePageForUrl: (pageForUrl: (url: string) => string | undefined) => {
				hmrOptions.pageForUrl = pageForUrl;
			},
			registerBundleGraphAdder: (adder: BundleGraphAdder) => bundleGraphAdders.add(adder),
			registerDevInjection: (injection: GlobalInjections) => devTags.register(injection),
			registerPreloadGraphEntries: (adder: PreloadGraphEntriesAdder) =>
				bundleGraphAdders.add(createPreloadGraphAdder(adder)),
			buildClientOnly: async (builder: ViteBuilder, handoffFile: string) => {
				await prepareClientBuild();
				const client = builder.environments[viteEnvironmentName('client', options)];
				if (!client) throw new Error('The reloaded config has no client environment.');
				await builder.build(client);
				await flushCompileCache();
				writeFileSync(handoffFile, JSON.stringify(basePlugin.api.clientBuildHandoff()));
			},
		},
		config(config, env) {
			command = env.command;
			const devEnabled = env.command === 'serve';
			rolldownOptions.executionLog = options.executionLog ?? (devEnabled ? 'auto' : 'never');
			const debugEnabled = devEnabled || options.debug === true;
			rolldownOptions.inlineResumerDebug = debugEnabled;
			const debugDefine = JSON.stringify(debugEnabled);
			const devDefine = JSON.stringify(devEnabled);
			const consumerDebugDefine = config.define?.__MARKLESS_DEBUG_ENABLED__;
			const consumerDevDefine = config.define?.__MARKLESS_DEV_ENABLED__;
			if (
				consumerDebugDefine !== undefined &&
				consumerDebugDefine !== debugDefine &&
				consumerDebugDefine !== debugEnabled
			) {
				throw new Error(
					'MARKLESS_DEBUG_DEFINE_CONFLICT: __MARKLESS_DEBUG_ENABLED__ is controlled by markless(). Remove the consumer definition or set markless({ debug: true }).',
				);
			}
			if (
				consumerDevDefine !== undefined &&
				consumerDevDefine !== devDefine &&
				consumerDevDefine !== devEnabled
			) {
				throw new Error(
					'MARKLESS_DEV_DEFINE_CONFLICT: __MARKLESS_DEV_ENABLED__ is controlled by markless(). Remove the consumer definition.',
				);
			}
			config.define = {
				...config.define,
				__MARKLESS_DEBUG_ENABLED__: debugDefine,
				__MARKLESS_DEV_ENABLED__: devDefine,
			};
			configDefaults(config, options, rolldownOptions);
			if (devEnabled) {
				includeOptimizedDeps(config, [
					RESUME_ENTRY_SPECIFIER,
					STORAGE_FREE_RESUME_ENTRY_SPECIFIER,
					...runtimeFunctionSpecifiers(),
				]);
				excludeSourceShippedDeps(config);
			}
			// MARKLESS_PRERENDER apps keep their entry regardless of the wake
			// channel; only the shell prerender itself stays MARKLESS_PRERENDER's.
			if (prerender || stagePrerenderWake) {
				prerenderEntry = ssrTsrxInput(config, options);
				rolldownOptions.prerender = prerender && prerenderEntry !== null;
			}
		},
		configResolved(resolvedConfig) {
			if (options.experimentalNativePacking !== undefined)
				resolvedConfig.logger.warn(DEPRECATED_NATIVE_PACKING_WARNING);
			resolvedRoot = resolvedConfig.root;
			// Vite warns past this many kB of a chunk's code, counting a kB as 1000 bytes.
			const warningKb = (resolvedConfig.environments?.client ?? resolvedConfig).build
				?.chunkSizeWarningLimit;
			chunkSizeWarningBytes = warningKb === undefined ? undefined : warningKb * 1000;
			clientOutDir = resolvedConfig.build?.outDir ?? 'dist';
			const serve = resolvedConfig.command === 'serve';
			hmrOptions.base = resolvedConfig.base;
			hmrOptions.enabled = serve && options.hmr !== false;
			rolldownOptions.dev = serve;
			rolldownOptions.rootDir = resolvedConfig.root;
			rolldownOptions.publicPath = (fileName) => joinURL(resolvedConfig.base, fileName);
			// A hand-built config without a cacheDir would otherwise put the store in the working directory.
			if (
				!serve &&
				resolvedConfig.cacheDir &&
				options.compileCache !== false &&
				persistentCompileCacheAvailable()
			) {
				const directory = resolve(resolvedConfig.cacheDir, 'markless-compile');
				const fingerprint = compilerFingerprint();
				compileCache = createPersistentCompileCache({ directory, fingerprint });
				usePersistentCompileStore(compileCache);
				usePersistentStrippedCode(compileCache.strippedCode);
				compileWorkers = createCompileWorkerPool({
					size: buildWorkerCount(),
					store: { cache: compileCache, directory, fingerprint },
				});
			} else if (!serve)
				compileWorkers = createCompileWorkerPool({ size: buildWorkerCount() });
			if (compileWorkers) useCompileRunner(compileWorkers.run);
			if (serve) {
				devTags.registerViteTags(resolvedConfig.base);
				if (prerender && prerenderEntry) {
					devPrerender = createDevPrerender({
						base: resolvedConfig.base,
						entry: resolve(resolvedConfig.root, prerenderEntry),
						serverEnvironment: viteEnvironmentName('server', options),
						reportError: (environment, error) => hmr.reportError(environment, error),
					});
					rolldownOptions.updateDevPrerenderHashes = devPrerender.updateHashes;
					hmrOptions.invalidatePrerenderSnapshots = devPrerender.invalidate;
				}
			}
		},
		configEnvironment(name, config) {
			if (command === 'serve') {
				return undefined;
			}

			const environment = configEnvironmentKind(name, config, options);
			if (!environment) {
				return undefined;
			}

			const build = config.build ?? {};
			const rolldownOptions = build.rolldownOptions ?? {};
			const outDir = defaultOutDir(environment);
			return {
				build: {
					...build,
					...(environment === 'client'
						? { modulePreload: build.modulePreload ?? false }
						: {}),
					...(build.outDir || !outDir ? {} : { outDir }),
					rolldownOptions: {
						...rolldownOptions,
						output: withOutputDefaults(rolldownOptions.output, environment),
					},
				},
			};
		},
		buildApp: {
			order: 'pre',
			async handler(builder) {
				const clientEnvironment = viteEnvironmentName('client', options);
				const childRequest = clientBuildRequest(builder, clientEnvironment);
				const handoff = childRequest && (await buildClientInChildProcess(childRequest));
				if (handoff) {
					basePlugin.api.adoptClientBuildHandoff(handoff);
					builder.environments[clientEnvironment]!.isBuilt = true;
				} else await prepareClientBuild();
				await buildMarklessEnvironments(builder, options);
				await flushCompileCache();
				if (prerender && prerenderEntry) {
					const source = resolve(resolvedRoot, prerenderEntry);
					const clientEnvironment =
						builder.environments[viteEnvironmentName('client', options)];
					await emitPrerenderedPage({
						root: clientEnvironment?.config.root ?? resolvedRoot,
						entry: resolve(resolvedRoot, prerenderEntry),
						outDir: clientEnvironment?.config.build?.outDir ?? clientOutDir,
						resumeModuleUrl: rolldownOptions.productionResumeModuleUrls?.get(source),
						prerenderWakeModuleUrl:
							rolldownOptions.productionPrerenderWakeModuleUrls?.get(source),
						serverPlugin: createMarklessRolldownPlugin({
							environment: 'server',
							options: {
								...rolldownOptions,
								rootDir: resolvedRoot,
								dev: false,
							},
						}),
					});
				}
			},
		},
		configureVitest({ defineCacheKeyGenerator }: VitestCacheKeyContext) {
			defineCacheKeyGenerator(({ id }) =>
				isCompilerStatefulModuleId(id) ? false : undefined,
			);
		},
		configureServer(server: ViteDevServer) {
			server.config.logger?.info(
				`markless diagnostics available - window.__MARKLESS_DEBUG__ records containers, lifecycles, and event routing; ${DEBUGGING_PLAYBOOK_HINT}.`,
			);
			rolldownOptions.devServer = {
				transformRequest: (url, environment) =>
					transformMarklessRequest(server, url, environment, options),
				importModule: (source) =>
					serverModuleRunner(server, viteEnvironmentName('server', options)).import(
						source,
					),
				invalidateModule: (id, environment) => {
					const target = server.environments[viteEnvironmentName(environment, options)];
					const module = target?.moduleGraph?.getModuleById?.(id);
					if (!module) return false;
					target.moduleGraph.invalidateModule(module, new Set(), Date.now(), true);
					return true;
				},
			};
			hmr.configureServer(server);
			installDevRuntimeImportResolution(server, viteEnvironmentName('client', options));
			devPrerender?.configureServer(server);
		},
		transformIndexHtml(html) {
			const hmrResult = hmr.transformIndexHtml();
			const injection = executionLogActivationInjection(rolldownOptions.executionLog);
			const tags = [
				...(Array.isArray(hmrResult) ? hmrResult : []),
				...(injection
					? [
							{
								tag: injection.tag,
								injectTo: injection.location,
								attrs: injection.attributes,
								children: injection.children,
							},
						]
					: []),
			];
			if (!devPrerender) return tags.length > 0 ? tags : undefined;
			return devPrerender.renderHtml(html).then((renderedHtml) => ({
				html: renderedHtml,
				tags,
			}));
		},
		resolveId: {
			order: 'pre',
			async handler(source, importer, opts) {
				const hmrResolved = hmr.resolveId(source);
				if (hmrResolved) return hmrResolved;

				return runHook(basePlugin.resolveId, this, source, importer, opts);
			},
		},
		load(id, loadOptions) {
			return hmr.load(id) ?? runHook(basePlugin.load, this, id, loadOptions);
		},
		transform: {
			async handler(code, id, transformOptions) {
				if (rolldownOptions.dev === true && TSRX_INPUT_FILE.test(id) && !STRING_EXPORT_QUERY.test(id)) {
					transformedTsrxSources.set(parsePath(id).pathname, code);
				}
				try {
					const context =
						rolldownOptions.dev === true ? withDevServerExternals(this) : this;
					return await runHook(basePlugin.transform, context, code, id, transformOptions);
				} catch (error) {
					if (rolldownOptions.dev === true && TSRX_INPUT_FILE.test(id)) {
						// Only a dev environment carries the HMR channel the error client listens on.
						const environment = this.environment;
						hmr.reportError(
							environment.mode === 'dev' ? environment : undefined,
							error,
						);
					}
					throw error;
				}
			},
		},
		async hotUpdate(ctx) {
			// Watcher events for content-identical writes (e.g. editor saves without
			// changes, or delayed FSEvents for a restored file) must not invalidate
			// generated virtual modules or trigger a full reload.
			if (await matchesTransformedTsrxSource(ctx, transformedTsrxSources)) {
				return [];
			}
			return hmr.hotUpdate(this.environment, ctx);
		},
	} satisfies Plugin & {
		api: MarklessVitePluginApi;
		configureVitest(context: VitestCacheKeyContext): void;
	};

	return [
		marklessPlugin,
		browserNodeGuard(),
		constantSlicesPlugin(),
		{
			name: 'markless:shared-render-data-reach',
			// Ahead of Vite's own resolver, which would otherwise keep the route root in the id.
			enforce: 'pre',
			resolveId: {
				filter: { id: /[?&]markless-reached-from=/ },
				async handler(source, importer) {
					const shared = sharedReachedRenderDataRequest(source);
					return shared ? await this.resolve(shared, importer, { skipSelf: true }) : null;
				},
			},
		} satisfies Plugin,
		{
			name: 'markless:init-facade-imports',
			apply: 'build',
			// Ahead of every plugin that lists the bundle's chunks, the router's preloads among them.
			enforce: 'pre',
			applyToEnvironment(environment) {
				return environment.config.consumer === 'client';
			},
			generateBundle: {
				order: 'post',
				async handler(_options, bundle) {
					await prefetchChunkDynamicImports(
						Object.values(bundle).filter(
							(output) => output.type === 'chunk' && output.code.includes('import('),
						) as Array<{ readonly fileName: string; readonly code: string }>,
					);
					collapseInitFacadeImports(bundle);
					await unwrapAsyncImportWrappers(bundle);
					// Held to finalize, one entry per chunk with an import() grew with page count; finalize reads its own.
					clearChunkFactCaches();
				},
			},
		} satisfies Plugin,
		...(packingPlugins
			? packingPlugins.map((plugin): Plugin => ({
					...(plugin as Plugin),
					apply: 'build' as const,
					enforce: 'post' as const,
					// A function config makes plugins per environment; only shared instances see the base plugin's state.
					sharedDuringBuild: true,
					applyToEnvironment(environment) {
						return environment.config.consumer === 'client';
					},
				}))
			: [
					{
						...(deferredRuntimePlugin(() =>
							basePlugin.api.runtimeDemandMaps(),
						) as Plugin),
						apply: 'build' as const,
						enforce: 'post' as const,
						applyToEnvironment(environment: { config: { consumer: string } }) {
							return environment.config.consumer === 'client';
						},
					} satisfies Plugin,
				]),
	];
}

async function buildMarklessEnvironments(builder: ViteBuilder, options: MarklessViteOptions) {
	const environments = buildEnvironments(builder, options);
	const names = environments.map((environment) => environment.name);
	skipDuplicateBuilds(builder, names);

	for (const environment of environments) {
		if (!environment.isBuilt) {
			await builder.build(environment);
		}
	}
}

function buildEnvironments(builder: ViteBuilder, options: MarklessViteOptions) {
	const environments = new Map<string, BuildEnvironment>();
	for (const name of [
		viteEnvironmentName('client', options),
		viteEnvironmentName('server', options),
	]) {
		const environment = builder.environments[name];
		if (environment) {
			environments.set(name, environment);
		}
	}

	for (const environment of Object.values(builder.environments)) {
		if (marklessEnvironment(environment) === 'server') {
			environments.set(environment.name, environment);
		}
	}

	return [...environments.values()];
}

function skipDuplicateBuilds(builder: ViteBuilder, names: readonly string[]) {
	const guarded = builder as ViteBuilder & {
		[MARKLESS_SKIP_DUPLICATE_BUILDS]?: Set<string>;
	};

	const guardedNames = guarded[MARKLESS_SKIP_DUPLICATE_BUILDS] ?? new Set<string>();
	for (const name of names) {
		guardedNames.add(name);
	}

	if (guarded[MARKLESS_SKIP_DUPLICATE_BUILDS]) return;

	guarded[MARKLESS_SKIP_DUPLICATE_BUILDS] = guardedNames;
	const build = builder.build.bind(builder);
	builder.build = (environment: BuildEnvironment) => {
		if (guardedNames.has(environment.name) && environment.isBuilt) {
			return Promise.resolve([]);
		}
		return build(environment);
	};
}

function configDefaults(
	config: UserConfig,
	options: MarklessViteOptions,
	internalOptions: InternalMarklessRolldownOptions,
) {
	// Vite builtins (dynamic-import-vars) must never parse raw .tsrx: on
	// vite >= 8.1 they run before this plugin's transform (found by the
	// dashboard-migration consumer app on vite-plus 8.1.3).
	const dynamicImportVars = ((config.build ??= {}).dynamicImportVarsOptions ??= {});
	const exclude = Array.isArray(dynamicImportVars.exclude)
		? dynamicImportVars.exclude
		: dynamicImportVars.exclude
			? [dynamicImportVars.exclude]
			: [];
	dynamicImportVars.exclude = [...exclude, /\.tsrx(?:[?#]|$)/];

	if (config.build?.lib || config.build?.ssr) {
		return;
	}

	const build = (config.build ??= {});
	const ssrSymbolInput = ssrTsrxInput(config, options);
	if (ssrSymbolInput) {
		internalOptions.emitResumeModules = true;
		const rolldownOptions = (build.rolldownOptions ??= {});
		rolldownOptions.input = withSsrSymbolInput(
			rolldownOptions.input as RolldownInputConfig,
			ssrSymbolInput,
		);
	}
	build.modulePreload ??= false;
}

function ssrTsrxInput(config: UserConfig, options: MarklessViteOptions): string | null {
	const environments = (config as { environments?: Record<string, unknown> }).environments;
	const ssr = environments?.[viteEnvironmentName('server', options)] as
		| { build?: { rolldownOptions?: { input?: unknown } } }
		| undefined;
	return firstTsrxInput(ssr?.build?.rolldownOptions?.input);
}

function firstTsrxInput(input: unknown): string | null {
	if (typeof input === 'string') {
		return TSRX_INPUT_FILE.test(input) ? input : null;
	}
	if (Array.isArray(input)) {
		for (const item of input) {
			const match = firstTsrxInput(item);
			if (match) return match;
		}
		return null;
	}
	if (input && typeof input === 'object') {
		for (const value of Object.values(input as Record<string, unknown>)) {
			const match = firstTsrxInput(value);
			if (match) return match;
		}
	}
	return null;
}

function withSsrSymbolInput(
	input: RolldownInputConfig,
	ssrSymbolInput: string,
): Record<string, string> {
	const symbolInput = withQuery(ssrSymbolInput, { 'markless-symbols': null });
	if (isRolldownInputRecord(input)) {
		if (Object.keys(input).some((name) => /symbol/i.test(name))) return input;
		return { ...input, symbols: symbolInput };
	}
	if (typeof input === 'string') {
		const name = input.endsWith('.html') ? 'index' : 'app';
		return input === ssrSymbolInput
			? { symbols: symbolInput }
			: { [name]: input, symbols: symbolInput };
	}
	if (Array.isArray(input)) {
		return Object.fromEntries([
			...input.map((entry, index) => [`input${index}`, entry]),
			['symbols', symbolInput],
		]);
	}
	return { symbols: symbolInput };
}

function isRolldownInputRecord(input: RolldownInputConfig): input is Record<string, string> {
	return !!input && typeof input === 'object' && !Array.isArray(input);
}

function withOutputDefaults(
	output: MarklessOutputOptions,
	environment: MarklessEnvironment,
): OutputOptions | OutputOptions[] {
	if (Array.isArray(output)) {
		return output.map((item) => outputDefaults(item, environment));
	}

	if (!output) {
		return outputDefaults({}, environment);
	}

	return outputDefaults(output, environment);
}

function defaultOutDir(environment: MarklessEnvironment) {
	if (environment === 'server') {
		return 'dist/server';
	}

	return undefined;
}

function configEnvironmentKind(
	name: string,
	config: EnvironmentOptions,
	options: MarklessViteOptions,
): MarklessEnvironment | null {
	if (config.build?.lib) {
		return null;
	}

	if (name === viteEnvironmentName('client', options)) {
		return 'client';
	}

	if (name === viteEnvironmentName('server', options)) {
		return 'server';
	}

	if (isServerViteEnvironment({ name, config })) {
		return 'server';
	}

	return null;
}

async function matchesTransformedTsrxSource(
	ctx: { file?: string; type?: string; read?: () => string | Promise<string> },
	transformedSources: ReadonlyMap<string, string>,
): Promise<boolean> {
	if (!ctx.file || ctx.type === 'delete' || typeof ctx.read !== 'function') {
		return false;
	}
	const transformedSource = transformedSources.get(ctx.file);
	if (transformedSource === undefined) {
		return false;
	}
	try {
		return (await ctx.read()) === transformedSource;
	} catch {
		return false;
	}
}

function runHook(hook: unknown, context: unknown, ...args: unknown[]) {
	if (typeof hook !== 'function') {
		return null;
	}
	return hook.call(context, ...args);
}

type MarklessVitePluginApi = {
	invalidateGeneratedModules: MarklessRolldownPluginApi['invalidateGeneratedModules'];
	runtimeDemandMaps: MarklessRolldownPluginApi['runtimeDemandMaps'];
	runtimeDemandSources: MarklessRolldownPluginApi['runtimeDemandSources'];
	declareRouteModules: MarklessRolldownPluginApi['declareRouteModules'];
	/** A host plugin names the root-relative page module it renders at a URL, so a dev edit reloads only the open pages it reached. */
	declarePageForUrl: (pageForUrl: (url: string) => string | undefined) => void;
	registerBundleGraphAdder?: (adder: BundleGraphAdder) => void;
	registerDevInjection?: (injection: GlobalInjections) => void;
	registerPreloadGraphEntries?: (adder: PreloadGraphEntriesAdder) => void;
	/** Builds the client environment alone and writes what the later environments read; a build's child process calls it. */
	buildClientOnly?: (builder: ViteBuilder, handoffFile: string) => Promise<void>;
};

function getBuildEnvironment(context: unknown): MarklessEnvironment {
	const pluginContext = context as { environment?: Environment };
	return marklessEnvironment(pluginContext.environment);
}

export type MarklessVitePlugin = ReturnType<typeof markless>[number];

