import { describe, expect, test, vi } from 'vitest';
import { markless } from '../src/vite/index.ts';
import {
	callBuildApp,
	callBuildStart,
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
import { state } from '@markless/core';

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

		expect(plugin.name).toBe('vite-plugin-markless');
		expect(plugin.enforce).toBe('post');
		expect(plugin.sharedDuringBuild).toBe(true);
		expect(plugin.api?.registerBundleGraphAdder).toEqual(expect.any(Function));
		expect(plugin.api?.registerPreloadGraphEntries).toEqual(expect.any(Function));
		expect(plugin.api?.registerDevInjection).toEqual(expect.any(Function));
	});

	test('applies the Vite base to head links injected into built HTML', async () => {
		const plugin = getAsyncPlugin();
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const symbolId = (name: string) =>
			`\0virtual:markless:symbol:${encoded}:${encodeURIComponent(name)}`;
		const html = { type: 'asset', fileName: 'index.html', source: '<head></head>' };

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
		await callGenerateBundle(
			plugin,
			{
				'index.html': html,
				...Object.fromEntries(
					['symbol:0', 'symbol:1'].map((name, index) => [
						`build/chunk-${index}.js`,
						{
							type: 'chunk',
							fileName: `build/chunk-${index}.js`,
							name: `chunk-${index}`,
							code: 'export default {};',
							exports: ['default'],
							imports: [],
							dynamicImports: [],
							moduleIds: [symbolId(name)],
							facadeModuleId: symbolId(name),
						},
					]),
				),
			},
			vi.fn(),
			createViteHookContext('client'),
		);

		expect(html.source).toContain('rel="modulepreload"');
		expect(html.source).toContain('href="/docs/build/chunk-');
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

	test('does not emit client resume chunks without a configured SSR TSRX root', async () => {
		const plugin = getAsyncPlugin();
		const emitFile = vi.fn();

		callConfig(plugin, {}, { command: 'build', mode: 'production' });
		callConfigResolved(plugin, {
			base: '/',
			command: 'build',
			root: '/workspace/app',
		});
		callBuildStart(plugin, { cwd: '/workspace/app', input: { symbols: 'src/App.tsrx' } });
		await callTransform(
			plugin,
			source,
			'/workspace/app/src/App.tsrx',
			{ ...createViteHookContext('client'), emitFile },
		);

		expect(emitFile.mock.calls.map((call) => call[0])).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: expect.stringContaining('virtual:markless:symbol:'),
				}),
			]),
		);
		expect(emitFile.mock.calls.map((call) => call[0].id)).not.toContain(
			`virtual:markless:resume:${encodeURIComponent('/workspace/app/src/App.tsrx')}`,
		);
	});

	test('emits client resume chunks when an SSR TSRX root owns browser resume', async () => {
		const plugin = getAsyncPlugin();
		const emitFile = vi.fn();
		const config = {
			environments: {
				ssr: {
					build: {
						rolldownOptions: {
							input: 'src/App.tsrx',
						},
					},
				},
			},
		};

		callConfig(plugin, config, { command: 'build', mode: 'production' });
		callConfigResolved(plugin, {
			base: '/',
			command: 'build',
			root: '/workspace/app',
		});
		callBuildStart(plugin, { cwd: '/workspace/app', input: { symbols: 'src/App.tsrx' } });
		await callTransform(
			plugin,
			source,
			'/workspace/app/src/App.tsrx',
			{ ...createViteHookContext('client'), emitFile },
		);

		expect(emitFile.mock.calls.map((call) => call[0].id)).toContain(
			`virtual:markless:resume:${encodeURIComponent('/workspace/app/src/App.tsrx')}`,
		);
	});

	test('does not install a custom dev client for the full reload fallback', async () => {
		const plugin = getAsyncPlugin();

		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});

		expect(callTransformIndexHtml(plugin, '<html></html>')).toEqual([
			expect.objectContaining({ tag: 'script', injectTo: 'head' }),
		]);
		expect(await callResolveId(plugin, 'virtual:markless-dev-client')).toBeNull();
		expect(await callLoad(plugin, '\0virtual:markless-dev-client')).toBeNull();
	});

	test('threads the Vite client tag into dev SSR artifacts', async () => {
		const plugin = getAsyncPlugin();

		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});
		const result = (await callTransform(
			plugin,
			source,
			'/workspace/app/src/App.tsrx',
			createViteHookContext('server'),
		)) as { code: string };

		expect(result.code).toContain('headInjections:');
		expect(result.code).toContain('"src": "/dev/@vite/client"'); // re-print spaces object literals
		// Dev resume URL points at the SOURCE module so the .tsrx stays in the client
		// module graph (vite's no-accepting-boundary full-reload depends on it); the
		// client source module re-exports resumeContainerEvent from the virtual
		// resume module in dev only. It must use the /@fs/<absolute> form: a
		// root-relative source path (e.g. /pages/r/[repo]/index.tsrx) is routed by
		// framework dev servers (nitro) as an APP ROUTE and 404s, killing the first
		// full-resume wake in dev (T104 living-proof regression).
		expect(result.code).toContain(
			'resumeModuleUrl: "/dev/@fs/workspace/app/src/App.tsrx?import"',
		);
	});

	test('serves dev symbol resolver tables with browser-loadable symbol module URLs', async () => {
		const plugin = getAsyncPlugin();
		const filename = '/workspace/app/src/App.tsrx';
		const tableSource = `
import { state } from '@markless/core';

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
			`\0virtual:markless:resolver:${encodeURIComponent(filename)}`,
		);

		expect(resolverSource).toContain('/dev/@id/__x00__virtual:markless:symbol:');
		expect(resolverSource).not.toContain('"virtual:markless:symbol:');
		expect(resolverSource).toContain('import(/* @vite-ignore */ moduleUrls[row[0]])');
	});

	test('hot updates invalidate generated virtual modules and send a full reload', async () => {
		const plugin = getAsyncPlugin();
		const send = vi.fn();
		const invalidated: unknown[] = [];
		const virtualModule = { id: '\0virtual:markless:payload:/src/App.tsrx' };
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
		const result = await callHotUpdate(
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
		expect(send).toHaveBeenCalledWith({
			type: 'full-reload',
			path: '/src/App.tsrx',
			triggeredBy: '/workspace/app/src/App.tsrx',
		});
	});

	test('hot updates with unchanged file content skip invalidation and full reload', async () => {
		const plugin = getAsyncPlugin();
		const send = vi.fn();
		const virtualModule = { id: '\0virtual:markless:payload:/src/App.tsrx' };
		const environment = {
			config: { consumer: 'client' },
			hot: { send },
			moduleGraph: {
				getModuleById: vi.fn(() => virtualModule),
				invalidateModule: vi.fn(),
			},
		};
		const server = {
			config: { root: '/workspace/app' },
			environments: { client: environment },
		};

		callConfigResolved(plugin, { base: '/', command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, server);
		await callTransform(
			plugin,
			source,
			'/workspace/app/src/App.tsrx',
			createViteHookContext('client'),
		);

		const hotUpdateOptions = {
			file: '/workspace/app/src/App.tsrx',
			modules: [],
			timestamp: 123,
			type: 'update',
		};
		const unchanged = await callHotUpdate(
			plugin,
			{ ...hotUpdateOptions, read: async () => source },
			{ environment },
		);

		expect(unchanged).toEqual([]);
		expect(environment.moduleGraph.invalidateModule).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();

		const edited = await callHotUpdate(
			plugin,
			{ ...hotUpdateOptions, read: async () => source.replace('count++', 'count += 2') },
			{ environment },
		);

		expect(edited).toEqual([]);
		expect(environment.moduleGraph.invalidateModule).toHaveBeenCalledWith(
			virtualModule,
			expect.anything(),
			123,
			true,
		);
		expect(send).toHaveBeenCalledWith({
			type: 'full-reload',
			path: '/src/App.tsrx',
			triggeredBy: '/workspace/app/src/App.tsrx',
		});
	});

	test('server hot updates forward through the configured client environment', async () => {
		const plugin = getPlugin(
			markless({ clientEnvironment: 'browser', serverEnvironment: 'edge' }),
			'vite-plugin-markless',
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
		const result = await callHotUpdate(
			plugin,
			{
				file: '/workspace/app/src/App.tsrx',
				modules: [],
				timestamp: 456,
			},
			{ environment },
		);

		expect(result).toEqual([]);
		expect(browserSend).toHaveBeenCalledWith({
			type: 'full-reload',
			path: '/src/App.tsrx',
			triggeredBy: '/workspace/app/src/App.tsrx',
		});
		expect(defaultClientSend).not.toHaveBeenCalled();
	});

	test('server hot updates invalidate the browser resume virtual module', async () => {
		const plugin = getAsyncPlugin();
		const send = vi.fn();
		const filename = '/workspace/app/src/App.tsrx';
		const resumeId = `\0virtual:markless:resume:${encodeURIComponent(filename)}`;
		const resumeModule = { id: resumeId };
		const browser = {
			hot: { send },
			moduleGraph: {
				getModuleById: vi.fn((id: string) => (id === resumeId ? resumeModule : undefined)),
				invalidateModule: vi.fn(),
			},
		};
		const ssr = {
			name: 'ssr',
			config: { consumer: 'server' },
			moduleGraph: {
				getModuleById: vi.fn(),
				invalidateModule: vi.fn(),
			},
		};

		callConfigResolved(plugin, { base: '/', command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, {
			config: { root: '/workspace/app' },
			environments: { client: browser, ssr },
		});
		await callTransform(plugin, source, filename, createViteHookContext('server'));

		await callHotUpdate(
			plugin,
			{
				file: filename,
				modules: [],
				timestamp: 789,
			},
			{ environment: ssr },
		);

		expect(browser.moduleGraph.invalidateModule).toHaveBeenCalledWith(
			resumeModule,
			expect.anything(),
			789,
			true,
		);
		expect(send).toHaveBeenCalledWith({
			type: 'full-reload',
			path: '/src/App.tsrx',
			triggeredBy: filename,
		});
	});
});

function getAsyncPlugin() {
	return getPlugin(markless(), 'vite-plugin-markless') as ReturnType<typeof markless>[number] & {
		api?: {
			registerBundleGraphAdder: (adder: () => Record<string, never>) => void;
			registerDevInjection: (injection: unknown) => void;
			registerPreloadGraphEntries: (adder: () => Record<string, never>) => void;
		};
		sharedDuringBuild?: boolean;
	};
}
