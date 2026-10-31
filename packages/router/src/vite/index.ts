import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { nitro } from 'nitro/vite';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'pathe';
import {
	type EnvironmentOptions,
	minifySync,
	parseAst,
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
	withoutBase,
	parsePath,
	parseQuery,
	parseURL,
	stringifyQuery,
	withoutLeadingSlash,
} from 'ufo';
import {
	isClientPrimarySourceRequest,
	isExecutionLogChunk,
	isMarklessNavigationPack,
	isRenderDataSourceRequest,
	lazyStartupPackName,
	marklessDeferredChunkFileNames,
	startupPackOfLazy,
	isResumeSourceRequest,
	isRouteNavigationSourceRequest,
	isSymbolOnlySourceRequest,
	plannedLandingFiles,
	resolverVirtualModuleSourceFile,
	warmEvaluatedImports,
	symbolVirtualModuleSourceFile,
} from '@markless/bundler/preload';
import {
	MARKLESS_PUBLIC_BUILD_METADATA_FILES,
	MARKLESS_BUILD_PREFIX,
	MARKLESS_IMPORT_MAP_ASSET,
	importMapScript,
} from '@markless/bundler/rolldown';
import { transformRequestFileSource } from '../request-files.ts';
import { anchorTransformPlugin } from './anchor-transform.ts';
import {
	clientAssetFileName,
	createClientAssetsManifest,
	type MarklessRouterClientAssetRoutes,
	type MarklessRouterClientAssetsManifest,
	readClientAssetsManifest,
	removeClientAssetsManifest,
	renameClientAssetChunks,
	writeClientAssetsManifest,
} from './client-assets-manifest.ts';
import { htmlTransformPlugin } from './html-transform.ts';
import { mdxTransformPlugin } from './mdx.ts';
import { compactRoutePreloadData, routePreloadDecoderSource } from './route-preload-data.ts';
import { routeTypegenPlugin } from './route-typegen.ts';
import { LINK_ATTRIBUTE, PREFETCH_ATTRIBUTE } from '../link-attributes.ts';
import { NAVIGATION_POLYFILL_MODULE } from '../navigation-polyfill.ts';
import { listenForLinkIntent } from './link-intent.ts';
import { documentHandlerError, documentNavigationFor } from './document-navigation.ts';
import {
	STYLESHEET_KEY_ATTRIBUTE,
	runFragmentNavigation,
	startFragmentNavigation,
} from './fragment-navigation.ts';
import { fragmentRequestModule } from './nitro-fragment-requests.ts';
import {
	brotliCopiesPlugin,
	compressedAssetsModule,
	compressedAssetsState,
	type CompressedAssetsState,
} from './nitro-compressed-assets.ts';
import {
	devNitroClosePlugin,
	devNitroModule,
	devNitroState,
	type DevNitroState,
} from './nitro-dev-close.ts';
import {
	prerenderRendererModule,
	recordServerEntry,
	serverBuildState,
	type ServerBuildState,
} from './nitro-prerender.ts';
import { cloudflareModule, cloudflareNodeBuildsPlugin } from './nitro-cloudflare.ts';
import {
	buildRouteManifestFromFileIds,
	isPageModuleFile,
	matchRouteManifest,
	normalizeRouteFileId,
} from '../route-manifest.ts';
import { routerLinkBridgeModules, type LinkBridgeModule } from './runtime/create-server-entry.ts';
import { LINK_BRIDGE_DIR } from './runtime/link-bridge-module.ts';

// The compiler refuses browser code that reads these page props: they hold request data.
const PAGE_SERVER_ONLY_PROPS = [
	{
		exportName: 'default',
		propName: 'http',
		description:
			'the request with its cookies and headers, the locals middleware set, and the response being written',
	},
] as const;

const ROUTE_DISCOVERY_ID = 'virtual:markless-router/routes';
const CLIENT_ENTRY_ID = 'virtual:markless-router/client-entry';
const RESUME_ENTRY_ID = 'virtual:markless-router/resume-entry';
const RESUME_ENTRY_ORIGIN = '/entries/resume-entry.ts';
const RESUME_ENTRY_PATH_ID = 'virtual:markless-router/resume-entry-path';
const RESUME_MODULES_ID = 'virtual:markless-router/resume-modules';
const RESUME_MODULES_ORIGIN = '/entries/resume-modules.ts';
const DEV_RESUME_MODULES_ID = 'virtual:markless-router/dev-resume-modules';
const PRERENDER_WAKE_ENTRY_ID = 'virtual:markless-router/prerender-wake-entry';
const PRERENDER_WAKE_ENTRY_ORIGIN = '/entries/prerender-wake-entry.ts';
const PRERENDER_WAKE_ENTRY_PATH_ID = 'virtual:markless-router/prerender-wake-entry-path';
const NAVIGATION_ENTRY_ID = 'virtual:markless-router/navigation-entry';
const NAVIGATION_ENTRY_ORIGIN = '/entries/client-entry.ts';
const NAVIGATION_ENTRY_PATH_ID = 'virtual:markless-router/navigation-entry-path';
const FRAGMENT_ENTRY_ID = 'virtual:markless-router/fragment-entry';
const FRAGMENT_ENTRY_ORIGIN = '/entries/fragment-entry.ts';
const FRAGMENT_ENTRY_PATH_ID = 'virtual:markless-router/fragment-entry-path';
const ROUTE_PRELOADS_ID = 'virtual:markless-router/route-preloads';
const ROUTE_PRELOADS_PLACEHOLDER = '__MARKLESS_ROUTER_ROUTE_PRELOADS__';
const DOCUMENT_STYLESHEETS_PLACEHOLDER = '__MARKLESS_ROUTER_DOCUMENT_STYLESHEETS__';
const STYLESHEET_SOURCES_PLACEHOLDER = '__MARKLESS_ROUTER_STYLESHEET_SOURCES__';
const LINK_BRIDGE_PATHS_PLACEHOLDER = '__MARKLESS_ROUTER_LINK_BRIDGE_PATHS__';
const SERVER_ENTRY_ID = 'virtual:markless-router/server-entry';
const ROUTE_HREF_ID = 'virtual:markless-router/route-href';
const ROUTER_OPTIONS_ID = 'virtual:markless-router/options';
const PUBLIC_VIRTUAL_MODULE_ID_RE =
	/^virtual:markless-router\/(?:routes|client-entry|resume-entry|resume-entry-path|resume-modules|dev-resume-modules|prerender-wake-entry|prerender-wake-entry-path|navigation-entry|navigation-entry-path|fragment-entry|fragment-entry-path|route-preloads|server-entry|route-href|options)(?:\?.*)?$/;
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
	[RESUME_MODULES_ID]: 'resume-modules.ts',
	[PRERENDER_WAKE_ENTRY_ID]: 'prerender-wake-entry.ts',
	[NAVIGATION_ENTRY_ID]: 'client-entry.ts',
	[FRAGMENT_ENTRY_ID]: 'fragment-entry.ts',
	[SERVER_ENTRY_ID]: 'server-entry.ts',
	[ROUTE_HREF_ID]: 'route-href.ts',
} as const;

export interface MarklessRouterOptions {
	// 'hash' routes by location.hash paths (#/r/x -> route /r/x) for apps whose
	// URLs live in the fragment; 'path' (default) routes by pathname.
	mode?: 'path' | 'hash';
	nitro?: boolean;
	/**
	 * `false` downloads nothing for a link before it is clicked: no prefetch on hover, press,
	 * focus or idle. Links still navigate. `<Link prefetch={false}>` does the same for one link.
	 * Prefetches only ever request page routes, with a `Purpose: prefetch` header; endpoints are never prefetched.
	 */
	prefetch?: boolean;
}

