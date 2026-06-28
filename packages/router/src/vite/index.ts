import { dirname, join } from 'pathe';
import type { Plugin, PluginOption } from 'vite';
import { decodePath, joinURL, parseURL } from 'ufo';
import { routeTypegenPlugin } from './route-typegen.ts';

const ROUTE_DISCOVERY_ID = 'virtual:arcade-router/routes';
const CLIENT_ENTRY_PATH_ID = 'virtual:arcade-router/client-entry-path';
const ROUTE_HREF_ID = 'virtual:arcade-router/route-href';
const PUBLIC_VIRTUAL_MODULE_ID_RE =
	/^virtual:arcade-router\/(?:routes|client-entry-path|route-href)$/;
const VITE_PLUGIN_FILE = decodePath(parseURL(import.meta.url).pathname);
const VIRTUAL_ENTRY_DIR = VITE_PLUGIN_FILE.endsWith('.ts')
	? join(dirname(VITE_PLUGIN_FILE), 'entries')
	: join(dirname(dirname(VITE_PLUGIN_FILE)), 'entries');

const virtualEntryFiles = {
	[ROUTE_HREF_ID]: 'route-href.ts',
} as const;

export interface ArcadeRouterOptions {}

export function router(_options: ArcadeRouterOptions = {}): PluginOption[] {
	return [routeTypegenPlugin(), virtualModulesPlugin()];
}

function virtualModulesPlugin(): Plugin {
	return {
		name: 'arcade-router:routes',
		resolveId: {
			filter: {
				id: PUBLIC_VIRTUAL_MODULE_ID_RE,
			},
			handler(id) {
				if (id === ROUTE_DISCOVERY_ID) {
					return id;
				}
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
			if (id === ROUTE_DISCOVERY_ID) {
				return routeDiscoverySource();
			}
			if (id === CLIENT_ENTRY_PATH_ID) {
				return `export const clientEntryPath = ${JSON.stringify(joinURL('/', '@id', 'virtual:arcade-router/client-entry'))};`;
			}
		},
	};
}

function routeDiscoverySource(): string {
	return [
		'import { createRouteDiscovery } from "@arcade/router/vite/runtime/create-route-discovery";',
		'const routeDiscovery = createRouteDiscovery(import.meta.glob(["/pages/**/*.tsrx", "/pages/**/*.mdx"]));',
		'export const pageModuleLoaders = routeDiscovery.pageModuleLoaders;',
		'export const routeFileIds = routeDiscovery.routeFileIds;',
	].join('\n');
}
