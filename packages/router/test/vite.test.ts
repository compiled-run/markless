import { runInNewContext } from 'node:vm';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, onTestFinished, test } from 'vitest';
import { nitro } from 'nitro/vite';
import type { Plugin } from 'vite';
import {
	clientAssetsManifestPath,
	clientAssetFileName,
	readClientAssetsManifest,
	writeClientAssetsManifest,
} from '../src/vite/client-assets-manifest.ts';
import {
	lazyStartupPackName,
	MARKLESS_DEFERRED_PACK,
	MARKLESS_NAVIGATION_PACK_PREFIX,
} from '@markless/bundler/preload';
import { MARKLESS_BUILD_METADATA_FILES, MARKLESS_BUILD_PREFIX } from '@markless/bundler/rolldown';
import { router } from '../src/vite/index.ts';
import { NAVIGATION_POLYFILL_MODULE } from '../src/navigation-polyfill.ts';

const flattenPlugins = (plugins: unknown[]): Plugin[] =>
	plugins.flatMap((plugin) =>
		Array.isArray(plugin) ? flattenPlugins(plugin) : [plugin],
	) as Plugin[];

const hookHandler = (hook: unknown) => {
	if (typeof hook === 'function') return hook;
	if (
		typeof hook === 'object' &&
		hook !== null &&
		'handler' in hook &&
		typeof hook.handler === 'function'
	) {
		return hook.handler;
	}
	return undefined;
};

test('wires request-file transforms before route virtual modules', () => {
	const plugins = flattenPlugins([router()]);
	const names = plugins.map((plugin) => plugin.name);

	expect(names).toContain('markless-router:vite');
	expect(names).toContain('nitro:init');
	expect(names).toEqual(
		expect.arrayContaining([
			'markless-router:vite',
			'markless-router:request-files',
			'markless-router:typegen',
			'markless-router:routes',
			'nitro:init',
		]),
	);
	expect(names.indexOf('markless-router:vite')).toBeLessThan(
		names.indexOf('markless-router:request-files'),
	);
	expect(names.indexOf('markless-router:routes')).toBeLessThan(names.indexOf('nitro:init'));
});

test('shares route preload state across client and server build environments', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');

	expect(configPlugin?.sharedDuringBuild).toBe(true);
	expect(configPlugin?.generateBundle).toMatchObject({ order: 'post' });
	expect(routePlugin?.sharedDuringBuild).toBe(true);
});

test('can disable Nitro for route-only fixtures and apps', () => {
	const plugins = flattenPlugins([router({ nitro: false })]);
	const names = plugins.map((plugin) => plugin.name);

	expect(names).toEqual([
		'markless-router:mdx',
		'markless-router:request-files',
		'markless-router:typegen',
		'markless-router:anchors',
		'markless-router:html',
		'markless-router:routes',
	]);
	expect(names).not.toContain('markless-router:vite');
	expect(names).not.toContain('nitro:init');
});

test('transforms top-level API and middleware files through the Vite plugin', () => {
	const requestPlugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'markless-router:request-files',
	);
	const transform = hookHandler(requestPlugin?.transform) as
		| ((code: string, id: string) => { code: string; map: null } | undefined)
		| undefined;

	expect(transform).toBeDefined();

	const result = transform?.(
		'export default function health(http) { return { ok: true, url: http.url.href }; }',
		'/project/api/health.get.ts',
	);

	expect(result?.code).toContain('defineHandler');
	expect(result?.code).toContain('__marklessCreateHttpContext');
	expect(
		transform?.('export default function Page() {}', '/project/pages/index.tsrx'),
	).toBeUndefined();
});

test('preserves user Nitro config while adding Markless request scanning defaults', () => {
	const [plugin] = flattenPlugins([router()]);
	const userConfig = {
		nitro: {
			preset: 'bun',
			apiDir: 'endpoints',
			devServer: {
				watch: {
					include: ['api/**'],
				},
			},
			routeRules: {
				'/health': { headers: { 'x-health': 'ok' } },
			},
			scanDirs: ['server'],
		},
		root: '/project',
		server: {
			watch: {
				ignored: ['**/custom-generated/**'],
			},
		},
	};

	const result = plugin.config?.(userConfig, {
		command: 'serve',
		mode: 'development',
		isSsrBuild: false,
		isPreview: false,
	});

	expect(userConfig.environments.ssr.build.rolldownOptions.input).toContain(
		'virtual:markless-router/server-entry',
	);
	expect(userConfig.environments.ssr.build.rollupOptions).toBeUndefined();
	expect(result).toMatchObject({
		nitro: {
			apiDir: 'endpoints',
			preset: 'bun',
			routeRules: {
				'/health': { headers: { 'x-health': 'ok' } },
			},
			devServer: {
				watch: {
					include: ['api/**'],
				},
			},
			routesDir: '.output/markless/router/nitro-routes',
			publicAssets: [
				{
					baseURL: '/assets',
					dir: '/project/dist/assets',
				},
				{
					baseURL: '/assets',
					dir: '/project/node_modules/.nitro/vite/services/ssr/assets',
				},
			],
			scanDirs: ['.', 'server'],
			watchOptions: {
				followSymlinks: false,
				ignored: expect.arrayContaining([
					'**/custom-generated/**',
					'**/.output/**',
					'**/node_modules/**',
				]),
			},
		},
		server: {
			watch: {
				followSymlinks: false,
				ignored: expect.arrayContaining([
					'**/custom-generated/**',
					'**/.output/**',
					'**/node_modules/**',
				]),
			},
		},
	});

	expect(result?.nitro?.devServer?.watch).toEqual({ include: ['api/**'] });
	expect(userConfig.nitro.publicAssets).toBeUndefined();

	const nitroConfig = result?.nitro;
	const requestPlugin = Array.isArray(nitroConfig?.rolldownConfig?.plugins)
		? nitroConfig.rolldownConfig.plugins[0]
		: undefined;
	const rollupRequestPlugin = Array.isArray(nitroConfig?.rollupConfig?.plugins)
		? nitroConfig.rollupConfig.plugins[0]
		: undefined;
	const transform = hookHandler((requestPlugin as Plugin | undefined)?.transform) as
		| ((code: string, id: string) => { code: string; map: null } | undefined)
		| undefined;

	expect(requestPlugin).toMatchObject({ name: 'markless-router:nitro-request-files' });
	expect(rollupRequestPlugin).toMatchObject({ name: 'markless-router:nitro-request-files' });
	expect(
		transform?.(
			'export default function health(http) { return { ok: true, url: http.url.href }; }',
			'/project/api/health.ts',
		)?.code,
	).toContain('defineHandler');
});

test('production Nitro config serves hashed Markless chunks immutable and fixed-name build metadata revalidated', () => {
	const buildRoute = `/${MARKLESS_BUILD_PREFIX}**`;
	const immutable = { headers: { 'cache-control': 'public, max-age=31536000, immutable' } };
	const revalidate = { headers: { 'cache-control': 'public, max-age=0, must-revalidate' } };
	const metadata = Object.fromEntries(
		MARKLESS_BUILD_METADATA_FILES.map((file) => [`/${file}`, revalidate]),
	);
	const nitroFor = (command: 'build' | 'serve', nitro: Record<string, unknown> = {}) => {
		const [plugin] = flattenPlugins([router()]);
		const result = hookHandler(plugin.config)?.(
			{ nitro, root: '/project' },
			{ command, mode: 'production', isSsrBuild: false, isPreview: false },
		) as { nitro?: { routeRules?: Record<string, unknown> } } | undefined;
		return result?.nitro;
	};

	expect(nitroFor('build')?.routeRules).toEqual({ [buildRoute]: immutable, ...metadata });
	expect(
		nitroFor('build', { routeRules: { '/health': { headers: { 'x-health': 'ok' } } } })
			?.routeRules,
	).toEqual({
		[buildRoute]: immutable,
		...metadata,
		'/health': { headers: { 'x-health': 'ok' } },
	});
	const userRule = { headers: { 'cache-control': 'no-store' } };
	expect(nitroFor('build', { routeRules: { [buildRoute]: userRule } })?.routeRules).toEqual({
		[buildRoute]: userRule,
		...metadata,
	});
	expect(nitroFor('serve')?.routeRules?.[buildRoute]).toBeUndefined();
});

test('throws when users add nitro directly alongside router', () => {
	const [plugin] = flattenPlugins([router()]);
	const userConfig = {
		plugins: [nitro()],
	};

	expect(() =>
		plugin.config?.(userConfig, {
			command: 'serve',
			mode: 'development',
			isSsrBuild: false,
			isPreview: false,
		}),
	).toThrow('Remove nitro() from vite.config.ts');
});

test('preserves router resume entry exports for preview resume', () => {
	const plugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'markless-router:vite',
	);
	const clientConfig = {
		consumer: 'client',
		root: '/project',
		build: {
			rolldownOptions: {
				input: '/project/src/main.ts',
			},
		},
	};

	plugin?.configEnvironment?.('client', clientConfig as never);

	const input = clientConfig.build.rolldownOptions.input;
	expect(Array.isArray(input)).toBe(true);
	expect(input[0]).toContain('virtual:markless-router/resume-entry');
	expect(input.join('\n')).toContain('virtual:markless-router/navigation-entry');
	expect(clientConfig.build.rolldownOptions.preserveEntrySignatures).toBe('exports-only');
});

test('leaves nitro bundled in server environments so request-file handlers deploy without node_modules', () => {
	const plugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'markless-router:vite',
	);
	for (const name of ['nitro', 'ssr']) {
		const serverConfig: {
			consumer: string;
			build: { rolldownOptions: { external?: unknown } };
		} = { consumer: 'server', build: { rolldownOptions: {} } };
		plugin?.configEnvironment?.(name, serverConfig as never);
		expect([serverConfig.build.rolldownOptions.external].flat()).not.toContain('nitro');
	}
});