export function router(options: MarklessRouterOptions = {}): PluginOption[] {
	// Captured at factory time so config wrappers can scope the env var to the
	// plugin construction, mirroring the MARKLESS_PRERENDER pattern.
	prerenderWakeChannelCaptured = process.env.MARKLESS_PRERENDER_WAKE === '1';
	if (options.nitro === false) {
		return [
			pageServerOnlyPropsPlugin(),
			mdxTransformPlugin(),
			requestFileTransformPlugin(),
			routeTypegenPlugin(),
			anchorTransformPlugin(),
			htmlTransformPlugin(),
			virtualModulesPlugin(undefined, undefined, undefined, undefined, options),
		];
	}

	const nitroPlugins = nitro();
	const resumeEntry = resumeEntryState();
	const prerenderWakeEntry = resumeEntryState();
	const navigationEntry = resumeEntryState();
	const fragmentEntry = resumeEntryState();
	const routePreloads = routePreloadState();
	const serverBuild = serverBuildState();
	const devNitro = devNitroState();
	const compressedAssets = compressedAssetsState();

	return [
		routerConfigPlugin(
			nitroPlugins,
			resumeEntry,
			prerenderWakeEntry,
			navigationEntry,
			routePreloads,
			fragmentEntry,
			serverBuild,
			devNitro,
			compressedAssets,
		),
		devSourceModuleRequestPlugin(),
		devPageForUrlPlugin(options),
		pageServerOnlyPropsPlugin(),
		mdxTransformPlugin(),
		requestFileTransformPlugin(),
		routeTypegenPlugin(),
		anchorTransformPlugin(),
		htmlTransformPlugin(),
		virtualModulesPlugin(
			resumeEntry,
			prerenderWakeEntry,
			navigationEntry,
			routePreloads,
			options,
			fragmentEntry,
		),
		linkBridgeFilesPlugin(navigationEntry, fragmentEntry, options),
		devNitroClosePlugin(devNitro),
		brotliCopiesPlugin(compressedAssets),
		cloudflareNodeBuildsPlugin(),
		nitroPlugins,
	];
}

function pageServerOnlyPropsPlugin(): Plugin {
	return {
		name: 'markless-router:page-server-only-props',
		configResolved(config) {
			const markless = config.plugins.find(
				(plugin) =>
					typeof (plugin as { api?: { declareServerOnlyProps?: unknown } }).api
						?.declareServerOnlyProps === 'function',
			) as
				| {
						api: {
							declareServerOnlyProps(
								resolve: (
									moduleId: string,
								) => typeof PAGE_SERVER_ONLY_PROPS | undefined,
							): void;
							declareRouteModules?(isRoute: (moduleId: string) => boolean): void;
						};
				  }
				| undefined;
			markless?.api.declareServerOnlyProps((moduleId) =>
				isPageModuleFile(normalizeRouteFileId(moduleId))
					? PAGE_SERVER_ONLY_PROPS
					: undefined,
			);
			markless?.api.declareRouteModules?.((moduleId) =>
				isPageModuleFile(normalizeRouteFileId(moduleId)),
			);
		},
	};
}

// The dev server reloads an open page only for edits its page module imports, so it asks which page a URL shows.
function devPageForUrlPlugin(options: MarklessRouterOptions): Plugin {
	return {
		name: 'markless-router:dev-page-for-url',
		apply: 'serve',
		configResolved(config) {
			const markless = config.plugins.find(
				(plugin) =>
					typeof (plugin as { api?: { declarePageForUrl?: unknown } }).api
						?.declarePageForUrl === 'function',
			) as
				| {
						api: {
							declarePageForUrl(
								pageForUrl: (url: string) => string | undefined,
							): void;
						};
				  }
				| undefined;
			markless?.api.declarePageForUrl((href) =>
				devPageForUrl(config.root, config.base, options.mode, href),
			);
		},
	};
}

function devPageForUrl(
	root: string,
	base: string,
	mode: MarklessRouterOptions['mode'],
	href: string,
): string | undefined {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return undefined;
	}
	const pagesDir = join(root, 'pages');
	if (!existsSync(pagesDir)) return undefined;
	const fileIds = readdirSync(pagesDir, { recursive: true, encoding: 'utf8' }).map((file) =>
		join('pages', file),
	);
	let manifest: ReturnType<typeof buildRouteManifestFromFileIds>;
	try {
		manifest = buildRouteManifestFromFileIds(fileIds);
	} catch {
		return undefined;
	}
	const pathname =
		mode === 'hash' && url.hash.startsWith('#/')
			? url.hash.slice(1)
			: withoutBase(url.pathname, base);
	return matchRouteManifest(pathname, manifest)?.route.file ?? manifest.statusPages.notFound;
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
	fragmentEntry: ResumeEntryState = resumeEntryState(),
	serverBuild: ServerBuildState = serverBuildState(),
	devNitro: DevNitroState = devNitroState(),
	compressedAssets: CompressedAssetsState = compressedAssetsState(),
): Plugin {
	let clientOutDir = '';
	let clientEnvironmentName = '';
	let clientEnvironmentConfig: object | undefined;
	let serverEnvironmentConfig: object | undefined;
	let productionBuild = false;
	let pendingClientAssets: MarklessRouterClientAssetsManifest | undefined;
	let capturedChunkNames = new Map<string, string | undefined>();
	const navigationPolyfillIds = new Set<string>();

	return {
		name: 'markless-router:vite',
		enforce: 'pre',
		sharedDuringBuild: true,
		resolveId: {
			filter: { id: new RegExp(`^${escapeRegExp(NAVIGATION_POLYFILL_MODULE)}$`) },
			async handler(source, importer, options) {
				if (source !== NAVIGATION_POLYFILL_MODULE) return null;
				const resolved = await this.resolve(source, importer, {
					...options,
					skipSelf: true,
				});
				if (resolved) navigationPolyfillIds.add(resolved.id);
				return resolved;
			},
		},
		config(config: UserConfig, env) {
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

			// Replaced in place: Vite deep-merges a returned config and concatenates its arrays, so the app's handlers would run twice.
			config.nitro = createNitroConfig(
				config.nitro,
				config.root,
				serverWatch.ignored,
				env?.command === 'build',
				serverBuild,
				devNitro,
				compressedAssets,
			);
			config.server = { ...config.server, watch: serverWatch };
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
			for (const entry of [
				resumeEntry,
				prerenderWakeEntry,
				navigationEntry,
				fragmentEntry,
				routePreloads,
			]) {
				entry.base = config.base;
			}
			routePreloads.root = config.root;
			// The router writes every document, so each one can carry the import map packed chunks resolve through.
			const markless = (config.plugins ?? []).find(
				(plugin) =>
					typeof (plugin as { api?: { chunkImportMap?: unknown } }).api
						?.chunkImportMap === 'function',
			) as { api: { chunkImportMap(): boolean; enableChunkImportMap?(): void } } | undefined;
			markless?.api.enableChunkImportMap?.();
			if (config.command === 'build')
				(markless?.api as { deliverStylesheetsInDocuments?(): void } | undefined)
					?.deliverStylesheetsInDocuments?.();
			routePreloads.chunkSpecifiers = markless?.api.chunkImportMap() === true;
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
				fragmentEntry.fileName = undefined;
				routePreloads.routes = { navigation: {}, ssr: {}, styles: {} };
				routePreloads.resumeModules = {};
				routePreloads.stylesheetSources = {};
				routePreloads.persisted = false;
				routePreloads.importMap = undefined;
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
			fragmentEntry.fileName = manifest.entries.fragment
				? clientAssetFileName(manifest.entries.fragment, manifest.base)
				: undefined;
			fragmentEntry.imports = manifest.entries.fragmentImports;
			routePreloads.routes = manifest.routes;
			routePreloads.resumeModules = manifest.resumeModules ?? {};
			routePreloads.stylesheetSources = await clientStylesheetSources(
				clientOutDir,
				manifest.base,
				Object.values(manifest.routes.styles).flat(),
			);
			routePreloads.persisted = true;
			routePreloads.importMap = manifest.importMap;
		},
		generateBundle: {
			// Vite finalizes and propagates importedCss in vite:css-post.
			order: 'post',
			handler(_options, bundle) {
				if (this.environment?.config.consumer !== 'client') {
					if (this.environment?.config.consumer === 'server') {
						const documentStylesheets = documentStylesheetsFromBundle(
							bundle,
							routePreloads.root,
							routePreloads.base,
						);
						patchDocumentStylesheetsInBundle(bundle, documentStylesheets);
						patchStylesheetSourcesInBundle(bundle, {
							...routePreloads.stylesheetSources,
							...bundleStylesheetSources(bundle, routePreloads.base, documentStylesheets),
						});
					}
					return;
				}

				const resumeChunk = Object.values(bundle).find(
					(item): item is OutputChunk =>
						item.type === 'chunk' && isVirtualEntryChunk(item, RESUME_ENTRY_ORIGIN),
				);
				if (resumeChunk) {
					resumeEntry.fileName = resumeChunk.fileName;
				}
				const resumeModulesChunk = Object.values(bundle).find(
					(item): item is OutputChunk =>
						item.type === 'chunk' && isVirtualEntryChunk(item, RESUME_MODULES_ORIGIN),
				);
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
				const fragmentChunk = Object.values(bundle).find(
					(item): item is OutputChunk =>
						item.type === 'chunk' && isVirtualEntryChunk(item, FRAGMENT_ENTRY_ORIGIN),
				);
				if (fragmentChunk) {
					fragmentEntry.fileName = fragmentChunk.fileName;
					const everyChunk = new Map(
						outputChunks(bundle).map((chunk) => [chunk.fileName, chunk]),
					);
					const closure = new Set<string>();
					includeChunk(
						closure,
						{ chunks: everyChunk, everyChunk },
						fragmentChunk.fileName,
					);
					closure.delete(fragmentChunk.fileName);
					fragmentEntry.imports = [...closure].map((fileName) =>
						joinURL(routePreloads.base, fileName),
					);
				}
				routePreloads.routes = routeModulePreloadsFromBundle({
					base: routePreloads.base,
					bundle,
					navigationChunk,
					navigationPolyfillIds,
					prerenderWakeChunk,
					resumeChunk,
					resumeModulesChunk,
					root: routePreloads.root,
				});
				patchRoutePreloadsInBundle(bundle, routePreloads.routes);
				capturedChunkNames = new Map(
					outputChunks(bundle).map((chunk) => [
						chunk.fileName,
						chunk.preliminaryFileName,
					]),
				);
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
						...(fragmentEntry.fileName
							? {
									fragmentEntry: joinURL(
										routePreloads.base,
										fragmentEntry.fileName,
									),
									fragmentImports: fragmentEntry.imports,
								}
							: {}),
						routes: routePreloads.routes,
					});
				}
			},
		},
		async writeBundle(options, bundle) {
			const environment = this.environment;
			const isClientEnvironment = environment?.name
				? environment.name === clientEnvironmentName
				: environment?.config === clientEnvironmentConfig;
			if (productionBuild && environment?.name === 'ssr')
				recordServerEntry(serverBuild, options.dir, bundle, (id) =>
					id.startsWith(`\0${SERVER_ENTRY_ID}`),
				);
			if (!productionBuild || !isClientEnvironment) return;
			if (!pendingClientAssets) {
				throw new Error(
					'Markless Router client build finished without a client-assets manifest.',
				);
			}
			const renames = bundle
				? chunkRenamesSince(capturedChunkNames, bundle)
				: new Map<string, string>();
			if (renames.size > 0) {
				pendingClientAssets = renameClientAssetChunks(pendingClientAssets, renames);
				routePreloads.routes = pendingClientAssets.routes;
				for (const entry of [
					resumeEntry,
					prerenderWakeEntry,
					navigationEntry,
					fragmentEntry,
				])
					if (entry.fileName)
						entry.fileName = renames.get(entry.fileName) ?? entry.fileName;
				fragmentEntry.imports = pendingClientAssets.entries.fragmentImports;
			}
			const importMap = bundle?.[MARKLESS_IMPORT_MAP_ASSET];
			if (importMap?.type === 'asset')
				pendingClientAssets = {
					...pendingClientAssets,
					importMap: JSON.parse(String(importMap.source)),
				};
			const resumeModules = routeResumeModulesFromBundle(
				bundle ?? {},
				routePreloads.base,
				pendingClientAssets.importMap?.imports ?? {},
				pendingClientAssets.routes.ssr,
			);
			routePreloads.resumeModules = resumeModules;
			pendingClientAssets = { ...pendingClientAssets, resumeModules };
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
	}
}

