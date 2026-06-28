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

	expect(names).toContain('arcade-router:vite');
	expect(names).toContain('nitro:init');
	expect(names).toEqual(
		expect.arrayContaining([
			'arcade-router:vite',
			'arcade-router:request-files',
			'arcade-router:typegen',
			'arcade-router:routes',
			'nitro:init',
		]),
	);
	expect(names.indexOf('arcade-router:vite')).toBeLessThan(
		names.indexOf('arcade-router:request-files'),
	);
	expect(names.indexOf('arcade-router:routes')).toBeLessThan(names.indexOf('nitro:init'));
});

test('can disable Nitro for route-only fixtures and apps', () => {
	const plugins = flattenPlugins([router({ nitro: false })]);
	const names = plugins.map((plugin) => plugin.name);

	expect(names).toEqual([
		'arcade-router:mdx',
		'arcade-router:request-files',
		'arcade-router:typegen',
		'arcade-router:anchors',
		'arcade-router:html',
		'arcade-router:routes',
	]);
	expect(names).not.toContain('arcade-router:vite');
	expect(names).not.toContain('nitro:init');
});

test('transforms top-level API and middleware files through the Vite plugin', () => {
	const requestPlugin = flattenPlugins([router()]).find(
		(plugin) => plugin.name === 'arcade-router:request-files',
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
	expect(result?.code).toContain('__arcadeCreateHttpContext');
	expect(
		transform?.('export default function Page() {}', '/project/pages/index.tsrx'),
	).toBeUndefined();
});

test('preserves user Nitro config while adding Arcade request scanning defaults', () => {
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
			routesDir: '.arcade/router/nitro-routes',
			scanDirs: ['.', 'server'],
			watchOptions: {
				followSymlinks: false,
				ignored: expect.arrayContaining([
					'**/custom-generated/**',
					'**/.arcade/**',
					'**/node_modules/**',
				]),
			},
		},
		server: {
			watch: {
				followSymlinks: false,
				ignored: expect.arrayContaining([
					'**/custom-generated/**',
					'**/.arcade/**',
					'**/node_modules/**',
				]),
			},
		},
	});

	expect(result?.nitro?.devServer).not.toHaveProperty('runner');
	expect(result?.nitro?.devServer?.watch).toEqual({ include: ['api/**'] });

	const nitroConfig = result?.nitro;
	const requestPlugin = Array.isArray(nitroConfig?.rolldownConfig?.plugins)
		? nitroConfig.rolldownConfig.plugins[0]
		: undefined;
	const transform = hookHandler((requestPlugin as Plugin | undefined)?.transform) as
		| ((code: string, id: string) => { code: string; map: null } | undefined)
		| undefined;

	expect(requestPlugin).toMatchObject({ name: 'arcade-router:nitro-request-files' });
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
