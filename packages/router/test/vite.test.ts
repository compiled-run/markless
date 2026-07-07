import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { nitro } from 'nitro/vite';
import type { Plugin } from 'vite';
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

test('emits exact route modulepreload maps from client build chunks', () => {
	const plugins = flattenPlugins([router()]);
	const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
	const routePlugin = plugins.find((plugin) => plugin.name === 'markless-router:routes');
	const routeLoad = hookHandler(routePlugin?.load) as
		| ((id: string) => string | undefined)
		| undefined;
	const navigationChunk = chunk({
		code: `const routePreloadsJson = globalThis.__marklessRouterRoutePreloadsJson ?? "__MARKLESS_ROUTER_ROUTE_PRELOADS__"; const routePreloadData = routePreloadsJson === "__MARKLESS_ROUTER_ROUTE_PRELOADS__" ? { navigation: {}, ssr: {} } : JSON.parse(routePreloadsJson); export const routeModulePreloads = routePreloadData.navigation; export const routeSsrModulePreloads = routePreloadData.ssr;`,
		dynamicImports: ['build/docs.js', 'build/home.js', 'build/navigation-polyfill.js'],
		fileName: 'build/navigation.js',
		imports: ['build/shared.js'],
		moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
	});
	const resumeChunk = chunk({
		dynamicImports: ['build/docs.js', 'build/home.js'],
		fileName: 'build/resume.js',
		imports: ['build/resume-runtime.js'],
		moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
	});

	routePlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.configResolved?.({ base: '/app/', root: '/project' } as never);
	configPlugin?.generateBundle?.call(
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
			}),
			'build/home.js': chunk({
				fileName: 'build/home.js',
				moduleIds: ['/project/pages/index.tsrx'],
			}),
			'build/docs-runtime.js': chunk({ fileName: 'build/docs-runtime.js' }),
			'build/docs-symbol.js': chunk({ fileName: 'build/docs-symbol.js' }),
			'build/navigation-polyfill.js': chunk({ fileName: 'build/navigation-polyfill.js' }),
			'build/resume-runtime.js': chunk({ fileName: 'build/resume-runtime.js' }),
			'build/scalar-specialized.js': chunk({ fileName: 'build/scalar-specialized.js' }),
			'build/shared.js': chunk({ fileName: 'build/shared.js' }),
		},
	);

	const source = routeLoad?.('\0virtual:markless-router/route-preloads');
	const routePreloadData = JSON.parse(
		source?.match(/routePreloadData = routePreloadsJson === .* \? (\{.*\}) :/)?.[1] ?? '{}',
	) as {
		readonly navigation?: Record<string, string[]>;
		readonly ssr?: Record<string, string[]>;
	};
	const routePreloads = routePreloadData.navigation ?? {};
	const ssrPreloads = routePreloadData.ssr ?? {};

	expect(source).toContain('"pages/docs/[...slug].mdx"');
	expect(navigationChunk.code).toContain('pages/docs/[...slug].mdx');
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
		'/app/build/docs.js',
		'/app/build/docs-runtime.js',
		'/app/build/scalar-specialized.js',
		'/app/build/docs-symbol.js',
	]);
	expect(ssrPreloads['pages/docs/[...slug].mdx']).not.toContain(
		'/app/build/navigation-polyfill.js',
	);
	expect(ssrPreloads['pages/docs/[...slug].mdx']).not.toContain('/app/build/home.js');
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
	configPlugin?.generateBundle?.call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/navigation.js': navigationChunk,
			'build/docs.js': chunk({ fileName: 'build/docs.js', moduleIds: ['/project/pages/docs.tsrx'] }),
			'build/docs-resume.js': chunk({ fileName: 'build/docs-resume.js' }),
			'build/home.js': chunk({ fileName: 'build/home.js', moduleIds: ['/project/pages/index.tsrx'] }),
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

function chunk(overrides: {
	readonly code?: string;
	readonly dynamicImports?: readonly string[];
	readonly fileName: string;
	readonly imports?: readonly string[];
	readonly moduleIds?: readonly string[];
}) {
	return {
		code: overrides.code,
		type: 'chunk',
		dynamicImports: [...(overrides.dynamicImports ?? [])],
		facadeModuleId: null,
		fileName: overrides.fileName,
		imports: [...(overrides.imports ?? [])],
		moduleIds: [...(overrides.moduleIds ?? [])],
	};
}
