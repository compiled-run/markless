import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_CLIENT_ID,
	MARKLESS_DEV_ERROR_EVENT,
	MARKLESS_DEV_PAGE_EDIT_EVENT,
	MARKLESS_DEV_RELOADS_ATTRIBUTE,
	MARKLESS_DEV_RELOADS_EVENT,
} from '../src/dev-error/index.ts';
import { transformTsrxModule } from '../src/rolldown.ts';
import { createViteHmr } from '../src/vite/hmr.ts';
import { markless } from '../src/vite/index.ts';
import { moduleIdFor } from '../src/module-id.ts';
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
	// A cached .tsrx skips the transform that registers its virtual modules and symbol claims,
	// so the next run's renderSSR waits forever on loads those registrations answer.
	test("keeps compiled modules out of Vitest's cross-run module cache", () => {
		const plugin = getAsyncPlugin() as { configureVitest?: (context: unknown) => void };
		const generators: Array<(context: { id: string }) => unknown> = [];
		plugin.configureVitest?.({ defineCacheKeyGenerator: (callback: never) => generators.push(callback) });
		expect(generators).toHaveLength(1);
		const cacheable = (id: string) => generators[0]!({ id }) !== false;

		expect(cacheable('/app/pages/index.tsrx')).toBe(false);
		expect(cacheable('/app/pages/index.tsrx?markless-symbols')).toBe(false);
		expect(cacheable('\0virtual:markless:render-data:pages%2Findex.tsrx')).toBe(false);
		expect(cacheable('virtual:markless:payload:pages%2Findex.tsrx')).toBe(false);
		expect(cacheable('/app/src/plain.ts?markless-resume')).toBe(false);
		expect(cacheable('/app/src/plain.ts')).toBe(true);
		expect(cacheable('/app/node_modules/@markless/web/src/fns/ssr-data.ts')).toBe(true);
	});

	test('prints the debugging playbook hint when the dev server starts', () => {
		const plugin = getAsyncPlugin();
		const info = vi.fn();

		callConfigureServer(plugin, {
			config: { logger: { info }, root: '/workspace/app' },
			environments: {},
		});

		expect(info).toHaveBeenCalledExactlyOnceWith(
			'markless diagnostics available - window.__MARKLESS_DEBUG__ records containers, lifecycles, and event routing; markless debugging playbook: run the doctor script (npm run doctor), or read agent/markless.md in the installed @markless/core package.',
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
			moduleId: 'src/App.tsrx',
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

	// Unpacked builds emit each symbol as a chunk, which shows the transform did emit; packed ones emit none.
	test.each([false, true])(
		'does not emit client resume chunks without a configured SSR TSRX root (packing: %s)',
		async (packing) => {
			const plugin = getAsyncPlugin({ packing });
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

			if (!packing)
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
		},
	);

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

	test('dev-prerender client wiring preserves capability-gated resume emission', async () => {
		vi.stubEnv('MARKLESS_PRERENDER', '1');
		try {
			const plugin = getAsyncPlugin();
			const filename = '/workspace/app/src/Static.tsrx';
			const config = {
				environments: {
					ssr: { build: { rolldownOptions: { input: 'src/Static.tsrx' } } },
				},
			};

			callConfig(plugin, config, { command: 'serve', mode: 'development' });
			callConfigResolved(plugin, {
				base: '/',
				command: 'serve',
				root: '/workspace/app',
			});
			callBuildStart(plugin, { cwd: '/workspace/app', input: 'src/Static.tsrx' });
			await callTransform(
				plugin,
				'export function App() @{ <main>Static prerendered page</main> }',
				filename,
				createViteHookContext('client'),
			);

			const resumeId = `\0virtual:markless:resume:${encodeURIComponent(filename)}`;
			const resume = await callLoad(plugin, resumeId);
			expect(resume).not.toContain('marklessPrerenderData');
			expect(resume).not.toContain("import('@markless/web/fns/prerender-resume')");
			expect(resume).not.toContain('resumeFromPrerenderRecords');
		} finally {
			vi.unstubAllEnvs();
		}
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
		expect(result.code).toContain('virtual:markless:inline-sources-debug-');
		expect(result.code).toContain('"src": "/dev/@vite/client"'); // re-print spaces object literals
		expect(result.code).toContain('"rel": "stylesheet"');
		expect(result.code).toMatch(
			/"href": "\/dev\/@id\/__x00__virtual:markless:style:.*\.css\?direct"/,
		);
		const styleId = `\0virtual:markless:style:${encodeURIComponent(moduleIdFor('/workspace/app/src/App.tsrx', '/workspace/app'))}.css`;
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

	test('dev server transforms treat a plain dependency component as external, like the server build', async () => {
		const parentFilename = '/workspace/app/document.tsrx';
		const dependencyFilename = '/workspace/app/node_modules/@markless/router/dist/index.js';
		const parentSource = `import { Html } from '@markless/router';
export default function Document({ children }) @{ <Html><body>{children}</body></Html> }`;
		const resolveDependency = vi.fn(async (specifier: string) =>
			specifier === '@markless/router' ? { id: dependencyFilename } : null,
		);
		const serverContext = (resolve: { noExternal?: unknown } = {}) => {
			const context = createViteHookContext('server');
			const environment = context.environment as { config: Record<string, unknown> };
			environment.config.resolve = resolve;
			return { ...context, resolve: resolveDependency };
		};
		const servePlugin = () => {
			const plugin = getAsyncPlugin();
			callConfig(plugin, {}, { command: 'serve', mode: 'development' });
			callConfigResolved(plugin, { base: '/', command: 'serve', root: '/workspace/app' });
			callBuildStart(plugin, { cwd: '/workspace/app' }, serverContext());
			return plugin;
		};

		await expect(
			callTransform(servePlugin(), parentSource, parentFilename, serverContext()),
		).resolves.toMatchObject({ manifest: expect.any(Object) });

		await expect(
			callTransform(
				servePlugin(),
				parentSource,
				parentFilename,
				serverContext({ noExternal: ['@markless/router'] }),
			),
		).rejects.toThrow('MARKLESS_CAPTURE_METADATA_MISSING');
	});

	test('dev transforms reject imported compiled children without capture metadata', async () => {
		const childFilename = '/workspace/app/components/Child.tsrx';
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const childSource = 'export default function Child() @{ <button>Child</button> }';
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
			callTransform(validPlugin, childSource, url, createViteHookContext('server')),
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
			callTransform(plugin, parentSource, parentFilename, createViteHookContext('server')),
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
		const loaderSymbolId = `imported:${encodeURIComponent('components/Child.tsrx')}:${childHandler.symbolId}`;
		const rows = parent.manifest.captureMetadata.boundResolverRows.filter(
			(row) => row.baseSymbolId === loaderSymbolId,
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.id)).toEqual([
			`bound:${encodeURIComponent(childHandler.symbolId)}:0`,
			`bound:${encodeURIComponent(childHandler.symbolId)}:1`,
		]);
		expect(new Set(rows.map((row) => row.id)).size).toBe(2);
		expect(new Set(rows.map((row) => row.loaderSymbolId))).toEqual(new Set([loaderSymbolId]));
		expect(rows.map((row) => row.componentEdgePath)).toEqual([
			['component-edge:0'],
			['component-edge:1'],
		]);
		for (const row of rows) expect(parent.code).toContain(row.id);
		const resolver = parent.virtualModules.find((module) => module.type === 'resolver')!;
		// The resolver keys each edge's routes by the edge half of the bound id.
		for (const row of rows)
			expect(resolver.source).toContain(
				JSON.stringify(row.id.slice(row.id.indexOf(':', 6) + 1)),
			);
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

		const canonicalId = `\0virtual:markless:payload:${encodeURIComponent(moduleIdFor(filename, '/workspace/app'))}`;
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

		const canonicalId = `\0virtual:markless:payload:${encodeURIComponent(moduleIdFor(filename, '/workspace/app'))}`;
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
		expect(order).toEqual(['snapshot:\0virtual:markless:render-data:App', 'reload']);
	});

	// A page served before an edit reached the watcher, whose client connected after that edit's
	// reload went out, never hears the reload; it says what it was served after and is told to reload.
	test('a page served before an edit reloads when its client connects after the reload went out', async () => {
		const filename = '/workspace/app/src/App.tsrx';
		const listeners = new Map<string, (data: unknown, client: { send: unknown }) => void>();
		const send = vi.fn();
		const client = {
			config: { consumer: 'client' },
			hot: {
				send,
				on: (event: string, listener: (data: unknown, client: { send: unknown }) => void) =>
					listeners.set(event, listener),
			},
			moduleGraph: {
				getModuleById: vi.fn(),
				invalidateModule: vi.fn(),
				getModulesByFile: () =>
					new Set([
						{
							id: filename,
							file: filename,
							url: '/src/App.tsrx',
							type: 'js',
							importers: new Set(),
						},
					]),
			},
		};
		const nitro = {
			config: { consumer: 'server' },
			dispatchFetch: async (_request: Request) =>
				new Response('<html><head></head><body><main>page</main></body></html>', {
					headers: { 'content-type': 'text/html' },
				}),
		};
		const hmr = createViteHmr({ base: '/', clientEnvironment: 'client', enabled: true });
		hmr.configureServer({
			config: { root: '/workspace/app' },
			environments: { client, nitro },
		} as never);
		const servedAfter = async () => {
			const html = await (await nitro.dispatchFetch(new Request('http://localhost/'))).text();
			return new RegExp(`${MARKLESS_DEV_RELOADS_ATTRIBUTE}="(\\d+)"`).exec(html)?.[1];
		};
		const connect = (reloads: string | undefined) => {
			const reply = vi.fn();
			listeners.get(MARKLESS_DEV_RELOADS_EVENT)!(
				{ reloads: Number(reloads) },
				{ send: reply },
			);
			return reply.mock.calls.map(([message]) => message);
		};

		const stale = await servedAfter();
		expect(stale).toBe('0');
		expect(connect(stale)).toEqual([]);

		const edit = {
			file: filename,
			modules: [],
			read: async () => source.replace('{count}', '{count + 1}'),
			timestamp: 127,
			type: 'update',
		} as never;
		await hmr.hotUpdate(client as never, edit);
		expect(send.mock.calls.filter(([message]) => message.type === 'full-reload')).toHaveLength(
			1,
		);

		expect(connect(stale)).toEqual([{ type: 'full-reload' }]);
		const fresh = await servedAfter();
		expect(fresh).toBe('1');
		expect(connect(fresh)).toEqual([]);
	});

	// Server graph: badge <- the harbor page only; banner <- the shared layout <- the server entry.
	function pageGraph(root: string) {
		const node = (file: string, importers: object[] = []) => ({
			id: file,
			file,
			url: `/${file.slice(root.length + 1)}`,
			type: 'js',
			importers: new Set(importers),
		});
		const entry = node(`${root}/entry.ts`);
		const table = node(`${root}/routes.ts`, [entry]);
		const harbor = node(`${root}/pages/harbor.tsrx`, [table]);
		const quay = node(`${root}/pages/quay.tsrx`, [table]);
		const badge = node(`${root}/parts/badge.tsrx`, [harbor]);
		const shell = node(`${root}/shell.tsrx`, [entry]);
		const banner = node(`${root}/parts/banner.tsrx`, [shell]);
		const byFile = new Map(
			[entry, table, harbor, quay, badge, shell, banner].map((module) => [
				module.file,
				module,
			]),
		);
		return {
			getModuleById: vi.fn(),
			invalidateModule: vi.fn(),
			getModulesByFile: (file: string) => new Set(byFile.has(file) ? [byFile.get(file)] : []),
		};
	}

	test('an edit only the harbor page imports reloads only the clients showing the harbor page', async () => {
		const root = '/workspace/docks';
		const listeners = new Map<string, (data: unknown, client: { send: unknown }) => void>();
		const send = vi.fn();
		const client = {
			config: { consumer: 'client' },
			hot: {
				send,
				on: (event: string, listener: (data: unknown, client: { send: unknown }) => void) =>
					listeners.set(event, listener),
			},
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};
		const ssr = { name: 'ssr', config: { consumer: 'server' }, moduleGraph: pageGraph(root) };
		const hmr = createViteHmr({
			base: '/',
			clientEnvironment: 'client',
			enabled: true,
			isPage: (moduleId) => moduleId.startsWith('pages/'),
			pageForUrl: (url) =>
				({ '/harbor': 'pages/harbor.tsrx', '/quay': 'pages/quay.tsrx' })[
					new URL(url).pathname
				],
		});
		hmr.configureServer({ config: { root }, environments: { client, ssr } } as never);
		const report = (data: object) => {
			const reply = vi.fn();
			listeners.get(MARKLESS_DEV_RELOADS_EVENT)!(data, { send: reply });
			return reply.mock.calls.map(([message]) => message);
		};
		const edit = (file: string, timestamp: number) =>
			hmr.hotUpdate(
				client as never,
				{
					file: `${root}/${file}`,
					modules: [],
					read: async () => source.replace('{count}', `{count + ${timestamp}}`),
					timestamp,
					type: 'update',
				} as never,
			);

		await edit('parts/badge.tsrx', 1);
		expect(send.mock.calls.map(([message]) => message)).toEqual([
			{ type: 'custom', event: MARKLESS_DEV_PAGE_EDIT_EVENT, data: { edit: 0 } },
		]);
		expect(report({ reloads: 0, href: 'http://localhost/harbor' })).toEqual([
			{ type: 'full-reload' },
		]);
		expect(report({ reloads: 0, href: 'http://localhost/quay?tab=1' })).toEqual([]);
		// A URL no page matches reloads, since nothing says the edit missed it.
		expect(report({ reloads: 0, href: 'http://localhost/unknown' })).toEqual([
			{ type: 'full-reload' },
		]);

		send.mockClear();
		await edit('parts/banner.tsrx', 2);
		expect(send.mock.calls.map(([message]) => message)).toEqual([
			expect.objectContaining({ type: 'full-reload' }),
		]);
		// The quay page skipped the badge edit but not the banner edit every page shares.
		expect(report({ reloads: 0, href: 'http://localhost/quay' })).toEqual([
			{ type: 'full-reload' },
		]);
		expect(report({ reloads: 2, href: 'http://localhost/quay' })).toEqual([]);
	});

	test('adding a file refreshes the glob listings of every environment in the first pass, and reloads every page', async () => {
		const root = '/workspace/docks';
		const send = vi.fn();
		const listing = (environment: string) => ({
			id: `\0listing:${environment}`,
			file: null,
			url: `/@id/listing:${environment}`,
			type: 'js',
			importers: new Set(),
		});
		const environment = (name: string, consumer: string, hot?: object) => {
			const module = listing(name);
			const invalidateModule = vi.fn((target: unknown, seen: Set<unknown>) =>
				seen.add(target),
			);
			return {
				name,
				config: { consumer },
				...(hot ? { hot } : {}),
				moduleGraph: {
					getModuleById: vi.fn(),
					getModulesByFile: () => new Set(),
					invalidateModule,
				},
				plugins: [
					{
						name: 'vite:import-glob',
						hotUpdate(this: { environment: { name: string } }) {
							return this.environment.name === name ? [module] : [];
						},
					},
				],
				module,
				invalidateModule,
			};
		};
		const client = environment('client', 'client', { send });
		const ssr = environment('ssr', 'server');
		const hmr = createViteHmr({ base: '/', clientEnvironment: 'client', enabled: true });
		hmr.configureServer({ config: { root }, environments: { client, ssr } } as never);

		await hmr.hotUpdate(
			client as never,
			{
				file: `${root}/pages/lighthouse.tsrx`,
				modules: [],
				read: async () => source,
				timestamp: 3,
				type: 'create',
			} as never,
		);

		expect(client.invalidateModule).toHaveBeenCalledWith(
			client.module,
			expect.any(Set),
			3,
			true,
		);
		expect(ssr.invalidateModule).toHaveBeenCalledWith(ssr.module, expect.any(Set), 3, true);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }));
	});

	test('rechecks invalid files on disk when the restoring watcher event is swallowed', async () => {
		const fixtureRoot = await mkdtemp(join(tmpdir(), 'markless-vite-hmr-'));
		const filename = join(fixtureRoot, 'alternate-root.tsrx');
		const broken = source.replace('</button>', '</button>>');
		const send = vi.fn();
		const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
		// Other suites' timers share this process, so the recheck is followed by its own handle, not by a call count.
		const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
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
			// The recheck clears its interval before it reports, so the reload is its last word.
			const reloaded = new Promise<void>((resolve) =>
				send.mockImplementation((payload: { readonly type?: string }) => {
					if (payload.type === 'full-reload') resolve();
				}),
			);
			await writeFile(filename, source);
			await reloaded;
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
			const recheck = setIntervalSpy.mock.results.find(
				(_result, index) => setIntervalSpy.mock.calls[index]![1] === 10,
			)?.value;
			expect(recheck).toBeDefined();
			expect(clearIntervalSpy.mock.calls.filter(([handle]) => handle === recheck)).toHaveLength(1);
		} finally {
			setIntervalSpy.mockRestore();
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
			// Still broken on disk: a recheck that runs before the delete must not read it as recovered.
			await writeFile(filename, source.replace('</button>', '</button>>'));
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
		const directStyleId = `\0virtual:markless:style:${encodeURIComponent(moduleIdFor(filename, '/workspace/app'))}.css?direct`;
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

function getAsyncPlugin(options: Parameters<typeof markless>[0] = {}) {
	return getPlugin(markless(options), 'vite-plugin-markless') as ReturnType<
		typeof markless
	>[number] & {
		api?: {
			registerBundleGraphAdder: (adder: () => Record<string, never>) => void;
			registerDevInjection: (injection: unknown) => void;
			registerPreloadGraphEntries: (adder: () => Record<string, never>) => void;
		};
		sharedDuringBuild?: boolean;
	};
}

test('delegate runner distinguishes absent and incompatible environments without changing the guard', async () => {
	const { serverModuleRunner } = await import('../src/vite/environment.ts');
	for (const environments of [{}, { ssr: { name: 'ssr', hot: {}, dispatchFetch() {} } }]) {
		expect(() => serverModuleRunner({ environments } as never, 'ssr')).toThrow(
			'MARKLESS_DEV_MODULE_RUNNER_UNAVAILABLE: ssr',
		);
	}
});

test('watched barrel edits invalidate canonical importers across environments without compiling the barrel', async () => {
	const file = '/workspace/app/src/parts/index.ts';
	const first = {
		type: 'js',
		id: '/workspace/app/src/One.tsrx?markless-render-data',
		url: '/base/src/One.tsrx?markless-render-data',
		importers: new Set(),
	};
	const second = {
		type: 'js',
		id: '/workspace/app/src/Two.tsrx?markless-route',
		url: '/base/src/Two.tsrx?markless-route',
		importers: new Set(),
	};
	const barrel = {
		type: 'js',
		id: file,
		url: '/src/parts/index.ts',
		importers: new Set([first, second]),
	};
	const invalidateGeneratedModules = vi.fn(
		async (_source: string, _environment?: unknown, _nextSource?: string) => [],
	);
	const send = vi.fn();
	const graph = {
		getModulesByFile: vi.fn((name: string) => (name === file ? new Set([barrel]) : new Set())),
		invalidateModule: vi.fn(),
		getModuleById: vi.fn(),
	};
	const client = {
		name: 'client',
		config: { consumer: 'client' },
		hot: { send },
		moduleGraph: graph,
	};
	const ssr = {
		name: 'ssr',
		config: { consumer: 'server' },
		hot: { send: vi.fn() },
		moduleGraph: graph,
	};
	const hmr = createViteHmr({
		base: '/base/',
		clientEnvironment: 'client',
		enabled: true,
		invalidateGeneratedModules,
	});
	hmr.configureServer({
		config: { root: '/workspace/app' },
		environments: { client, ssr },
	} as never);
	const read = vi.fn(async () => 'throw new Error("not TSRX")');
	await hmr.hotUpdate(client as never, { file, modules: [barrel], timestamp: 1, read } as never);
	for (const source of ['/workspace/app/src/One.tsrx', '/workspace/app/src/Two.tsrx'])
		for (const environment of ['client', 'server'])
			expect(invalidateGeneratedModules).toHaveBeenCalledWith(source, environment, undefined);
	expect(invalidateGeneratedModules.mock.calls.some((args) => args[0] === file)).toBe(false);
	expect(read).not.toHaveBeenCalled();
	expect(send).toHaveBeenCalledWith({
		type: 'full-reload',
		path: '/base/src/One.tsrx',
		triggeredBy: file,
	});
	invalidateGeneratedModules.mockClear();
	send.mockClear();
	barrel.importers.clear();
	await hmr.hotUpdate(client as never, { file, modules: [barrel], timestamp: 2, read } as never);
	expect(invalidateGeneratedModules).not.toHaveBeenCalled();
	expect(send).not.toHaveBeenCalled();
	await hmr.hotUpdate(
		client as never,
		{ file: '/workspace/app/unrelated.ts', modules: [], timestamp: 3, read } as never,
	);
	expect(invalidateGeneratedModules).not.toHaveBeenCalled();
});

test('Vite replaces watched transform dependencies without executable imports or stale owners', async () => {
	const { createServer } = await import('vite');
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-watched-imports-')));
	const entry = join(root, 'entry.js');
	const first = join(root, 'first.ts');
	const second = join(root, 'second.ts');
	await writeFile(entry, 'export const value = 1;');
	await writeFile(first, 'throw new Error("first must not execute");');
	await writeFile(second, 'throw new Error("second must not execute");');
	let dependency = first;
	const server = await createServer({
		root,
		configFile: false,
		server: { middlewareMode: true, watch: null },
		optimizeDeps: { noDiscovery: true, include: [] },
		plugins: [
			{
				name: 'watched-static-read',
				transform(_code, id) {
					if (id === entry) this.addWatchFile(dependency);
				},
			},
		],
	});
	try {
		const environment = server.environments.client!;
		const initial = await environment.transformRequest('/entry.js');
		const importer = environment.moduleGraph.getModuleById(entry)!;
		const oldDependency = environment.moduleGraph.getModuleById(first)!;
		expect(oldDependency.importers.has(importer)).toBe(true);
		expect(initial?.code).not.toContain('first.ts');
		dependency = second;
		environment.moduleGraph.invalidateModule(importer);
		const next = await environment.transformRequest('/entry.js');
		expect(environment.moduleGraph.getModuleById(second)!.importers.has(importer)).toBe(true);
		expect(oldDependency.importers.has(importer)).toBe(false);
		expect(next?.code).toBe(initial?.code);
	} finally {
		await server.close();
		await rm(root, { recursive: true, force: true });
	}
});