test('wires the routed prerender-wake entry path through the server entry', async () => {
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	onTestFinished(() => {
		delete process.env.MARKLESS_PRERENDER_WAKE;
	});
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const clientConfig = {
		consumer: 'client',
		root: '/project',
		build: { rolldownOptions: {} },
	};

	configPlugin?.configEnvironment?.('client', clientConfig as never);
	expect(clientConfig.build.rolldownOptions.input).toEqual(
		expect.arrayContaining([
			expect.stringContaining('virtual:markless-router/prerender-wake-entry'),
		]),
	);

	configPlugin?.configResolved?.({
		base: '/docs/',
		command: 'serve',
		environments: { browser: clientConfig, ssr: { consumer: 'server' } },
		root: '/project',
	} as never);
	routePlugin?.configResolved?.({ root: '/project' } as never);
	await hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: clientConfig } },
		{},
		{
			'build/prerender-wake-C3d4.js': {
				type: 'chunk',
				fileName: 'build/prerender-wake-C3d4.js',
				facadeModuleId:
					'/project/node_modules/@markless/router/src/vite/entries/prerender-wake-entry.ts',
				moduleIds: [],
			},
		},
	);

	const load = hookHandler(routePlugin?.load);
	const wakePathSource = await load?.call(
		{ environment: { config: { consumer: 'server' } } },
		'\0virtual:markless-router/prerender-wake-entry-path',
	);
	const serverEntry = await load?.call(
		{ environment: { config: { consumer: 'server' } } },
		'\0virtual:markless-router/server-entry',
	);

	expect(wakePathSource).toContain(
		'export const prerenderWakeEntryPath = "/docs/build/prerender-wake-C3d4.js"',
	);
	expect(serverEntry).toContain('prerenderWakeEntryPath,');
});

test('router resume entry imports TSRX virtual resume modules instead of page modules', async () => {
	const source = await readFile(
		new URL('../src/vite/entries/resume-entry.ts', import.meta.url),
		'utf8',
	);

	expect(source).toContain("query: '?markless-resume'");
	expect(source).toContain('tsrxResumeModuleLoaders');
	expect(source).not.toContain("import.meta.glob(['/pages/**/*.tsrx', '/pages/**/*.mdx'])");
	expect(source).not.toContain('pageModule.resumeContainerEvent');
});

test('router client entry requests self-contained client route artifacts', async () => {
	const source = await readFile(
		new URL('../src/vite/entries/client-entry.ts', import.meta.url),
		'utf8',
	);

	expect(source).toContain("query: '?markless-route'");
});

test('scopes router virtual entry modules by resolved Vite root', () => {
	const routePlugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'markless-router:routes',
	);
	const resolve = hookHandler(routePlugin?.resolveId) as
		| ((id: string) => string | undefined)
		| undefined;

	routePlugin?.configResolved?.({ root: '/project/first' } as never);
	const first = resolve?.('virtual:markless-router/server-entry');
	routePlugin?.configResolved?.({ root: '/project/second' } as never);
	const second = resolve?.('virtual:markless-router/server-entry');
	const queried = resolve?.('virtual:markless-router/resume-entry?worker');

	expect(first).toContain('markless-router-root=%2Fproject%2Ffirst');
	expect(second).toContain('markless-router-root=%2Fproject%2Fsecond');
	expect(queried).toContain('worker');
	expect(queried).toContain('markless-router-root=%2Fproject%2Fsecond');
	expect(first).not.toBe(second);
});

test('generated server entries pass Vite development mode explicitly', () => {
	const routePlugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'markless-router:routes',
	);
	const resolve = hookHandler(routePlugin?.resolveId) as
		| ((id: string) => string | undefined)
		| undefined;
	const load = hookHandler(routePlugin?.load) as ((id: string) => string | undefined) | undefined;

	routePlugin?.configResolved?.({ root: '/alternate/project' } as never);
	const id = resolve?.('virtual:markless-router/server-entry');
	const source = id ? load?.(id) : undefined;

	expect(source).toContain('dev: import.meta.env.DEV');
});

test('persists client assets for a fresh server plugin instance', async () => {
	const workspace = await mkdtemp(join(tmpdir(), 'markless-router-client-assets-'));
	const root = join(workspace, 'app');
	const clientOutDir = join(root, 'dist/client');
	const manifestPath = clientAssetsManifestPath(clientOutDir);
	const resolvedConfig = {
		base: '/docs/',
		command: 'build',
		environments: {
			browser: { consumer: 'client', build: { outDir: 'dist/client' } },
			ssr: { consumer: 'server', build: { outDir: join(root, 'dist/server') } },
		},
		root,
	};
	const navigationChunk = chunk({
		code: `const routePreloadsJson = globalThis.__marklessRouterRoutePreloadsJson ?? "__MARKLESS_ROUTER_ROUTE_PRELOADS__";`,
		dynamicImports: ['build/page-C3.js'],
		fileName: 'build/navigation-A1.js',
		moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
	});
	const bundle = {
		'build/navigation-A1.js': navigationChunk,
		'build/resume-B2.js': chunk({
			code: `const routes = {"/pages/index.tsrx":()=>import("./page-C3.js")};`,
			dynamicImports: ['build/page-C3.js'],
			fileName: 'build/resume-B2.js',
			moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
		}),
		'build/prerender-wake-K1.js': chunk({
			code: `const wakeRoutes = {"/pages/index.tsrx":()=>import("./page-C3.js")};`,
			dynamicImports: ['build/page-C3.js'],
			fileName: 'build/prerender-wake-K1.js',
			moduleIds: ['/repo/packages/router/src/vite/entries/prerender-wake-entry.ts'],
		}),
		'build/page-C3.js': chunk({
			fileName: 'build/page-C3.js',
			imports: ['build/styled-child-D4.js'],
			moduleIds: [join(root, 'pages/index.tsrx')],
			viteMetadata: { importedCss: ['assets/page-E5.css'] },
		}),
		'build/styled-child-D4.js': chunk({
			fileName: 'build/styled-child-D4.js',
			moduleIds: [join(root, 'components/StyledChild.tsrx')],
			viteMetadata: { importedCss: ['assets/child-F6.css'] },
		}),
		'build/page-symbols-G7.js': chunk({
			fileName: 'build/page-symbols-G7.js',
			moduleIds: [`${join(root, 'pages/index.tsrx')}?markless-symbols`],
		}),
		'build/page-handler-H8.js': chunk({
			fileName: 'build/page-handler-H8.js',
			moduleIds: [
				`\0virtual:markless:symbol:${encodeURIComponent(join(root, 'pages/index.tsrx'))}:${encodeURIComponent('symbol:0')}`,
			],
		}),
		'build/other-I9.js': chunk({
			fileName: 'build/other-I9.js',
			moduleIds: [join(root, 'pages/other.tsrx')],
		}),
		'build/other-handler-J0.js': chunk({
			fileName: 'build/other-handler-J0.js',
			moduleIds: [
				`\0virtual:markless:symbol:${encodeURIComponent(join(root, 'pages/other.tsrx'))}:${encodeURIComponent('symbol:0')}`,
			],
		}),
	};

	try {
		await mkdir(join(root, 'pages'), { recursive: true });
		await writeFile(join(root, 'pages/index.tsrx'), 'export default function Page() @{}');

		const clientPlugins = flattenPlugins([router()]);
		const clientConfigPlugin = clientPlugins.find(
			(plugin) => plugin.name === 'markless-router:vite',
		);
		const clientRoutePlugin = clientPlugins.find(
			(plugin) => plugin.name === 'markless-router:routes',
		);
		clientConfigPlugin?.configResolved?.(resolvedConfig as never);
		await hookHandler(clientConfigPlugin?.buildStart)?.call({
			environment: { config: resolvedConfig.environments.browser },
		});
		await hookHandler(clientConfigPlugin?.generateBundle)?.call(
			{ environment: { config: resolvedConfig.environments.browser } },
			{},
			bundle,
		);

		for (const fileName of [
			...Object.keys(bundle),
			'assets/page-E5.css',
			'assets/child-F6.css',
		]) {
			const path = join(clientOutDir, fileName);
			await mkdir(join(path, '..'), { recursive: true });
			await writeFile(path, fileName.endsWith('.css') ? '/* scoped */' : 'export {};');
		}
		await hookHandler(clientConfigPlugin?.writeBundle)?.call(
			{ environment: { config: resolvedConfig.environments.browser } },
			{},
			bundle,
		);

		const persisted = JSON.parse(await readFile(manifestPath, 'utf8')) as {
			readonly entries: { readonly navigation: string; readonly resume: string };
			readonly routes: {
				readonly navigation: Record<string, readonly string[]>;
				readonly ssr: Record<string, readonly string[]>;
				readonly styles: Record<string, readonly string[]>;
			};
		};
		expect(persisted.entries).toEqual({
			navigation: '/docs/build/navigation-A1.js',
			prerenderWake: '/docs/build/prerender-wake-K1.js',
			resume: '/docs/build/resume-B2.js',
		});
		expect(persisted.routes.styles['pages/index.tsrx']).toEqual([
			'/docs/assets/child-F6.css',
			'/docs/assets/page-E5.css',
		]);
		expect(persisted.routes.navigation['pages/index.tsrx']).toEqual([
			'/docs/build/navigation-A1.js',
			'/docs/build/page-C3.js',
			'/docs/build/styled-child-D4.js',
			'/docs/build/page-handler-H8.js',
		]);
		expect(persisted.routes.ssr['pages/index.tsrx']).toEqual([
			'/docs/build/resume-B2.js',
			'/docs/build/page-C3.js',
			'/docs/build/styled-child-D4.js',
			'/docs/build/prerender-wake-K1.js',
			'/docs/build/page-handler-H8.js',
		]);
		expect(persisted.routes.navigation['pages/index.tsrx']).not.toContain(
			'/docs/build/other-handler-J0.js',
		);
		expect(persisted.routes.ssr['pages/index.tsrx']).not.toContain(
			'/docs/build/other-handler-J0.js',
		);

		const serverPlugins = flattenPlugins([router()]);
		const serverConfigPlugin = serverPlugins.find(
			(plugin) => plugin.name === 'markless-router:vite',
		);
		const serverRoutePlugin = serverPlugins.find(
			(plugin) => plugin.name === 'markless-router:routes',
		);
		serverConfigPlugin?.configResolved?.(resolvedConfig as never);
		serverRoutePlugin?.configResolved?.(resolvedConfig as never);
		await hookHandler(serverConfigPlugin?.buildStart)?.call({
			environment: { config: resolvedConfig.environments.ssr },
		});
		const serverLoad = hookHandler(serverRoutePlugin?.load);
		const serverContext = { environment: { config: resolvedConfig.environments.ssr } };
		const resumeSource = await serverLoad?.call(
			serverContext,
			'\0virtual:markless-router/resume-entry-path',
		);
		const navigationSource = await serverLoad?.call(
			serverContext,
			'\0virtual:markless-router/navigation-entry-path',
		);
		const preloadsSource = await serverLoad?.call(
			serverContext,
			'\0virtual:markless-router/route-preloads',
		);

		expect(resumeSource).toContain('/docs/build/resume-B2.js');
		expect(navigationSource).toContain('/docs/build/navigation-A1.js');
		expect(preloadsSource).toContain('/docs/assets/page-E5.css');
		expect(preloadsSource).toContain('/docs/assets/child-F6.css');
		expect(preloadsSource).not.toContain('/@id/');
		const evaluated = runInNewContext(
			preloadsSource.replace(/export (const|function) /g, '$1 ') +
				';({navigation:routeModulePreloads,ssr:routeSsrModulePreloads,styles:routeStylesheets,documentStylesheets})',
		);
		expect(evaluated).toEqual({ ...persisted.routes, documentStylesheets: [] });

		await hookHandler(clientConfigPlugin?.buildStart)?.call({
			environment: { config: resolvedConfig.environments.browser },
		});
		const resetPreloadsSource = await hookHandler(clientRoutePlugin?.load)?.call(
			{ environment: { config: resolvedConfig.environments.ssr } },
			'\0virtual:markless-router/route-preloads',
		);
		expect(resetPreloadsSource).not.toContain('pages/index.tsrx');
		expect(() =>
			hookHandler(clientConfigPlugin?.generateBundle)?.call(
				{ environment: { config: resolvedConfig.environments.browser } },
				{},
				{},
			),
		).toThrow('did not emit its resume and navigation entries');
	} finally {
		await rm(workspace, { force: true, recursive: true });
	}
});

