import { expect, test } from 'vitest';
import { createServerEntry } from '../../src/vite/runtime/create-server-entry.ts';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import type { Plugin } from 'vite';
import { router } from '../../src/vite/index.ts';
import { rolldown } from 'rolldown';

test('prefetch: false does not ship an unused options initializer', async () => {
	const plugins = router({ nitro: false, prefetch: false }).flat(Infinity) as Plugin[];
	const routes = plugins.find((plugin) => plugin.name === 'markless-router:routes')!;
	const config = typeof routes.config === 'function' ? routes.config : routes.config!.handler;
	const settings = await config.call({} as never, {}, { command: 'build', mode: 'production' });
	const build = await rolldown({
		input: 'entry',
		preserveEntrySignatures: 'allow-extension',
		transform: { define: settings!.define },
		plugins: [
			{
				name: 'entry-fixture',
				resolveId: (id) => (id === 'entry' ? id : null),
				load: (id) =>
					id === 'entry'
						? `import { startLinkIntentPreloading } from 'virtual:markless-router/options'; export const visit = () => 42; if (__MARKLESS_ROUTER_LINK_INTENT__) startLinkIntentPreloading(document, url => console.log(url.href));`
						: null,
			},
			{ name: routes.name, resolveId: routes.resolveId, load: routes.load },
		],
	});
	try {
		const result = await build.generate({ format: 'es', strictExecutionOrder: true });
		const ids = result.output.flatMap((chunk) =>
			chunk.type === 'chunk' ? chunk.moduleIds : [],
		);
		expect(ids.filter((id) => id.includes('virtual:markless-router/options'))).toEqual([]);
	} finally {
		await build.close();
	}
});

test('link intent keeps destination packs out of initial modulepreload links', async () => {
	const entry = createServerEntry({
		navigationEntryPath: '/navigation.js',
		documentModuleLoader: undefined,
		routeSsrModulePreloads: { 'pages/index.tsrx': ['/current.js'] },
		routeModulePreloads: { 'pages/next.tsrx': ['/destination.js'] },
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: {
					renderSsr: () => ({
						html: '<a href="/next" data-markless-router-link>Next</a>',
					}),
				},
			}),
		},
		routeFileIds: ['/pages/index.tsrx', '/pages/next.tsrx'],
	});
	const html = await (await entry.fetch(new Request('https://docs.test/'))).text();
	expect(html).toContain('rel="modulepreload" href="/current.js"');
	expect(html).not.toContain('rel="modulepreload" href="/destination.js"');
	expect(html).toContain('/destination.js');
	expect(html).toContain('pointerover');
	expect(html).toContain('focusin');
});

