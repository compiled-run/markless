import { nitro } from 'nitro/vite';
import { dirname, isAbsolute, join, normalize, relative } from 'pathe';
import {
	type EnvironmentOptions,
	sortUserPlugins,
	type Plugin,
	type PluginOption,
	type ResolvedConfig,
	type UserConfig,
} from 'vite';
import type { InputOption } from 'rolldown';
import {
	decodePath,
	joinURL,
	parsePath,
	parseQuery,
	parseURL,
	stringifyQuery,
	withoutLeadingSlash,
} from 'ufo';
import { transformRequestFileSource } from '../request-files.ts';
import { anchorTransformPlugin } from './anchor-transform.ts';
import { htmlTransformPlugin } from './html-transform.ts';
import { mdxTransformPlugin } from './mdx.ts';
import { routeTypegenPlugin } from './route-typegen.ts';

const ROUTE_DISCOVERY_ID = 'virtual:arcade-router/routes';
const CLIENT_ENTRY_ID = 'virtual:arcade-router/client-entry';
const RESUME_ENTRY_ID = 'virtual:arcade-router/resume-entry';
const RESUME_ENTRY_ORIGIN = '/entries/resume-entry.ts';
const RESUME_ENTRY_PATH_ID = 'virtual:arcade-router/resume-entry-path';
const SERVER_ENTRY_ID = 'virtual:arcade-router/server-entry';
const ROUTE_HREF_ID = 'virtual:arcade-router/route-href';
const PUBLIC_VIRTUAL_MODULE_ID_RE =
	/^virtual:arcade-router\/(?:routes|client-entry|resume-entry|resume-entry-path|server-entry|route-href)(?:\?.*)?$/;
const VITE_PLUGIN_FILE = decodePath(parseURL(import.meta.url).pathname);
const VIRTUAL_ENTRY_DIR = VITE_PLUGIN_FILE.endsWith('.ts')
	? join(dirname(VITE_PLUGIN_FILE), 'entries')
	: join(dirname(dirname(VITE_PLUGIN_FILE)), 'entries');
const DEFAULT_WATCH_IGNORES = [
	'**/.arcade/**',
	'**/.nitro/**',
	'**/.output/**',
	'**/node_modules/**',
	'**/dist/**',
] as const;

const virtualEntryFiles = {
	[ROUTE_DISCOVERY_ID]: 'route-discovery.ts',
	[CLIENT_ENTRY_ID]: 'client-entry.ts',
	[RESUME_ENTRY_ID]: 'resume-entry.ts',
	[SERVER_ENTRY_ID]: 'server-entry.ts',
	[ROUTE_HREF_ID]: 'route-href.ts',
} as const;

export interface ArcadeRouterOptions {
	nitro?: boolean;
}

export function router(options: ArcadeRouterOptions = {}): PluginOption[] {
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

	return [
		routerConfigPlugin(nitroPlugins, resumeEntry),
		mdxTransformPlugin(),
		requestFileTransformPlugin(),
		routeTypegenPlugin(),
		anchorTransformPlugin(),
		htmlTransformPlugin(),
		virtualModulesPlugin(resumeEntry),
		nitroPlugins,
	];
}

function routerConfigPlugin(
	nitroPluginsFromRouter: readonly Plugin[],
	resumeEntry: ResumeEntryState,
): Plugin {
	return {
		name: 'arcade-router:vite',
		enforce: 'pre',
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
			resumeEntry.base = config.base;
		},
		configEnvironment(_name, config) {
			configureRouteInputs(config);
		},
		generateBundle(_options, bundle) {
			if (this.environment?.config.consumer !== 'client') {
				return;
			}

			const chunk = Object.values(bundle).find(
				(item) => item.type === 'chunk' && isResumeEntryChunk(item),
			);
			if (chunk) {
				resumeEntry.fileName = chunk.fileName;
			}
		},
	};
}