test('rejects invalid persisted client-assets manifests and writes only the v1 schema', async () => {
	const clientOutDir = await mkdtemp(join(tmpdir(), 'markless-router-invalid-assets-'));
	const manifestPath = clientAssetsManifestPath(clientOutDir);
	const routeFile = 'pages/index.tsrx';
	const validManifest = () => ({
		version: 1 as const,
		base: '/docs/',
		entries: {
			resume: '/docs/build/resume.js',
			prerenderWake: '/docs/build/prerender-wake.js',
			navigation: '/docs/build/navigation.js',
		},
		routes: {
			navigation: { [routeFile]: ['/docs/build/page.js'] },
			ssr: { [routeFile]: ['/docs/build/page.js'] },
			styles: { [routeFile]: ['/docs/assets/page.css'] },
		},
	});

	try {
		await expect(readClientAssetsManifest(clientOutDir, '/docs/')).rejects.toThrow(
			'is missing',
		);
		await mkdir(join(manifestPath, '..'), { recursive: true });
		await writeFile(manifestPath, '{', 'utf8');
		await expect(readClientAssetsManifest(clientOutDir, '/docs/')).rejects.toThrow(
			'is malformed',
		);

		const encodedRoute = 'pages/%2e%2e/secret.tsrx';
		const controlRoute = 'pages/index.tsrx\n';
		const invalidManifests = [
			{
				manifest: { ...validManifest(), version: 2 },
				error: 'unsupported version',
			},
			{
				manifest: { ...validManifest(), base: '/other/' },
				error: 'was built for base',
			},
			{
				manifest: {
					...validManifest(),
					entries: {
						...validManifest().entries,
						resume: 'https://markless-router.invalid/docs/build/resume.js',
					},
				},
				error: 'outside base',
			},
			{
				manifest: {
					...validManifest(),
					entries: { ...validManifest().entries, resume: '/docs/../secret.js' },
				},
				error: 'outside base',
			},
			{
				manifest: {
					...validManifest(),
					entries: { ...validManifest().entries, resume: 'build/resume.js' },
				},
				error: 'non-canonical asset URL',
			},
			{
				manifest: {
					...validManifest(),
					entries: {
						...validManifest().entries,
						resume: ' https://markless-router.invalid/docs/build/resume.js',
					},
				},
				error: 'non-canonical asset URL',
			},
			{
				manifest: {
					...validManifest(),
					routes: {
						navigation: { [encodedRoute]: [] },
						ssr: { [encodedRoute]: [] },
						styles: { [encodedRoute]: [] },
					},
				},
				error: 'invalid route key',
			},
			{
				manifest: {
					...validManifest(),
					routes: {
						navigation: { [controlRoute]: [] },
						ssr: { [controlRoute]: [] },
						styles: { [controlRoute]: [] },
					},
				},
				error: 'invalid route key',
			},
			{
				manifest: {
					...validManifest(),
					entries: {
						...validManifest().entries,
						resume: '/docs/build/missing.js',
					},
				},
				error: 'references missing client asset',
			},
		];

		for (const invalid of invalidManifests) {
			await writeFile(manifestPath, JSON.stringify(invalid.manifest), 'utf8');
			await expect(readClientAssetsManifest(clientOutDir, '/docs/')).rejects.toThrow(
				invalid.error,
			);
		}

		for (const fileName of [
			'build/resume.js',
			'build/prerender-wake.js',
			'build/navigation.js',
			'build/page.js',
			'assets/page.css',
		]) {
			const path = join(clientOutDir, fileName);
			await mkdir(join(path, '..'), { recursive: true });
			await writeFile(path, 'asset', 'utf8');
		}
		await writeClientAssetsManifest(clientOutDir, {
			...validManifest(),
			absoluteRoot: clientOutDir,
			builtAt: '2026-07-15T00:00:00.000Z',
			secret: 'do-not-persist',
		} as never);
		const persisted = await readFile(manifestPath, 'utf8');
		expect(persisted).not.toContain(clientOutDir);
		expect(persisted).not.toContain('builtAt');
		expect(persisted).not.toContain('do-not-persist');
		await expect(readClientAssetsManifest(clientOutDir, '/docs/')).resolves.toEqual(
			validManifest(),
		);
		expect(
			clientAssetFileName(
				'https://cdn.example.test/docs/assets/page.css',
				'https://cdn.example.test/docs/',
			),
		).toBe('assets/page.css');
		expect(() => clientAssetFileName('/assets/page.css', './')).toThrow(
			'non-canonical asset URL',
		);
	} finally {
		await rm(clientOutDir, { force: true, recursive: true });
	}
});

test('ignores unrelated server environments and rejects ambiguous client builds', async () => {
	const root = join(tmpdir(), 'markless-router-environments');
	const resolvedConfig = {
		base: '/',
		command: 'build',
		environments: {
			browser: { consumer: 'client', build: { outDir: 'dist/client' } },
			ssr: { consumer: 'server', build: { outDir: 'dist/server' } },
			worker: { consumer: 'server', build: { outDir: 'dist/worker' } },
		},
		root,
	};
	const configPlugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'markless-router:vite',
	);
	configPlugin?.configResolved?.(resolvedConfig as never);
	await expect(
		hookHandler(configPlugin?.buildStart)?.call({
			environment: {
				name: 'worker',
				config: resolvedConfig.environments.worker,
			},
		}),
	).resolves.toBeUndefined();

	const ambiguousPlugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'markless-router:vite',
	);
	expect(() =>
		ambiguousPlugin?.configResolved?.({
			...resolvedConfig,
			environments: {
				...resolvedConfig.environments,
				legacyBrowser: { consumer: 'client', build: { outDir: 'dist/legacy' } },
			},
		} as never),
	).toThrow('requires exactly one client build environment; found 2');
});