function requestFileTransformPlugin(): Plugin {
	let root = '';

	return {
		name: 'markless-router:request-files',
		enforce: 'pre',
		configResolved(config: ResolvedConfig) {
			root = config.root;
		},
		transform: {
			filter: { id: REQUEST_FILE_ID_FILTER },
			handler(code, id) {
				const fileId = requestFileIdForTransform(root, id);
				if (!fileId) {
					return undefined;
				}

				const transform = transformRequestFileSource(fileId, code);
				return transform ? { code: transform.code, map: null } : undefined;
			},
		},
	};
}

// A superset of requestFileIdForTransform: every request file sits under an api/ or middleware/ directory.
const REQUEST_FILE_ID_FILTER = /[\\/](?:api|middleware)[\\/]/;

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
	// A module beside the pages under pages/api/ is page code, not an endpoint.
	if (relativeFileId.startsWith('pages/')) return undefined;

	return relativeFileId.match(/(?:^|\/)((?:api|middleware)\/.+\.ts)$/)?.[1];
}

function requestFileBuildTransformPlugin(root: string): Plugin {
	return {
		name: 'markless-router:nitro-request-files',
		transform: {
			filter: { id: REQUEST_FILE_ID_FILTER },
			handler(code, id) {
				const fileId = requestFileIdForTransform(root, id);
				if (!fileId) {
					return undefined;
				}

				const transform = transformRequestFileSource(fileId, code);
				return transform ? { code: transform.code, map: null } : undefined;
			},
		},
	};
}

function createNitroConfig(
	nitroConfig: UserConfig['nitro'] | undefined,
	root = '.',
	serverWatchIgnored: readonly WatchIgnorePattern[] = [],
	isBuild = false,
	serverBuild: ServerBuildState = serverBuildState(),
	devNitro: DevNitroState = devNitroState(),
	compressedAssets: CompressedAssetsState = compressedAssetsState(),
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
		modules: [
			...(nitroConfig?.modules ?? []),
			fragmentRequestModule(),
			compressedAssetsModule(
				nitroConfig?.compressPublicAssets !== undefined,
				compressedAssets,
			),
			cloudflareModule({
				autoSubfolderIndex: nitroConfig?.prerender?.autoSubfolderIndex !== undefined,
			}),
			...(isBuild
				? [prerenderRendererModule(serverBuild, [MARKLESS_BUILD_PREFIX, LINK_BRIDGE_DIR])]
				: [devNitroModule(devNitro)]),
		],
		...(isBuild && {
			routeRules: {
				[`/${MARKLESS_BUILD_PREFIX}**`]: {
					headers: { 'cache-control': 'public, max-age=31536000, immutable' },
				},
				[`/${LINK_BRIDGE_DIR}/**`]: {
					headers: { 'cache-control': 'public, max-age=31536000, immutable' },
				},
				...Object.fromEntries(
					MARKLESS_PUBLIC_BUILD_METADATA_FILES.map((file) => [
						`/${file}`,
						{ headers: { 'cache-control': 'public, max-age=0, must-revalidate' } },
					]),
				),
				...nitroConfig?.routeRules,
			},
		}),
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
	imports?: readonly string[];
}

interface RoutePreloadState {
	base: string;
	chunkSpecifiers: boolean;
	importMap?: { readonly imports: Record<string, string> } | undefined;
	persisted: boolean;
	root: string;
	routes: RoutePreloadMaps;
	resumeModules: RouteResumeModules;
	/** The text of each stylesheet a page links, so its document carries the CSS instead of a request for it. */
	stylesheetSources: Record<string, string>;
}

type RoutePreloadMaps = MarklessRouterClientAssetRoutes;

function resumeEntryState(): ResumeEntryState {
	return { base: '/', fileName: undefined };
}

