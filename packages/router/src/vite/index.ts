import { existsSync } from 'node:fs';
import { nitro } from 'nitro/vite';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'pathe';
import {
	type EnvironmentOptions,
	sortUserPlugins,
	type Plugin,
	type PluginOption,
	type ResolvedConfig,
	type UserConfig,
} from 'vite';
import type { InputOption, OutputChunk } from 'rolldown';
import {
	decodePath,
	joinURL,
	parsePath,
	parseQuery,
	parseURL,
	stringifyQuery,
	withoutLeadingSlash,
} from 'ufo';
// Build-time-only dependency: the bundler owns the symbol virtual module id
// shape (single source of truth); browser entries must never reach this file.
import { symbolVirtualModuleSourceFile } from '@markless/bundler/preload';
import { transformRequestFileSource } from '../request-files.ts';
import { anchorTransformPlugin } from './anchor-transform.ts';
import {
	clientAssetFileName,
	createClientAssetsManifest,
	type MarklessRouterClientAssetRoutes,
	type MarklessRouterClientAssetsManifest,
	readClientAssetsManifest,
	removeClientAssetsManifest,
	writeClientAssetsManifest,
} from './client-assets-manifest.ts';
import { htmlTransformPlugin } from './html-transform.ts';
import { mdxTransformPlugin } from './mdx.ts';
import { routeTypegenPlugin } from './route-typegen.ts';

const ROUTE_DISCOVERY_ID = 'virtual:markless-router/routes';
const CLIENT_ENTRY_ID = 'virtual:markless-router/client-entry';
const RESUME_ENTRY_ID = 'virtual:markless-router/resume-entry';
const RESUME_ENTRY_ORIGIN = '/entries/resume-entry.ts';
const RESUME_ENTRY_PATH_ID = 'virtual:markless-router/resume-entry-path';
const PRERENDER_WAKE_ENTRY_ID = 'virtual:markless-router/prerender-wake-entry';
const PRERENDER_WAKE_ENTRY_ORIGIN = '/entries/prerender-wake-entry.ts';
const PRERENDER_WAKE_ENTRY_PATH_ID = 'virtual:markless-router/prerender-wake-entry-path';
const NAVIGATION_ENTRY_ID = 'virtual:markless-router/navigation-entry';
const NAVIGATION_ENTRY_ORIGIN = '/entries/client-entry.ts';
const NAVIGATION_ENTRY_PATH_ID = 'virtual:markless-router/navigation-entry-path';
const ROUTE_PRELOADS_ID = 'virtual:markless-router/route-preloads';
const ROUTE_PRELOADS_PLACEHOLDER = '__MARKLESS_ROUTER_ROUTE_PRELOADS__';
const SERVER_ENTRY_ID = 'virtual:markless-router/server-entry';
const ROUTE_HREF_ID = 'virtual:markless-router/route-href';
const ROUTER_OPTIONS_ID = 'virtual:markless-router/options';
const PUBLIC_VIRTUAL_MODULE_ID_RE =
	/^virtual:markless-router\/(?:routes|client-entry|resume-entry|resume-entry-path|prerender-wake-entry|prerender-wake-entry-path|navigation-entry|navigation-entry-path|route-preloads|server-entry|route-href|options)(?:\?.*)?$/;
const VITE_PLUGIN_FILE = decodePath(parseURL(import.meta.url).pathname);
// The app-context entry files ship as SOURCE at src/vite/entries (see the
// `files` field): running from src, they sit next to this file; running from
// the published dist/vite.js, they sit under <package-root>/src/vite/entries.
const VIRTUAL_ENTRY_DIR = VITE_PLUGIN_FILE.endsWith('.ts')
	? join(dirname(VITE_PLUGIN_FILE), 'entries')
	: join(dirname(dirname(VITE_PLUGIN_FILE)), 'src/vite/entries');
const DEFAULT_WATCH_IGNORES = [
	'**/.nitro/**',
	'**/.output/**',
	'**/node_modules/**',
	'**/dist/**',
] as const;

const virtualEntryFiles = {
	[ROUTE_DISCOVERY_ID]: 'route-discovery.ts',
	[CLIENT_ENTRY_ID]: 'client-entry.ts',
	[RESUME_ENTRY_ID]: 'resume-entry.ts',
	[PRERENDER_WAKE_ENTRY_ID]: 'prerender-wake-entry.ts',
	[NAVIGATION_ENTRY_ID]: 'client-entry.ts',
	[SERVER_ENTRY_ID]: 'server-entry.ts',
	[ROUTE_HREF_ID]: 'route-href.ts',
} as const;

export interface MarklessRouterOptions {
	// 'hash' routes by location.hash paths (#/r/x -> route /r/x) for apps whose
	// URLs live in the fragment; 'path' (default) routes by pathname.
	mode?: 'path' | 'hash';
	nitro?: boolean;
}

export function router(options: MarklessRouterOptions = {}): PluginOption[] {
	// Captured at factory time so config wrappers can scope the env var to the
	// plugin construction, mirroring the MARKLESS_PRERENDER pattern.
	prerenderWakeChannelCaptured = process.env.MARKLESS_PRERENDER_WAKE === '1';
	if (options.nitro === false) {
		return [
			mdxTransformPlugin(),
			requestFileTransformPlugin(),
			routeTypegenPlugin(),
			anchorTransformPlugin(),
			htmlTransformPlugin(),
			virtualModulesPlugin(),
		];
	}

	const nitroPlugins = nitro();
	const resumeEntry = resumeEntryState();
	const prerenderWakeEntry = resumeEntryState();
	const navigationEntry = resumeEntryState();
	const routePreloads = routePreloadState();

	return [
		routerConfigPlugin(
			nitroPlugins,
			resumeEntry,
			prerenderWakeEntry,
			navigationEntry,
			routePreloads,
		),
		devSourceModuleRequestPlugin(),
		mdxTransformPlugin(),
		requestFileTransformPlugin(),
		routeTypegenPlugin(),
		anchorTransformPlugin(),
		htmlTransformPlugin(),
		virtualModulesPlugin(resumeEntry, prerenderWakeEntry, navigationEntry, routePreloads),
		nitroPlugins,
	];
}

