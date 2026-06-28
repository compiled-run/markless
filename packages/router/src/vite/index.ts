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
import { decodePath, joinURL, parseURL, withoutLeadingSlash } from 'ufo';
import { transformRequestFileSource } from '../request-files.ts';
import { anchorTransformPlugin } from './anchor-transform.ts';
import { htmlTransformPlugin } from './html-transform.ts';
import { mdxTransformPlugin } from './mdx.ts';
import { routeTypegenPlugin } from './route-typegen.ts';

const ROUTE_DISCOVERY_ID = 'virtual:arcade-router/routes';
const CLIENT_ENTRY_ID = 'virtual:arcade-router/client-entry';
const CLIENT_ENTRY_ORIGIN = '/entries/client-entry.ts';
const CLIENT_ENTRY_PATH_ID = 'virtual:arcade-router/client-entry-path';
const SERVER_ENTRY_ID = 'virtual:arcade-router/server-entry';
const ROUTE_HREF_ID = 'virtual:arcade-router/route-href';
const PUBLIC_VIRTUAL_MODULE_ID_RE =
	/^virtual:arcade-router\/(?:routes|client-entry|client-entry-path|server-entry|route-href)$/;
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
	const clientEntry = clientEntryState();

	return [
		routerConfigPlugin(nitroPlugins, clientEntry),
		mdxTransformPlugin(),
		requestFileTransformPlugin(),
		routeTypegenPlugin(),
		anchorTransformPlugin(),
		htmlTransformPlugin(),
		virtualModulesPlugin(clientEntry),
		nitroPlugins,
	];
}

function routerConfigPlugin(
	nitroPluginsFromRouter: readonly Plugin[],
	clientEntry: ClientEntryState,
): Plugin {
	return {
		name: 'arcade-router:vite',
		enforce: 'pre',
		config(config: UserConfig) {
			throwIfUserAddedNitro(config.plugins, nitroPluginsFromRouter);
			config.environments ??= {};
			const ssrEnvironment = (config.environments.ssr ??= {}) as {
				build?: { rollupOptions?: { input?: unknown } };
			};
			ssrEnvironment.build ??= {};
			ssrEnvironment.build.rollupOptions ??= {};
			ssrEnvironment.build.rollupOptions.input ??= SERVER_ENTRY_ID;

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
			clientEntry.base = config.base;
		},
		configEnvironment(_name, config) {
			configureRouteInputs(config);
		},
		generateBundle(_options, bundle) {
			if (this.environment?.config.consumer !== 'client') {
				return;
			}

			const chunk = Object.values(bundle).find(
				(item) => item.type === 'chunk' && isClientEntryChunk(item),
			);
			if (chunk) {
				clientEntry.fileName = chunk.fileName;
			}
		},
	};
}

function configureRouteInputs(config: EnvironmentOptions): void {
	config.build ??= {};
	config.build.rolldownOptions ??= {};
	if (config.consumer === 'client') {
		config.build.rolldownOptions.input = clientInput(config.build.rolldownOptions.input);
	} else {
		config.build.rolldownOptions.input ??= SERVER_ENTRY_ID;
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
		...(nitroConfig?.devServer ? { devServer: nitroConfig.devServer } : {}),
		routesDir: nitroConfig?.routesDir ?? '.arcade/router/nitro-routes',
		rolldownConfig: withRequestFileBuildPlugin(nitroConfig?.rolldownConfig, root),
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

interface ClientEntryState {
	base: string;
	fileName: string | undefined;
}

function clientEntryState(): ClientEntryState {
	return { base: '/', fileName: undefined };
}

function clientInput(input: InputOption | undefined): InputOption | undefined {
	if (input === undefined) {
		return CLIENT_ENTRY_ID;
	}

	if (typeof input === 'string' || Array.isArray(input)) {
		return [CLIENT_ENTRY_ID, ...(Array.isArray(input) ? input : [input])];
	}

	if (isRecord(input)) {
		return { ...input, 'arcade-router-client': CLIENT_ENTRY_ID };
	}

	return input;
}

function isClientEntryChunk(chunk: {
	readonly facadeModuleId?: string | null;
	readonly moduleIds?: readonly string[];
}) {
	return [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])].some((id) =>
		id?.endsWith(CLIENT_ENTRY_ORIGIN),
	);
}

function virtualModulesPlugin(clientEntry: ClientEntryState = clientEntryState()): Plugin {
	return {
		name: 'arcade-router:routes',
		resolveId: {
			filter: {
				id: PUBLIC_VIRTUAL_MODULE_ID_RE,
			},
			handler(id) {
				if (id === CLIENT_ENTRY_PATH_ID) {
					return id;
				}

				const entryFile = virtualEntryFiles[id as keyof typeof virtualEntryFiles];
				if (!entryFile) {
					return undefined;
				}
				return join(VIRTUAL_ENTRY_DIR, entryFile);
			},
		},
		load(id) {
			if (id === CLIENT_ENTRY_PATH_ID) {
				const path = clientEntry.fileName
					? joinURL(clientEntry.base, clientEntry.fileName)
					: joinURL(clientEntry.base, '@id', CLIENT_ENTRY_ID);
				return `export const clientEntryPath = ${JSON.stringify(path)};`;
			}
		},
	};
}
