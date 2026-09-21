import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import type { Plugin } from 'vite';
import { router } from '../../src/vite/index.ts';
import { compactRoutePreloadData } from '../../src/vite/route-preload-data.ts';

const hook = (value: any) => typeof value === 'function' ? value : value?.handler;
const plugins = () => router().flat(Infinity) as Plugin[];
const evaluate = (source: string, override?: unknown) => runInNewContext(
	source.replace(/export (const|function) /g, '$1 ') + ';({routeModulePreloads,routeSsrModulePreloads,preloadRouteModule,...(typeof routeStylesheets === "undefined" ? {} : {routeStylesheets}),...(typeof documentStylesheets === "undefined" ? {} : {documentStylesheets})})',
	{ __marklessRouterRoutePreloadsJson: override === undefined ? undefined : JSON.stringify(override) },
);
function source() {
	const list = plugins();
	const routes = list.find(p => p.name === 'markless-router:routes')!;
	routes.configResolved?.({ root: '/project', base: '/nested/' } as never);
	return { list, code: hook(routes.load).call({ environment: { config: { consumer: 'client' } } }, '\0virtual:markless-router/route-preloads') as string };
}

const routes = {
	navigation: { 'pages/z.mdx': ['/nested/shared.js', '/nested/other.js', '/nested/shared.js'], 'pages/a.tsrx': [], 'pages/quote.tsrx': ['"\\雪` ${globalThis.bad=true}', '/nested/shared.js'] },
	ssr: { 'pages/a.tsrx': ['/nested/other.js', '/nested/shared.js'], 'pages/z.mdx': ['/nested/shared.js'] },
};

test('round-trips exact keys, duplicates, order and escaped URLs through the generated decoder', () => {
	const compact = compactRoutePreloadData(routes);
	expect(compact[0]).toEqual(['/nested/shared.js', '/nested/other.js', '"\\雪` ${globalThis.bad=true}']);
	for (const input of [routes, compact]) {
		const actual = evaluate(source().code, input);
		expect(actual.routeModulePreloads).toEqual(routes.navigation);
		expect(Object.keys(actual.routeModulePreloads)).toEqual(Object.keys(routes.navigation));
		expect(actual.routeSsrModulePreloads).toEqual(routes.ssr);
	}
	expect(evaluate(source().code).routeModulePreloads).toEqual({});
	expect(evaluate(source().code, compactRoutePreloadData({ navigation: {}, ssr: {} })).routeModulePreloads).toEqual({});
});

test('appends preloads synchronously in order, without executing destination code', () => {
	const actual = evaluate(source().code, compactRoutePreloadData(routes));
	const links: any[] = [{ href: '/nested/other.js', getAttribute: () => '/nested/other.js' }];
	const document = { head: { appendChild: (link: any) => links.push(link) }, querySelectorAll: () => links, createElement: (tag: string) => ({ tag }) };
	const appended = actual.preloadRouteModule('pages/z.mdx', document);
	expect(appended).toEqual(['/nested/shared.js']);
	expect(links.at(-1)).toMatchObject({ tag: 'link', rel: 'modulepreload', crossOrigin: 'anonymous' });
	expect(actual.preloadRouteModule('pages/z.mdx', document)).toEqual([]);
	expect(actual.preloadRouteModule('missing', document)).toEqual([]);
	expect(actual.preloadRouteModule('pages/z.mdx', null)).toEqual([]);
});

test('executes the actual patched bundle and preserves its generated route closure', () => {
	const { list, code } = source();
	const config = list.find(p => p.name === 'markless-router:vite')!;
	config.configResolved?.({ root: '/project', base: '/nested/' } as never);
	const chunk = (fileName: string, moduleIds: string[], imports: string[] = []) => ({ type: 'chunk', code: '', fileName, moduleIds, imports, dynamicImports: [] });
	const navigation = { ...chunk('build/nav.js', ['/repo/packages/router/src/vite/entries/client-entry.ts']), code, dynamicImports: ['build/page.js'] };
	hook(config.generateBundle).call({ environment: { config: { consumer: 'client' } } }, {}, {
		'build/nav.js': navigation,
		'build/page.js': chunk('build/page.js', ['/project/pages/z.mdx'], ['build/shared.js']),
		'build/shared.js': chunk('build/shared.js', []),
	});
	const actual = evaluate(navigation.code);
	expect(actual.routeModulePreloads['pages/z.mdx']).toEqual(['/nested/build/nav.js', '/nested/build/page.js', '/nested/build/shared.js']);
	expect(navigation.code).toContain(JSON.stringify(JSON.stringify(compactRoutePreloadData({ navigation: actual.routeModulePreloads, ssr: actual.routeSsrModulePreloads }))));
	expect(evaluate(navigation.code, routes).routeModulePreloads).toEqual(routes.navigation);
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
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const address = server.address() as { port: number };
		await page.goto(`http://127.0.0.1:${address.port}`);
		const code = source().code.replace(/export (const|function) /g, '$1 ');
		const proof = await page.evaluate(({ code, data }) => {
			(globalThis as any).__marklessRouterRoutePreloadsJson = JSON.stringify(data);
			return new Function(code + '; const appended = preloadRouteModule("pages/a.tsrx"); return {appended,hrefs:[...document.querySelectorAll("link[rel=modulepreload]")].map(link=>link.getAttribute("href"))};')();
		}, { code, data: compactRoutePreloadData({ navigation: { 'pages/a.tsrx': ['/destination.js'] }, ssr: {} }) });
		expect(proof).toEqual({ appended: ['/destination.js'], hrefs: ['/destination.js'] });
		await expect.poll(() => fetched).toBe(true);
		expect(await page.evaluate(() => (globalThis as any).destinationExecuted)).toBeUndefined();
	} finally {
		await browser.close();
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
});