// Dev module requests for authored source files: Vite's glob imports (the
// resume entry's page-module table) emit ROOT-RELATIVE URLs like
// `/pages/r/[repo]/index.tsrx?import&markless-resume`. The dev server does
// not treat the unknown .tsrx/.mdx extension at that shape as a module
// request, so the request falls through to the nitro route handler and 404s
// — which kills the FIRST full-resume wake of every dev interaction. The
// /@fs/<absolute> form is served (and resolves to the same module-graph
// entry), so rewrite qualifying requests before Vite's own middlewares run.
function devSourceModuleRequestPlugin(): Plugin {
	let root = '';
	return {
		name: 'markless-router:dev-source-module-requests',
		apply: 'serve',
		configResolved(config) {
			root = config.root;
		},
		configureServer(server) {
			server.middlewares.use((req, _res, next) => {
				const url = req.url ?? '';
				const queryIndex = url.indexOf('?');
				const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
				const query = queryIndex === -1 ? '' : url.slice(queryIndex + 1);
				if (
					root !== '' &&
					/\.(?:tsrx|mdx)$/.test(pathname) &&
					/(?:^|&)(?:import(?:=|&|$)|markless-)/.test(query) &&
					existsSync(join(root, decodePath(pathname)))
				) {
					req.url = `/@fs${join(root, decodePath(pathname))}?${query}`;
				}
				next();
			});
		},
	};
}

function routerConfigPlugin(
	nitroPluginsFromRouter: readonly Plugin[],
	resumeEntry: ResumeEntryState,
	prerenderWakeEntry: ResumeEntryState,
	navigationEntry: ResumeEntryState,
	routePreloads: RoutePreloadState,
): Plugin {
	let clientOutDir = '';
	let clientEnvironmentName = '';
	let clientEnvironmentConfig: object | undefined;
	let serverEnvironmentConfig: object | undefined;
	let productionBuild = false;
	let pendingClientAssets: MarklessRouterClientAssetsManifest | undefined;

	return {
		name: 'markless-router:vite',
		enforce: 'pre',
		sharedDuringBuild: true,
		config(config: UserConfig) {
			throwIfUserAddedNitro(config.plugins, nitroPluginsFromRouter);
			config.environments ??= {};
			const ssrEnvironment = (config.environments.ssr ??= {}) as {
				build?: { rolldownOptions?: { input?: unknown } };
			};
			ssrEnvironment.build ??= {};
			ssrEnvironment.build.rolldownOptions ??= {};
			ssrEnvironment.build.rolldownOptions.input ??= scopedVirtualEntryId(
				SERVER_ENTRY_ID,
				config.root,
			);

			const serverWatch = withWatchIgnores(config.server?.watch);

			return {
				nitro: createNitroConfig(config.nitro, config.root, serverWatch.ignored),
				server: {
					...config.server,
					watch: serverWatch,
				},
			};
		},
		configResolved(config) {
			productionBuild = config.command === 'build';
			if (productionBuild) {
				const clientEnvironments = Object.entries(config.environments).filter(
					([, environment]) => environment.consumer === 'client',
				);
				if (clientEnvironments.length !== 1) {
					throw new Error(
						`Markless Router requires exactly one client build environment; found ${clientEnvironments.length}.`,
					);
				}
				const [name, environment] = clientEnvironments[0]!;
				clientEnvironmentName = name;
				clientEnvironmentConfig = environment;
				serverEnvironmentConfig = config.environments.ssr;
				clientOutDir = resolve(config.root, environment.build.outDir);
			}
			for (const entry of [resumeEntry, prerenderWakeEntry, navigationEntry, routePreloads]) {
				entry.base = config.base;
			}
			routePreloads.root = config.root;
		},
		configEnvironment(_name, config) {
			configureRouteInputs(config);
		},
		async buildStart() {
			if (!productionBuild) return;
			if (!clientOutDir) {
				throw new Error(
					'Markless Router could not resolve the client output directory for its client-assets manifest.',
				);
			}

			const environment = this.environment;
			const isClientEnvironment = environment?.name
				? environment.name === clientEnvironmentName
				: environment?.config === clientEnvironmentConfig;
			const isRouterServerEnvironment = environment?.name
				? environment.name === 'ssr'
				: environment?.config === serverEnvironmentConfig;

			if (isClientEnvironment) {
				pendingClientAssets = undefined;
				resumeEntry.fileName = undefined;
				prerenderWakeEntry.fileName = undefined;
				navigationEntry.fileName = undefined;
				routePreloads.routes = { navigation: {}, ssr: {}, styles: {} };
				routePreloads.persisted = false;
				await removeClientAssetsManifest(clientOutDir);
				return;
			}
			if (!isRouterServerEnvironment) return;

			const manifest = await readClientAssetsManifest(clientOutDir, routePreloads.base);
			resumeEntry.fileName = clientAssetFileName(manifest.entries.resume, manifest.base);
			prerenderWakeEntry.fileName = manifest.entries.prerenderWake
				? clientAssetFileName(manifest.entries.prerenderWake, manifest.base)
				: undefined;
			navigationEntry.fileName = clientAssetFileName(
				manifest.entries.navigation,
				manifest.base,
			);
			routePreloads.routes = manifest.routes;
			routePreloads.persisted = true;
		},
		generateBundle: {
			// Vite finalizes and propagates importedCss in vite:css-post.
			order: 'post',
			handler(_options, bundle) {
				if (this.environment?.config.consumer !== 'client') {
					return;
				}

				const resumeChunk = Object.values(bundle).find(
					(item): item is OutputChunk =>
						item.type === 'chunk' && isVirtualEntryChunk(item, RESUME_ENTRY_ORIGIN),
				);
				if (resumeChunk) {
					resumeEntry.fileName = resumeChunk.fileName;
				}
				const prerenderWakeChunk = Object.values(bundle).find(
					(item): item is OutputChunk =>
						item.type === 'chunk' &&
						isVirtualEntryChunk(item, PRERENDER_WAKE_ENTRY_ORIGIN),
				);
				if (prerenderWakeChunk) {
					prerenderWakeEntry.fileName = prerenderWakeChunk.fileName;
				}
				const navigationChunk = Object.values(bundle).find(
					(item): item is OutputChunk =>
						item.type === 'chunk' && isVirtualEntryChunk(item, NAVIGATION_ENTRY_ORIGIN),
				);
				if (navigationChunk) {
					navigationEntry.fileName = navigationChunk.fileName;
				}
				routePreloads.routes = routeModulePreloadsFromBundle({
					base: routePreloads.base,
					bundle,
					navigationChunk,
					prerenderWakeChunk,
					resumeChunk,
					root: routePreloads.root,
				});
				patchRoutePreloadsInBundle(bundle, routePreloads.routes);
				if (productionBuild) {
					const wakeRequired = prerenderWakeChannelEnabled();
					if (
						!resumeEntry.fileName ||
						(wakeRequired && !prerenderWakeEntry.fileName) ||
						!navigationEntry.fileName
					) {
						throw new Error(
							wakeRequired
								? 'Markless Router client build did not emit its resume, prerender-wake, and navigation entries.'
								: 'Markless Router client build did not emit its resume and navigation entries.',
						);
					}
					pendingClientAssets = createClientAssetsManifest({
						base: routePreloads.base,
						resumeEntry: joinURL(routePreloads.base, resumeEntry.fileName),
						...(prerenderWakeEntry.fileName
							? {
									prerenderWakeEntry: joinURL(
										routePreloads.base,
										prerenderWakeEntry.fileName,
									),
								}
							: {}),
						navigationEntry: joinURL(routePreloads.base, navigationEntry.fileName),
						routes: routePreloads.routes,
					});
				}
			},
		},
		async writeBundle() {
			const environment = this.environment;
			const isClientEnvironment = environment?.name
				? environment.name === clientEnvironmentName
				: environment?.config === clientEnvironmentConfig;
			if (!productionBuild || !isClientEnvironment) return;
			if (!pendingClientAssets) {
				throw new Error(
					'Markless Router client build finished without a client-assets manifest.',
				);
			}
			await writeClientAssetsManifest(clientOutDir, pendingClientAssets);
		},
	};
}

