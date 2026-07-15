import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import { nitro } from 'nitro/vite';
import type { Plugin } from 'vite';
import {
	MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST,
	clientAssetFileName,
	readClientAssetsManifest,
	writeClientAssetsManifest,
} from '../src/vite/client-assets-manifest.ts';
import { router } from '../src/vite/index.ts';

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

test('persists client assets for a fresh server plugin instance', async () => {
	const workspace = await mkdtemp(join(tmpdir(), 'markless-router-client-assets-'));
	const root = join(workspace, 'app');
	const clientOutDir = join(root, 'dist/client');
	const manifestPath = join(clientOutDir, MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST);
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
	const manifestPath = join(clientOutDir, MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST);
	const routeFile = 'pages/index.tsrx';
	const validManifest = () => ({
		version: 1 as const,
		base: '/docs/',
		entries: {
			resume: '/docs/build/resume.js',
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
			'build/navigation-polyfill.js': chunk({ fileName: 'build/navigation-polyfill.js' }),
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
	expect(Object.keys(patchedRoutePreloads)).toEqual(['navigation', 'ssr']);
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

test('includes route-scoped symbol-module chunks in ssr and navigation modulepreloads', () => {
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
	readonly fileName: string;
	readonly imports?: readonly string[];
	readonly moduleIds?: readonly string[];
	readonly viteMetadata?: {
		readonly importedCss?: ReadonlySet<string> | readonly string[];
	};
}) {
	return {
		code: overrides.code,
		type: 'chunk',
		dynamicImports: [...(overrides.dynamicImports ?? [])],
		facadeModuleId: null,
		fileName: overrides.fileName,
		imports: [...(overrides.imports ?? [])],
		moduleIds: [...(overrides.moduleIds ?? [])],
		viteMetadata: overrides.viteMetadata,
	};
}