function routePreloadState(): RoutePreloadState {
	return {
		base: '/',
		chunkSpecifiers: false,
		persisted: false,
		root: '.',
		routes: { navigation: {}, ssr: {}, styles: {} },
		resumeModules: {},
		stylesheetSources: {},
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
	const resumeModulesId = scopedVirtualEntryId(RESUME_MODULES_ID, root);
	const prerenderWakeEntryId = scopedVirtualEntryId(PRERENDER_WAKE_ENTRY_ID, root);
	const navigationEntryId = scopedVirtualEntryId(NAVIGATION_ENTRY_ID, root);
	const fragmentEntryId = scopedVirtualEntryId(FRAGMENT_ENTRY_ID, root);
	const wakeEntries = prerenderWakeChannelEnabled() ? [prerenderWakeEntryId] : [];
	if (input === undefined) {
		return [resumeEntryId, resumeModulesId, ...wakeEntries, navigationEntryId, fragmentEntryId];
	}

	if (typeof input === 'string' || Array.isArray(input)) {
		return [
			resumeEntryId,
			resumeModulesId,
			...wakeEntries,
			navigationEntryId,
			fragmentEntryId,
			...(Array.isArray(input) ? input : [input]),
		];
	}

	if (isRecord(input)) {
		return {
			...input,
			'markless-router-resume': resumeEntryId,
			'markless-router-resume-modules': resumeModulesId,
			...(prerenderWakeChannelEnabled()
				? { 'markless-router-prerender-wake': prerenderWakeEntryId }
				: {}),
			'markless-router-navigation': navigationEntryId,
			'markless-router-fragment': fragmentEntryId,
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
	options: MarklessRouterOptions = {},
	fragmentEntry: ResumeEntryState = resumeEntryState(),
): Plugin {
	let root = '';
	let serving = false;

	return {
		name: 'markless-router:routes',
		config() {
			return {
				define: {
					__MARKLESS_ROUTER_LINK_INTENT__: JSON.stringify(linkIntentEnabled(options)),
				},
			};
		},
		sharedDuringBuild: true,
		configResolved(config) {
			root = config.root;
			serving = config.command === 'serve';
		},
		resolveId: {
			filter: {
				id: PUBLIC_VIRTUAL_MODULE_ID_RE,
			},
			handler(id) {
				const baseId = virtualModuleBaseId(id);
				if (baseId === ROUTER_OPTIONS_ID) {
					return {
						id: `\0${baseId}${rootScopeQuery(root, id)}`,
						moduleSideEffects: false,
					};
				}
				if (
					baseId === SERVER_ENTRY_ID ||
					baseId === RESUME_ENTRY_PATH_ID ||
					baseId === PRERENDER_WAKE_ENTRY_PATH_ID ||
					baseId === NAVIGATION_ENTRY_PATH_ID ||
					baseId === FRAGMENT_ENTRY_PATH_ID ||
					baseId === ROUTE_PRELOADS_ID ||
					baseId === DEV_RESUME_MODULES_ID
				) {
					return `\0${baseId}${rootScopeQuery(root, id)}`;
				}

				const entryFile = virtualEntryFiles[baseId as keyof typeof virtualEntryFiles];
				if (!entryFile) {
					return undefined;
				}
				// Pages ship this helper to the client, and it reads nothing from the app root.
				if (baseId === ROUTE_HREF_ID) return join(VIRTUAL_ENTRY_DIR, entryFile);
				return `${join(VIRTUAL_ENTRY_DIR, entryFile)}${rootScopeQuery(root, id)}`;
			},
		},
		load: {
			filter: { id: /^\0/ },
			handler(id) {
				if (id.startsWith(`\0${SERVER_ENTRY_ID}`)) {
					return serverEntrySource(root, options);
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
				if (id.startsWith(`\0${FRAGMENT_ENTRY_PATH_ID}`)) {
					return entryPathSource(
						'fragmentEntryPath',
						fragmentEntry,
						FRAGMENT_ENTRY_ID,
						root,
					);
				}
				// A built page names its own resume module in its route script; only dev resumes through the table.
				if (id.startsWith(`\0${DEV_RESUME_MODULES_ID}`)) {
					return serving
						? `export * from ${JSON.stringify(scopedVirtualEntryId(RESUME_MODULES_ID, root))};`
						: 'export const mdxResumeModules = undefined, tsrxResumeModules = undefined;';
				}
				if (id.startsWith(`\0${ROUTE_PRELOADS_ID}`)) {
					return routePreloadsSource(
						routePreloads,
						this?.environment?.config.consumer === 'client',
					);
				}
				if (id.startsWith(`\0${ROUTER_OPTIONS_ID}`)) {
					const documentFile = join(root, 'document.tsrx');
					this?.addWatchFile?.(documentFile);
					return routerOptionsSource(options, documentFile);
				}
			},
		},
	};
}

async function routerOptionsSource(
	options: MarklessRouterOptions,
	documentFile: string,
): Promise<string> {
	const documentSource = await readFile(documentFile, 'utf8').catch(() => undefined);
	const handlerError = documentHandlerError(documentSource, documentFile);
	if (handlerError) throw new Error(handlerError);
	return [
		'export const routerMode = "path";',
		`export const documentNavigation = ${JSON.stringify(documentNavigationFor(documentSource))};`,
		linkIntentEnabled(options)
			? `export const startLinkIntentPreloading = (root, preload) => (${listenForLinkIntent.toString()})(root, ${JSON.stringify(LINK_ATTRIBUTE)}, preload, ${JSON.stringify(PREFETCH_ATTRIBUTE)});`
			: 'export const startLinkIntentPreloading = () => () => {};',
	].join('\n');
}

function linkIntentEnabled(options: MarklessRouterOptions): boolean {
	return options.prefetch !== false;
}

function entryPathSource(
	exportName: string,
	entry: ResumeEntryState,
	entryId: string,
	root: string,
): string {
	return `export const ${exportName} = ${JSON.stringify(entryPath(entry, entryId, root))};`;
}

function entryPath(entry: ResumeEntryState, entryId: string, root: string): string {
	return entry.fileName
		? joinURL(entry.base, entry.fileName)
		: joinURL(entry.base, '@id', scopedVirtualEntryId(entryId, root));
}

// Pages import the link bridge on load, so it is a static client file: app middleware never sees the request.
function linkBridgeFilesPlugin(
	navigationEntry: ResumeEntryState,
	fragmentEntry: ResumeEntryState,
	options: MarklessRouterOptions,
): Plugin {
	let root = '';
	let base = '/';
	let clientOutDir = '';
	let debug = false;
	let modules: readonly LinkBridgeModule[] = [];
	return {
		name: 'markless-router:link-bridge-files',
		apply: 'build',
		sharedDuringBuild: true,
		configResolved(config) {
			root = config.root;
			base = config.base;
			debug = config.define?.__MARKLESS_DEBUG_ENABLED__ === 'true';
			const client = Object.values(config.environments).find(
				(environment) => environment.consumer === 'client',
			);
			if (client) clientOutDir = resolve(config.root, client.build.outDir);
		},
		generateBundle: {
			order: 'post',
			async handler(_options, bundle) {
				if (this.environment?.name !== 'ssr') return;
				const chunks = outputChunks(bundle);
				const target = chunks.find((chunk) =>
					chunk.code?.includes(LINK_BRIDGE_PATHS_PLACEHOLDER),
				);
				if (!target) return;
				if (!navigationEntry.fileName)
					throw new Error(
						'Markless Router built its server entry before its navigation entry.',
					);
				const documentFile = join(root, 'document.tsrx');
				const documentSource = await readFile(documentFile, 'utf8').catch(() => undefined);
				const built = routerLinkBridgeModules({
					base,
					navigationEntryPath: entryPath(navigationEntry, NAVIGATION_ENTRY_ID, root),
					fragmentEntryPath: entryPath(fragmentEntry, FRAGMENT_ENTRY_ID, root),
					fragmentEntryImports: fragmentEntry.imports,
					fragmentNavigationSource: minifiedFragmentNavigationSource(),
					fragmentNavigationRunSource:
						minifiedFragmentNavigationSource(runFragmentNavigation),
					prefetch: options.prefetch,
					documentNavigation: documentNavigationFor(documentSource),
					routeFileIds: bundledPageFileIds(chunks, root),
					debug,
				})!;
				modules = built;
				target.code = target.code!.replace(
					LINK_BRIDGE_PATHS_PLACEHOLDER,
					jsStringLiteralContent(
						JSON.stringify(built.slice(0, 2).map((module) => module.path)),
					),
				);
			},
		},
		async writeBundle() {
			if (this.environment?.name !== 'ssr' || modules.length === 0) return;
			const prefix = base.replace(/\/?$/, '/');
			for (const module of modules) {
				const file = join(clientOutDir, module.path.slice(prefix.length));
				await mkdir(dirname(file), { recursive: true });
				await writeFile(file, module.source, 'utf8');
			}
		},
	};
}

function bundledPageFileIds(chunks: readonly OutputChunkLike[], root: string): string[] {
	const files = new Set<string>();
	for (const chunk of chunks)
		for (const id of chunk.moduleIds ?? []) {
			if (id.startsWith('\0')) continue;
			const pathname = decodePath(parseURL(id).pathname);
			if (!isAbsolute(pathname)) continue;
			const file = normalizeRouteFileId(relative(root, pathname));
			if (isPageModuleFile(file)) files.add(file);
		}
	return [...files];
}

function serverEntrySource(root: string, options: MarklessRouterOptions): string {
	const query = rootScopeQuery(root);
	return [
		`import { createServerEntry } from '@markless/router/vite/runtime/create-server-entry';`,
		`import { resumeEntryPath } from ${JSON.stringify(`${RESUME_ENTRY_PATH_ID}${query}`)};`,
		`import { prerenderWakeEntryPath } from ${JSON.stringify(`${PRERENDER_WAKE_ENTRY_PATH_ID}${query}`)};`,
		`import { navigationEntryPath } from ${JSON.stringify(`${NAVIGATION_ENTRY_PATH_ID}${query}`)};`,
		`import { fragmentEntryPath } from ${JSON.stringify(`${FRAGMENT_ENTRY_PATH_ID}${query}`)};`,
		`import { documentStylesheets, routeModulePreloads, routeSsrModulePreloads, routeStylesheets, stylesheetSources, documentImportMap, routeResumeModules } from ${JSON.stringify(`${ROUTE_PRELOADS_ID}${query}`)};`,
		`import { pageModuleLoaders, routeFileIds } from ${JSON.stringify(`${ROUTE_DISCOVERY_ID}${query}`)};`,
		`import { documentNavigation } from ${JSON.stringify(`${ROUTER_OPTIONS_ID}${query}`)};`,
		`const documentModuleLoaders = import.meta.glob(['/document.tsrx']);`,
		`const linkBridgePathsJson = globalThis.__marklessRouterLinkBridgePathsJson ?? ${JSON.stringify(LINK_BRIDGE_PATHS_PLACEHOLDER)};`,
		`const entry = createServerEntry({`,
		`  dev: import.meta.env.DEV,`,
		`  linkBridgePaths: linkBridgePathsJson === ${JSON.stringify(LINK_BRIDGE_PATHS_PLACEHOLDER)} ? undefined : JSON.parse(linkBridgePathsJson),`,
		`  base: import.meta.env.BASE_URL,`,
		`  resumeEntryPath,`,
		`  prerenderWakeEntryPath,`,
		`  navigationEntryPath,`,
		`  fragmentEntryPath,`,
		`  fragmentNavigationSource: ${JSON.stringify(minifiedFragmentNavigationSource())},`,
		`  fragmentNavigationRunSource: ${JSON.stringify(minifiedFragmentNavigationSource(runFragmentNavigation))},`,
		...(options.prefetch === false ? ['  prefetch: false,'] : []),
		`  routeModulePreloads,`,
		`  routeSsrModulePreloads,`,
		`  routeResumeModules,`,
		`  routeStylesheets,`,
		`  documentStylesheets,`,
		`  stylesheetSources,`,
		`  importMap: documentImportMap,`,
		`  documentModuleLoader: documentModuleLoaders['/document.tsrx'],`,
		`  documentNavigation,`,
		`  pageModuleLoaders,`,
		`  routeFileIds,`,
		`});`,
		`export const fetch = entry.fetch;`,
		`export default entry;`,
	].join('\n');
}

// The bridge carries this inline on every page, so it ships minified.
function minifiedFragmentNavigationSource(
	source: (...args: never[]) => unknown = startFragmentNavigation,
): string {
	const result = minifySync(
		'markless-fragment-navigation.js',
		`export default (${source.toString()});`,
		{ compress: true, mangle: true, module: true },
	);
	const prefix = 'export default';
	const code = result.code.trim();
	if (result.errors.length > 0 || !code.startsWith(prefix))
		throw new Error(
			`MARKLESS_ROUTER_FRAGMENT_MINIFY_FAILED: ${result.errors.map((error) => error.message).join('\n')}`,
		);
	return code.slice(prefix.length).replace(/;$/, '').trim();
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
	// The document module lives only in the server build, so its stylesheet
	// closure is patched in by that build's generateBundle, never the manifest.
	const routeStylesheetExport = client
		? []
		: [
				`export const routeStylesheets = ${state.persisted ? 'routePreloadData.styles ?? {}' : 'undefined'};`,
				`const documentStylesheetsJson = globalThis.__marklessRouterDocumentStylesheetsJson ?? ${JSON.stringify(DOCUMENT_STYLESHEETS_PLACEHOLDER)};`,
				`export const documentStylesheets = documentStylesheetsJson === ${JSON.stringify(DOCUMENT_STYLESHEETS_PLACEHOLDER)} ? [] : JSON.parse(documentStylesheetsJson);`,
				`const stylesheetSourcesJson = globalThis.__marklessRouterStylesheetSourcesJson ?? ${JSON.stringify(STYLESHEET_SOURCES_PLACEHOLDER)};`,
				`export const stylesheetSources = stylesheetSourcesJson === ${JSON.stringify(STYLESHEET_SOURCES_PLACEHOLDER)} ? {} : JSON.parse(stylesheetSourcesJson);`,
				`export const documentImportMap = ${JSON.stringify(state.persisted && state.importMap ? importMapScript(state.importMap) : '')};`,
				`export const routeResumeModules = ${JSON.stringify(state.persisted ? state.resumeModules : {})};`,
			];
	return [
		`const routePreloadsJson = globalThis.__marklessRouterRoutePreloadsJson ?? ${JSON.stringify(ROUTE_PRELOADS_PLACEHOLDER)};`,
		`let routePreloadData = routePreloadsJson === ${JSON.stringify(ROUTE_PRELOADS_PLACEHOLDER)} ? ${JSON.stringify(routes)} : JSON.parse(routePreloadsJson);`,
		routePreloadDecoderSource(client && state.chunkSpecifiers),
		`export const routeModulePreloads = routePreloadData.navigation ?? {};`,
		`export const routeSsrModulePreloads = routePreloadData.ssr ?? {};`,
		...routeStylesheetExport,
		...(client ? clientRouteStylesheetsSource() : []),
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

// A page rendered in the browser (a '#/' route) brings the stylesheets its document lacks, as files; one that fails fails the render.
function clientRouteStylesheetsSource(): string[] {
	const key = JSON.stringify(STYLESHEET_KEY_ATTRIBUTE);
	return [
		`const pageStylesheets = routePreloadData.styles ?? {};`,
		`const stylesheetLoads = new Map();`,
		`export function loadRouteStylesheets(file, document = globalThis.document) {`,
		`  const hrefs = pageStylesheets[file];`,
		`  if (!hrefs?.length || !document?.head) return Promise.resolve();`,
		`  const have = new Set([...document.head.children].map((node) => node.getAttribute(${key}) ?? (node.rel === 'stylesheet' ? node.getAttribute('href') : null)));`,
		`  return Promise.all(hrefs.map((href) => {`,
		`    if (stylesheetLoads.has(href)) return stylesheetLoads.get(href);`,
		`    if (have.has(href)) return undefined;`,
		`    const load = new Promise((done, fail) => {`,
		`      const link = document.createElement('link');`,
		`      link.rel = 'stylesheet';`,
		`      link.href = href;`,
		`      link.setAttribute(${key}, href);`,
		`      link.onload = () => { stylesheetLoads.delete(href); done(); };`,
		`      link.onerror = () => { stylesheetLoads.delete(href); link.remove(); fail(new Error('Unable to load the stylesheet ' + href)); };`,
		`      document.head.appendChild(link);`,
		`    });`,
		`    stylesheetLoads.set(href, load);`,
		`    return load;`,
		`  }));`,
		`}`,
	];
}

function patchRoutePreloadsInBundle(
	bundle: Record<string, unknown>,
	routes: RoutePreloadMaps,
): void {
	const replacement = jsStringLiteralContent(JSON.stringify(compactRoutePreloadData(routes)));
	for (const chunk of outputChunks(bundle)) {
		if (!chunk.code?.includes(ROUTE_PRELOADS_PLACEHOLDER)) continue;
		chunk.code = chunk.code.replace(ROUTE_PRELOADS_PLACEHOLDER, replacement);
	}
}

// The document renders the shell every page sits in, so its scoped CSS - its
// own block and those of the components it renders - is linked on every route,
// ahead of the route's own sheets (a module's CSS precedes its importers').
function documentStylesheetsFromBundle(
	bundle: Record<string, unknown>,
	root: string,
	base: string,
): readonly string[] {
	const chunks = outputChunks(bundle);
	const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
	const documentFile = join(root, 'document.tsrx');
	const documentChunks = chunks.filter((chunk) =>
		[chunk.facadeModuleId, ...(chunk.moduleIds ?? [])].some(
			(id) =>
				id !== null &&
				id !== undefined &&
				decodePath(parseURL(id).pathname) === documentFile,
		),
	);
	if (documentChunks.length === 0) return [];
	return routeStylesheetsForChunks(
		documentChunks,
		new Set(documentChunks.map((chunk) => chunk.fileName)),
		chunksByFileName,
		base,
	);
}

async function clientStylesheetSources(
	clientOutDir: string,
	base: string,
	hrefs: readonly string[],
): Promise<Record<string, string>> {
	const sources: Record<string, string> = {};
	for (const href of new Set(hrefs))
		sources[href] = await readFile(join(clientOutDir, clientAssetFileName(href, base)), 'utf8');
	return sources;
}

function bundleStylesheetSources(
	bundle: Record<string, unknown>,
	base: string,
	hrefs: readonly string[],
): Record<string, string> {
	const sources: Record<string, string> = {};
	for (const href of hrefs) {
		const asset = bundle[clientAssetFileName(href, base)] as
			| { readonly type?: unknown; readonly source?: unknown }
			| undefined;
		if (asset?.type !== 'asset') continue;
		const source = asset.source;
		if (typeof source === 'string') sources[href] = source;
		else if (source instanceof Uint8Array) sources[href] = new TextDecoder().decode(source);
	}
	return sources;
}

function patchStylesheetSourcesInBundle(
	bundle: Record<string, unknown>,
	sources: Readonly<Record<string, string>>,
): void {
	const replacement = jsStringLiteralContent(JSON.stringify(sources));
	for (const chunk of outputChunks(bundle)) {
		if (!chunk.code?.includes(STYLESHEET_SOURCES_PLACEHOLDER)) continue;
		chunk.code = chunk.code.replace(STYLESHEET_SOURCES_PLACEHOLDER, () => replacement);
	}
}

function patchDocumentStylesheetsInBundle(
	bundle: Record<string, unknown>,
	stylesheets: readonly string[],
): void {
	const replacement = jsStringLiteralContent(JSON.stringify(stylesheets));
	for (const chunk of outputChunks(bundle)) {
		if (!chunk.code?.includes(DOCUMENT_STYLESHEETS_PLACEHOLDER)) continue;
		chunk.code = chunk.code.replace(DOCUMENT_STYLESHEETS_PLACEHOLDER, replacement);
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
	readonly name?: string;
	readonly preliminaryFileName?: string;
	readonly viteMetadata?: {
		readonly importedCss?: ReadonlySet<string> | readonly string[];
	};
}

function routeModulePreloadsFromBundle(input: {
	readonly base: string;
	readonly bundle: Record<string, unknown>;
	readonly navigationChunk: OutputChunkLike | undefined;
	readonly navigationPolyfillIds?: ReadonlySet<string>;
	readonly prerenderWakeChunk: OutputChunkLike | undefined;
	readonly resumeChunk: OutputChunkLike | undefined;
	readonly resumeModulesChunk?: OutputChunkLike | undefined;
	readonly root: string;
}): RoutePreloadMaps {
	// The bundler packs runtime no page's payload demands into this chunk; it loads on first import().
	// The execution log loads only on pages that activate it, so no plan names it.
	const allChunks = outputChunks(input.bundle).filter((chunk) => !isExecutionLogChunk(chunk));
	const deferred = marklessDeferredChunkFileNames(allChunks);
	const chunks = allChunks.filter((chunk) => !deferred.has(chunk.fileName));
	const deferredChunks = allChunks.filter((chunk) => deferred.has(chunk.fileName));
	const everyChunk = new Map(allChunks.map((chunk) => [chunk.fileName, chunk]));
	// With the pack planner on: each route's landing files, from its first-use closures.
	const plannedLanding = plannedLandingFiles(input.bundle);
	const deferredFileNames = new Set(deferredChunks.map((chunk) => chunk.fileName));
	const resumeRuntimeFileNames = new Set<string>();
	for (const entry of [input.resumeChunk, input.prerenderWakeChunk])
		if (entry)
			includeChunk(
				resumeRuntimeFileNames,
				{ chunks: everyChunk, everyChunk },
				entry.fileName,
			);
	// The resume runtime's own code a first event reaches only through import() rides a lazy sibling pack.
	const lazyRuntimePacks = new Set(
		[...resumeRuntimeFileNames].flatMap((fileName) => {
			const name = everyChunk.get(fileName)?.name;
			return name && lazyStartupPackName(name) !== name ? [lazyStartupPackName(name)] : [];
		}),
	);
	for (const chunk of allChunks)
		if (chunk.name && lazyRuntimePacks.has(chunk.name))
			includeChunk(
				resumeRuntimeFileNames,
				{ chunks: everyChunk, everyChunk },
				chunk.fileName,
			);
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
	const resolverSourceFiles = new Set(
		allChunks.flatMap((chunk) =>
			(chunk.moduleIds ?? []).flatMap((moduleId) => {
				const sourceFile = resolverVirtualModuleSourceFile(
					moduleId.startsWith('\0') ? moduleId.slice(1) : moduleId,
				);
				return sourceFile ? [sourceModulePathname(sourceFile)] : [];
			}),
		),
	);
	// Loaded at runtime only where window.navigation is missing, so no plan names it.
	const polyfillFileNames = new Set(
		chunks
			.filter(
				(chunk) =>
					chunk.facadeModuleId && input.navigationPolyfillIds?.has(chunk.facadeModuleId),
			)
			.map((chunk) => chunk.fileName),
	);
	const navigation: Record<string, readonly string[]> = {};
	const ssr: Record<string, readonly string[]> = {};
	const styles: Record<string, readonly string[]> = {};
	for (const [routeFile, routeFileChunks] of routeChunks) {
		const currentRouteFiles = new Set(routeFileChunks.map((chunk) => chunk.fileName));
		const chunksByFileName = new Map(
			chunks
				.filter(
					(chunk) =>
						!routeChunkFileNames.has(chunk.fileName) ||
						currentRouteFiles.has(chunk.fileName),
				)
				.map((chunk) => [chunk.fileName, chunk]),
		);
		const scope: ChunkScope = { chunks: chunksByFileName, everyChunk };
		// A landing page does not preload navigation-only packs unless landing code statically imports them.
		const landingScope: ChunkScope = {
			chunks: new Map(
				[...chunksByFileName].filter(([, chunk]) => !isMarklessNavigationPack(chunk.name)),
			),
			everyChunk,
		};
		const routeChunk = primaryRouteChunk(input.root, routeFile, routeFileChunks);
		const landingChunks = routeFileChunks.filter(
			(chunk) =>
				!isMarklessNavigationPack(chunk.name) &&
				!isNavigationOnlyRouteChunk(input.root, routeFile, chunk),
		);
		const landingChunk = landingChunks.length
			? primaryRouteChunk(input.root, routeFile, landingChunks)
			: routeChunk;
		const navigationFileNames = new Set<string>();
		if (input.navigationChunk) {
			includeChunk(navigationFileNames, scope, input.navigationChunk.fileName);
			// Client rendering imports its evaluator on every navigation; unplanned, it trails by two round trips.
			const renderPathChunks = new Map(chunksByFileName);
			for (const chunk of deferredChunks) renderPathChunks.set(chunk.fileName, chunk);
			const renderPath = new Set<string>();
			for (const fileName of input.navigationChunk.dynamicImports) {
				if (!routeChunkFileNames.has(fileName) && !polyfillFileNames.has(fileName)) {
					includeChunk(renderPath, scope, fileName, true);
				}
			}
			for (const fileName of renderPath) {
				navigationFileNames.add(fileName);
				// The resume runtime loads its deferred capabilities on demand, on every page alike.
				if (resumeRuntimeFileNames.has(fileName)) continue;
				const chunk = everyChunk.get(fileName)!;
				for (const target of [...chunk.dynamicImports, ...codeDynamicImports(chunk)])
					if (deferredFileNames.has(target))
						includeChunk(
							navigationFileNames,
							{ chunks: renderPathChunks, everyChunk },
							target,
							true,
						);
			}
		}
		includeChunk(navigationFileNames, scope, routeChunk.fileName);
		includeChunk(navigationFileNames, scope, routeChunk.fileName, true);
		if (input.navigationChunk) {
			for (const fileName of routeScopedDynamicImports(input.navigationChunk, routeFile)) {
				includeChunk(navigationFileNames, scope, fileName, true);
			}
		}

		const ssrFileNames = new Set<string>();
		if (input.resumeChunk) {
			includeChunk(ssrFileNames, landingScope, input.resumeChunk.fileName);
			// Only the CURRENT route's resume module and its closure: the first event must not fetch it.
			for (const table of [input.resumeChunk, input.resumeModulesChunk])
				for (const fileName of table ? routeScopedDynamicImports(table, routeFile) : [])
					includeChunk(ssrFileNames, landingScope, fileName, true);
		}
		// Empty-delta pages boot through the prerender-wake entry instead of the
		// resume module; its route-scoped closure obeys the same preload law —
		// the first interaction must fetch ZERO framework chunks.
		if (input.prerenderWakeChunk) {
			includeChunk(ssrFileNames, landingScope, input.prerenderWakeChunk.fileName);
			for (const fileName of routeScopedDynamicImports(input.prerenderWakeChunk, routeFile)) {
				includeChunk(ssrFileNames, landingScope, fileName, true);
			}
		}
		includeChunk(ssrFileNames, landingScope, landingChunk.fileName, true);

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
		let routeHasSymbols = false;
		for (const [sourceFile, symbolFileNames] of symbolChunks) {
			if (!routeSourceFiles.has(sourceFile)) continue;
			routeHasSymbols = true;
			for (const fileName of symbolFileNames) {
				includeChunk(navigationFileNames, scope, fileName, true);
				includeChunk(ssrFileNames, landingScope, fileName, true);
			}
		}

		// Snapshot before the navigation-entry additions below: those reach
		// foreign routes' edges, and a page must link only its own CSS.
		const styleFileNames = new Set([...navigationFileNames, ...ssrFileNames]);
		const planned = plannedLanding?.get(routeFile);
		if (planned)
			narrowToPlanned(ssrFileNames, planned, landingScope, [
				input.resumeChunk,
				input.prerenderWakeChunk,
			]);
		// A landing chunk evaluates these packs a task after the first event; unpreloaded, that task fetches them.
		for (const fileName of ssrFileNames)
			for (const specifier of warmEvaluatedImports(everyChunk.get(fileName)?.code ?? ''))
				includeChunk(
					ssrFileNames,
					landingScope,
					normalize(join(dirname(fileName), specifier)),
				);

		navigation[routeFile] = [...navigationFileNames].map((fileName) =>
			joinURL(input.base, fileName),
		);
		// Preloads download in document order: a first event waits for the page's static path, then for
		// the lazy halves of the packs it split from, so those lead and the rest follows as found.
		const firstEventPath = new Set<string>();
		const lazySiblings = [...ssrFileNames].filter((fileName) => {
			const name = everyChunk.get(fileName)?.name;
			return !!name && startupPackOfLazy(name) !== name;
		});
		for (const entry of lazySiblings.length
			? [input.resumeChunk, input.prerenderWakeChunk]
			: []) {
			if (!entry) continue;
			includeChunk(firstEventPath, landingScope, entry.fileName);
			for (const table of [entry, entry === input.resumeChunk && input.resumeModulesChunk])
				for (const fileName of table ? routeScopedDynamicImports(table, routeFile) : [])
					includeChunk(firstEventPath, landingScope, fileName);
		}
		for (const fileName of lazySiblings) includeChunk(firstEventPath, landingScope, fileName);
		// The page's resolver lists no symbol: no handler, trigger or reactive text ever wakes the resume runtime.
		const resolvesNothing =
			!routeHasSymbols && [...routeSourceFiles].some((file) => resolverSourceFiles.has(file));
		ssr[routeFile] = resolvesNothing
			? []
			: [
					...[...firstEventPath].filter((fileName) => ssrFileNames.has(fileName)),
					...[...ssrFileNames].filter((fileName) => !firstEventPath.has(fileName)),
				].map((fileName) => joinURL(input.base, fileName));
		styles[routeFile] = routeStylesheetsForChunks(
			routeFileChunks,
			styleFileNames,
			chunksByFileName,
			input.base,
		);
	}
	return { navigation, ssr, styles };
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
		// A facade chunk holds no module of its own; its symbol id lives only in facadeModuleId.
		const moduleIds = chunk.facadeModuleId
			? [...(chunk.moduleIds ?? []), chunk.facadeModuleId]
			: (chunk.moduleIds ?? []);
		for (const moduleId of moduleIds) {
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

// `chunks` bounds where a walk may start and which dynamic edges it follows; a static
// import runs with its importer, so static edges resolve against `everyChunk`.
interface ChunkScope {
	readonly chunks: ReadonlyMap<string, OutputChunkLike>;
	readonly everyChunk: ReadonlyMap<string, OutputChunkLike>;
}

function includeChunk(
	fileNames: Set<string>,
	scope: ChunkScope,
	fileName: string,
	includeDynamic = false,
	visited: Set<string> = new Set(),
	requiredByStaticImport = false,
): void {
	if (visited.has(fileName)) return;
	const chunk = (requiredByStaticImport ? scope.everyChunk : scope.chunks).get(fileName);
	if (!chunk) return;
	visited.add(fileName);
	fileNames.add(fileName);
	for (const imported of new Set([...chunk.imports, ...codeStaticImports(chunk)])) {
		includeChunk(fileNames, scope, imported, includeDynamic, visited, true);
	}
	if (!includeDynamic) {
		return;
	}
	for (const imported of new Set([...chunk.dynamicImports, ...codeDynamicImports(chunk)])) {
		includeChunk(fileNames, scope, imported, true, visited);
	}
}

// Keeps the boot entries, the planned files, and what either statically imports; a dynamic
// edge into code no first use on this route needs is left to load on demand.
function narrowToPlanned(
	fileNames: Set<string>,
	planned: ReadonlySet<string>,
	scope: ChunkScope,
	entries: ReadonlyArray<OutputChunkLike | undefined>,
): void {
	const kept = new Set<string>();
	for (const entry of entries) if (entry) includeChunk(kept, scope, entry.fileName);
	for (const fileName of fileNames)
		if (planned.has(fileName)) includeChunk(kept, scope, fileName, false, new Set(), true);
	const ordered = [...fileNames].filter((fileName) => kept.has(fileName));
	fileNames.clear();
	for (const fileName of [...ordered, ...kept]) fileNames.add(fileName);
}

type RouteResumeModules = NonNullable<MarklessRouterClientAssetsManifest['resumeModules']>;

// Read from the written bundle, so the URL and loader are the ones the browser fetches and calls.
function routeResumeModulesFromBundle(
	bundle: Record<string, unknown>,
	base: string,
	importMap: Readonly<Record<string, string>>,
	landing: Readonly<Record<string, readonly string[]>>,
): RouteResumeModules {
	const table = outputChunks(bundle).find((chunk) =>
		isVirtualEntryChunk(chunk, RESUME_MODULES_ORIGIN),
	);
	if (!table?.code) return {};
	const modules: Record<string, readonly string[]> = {};
	const loaders = routeResumeLoaders(table.code);
	for (const { routeFile, specifier, evaluate } of loaders.found) {
		if (!evaluate)
			throw new Error(
				`Markless Router could not read how ${table.fileName} evaluates the resume module of ${routeFile}.`,
			);
		const url = /^\.\.?\//.test(specifier)
			? joinURL(base, normalize(join(dirname(table.fileName), specifier)))
			: importMap[specifier];
		if (!url)
			throw new Error(
				`Markless Router could not resolve the resume module of ${routeFile} (${specifier}).`,
			);
		if (landing[routeFile]?.length && !landing[routeFile]!.includes(url))
			throw new Error(
				`Markless Router's landing plan for ${routeFile} does not preload its resume module ${url}: the first event would fetch it.`,
			);
		modules[routeFile] = [url, ...evaluate];
	}
	if (loaders.found.length !== loaders.imports)
		throw new Error(
			`Markless Router read ${loaders.found.length} of the ${loaders.imports} route resume loaders in ${table.fileName}.`,
		);
	return modules;
}

type AstNode = { readonly type: string; readonly [key: string]: unknown };

// `"/pages/x.tsrx":()=>import("./c.js")`, maybe inside Vite's CSS preload helper: a served page links its stylesheets.
function routeResumeLoaders(code: string) {
	const found: { routeFile: string; specifier: string; evaluate?: readonly string[] }[] = [];
	const evaluations = new Map<AstNode, readonly string[] | undefined>();
	let imports = 0;
	const visit = (node: unknown, route?: string): void => {
		if (Array.isArray(node)) return node.forEach((child) => visit(child, route));
		if (!node || typeof node !== 'object' || typeof (node as AstNode).type !== 'string') return;
		const current = node as AstNode;
		const key = current.type === 'Property' ? (current.key as AstNode) : undefined;
		const routeFile =
			typeof key?.value === 'string' && /^\/pages\/.+\.(?:tsrx|mdx)$/.test(key.value)
				? key.value.slice(1)
				: route;
		const then = current.type === 'CallExpression' ? (current.callee as AstNode) : undefined;
		if (
			then?.type === 'MemberExpression' &&
			(then.object as AstNode).type === 'ImportExpression' &&
			(then.property as AstNode).name === 'then'
		)
			evaluations.set(then.object as AstNode, packEvaluation(current));
		if (current.type === 'ImportExpression') {
			imports++;
			const specifier = staticString(current.source as AstNode);
			if (routeFile && specifier)
				found.push({
					routeFile,
					specifier,
					evaluate: evaluations.has(current) ? evaluations.get(current) : [],
				});
		}
		for (const [field, child] of Object.entries(current))
			if (field !== 'type') visit(child, routeFile);
	};
	visit(parseAst(code));
	return { found, imports };
}

function staticString(node: AstNode | undefined): string | undefined {
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	const quasis = node?.type === 'TemplateLiteral' ? (node.quasis as AstNode[]) : [];
	return quasis.length === 1
		? (quasis[0]!.value as { readonly cooked?: string }).cooked
		: undefined;
}

// A module packed with others evaluates on a call: `.then(e=>e.$ml1())` returns it, `.then(e=>(e.a(),e.b))` reads it after.
function packEvaluation(then: AstNode): readonly string[] | undefined {
	const [callback] = then.arguments as AstNode[];
	const [param] = (callback?.params as AstNode[] | undefined) ?? [];
	if (callback?.type !== 'ArrowFunctionExpression' || param?.type !== 'Identifier') return;
	const member = (node: AstNode | undefined) =>
		node?.type === 'MemberExpression' &&
		!node.computed &&
		(node.object as AstNode).name === param.name
			? ((node.property as AstNode).name as string)
			: undefined;
	const call = (node: AstNode | undefined) =>
		node?.type === 'CallExpression' && (node.arguments as AstNode[]).length === 0
			? member(node.callee as AstNode)
			: undefined;
	const body = callback.body as AstNode;
	const [first, second, ...rest] = (body.expressions as AstNode[] | undefined) ?? [];
	const init = body.type === 'SequenceExpression' ? call(first) : call(body);
	const read = body.type === 'SequenceExpression' && !rest.length ? member(second) : undefined;
	if (body.type === 'SequenceExpression') return init && read ? [init, read] : undefined;
	return init ? [init] : undefined;
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
	return cachedCodeImports(chunk).static;
}

function codeDynamicImports(chunk: OutputChunkLike): string[] {
	return cachedCodeImports(chunk).dynamic;
}

const chunkCodeImports = new WeakMap<
	OutputChunkLike,
	{
		code: string | undefined;
		fileName: string;
		static: string[];
		dynamic: string[];
	}
>();

function cachedCodeImports(chunk: OutputChunkLike) {
	const cached = chunkCodeImports.get(chunk);
	if (cached?.code === chunk.code && cached?.fileName === chunk.fileName) return cached;
	const imports = {
		code: chunk.code,
		fileName: chunk.fileName,
		static: codeImportSpecifiers(
			chunk,
			/(?:import\s*(?:[^('"`]*?\bfrom\s*)?|export\s*[^('"`]*?\bfrom\s*)["'](\.\/[^"']+\.js)["']/g,
		),
		dynamic: codeDynamicImportSpecifiers(chunk.code ?? '').map((specifier) =>
			normalize(join(dirname(chunk.fileName), specifier)),
		),
	};
	chunkCodeImports.set(chunk, imports);
	return imports;
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

function chunkRenamesSince(
	captured: ReadonlyMap<string, string | undefined>,
	bundle: Record<string, unknown>,
): Map<string, string> {
	const finalNames = new Map(
		outputChunks(bundle).map((chunk) => [chunk.preliminaryFileName, chunk.fileName]),
	);
	const renames = new Map<string, string>();
	for (const [fileName, preliminary] of captured) {
		const next = preliminary === undefined ? undefined : finalNames.get(preliminary);
		if (next !== undefined && next !== fileName) renames.set(fileName, next);
	}
	return renames;
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
	const ranked = chunks.map((chunk) => ({ chunk, rank: routeChunkRank(root, routeFile, chunk) }));
	const highestRank = Math.max(...ranked.map(({ rank }) => rank));
	const candidates = ranked.filter(({ rank }) => rank === highestRank);
	if (candidates.length !== 1) {
		throw new Error(
			`Markless Router found ambiguous primary chunks for ${routeFile}: ${candidates
				.map(({ chunk }) => chunk.fileName)
				.sort()
				.join(', ')}`,
		);
	}
	return candidates[0]!.chunk;
}

// Holds nothing of its route but code only a client navigation to it runs.
function isNavigationOnlyRouteChunk(
	root: string,
	routeFile: string,
	chunk: OutputChunkLike,
): boolean {
	const owned = [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])].filter(
		(moduleId): moduleId is string =>
			!!moduleId && routeFileForModuleId(root, moduleId) === routeFile,
	);
	return owned.length > 0 && owned.every(isRouteNavigationSourceRequest);
}

function routeChunkRank(root: string, routeFile: string, chunk: OutputChunkLike): number {
	let rank = 0;
	for (const moduleId of [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])]) {
		if (!moduleId || routeFileForModuleId(root, moduleId) !== routeFile) continue;
		const role = isClientPrimarySourceRequest(moduleId)
			? 5
			: isRenderDataSourceRequest(moduleId)
				? 4
				: isSymbolOnlySourceRequest(moduleId)
					? 1
					: isResumeSourceRequest(moduleId)
						? 2
						: 3;
		const ownsModule = chunk.moduleIds?.includes(moduleId) ? 1 : 0;
		rank = Math.max(rank, role * 2 + ownsModule);
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