function configureRouteInputs(config: EnvironmentOptions): void {
	config.build ??= {};
	config.build.rolldownOptions ??= {};
	if (config.consumer === 'client') {
		config.build.rolldownOptions.input = routerClientInput(
			config.build.rolldownOptions.input,
			configRoot(config),
		);
		config.build.rolldownOptions.preserveEntrySignatures ??= 'exports-only';
	} else {
		config.build.rolldownOptions.input ??= scopedVirtualEntryId(
			SERVER_ENTRY_ID,
			configRoot(config),
		);
		config.build.rolldownOptions.external = withExternal(
			config.build.rolldownOptions.external,
			'nitro',
		);
	}
}

type RolldownExternal = NonNullable<
	NonNullable<NonNullable<EnvironmentOptions['build']>['rolldownOptions']>['external']
>;

function withExternal(external: RolldownExternal | undefined, id: string): RolldownExternal {
	if (Array.isArray(external)) {
		return external.includes(id) ? external : [...external, id];
	}
	if (typeof external === 'string') {
		return external === id ? external : [external, id];
	}
	if (external === undefined) {
		return [id];
	}
	return external;
}

function requestFileTransformPlugin(): Plugin {
	let root = '';

	return {
		name: 'markless-router:request-files',
		enforce: 'pre',
		configResolved(config: ResolvedConfig) {
			root = config.root;
		},
		transform(code, id) {
			const fileId = requestFileIdForTransform(root, id);
			if (!fileId) {
				return undefined;
			}

			const transform = transformRequestFileSource(fileId, code);
			return transform ? { code: transform.code, map: null } : undefined;
		},
	};
}

function requestFileIdForTransform(root: string, id: string): string | undefined {
	if (id.startsWith('\0')) {
		return undefined;
	}

	const pathname = decodePath(parseURL(id).pathname);
	if (!isAbsolute(pathname)) {
		return undefined;
	}

	const relativeFileId = root
		? withoutLeadingSlash(normalize(relative(root, pathname)))
		: withoutLeadingSlash(normalize(pathname));
	if (relativeFileId.startsWith('api/') || relativeFileId.startsWith('middleware/')) {
		return relativeFileId;
	}

	return relativeFileId.match(/(?:^|\/)((?:api|middleware)\/.+\.ts)$/)?.[1];
}

function requestFileBuildTransformPlugin(root: string): Plugin {
	return {
		name: 'markless-router:nitro-request-files',
		transform(code, id) {
			const fileId = requestFileIdForTransform(root, id);
			if (!fileId) {
				return undefined;
			}

			const transform = transformRequestFileSource(fileId, code);
			return transform ? { code: transform.code, map: null } : undefined;
		},
	};
}

function createNitroConfig(
	nitroConfig: UserConfig['nitro'] | undefined,
	root = '.',
	serverWatchIgnored: readonly WatchIgnorePattern[] = [],
): NonNullable<UserConfig['nitro']> {
	const scanDirs = Array.isArray(nitroConfig?.scanDirs)
		? nitroConfig.scanDirs.filter((dir): dir is string => typeof dir === 'string')
		: [];
	const watchOptions = withWatchIgnores(nitroConfig?.watchOptions, serverWatchIgnored);
	const publicAssets = Array.isArray(nitroConfig?.publicAssets) ? nitroConfig.publicAssets : [];

	return {
		...nitroConfig,
		apiDir: nitroConfig?.apiDir ?? 'api',
		devServer: nitroConfig?.devServer,
		publicAssets: [
			{
				baseURL: '/assets',
				dir: join(root, 'dist/assets'),
			},
			{
				baseURL: '/assets',
				dir: join(root, 'node_modules/.nitro/vite/services/ssr/assets'),
			},
			...publicAssets,
		],
		routesDir: nitroConfig?.routesDir ?? '.output/markless/router/nitro-routes',
		rolldownConfig: withRequestFileBuildPlugin(nitroConfig?.rolldownConfig, root),
		rollupConfig: withRequestFileBuildPlugin(nitroConfig?.rollupConfig, root),
		scanDirs: [...new Set(['.', ...scanDirs])],
		watchOptions,
	} as NonNullable<UserConfig['nitro']>;
}

