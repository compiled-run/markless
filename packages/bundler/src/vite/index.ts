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
import { resolve } from 'pathe';
import { joinURL, parsePath } from 'ufo';
import { createPreloadGraphAdder } from '../build/bundle-graph.ts';
import { emitPrerenderedPage } from '../build/prerender.ts';
import { executionLogActivationInjection } from '../execution-log.ts';
import { outputDefaults } from '../build/chunking.ts';
import { createMarklessRolldownPlugin } from '../rolldown.ts';
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
import {
	isServerViteEnvironment,
	marklessEnvironment,
	transformMarklessRequest,
	viteEnvironmentName,
} from './environment.ts';
import { createViteHmr } from './hmr.ts';

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
}

type MarklessOutputOptions = OutputOptions | OutputOptions[] | undefined;
type InternalMarklessRolldownOptions = MarklessRolldownOptions & {
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
	const rolldownOptions: InternalMarklessRolldownOptions = { ...options };
	const prerender = process.env.MARKLESS_PRERENDER === '1';
	rolldownOptions.prerender = false;
	rolldownOptions.prerenderWakeChannel = process.env.MARKLESS_PRERENDER_WAKE === '1';
	rolldownOptions.productionResumeModuleUrls = new Map();
	rolldownOptions.productionPrerenderWakeModuleUrls = new Map();
	let prerenderEntry: string | null = null;
	let resolvedRoot = '';
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
	};
	let devPrerender: ReturnType<typeof createDevPrerender> | undefined;
	const devTags = createDevTags();
	rolldownOptions.devInjections = devTags.tags;
	const basePlugin = createMarklessRolldownPlugin({
		environment: getBuildEnvironment,
		options: rolldownOptions,
	}) as Plugin & {
		api: { invalidateGeneratedModules: typeof hmrOptions.invalidateGeneratedModules };
	};
	const hmr = createViteHmr(hmrOptions);

	const marklessPlugin = {
		...basePlugin,
		name: 'vite-plugin-markless',
		enforce: 'post',
		sharedDuringBuild: true,
		api: {
			...basePlugin.api,
			registerBundleGraphAdder: (adder: BundleGraphAdder) => bundleGraphAdders.add(adder),
			registerDevInjection: (injection: GlobalInjections) => devTags.register(injection),
			registerPreloadGraphEntries: (adder: PreloadGraphEntriesAdder) =>
				bundleGraphAdders.add(createPreloadGraphAdder(adder)),
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
			if (prerender) {
				prerenderEntry = ssrTsrxInput(config, options);
				rolldownOptions.prerender = prerenderEntry !== null;
			}
		},
		configResolved(resolvedConfig) {
			resolvedRoot = resolvedConfig.root;
			clientOutDir = resolvedConfig.build?.outDir ?? 'dist';
			const serve = resolvedConfig.command === 'serve';
			hmrOptions.base = resolvedConfig.base;
			hmrOptions.enabled = serve && options.hmr !== false;
			rolldownOptions.dev = serve;
			rolldownOptions.rootDir = resolvedConfig.root;
			rolldownOptions.publicPath = (fileName) => joinURL(resolvedConfig.base, fileName);
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
				await buildMarklessEnvironments(builder, options);
				if (prerender && prerenderEntry) {
					const clientEnvironment = builder.environments[viteEnvironmentName('client', options)];
					await emitPrerenderedPage({
						root: clientEnvironment?.config.root ?? resolvedRoot,
						entry: resolve(resolvedRoot, prerenderEntry),
						outDir: clientEnvironment?.config.build?.outDir ?? clientOutDir,
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
		configureServer(server: ViteDevServer) {
			server.config.logger?.info(
				'markless diagnostics available - window.__MARKLESS_DEBUG__ records containers, lifecycles, and event routing; markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package.',
			);
			rolldownOptions.devServer = {
				transformRequest: (url, environment) =>
					transformMarklessRequest(server, url, environment, options),
			};
			hmr.configureServer(server);
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
				if (rolldownOptions.dev === true && TSRX_INPUT_FILE.test(id)) {
					transformedTsrxSources.set(parsePath(id).pathname, code);
				}
				try {
					return await runHook(basePlugin.transform, this, code, id, transformOptions);
				} catch (error) {
					if (rolldownOptions.dev === true && TSRX_INPUT_FILE.test(id)) {
						hmr.reportError(this.environment, error);
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
	} satisfies Plugin & { api: MarklessVitePluginApi };

	return [marklessPlugin];
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
	if (isRolldownInputRecord(input)) {
		if (Object.keys(input).some((name) => /symbol/i.test(name))) return input;
		return { ...input, symbols: ssrSymbolInput };
	}
	if (typeof input === 'string') {
		const name = input.endsWith('.html') ? 'index' : 'app';
		return input === ssrSymbolInput
			? { symbols: ssrSymbolInput }
			: { [name]: input, symbols: ssrSymbolInput };
	}
	if (Array.isArray(input)) {
		return Object.fromEntries([
			...input.map((entry, index) => [`input${index}`, entry]),
			['symbols', ssrSymbolInput],
		]);
	}
	return { symbols: ssrSymbolInput };
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
	registerBundleGraphAdder?: (adder: BundleGraphAdder) => void;
	registerDevInjection?: (injection: GlobalInjections) => void;
	registerPreloadGraphEntries?: (adder: PreloadGraphEntriesAdder) => void;
};

function getBuildEnvironment(context: unknown): MarklessEnvironment {
	const pluginContext = context as { environment?: Environment };
	return marklessEnvironment(pluginContext.environment);
}

export type MarklessVitePlugin = ReturnType<typeof markless>[number];
