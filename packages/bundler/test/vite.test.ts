import { describe, expect, test, vi } from 'vitest';
import { arcade } from '../src/vite/index.ts';
import {
	callBuildApp,
	callConfig,
	callConfigResolved,
	callConfigureServer,
	callGenerateBundle,
	callHotUpdate,
	callLoad,
	callResolveId,
	callTransform,
	callTransformIndexHtml,
	createViteHookContext,
	getPlugin,
} from './helpers.ts';

const source = `
import { state } from 'arcade';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;

describe('Vite adapter structure', () => {
	test('lets the framework bundle graph own app preloading instead of Vite modulepreload', () => {
		const plugin = getAsyncPlugin();
		const appConfig = {};
		const ssrModeAppConfig = {};
		const libraryConfig = { build: { lib: { entry: 'src/index.ts' } } };
		const ssrConfig = { build: { ssr: 'src/entry.ts' } };

		expect(
			callConfig(plugin, appConfig, { command: 'build', mode: 'production' }),
		).toBeUndefined();
		expect(appConfig).toMatchObject({ build: { modulePreload: false } });

		callConfig(plugin, ssrModeAppConfig, { command: 'build', mode: 'ssr' });
		callConfig(plugin, libraryConfig, { command: 'build', mode: 'production' });
		callConfig(plugin, ssrConfig, { command: 'build', mode: 'ssr' });

		expect(ssrModeAppConfig).toMatchObject({ build: { modulePreload: false } });
		expect(libraryConfig.build).not.toHaveProperty('modulePreload');
		expect(ssrConfig.build).not.toHaveProperty('modulePreload');
	});

	test('wraps the Rolldown plugin with shared build state and public extension API', () => {
		const plugin = getAsyncPlugin();

		expect(plugin.name).toBe('vite-plugin-arcade');
		expect(plugin.enforce).toBe('post');
		expect(plugin.sharedDuringBuild).toBe(true);
		expect(plugin.api?.getManifest()).toBe(null);
		expect(plugin.api?.registerBundleGraphAdder).toEqual(expect.any(Function));
		expect(plugin.api?.registerPreloadGraphEntries).toEqual(expect.any(Function));
		expect(plugin.api?.registerDevInjection).toEqual(expect.any(Function));
	});

	test('uses sharedDuringBuild closure to expose the client manifest to same-build consumers', async () => {
		const plugin = getAsyncPlugin();

		callConfigResolved(plugin, {
			base: '/docs/',
			command: 'build',
			root: '/workspace/app',
		});
		await callTransform(
			plugin,
			source,
			'/workspace/app/src/App.tsrx',
			createViteHookContext('client'),
		);
		callGenerateBundle(
			plugin,
			{
				'build/chunk-payload.js': {
					type: 'chunk',
					fileName: 'build/chunk-payload.js',
					name: 'chunk-payload',
					code: 'export default {};',
					exports: ['default'],
					imports: [],
					dynamicImports: [],
					moduleIds: ['\0virtual:arcade:payload:%2Fworkspace%2Fapp%2Fsrc%2FApp.tsrx'],
					facadeModuleId: '\0virtual:arcade:payload:%2Fworkspace%2Fapp%2Fsrc%2FApp.tsrx',
				},
			},
			vi.fn(),
			createViteHookContext('client'),
		);

		expect(plugin.api?.getManifest()).toMatchObject({
			version: 1,
			modules: [expect.objectContaining({ source: '/workspace/app/src/App.tsrx' })],
		});
	});

	test('prebuilds the configured client and server environments once', async () => {
		const plugin = getAsyncPlugin();
		const client = { name: 'client', isBuilt: false };
		const ssr = { name: 'ssr', isBuilt: false };
		const build = vi.fn(async (environment: typeof client) => {
			environment.isBuilt = true;
			return [];
		});
		const builder = {
			environments: { client, ssr },
			build,
		};

		await callBuildApp(plugin, builder);

		expect(client.isBuilt).toBe(true);
		expect(ssr.isBuilt).toBe(true);
		expect(build).toHaveBeenCalledTimes(2);
		expect(build).toHaveBeenNthCalledWith(1, client);
		expect(build).toHaveBeenNthCalledWith(2, ssr);

		await builder.build(client);
		await builder.build(ssr);

		expect(build).toHaveBeenCalledTimes(2);
	});

	test('prebuilds custom server-like environments discovered from Vite', async () => {
		const plugin = getAsyncPlugin();
		const client = { name: 'client', isBuilt: false, config: { consumer: 'client' } };
		const edge = { name: 'edge', isBuilt: false, config: {} };
		const build = vi.fn(async (environment: typeof client | typeof edge) => {
			environment.isBuilt = true;
			return [];
		});
		const builder = {
			environments: { client, edge },
			build,
		};

		await callBuildApp(plugin, builder);

		expect(client.isBuilt).toBe(true);
		expect(edge.isBuilt).toBe(true);
		expect(build).toHaveBeenCalledTimes(2);
		expect(build).toHaveBeenNthCalledWith(1, client);
		expect(build).toHaveBeenNthCalledWith(2, edge);

		await builder.build(edge);

		expect(build).toHaveBeenCalledTimes(2);
	});

	test('injects and serves the Vite dev client only in dev HTML contexts', async () => {
		const plugin = getAsyncPlugin();

		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});

		const tags = callTransformIndexHtml(plugin, '<html></html>');
		expect(tags).toContainEqual(
			expect.objectContaining({
				tag: 'script',
				attrs: {
					type: 'module',
					src: '/dev/@id/virtual:arcade-dev-client',
				},
			}),
		);
		expect(await callResolveId(plugin, 'virtual:arcade-dev-client')).toMatchObject({
			id: '\0virtual:arcade-dev-client',
			moduleSideEffects: true,
		});
		expect(await callLoad(plugin, '\0virtual:arcade-dev-client')).toContain(
			"import.meta.hot.on('arcade:update'",
		);
	});

	test('serves dev symbol resolver tables with browser-loadable symbol module URLs', async () => {
		const plugin = getAsyncPlugin();
		const filename = '/workspace/app/src/App.tsrx';
		const tableSource = `