// Vite's watcher and nitro's watcher name their ignore patterns with different
// types, so the pattern stays generic and each caller keeps its own.
export type WatchIgnorePattern = Extract<
	NonNullable<NonNullable<NonNullable<UserConfig['server']>['watch']>['ignored']>,
	readonly unknown[]
>[number];

function withWatchIgnores<Pattern>(
	watchOptions:
		| { readonly ignored?: Pattern | readonly Pattern[]; readonly followSymlinks?: boolean }
		| null
		| undefined,
	extraIgnored: readonly Pattern[] = [],
): { followSymlinks: boolean; ignored: (Pattern | string)[] } {
	const watchOptionsObject = isRecord(watchOptions) ? watchOptions : {};

	return {
		...watchOptionsObject,
		followSymlinks: watchOptionsObject.followSymlinks ?? false,
		ignored: [
			...toWatchIgnores(watchOptionsObject.ignored),
			...extraIgnored,
			...DEFAULT_WATCH_IGNORES,
		],
	};
}

function toWatchIgnores<Pattern>(value: Pattern | readonly Pattern[] | undefined): Pattern[] {
	if (value === undefined) return [];
	return isPatternList(value) ? [...value] : [value];
}

function isPatternList<Pattern>(value: Pattern | readonly Pattern[]): value is readonly Pattern[] {
	return Array.isArray(value);
}


function withRequestFileBuildPlugin(config: unknown, root: string): Record<string, unknown> {
	const configObject = isRecord(config) ? config : {};
	const plugins = Array.isArray(configObject.plugins)
		? configObject.plugins
		: configObject.plugins
			? [configObject.plugins]
			: [];

	return {
		...configObject,
		plugins: [requestFileBuildTransformPlugin(root), ...plugins],
	};
}

function throwIfUserAddedNitro(
	plugins: UserConfig['plugins'] | undefined,
	nitroPluginsFromRouter: readonly Plugin[],
): void {
	const routerNitroPluginSet = new Set(nitroPluginsFromRouter);
	const duplicateNitroPlugin = sortUserPlugins(plugins as Parameters<typeof sortUserPlugins>[0])
		.flat()
		.filter(Boolean)
		.find(
			(plugin) =>
				typeof plugin.name === 'string' &&
				plugin.name.startsWith('nitro:') &&
				!routerNitroPluginSet.has(plugin),
		);

	if (duplicateNitroPlugin) {
		throw new Error(
			'Markless Router wires Nitro internally. Remove nitro() from vite.config.ts and keep plugins: [markless(), router()].',
		);
	}
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === 'object' && input !== null;
}

interface ResumeEntryState {
	base: string;
	fileName: string | undefined;
}

interface RoutePreloadState {
	base: string;
	persisted: boolean;
	root: string;
	routes: RoutePreloadMaps;
}

type RoutePreloadMaps = MarklessRouterClientAssetRoutes;

function resumeEntryState(): ResumeEntryState {
	return { base: '/', fileName: undefined };
}

function routePreloadState(): RoutePreloadState {
	return {
		base: '/',
		persisted: false,
		root: '.',
		routes: { navigation: {}, ssr: {}, styles: {} },
	};
}

// The prerender-wake entry ships BOTH boot paths (a request-divergent hit on
// the same route still needs the payload path), costing shipped-JS wall bytes
// that only the tier demolition frees. Until that lands, the wake channel is
// opt-in through the same internal env pattern as MARKLESS_PRERENDER.
let prerenderWakeChannelCaptured = false;
function prerenderWakeChannelEnabled(): boolean {
	return prerenderWakeChannelCaptured;
}

function routerClientInput(input: InputOption | undefined, root: string): InputOption | undefined {
	const resumeEntryId = scopedVirtualEntryId(RESUME_ENTRY_ID, root);
	const prerenderWakeEntryId = scopedVirtualEntryId(PRERENDER_WAKE_ENTRY_ID, root);
	const navigationEntryId = scopedVirtualEntryId(NAVIGATION_ENTRY_ID, root);
	const wakeEntries = prerenderWakeChannelEnabled() ? [prerenderWakeEntryId] : [];
	if (input === undefined) {
		return [resumeEntryId, ...wakeEntries, navigationEntryId];
	}

	if (typeof input === 'string' || Array.isArray(input)) {
		return [
			resumeEntryId,
			...wakeEntries,
			navigationEntryId,
			...(Array.isArray(input) ? input : [input]),
		];
	}

	if (isRecord(input)) {
		return {
			...input,
			'markless-router-resume': resumeEntryId,
			...(prerenderWakeChannelEnabled()
				? { 'markless-router-prerender-wake': prerenderWakeEntryId }
				: {}),
			'markless-router-navigation': navigationEntryId,
		};
	}

	return input;
}

function isVirtualEntryChunk(
	chunk: {
		readonly facadeModuleId?: string | null;
		readonly moduleIds?: readonly string[];
	},
	origin: string,
) {
	return [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])].some((id) =>
		id ? decodePath(parseURL(id).pathname).endsWith(origin) : false,
	);
}