test('emits exact route modulepreload maps from client build chunks', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((
				this: { environment?: { config?: { consumer?: string } } },
				id: string,
		  ) => string | undefined)
		| undefined;
	const navigationChunk = chunk({
		code: `const routePreloadsJson = globalThis.__marklessRouterRoutePreloadsJson ?? "__MARKLESS_ROUTER_ROUTE_PRELOADS__"; const routePreloadData = routePreloadsJson === "__MARKLESS_ROUTER_ROUTE_PRELOADS__" ? { navigation: {}, ssr: {} } : JSON.parse(routePreloadsJson); export const routeModulePreloads = routePreloadData.navigation; export const routeSsrModulePreloads = routePreloadData.ssr; const __vite__mapDeps = () => ["assets/docs.css"];`,
		dynamicImports: ['build/docs.js', 'build/home.js', 'build/navigation-polyfill.js'],
		fileName: 'build/navigation.js',
		imports: ['build/shared.js'],
		moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
	});
	// Rolldown may split a route's resume container away from its page chunk;
	// the container is then reachable only through the resume entry's route
	// map, and the SSR plan must still preload the CURRENT route's container
	// or the first interaction pays a waterfall fetch on slow networks.
	const resumeChunk = chunk({
		code: `tsrxResumeModuleLoaders = Object.assign({"/pages/docs/[...slug].mdx":()=>import("./docs-resume.js"),"/pages/index.tsrx":()=>import("./home-resume.js")});`,
		dynamicImports: [
			'build/docs.js',
			'build/home.js',
			'build/docs-resume.js',
			'build/home-resume.js',
		],
		fileName: 'build/resume.js',
		imports: ['build/resume-runtime.js'],
		moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
	});

	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': navigationChunk,
			'build/resume.js': resumeChunk,
			'build/docs.js': chunk({
				code: `import { marklessDecodeScalarCell } from "./scalar-specialized.js"; export const docs = () => import("./docs-symbol.js");`,
				dynamicImports: ['build/docs-symbol.js'],
				fileName: 'build/docs.js',
				imports: ['build/docs-runtime.js', 'build/resume-runtime.js'],
				moduleIds: ['/project/pages/docs/[...slug].mdx'],
				viteMetadata: { importedCss: new Set(['assets/docs.css', 'assets/shared.css']) },
			}),
			'build/home.js': chunk({
				fileName: 'build/home.js',
				moduleIds: ['/project/pages/index.tsrx'],
				viteMetadata: { importedCss: ['assets/home.css', 'assets/shared.css'] },
			}),
			'build/docs-runtime.js': chunk({
				fileName: 'build/docs-runtime.js',
				viteMetadata: { importedCss: ['assets/docs-runtime.css'] },
			}),
			'build/docs-symbol.js': chunk({ fileName: 'build/docs-symbol.js' }),
			'build/docs-resume.js': chunk({ fileName: 'build/docs-resume.js' }),
			'build/home-resume.js': chunk({ fileName: 'build/home-resume.js' }),
			// Heavier than the navigation entry, so the SSR plan leaves it on
			// demand: a capability polyfill is a payload of its own, not a seam
			// into code the page already holds.
			'build/navigation-polyfill.js': chunk({
				code: `export const polyfillNavigation = () => {};${'/* vendored capability shim */'.repeat(40)}`,
				fileName: 'build/navigation-polyfill.js',
			}),
			'build/resume-runtime.js': chunk({ fileName: 'build/resume-runtime.js' }),
			'build/scalar-specialized.js': chunk({ fileName: 'build/scalar-specialized.js' }),
			'build/shared.js': chunk({
				fileName: 'build/shared.js',
				viteMetadata: { importedCss: ['assets/shell.css'] },
			}),
		},
	);

	const clientSource = routeLoad?.call(
		{ environment: { config: { consumer: 'client' } } },
		'\0virtual:markless-router/route-preloads',
	);
	const serverSource = routeLoad?.call(
		{ environment: { config: { consumer: 'server' } } },
		'\0virtual:markless-router/route-preloads',
	);
	const routePreloadData = JSON.parse(
		serverSource?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ??
			'{}',
	) as {
		readonly navigation?: Record<string, string[]>;
		readonly ssr?: Record<string, string[]>;
		readonly styles?: Record<string, string[]>;
	};
	const routePreloads = routePreloadData.navigation ?? {};
	const ssrPreloads = routePreloadData.ssr ?? {};
	const patchedRoutePreloads = JSON.parse(
		JSON.parse(
			navigationChunk.code.match(/routePreloadsJson = .* \?\? ("(?:\\.|[^"\\])*")/)?.[1] ??
				'"{}"',
		),
	) as Record<string, unknown>;

	expect(serverSource).toContain('"pages/docs/[...slug].mdx"');
	expect(serverSource).toContain('export const routeStylesheets = undefined;');
	expect(clientSource).not.toContain('routeStylesheets');
	expect(clientSource).not.toContain('assets/docs.css');
	expect(navigationChunk.code).toContain('pages/docs/[...slug].mdx');
	expect(Array.isArray(patchedRoutePreloads)).toBe(true);
	const decoded = runInNewContext(
		clientSource!.replace(/export (const|function) /g, '$1 ') +
			';({navigation:routeModulePreloads,ssr:routeSsrModulePreloads})',
		{ __marklessRouterRoutePreloadsJson: JSON.stringify(patchedRoutePreloads) },
	);
	expect(decoded).toEqual({ navigation: routePreloads, ssr: ssrPreloads });
	expect(patchedRoutePreloads).not.toHaveProperty('styles');
	expect(navigationChunk.code).toContain('const __vite__mapDeps = () => ["assets/docs.css"]');
	expect(navigationChunk.code.match(/__MARKLESS_ROUTER_ROUTE_PRELOADS__/g)).toHaveLength(1);
	expect(navigationChunk.code).toContain('JSON.parse(routePreloadsJson)');
	expect(routePreloads['pages/docs/[...slug].mdx']).toEqual([
		'/app/build/navigation.js',
		'/app/build/shared.js',
		'/app/build/navigation-polyfill.js',
		'/app/build/docs.js',
		'/app/build/docs-runtime.js',
		'/app/build/resume-runtime.js',
		'/app/build/scalar-specialized.js',
		'/app/build/docs-symbol.js',
	]);
	expect(routePreloads['pages/docs/[...slug].mdx']).not.toContain('/app/build/home.js');
	expect(ssrPreloads['pages/docs/[...slug].mdx']).toEqual([
		'/app/build/resume.js',
		'/app/build/resume-runtime.js',
		'/app/build/docs-resume.js',
		'/app/build/docs.js',
		'/app/build/docs-runtime.js',
		'/app/build/scalar-specialized.js',
		'/app/build/docs-symbol.js',
	]);
	expect(ssrPreloads['pages/docs/[...slug].mdx']).not.toContain('/app/build/navigation.js');
	expect(ssrPreloads['pages/docs/[...slug].mdx']).not.toContain(
		'/app/build/navigation-polyfill.js',
	);
	expect(ssrPreloads['pages/docs/[...slug].mdx']).not.toContain('/app/build/home.js');
	// The CURRENT route's resume container must be planned even when rolldown
	// splits it from the page chunk; other routes' containers must not be.
	expect(ssrPreloads['pages/docs/[...slug].mdx']).not.toContain('/app/build/home-resume.js');
	expect(ssrPreloads['pages/index.tsrx']).toContain('/app/build/home-resume.js');
	expect(ssrPreloads['pages/index.tsrx']).not.toContain('/app/build/docs-resume.js');
});

// Route changes are fragment swaps that run no destination render code, so no
// landing plan holds the client-render navigation entry or any of its edges.
// Run twice with the two candidate chunks' names traded.
for (const [thin, heavy] of [
	['build/render-csr.js', 'build/navigation-polyfill.js'],
	['build/navigation-polyfill.js', 'build/render-csr.js'],
] as const) {
	test(`leaves the navigation entry and its edges out of the landing plan (${thin} thin)`, () => {
		const plugins = flattenPlugins([router()]);
		const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
		const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
		const routeLoad = hookHandler(routePlugin?.load) as
			| ((id: string) => string | undefined)
			| undefined;
		const navigationChunk = chunk({
			code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__";${'/* navigation entry body */'.repeat(20)}`,
			dynamicImports: [thin, heavy, 'build/prerender-gate.js', 'build/other.js'],
			fileName: 'build/navigation.js',
			imports: ['build/nav-shared.js'],
			moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
		});

		routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
		configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
		hookHandler(configPlugin?.generateBundle)?.call(
			{ environment: { config: { consumer: 'client' } } },
			{},
			{
				'build/navigation.js': navigationChunk,
				'build/resume.js': chunk({
					code: `tsrxResumeModuleLoaders = Object.assign({"/pages/index.tsrx":()=>import("./home-resume.js")});`,
					dynamicImports: ['build/home-resume.js'],
					fileName: 'build/resume.js',
					imports: ['build/runtime.js'],
					moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
				}),
				'build/home.js': chunk({
					fileName: 'build/home.js',
					moduleIds: ['/project/pages/index.tsrx'],
				}),
				'build/home-resume.js': chunk({ fileName: 'build/home-resume.js' }),
				'build/runtime.js': chunk({
					code: 'export const run = 1;',
					fileName: 'build/runtime.js',
				}),
				'build/nav-shared.js': chunk({
					code: 'export const shared = 1;',
					fileName: 'build/nav-shared.js',
				}),
				// A seam into code the landing page already holds: its whole static
				// closure is planned, so it costs only its own bytes.
				[thin]: chunk({
					code: 'export { render } from "./runtime.js";',
					fileName: thin,
					imports: ['build/runtime.js'],
				}),
				// Self-contained and heavier than the navigation entry.
				[heavy]: chunk({
					code: `export const polyfill = () => {};${'/* vendored capability shim */'.repeat(40)}`,
					fileName: heavy,
				}),
				// Cheap on its own, but it cannot run without a chunk nobody planned:
				// preloading it would move the waterfall hop, not remove it.
				'build/prerender-gate.js': chunk({
					code: 'export { gate } from "./cold.js";',
					fileName: 'build/prerender-gate.js',
					imports: ['build/cold.js'],
				}),
				'build/cold.js': chunk({
					code: 'export const cold = 1;',
					fileName: 'build/cold.js',
				}),
				// Another route's page chunk: structurally near-free, still excluded —
				// route chunks belong to their own route's plan.
				'build/other.js': chunk({
					code: 'export const other = 1;',
					fileName: 'build/other.js',
					moduleIds: ['/project/pages/other.tsrx'],
				}),
			},
		);

		const serverSource = routeLoad?.call(
			{ environment: { config: { consumer: 'server' } } },
			'\0virtual:markless-router/route-preloads',
		);
		const ssrPreloads = (
			JSON.parse(
				serverSource?.match(
					/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/,
				)?.[1] ?? '{}',
			) as { readonly ssr?: Record<string, string[]> }
		).ssr?.['pages/index.tsrx'];

		expect(ssrPreloads).not.toContain('/app/build/navigation.js');
		expect(ssrPreloads).not.toContain('/app/build/nav-shared.js');
		expect(ssrPreloads).not.toContain(`/app/${thin}`);
		expect(ssrPreloads).not.toContain(`/app/${heavy}`);
		expect(ssrPreloads).not.toContain('/app/build/prerender-gate.js');
		expect(ssrPreloads).not.toContain('/app/build/cold.js');
		expect(ssrPreloads).not.toContain('/app/build/other.js');
	});
}

