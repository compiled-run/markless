import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import type { Plugin } from 'vite';
import { expect, test } from 'vitest';
import { MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST } from '../../src/vite/client-assets-manifest.ts';
import { router } from '../../src/vite/index.ts';

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

// A route's CSS rides chunks the static import graph cannot reach: component
// chunks pulled in by a dynamic edge, and symbol-module chunks the symbol
// resolver demands through a computed import table (no bundle import edge at
// all). Harvesting only the route chunk's static closure shipped those pages
// with no stylesheet link. The closure is route-scoped, so a sibling route
// must not pick up the other route's sheets.
test('collects stylesheets from a route’s dynamic and symbol chunks, and only its own', async () => {
	const workspace = await mkdtemp(join(tmpdir(), 'markless-router-route-styles-'));
	const root = join(workspace, 'app');
	const clientOutDir = join(root, 'dist/client');
	const manifestPath = join(clientOutDir, MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST);
	const resolvedConfig = {
		base: '/app/',
		command: 'build',
		environments: {
			browser: { consumer: 'client', build: { outDir: 'dist/client' } },
			ssr: { consumer: 'server', build: { outDir: join(root, 'dist/server') } },
		},
		root,
	};
	const symbolModuleId = (sourceFile: string, symbolId: string) =>
		`\0virtual:markless:symbol:${encodeURIComponent(sourceFile)}:${encodeURIComponent(symbolId)}`;
	const bundle = {
		'build/navigation.js': chunk({
			code: `const routePreloadsJson = "__MARKLESS_ROUTER_ROUTE_PRELOADS__"; const routes = {"pages/gallery.tsrx":()=>import("./gallery.js"),"pages/journal.tsrx":()=>import("./journal.js")};`,
			dynamicImports: ['build/gallery.js', 'build/journal.js'],
			fileName: 'build/navigation.js',
			moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
			viteMetadata: { importedCss: ['assets/global.css'] },
		}),
		'build/resume.js': chunk({
			code: `const routes = {"/pages/gallery.tsrx":()=>import("./gallery.js"),"/pages/journal.tsrx":()=>import("./journal.js")};`,
			dynamicImports: ['build/gallery.js', 'build/journal.js'],
			fileName: 'build/resume.js',
			moduleIds: ['/repo/packages/router/src/vite/entries/resume-entry.ts'],
		}),
		'build/gallery.js': chunk({
			dynamicImports: ['build/gallery-demo.js'],
			fileName: 'build/gallery.js',
			moduleIds: [join(root, 'pages/gallery.tsrx')],
			viteMetadata: { importedCss: ['assets/gallery-page.css'] },
		}),
		// Demanded by the gallery route chunk through a dynamic edge only.
		'build/gallery-demo.js': chunk({
			fileName: 'build/gallery-demo.js',
			viteMetadata: { importedCss: ['assets/gallery-demo.css'] },
		}),
		'build/gallery-tap-symbol.js': chunk({
			fileName: 'build/gallery-tap-symbol.js',
			imports: ['build/ui-family.js'],
			moduleIds: [symbolModuleId(join(root, 'pages/gallery.tsrx'), 'symbol:0')],
		}),
		// Family CSS reachable only through the symbol chunk's static import.
		'build/ui-family.js': chunk({
			fileName: 'build/ui-family.js',
			viteMetadata: { importedCss: ['assets/ui-family.css'] },
		}),
		'build/journal.js': chunk({
			fileName: 'build/journal.js',
			moduleIds: [join(root, 'pages/journal.tsrx')],
			viteMetadata: { importedCss: ['assets/journal-page.css'] },
		}),
		'build/journal-save-symbol.js': chunk({
			fileName: 'build/journal-save-symbol.js',
			moduleIds: [symbolModuleId(join(root, 'pages/journal.tsrx'), 'symbol:0')],
			viteMetadata: { importedCss: ['assets/journal-symbol.css'] },
		}),
	};

	try {
		const plugins = flattenPlugins([router()]);
		const configPlugin = plugins.find((plugin) => plugin.name === 'markless-router:vite');
		const clientContext = { environment: { config: resolvedConfig.environments.browser } };

		configPlugin?.configResolved?.(resolvedConfig as never);
		await hookHandler(configPlugin?.buildStart)?.call(clientContext);
		await hookHandler(configPlugin?.generateBundle)?.call(clientContext, {}, bundle);

		for (const fileName of [
			...Object.keys(bundle),
			'assets/global.css',
			'assets/gallery-page.css',
			'assets/gallery-demo.css',
			'assets/ui-family.css',
			'assets/journal-page.css',
			'assets/journal-symbol.css',
		]) {
			const path = join(clientOutDir, fileName);
			await mkdir(join(path, '..'), { recursive: true });
			await writeFile(path, fileName.endsWith('.css') ? '/* scoped */' : 'export {};');
		}
		await hookHandler(configPlugin?.writeBundle)?.call(clientContext, {}, bundle);

		const persisted = JSON.parse(await readFile(manifestPath, 'utf8')) as {
			readonly routes: { readonly styles: Record<string, readonly string[]> };
		};

		// Entry/global sheet first, then discovery order — link order must not
		// shuffle between builds.
		expect(persisted.routes.styles['pages/gallery.tsrx']).toEqual([
			'/app/assets/global.css',
			'/app/assets/gallery-page.css',
			'/app/assets/gallery-demo.css',
			'/app/assets/ui-family.css',
		]);
		expect(persisted.routes.styles['pages/journal.tsrx']).toEqual([
			'/app/assets/global.css',
			'/app/assets/journal-page.css',
			'/app/assets/journal-symbol.css',
		]);
	} finally {
		await rm(workspace, { force: true, recursive: true });
	}
});
