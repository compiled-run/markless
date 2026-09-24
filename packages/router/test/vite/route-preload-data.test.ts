import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import type { Plugin } from 'vite';
import { router } from '../../src/vite/index.ts';
import { MARKLESS_CHUNK_SPECIFIER_PREFIX } from '@markless/bundler/rolldown';
import { compactRoutePreloadData } from '../../src/vite/route-preload-data.ts';

const hook = (value: any) => (typeof value === 'function' ? value : value?.handler);
const plugins = () => router().flat(Infinity) as Plugin[];
const evaluate = (source: string, override?: unknown) =>
	runInNewContext(
		source.replace(/export (const|function) /g, '$1 ') +
			';({routeModulePreloads,routeSsrModulePreloads,preloadRouteModule,...(typeof routeStylesheets === "undefined" ? {} : {routeStylesheets}),...(typeof documentStylesheets === "undefined" ? {} : {documentStylesheets})})',
		{
			__marklessRouterRoutePreloadsJson:
				override === undefined ? undefined : JSON.stringify(override),
		},
	);
function source() {
	const list = plugins();
	const routes = list.find((p) => p.name === 'markless-router:routes')!;
	routes.configResolved?.({ root: '/project', base: '/nested/' } as never);
	return {
		list,
		code: hook(routes.load).call(
			{ environment: { config: { consumer: 'client' } } },
			'\0virtual:markless-router/route-preloads',
		) as string,
	};
}

const routes = {
	navigation: {
		'pages/z.mdx': ['/nested/shared.js', '/nested/other.js', '/nested/shared.js'],
		'pages/a.tsrx': [],
		'pages/quote.tsrx': ['"\\雪` ${globalThis.bad=true}', '/nested/shared.js'],
	},
	ssr: {
		'pages/a.tsrx': ['/nested/other.js', '/nested/shared.js'],
		'pages/z.mdx': ['/nested/shared.js'],
	},
};

test('equivalent route maps produce identical compact bytes regardless of discovery order', () => {
	const reverse = (value: Record<string, string[]>) =>
		Object.fromEntries(Object.entries(value).reverse());
	const reordered = { navigation: reverse(routes.navigation), ssr: reverse(routes.ssr) };
	const original = JSON.stringify(routes);
	expect(JSON.stringify(compactRoutePreloadData(reordered))).toBe(
		JSON.stringify(compactRoutePreloadData(routes)),
	);
	expect(JSON.stringify(routes)).toBe(original);
});

test('bundle discovery order does not change patched route preload code', () => {
	const generate = (names: string[]) => {
		const { list, code } = source();
		const config = list.find((plugin) => plugin.name === 'markless-router:vite')!;
		config.configResolved?.({ root: '/project', base: '/nested/' } as never);
		const navigation = {
			type: 'chunk',
			code,
			fileName: 'build/navigation.js',
			moduleIds: ['/repo/packages/router/src/vite/entries/client-entry.ts'],
			imports: [],
			dynamicImports: [],
		};
		const bundle = Object.fromEntries(
			names.map((name) => [
				name,
				{
					type: 'chunk',
					code: '',
					fileName: `build/${name}.js`,
					moduleIds: [`/project/pages/${name}.mdx`],
					imports: [],
					dynamicImports: [],
				},
			]),
		);
		hook(config.generateBundle).call(
			{ environment: { config: { consumer: 'client' } } },
			{},
			{ 'build/navigation.js': navigation, ...bundle },
		);
		return navigation.code;
	};
	expect(generate(['third', 'first', 'second'])).toBe(generate(['second', 'first', 'third']));
});

test('round-trips route keys, duplicates, preload order and escaped URLs through the generated decoder', () => {
	const compact = compactRoutePreloadData(routes);
	expect(compact[0]).toEqual([
		'"\\雪` ${globalThis.bad=true}',
		'/nested/shared.js',
		'/nested/other.js',
	]);
	for (const input of [routes, compact]) {
		const actual = evaluate(source().code, input);
		expect(actual.routeModulePreloads).toEqual(routes.navigation);
		expect(Object.keys(actual.routeModulePreloads)).toEqual(
			input === routes
				? Object.keys(routes.navigation)
				: Object.keys(routes.navigation).sort(),
		);
		expect(actual.routeSsrModulePreloads).toEqual(routes.ssr);
	}
	expect(evaluate(source().code).routeModulePreloads).toEqual({});
	expect(
		evaluate(source().code, compactRoutePreloadData({ navigation: {}, ssr: {} }))
			.routeModulePreloads,
	).toEqual({});
});