// Engines with a native Navigation API never load the polyfill, so no preload
// list may name it; the chunk is found by the module the polyfill import
// resolves to, and here it is both thin and generically named.
test('leaves the navigation polyfill out of navigation and landing preloads', async () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	const polyfillModuleId = '/repo/node_modules/.pnpm/shim/dist/index.js';
	const resolved = await (
		hookHandler(configPlugin?.resolveId) as (
			this: { resolve: () => Promise<{ id: string }> },
			source: string,
			importer: string,
			options: object,
		) => Promise<{ id: string } | null | undefined>
	).call(
		{ resolve: async () => ({ id: polyfillModuleId }) },
		NAVIGATION_POLYFILL_MODULE,
		'/repo/packages/router/src/spa-navigation.ts',
		{},
	);
	expect(resolved?.id).toBe(polyfillModuleId);
	const navigationChunk = chunk({
		code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__";${'/* navigation entry body */'.repeat(20)}`,
		dynamicImports: ['build/chunk-7f3a.js', 'build/chunk-c21d.js', 'build/home.js'],
		fileName: 'build/navigation.js',
		imports: ['build/nav-shared.js'],
		moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
	});

	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': navigationChunk,
			'build/resume.js': chunk({
				code: `tsrxResumeModuleLoaders = Object.assign({"/pages/index.tsrx":()=>import("./home-resume.js")});`,
				dynamicImports: ['build/home-resume.js'],
				fileName: 'build/resume.js',
				imports: ['build/runtime.js'],
				moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
			}),
			'build/home.js': chunk({
				fileName: 'build/home.js',
				moduleIds: ['/project/pages/index.tsrx'],
			}),
			'build/home-resume.js': chunk({ fileName: 'build/home-resume.js' }),
			'build/runtime.js': chunk({
				code: 'export const run = 1;',
				fileName: 'build/runtime.js',
			}),
			'build/nav-shared.js': chunk({
				code: 'export const shared = 1;',
				fileName: 'build/nav-shared.js',
			}),
			'build/chunk-7f3a.js': chunk({
				code: 'export { applyPolyfill } from "./chunk-9e01.js";',
				facadeModuleId: polyfillModuleId,
				fileName: 'build/chunk-7f3a.js',
				imports: ['build/chunk-9e01.js'],
				moduleIds: [polyfillModuleId],
			}),
			'build/chunk-9e01.js': chunk({
				code: 'export const shim = 1;',
				fileName: 'build/chunk-9e01.js',
			}),
			'build/chunk-c21d.js': chunk({
				code: 'export { render } from "./runtime.js";',
				facadeModuleId: '/repo/packages/web/src/render-csr.ts',
				fileName: 'build/chunk-c21d.js',
				imports: ['build/runtime.js'],
				moduleIds: ['/repo/packages/web/src/render-csr.ts'],
			}),
		},
	);

	const serverSource = routeLoad?.call(
		{ environment: { config: { consumer: 'server' } } },
		'\0virtual:markless-router/route-preloads',
	);
	const routePreloadData = JSON.parse(
		serverSource?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ??
			'{}',
	) as {
		readonly navigation?: Record<string, string[]>;
		readonly ssr?: Record<string, string[]>;
	};
	const navigationPreloads = routePreloadData.navigation?.['pages/index.tsrx'];
	const landingPreloads = routePreloadData.ssr?.['pages/index.tsrx'];
	expect(navigationPreloads).toEqual([
		'/app/build/navigation.js',
		'/app/build/nav-shared.js',
		'/app/build/chunk-c21d.js',
		'/app/build/runtime.js',
		'/app/build/home.js',
	]);
	expect(landingPreloads).not.toContain('/app/build/navigation.js');
	expect(landingPreloads).not.toContain('/app/build/chunk-7f3a.js');
	expect(landingPreloads).not.toContain('/app/build/chunk-9e01.js');
});

function planIntentFixture(
	options: Parameters<typeof router>[0],
	deferredName: string,
	runtimeLoadsCapability: boolean | 'lazy-sibling' = false,
	planned?: { readonly firstUse: readonly string[]; readonly fallback?: string },
) {
	const lazySibling = runtimeLoadsCapability === 'lazy-sibling';
	const plugins = flattenPlugins([router(options)]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': chunk({
				code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__";${'/* navigation entry body */'.repeat(20)}`,
				dynamicImports: ['build/client-render.js', 'build/landing.js'],
				fileName: 'build/navigation.js',
				imports: ['build/nav-shared.js'],
				moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
			}),
			'build/resume.js': chunk({
				code: `tsrxResumeModuleLoaders = Object.assign({"/pages/landing.tsrx":()=>import("./landing-resume.js")});`,
				dynamicImports: ['build/landing-resume.js'],
				fileName: 'build/resume.js',
				imports: ['build/runtime.js'],
				moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
			}),
			'build/landing.js': chunk({
				dynamicImports: ['build/capability.js', 'build/wiring.js', 'build/dev-log.js'],
				fileName: 'build/landing.js',
				imports: ['build/runtime.js'],
				moduleIds: ['/project/pages/landing.tsrx'],
			}),
			'build/landing-resume.js': chunk({
				code: 'export const wake = () => import("./capability.js"); export const log = () => import("./dev-log.js");',
				dynamicImports: [
					'build/capability.js',
					'build/wiring.js',
					'build/dev-log.js',
					...(lazySibling ? ['build/runtime-lazy.js'] : []),
				],
				fileName: 'build/landing-resume.js',
				imports: ['build/runtime.js'],
			}),
			'build/runtime.js': chunk({
				code:
					runtimeLoadsCapability === true
						? 'export const run = () => import("./capability.js");'
						: 'export const run = 1;',
				dynamicImports: runtimeLoadsCapability === true ? ['build/capability.js'] : [],
				fileName: 'build/runtime.js',
				...(lazySibling ? { name: 'shared' } : {}),
			}),
			...(lazySibling
				? {
						'build/runtime-lazy.js': chunk({
							code: 'export const run = () => import("./capability.js");',
							dynamicImports: ['build/capability.js'],
							fileName: 'build/runtime-lazy.js',
							imports: ['build/runtime.js'],
							name: lazyStartupPackName('shared'),
						}),
					}
				: {}),
			'build/wiring.js': chunk({
				code: 'export const wire = 1;',
				fileName: 'build/wiring.js',
			}),
			'build/dev-log.js': chunk({
				code: 'export const installMarklessExecutionLog = () => {};',
				fileName: 'build/dev-log.js',
				moduleIds: ['\0virtual:markless:dev-log'],
			}),
			'build/capability.js': chunk({
				code: 'export const capability = 1;',
				fileName: 'build/capability.js',
				imports: ['build/capability-helper.js'],
				name: deferredName,
			}),
			'build/capability-helper.js': chunk({
				code: 'export const helper = 1;',
				fileName: 'build/capability-helper.js',
			}),
			'build/nav-shared.js': chunk({
				code: 'export const shared = 1;',
				fileName: 'build/nav-shared.js',
			}),
			'build/client-render.js': chunk({
				code: 'export { run } from "./runtime.js"; export const evaluate = () => import("./render-evaluator.js");',
				dynamicImports: ['build/render-evaluator.js'],
				fileName: 'build/client-render.js',
				imports: ['build/runtime.js', ...(lazySibling ? ['build/runtime-lazy.js'] : [])],
			}),
			'build/render-evaluator.js': chunk({
				code: 'export { helper } from "./evaluator-helper.js";',
				fileName: 'build/render-evaluator.js',
				imports: ['build/evaluator-helper.js'],
				name: deferredName,
			}),
			'build/evaluator-helper.js': chunk({
				code: 'export const helper = 1;',
				fileName: 'build/evaluator-helper.js',
			}),
			...(planned
				? {
						'build/interaction-closures.json': {
							type: 'asset',
							fileName: 'build/interaction-closures.json',
							source: JSON.stringify({
								routes: [
									{
										route: 'pages/landing.tsrx',
										...(planned.fallback ? { fallback: planned.fallback } : {}),
										files: { firstUse: planned.firstUse, render: [] },
									},
								],
							}),
						},
					}
				: {}),
		},
	);
	const serverSource = routeLoad?.call(
		{ environment: { config: { consumer: 'server' } } },
		'\0virtual:markless-router/route-preloads',
	);
	const data = JSON.parse(
		serverSource?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ??
			'{}',
	) as {
		readonly navigation?: Record<string, string[]>;
		readonly ssr?: Record<string, string[]>;
	};
	return {
		navigation: data.navigation?.['pages/landing.tsrx'] ?? [],
		ssr: data.ssr?.['pages/landing.tsrx'] ?? [],
	};
}

// Every landing keeps only what resume can reach: route changes are fragment swaps.
test('no landing preload names the navigation entry', () => {
	const intent = planIntentFixture({ prefetch: false }, 'rest');
	expect(intent.ssr).toEqual([
		'/app/build/resume.js',
		'/app/build/runtime.js',
		'/app/build/landing-resume.js',
		'/app/build/capability.js',
		'/app/build/capability-helper.js',
		'/app/build/wiring.js',
		'/app/build/landing.js',
	]);
	expect(intent.navigation).toContain('/app/build/navigation.js');
	expect(intent.navigation).toContain('/app/build/client-render.js');
	expect(intent.navigation).toContain('/app/build/nav-shared.js');

	const render = planIntentFixture({}, 'rest');
	expect(render.ssr).toEqual(intent.ssr);
});

