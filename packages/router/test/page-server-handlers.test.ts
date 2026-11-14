import { expect, test } from 'vitest';
import {
	missingPageServerHandlerMessage,
	pageServerHandlerFiles,
	pageServerHandlerImportsPlugin,
	pageServerHandlersState,
	pluginsSharingPageServerModules,
} from '../src/vite/nitro-page-server-handlers.ts';

const handler = (file: string, env?: string) => ({ handler: `/app/${file}`, ...(env && { env }) });

// Nitro's own routing for a production build: it already left out the .dev handler.
const nitro = {
	scannedHandlers: [
		handler('middleware/log.ts'),
		handler('api/count.ts'),
		handler('api/mode.dev.ts', 'dev'),
		handler('api/mode.prod.ts', 'prod'),
		handler('api/seed.prerender.ts', 'prerender'),
	],
	routing: {
		routes: {
			routes: {
				'/api/count': { data: handler('api/count.ts') },
				'/api/mode': { data: [handler('api/mode.prod.ts', 'prod')] },
				'/**': { data: { handler: '/nitro/runtime/ssr-renderer.mjs' } },
			},
		},
		routedMiddleware: { routes: {} },
		globalMiddleware: [handler('middleware/log.ts')],
	},
};

test('the page server builds the scanned handlers Nitro routes for this env, and the prerenderer ones', () => {
	expect(pageServerHandlerFiles(nitro)).toEqual([
		'/app/middleware/log.ts',
		'/app/api/count.ts',
		'/app/api/mode.prod.ts',
		'/app/api/seed.prerender.ts',
	]);
});

test('a production build stops when a scanned handler has no page server copy', () => {
	const state = pageServerHandlersState();
	state.nitro = nitro;
	state.built.set('/app/api/count.ts', '/out/ssr/count.js');
	const plugin = pageServerHandlerImportsPlugin(state, false);
	const resolveId = (plugin.resolveId as { handler: Function }).handler;
	const context = {
		error(message: string): never {
			throw new Error(message);
		},
	};
	expect(resolveId.call(context, '/app/api/count.ts')).toBe('/out/ssr/count.js');
	expect(resolveId.call(context, '/app/other.ts')).toBeNull();
	expect(() => resolveId.call(context, '/app/middleware/log.ts')).toThrow(
		missingPageServerHandlerMessage('/app/middleware/log.ts'),
	);
});

test('a Nitro plugin that reaches a module the page server holds is named with that module', () => {
	const graph: Record<string, { importedIds: string[]; dynamicallyImportedIds: string[] }> = {
		'/app/plugins/seed.ts': {
			importedIds: ['/app/server/seed-data.ts'],
			dynamicallyImportedIds: [],
		},
		'/app/server/seed-data.ts': {
			importedIds: [],
			dynamicallyImportedIds: ['/app/server/store.ts'],
		},
		'/app/server/store.ts': {
			importedIds: ['/app/plugins/seed.ts'],
			dynamicallyImportedIds: [],
		},
		'/app/plugins/log.ts': {
			importedIds: ['/app/server/logger.ts'],
			dynamicallyImportedIds: [],
		},
		'/app/server/logger.ts': { importedIds: [], dynamicallyImportedIds: [] },
	};
	const sharing = pluginsSharingPageServerModules(
		['/app/plugins/seed.ts', '/app/plugins/log.ts', 'nitro/runtime/internal/plugin.mjs'],
		new Set(['/app/server/store.ts', '/app/pages/index.tsrx']),
		(id) => graph[id] ?? null,
	);
	expect([...sharing]).toEqual([['/app/plugins/seed.ts', ['/app/server/store.ts']]]);
});