import { state } from 'arcade';

export function App() @{
	let count = state(0);
	let label = state('ready');

	<section>
		<button onClick={() => count++} onKeyDown={() => label = 'key'}>{count}</button>
		<p>{label}</p>
	</section>
}
`;

		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});
		await callTransform(plugin, tableSource, filename, createViteHookContext('client'));

		const resolverSource = await callLoad(
			plugin,
			`\0virtual:arcade:resolver:${encodeURIComponent(filename)}`,
		);

		expect(resolverSource).toContain('/dev/@id/__x00__virtual:arcade:symbol:');
		expect(resolverSource).not.toContain('"virtual:arcade:symbol:');
		expect(resolverSource).toContain('import(/* @vite-ignore */ moduleUrls[row[0]])');
	});

	test('hot updates invalidate generated virtual modules and send the custom event', async () => {
		const plugin = getAsyncPlugin();
		const send = vi.fn();
		const invalidated: unknown[] = [];
		const virtualModule = { id: '\0virtual:arcade:payload:/src/App.tsrx' };
		const environment = {
			config: { consumer: 'client' },
			hot: { send },
			moduleGraph: {
				getModuleById: vi.fn(() => virtualModule),
				invalidateModule: vi.fn((module: unknown) => invalidated.push(module)),
			},
		};
		const server = {
			config: { root: '/workspace/app' },
			environments: { client: environment },
		};

		callConfigResolved(plugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
		});
		callConfigureServer(plugin, server);
		await callTransform(
			plugin,
			source,
			'/workspace/app/src/App.tsrx',
			createViteHookContext('client'),
		);
		const result = callHotUpdate(
			plugin,
			{
				file: '/workspace/app/src/App.tsrx',
				modules: [],
				timestamp: 123,
			},
			{ environment },
		);

		expect(result).toEqual([]);
		expect(invalidated).toContain(virtualModule);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'custom',
				event: 'arcade:update',
				data: expect.objectContaining({
					files: ['/src/App.tsrx'],
					virtualModules: expect.arrayContaining([
						expect.stringContaining('virtual:arcade:payload:'),
					]),
				}),
			}),
		);
	});

	test('server hot updates forward through the configured client environment', () => {
		const plugin = getPlugin(
			arcade({ clientEnvironment: 'browser', serverEnvironment: 'edge' }),
			'vite-plugin-arcade',
		);
		const browserSend = vi.fn();
		const defaultClientSend = vi.fn();
		const environment = {
			name: 'edge',
			config: { consumer: 'server' },
			moduleGraph: {
				getModuleById: vi.fn(),
				invalidateModule: vi.fn(),
			},
		};

		callConfigResolved(plugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
		});
		callConfigureServer(plugin, {
			config: { root: '/workspace/app' },
			environments: {
				browser: { hot: { send: browserSend } },
				client: { hot: { send: defaultClientSend } },
				edge: environment,
			},
		});
		const result = callHotUpdate(
			plugin,
			{
				file: '/workspace/app/src/App.tsrx',
				modules: [],
				timestamp: 456,
			},
			{ environment },
		);

		expect(result).toEqual([]);
		expect(browserSend).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'custom',
				event: 'arcade:update',
				data: expect.objectContaining({ files: ['/src/App.tsrx'], t: 456 }),
			}),
		);
		expect(defaultClientSend).not.toHaveBeenCalled();
	});
});

function getAsyncPlugin() {
	return getPlugin(arcade(), 'vite-plugin-arcade') as ReturnType<typeof arcade>[number] & {
		api?: {
			getManifest: () => unknown;
			registerBundleGraphAdder: (adder: () => Record<string, never>) => void;
			registerDevInjection: (injection: unknown) => void;
			registerPreloadGraphEntries: (adder: () => Record<string, never>) => void;
		};
		sharedDuringBuild?: boolean;
	};
}