test('a deferred runtime pack is reached on demand, never preloaded', () => {
	for (const options of [{ prefetch: false }, {}]) {
		const plan = planIntentFixture(options, MARKLESS_DEFERRED_PACK);
		expect(plan.ssr).toContain('/app/build/landing-resume.js');
		for (const list of [plan.ssr, plan.navigation]) {
			expect(list).not.toContain('/app/build/capability.js');
			expect(list).not.toContain('/app/build/capability-helper.js');
			expect(list).toContain('/app/build/wiring.js');
		}
	}
});

test('a navigation-only pack rides navigation, never the landing preload', () => {
	for (const options of [{ prefetch: false }, {}]) {
		const plan = planIntentFixture(options, `${MARKLESS_NAVIGATION_PACK_PREFIX}shared`);
		expect(plan.ssr).toContain('/app/build/landing-resume.js');
		expect(plan.ssr).toContain('/app/build/wiring.js');
		expect(plan.ssr).not.toContain('/app/build/capability.js');
		expect(plan.ssr).not.toContain('/app/build/capability-helper.js');
		expect(plan.navigation).toContain('/app/build/capability.js');
		expect(plan.navigation).toContain('/app/build/capability-helper.js');
	}
});

test('a planned landing preloads its first-use files and what they statically import, nothing more', () => {
	for (const options of [{ prefetch: false }, {}]) {
		const unplanned = planIntentFixture(options, 'rest');
		const plan = planIntentFixture(options, 'rest', false, {
			firstUse: ['build/landing-resume.js', 'build/landing.js'],
		});
		for (const fileName of ['resume', 'runtime', 'landing-resume', 'landing'])
			expect(plan.ssr).toContain(`/app/build/${fileName}.js`);
		// Reached only through a dynamic import no first use on this route needs.
		for (const fileName of ['capability', 'capability-helper', 'wiring'])
			expect(plan.ssr).not.toContain(`/app/build/${fileName}.js`);
		expect(plan.navigation).toEqual(unplanned.navigation);
		// A route the planner could not bound keeps the unplanned landing.
		expect(
			planIntentFixture(options, 'rest', false, {
				firstUse: [],
				fallback: 'missing-demand-map:pages/landing.tsrx',
			}).ssr,
		).toEqual(unplanned.ssr);
	}
});

test('a route-set deferred pack is reached on demand, never preloaded', () => {
	const plan = planIntentFixture({}, `${MARKLESS_DEFERRED_PACK}-abc`);
	for (const list of [plan.ssr, plan.navigation])
		expect(list).not.toContain('/app/build/capability.js');
});

test('a deferred pack the resume runtime loads on demand stays off the navigation plan', () => {
	for (const options of [{ prefetch: false }, {}]) {
		const plan = planIntentFixture(options, MARKLESS_DEFERRED_PACK, true);
		expect(plan.navigation).toContain('/app/build/runtime.js');
		expect(plan.navigation).toContain('/app/build/render-evaluator.js');
		for (const list of [plan.ssr, plan.navigation]) {
			expect(list).not.toContain('/app/build/capability.js');
			expect(list).not.toContain('/app/build/capability-helper.js');
		}
	}
});

// The resume runtime's lazy sibling pack is resume runtime too: its on-demand capabilities stay on demand.
test('a deferred pack the lazy resume runtime pack loads on demand stays off the navigation plan', () => {
	for (const options of [{ prefetch: false }, {}]) {
		const plan = planIntentFixture(options, MARKLESS_DEFERRED_PACK, 'lazy-sibling');
		expect(plan.ssr).toContain('/app/build/runtime-lazy.js');
		expect(plan.navigation).toContain('/app/build/runtime-lazy.js');
		expect(plan.navigation).toContain('/app/build/render-evaluator.js');
		for (const list of [plan.ssr, plan.navigation]) {
			expect(list).not.toContain('/app/build/capability.js');
			expect(list).not.toContain('/app/build/capability-helper.js');
		}
	}
});

// Preloads download in document order, and a first event waits for the page's static path and then for the
// lazy halves of the packs on it; code only a later interaction or a navigation runs follows them.
test('a landing preload lists the first event path, then lazy sibling packs, then the rest', () => {
	for (const options of [{ prefetch: false }, {}]) {
		const { ssr } = planIntentFixture(options, MARKLESS_DEFERRED_PACK, 'lazy-sibling');
		const at = (file: string) => ssr.indexOf(`/app/build/${file}.js`);
		expect(ssr.slice(0, 3)).toEqual(
			['resume', 'runtime', 'landing-resume'].map((file) => `/app/build/${file}.js`),
		);
		expect(at('runtime-lazy')).toBe(3);
		for (const later of ['wiring', 'landing'])
			expect(at(later)).toBeGreaterThan(at('runtime-lazy'));
	}
});

// Client rendering demands its evaluator on every navigation, so its whole
// closure rides the navigation plan instead of trailing it by two round trips.
test('a navigation plan carries the client render path, deferred pack included', () => {
	for (const options of [{ prefetch: false }, {}]) {
		for (const deferredName of [MARKLESS_DEFERRED_PACK, 'rest']) {
			const plan = planIntentFixture(options, deferredName);
			expect(plan.navigation).toContain('/app/build/render-evaluator.js');
			expect(plan.navigation).toContain('/app/build/evaluator-helper.js');
			expect(plan.ssr).not.toContain('/app/build/render-evaluator.js');
			expect(plan.ssr).not.toContain('/app/build/evaluator-helper.js');
		}
	}
});

// A listed chunk that statically imports another route's pack cannot run without it,
// so leaving the pack out only moves its fetch one round trip later.
test('a navigation plan carries every static import of what it lists, another route pack included', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': chunk({
				code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__"; export const go = () => [import("./render.js"), import("./alpha.js"), import("./beta.js")];`,
				dynamicImports: ['build/render.js', 'build/alpha.js', 'build/beta.js'],
				fileName: 'build/navigation.js',
				moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
			}),
			'build/render.js': chunk({
				code: 'import "./beta.js"; export const render = 1;',
				fileName: 'build/render.js',
				imports: ['build/beta.js'],
			}),
			'build/alpha.js': chunk({
				code: 'export const alpha = 1;',
				fileName: 'build/alpha.js',
				moduleIds: ['/project/pages/alpha.tsrx'],
			}),
			'build/beta.js': chunk({
				code: 'import "./beta-helper.js"; export const beta = 1;',
				fileName: 'build/beta.js',
				imports: ['build/beta-helper.js'],
				moduleIds: ['/project/pages/beta.tsrx'],
			}),
			'build/beta-helper.js': chunk({
				code: 'export const helper = 1;',
				fileName: 'build/beta-helper.js',
			}),
		},
	);
	const serverSource = routeLoad?.call(
		{ environment: { config: { consumer: 'server' } } },
		'\0virtual:markless-router/route-preloads',
	);
	const navigation = (
		JSON.parse(
			serverSource?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ??
				'{}',
		) as { readonly navigation?: Record<string, string[]> }
	).navigation?.['pages/alpha.tsrx'];
	expect(navigation).toContain('/app/build/render.js');
	expect(navigation).toContain('/app/build/beta.js');
	expect(navigation).toContain('/app/build/beta-helper.js');
	expect(navigation).toContain('/app/build/alpha.js');
});

// Only static edges cross into another route: a dynamic import of its pack stays on demand.
test('a navigation plan leaves another route pack out when only a dynamic import reaches it', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': chunk({
				code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__"; export const go = () => [import("./alpha.js"), import("./beta.js")];`,
				dynamicImports: ['build/alpha.js', 'build/beta.js'],
				fileName: 'build/navigation.js',
				moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
			}),
			'build/alpha.js': chunk({
				code: 'export const later = () => import("./beta.js");',
				dynamicImports: ['build/beta.js'],
				fileName: 'build/alpha.js',
				moduleIds: ['/project/pages/alpha.tsrx'],
			}),
			'build/beta.js': chunk({
				code: 'export const beta = 1;',
				fileName: 'build/beta.js',
				moduleIds: ['/project/pages/beta.tsrx'],
			}),
		},
	);
	const serverSource = routeLoad?.call(
		{ environment: { config: { consumer: 'server' } } },
		'\0virtual:markless-router/route-preloads',
	);
	const navigation = (
		JSON.parse(
			serverSource?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ??
				'{}',
		) as { readonly navigation?: Record<string, string[]> }
	).navigation?.['pages/alpha.tsrx'];
	expect(navigation).toContain('/app/build/alpha.js');
	expect(navigation).not.toContain('/app/build/beta.js');
});