test('SSR link intent fetches only its destination without evaluating modules', async () => {
	const fetched: string[] = [];
	const entry = createServerEntry({
		navigationEntryPath: '/navigation.js',
		documentModuleLoader: undefined,
		routeSsrModulePreloads: { 'pages/index.tsrx': ['/current.js'] },
		routeModulePreloads: {
			'pages/next.tsrx': ['/current.js', { href: '/destination.js', fetchPriority: 'low' }],
			'pages/other.tsrx': ['/other.js'],
		},
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: {
					renderSsr: () => ({
						html: '<a href="/next?q=1#details" data-markless-router-link><span>Next</span></a><a href="/other" data-markless-router-link>Other</a><a href="/other" download data-markless-router-link>Download</a>',
					}),
				},
			}),
		},
		routeFileIds: ['/pages/index.tsrx', '/pages/next.tsrx', '/pages/other.tsrx'],
	});
	const server = createServer(async (request, response) => {
		if (request.url?.endsWith('.js')) {
			fetched.push(request.url);
			response.setHeader('content-type', 'text/javascript');
			response.end('globalThis.intentModuleExecuted = true;');
		} else {
			response.setHeader('content-type', 'text/html');
			response.end(await (await entry.fetch(new Request('https://docs.test/'))).text());
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ headless: true });
	try {
		for (const event of ['pointerover', 'focusin', 'pointerdown']) {
			fetched.length = 0;
			const context = await browser.newContext({ serviceWorkers: 'block' });
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
			expect(fetched).toEqual(['/current.js']);
			await page.getByText('Download', { exact: true }).dispatchEvent(event);
			expect(fetched).toEqual(['/current.js']);
			await page.locator('a span').dispatchEvent(event);
			await expect.poll(() => fetched).toEqual(['/current.js', '/destination.js']);
			await page.locator('a span').dispatchEvent(event);
			expect(await page.locator('link[rel="modulepreload"]').count()).toBe(2);
			expect(
				await page.locator('link[href="/destination.js"]').getAttribute('fetchpriority'),
			).toBe('low');
			expect(
				await page.evaluate(() => (globalThis as any).intentModuleExecuted),
			).toBeUndefined();
			expect(errors).toEqual([]);
			await context.close();
		}
	} finally {
		await browser.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test('prefetch: false leaves every destination to the click', async () => {
	const entry = createServerEntry({
		prefetch: false,
		navigationEntryPath: '/navigation.js',
		documentModuleLoader: undefined,
		routeSsrModulePreloads: { 'pages/index.tsrx': ['/current.js'] },
		routeModulePreloads: { 'pages/next.tsrx': ['/destination.js'] },
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: {
					renderSsr: () => ({
						html: '<a href="/next" data-markless-router-link>Next</a>',
					}),
				},
			}),
		},
		routeFileIds: ['/pages/index.tsrx', '/pages/next.tsrx'],
	});
	const html = await (await entry.fetch(new Request('https://docs.test/'))).text();
	expect(html).toContain('rel="modulepreload" href="/current.js"');
	expect(html).not.toContain('/destination.js');
	expect(html).not.toContain('pointerover');
	expect(html).toContain('data-markless-router-link-resumer');
});

test('router option reaches the server entry and client delegation survives replacing route controls', async () => {
	const plugins = router({ nitro: false }).flat(Infinity) as Plugin[];
	const plugin = plugins.find((item) => item.name === 'markless-router:routes')!;
	const load = typeof plugin.load === 'function' ? plugin.load : plugin.load!.handler;
	const serverSource = load.call({} as never, '\0virtual:markless-router/server-entry') as string;
	const quiet = router({ nitro: false, prefetch: false }).flat(Infinity) as Plugin[];
	const quietPlugin = quiet.find((item) => item.name === 'markless-router:routes')!;
	const quietLoad =
		typeof quietPlugin.load === 'function' ? quietPlugin.load : quietPlugin.load!.handler;
	const clientSource = (await load.call(
		{} as never,
		'\0virtual:markless-router/options',
	)) as string;
	expect(serverSource).not.toContain('prefetch: false');
	expect(
		quietLoad.call({} as never, '\0virtual:markless-router/server-entry') as string,
	).toContain('prefetch: false');
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.route('https://docs.test/**', (route) =>
			route.fulfill({ contentType: 'text/html', body: '<main></main>' }),
		);
		await page.goto('https://docs.test/');
		const result = await page.evaluate((source) => {
			const install = new Function(
				source.replaceAll('export const ', 'const ') +
					'; return startLinkIntentPreloading;',
			)();
			const hrefs: string[] = [];
			const stop = install(document, (url: URL) => hrefs.push(url.href));
			for (const pathname of ['/before', '/after']) {
				document.querySelector('main')!.innerHTML =
					`<a data-markless-router-link href="${pathname}">Next</a>`;
				document.querySelector('a')!.dispatchEvent(new Event('focusin', { bubbles: true }));
			}
			stop();
			document.querySelector('a')!.dispatchEvent(new Event('focusin', { bubbles: true }));
			return hrefs;
		}, clientSource);
		expect(result).toEqual(['https://docs.test/before', 'https://docs.test/after']);
	} finally {
		await browser.close();
	}
});
