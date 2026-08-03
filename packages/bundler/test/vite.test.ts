import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_CLIENT_ID,
	MARKLESS_DEV_ERROR_EVENT,
} from '../src/dev-error/index.ts';
import { transformTsrxModule } from '../src/rolldown.ts';
import { createViteHmr } from '../src/vite/hmr.ts';
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

const styledSource = source.replace(
	'\t<button onClick={() => count++}>{count}</button>',
	'\t<main>\n\t\t<button onClick={() => count++}>{count}</button>\n\t\t<style>button { background: red; }</style>\n\t</main>',
);

describe('Vite adapter structure', () => {
	test('prints the debugging playbook hint when the dev server starts', () => {
		const plugin = getAsyncPlugin();
		const info = vi.fn();

		callConfigureServer(plugin, {
			config: { logger: { info }, root: '/workspace/app' },
			environments: {},
		});

		expect(info).toHaveBeenCalledExactlyOnceWith(
			'markless diagnostics available - window.__MARKLESS_DEBUG__ records containers, lifecycles, and event routing; markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package.',
		);
	});

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
		const filename = '/workspace/app/src/App.tsrx';
		const transformed = await transformTsrxModule({
			filename,
			source,
			environment: 'client',
		});
		const html = { type: 'asset', fileName: 'index.html', source: '<head></head>' };

		callConfigResolved(plugin, {
			base: '/docs/',
			command: 'build',
			root: '/workspace/app',
		});
		const sourceChunk = (await callTransform(
			plugin,
			source,
			filename,
			createViteHookContext('client'),
		)) as { code: string };
		await callGenerateBundle(
			plugin,
			{
				'index.html': html,
				'build/app.js': {
					type: 'chunk',
					fileName: 'build/app.js',
					name: 'app',
					code: sourceChunk.code,
					exports: [],
					imports: [],
					dynamicImports: transformed.manifest.symbols.map(
						(_, index) => `build/chunk-${index}.js`,
					),
					moduleIds: [filename],
					facadeModuleId: filename,
				},
				...Object.fromEntries(
					transformed.manifest.symbols.map((symbol, index) => [
						`build/chunk-${index}.js`,
						{
							type: 'chunk',
							fileName: `build/chunk-${index}.js`,
							name: `chunk-${index}`,
							code: `export function ${symbol.exportName}() {}`,
							exports: [symbol.exportName],
							imports: [],
							dynamicImports: [],
							moduleIds: [`\0${symbol.virtualModuleId}`],
							facadeModuleId: `\0${symbol.virtualModuleId}`,
						},
					]),
				),
			},
			vi.fn(),
			createViteHookContext('client'),
		);

		expect(html.source).toContain('rel=modulepreload');
		expect(html.source).toContain('href=/docs/build/chunk-');
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
		await callTransform(plugin, source, '/workspace/app/src/App.tsrx', {
			...createViteHookContext('client'),
			emitFile,
		});

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
		await callTransform(plugin, source, '/workspace/app/src/App.tsrx', {
			...createViteHookContext('client'),
			emitFile,
		});

		expect(emitFile.mock.calls.map((call) => call[0].id)).toContain(
			`virtual:markless:resume:${encodeURIComponent('/workspace/app/src/App.tsrx')}`,
		);
	});

	test('resolves, loads, and injects the base-aware development error client', async () => {
		const plugin = getAsyncPlugin();
		const dispatchFetch = vi.fn(
			async () =>
				new Response('<html><head></head><body>app</body></html>', {
					headers: { 'content-type': 'text/html', 'content-length': '52' },
				}),
		);

		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});

		expect(callTransformIndexHtml(plugin, '<html></html>')).toEqual([
			expect.objectContaining({ tag: 'script', injectTo: 'head' }),
		]);
		expect(await callResolveId(plugin, MARKLESS_DEV_ERROR_CLIENT_ID)).toBe(
			`\0${MARKLESS_DEV_ERROR_CLIENT_ID}`,
		);
		const client = await callLoad(plugin, `\0${MARKLESS_DEV_ERROR_CLIENT_ID}`);
		expect(client).toContain('from "/dev/@vite/client"');
		expect(client).toContain(MARKLESS_DEV_ERROR_EVENT);

		const environment = { dispatchFetch };
		callConfigureServer(plugin, {
			config: { root: '/workspace/app' },
			environments: { ssr: environment },
		});
		const response = await environment.dispatchFetch(new Request('http://markless.test/'));
		const html = await response.text();
		expect(html).toContain('src="/dev/@vite/client"');
		expect(html).toContain(`src="/dev/@id/__x00__${MARKLESS_DEV_ERROR_CLIENT_ID}"`);
		expect(response.headers.has('content-length')).toBe(false);
	});

	test('threads Vite and scoped stylesheet tags into dev SSR artifacts', async () => {
		const plugin = getAsyncPlugin();

		callConfig(plugin, {}, { command: 'serve', mode: 'development' });
		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});
		const result = (await callTransform(
			plugin,
			styledSource,
			'/workspace/app/src/App.tsrx',
			createViteHookContext('server'),
		)) as { code: string };

		expect(result.code).toContain('headInjections:');
		expect(result.code).toContain('inlineResumerSources:');
		expect(result.code).toMatch(/"debug":\s*true/);
		expect(result.code).toContain('"src": "/dev/@vite/client"'); // re-print spaces object literals
		expect(result.code).toContain('"rel": "stylesheet"');
		expect(result.code).toMatch(
			/"href": "\/dev\/@id\/__x00__virtual:markless:style:.*\.css\?direct"/,
		);
		const styleId = `\0virtual:markless:style:${encodeURIComponent('/workspace/app/src/App.tsrx')}.css`;
		const resolvedStyle = await callResolveId(plugin, `${styleId}?direct`);
		expect(resolvedStyle).toMatchObject({ id: `${styleId}?direct` });
		expect(await callLoad(plugin, `${styleId}?direct`)).toContain('background: red');

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

	test('dev transforms reject imported compiled children without capture metadata', async () => {
		const childFilename = '/workspace/app/components/Child.tsrx';
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const childSource =
			'export default function Child() @{ <button>Child</button> }';
		const parentSource = `import Child from '../components/Child.tsrx';
export default function App() @{ <main><Child /></main> }`;
		const validPlugin = getAsyncPlugin();
		callConfig(validPlugin, {}, { command: 'serve', mode: 'development' });
		callConfigResolved(validPlugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
		});
		const transformRequest = vi.fn((url: string) =>
			callTransform(
				validPlugin,
				childSource,
				url,
				createViteHookContext('server'),
			),
		);
		callConfigureServer(validPlugin, {
			config: { root: '/workspace/app' },
			environments: { ssr: { transformRequest } },
		});
		callBuildStart(validPlugin, { cwd: '/workspace/app' }, createViteHookContext('server'));
		await expect(
			callTransform(
				validPlugin,
				parentSource,
				parentFilename,
				createViteHookContext('server'),
			),
		).resolves.toMatchObject({ manifest: { captureMetadata: expect.any(Object) } });
		expect(transformRequest).toHaveBeenCalledExactlyOnceWith(childFilename);

		const plugin = getAsyncPlugin();
		callConfig(plugin, {}, { command: 'serve', mode: 'development' });
		callConfigResolved(plugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
		});
		callBuildStart(plugin, { cwd: '/workspace/app' }, createViteHookContext('server'));
		const staleChild = (await callTransform(
			plugin,
			childSource,
			childFilename,
			createViteHookContext('server'),
		)) as { manifest: { captureMetadata?: unknown } };
		delete staleChild.manifest.captureMetadata;

		await expect(
			callTransform(
				plugin,
				parentSource,
				parentFilename,
				createViteHookContext('server'),
			),
		).rejects.toThrow(
			'MARKLESS_CAPTURE_METADATA_MISSING: Parent module "/workspace/app/pages/App.tsrx" composes imported child "../components/Child.tsrx", but its compiled artifact has no current capture metadata. Rebuild the child with the current Markless compiler and clear any stale build cache.',
		);
	});

	test('dev parent-first transforms bind imported sibling instances after eager child compilation', async () => {
		const childFilename = '/workspace/app/components/Child.tsrx';
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const childSource = `export function Child({ label, onTrace }) @{
	<button onClick={() => onTrace(label)}>{label}</button>
}`;
		const parentSource = `import { state } from '@markless/core';
import { Child } from '../components/Child.tsrx';
export function App() @{
	let first = state('Server spruce');
	let second = state('Server copper');
	let result = state('none');
	<main>
		<Child label={first} onTrace={(value) => result = value} />
		<Child label={second} onTrace={(value) => result = value} />
		<output>{result}</output>
	</main>
}`;
		const firstPassParent = await transformTsrxModule({
			filename: parentFilename,
			source: parentSource,
			environment: 'server',
		});
		expect(firstPassParent.manifest.captureMetadata?.boundResolverRows ?? []).toEqual([]);
		const plugin = getAsyncPlugin();
		callConfig(plugin, {}, { command: 'serve', mode: 'development' });
		callConfigResolved(plugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
		});
		let childResult: {
			manifest: {
				captureMetadata: { extractedSymbols: Array<{ symbolId: string; kind: string }> };
			};
		} | null = null;
		const transformRequest = vi.fn(async (url: string) => {
			childResult = (await callTransform(
				plugin,
				childSource,
				url,
				createViteHookContext('server'),
			)) as typeof childResult;
			return childResult;
		});
		callConfigureServer(plugin, {
			config: { root: '/workspace/app' },
			environments: { ssr: { transformRequest } },
		});
		callBuildStart(plugin, { cwd: '/workspace/app' }, createViteHookContext('server'));

		const parent = (await callTransform(
			plugin,
			parentSource,
			parentFilename,
			createViteHookContext('server'),
		)) as {
			code: string;
			manifest: {
				captureMetadata: {
					boundResolverRows: Array<{
						id: string;
						baseSymbolId: string;
						loaderSymbolId?: string;
						componentEdgePath: string[];
					}>;
				};
			};
			virtualModules: Array<{ type: string; source: string }>;
		};

		expect(transformRequest).toHaveBeenCalledExactlyOnceWith(childFilename);
		const childHandler = childResult!.manifest.captureMetadata.extractedSymbols.find(
			(symbol) => symbol.kind === 'event-handler',
		)!;
		const loaderSymbolId = `imported:${encodeURIComponent(childFilename)}:${childHandler.symbolId}`;
		const rows = parent.manifest.captureMetadata.boundResolverRows.filter(
			(row) => row.baseSymbolId === loaderSymbolId,
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.id)).toEqual([
			`bound:${encodeURIComponent(childHandler.symbolId)}:${encodeURIComponent('component-edge:0')}`,
			`bound:${encodeURIComponent(childHandler.symbolId)}:${encodeURIComponent('component-edge:1')}`,
		]);
		expect(new Set(rows.map((row) => row.id)).size).toBe(2);
		expect(new Set(rows.map((row) => row.loaderSymbolId))).toEqual(new Set([loaderSymbolId]));
		expect(rows.map((row) => row.componentEdgePath)).toEqual([
			['component-edge:0'],
			['component-edge:1'],
		]);
		for (const row of rows) expect(parent.code).toContain(row.id);
		const resolver = parent.virtualModules.find((module) => module.type === 'resolver')!;
		for (const row of rows) expect(resolver.source).toContain(row.id);
	});

	test('resolves and loads virtual module ids carrying the ?import suffix Vite adds to .tsrx-shaped imports', async () => {
		// The dev resume module imports `virtual:markless:payload:<file>` — an id
		// that ENDS in .tsrx, so Vite's import analysis treats it like an asset
		// and appends `?import`. Lookups must strip the query or the first
		// full-resume wake 404s on its payload/view imports (T104 dev proof).
		const plugin = getAsyncPlugin();
		const filename = '/workspace/app/src/App.tsrx';
		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});
		await callTransform(plugin, source, filename, createViteHookContext('client'));

		const canonicalId = `\0virtual:markless:payload:${encodeURIComponent(filename)}`;
		const resolved = await callResolveId(plugin, `${canonicalId}?import`);
		expect(resolved).toMatchObject({ id: canonicalId });

		const loaded = await callLoad(plugin, `${canonicalId}?import`);
		expect(loaded).toContain('export const state');
		expect(loaded).toContain('"graphNodeId": "state:count"');
	});

	test('resolves virtual ids after the /@id middleware decodeURI damage (bracketed route dirs)', async () => {
		// Vite decodeURI()s /@id request paths: %2F stays (reserved) but %5B/%5D
		// decode to raw brackets — so ids for pages like pages/r/[repo] come in
		// half-decoded and must still match the registered encodeURIComponent
		// form (the dashboard branch-menu dev regression).
		const plugin = getAsyncPlugin();
		const filename = '/workspace/app/pages/r/[repo]/Menu.tsrx';
		callConfigResolved(plugin, {
			base: '/dev/',
			command: 'serve',
			root: '/workspace/app',
		});
		await callTransform(plugin, source, filename, createViteHookContext('client'));

		const canonicalId = `\0virtual:markless:payload:${encodeURIComponent(filename)}`;
		const damagedId = decodeURI(`${canonicalId}?import`);
		expect(damagedId).toContain('[repo]');

		const resolved = await callResolveId(plugin, damagedId);
		expect(resolved).toMatchObject({ id: canonicalId });
		const loaded = await callLoad(plugin, damagedId);
		expect(loaded).toContain('export const state');
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

	test('invalid edits report a structured error without invalidation or reload, then clear before reload when fixed', async () => {
		const plugin = getAsyncPlugin();
		const send = vi.fn();
		const filename = '/workspace/app/src/App.tsrx';
		const environment = {
			config: { consumer: 'client' },
			hot: { send },
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};
		callConfigResolved(plugin, { base: '/', command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, {
			config: { root: '/workspace/app' },
			environments: { client: environment },
		});
		await callTransform(plugin, source, filename, createViteHookContext('client'));
		const hotUpdate = {
			file: filename,
			modules: [],
			timestamp: 124,
			type: 'update',
		};
		const broken = source.replace('</button>', '</button>>');

		expect(
			await callHotUpdate(
				plugin,
				{ ...hotUpdate, read: async () => broken },
				{ environment },
			),
		).toEqual([]);
		expect(environment.moduleGraph.invalidateModule).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledWith({
			type: 'custom',
			event: MARKLESS_DEV_ERROR_EVENT,
			data: expect.objectContaining({ version: 1, id: filename, kind: 'compile' }),
		});
		expect(send.mock.calls.some(([message]) => message.type === 'full-reload')).toBe(false);

		send.mockClear();
		expect(
			await callHotUpdate(
				plugin,
				{ ...hotUpdate, read: async () => source.replace('count++', 'count += 3') },
				{ environment },
			),
		).toEqual([]);
		expect(send.mock.calls[0]?.[0]).toEqual({
			type: 'custom',
			event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
			data: { id: filename },
		});
		expect(send.mock.calls[1]?.[0]).toMatchObject({ type: 'full-reload' });
	});

	test('reports one error when client and SSR environments process the same invalid edit', async () => {
		const filename = '/workspace/app/src/App.tsrx';
		const send = vi.fn();
		const client = {
			config: { consumer: 'client' },
			hot: { send },
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};
		const ssr = {
			config: { consumer: 'server' },
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};
		const hmr = createViteHmr({
			base: '/',
			clientEnvironment: 'client',
			enabled: true,
		});
		hmr.configureServer({
			config: { root: '/workspace/app' },
			environments: { client, ssr },
		} as never);
		const update = {
			file: filename,
			modules: [],
			read: async () => source.replace('</button>', '</button>>'),
			timestamp: 125,
			type: 'update',
		} as never;

		expect(await hmr.hotUpdate(client as never, update)).toEqual([]);
		expect(await hmr.hotUpdate(ssr as never, update)).toEqual([]);
		expect(
			send.mock.calls.filter(
				([message]) =>
					message.type === 'custom' && message.event === MARKLESS_DEV_ERROR_EVENT,
			),
		).toHaveLength(1);
	});

	test('invalidates prerender snapshots before sending the edit reload', async () => {
		const filename = '/workspace/app/src/App.tsrx';
		const order: string[] = [];
		const send = vi.fn((message: { type?: string }) => {
			if (message.type === 'full-reload') order.push('reload');
		});
		const invalidatePrerenderSnapshots = vi.fn((ids: readonly string[]) => {
			order.push(`snapshot:${ids.join(',')}`);
		});
		const environment = {
			config: { consumer: 'client' },
			hot: { send },
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};
		const hmr = createViteHmr({
			base: '/',
			clientEnvironment: 'client',
			enabled: true,
			invalidateGeneratedModules: async () => ['\0virtual:markless:render-data:App'],
			invalidatePrerenderSnapshots,
		});
		hmr.configureServer({
			config: { root: '/workspace/app' },
			environments: { client: environment },
		} as never);

		expect(
			await hmr.hotUpdate(
				environment as never,
				{
					file: filename,
					modules: [],
					read: async () => source.replace('{count}', '{count + 1}'),
					timestamp: 126,
					type: 'update',
				} as never,
			),
		).toEqual([]);
		expect(invalidatePrerenderSnapshots).toHaveBeenCalledExactlyOnceWith([
			'\0virtual:markless:render-data:App',
		]);
		expect(order).toEqual([
			'snapshot:\0virtual:markless:render-data:App',
			'reload',
		]);
	});

	test('rechecks invalid files on disk when the restoring watcher event is swallowed', async () => {
		const fixtureRoot = await mkdtemp(join(tmpdir(), 'markless-vite-hmr-'));
		const filename = join(fixtureRoot, 'alternate-root.tsrx');
		const broken = source.replace('</button>', '</button>>');
		const send = vi.fn();
		const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
		const environment = {
			config: { consumer: 'client' },
			hot: { send },
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};
		const hmr = createViteHmr({
			base: '/',
			clientEnvironment: 'client',
			enabled: true,
			invalidSourceRecheckMs: 10,
		});

		try {
			await writeFile(filename, broken);
			hmr.configureServer({
				config: { root: fixtureRoot },
				environments: { client: environment },
			} as never);
			expect(
				await hmr.hotUpdate(
					environment as never,
					{
						file: filename,
						modules: [],
						read: async () => broken,
						timestamp: 124,
						type: 'update',
					} as never,
				),
			).toEqual([]);

			send.mockClear();
			await writeFile(filename, source);
			await vi.waitFor(() => {
				expect(send.mock.calls).toEqual([
					[
						{
							type: 'custom',
							event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
							data: { id: filename },
						},
					],
					[{ type: 'full-reload' }],
				]);
			});
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(send).toHaveBeenCalledTimes(2);
			expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
		} finally {
			clearIntervalSpy.mockRestore();
			await rm(fixtureRoot, { force: true, recursive: true });
		}
	});

	test('keeps non-file runtime errors without crashing the invalid-source recheck', async () => {
		vi.useFakeTimers();
		try {
			const send = vi.fn();
			const environment = { config: { consumer: 'client' }, hot: { send } };
			const hmr = createViteHmr({
				base: '/',
				clientEnvironment: 'client',
				enabled: true,
				invalidSourceRecheckMs: 10,
			});
			hmr.configureServer({
				environments: { client: environment },
			} as never);

			hmr.reportError(environment as never, new Error('navigation failed'));
			await vi.advanceTimersByTimeAsync(30);

			expect(send).toHaveBeenCalledExactlyOnceWith({
				type: 'custom',
				event: MARKLESS_DEV_ERROR_EVENT,
				data: expect.objectContaining({ id: 'navigation:unknown' }),
			});
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	test('clears a deleted invalid file and stops polling it', async () => {
		const fixtureRoot = await mkdtemp(join(tmpdir(), 'markless-vite-hmr-deleted-'));
		const filename = join(fixtureRoot, 'deleted.tsrx');
		const send = vi.fn();
		const environment = { config: { consumer: 'client' }, hot: { send } };
		const hmr = createViteHmr({
			base: '/',
			clientEnvironment: 'client',
			enabled: true,
			invalidSourceRecheckMs: 10,
		});

		try {
			await writeFile(filename, source);
			hmr.configureServer({ environments: { client: environment } } as never);
			hmr.reportError(environment as never, {
				payload: {
					version: 1,
					id: filename,
					kind: 'compile',
					diagnostics: [],
					details: 'broken',
				},
			});
			send.mockClear();
			await rm(filename);

			await vi.waitFor(() => {
				expect(send).toHaveBeenCalledExactlyOnceWith({
					type: 'custom',
					event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
					data: { id: filename },
				});
			});
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(send).toHaveBeenCalledTimes(1);
		} finally {
			await rm(fixtureRoot, { force: true, recursive: true });
		}
	});

	test('batches multiple invalid-file recoveries into one full reload', async () => {
		const fixtureRoot = await mkdtemp(join(tmpdir(), 'markless-vite-hmr-batch-'));
		const filenames = [join(fixtureRoot, 'one.tsrx'), join(fixtureRoot, 'two.tsrx')];
		const send = vi.fn();
		const environment = { config: { consumer: 'client' }, hot: { send } };
		const hmr = createViteHmr({
			base: '/',
			clientEnvironment: 'client',
			enabled: true,
			invalidSourceRecheckMs: 10,
		});

		try {
			await Promise.all(filenames.map((filename) => writeFile(filename, source)));
			hmr.configureServer({ environments: { client: environment } } as never);
			for (const filename of filenames) {
				hmr.reportError(environment as never, {
					payload: {
						version: 1,
						id: filename,
						kind: 'compile',
						diagnostics: [],
						details: 'broken',
					},
				});
			}
			send.mockClear();

			await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
			expect(
				send.mock.calls.filter(
					([message]) =>
						message.type === 'custom' &&
						message.event === MARKLESS_DEV_ERROR_CLEAR_EVENT,
				),
			).toHaveLength(2);
			expect(
				send.mock.calls.filter(([message]) => message.type === 'full-reload'),
			).toHaveLength(1);
		} finally {
			await rm(fixtureRoot, { force: true, recursive: true });
		}
	});

	test('stops invalid-source polling when the dev server closes', async () => {
		vi.useFakeTimers();
		try {
			const send = vi.fn();
			const environment = { config: { consumer: 'client' }, hot: { send } };
			const httpServer = new EventEmitter();
			const hmr = createViteHmr({
				base: '/',
				clientEnvironment: 'client',
				enabled: true,
				invalidSourceRecheckMs: 10,
			});
			hmr.configureServer({
				environments: { client: environment },
				httpServer,
			} as never);
			hmr.reportError(environment as never, {
				payload: {
					version: 1,
					id: '/workspace/app/src/Broken.tsrx',
					kind: 'compile',
					diagnostics: [],
					details: 'broken',
				},
			});
			expect(vi.getTimerCount()).toBe(1);

			httpServer.emit('close');
			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(30);
			expect(send).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	test('reports and rethrows transform failures that occur outside HMR preflight', async () => {
		const plugin = getAsyncPlugin();
		const send = vi.fn();
		const environment = {
			config: { consumer: 'client' },
			hot: { send },
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};
		callConfigResolved(plugin, { base: '/', command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, {
			config: { root: '/workspace/app' },
			environments: { client: environment },
		});

		await expect(
			callTransform(
				plugin,
				source.replace('</button>', '</button>>'),
				'/workspace/app/src/Broken.tsrx',
				{ ...createViteHookContext('client'), environment },
			),
		).rejects.toThrow('MARKLESS_COMPILE_BLOCKED');
		expect(send).toHaveBeenCalledWith({
			type: 'custom',
			event: MARKLESS_DEV_ERROR_EVENT,
			data: expect.objectContaining({ kind: 'compile' }),
		});
	});

	test('hot updates invalidate direct virtual style modules', async () => {
		const plugin = getAsyncPlugin();
		const filename = '/workspace/app/src/App.tsrx';
		const directStyleId = `\0virtual:markless:style:${encodeURIComponent(filename)}.css?direct`;
		const directStyleModule = { id: directStyleId };
		const environment = {
			config: { consumer: 'client' },
			hot: { send: vi.fn() },
			moduleGraph: {
				getModuleById: vi.fn((id: string) =>
					id === directStyleId ? directStyleModule : undefined,
				),
				invalidateModule: vi.fn(),
			},
		};

		callConfigResolved(plugin, { base: '/', command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, {
			config: { root: '/workspace/app' },
			environments: { client: environment },
		});
		await callTransform(plugin, styledSource, filename, createViteHookContext('client'));

		await callHotUpdate(
			plugin,
			{
				file: filename,
				modules: [],
				read: async () => styledSource.replace('background: red', 'background: blue'),
				timestamp: 123,
				type: 'update',
			},
			{ environment },
		);

		expect(environment.moduleGraph.invalidateModule).toHaveBeenCalledWith(
			directStyleModule,
			expect.anything(),
			123,
			true,
		);
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