function virtualModulesPlugin(
	resumeEntry: ResumeEntryState = resumeEntryState(),
	prerenderWakeEntry: ResumeEntryState = resumeEntryState(),
	navigationEntry: ResumeEntryState = resumeEntryState(),
	routePreloads: RoutePreloadState = routePreloadState(),
): Plugin {
	let root = '';

	return {
		name: 'markless-router:routes',
		sharedDuringBuild: true,
		configResolved(config) {
			root = config.root;
		},
		resolveId: {
			filter: {
				id: PUBLIC_VIRTUAL_MODULE_ID_RE,
			},
			handler(id) {
				const baseId = virtualModuleBaseId(id);
				if (
					baseId === SERVER_ENTRY_ID ||
					baseId === RESUME_ENTRY_PATH_ID ||
					baseId === PRERENDER_WAKE_ENTRY_PATH_ID ||
					baseId === NAVIGATION_ENTRY_PATH_ID ||
					baseId === ROUTE_PRELOADS_ID ||
					baseId === ROUTER_OPTIONS_ID
				) {
					return `\0${baseId}${rootScopeQuery(root, id)}`;
				}

				const entryFile = virtualEntryFiles[baseId as keyof typeof virtualEntryFiles];
				if (!entryFile) {
					return undefined;
				}
				return `${join(VIRTUAL_ENTRY_DIR, entryFile)}${rootScopeQuery(root, id)}`;
			},
		},
		load(id) {
			if (id.startsWith(`\0${SERVER_ENTRY_ID}`)) {
				return serverEntrySource(root);
			}
			if (id.startsWith(`\0${RESUME_ENTRY_PATH_ID}`)) {
				return entryPathSource('resumeEntryPath', resumeEntry, RESUME_ENTRY_ID, root);
			}
			if (id.startsWith(`\0${PRERENDER_WAKE_ENTRY_PATH_ID}`)) {
				// Unlike the resume entry, there is no dev @id fallback here: a
				// truthy path with no emitted entry would flip every served page
				// to the empty-delta container with a dead wake URL.
				if (!prerenderWakeChannelEnabled() || !prerenderWakeEntry.fileName) {
					return 'export const prerenderWakeEntryPath = undefined;';
				}
				return entryPathSource(
					'prerenderWakeEntryPath',
					prerenderWakeEntry,
					PRERENDER_WAKE_ENTRY_ID,
					root,
				);
			}
			if (id.startsWith(`\0${NAVIGATION_ENTRY_PATH_ID}`)) {
				return entryPathSource(
					'navigationEntryPath',
					navigationEntry,
					NAVIGATION_ENTRY_ID,
					root,
				);
			}
			if (id.startsWith(`\0${ROUTE_PRELOADS_ID}`)) {
				return routePreloadsSource(
					routePreloads,
					this?.environment?.config.consumer === 'client',
				);
			}
			if (id.startsWith(`\0${ROUTER_OPTIONS_ID}`)) {
				return 'export const routerMode = "path"; // retained for compat; hash paths are always first-class';
			}
		},
	};
}

function entryPathSource(
	exportName: string,
	entry: ResumeEntryState,
	entryId: string,
	root: string,
): string {
	const path = entry.fileName
		? joinURL(entry.base, entry.fileName)
		: joinURL(entry.base, '@id', scopedVirtualEntryId(entryId, root));
	return `export const ${exportName} = ${JSON.stringify(path)};`;
}

function serverEntrySource(root: string): string {
	const query = rootScopeQuery(root);
	return [
		`import { createServerEntry } from '@markless/router/vite/runtime/create-server-entry';`,
		`import { resumeEntryPath } from '${RESUME_ENTRY_PATH_ID}${query}';`,
		`import { prerenderWakeEntryPath } from '${PRERENDER_WAKE_ENTRY_PATH_ID}${query}';`,
		`import { navigationEntryPath } from '${NAVIGATION_ENTRY_PATH_ID}${query}';`,
		`import { routeModulePreloads, routeSsrModulePreloads, routeStylesheets } from '${ROUTE_PRELOADS_ID}${query}';`,
		`import { pageModuleLoaders, routeFileIds } from '${ROUTE_DISCOVERY_ID}${query}';`,
		`const documentModuleLoaders = import.meta.glob(['/document.tsrx']);`,
		`const entry = createServerEntry({`,
		`  dev: import.meta.env.DEV,`,
		`  resumeEntryPath,`,
		`  prerenderWakeEntryPath,`,
		`  navigationEntryPath,`,
		`  routeModulePreloads,`,
		`  routeSsrModulePreloads,`,
		`  routeStylesheets,`,
		`  documentModuleLoader: documentModuleLoaders['/document.tsrx'],`,
		`  pageModuleLoaders,`,
		`  routeFileIds,`,
		`});`,
		`export const fetch = entry.fetch;`,
		`export default entry;`,
	].join('\n');
}

function rootScopeQuery(root: string, id = ''): string {
	const parsed = parsePath(id);
	const query = stringifyQuery({
		...parseQuery(parsed.search),
		'markless-router-root': root || '.',
	});
	// `lang.ts` last: Rolldown's module-type detection reads the query tail,
	// and a bare `.ts?<query>` from a linked package otherwise fails with
	// "Failed to detect the lang" (build-compat shim only; zero runtime).
	return query ? `?${query}&lang.ts` : '';
}

function routePreloadsSource(state: RoutePreloadState, client: boolean): string {
	const routes =
		client || !state.persisted
			? { navigation: state.routes.navigation, ssr: state.routes.ssr }
			: state.routes;
	const routeStylesheetExport = client
		? []
		: [
				`export const routeStylesheets = ${state.persisted ? 'routePreloadData.styles ?? {}' : 'undefined'};`,
			];
	return [
		`const routePreloadsJson = globalThis.__marklessRouterRoutePreloadsJson ?? ${JSON.stringify(ROUTE_PRELOADS_PLACEHOLDER)};`,
		`const routePreloadData = routePreloadsJson === ${JSON.stringify(ROUTE_PRELOADS_PLACEHOLDER)} ? ${JSON.stringify(routes)} : JSON.parse(routePreloadsJson);`,
		`export const routeModulePreloads = routePreloadData.navigation ?? {};`,
		`export const routeSsrModulePreloads = routePreloadData.ssr ?? {};`,
		...routeStylesheetExport,
		`export function preloadRouteModule(file, document = globalThis.document) {`,
		`  const hrefs = routeModulePreloads[file];`,
		`  if (!hrefs?.length || !document?.head) return [];`,
		`  const seen = new Set([...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.getAttribute?.('href') || link.href).filter(Boolean));`,
		`  const appended = [];`,
		`  for (const href of hrefs) {`,
		`    if (!href || seen.has(href)) continue;`,
		`    const link = document.createElement('link');`,
		`    link.rel = 'modulepreload';`,
		`    link.href = href;`,
		`    link.crossOrigin = 'anonymous';`,
		`    document.head.appendChild(link);`,
		`    seen.add(href);`,
		`    appended.push(href);`,
		`  }`,
		`  return appended;`,
		`}`,
	].join('\n');
}

