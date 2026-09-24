import { expect, test } from 'vitest';
import { createServerEntry } from '../../src/vite/runtime/create-server-entry.ts';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import type { Plugin } from 'vite';
import { router } from '../../src/vite/index.ts';
import { rolldown } from 'rolldown';

test('default preloading does not ship an unused options initializer', async () => {
	const plugins = router({ nitro: false }).flat(Infinity) as Plugin[];
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

test('intent mode keeps destination packs out of initial modulepreload links', async () => {
	const entry = createServerEntry({
		linkPreloading: 'intent',
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
		linkPreloading: 'intent',
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

test('viewport mode downloads on-screen destinations once idle, without running them', async () => {
	const fetched: string[] = [];
	const entry = createServerEntry({
		linkPreloading: 'viewport',
		navigationEntryPath: '/navigation.js',
		documentModuleLoader: undefined,
		routeSsrModulePreloads: { 'pages/index.tsrx': ['/current.js'] },
		routeModulePreloads: {
			'pages/near.tsrx': ['/current.js', '/near.js'],
			'pages/far.tsrx': ['/far.js'],
		},
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: {
					renderSsr: () => ({
						html: '<nav><a href="/near" data-markless-router-link>Near</a><a href="/far" download data-markless-router-link>Save</a></nav><div style="height:5000px"></div><a href="/far" data-markless-router-link>Far</a>',
					}),
				},
			}),
		},
		routeFileIds: ['/pages/index.tsrx', '/pages/near.tsrx', '/pages/far.tsrx'],
	});
	expect(await (await entry.fetch(new Request('https://docs.test/'))).text()).not.toContain(
		'rel="modulepreload" href="/near.js"',
	);
	const server = createServer(async (request, response) => {
		if (request.url?.endsWith('.js')) {
			fetched.push(request.url);
			response.setHeader('content-type', 'text/javascript');
			response.end('globalThis.prefetchedModuleExecuted = true;');
		} else {
			response.setHeader('content-type', 'text/html');
			response.end(await (await entry.fetch(new Request('https://docs.test/'))).text());
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({ serviceWorkers: 'block' });
		const page = await context.newPage();
		await page.goto(url);
		await expect.poll(() => fetched).toEqual(['/current.js', '/near.js']);
		expect(await page.locator('link[href="/near.js"]').getAttribute('fetchpriority')).toBe(
			'low',
		);
		await page.getByText('Far', { exact: true }).scrollIntoViewIfNeeded();
		await expect.poll(() => fetched).toEqual(['/current.js', '/near.js', '/far.js']);
		expect(
			await page.evaluate(() => (globalThis as any).prefetchedModuleExecuted),
		).toBeUndefined();
		await context.close();

		fetched.length = 0;
		const saveData = await browser.newContext({ serviceWorkers: 'block' });
		await saveData.addInitScript(() =>
			Object.defineProperty(navigator, 'connection', { value: { saveData: true } }),
		);
		const frugal = await saveData.newPage();
		await frugal.goto(url, { waitUntil: 'load' });
		await frugal.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)));
		expect(fetched).toEqual(['/current.js']);
		await saveData.close();
	} finally {
		await browser.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test('router option reaches the server entry and client delegation survives replacing route controls', async () => {
	const plugins = router({ nitro: false, linkPreloading: 'intent' }).flat(Infinity) as Plugin[];
	const plugin = plugins.find((item) => item.name === 'markless-router:routes')!;
	const load = typeof plugin.load === 'function' ? plugin.load : plugin.load!.handler;
	const serverSource = load.call({} as never, '\0virtual:markless-router/server-entry') as string;
	const clientSource = (await load.call(
		{} as never,
		'\0virtual:markless-router/options',
	)) as string;
	expect(serverSource).toContain('linkPreloading: "intent"');
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

test('viewport prefetch waits for the page preloads, keeps two downloads in flight and honors per-link choices', async () => {
	const log: string[] = [];
	let active = 0;
	let peak = 0;
	const links = ['a', 'b', 'c', 'd', 'e']
		.map((name) => `<a href="/${name}" data-markless-router-link>${name}</a>`)
		.join('');
	const entry = createServerEntry({
		linkPreloading: 'viewport',
		navigationEntryPath: '/navigation.js',
		documentModuleLoader: undefined,
		routeSsrModulePreloads: { 'pages/index.tsrx': ['/current.js'] },
		routeModulePreloads: Object.fromEntries(
			['a', 'b', 'c', 'd', 'e', 'off', 'intent'].map((name) => [
				`pages/${name}.tsrx`,
				[`/${name}.js`],
			]),
		),
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: {
					renderSsr: () => ({
						html: `<nav>${links}<a href="/off" data-markless-router-link data-markless-router-prefetch="none">Off</a><a href="/intent" data-markless-router-link data-markless-router-prefetch="intent">Intent</a></nav>`,
					}),
				},
			}),
		},
		routeFileIds: ['a', 'b', 'c', 'd', 'e', 'off', 'intent', 'index'].map(
			(name) => `/pages/${name}.tsrx`,
		),
	});
	const server = createServer(async (request, response) => {
		if (request.url?.endsWith('.js')) {
			log.push(`start ${request.url}`);
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) =>
				setTimeout(resolve, request.url === '/current.js' ? 600 : 150),
			);
			active -= 1;
			log.push(`end ${request.url}`);
			response.setHeader('content-type', 'text/javascript');
			response.end('globalThis.prefetchedModuleExecuted = true;');
		} else {
			response.setHeader('content-type', 'text/html');
			response.end(await (await entry.fetch(new Request('https://docs.test/'))).text());
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
		await expect
			.poll(() => log.filter((line) => line.startsWith('end')).length, { timeout: 5000 })
			.toBe(6);
		expect(log.indexOf('end /current.js')).toBeLessThan(
			log.findIndex((line) => line.startsWith('start /') && line !== 'start /current.js'),
		);
		expect(peak).toBe(2);
		expect(log).not.toContain('start /off.js');
		expect(log).not.toContain('start /intent.js');
		await page.getByText('Off', { exact: true }).dispatchEvent('pointerover');
		await page.getByText('Intent', { exact: true }).dispatchEvent('pointerover');
		await expect.poll(() => log).toContain('end /intent.js');
		expect(log).not.toContain('start /off.js');
		expect(
			await page.evaluate(() => (globalThis as any).prefetchedModuleExecuted),
		).toBeUndefined();
	} finally {
		await browser.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test('client-rendered links join viewport prefetch; intent mode prefetches only links that ask for it', async () => {
	for (const linkPreloading of ['viewport', 'intent'] as const) {
		const plugins = router({ nitro: false, linkPreloading }).flat(Infinity) as Plugin[];
		const plugin = plugins.find((item) => item.name === 'markless-router:routes')!;
		const load = typeof plugin.load === 'function' ? plugin.load : plugin.load!.handler;
		const optionsSource = (await load.call(
			{} as never,
			'\0virtual:markless-router/options',
		)) as string;
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			const fetched: string[] = [];
			await page.route('https://docs.test/**', (route) => {
				const url = new URL(route.request().url());
				if (url.pathname.endsWith('.js')) {
					fetched.push(url.pathname);
					return route.fulfill({ contentType: 'text/javascript', body: '' });
				}
				return route.fulfill({ contentType: 'text/html', body: '<main></main>' });
			});
			await page.goto('https://docs.test/');
			await page.evaluate((source) => {
				const start = new Function(
					source.replaceAll('export const ', 'const ') +
						'; return startViewportPrefetching;',
				)();
				const destinations = (url: URL) => [`${url.pathname}.js`];
				(globalThis as any).rendered = (html: string) => {
					document.querySelector('main')!.innerHTML = html;
					start(document, destinations);
				};
				(globalThis as any).rendered(
					'<a data-markless-router-link href="/first">First</a>',
				);
			}, optionsSource);
			if (linkPreloading === 'viewport')
				await expect.poll(() => fetched).toEqual(['/first.js']);
			else await page.waitForTimeout(500);
			await page.evaluate(() =>
				(globalThis as any).rendered(
					'<a data-markless-router-link href="/plain">Plain</a><a data-markless-router-link data-markless-router-prefetch="viewport" href="/asked">Asked</a>',
				),
			);
			const expected =
				linkPreloading === 'viewport'
					? ['/first.js', '/plain.js', '/asked.js']
					: ['/asked.js'];
			await expect.poll(() => [...fetched].sort()).toEqual([...expected].sort());
			expect(
				await page
					.locator('link[rel="modulepreload"]')
					.evaluateAll((items) =>
						items.map((item) => item.getAttribute('fetchpriority')),
					),
			).toEqual(expected.map(() => 'low'));
		} finally {
			await browser.close();
		}
	}
});