test('appends preloads synchronously in order, without executing destination code', () => {
	const actual = evaluate(source().code, compactRoutePreloadData(routes));
	const links: any[] = [{ href: '/nested/other.js', getAttribute: () => '/nested/other.js' }];
	const document = {
		head: { appendChild: (link: any) => links.push(link) },
		querySelectorAll: () => links,
		createElement: (tag: string) => ({ tag }),
	};
	const appended = actual.preloadRouteModule('pages/z.mdx', document);
	expect(appended).toEqual(['/nested/shared.js']);
	expect(links.at(-1)).toMatchObject({
		tag: 'link',
		rel: 'modulepreload',
		crossOrigin: 'anonymous',
	});
	expect(actual.preloadRouteModule('pages/z.mdx', document)).toEqual([]);
	expect(actual.preloadRouteModule('missing', document)).toEqual([]);
	expect(actual.preloadRouteModule('pages/z.mdx', null)).toEqual([]);
});

test('executes the actual patched bundle and preserves its generated route closure', () => {
	const { list, code } = source();
	const config = list.find((p) => p.name === 'markless-router:vite')!;
	config.configResolved?.({ root: '/project', base: '/nested/' } as never);
	const chunk = (fileName: string, moduleIds: string[], imports: string[] = []) => ({
		type: 'chunk',
		code: '',
		fileName,
		moduleIds,
		imports,
		dynamicImports: [],
	});
	const navigation = {
		...chunk('build/nav.js', ['/repo/packages/router/src/vite/entries/client-entry.ts']),
		code,
		dynamicImports: ['build/page.js'],
	};
	hook(config.generateBundle).call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/nav.js': navigation,
			'build/page.js': chunk('build/page.js', ['/project/pages/z.mdx'], ['build/shared.js']),
			'build/shared.js': chunk('build/shared.js', []),
		},
	);
	const actual = evaluate(navigation.code);
	expect(actual.routeModulePreloads['pages/z.mdx']).toEqual([
		'/nested/build/nav.js',
		'/nested/build/page.js',
		'/nested/build/shared.js',
	]);
	expect(navigation.code).toContain(
		JSON.stringify(
			JSON.stringify(
				compactRoutePreloadData({
					navigation: actual.routeModulePreloads,
					ssr: actual.routeSsrModulePreloads,
				}),
			),
		),
	);
	expect(evaluate(navigation.code, routes).routeModulePreloads).toEqual(routes.navigation);
});

test('shared packs do not pull foreign route packs into the current route preloads', () => {
	const { list, code } = source();
	const config = list.find((p) => p.name === 'markless-router:vite')!;
	config.configResolved?.({ root: '/project', base: '/nested/' } as never);
	const chunk = (
		fileName: string,
		moduleIds: string[],
		imports: string[] = [],
		dynamicImports: string[] = [],
	) => ({ type: 'chunk', code: '', fileName, moduleIds, imports, dynamicImports });
	const navigation = {
		...chunk('build/nav.js', ['/repo/packages/router/src/vite/entries/client-entry.ts']),
		code,
	};
	hook(config.generateBundle).call(
		{ environment: { config: { consumer: 'client' } } },
		{},
		{
			'build/nav.js': navigation,
			'build/page.js': chunk(
				'build/page.js',
				['/project/pages/current.mdx'],
				['build/shared.js'],
			),
			'build/foreign.js': chunk(
				'build/foreign.js',
				['/project/pages/foreign.mdx'],
				['build/shared.js'],
			),
			'build/shared.js': chunk('build/shared.js', [], [], ['build/foreign.js']),
		},
	);
	const actual = evaluate(navigation.code);
	expect(actual.routeSsrModulePreloads['pages/current.mdx']).not.toContain(
		'/nested/build/foreign.js',
	);
	expect(actual.routeModulePreloads['pages/current.mdx']).toContain('/nested/build/shared.js');
});