function patchRoutePreloadsInBundle(
	bundle: Record<string, unknown>,
	routes: RoutePreloadMaps,
): void {
	const replacement = jsStringLiteralContent(
		JSON.stringify({ navigation: routes.navigation, ssr: routes.ssr }),
	);
	for (const chunk of outputChunks(bundle)) {
		if (!chunk.code?.includes(ROUTE_PRELOADS_PLACEHOLDER)) continue;
		chunk.code = chunk.code.replace(ROUTE_PRELOADS_PLACEHOLDER, replacement);
	}
}

function jsStringLiteralContent(value: string): string {
	return value
		.replaceAll('\\', '\\\\')
		.replaceAll('"', '\\"')
		.replaceAll("'", "\\'")
		.replaceAll('`', '\\`')
		.replaceAll('${', '\\${');
}

interface OutputChunkLike {
	readonly type: 'chunk';
	code?: string;
	readonly dynamicImports: readonly string[];
	readonly facadeModuleId?: string | null;
	readonly fileName: string;
	readonly imports: readonly string[];
	readonly moduleIds?: readonly string[];
	readonly viteMetadata?: {
		readonly importedCss?: ReadonlySet<string> | readonly string[];
	};
}

function routeModulePreloadsFromBundle(input: {
	readonly base: string;
	readonly bundle: Record<string, unknown>;
	readonly navigationChunk: OutputChunkLike | undefined;
	readonly prerenderWakeChunk: OutputChunkLike | undefined;
	readonly resumeChunk: OutputChunkLike | undefined;
	readonly root: string;
}): RoutePreloadMaps {
	const chunks = outputChunks(input.bundle);
	const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
	const routeChunks = new Map<string, OutputChunkLike[]>();
	const routeChunkFileNames = new Set<string>();
	for (const chunk of chunks) {
		const routeFile = routeFileForChunk(input.root, chunk);
		if (!routeFile) continue;
		const routeFileChunks = routeChunks.get(routeFile) ?? [];
		routeFileChunks.push(chunk);
		routeChunks.set(routeFile, routeFileChunks);
		routeChunkFileNames.add(chunk.fileName);
	}

	const symbolChunks = symbolChunksBySourceFile(chunks);
	const navigation: Record<string, readonly string[]> = {};
	const ssr: Record<string, readonly string[]> = {};
	const styles: Record<string, readonly string[]> = {};
	for (const [routeFile, routeFileChunks] of routeChunks) {
		const routeChunk = primaryRouteChunk(input.root, routeFile, routeFileChunks);
		const navigationFileNames = new Set<string>();
		if (input.navigationChunk) {
			includeChunk(navigationFileNames, chunksByFileName, input.navigationChunk.fileName);
			for (const fileName of input.navigationChunk.dynamicImports) {
				if (!routeChunkFileNames.has(fileName)) {
					includeChunk(navigationFileNames, chunksByFileName, fileName);
				}
			}
		}
		includeChunk(navigationFileNames, chunksByFileName, routeChunk.fileName);
		includeChunk(navigationFileNames, chunksByFileName, routeChunk.fileName, true);
		if (input.navigationChunk) {
			for (const fileName of routeScopedDynamicImports(input.navigationChunk, routeFile)) {
				includeChunk(navigationFileNames, chunksByFileName, fileName, true);
			}
		}

		const ssrFileNames = new Set<string>();
		if (input.resumeChunk) {
			includeChunk(ssrFileNames, chunksByFileName, input.resumeChunk.fileName);
			// The resume entry dynamically imports every route's resume module, so
			// only walk the CURRENT route's resume module (plus its full static and
			// dynamic closure); other routes' resume modules must stay excluded.
			// Missing this walk makes the first interaction pay a serial waterfall
			// fetch on slow networks (the preload-strategy box catches this).
			for (const fileName of routeScopedDynamicImports(input.resumeChunk, routeFile)) {
				includeChunk(ssrFileNames, chunksByFileName, fileName, true);
			}
		}
		// Empty-delta pages boot through the prerender-wake entry instead of the
		// resume module; its route-scoped closure obeys the same preload law —
		// the first interaction must fetch ZERO framework chunks.
		if (input.prerenderWakeChunk) {
			includeChunk(ssrFileNames, chunksByFileName, input.prerenderWakeChunk.fileName);
			for (const fileName of routeScopedDynamicImports(
				input.prerenderWakeChunk,
				routeFile,
			)) {
				includeChunk(ssrFileNames, chunksByFileName, fileName, true);
			}
		}
		includeChunk(ssrFileNames, chunksByFileName, routeChunk.fileName, true);

		// Symbol modules (event handlers, attach behaviors, async runs) are
		// demanded through the symbol resolver's computed import table, so the
		// bundle records NO import edge reaching their chunks — the walks above
		// can never find them and the first interaction fetches them cold. Their
		// virtual module id bakes in the source file they serve: a symbol chunk
		// preloads for this route iff that source file is already in the route's
		// planned chunk closure (cross-route exclusion falls out of the key).
		// Both maps get the same symbol set so SSR landings and SPA navigations
		// warm identical bytes; execution stays lazy — this preloads bytes only.
		const routeSourceFiles = sourceFilesForChunks(
			new Set([...navigationFileNames, ...ssrFileNames]),
			chunksByFileName,
		);
		for (const [sourceFile, symbolFileNames] of symbolChunks) {
			if (!routeSourceFiles.has(sourceFile)) continue;
			for (const fileName of symbolFileNames) {
				includeChunk(navigationFileNames, chunksByFileName, fileName, true);
				includeChunk(ssrFileNames, chunksByFileName, fileName, true);
			}
		}

		// Snapshot before the navigation-entry additions below: those reach
		// foreign routes' edges, and a page must link only its own CSS.
		const styleFileNames = new Set([...navigationFileNames, ...ssrFileNames]);

		// The served page never names the navigation entry, so a first navigation
		// starts its fetch only once the reader clicks — a second waterfall hop
		// after the page has finished loading. Preload the entry, and the demand
		// edges of it that cost nothing but themselves.
		if (input.navigationChunk) {
			includeChunk(ssrFileNames, chunksByFileName, input.navigationChunk.fileName);
			for (const fileName of navigationEdgesWorthPreloading(
				input.navigationChunk,
				chunksByFileName,
				ssrFileNames,
				routeChunkFileNames,
			)) {
				includeChunk(ssrFileNames, chunksByFileName, fileName);
			}
		}

		navigation[routeFile] = [...navigationFileNames].map((fileName) =>
			joinURL(input.base, fileName),
		);
		ssr[routeFile] = [...ssrFileNames].map((fileName) => joinURL(input.base, fileName));
		styles[routeFile] = routeStylesheetsForChunks(
			routeFileChunks,
			styleFileNames,
			chunksByFileName,
			input.base,
		);
	}
	return { navigation, ssr, styles };
}