function configureRouteInputs(config: EnvironmentOptions): void {
	config.build ??= {};
	config.build.rolldownOptions ??= {};
	if (config.consumer === 'client') {
		config.build.rolldownOptions.input = resumeInput(
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

function withExternal(external: unknown, id: string): unknown {
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
		name: 'arcade-router:request-files',
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
		name: 'arcade-router:nitro-request-files',
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
	serverWatchIgnored: readonly unknown[] = [],
): NonNullable<UserConfig['nitro']> {
	const scanDirs = Array.isArray(nitroConfig?.scanDirs)
		? nitroConfig.scanDirs.filter((dir): dir is string => typeof dir === 'string')
		: [];
	const watchOptions = withWatchIgnores(nitroConfig?.watchOptions, serverWatchIgnored);

	return {
		...nitroConfig,
		apiDir: nitroConfig?.apiDir ?? 'api',
		devServer: nitroConfig?.devServer,
		routesDir: nitroConfig?.routesDir ?? '.arcade/router/nitro-routes',
		rolldownConfig: withRequestFileBuildPlugin(nitroConfig?.rolldownConfig, root),
		rollupConfig: withRequestFileBuildPlugin(nitroConfig?.rollupConfig, root),
		scanDirs: [...new Set(['.', ...scanDirs])],
		watchOptions,
	} as NonNullable<UserConfig['nitro']>;
}

function withWatchIgnores(
	watchOptions: unknown,
	extraIgnored: readonly unknown[] = [],
): Record<string, unknown> & { ignored: unknown[] } {
	const watchOptionsObject = isRecord(watchOptions) ? watchOptions : {};

	return {
		...watchOptionsObject,
		followSymlinks: watchOptionsObject.followSymlinks ?? false,
		ignored: [
			...toArray(watchOptionsObject.ignored),
			...extraIgnored,
			...DEFAULT_WATCH_IGNORES,
		],
	};
}

function toArray(value: unknown): unknown[] {
	if (value === undefined) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
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
			'Arcade Router wires Nitro internally. Remove nitro() from vite.config.ts and keep plugins: [arcade(), router()].',
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

function resumeEntryState(): ResumeEntryState {
	return { base: '/', fileName: undefined };
}

function resumeInput(input: InputOption | undefined, root: string): InputOption | undefined {
	const resumeEntryId = scopedVirtualEntryId(RESUME_ENTRY_ID, root);
	if (input === undefined) {
		return resumeEntryId;
	}

	if (typeof input === 'string' || Array.isArray(input)) {
		return [resumeEntryId, ...(Array.isArray(input) ? input : [input])];
	}

	if (isRecord(input)) {
		return { ...input, 'arcade-router-resume': resumeEntryId };
	}

	return input;
}

function isResumeEntryChunk(chunk: {
	readonly facadeModuleId?: string | null;
	readonly moduleIds?: readonly string[];
}) {
	return [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])].some((id) =>
		id ? decodePath(parseURL(id).pathname).endsWith(RESUME_ENTRY_ORIGIN) : false,
	);
}

function virtualModulesPlugin(resumeEntry: ResumeEntryState = resumeEntryState()): Plugin {
	let root = '';

	return {
		name: 'arcade-router:routes',
		configResolved(config) {
			root = config.root;
		},
		resolveId: {
			filter: {
				id: PUBLIC_VIRTUAL_MODULE_ID_RE,
			},
			handler(id) {
				const baseId = virtualModuleBaseId(id);
				if (baseId === SERVER_ENTRY_ID) {
					return `\0${baseId}${rootScopeQuery(root, id)}`;
				}
				if (baseId === RESUME_ENTRY_PATH_ID) {
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
				const path = resumeEntry.fileName
					? joinURL(resumeEntry.base, resumeEntry.fileName)
					: joinURL(resumeEntry.base, '@id', scopedVirtualEntryId(RESUME_ENTRY_ID, root));
				return `export const resumeEntryPath = ${JSON.stringify(path)};`;
			}
		},
	};
}

function serverEntrySource(root: string): string {
	const query = rootScopeQuery(root);
	return [
		`import { createServerEntry } from '@arcade/router/vite/runtime/create-server-entry';`,
		`import { resumeEntryPath } from '${RESUME_ENTRY_PATH_ID}${query}';`,
		`import { pageModuleLoaders, routeFileIds } from '${ROUTE_DISCOVERY_ID}${query}';`,
		`const documentModuleLoaders = import.meta.glob(['/document.tsrx']);`,
		`const entry = createServerEntry({`,
		`  resumeEntryPath,`,
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
		'arcade-router-root': root || '.',
	});
	return query ? `?${query}` : '';
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