test('includes destination route resume chunks reached from the navigation route table', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	const navigationChunk = chunk({
		code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__";
function loadSymbol(file, symbol) {
  return file === "pages/docs.tsrx" && symbol === "symbol:0"
    ? import("./docs-resume.js")
    : file === "pages/index.tsrx" && symbol === "symbol:0"
      ? import("./home-resume.js")
      : undefined;
}`,
		dynamicImports: ['build/docs.js', 'build/home.js'],
		fileName: 'build/navigation.js',
		moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
	});

	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': navigationChunk,
			'build/docs.js': chunk({
				fileName: 'build/docs.js',
				moduleIds: ['/project/pages/docs.tsrx'],
			}),
			'build/docs-resume.js': chunk({ fileName: 'build/docs-resume.js' }),
			'build/home.js': chunk({
				fileName: 'build/home.js',
				moduleIds: ['/project/pages/index.tsrx'],
			}),
			'build/home-resume.js': chunk({ fileName: 'build/home-resume.js' }),
		},
	);

	const source = routeLoad?.('\0virtual:markless-router/route-preloads');
	const routePreloadData = JSON.parse(
		source?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ?? '{}',
	) as { readonly navigation?: Record<string, string[]> };
	const routePreloads = routePreloadData.navigation ?? {};
	expect(routePreloads['pages/docs.tsrx']).toContain('/app/build/docs-resume.js');
	expect(routePreloads['pages/docs.tsrx']).not.toContain('/app/build/home-resume.js');
});

test('includes the current route resume module closure in ssr modulepreloads', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	const resumeChunk = chunk({
		code: `function loadResumeModule(file) {
  return file === "pages/docs.tsrx"
    ? import("./docs-resume.js")
    : file === "pages/index.tsrx"
      ? import("./home-resume.js")
      : undefined;
}`,
		dynamicImports: ['build/docs-resume.js', 'build/home-resume.js'],
		fileName: 'build/resume.js',
		imports: ['build/resume-runtime.js'],
		moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
	});

	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/resume.js': resumeChunk,
			'build/docs.js': chunk({
				fileName: 'build/docs.js',
				moduleIds: ['/project/pages/docs.tsrx'],
			}),
			'build/home.js': chunk({
				fileName: 'build/home.js',
				moduleIds: ['/project/pages/index.tsrx'],
			}),
			'build/docs-resume.js': chunk({
				dynamicImports: ['build/docs-click-symbol.js'],
				fileName: 'build/docs-resume.js',
				imports: ['build/resume-spine.js'],
			}),
			'build/docs-click-symbol.js': chunk({ fileName: 'build/docs-click-symbol.js' }),
			'build/home-resume.js': chunk({ fileName: 'build/home-resume.js' }),
			'build/resume-runtime.js': chunk({ fileName: 'build/resume-runtime.js' }),
			'build/resume-spine.js': chunk({ fileName: 'build/resume-spine.js' }),
		},
	);

	const source = routeLoad?.('\0virtual:markless-router/route-preloads');
	const routePreloadData = JSON.parse(
		source?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ?? '{}',
	) as { readonly ssr?: Record<string, string[]> };
	const ssrPreloads = routePreloadData.ssr ?? {};
	expect(ssrPreloads['pages/docs.tsrx']).toContain('/app/build/docs-resume.js');
	expect(ssrPreloads['pages/docs.tsrx']).toContain('/app/build/resume-spine.js');
	expect(ssrPreloads['pages/docs.tsrx']).toContain('/app/build/docs-click-symbol.js');
	expect(ssrPreloads['pages/docs.tsrx']).not.toContain('/app/build/home-resume.js');
	expect(ssrPreloads['pages/index.tsrx']).toContain('/app/build/home-resume.js');
	expect(ssrPreloads['pages/index.tsrx']).not.toContain('/app/build/docs-resume.js');
});

test('includes route-scoped symbol-module and symbol facade chunks in ssr and navigation modulepreloads', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	// Symbol-module chunks are demanded through the symbol resolver's computed
	// import table (`import(/* @vite-ignore */ moduleUrls[row[0]])`), so the
	// bundle has NO literal import edge reaching them. Their virtual module id
	// embeds the source file they serve — that filename is the route-scoping key.
	const symbolModuleId = (sourceFile: string, symbolId: string) =>
		`virtual:markless:symbol:${encodeURIComponent(sourceFile)}:${encodeURIComponent(symbolId)}`;
	const navigationChunk = chunk({
		code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__";`,
		dynamicImports: ['build/gallery.js', 'build/journal.js'],
		fileName: 'build/navigation.js',
		moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
	});

	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	hookHandler(configPlugin?.generateBundle)?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': navigationChunk,
			'build/gallery.js': chunk({
				fileName: 'build/gallery.js',
				moduleIds: [
					'/project/pages/gallery.tsrx',
					'/project/src/components/light-table.tsrx?markless-symbols',
				],
			}),
			'build/journal.js': chunk({
				fileName: 'build/journal.js',
				moduleIds: ['/project/pages/journal.tsrx'],
			}),
			// An event-handler symbol of the gallery page (resolved ids carry \0).
			'build/gallery-tap-symbol.js': chunk({
				fileName: 'build/gallery-tap-symbol.js',
				moduleIds: [`\0${symbolModuleId('/project/pages/gallery.tsrx', 'symbol:0')}`],
			}),
			// An attach-behavior symbol whose static import must ride along.
			'build/gallery-lens-symbol.js': chunk({
				fileName: 'build/gallery-lens-symbol.js',
				imports: ['build/lens-runtime.js'],
				moduleIds: [`\0${symbolModuleId('/project/pages/gallery.tsrx', 'symbol:1')}`],
			}),
			// A symbol of a non-page component in the gallery route's closure.
			'build/light-table-symbol.js': chunk({
				fileName: 'build/light-table-symbol.js',
				moduleIds: [symbolModuleId('/project/src/components/light-table.tsrx', 'symbol:0')],
			}),
			'build/journal-save-symbol.js': chunk({
				fileName: 'build/journal-save-symbol.js',
				moduleIds: [symbolModuleId('/project/pages/journal.tsrx', 'symbol:0')],
			}),
			'build/lens-runtime.js': chunk({ fileName: 'build/lens-runtime.js' }),
			// A symbol whose module was hoisted into a shared chunk: its entry chunk is a facade that renders no module.
			'build/gallery-submit-facade.js': chunk({
				facadeModuleId: `\0${symbolModuleId('/project/pages/gallery.tsrx', 'symbol:2')}`,
				fileName: 'build/gallery-submit-facade.js',
				imports: ['build/gallery-shared.js'],
			}),
			'build/gallery-shared.js': chunk({ fileName: 'build/gallery-shared.js' }),
			'build/journal-submit-facade.js': chunk({
				facadeModuleId: symbolModuleId('/project/pages/journal.tsrx', 'symbol:1'),
				fileName: 'build/journal-submit-facade.js',
			}),
		},
	);

	const source = routeLoad?.('\0virtual:markless-router/route-preloads');
	const routePreloadData = JSON.parse(
		source?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ?? '{}',
	) as {
		readonly navigation?: Record<string, string[]>;
		readonly ssr?: Record<string, string[]>;
	};
	for (const [label, preloads] of [
		['navigation', routePreloadData.navigation ?? {}],
		['ssr', routePreloadData.ssr ?? {}],
	] as const) {
		expect(preloads['pages/gallery.tsrx'], label).toContain('/app/build/gallery-tap-symbol.js');
		expect(preloads['pages/gallery.tsrx'], label).toContain(
			'/app/build/gallery-lens-symbol.js',
		);
		expect(preloads['pages/gallery.tsrx'], label).toContain('/app/build/lens-runtime.js');
		expect(preloads['pages/gallery.tsrx'], label).toContain('/app/build/light-table-symbol.js');
		expect(preloads['pages/gallery.tsrx'], label).toContain(
			'/app/build/gallery-submit-facade.js',
		);
		expect(preloads['pages/gallery.tsrx'], label).toContain('/app/build/gallery-shared.js');
		expect(preloads['pages/gallery.tsrx'], label).not.toContain(
			'/app/build/journal-submit-facade.js',
		);
		expect(preloads['pages/journal.tsrx'], label).toContain(
			'/app/build/journal-submit-facade.js',
		);
		expect(preloads['pages/journal.tsrx'], label).not.toContain(
			'/app/build/gallery-submit-facade.js',
		);
		// Cross-route exclusion: the other route's symbol chunks never preload.
		expect(preloads['pages/gallery.tsrx'], label).not.toContain(
			'/app/build/journal-save-symbol.js',
		);
		expect(preloads['pages/journal.tsrx'], label).toContain(
			'/app/build/journal-save-symbol.js',
		);
		expect(preloads['pages/journal.tsrx'], label).not.toContain(
			'/app/build/gallery-tap-symbol.js',
		);
		expect(preloads['pages/journal.tsrx'], label).not.toContain(
			'/app/build/gallery-lens-symbol.js',
		);
		expect(preloads['pages/journal.tsrx'], label).not.toContain(
			'/app/build/light-table-symbol.js',
		);
	}
});

function chunk(overrides: {
	readonly code?: string;
	readonly dynamicImports?: readonly string[];
	readonly facadeModuleId?: string;
	readonly fileName: string;
	readonly imports?: readonly string[];
	readonly name?: string;
	readonly moduleIds?: readonly string[];
	readonly viteMetadata?: {
		readonly importedCss?: ReadonlySet<string> | readonly string[];
	};
}) {
	return {
		code: overrides.code,
		type: 'chunk',
		dynamicImports: [...(overrides.dynamicImports ?? [])],
		facadeModuleId: overrides.facadeModuleId ?? null,
		fileName: overrides.fileName,
		imports: [...(overrides.imports ?? [])],
		moduleIds: [...(overrides.moduleIds ?? [])],
		name: overrides.name,
		viteMetadata: overrides.viteMetadata,
	};
}