// Which of the navigation entry's demand edges the landing page should already
// hold. Two structural conditions, no chunk names and no per-app knowledge:
//   - the edge's whole static closure, minus the edge itself, is already
//     planned, so preloading it costs exactly the edge's own rendered bytes and
//     the browser can run it the moment it is wanted;
//   - those bytes stay under the navigation entry's own, the one chunk a
//     navigation is certain to fetch. A speculative edge may complete that
//     certainty, never outweigh it — which is what keeps a vendored capability
//     polyfill (larger than the entry, loaded only by engines missing the API)
//     on demand while thin render-path adapters ride along.
function navigationEdgesWorthPreloading(
	navigationChunk: OutputChunkLike,
	chunksByFileName: ReadonlyMap<string, OutputChunkLike>,
	planned: ReadonlySet<string>,
	routeChunkFileNames: ReadonlySet<string>,
): string[] {
	const budget = renderedByteLength(navigationChunk);
	if (budget === 0) return [];
	const edges: string[] = [];
	for (const fileName of navigationChunk.dynamicImports) {
		const edge = chunksByFileName.get(fileName);
		if (!edge || planned.has(fileName) || routeChunkFileNames.has(fileName)) continue;
		if (renderedByteLength(edge) >= budget) continue;
		const closure = new Set<string>();
		includeChunk(closure, chunksByFileName, fileName);
		closure.delete(fileName);
		if ([...closure].every((name) => planned.has(name))) edges.push(fileName);
	}
	return edges;
}

function renderedByteLength(chunk: OutputChunkLike): number {
	return chunk.code?.length ?? 0;
}

// CSS rides chunks no static import edge reaches — dynamically demanded
// component chunks and symbol chunks — so harvest over the route's planned
// closure, not just the chunks the route source owns. Visiting a chunk's
// dependencies before the chunk keeps cascade order stable across builds.
function routeStylesheetsForChunks(
	routeFileChunks: readonly OutputChunkLike[],
	closureFileNames: ReadonlySet<string>,
	chunksByFileName: ReadonlyMap<string, OutputChunkLike>,
	base: string,
): readonly string[] {
	const styles = new Set<string>();
	const visited = new Set<string>();
	const visit = (chunk: OutputChunkLike): void => {
		if (visited.has(chunk.fileName)) return;
		visited.add(chunk.fileName);
		for (const imported of [...chunk.imports, ...codeStaticImports(chunk)]) {
			const dependency = chunksByFileName.get(imported);
			if (dependency) visit(dependency);
		}
		for (const stylesheet of chunk.viteMetadata?.importedCss ?? []) {
			styles.add(joinURL(base, stylesheet));
		}
	};
	for (const fileName of closureFileNames) {
		const chunk = chunksByFileName.get(fileName);
		if (chunk) visit(chunk);
	}
	// Route-owned chunks the preload closure skips (the symbols-only chunk)
	// still carry the route's scoped styles.
	for (const chunk of routeFileChunks) visit(chunk);
	return [...styles];
}

// Maps each authored source file to the chunks holding its compiled symbol
// modules, read from the `virtual:markless:symbol:<sourceFile>:<id>` module
// ids (the bundler owns that id shape — see @markless/bundler/preload).
function symbolChunksBySourceFile(
	chunks: readonly OutputChunkLike[],
): Map<string, readonly string[]> {
	const bySourceFile = new Map<string, string[]>();
	for (const chunk of chunks) {
		for (const moduleId of chunk.moduleIds ?? []) {
			const sourceFile = symbolVirtualModuleSourceFile(moduleId);
			if (!sourceFile) continue;
			const key = sourceModulePathname(sourceFile);
			const fileNames = bySourceFile.get(key) ?? [];
			if (!fileNames.includes(chunk.fileName)) fileNames.push(chunk.fileName);
			bySourceFile.set(key, fileNames);
		}
	}
	return bySourceFile;
}

function sourceFilesForChunks(
	fileNames: ReadonlySet<string>,
	chunksByFileName: ReadonlyMap<string, OutputChunkLike>,
): Set<string> {
	const sourceFiles = new Set<string>();
	for (const fileName of fileNames) {
		for (const moduleId of chunksByFileName.get(fileName)?.moduleIds ?? []) {
			if (moduleId.startsWith('\0')) continue;
			const pathname = sourceModulePathname(moduleId);
			if (/\.(?:tsrx|mdx)$/.test(pathname)) sourceFiles.add(pathname);
		}
	}
	return sourceFiles;
}

// Source modules appear both bare and with request queries (?markless-symbols,
// ?markless-resume); symbol virtual ids bake in the bare path. Compare both on
// the same decoded, query-free pathname.
function sourceModulePathname(moduleId: string): string {
	return decodePath(parseURL(moduleId).pathname);
}