test('rewritten and relocated shared chunks refresh their code-derived preloads', () => {
	const shared = {
		type: 'chunk',
		fileName: 'build/shared.js',
		moduleIds: [],
		imports: [],
		dynamicImports: [],
		code: "import './before.js';",
	};
	const read = () => {
		const { list, code } = source();
		const config = list.find((p) => p.name === 'markless-router:vite')!;
		config.configResolved?.({ root: '/project', base: '/nested/' } as never);
		const chunk = (fileName: string, moduleIds: string[], imports: string[] = []) => ({
			type: 'chunk',
			code: '',
			fileName,
			moduleIds,
			imports,
			dynamicImports: [],
		});
		const navigation = {
			...chunk('build/nav.js', ['/repo/packages/router/src/vite/entries/client-entry.ts']),
			code,
		};
		hook(config.generateBundle).call(
			{ environment: { config: { consumer: 'client' } } },
			{},
			{
				'build/nav.js': navigation,
				'build/page.js': chunk(
					'build/page.js',
					['/project/pages/current.mdx'],
					[shared.fileName],
				),
				[shared.fileName]: shared,
				'build/before.js': chunk('build/before.js', []),
				'build/after.js': chunk('build/after.js', []),
				'build/nested/after.js': chunk('build/nested/after.js', []),
			},
		);
		return evaluate(navigation.code).routeSsrModulePreloads['pages/current.mdx'];
	};
	expect(read()).toContain('/nested/build/before.js');
	shared.code = "import './after.js';";
	const rewritten = read();
	expect(rewritten).toContain('/nested/build/after.js');
	expect(rewritten).not.toContain('/nested/build/before.js');
	shared.fileName = 'build/nested/shared.js';
	const relocated = read();
	expect(relocated).toContain('/nested/build/nested/after.js');
	expect(relocated).not.toContain('/nested/build/after.js');
});

test('browser modulepreload fetches the destination without evaluating it', async () => {
	const { createServer } = await import('node:http');
	const { chromium } = await import('@playwright/test');
	let fetched = false;
	const server = createServer((request, response) => {
		if (request.url === '/destination.js') {
			fetched = true;
			response.setHeader('content-type', 'text/javascript');
			response.end('globalThis.destinationExecuted = true;');
		} else {
			response.setHeader('content-type', 'text/html');
			response.end('<!doctype html><title>Preload proof</title>');
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const address = server.address() as { port: number };
		await page.goto(`http://127.0.0.1:${address.port}`);
		const code = source().code.replace(/export (const|function) /g, '$1 ');
		const proof = await page.evaluate(
			({ code, data }) => {
				(globalThis as any).__marklessRouterRoutePreloadsJson = JSON.stringify(data);
				return new Function(
					code +
						'; const appended = preloadRouteModule("pages/a.tsrx"); return {appended,hrefs:[...document.querySelectorAll("link[rel=modulepreload]")].map(link=>link.getAttribute("href"))};',
				)();
			},
			{
				code,
				data: compactRoutePreloadData({
					navigation: { 'pages/a.tsrx': ['/destination.js'] },
					ssr: {},
				}),
			},
		);
		expect(proof).toEqual({ appended: ['/destination.js'], hrefs: ['/destination.js'] });
		await expect.poll(() => fetched).toBe(true);
		expect(await page.evaluate(() => (globalThis as any).destinationExecuted)).toBeUndefined();
	} finally {
		await browser.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test('resolves chunk specifiers through the document import map when chunks import by specifier', () => {
	const list = plugins();
	const routesPlugin = list.find((p) => p.name === 'markless-router:routes')!;
	const config = list.find((plugin) => plugin.name === 'markless-router:vite')!;
	routesPlugin.configResolved?.({ root: '/project', base: '/nested/' } as never);
	config.configResolved?.({
		root: '/project',
		base: '/nested/',
		plugins: [{ name: 'markless', api: { chunkImportMap: () => true } }],
	} as never);
	const code = hook(routesPlugin.load).call(
		{ environment: { config: { consumer: 'client' } } },
		'\0virtual:markless-router/route-preloads',
	) as string;
	const specifier = `${MARKLESS_CHUNK_SPECIFIER_PREFIX}Abc12345`;
	const actual = runInNewContext(
		code.replace(/export (const|function) /g, '$1 ') + ';({routeModulePreloads})',
		{
			__marklessRouterRoutePreloadsJson: JSON.stringify(
				compactRoutePreloadData({
					navigation: { 'pages/a.tsrx': [specifier, '/nested/build/plain.js'] },
					ssr: { 'pages/a.tsrx': [] },
				}),
			),
			document: {
				querySelectorAll: () => [
					{
						textContent: JSON.stringify({
							imports: { [specifier]: '/nested/build/chunk-hashed.js' },
						}),
					},
				],
			},
		},
	);
	expect(actual.routeModulePreloads).toEqual({
		'pages/a.tsrx': ['/nested/build/chunk-hashed.js', '/nested/build/plain.js'],
	});
});