test.each(['tsrx', 'mdx'])(
	'selects semantic primary %s roots independently of chunk order and hashes',
	async (extension) => {
		const source = `/project/pages/study.${extension}`;
		const plan = async (
			roles: string[],
			reverse: boolean,
			suffix: string,
			connected = false,
		) => {
			const outDir = await mkdtemp(join(tmpdir(), 'router-role-plan-'));
			onTestFinished(() => rm(outDir, { recursive: true, force: true }));
			const plugins = flattenPlugins([router()]);
			const config = plugins.find((plugin) => plugin.name === 'markless-router:vite')!;
			const routes = plugins.find((plugin) => plugin.name === 'markless-router:routes')!;
			config.configResolved?.({
				root: '/project',
				base: '/app/',
				command: 'build',
				environments: { browser: { consumer: 'client', build: { outDir } } },
			} as never);
			routes.configResolved?.({ root: '/project', base: '/app/' } as never);
			const file = (role: string) => `build/${role}-${suffix}.js`;
			const query: Record<string, string> = {
				authored: '',
				render: '?markless-render-data',
				route: '?markless-route',
				resume: '?markless-resume',
				symbols: '?markless-symbols',
			};
			const chunks = roles.map((role) =>
				chunk({
					fileName: file(role),
					moduleIds: [source + query[role], '/project/lib/shared.ts'],
					imports:
						connected && role === 'authored'
							? ['render', 'route', 'resume', 'symbols', 'authored-dependency'].map(
									file,
								)
							: [file(`${role}-dependency`)],
					viteMetadata: {
						importedCss: [
							`assets/${role}.css`,
							...(connected ? [`assets/${role}-extra.css`] : []),
						],
					},
				}),
			);
			chunks.push(
				...roles.map((role) =>
					chunk({
						fileName: file(`${role}-dependency`),
						viteMetadata: {
							importedCss: [
								`assets/${role}-dependency.css`,
								...(connected ? ['assets/shared.css'] : []),
							],
						},
					}),
				),
			);
			for (const role of roles)
				chunks.push({
					...chunk({ fileName: file(`${role}-forwarder`), imports: [file(role)] }),
					facadeModuleId: source + query[role],
				});
			chunks.push(
				chunk({ fileName: file('foreign'), moduleIds: ['/project/pages/foreign.tsrx'] }),
			);
			chunks.push(
				chunk({
					fileName: file('navigation'),
					moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
					dynamicImports: roles.includes('route')
						? [file('route'), file('foreign')]
						: [file('foreign')],
					code: roles.includes('route')
						? `const loaders={"/pages/study.${extension}":()=>import("./route-${suffix}.js"),"/pages/foreign.tsrx":()=>import("./foreign-${suffix}.js")};`
						: '',
				}),
			);
			for (const channel of ['resume', 'prerender-wake']) {
				chunks.push(
					chunk({
						fileName: file(channel + '-entry'),
						moduleIds: [`/repo/packages/router/src/vite/entries/${channel}-entry.ts`],
						dynamicImports: [file(channel + '-current'), file('foreign')],
						code: `const loaders={"/pages/study.${extension}":()=>import("./${channel}-current-${suffix}.js"),"/pages/foreign.tsrx":()=>import("./foreign-${suffix}.js")};`,
					}),
				);
				chunks.push(
					chunk({
						fileName: file(channel + '-current'),
						imports: [file(channel + '-leaf')],
						viteMetadata: { importedCss: [`assets/${channel}-current.css`] },
					}),
				);
				chunks.push(chunk({ fileName: file(channel + '-leaf') }));
			}
			chunks.push(
				chunk({
					fileName: file('handler'),
					moduleIds: [`virtual:markless:symbol:${encodeURIComponent(source)}:symbol%3A0`],
					imports: [file('handler-leaf')],
					viteMetadata: { importedCss: ['assets/handler.css'] },
				}),
			);
			chunks.push(chunk({ fileName: file('handler-leaf') }));
			chunks.push(
				chunk({
					fileName: file('foreign-handler'),
					moduleIds: [
						`virtual:markless:symbol:${encodeURIComponent('/project/pages/foreign.tsrx')}:symbol%3A0`,
					],
					viteMetadata: { importedCss: ['assets/foreign.css'] },
				}),
			);
			if (reverse) chunks.reverse();
			hookHandler(config.generateBundle)!.call(
				{ environment: { config: { consumer: 'client' } } },
				{},
				Object.fromEntries(chunks.map((entry) => [entry.fileName, entry])),
			);
			const emitted = hookHandler(routes.load)!.call(
				{ environment: { config: { consumer: 'server' } } },
				'\0virtual:markless-router/route-preloads',
			);
			const plans = JSON.parse(
				emitted.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)[1],
			);
			for (const entry of chunks) {
				for (const fileName of [
					entry.fileName,
					...(entry.viteMetadata?.importedCss ?? []),
				]) {
					await mkdir(join(outDir, fileName, '..'), { recursive: true });
					await writeFile(join(outDir, fileName), '');
				}
			}
			await hookHandler(config.writeBundle)!.call({ environment: { name: 'browser' } });
			const manifest = await readClientAssetsManifest(outDir, '/app/');
			plans.styles = manifest.routes.styles;
			return Object.fromEntries(
				['navigation', 'ssr', 'styles'].map((mode) => [
					mode,
					plans[mode][`pages/study.${extension}`].map((url: string) =>
						url.replaceAll(`-${suffix}`, ''),
					),
				]),
			);
		};
		for (const roles of [
			['route', 'render', 'resume', 'symbols', 'authored'],
			['route', 'render', 'resume', 'symbols'],
			['resume', 'route', 'symbols'],
			['symbols', 'resume'],
			['symbols'],
		]) {
			const first = await plan(roles, false, 'a19');
			const reversed = await plan(roles, true, 'z83');
			expect(reversed.navigation).toEqual(first.navigation);
			expect(reversed.ssr).toEqual(first.ssr);
			for (const styles of [first.styles, reversed.styles]) {
				const expected = [
					...roles.flatMap((role) => [
						`/app/assets/${role}-dependency.css`,
						`/app/assets/${role}.css`,
					]),
					'/app/assets/handler.css',
					'/app/assets/resume-current.css',
					'/app/assets/prerender-wake-current.css',
				];
				expect(new Set(styles)).toEqual(new Set(expected));
				expect(styles).toHaveLength(expected.length);
				for (const role of roles)
					expect(styles.indexOf(`/app/assets/${role}-dependency.css`)).toBeLessThan(
						styles.indexOf(`/app/assets/${role}.css`),
					);
			}
			const preferred = roles.includes('authored')
				? 'authored'
				: roles.includes('render')
					? 'render'
					: roles.includes('route')
						? 'route'
						: roles.includes('resume')
							? 'resume'
							: 'symbols';
			expect(first.navigation).toContain(`/app/build/${preferred}.js`);
			// The route facade and the route's own render data run only on navigation to it.
			const landing = roles.includes('authored')
				? 'authored'
				: roles.includes('resume')
					? 'resume'
					: 'symbols';
			expect(first.ssr).toContain(`/app/build/${landing}.js`);
			for (const role of ['render', 'route'])
				if (roles.includes(role)) expect(first.ssr).not.toContain(`/app/build/${role}.js`);
			expect(first.ssr).not.toContain('/app/build/foreign.js');
			for (const dependency of [
				'resume-current',
				'resume-leaf',
				'prerender-wake-current',
				'prerender-wake-leaf',
				'handler',
				'handler-leaf',
			])
				expect(first.ssr).toContain(`/app/build/${dependency}.js`);
			for (const mode of ['navigation', 'ssr']) {
				expect(first[mode]).toContain('/app/build/handler-leaf.js');
				expect(first[mode]).not.toContain('/app/build/foreign-handler.js');
			}

			if (roles.includes('route')) expect(first.navigation).toContain('/app/build/route.js');
		}
		const connected = await plan(
			['route', 'render', 'resume', 'symbols', 'authored'],
			false,
			'p40',
			true,
		);
		const permuted = await plan(
			['route', 'render', 'resume', 'symbols', 'authored'],
			true,
			'q91',
			true,
		);
		expect(permuted).toEqual(connected);
		expect(connected.styles).toEqual([
			'/app/assets/render-dependency.css',
			'/app/assets/shared.css',
			'/app/assets/render.css',
			'/app/assets/render-extra.css',
			'/app/assets/route-dependency.css',
			'/app/assets/route.css',
			'/app/assets/route-extra.css',
			'/app/assets/resume-dependency.css',
			'/app/assets/resume.css',
			'/app/assets/resume-extra.css',
			'/app/assets/symbols-dependency.css',
			'/app/assets/symbols.css',
			'/app/assets/symbols-extra.css',
			'/app/assets/authored-dependency.css',
			'/app/assets/authored.css',
			'/app/assets/authored-extra.css',
			'/app/assets/handler.css',
			'/app/assets/resume-current.css',
			'/app/assets/prerender-wake-current.css',
		]);
	},
);

test.each(['', '&variant=alternate'])(
	'diagnoses ambiguous canonical implementation ownership %s',
	(variant) => {
		const plugins = flattenPlugins([router()]);
		const config = plugins.find((plugin) => plugin.name === 'markless-router:vite')!;
		config.configResolved?.({ root: '/project', base: '/app/' } as never);
		const first = chunk({
			fileName: 'build/first.js',
			moduleIds: ['/project/pages/study.mdx?markless-render-data'],
		});
		const second = chunk({
			fileName: 'build/second.js',
			moduleIds: [`/project/pages/study.mdx?markless-render-data${variant}`],
		});
		for (const entries of [
			[first, second],
			[second, first],
		]) {
			expect(() =>
				hookHandler(config.generateBundle)!.call(
					{ environment: { config: { consumer: 'client' } } },
					{},
					Object.fromEntries(entries.map((entry) => [entry.fileName, entry])),
				),
			).toThrow(
				'ambiguous primary chunks for pages/study.mdx: build/first.js, build/second.js',
			);
		}
	},
);

// The execution log loads only on a page that activates it; preloading it charges every visitor for a lab tool.
test('no landing or navigation plan names the execution log chunk', () => {
	for (const options of [{ prefetch: false }, {}]) {
		for (const plan of [
			planIntentFixture(options, MARKLESS_DEFERRED_PACK),
			planIntentFixture(options, MARKLESS_DEFERRED_PACK, 'lazy-sibling'),
		]) {
			expect(plan.ssr).toContain('/app/build/landing-resume.js');
			for (const list of [plan.ssr, plan.navigation])
				expect(list).not.toContain('/app/build/dev-log.js');
		}
	}
});