function includeChunk(
	fileNames: Set<string>,
	chunksByFileName: ReadonlyMap<string, OutputChunkLike>,
	fileName: string,
	includeDynamic = false,
	visitedDynamic: Set<string> = new Set(),
): void {
	if (!fileNames.has(fileName)) fileNames.add(fileName);
	const chunk = chunksByFileName.get(fileName);
	if (!chunk) return;
	for (const imported of chunk.imports) {
		includeChunk(fileNames, chunksByFileName, imported, includeDynamic, visitedDynamic);
	}
	for (const imported of codeStaticImports(chunk)) {
		if (!chunksByFileName.has(imported)) continue;
		includeChunk(fileNames, chunksByFileName, imported, includeDynamic, visitedDynamic);
	}
	if (!includeDynamic || visitedDynamic.has(fileName)) {
		return;
	}
	visitedDynamic.add(fileName);
	for (const imported of chunk.dynamicImports) {
		includeChunk(fileNames, chunksByFileName, imported, true, visitedDynamic);
	}
	for (const imported of codeDynamicImports(chunk)) {
		if (!chunksByFileName.has(imported)) continue;
		includeChunk(fileNames, chunksByFileName, imported, true, visitedDynamic);
	}
}

function routeScopedDynamicImports(chunk: OutputChunkLike, routeFile: string): string[] {
	if (!chunk.code) return [];
	const imports = new Set<string>();
	const routeLiteralIndex = chunk.code.indexOf(routeFile);
	if (routeLiteralIndex === -1) return [];
	// Route literals appear both as "pages/x.tsrx" (navigation symbol router)
	// and "/pages/x.tsrx" (resume entry route map keys).
	const nextRouteLiteralIndex = chunk.code
		.slice(routeLiteralIndex + routeFile.length)
		.search(/["'`]\/?pages\/[^"'`]+\.(?:tsrx|mdx)["'`]/);
	const routeBlockEnd =
		nextRouteLiteralIndex === -1
			? chunk.code.length
			: routeLiteralIndex + routeFile.length + nextRouteLiteralIndex;
	const routeBlock = chunk.code.slice(routeLiteralIndex, routeBlockEnd);
	for (const specifier of codeDynamicImportSpecifiers(routeBlock)) {
		imports.add(normalize(join(dirname(chunk.fileName), specifier)));
	}
	return [...imports];
}

function codeStaticImports(chunk: OutputChunkLike): string[] {
	return codeImportSpecifiers(
		chunk,
		/(?:import\s*(?:[^('"`]*?\bfrom\s*)?|export\s*[^('"`]*?\bfrom\s*)["'](\.\/[^"']+\.js)["']/g,
	);
}

function codeDynamicImports(chunk: OutputChunkLike): string[] {
	return codeDynamicImportSpecifiers(chunk.code ?? '').map((specifier) =>
		normalize(join(dirname(chunk.fileName), specifier)),
	);
}

function codeDynamicImportSpecifiers(code: string): string[] {
	const imports = new Set<string>();
	for (const match of code.matchAll(/import\(\s*["'`](\.\/[^"'`]+\.js)["'`]\s*\)/g)) {
		const specifier = match[1];
		if (specifier) imports.add(specifier);
	}
	return [...imports];
}

function codeImportSpecifiers(chunk: OutputChunkLike, pattern: RegExp): string[] {
	if (!chunk.code) return [];
	const imports = new Set<string>();
	for (const match of chunk.code.matchAll(pattern)) {
		const specifier = match[1];
		if (specifier) imports.add(normalize(join(dirname(chunk.fileName), specifier)));
	}
	return [...imports];
}

function outputChunks(bundle: Record<string, unknown>): OutputChunkLike[] {
	return Object.values(bundle).filter((item): item is OutputChunkLike => {
		return (
			isRecord(item) &&
			item.type === 'chunk' &&
			typeof item.fileName === 'string' &&
			Array.isArray(item.imports) &&
			Array.isArray(item.dynamicImports)
		);
	});
}

function routeFileForChunk(root: string, chunk: OutputChunkLike): string | undefined {
	for (const moduleId of [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])]) {
		const routeFile = routeFileForModuleId(root, moduleId);
		if (routeFile) return routeFile;
	}
}

function primaryRouteChunk(
	root: string,
	routeFile: string,
	chunks: readonly OutputChunkLike[],
): OutputChunkLike {
	// The same route source can produce full, resume, and symbols-only chunks.
	// Prefer the unqueried authored module, then resume, then symbols-only.
	// Replace only for a strictly higher rank so bundle order breaks ties.
	let selected = chunks[0]!;
	let selectedRank = routeChunkRank(root, routeFile, selected);
	for (const chunk of chunks.slice(1)) {
		const rank = routeChunkRank(root, routeFile, chunk);
		if (rank <= selectedRank) continue;
		selected = chunk;
		selectedRank = rank;
	}
	return selected;
}

function routeChunkRank(root: string, routeFile: string, chunk: OutputChunkLike): number {
	let rank = 0;
	for (const moduleId of [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])]) {
		if (routeFileForModuleId(root, moduleId) !== routeFile) continue;
		const search = parsePath(moduleId!).search;
		if (/(?:^|[?&])markless-symbols(?:[=&]|$)/.test(search)) {
			rank = Math.max(rank, 1);
		} else if (/(?:^|[?&])markless-resume(?:[=&]|$)/.test(search)) {
			rank = Math.max(rank, 2);
		} else {
			return 3;
		}
	}
	return rank;
}

function routeFileForModuleId(
	root: string,
	moduleId: string | null | undefined,
): string | undefined {
	if (!moduleId || moduleId.startsWith('\0')) return undefined;
	const pathname = decodePath(parseURL(moduleId).pathname);
	if (!isAbsolute(pathname)) return undefined;
	const routeFile = withoutLeadingSlash(normalize(relative(root, pathname)));
	return /(?:^|\/)pages\/.+\.(?:tsrx|mdx)$/.test(routeFile) ? routeFile : undefined;
}

function scopedVirtualEntryId(id: string, root: string | undefined): string {
	return `${virtualModuleBaseId(id)}${rootScopeQuery(root ?? '.', id)}`;
}

function virtualModuleBaseId(id: string): string {
	return parsePath(id).pathname;
}

function configRoot(config: EnvironmentOptions): string {
	const root = (config as { readonly root?: unknown }).root;
	return typeof root === 'string' ? root : '.';
}
