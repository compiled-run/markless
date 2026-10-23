import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { clientAssetsManifestPath } from '../../src/vite/client-assets-manifest.ts';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import {
	FRAGMENT_REGION_END,
	fragmentPageUrl,
	fragmentRequestUrl,
} from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { urlKeyedCache } from '../support/url-keyed-cache.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A built router app served by its real Nitro server and driven in real browsers:
// every route change here is a fragment swap, and each case pins one thing the
// outgoing page must not carry into the incoming one.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
type ServedFixture = {
	readonly origin: string;
	readonly navigationEntry: string;
	readonly fragmentEntry: string;
	readonly landing: Record<string, readonly string[]>;
	readonly close: () => Promise<void>;
};

let origin = '';
let navigationEntry = '';
let fragmentEntry = '';
let landing: Record<string, readonly string[]> = {};
let docOrigin = '';
let productionOrigin = '';
const served: ServedFixture[] = [];

async function serveFixture(name: string, production = false): Promise<ServedFixture> {
	const root = await mkdtemp(join(tmpdir(), `markless-${name}-`));
	await cp(resolve(import.meta.dirname, '../fixtures', name), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	// Vitest's NODE_ENV=test leaves import.meta.env.DEV true in a build.
	if (production) process.env.NODE_ENV = 'production';
	try {
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless({ experimentalNativePacking: true }), router()],
		});
		await builder.buildApp();
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	const manifest = JSON.parse(
		await readFile(clientAssetsManifestPath(join(root, '.output/public')), 'utf8'),
	) as {
		entries: { navigation: string; fragment: string };
		routes: { ssr: Record<string, readonly string[]> };
	};
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	}).catch(async (error: unknown) => {
		await rm(root, { recursive: true, force: true });
		throw error;
	});
	const close = async () => {
		server.close();
		await rm(root, { recursive: true, force: true });
	};
	return {
		origin: server.origin,
		navigationEntry: manifest.entries.navigation,
		fragmentEntry: manifest.entries.fragment,
		landing: manifest.routes.ssr,
		close,
	};
}

beforeAll(async () => {
	const app = await serveFixture('fragment-app');
	served.push(app);
	origin = app.origin;
	navigationEntry = app.navigationEntry;
	fragmentEntry = app.fragmentEntry;
	landing = app.landing;
	const doc = await serveFixture('fragment-doc-app');
	served.push(doc);
	docOrigin = doc.origin;
	const production = await serveFixture('fragment-app', true);
	served.push(production);
	productionOrigin = production.origin;
}, 240_000);

afterAll(async () => {
	for (const app of served.splice(0)) await app.close();
});

type Session = {
	readonly page: Page;
	readonly errors: string[];
	readonly requests: string[];
};

async function open(browser: Browser, path = '/', base = origin): Promise<Session> {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const errors: string[] = [];
	const requests: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('request', (request) => {
		const url = new URL(request.url());
		const page = fragmentPageUrl(url);
		requests.push(`${(page ?? url).pathname}${page ? ' fragment' : ''}`);
	});
	await page.goto(base + path);
	return { page, errors, requests };
}

async function landedOn(page: Page, name: string): Promise<void> {
	await page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);
}

async function text(page: Page, selector: string): Promise<string | null> {
	return page.locator(selector).first().textContent();
}

// The file the resume entry imports for the home route: the chunk a deploy removes before this tab fetched it.
async function homeRouteModule(): Promise<{ readonly path: string; readonly entry: string }> {
	const html = await (await fetch(productionOrigin)).text();
	const entry = /data-markless-resume-module="([^"]+)"/.exec(html)?.[1];
	const imports = JSON.parse(/<script type="importmap">([^<]*)<\/script>/.exec(html)?.[1] ?? '{}')
		.imports as Record<string, string> | undefined;
	const source = entry ? await (await fetch(productionOrigin + entry)).text() : '';
	const reference = /"\/pages\/index\.tsrx":\(\)=>(?:\w+\(\(\)=>)?import\(`([^`]+)`\)/.exec(
		source,
	)?.[1];
	const path = reference && (imports?.[reference] ?? reference);
	if (!entry || !path) throw new Error('home route module not found in the resume entry');
	return { path: new URL(path, productionOrigin + entry).pathname, entry };
}

// The tab never got the home route chunk and the origin now 404s it. With `redeploy`, the next
// document names the route under a new URL, as the next deploy's content hash does: through the
// entry chunk that names the route by path, and the document's map if it lists the route.
async function openAfterDeploy(browser: Browser, redeploy: boolean) {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const documents: string[] = [];
	page.on('request', (request) => {
		if (request.resourceType() === 'document') documents.push(new URL(request.url()).pathname);
	});
	const { path: routeModule, entry } = await homeRouteModule();
	const routeFile = routeModule.slice(routeModule.lastIndexOf('/') + 1);
	await page.route(`**${routeModule}`, (route) => route.fulfill({ status: 404, body: '' }));
	await page.route(`${productionOrigin}${entry}?deploy=b`, async (route) => {
		const response = await route.fetch({ url: productionOrigin + entry });
		const body = (await response.text()).replaceAll(routeFile, `${routeFile}?deploy=b`);
		return route.fulfill({ response, body });
	});
	await page.route(`${productionOrigin}/`, async (route) => {
		if (!redeploy || documents.length < 2) return route.continue();
		const response = await route.fetch();
		const body = (await response.text())
			.replaceAll(routeModule, `${routeModule}?deploy=b`)
			.replaceAll(`"${entry}"`, `"${entry}?deploy=b"`);
		return route.fulfill({ response, body });
	});
	await page.goto(productionOrigin);
	await page.locator('[data-increment]').waitFor();
	return { page, documents };
}

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`fragment navigation (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await launchBrowser(browserType);
		});
		afterAll(async () => {
			await browser?.close();
		});

		test('a swapped-in <noscript> holds its markup as text, as a fresh load does, and later handlers still resume', async () => {
			const noscript = (page: Page) =>
				page.evaluate(() => {
					const element = document.querySelector('[data-noscript]');
					return {
						children: [...(element?.childNodes ?? [])].map((node) => node.nodeName),
						text: element?.textContent ?? null,
					};
				});
			const fresh = await open(browser, '/other');
			await landedOn(fresh.page, 'other');
			const loaded = await noscript(fresh.page);
			await fresh.page.close();
			expect(loaded.children).toEqual(['#text']);

			const { page, errors } = await open(browser);
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			expect(await noscript(page)).toEqual(loaded);
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a module a handler imports with import() is fetched when pressed, not preloaded at landing', async () => {
			const page = await browser.newPage();
			const lazyLoads: string[] = [];
			page.on('response', async (response) => {
				if (response.request().resourceType() !== 'script' && !response.url().endsWith('.js'))
					return;
				const body = await response.text().catch(() => '');
				if (body.includes('tools ready')) lazyLoads.push(new URL(response.url()).pathname);
			});
			await page.goto(`${origin}/other`, { waitUntil: 'networkidle' });
			await landedOn(page, 'other');
			expect(lazyLoads).toEqual([]);
			await page.locator('[data-tools]').click();
			await expect.poll(() => text(page, '[data-tools-text]')).toBe('tools ready');
			await expect.poll(() => lazyLoads.length).toBe(1);
			await page.close();
		});

		test('a link click swaps in the server region with no destination render code, and it resumes', async () => {
			const { page, errors, requests } = await open(browser);
			await page.evaluate(() => {
				const writes: string[] = ((
					window as { __historyWrites?: string[] }
				).__historyWrites = []);
				for (const name of ['pushState', 'replaceState'] as const) {
					const write = history[name].bind(history);
					history[name] = (...args: Parameters<History['pushState']>) => {
						writes.push(name);
						write(...args);
					};
				}
			});
			await page.locator('[data-nav="other"]').hover();
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			// One history entry write per navigation: an extra same-URL write reads as a second navigation to CDP.
			expect(
				await page.evaluate(
					() => (window as { __historyWrites?: string[] }).__historyWrites,
				),
			).toEqual(['pushState']);
			expect(page.url()).toBe(`${origin}/other`);
			expect(await page.title()).toBe('Other page');
			expect(await page.locator('[data-async-container]').count()).toBe(1);
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			expect(requests.filter((request) => request === '/other fragment')).toHaveLength(1);
			expect(requests.some((request) => request === '/other')).toBe(false);
			expect(requests).not.toContain(navigationEntry);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a link pressed before its click swaps the page before the next task runs', async () => {
			const { page, errors } = await open(browser);
			const link = page.locator('[data-nav="form"]');
			await link.dispatchEvent('pointerdown');
			await page.waitForTimeout(500);
			const seen = await page.evaluate(
				() =>
					new Promise<string | null | undefined>((resolve) => {
						(document.querySelector('[data-nav="form"]') as HTMLElement).click();
						setTimeout(() =>
							resolve(
								document.querySelector('[data-page]')?.getAttribute('data-page'),
							),
						);
					}),
			);
			expect(seen).toBe('form');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a click with no press or hover before it, ahead of the idle tier, still swaps in place', async () => {
			const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
			const errors: string[] = [];
			const requests: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			page.on('request', (request) => {
				const url = new URL(request.url());
				const fragment = fragmentPageUrl(url);
				requests.push(`${(fragment ?? url).pathname}${fragment ? ' fragment' : ''}`);
			});
			// Held idle: the page has loaded only its listening bridge when the click lands.
			await page.addInitScript(() => {
				(window as { requestIdleCallback?: unknown }).requestIdleCallback = () => 0;
			});
			// The production build serves the bridge as static files; dev inlines both halves.
			await page.goto(productionOrigin + '/');
			const bridgeFiles = () =>
				requests.filter((request) => request.startsWith('/_markless/links/'));
			expect(bridgeFiles()).toHaveLength(1);
			await page.evaluate(() =>
				(document.querySelector('[data-nav="other"]') as HTMLElement).click(),
			);
			await landedOn(page, 'other');
			expect(bridgeFiles()).toHaveLength(2);
			expect(requests).toContain('/other fragment');
			expect(requests).not.toContain('/other');
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a plain anchor clicked ahead of the idle tier swaps by fragment, and one to an unknown path still loads', async () => {
			const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
			const errors: string[] = [];
			const requests: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			page.on('request', (request) => {
				const url = new URL(request.url());
				const fragment = fragmentPageUrl(url);
				requests.push(`${(fragment ?? url).pathname}${fragment ? ' fragment' : ''}`);
			});
			await page.addInitScript(() => {
				(window as { requestIdleCallback?: unknown }).requestIdleCallback = () => 0;
			});
			await page.goto(productionOrigin + '/other');
			await page.evaluate(() =>
				(document.querySelector('[data-plain-home]') as HTMLElement).click(),
			);
			await landedOn(page, 'home');
			expect(requests).toContain('/ fragment');
			expect(requests).not.toContain('/');
			await page.goto(productionOrigin + '/other');
			await Promise.all([
				page.waitForURL(`${productionOrigin}/nowhere`),
				page.evaluate(() =>
					(document.querySelector('[data-plain-unknown]') as HTMLElement).click(),
				),
			]);
			expect(requests).not.toContain('/nowhere fragment');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a class token, declaration and attribute a script added to a container body survive the swap beside the served class', async () => {
			const { page, errors } = await open(browser);
			await page.evaluate(() => {
				document.body.classList.add('menu-open');
				document.body.style.overflow = 'hidden';
				document.body.dataset.scrollLocked = 'yes';
			});
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			expect(
				await page.evaluate(() => ({
					classes: [...document.body.classList].sort(),
					overflow: document.body.style.overflow,
					locked: document.body.dataset.scrollLocked,
				})),
			).toEqual({ classes: ['app', 'menu-open'], overflow: 'hidden', locked: 'yes' });
			expect(errors).toEqual([]);
			await page.close();
		});

		test('route stylesheets and the title follow the destination', async () => {
			const { page, errors } = await open(browser);
			const color = () =>
				page.locator('[data-mark]').evaluate((element) => getComputedStyle(element).color);
			expect(await color()).toBe('rgb(10, 20, 30)');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			expect(await color()).toBe('rgb(200, 100, 50)');
			expect(await page.title()).toBe('Other page');
			await page.locator('[data-nav="home"]').click();
			await landedOn(page, 'home');
			expect(await color()).toBe('rgb(10, 20, 30)');
			expect(await page.title()).toBe('Home page');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('async work of the old page never writes into the new page or storage', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-late-write]').click();
			await expect.poll(() => text(page, '[data-late]')).toBe('waiting');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await page.waitForTimeout(700);
			expect(await page.evaluate(() => localStorage.getItem('fragment-theme'))).not.toBe(
				'late',
			);
			expect(
				await page.evaluate(() =>
					document.documentElement.getAttribute('data-fragment-theme'),
				),
			).not.toBe('late');
			expect(await text(page, '[data-theme]')).toBe('light');
			expect(await text(page, '[data-taps]')).toBe('0');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('storage cells carry to the next page exactly as a landing reads them', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-theme-toggle]').click();
			await expect.poll(() => text(page, '[data-theme]')).toBe('dark');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			expect(
				await page.evaluate(() =>
					document.documentElement.getAttribute('data-fragment-theme'),
				),
			).toBe('dark');
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-theme]')).toBe('dark');
			await page.evaluate(() => localStorage.clear());
			expect(errors).toEqual([]);
			await page.close();
		});

		test('page-scoped shared state starts from the server on the new page', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-hit]').click();
			await page.locator('[data-hit]').click();
			await expect.poll(() => text(page, '[data-hits]')).toBe('2');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			expect(await text(page, '[data-hits]')).toBe('0');
			await page.locator('[data-hit]').click();
			await expect.poll(() => text(page, '[data-hits]')).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('an open modal releases its scroll lock, inert background and document listeners', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-open]').click();
			await expect
				.poll(() => page.evaluate(() => document.body.style.overflow))
				.toBe('hidden');
			await page.locator('[data-dialog-link]').click();
			await landedOn(page, 'other');
			expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
			expect(
				await page.evaluate(
					() => document.querySelectorAll('[inert], [aria-hidden="true"]').length,
				),
			).toBe(0);
			await page.keyboard.press('Escape');
			await page.mouse.click(5, 5);
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('focus leaves the removed page and keyboard navigation works', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-nav="other"]').focus();
			await page.keyboard.press('Enter');
			await landedOn(page, 'other');
			const active = await page.evaluate(() => {
				const element = document.activeElement;
				return element === document.body || element === null ? 'body' : element.isConnected;
			});
			expect(active === 'body' || active === true).toBe(true);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('back and forward restore the page and its scroll position', async () => {
			const { page, errors } = await open(browser);
			await page.evaluate(() => window.scrollTo(0, 1500));
			await page.waitForTimeout(250);
			await page
				.locator('[data-bottom-link]')
				.evaluate((link) => (link as HTMLElement).click());
			await landedOn(page, 'other');
			expect(await page.evaluate(() => window.scrollY)).toBe(0);
			await page.goBack();
			await landedOn(page, 'home');
			await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500);
			await page.locator('[data-increment]').click();
			await expect.poll(() => text(page, '[data-count]')).toBe('1');
			await page.goForward();
			await landedOn(page, 'other');
			expect(await page.title()).toBe('Other page');
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			expect(await page.locator('[data-async-container]').count()).toBe(1);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('the page a clicked link lands on is not fetched again, and Back to it needs no request', async () => {
			const { page, requests, errors } = await open(browser);
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await page.waitForTimeout(300);
			expect(requests.filter((request) => request === '/other fragment')).toHaveLength(1);
			await page.locator('[data-nav="form"]').click();
			await landedOn(page, 'form');
			await page.waitForTimeout(300);
			const beforeBack = requests.length;
			await page.goBack();
			await landedOn(page, 'other');
			expect(requests.slice(beforeBack)).not.toContain('/other fragment');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('Back restores the page it left even while a hover prefetch of it is still in flight', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			let held = 0;
			await page.route(
				(url) => (fragmentPageUrl(url) ?? url).pathname === '/other',
				async (route) => {
					held += 1;
					await new Promise((resolveHold) => setTimeout(resolveHold, 5000));
					await route.continue().catch(() => {});
				},
			);
			await page.locator('[data-nav="form"]').click();
			await landedOn(page, 'form');
			await page.locator('[data-nav="other"]').hover();
			await expect.poll(() => held).toBeGreaterThan(0);
			const started = Date.now();
			await page.goBack();
			await landedOn(page, 'other');
			expect(Date.now() - started).toBeLessThan(2500);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a streamed @pending region settles after the swap and resumes', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-nav="slow"]').click();
			await landedOn(page, 'slow');
			await page.locator('[data-settled]').waitFor();
			expect(await page.locator('[data-pending]').count()).toBe(0);
			await page.locator('[data-settled-tap]').click();
			await expect.poll(() => text(page, '[data-settled-tap]')).toBe('Taps 1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('leaving a page mid-stream retires its executor without touching the next page', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-nav="slow"]').click();
			await landedOn(page, 'slow');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await page.waitForTimeout(800);
			expect(await page.locator('[data-settled], [data-pending]').count()).toBe(0);
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('forms on a swapped-in page submit through their handlers', async () => {
			const { page, errors } = await open(browser);
			await page.locator('[data-nav="form"]').click();
			await landedOn(page, 'form');
			await page.locator('[data-name]').fill('ada');
			await page.locator('[data-submit]').click();
			await expect.poll(() => text(page, '[data-sent]')).toBe('sent ada');
			expect(page.url()).toBe(`${origin}/form`);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a Link to a path that names no page loads it with one document request', async () => {
			const { page, requests } = await open(browser);
			await page.locator('[data-nav="missing"]').click();
			await page.waitForURL(`${origin}/missing`);
			await page.waitForLoadState('load');
			expect(requests.filter((request) => request.startsWith('/missing'))).toEqual([
				'/missing',
			]);
			expect(await page.locator('main').count()).toBe(0);
			await page.close();
		});

		test('prefetch={false} fetches nothing on hover and still navigates on click', async () => {
			const { page, requests, errors } = await open(browser);
			await page.mouse.move(400, 500);
			await page.waitForTimeout(3500);
			const settled = requests.length;
			await page.locator('[data-nav="quiet"]').hover();
			await page.waitForTimeout(300);
			expect(
				requests.slice(settled).filter((request) => request.endsWith('fragment')),
			).toEqual([]);
			await page.locator('[data-nav="quiet"]').click();
			await landedOn(page, 'other');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a plain anchor to a page navigates by fragment; one to an unknown path loads normally', async () => {
			const { page, errors, requests } = await open(browser, '/other');
			await page.evaluate(() => {
				(window as unknown as Record<string, unknown>).__left =
					document.querySelector('[data-async-container]');
			});
			await page.locator('[data-plain-home]').click();
			await landedOn(page, 'home');
			expect(requests).toContain('/ fragment');
			expect(requests).not.toContain('/');
			// The page being left never starts its runtime for the click that leaves it.
			expect(
				await page.evaluate(
					() =>
						(
							(window as unknown as Record<string, unknown>).__left as Record<
								string,
								unknown
							>
						).__marklessDelegatedDispatch,
				),
			).toBeUndefined();
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await Promise.all([
				page.waitForURL(`${origin}/nowhere`),
				page.locator('[data-plain-unknown]').click(),
			]);
			expect(requests).toContain('/nowhere');
			expect(requests).not.toContain('/nowhere fragment');
			// The unknown path's own document answers 404; nothing else may fail.
			expect(errors.filter((error) => !error.includes('status of 404'))).toEqual([]);
			await page.close();
		});

		test('a plain anchor whose click the page prevented stays put', async () => {
			const { page, errors } = await open(browser, '/other');
			await page
				.locator('[data-plain-home]')
				.evaluate((link) =>
					link.addEventListener('click', (event) => event.preventDefault()),
				);
			await page.locator('[data-plain-home]').click();
			await page.waitForTimeout(400);
			expect(page.url()).toBe(`${origin}/other`);
			expect(await page.locator('[data-page]').getAttribute('data-page')).toBe('other');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('plain shell anchors (pager, breadcrumb) navigate without a document load', async () => {
			const { page, errors, requests } = await open(browser, '/', docOrigin);
			await page.evaluate(() => {
				(window as unknown as Record<string, unknown>).__sameDocument = true;
			});
			await page.locator('[data-pager-next]').click();
			await landedOn(page, 'alpha');
			expect(await page.title()).toBe('Alpha guide');
			await page.locator('[data-crumb-home]').click();
			await landedOn(page, 'index');
			expect(await page.title()).toBe('Guide home');
			expect(
				await page.evaluate(
					() => (window as unknown as Record<string, unknown>).__sameDocument,
				),
			).toBe(true);
			expect(requests.filter((request) => request === '/' || request === '/alpha')).toEqual([
				'/',
			]);
			await Promise.all([
				page.waitForURL(`${docOrigin}/notes.txt`),
				page.locator('[data-pager-asset]').click(),
			]);
			expect(requests).toContain('/notes.txt');
			expect(requests).not.toContain('/notes.txt fragment');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('the first swap from a landing drops an html attribute only the landing page was served with, and keeps what a script set', async () => {
			const { page, errors } = await open(browser, '/', docOrigin);
			const html = () =>
				page.evaluate(() => ({
					landing: document.documentElement.getAttribute('data-landing-only'),
					shell: document.documentElement.getAttribute('data-page-shell'),
					scripted: document.documentElement.getAttribute('data-scripted'),
				}));
			expect(await html()).toEqual({ landing: 'home', shell: '/', scripted: 'yes' });
			await page.locator('[data-pager-next]').click();
			await landedOn(page, 'alpha');
			expect(await html()).toEqual({ landing: null, shell: '/alpha', scripted: 'yes' });
			await page.locator('[data-crumb-home]').click();
			await landedOn(page, 'index');
			expect(await html()).toEqual({ landing: 'home', shell: '/', scripted: 'yes' });
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a theme a script set on html survives every swap, in every frame, while the server still owns its own class tokens and declarations', async () => {
			const { page, errors } = await open(browser, '/', docOrigin);
			await page.evaluate(() => {
				const root = document.documentElement;
				const lost: string[] = [];
				(window as unknown as Record<string, unknown>).__themeLost = lost;
				const check = (when: string) => {
					if (!root.classList.contains('dark'))
						lost.push(`${when}: class ${root.className}`);
					if (root.style.colorScheme !== 'dark')
						lost.push(`${when}: style ${root.style.cssText}`);
					if (root.dataset.mode !== 'dark')
						lost.push(`${when}: data-mode ${root.dataset.mode}`);
				};
				new MutationObserver(() => check('mutation')).observe(root, { attributes: true });
				const frame = () => {
					check('frame');
					requestAnimationFrame(frame);
				};
				requestAnimationFrame(frame);
			});
			const html = () =>
				page.evaluate(() => ({
					home: document.documentElement.classList.contains('shell-home'),
					shell: document.documentElement.classList.contains('shell'),
					homeVar: document.documentElement.style.getPropertyValue('--home'),
					scroll: document.documentElement.style.scrollBehavior,
				}));
			expect(await html()).toEqual({
				home: true,
				shell: true,
				homeVar: '1',
				scroll: 'smooth',
			});
			await page.locator('[data-pager-next]').click();
			await landedOn(page, 'alpha');
			expect(await html()).toEqual({
				home: false,
				shell: true,
				homeVar: '',
				scroll: 'smooth',
			});
			await page.locator('[data-pager-next]').click();
			await landedOn(page, 'beta');
			await page.locator('[data-crumb-home]').click();
			await landedOn(page, 'index');
			expect(await html()).toEqual({
				home: true,
				shell: true,
				homeVar: '1',
				scroll: 'smooth',
			});
			expect(
				await page.evaluate(
					() => (window as unknown as Record<string, unknown>).__themeLost,
				),
			).toEqual([]);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('what a script set on a shell body survives every swap, in every frame, while the server still owns its own body class tokens, declarations and attributes', async () => {
			const { page, errors } = await open(browser, '/', docOrigin);
			await page.evaluate(() => {
				const body = document.body;
				const lost: string[] = [];
				(window as unknown as Record<string, unknown>).__bodyLost = lost;
				const check = (when: string) => {
					if (!document.body.classList.contains('menu-open'))
						lost.push(`${when}: class ${document.body.className}`);
					if (document.body.style.overflow !== 'hidden')
						lost.push(`${when}: style ${document.body.style.cssText}`);
					if (document.body.dataset.scrollLocked !== 'yes')
						lost.push(
							`${when}: data-scroll-locked ${document.body.dataset.scrollLocked}`,
						);
				};
				new MutationObserver(() => check('mutation')).observe(body, { attributes: true });
				const frame = () => {
					check('frame');
					requestAnimationFrame(frame);
				};
				requestAnimationFrame(frame);
			});
			const body = () =>
				page.evaluate(() => ({
					home: document.body.classList.contains('page-home'),
					page: document.body.classList.contains('page'),
					homeVar: document.body.style.getPropertyValue('--body-home'),
					margin: document.body.style.margin,
					shown: document.body.dataset.bodyPage,
				}));
			expect(await body()).toEqual({
				home: true,
				page: true,
				homeVar: '1',
				margin: '0px',
				shown: '/',
			});
			await page.locator('[data-pager-next]').click();
			await landedOn(page, 'alpha');
			expect(await body()).toEqual({
				home: false,
				page: true,
				homeVar: '',
				margin: '0px',
				shown: '/alpha',
			});
			await page.locator('[data-pager-next]').click();
			await landedOn(page, 'beta');
			await page.locator('[data-crumb-home]').click();
			await landedOn(page, 'index');
			expect(await body()).toEqual({
				home: true,
				page: true,
				homeVar: '1',
				margin: '0px',
				shown: '/',
			});
			expect(
				await page.evaluate(
					() => (window as unknown as Record<string, unknown>).__bodyLost,
				),
			).toEqual([]);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a URL-dependent document keeps its chrome, updates its head, and never reloads', async () => {
			const { page, errors, requests } = await open(browser, '/', docOrigin);
			await page.evaluate(() => {
				(window as unknown as Record<string, unknown>).__sameDocument = true;
				(
					document.querySelector('.shell-header') as unknown as Record<string, unknown>
				).__kept = true;
				document.querySelector('[data-side]')!.scrollTop = 900;
			});
			await page.waitForTimeout(100);
			const shifts = await page.evaluate(() => {
				const seen: number[] = [];
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries())
						seen.push((entry as unknown as { value: number }).value);
				}).observe({ type: 'layout-shift', buffered: false });
				(window as unknown as Record<string, unknown>).__shifts = seen;
				return PerformanceObserver.supportedEntryTypes.includes('layout-shift');
			});
			await page
				.locator('[data-side-link="beta"]')
				.evaluate((link) => (link as HTMLElement).click());
			await landedOn(page, 'beta');
			expect(
				await page.evaluate(
					() => (window as unknown as Record<string, unknown>).__sameDocument,
				),
			).toBe(true);
			expect(requests.filter((request) => request === '/beta')).toEqual([]);
			expect(
				await page.evaluate(
					() =>
						(
							document.querySelector('.shell-header') as unknown as Record<
								string,
								unknown
							>
						).__kept,
				),
			).toBe(true);
			expect(await text(page, '.crumb')).toBe('Beta guide');
			expect(await text(page, '[data-pager]')).toBe('after /beta');
			expect(await page.title()).toBe('Beta guide');
			expect(await page.locator('meta[name="description"]').getAttribute('content')).toBe(
				'About Beta guide',
			);
			expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(
				'https://guide.test/beta',
			);
			expect(await page.locator('meta[name="description"]').count()).toBe(1);
			expect(
				await page.evaluate(() => document.documentElement.getAttribute('data-page-shell')),
			).toBe('/beta');
			expect(
				await page.evaluate(() => document.querySelector('[data-side]')!.scrollTop),
			).toBe(900);
			expect(await page.locator('[data-side-link="beta"]').getAttribute('aria-current')).toBe(
				'page',
			);
			if (shifts)
				expect(
					await page.evaluate(() =>
						(window as unknown as Record<string, number[]>).__shifts.reduce(
							(sum, value) => sum + value,
							0,
						),
					),
				).toBe(0);
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			await page.goBack();
			await landedOn(page, 'index');
			expect(await page.title()).toBe('Guide home');
			expect(await text(page, '[data-pager]')).toBe('after /');
			await page.goForward();
			await landedOn(page, 'beta');
			expect(
				await page.evaluate(
					() => (window as unknown as Record<string, unknown>).__sameDocument,
				),
			).toBe(true);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a scrolled box the next page wraps differently keeps its offset, and the page lands without a smooth scroll', async () => {
			const { page, errors } = await open(browser, '/', docOrigin);
			// The router learns a box scrolled from its scroll event, which fires a frame after the write.
			await page.evaluate(
				() =>
					new Promise<void>((settled) => {
						const side = document.querySelector('[data-side]')!;
						const pending = new Set<EventTarget>([side, document]);
						const heard = (event: Event) => {
							pending.delete(event.target!);
							if (pending.size) return;
							window.removeEventListener('scroll', heard, true);
							settled();
						};
						window.addEventListener('scroll', heard, true);
						side.scrollTop = 900;
						window.scrollTo({ top: 1200, behavior: 'instant' });
						const seen: Array<{ y: number; side: number }> = [];
						(window as unknown as Record<string, unknown>).__landed = seen;
						document.addEventListener('marklessrouterrendered', () =>
							seen.push({
								y: window.scrollY,
								side: document.querySelector('[data-side]')!.scrollTop,
							}),
						);
					}),
			);
			await page
				.locator('[data-side-link="gamma"]')
				.evaluate((link) => (link as HTMLElement).click());
			await landedOn(page, 'gamma');
			// A long page fills in over frames; the rendered event marks the whole page in place.
			const rendered = (count: number) =>
				page.waitForFunction(
					(expected) =>
						((window as unknown as Record<string, unknown[]>).__landed ?? []).length ===
						expected,
					count,
				);
			await rendered(1);
			await page.goBack();
			await landedOn(page, 'index');
			await rendered(2);
			expect(
				await page.evaluate(() => (window as unknown as Record<string, unknown>).__landed),
			).toEqual([
				{ y: 0, side: 900 },
				{ y: 1200, side: 900 },
			]);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('at idle, every page link in view fetches its fragment once, none cancelled, never a dead link', async () => {
			const { page, requests, errors } = await open(browser);
			const cancelled: string[] = [];
			page.on('requestfailed', (request) => cancelled.push(new URL(request.url()).pathname));
			await page.waitForTimeout(3500);
			const fetched = requests.filter((request) => request.endsWith(' fragment'));
			expect(fetched.toSorted()).toEqual([
				'/form fragment',
				'/other fragment',
				'/slow fragment',
			]);
			expect(cancelled).toEqual([]);
			expect(errors).toEqual([]);
			await page.close();
		});

		test.runIf(name === 'chromium')('the idle tier fetches pages at low priority, after the load event', async () => {
			const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
			const cdp = await page.context().newCDPSession(page);
			await cdp.send('Network.enable');
			const fetched: { path: string; priority: string; at: number }[] = [];
			cdp.on('Network.requestWillBeSent', (event) => {
				const url = new URL(event.request.url);
				if (fragmentPageUrl(url)) fetched.push({ path: url.pathname, priority: event.request.initialPriority, at: event.timestamp });
			});
			let loaded = 0;
			cdp.on('Page.loadEventFired', (event) => (loaded = event.timestamp));
			await cdp.send('Page.enable');
			await page.goto(origin + '/');
			await expect.poll(() => fetched.length, { timeout: 5000 }).toBeGreaterThan(0);
			for (const request of fetched) {
				expect(request.priority).toBe('Low');
				expect(request.at).toBeGreaterThanOrEqual(loaded);
			}
			await page.close();
		});

		test('at idle on a fast connection, the swap module and the code of each page in view download', async () => {
			const { page, errors } = await open(browser);
			const scripts: string[] = [];
			page.on('request', (request) => {
				if (request.resourceType() === 'script')
					scripts.push(new URL(request.url()).pathname);
			});
			await page.waitForTimeout(3500);
			const destinations = ['pages/other.tsrx', 'pages/form.tsrx', 'pages/slow.tsrx'];
			const own = new Set(landing['pages/index.tsrx'] ?? []);
			const expected = [
				fragmentEntry,
				...destinations
					.flatMap((route) => landing[route] ?? [])
					.filter((href) => !own.has(href)),
			];
			expect(expected.length).toBeGreaterThan(1);
			for (const href of expected) expect(scripts).toContain(new URL(href, origin).pathname);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('navigate() swaps the page in place like a Link click and resolves once it is in', async () => {
			const { page, errors, requests } = await open(browser);
			const documents: string[] = [];
			page.on('request', (request) => {
				if (request.resourceType() === 'document') documents.push(request.url());
			});
			const before = await page.evaluate(() => history.length);
			await page.locator('[data-navigate]').click();
			await landedOn(page, 'other');
			await expect
				.poll(() => page.evaluate(() => document.documentElement.dataset.navigated))
				.toBe('/other');
			expect(page.url()).toBe(`${origin}/other`);
			expect(await page.evaluate(() => history.length)).toBe(before + 1);
			expect(documents).toEqual([]);
			expect(requests).toContain('/other fragment');
			await page.locator('[data-tap]').click();
			await expect.poll(() => text(page, '[data-taps]')).toBe('1');
			await page.goBack();
			await landedOn(page, 'home');
			expect(documents).toEqual([]);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('navigate() with replace swaps in place and replaces the history entry', async () => {
			const { page, errors } = await open(browser);
			const documents: string[] = [];
			page.on('request', (request) => {
				if (request.resourceType() === 'document') documents.push(request.url());
			});
			const before = await page.evaluate(() => history.length);
			await page.locator('[data-navigate-replace]').click();
			await landedOn(page, 'other');
			expect(page.url()).toBe(`${origin}/other`);
			expect(await page.evaluate(() => history.length)).toBe(before);
			expect(documents).toEqual([]);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('navigate() to a path that names no page loads it as a document', async () => {
			const { page } = await open(browser);
			const loaded = page.waitForEvent('load');
			await page.locator('[data-navigate-unknown]').click();
			await loaded;
			expect(new URL(page.url()).pathname).toBe('/nowhere');
			await page.close();
		});

		test('a fragment fetch names its own URL; the page URL always answers the document', async () => {
			const fragment = await fetch(fragmentRequestUrl(`${origin}/other`));
			expect(await fragment.text()).toContain(FRAGMENT_REGION_END);
			const document = await fetch(`${origin}/other`);
			expect(await document.text()).not.toContain(FRAGMENT_REGION_END);
		});

		test('a cache keyed on the URL alone never serves a navigation fetch as a page load, or the reverse', async () => {
			const cdn = await urlKeyedCache(origin);
			try {
				const { page, errors, requests } = await open(browser, '/', cdn.origin);
				await page.locator('[data-nav="other"]').click();
				await landedOn(page, 'other');
				expect(page.url()).toBe(`${cdn.origin}/other`);
				expect(requests).toContain('/other fragment');
				const load = await page.goto(`${cdn.origin}/other`);
				expect(await load?.text()).not.toContain(FRAGMENT_REGION_END);
				await page.locator('[data-tap]').click();
				await expect.poll(() => text(page, '[data-taps]')).toBe('1');
				expect(errors).toEqual([]);
				await page.close();

				cdn.clear();
				const reverse = await open(browser, '/other', cdn.origin);
				const documents: string[] = [];
				reverse.page.on('request', (request) => {
					if (request.resourceType() === 'document')
						documents.push(new URL(request.url()).pathname);
				});
				await reverse.page.goto(`${cdn.origin}/`);
				await reverse.page.locator('[data-nav="other"]').click();
				await landedOn(reverse.page, 'other');
				expect(documents).toEqual(['/']);
				expect(reverse.page.url()).toBe(`${cdn.origin}/other`);
				expect(await reverse.page.locator('[data-async-container]').count()).toBe(1);
				await reverse.page.locator('[data-tap]').click();
				await expect.poll(() => text(reverse.page, '[data-taps]')).toBe('1');
				expect(reverse.errors).toEqual([]);
				await reverse.page.close();
			} finally {
				await cdn.close();
			}
		});

		test('a click whose route chunk a deploy removed loads the page again once, then clicks work', async () => {
			const { page, documents } = await openAfterDeploy(browser, true);
			const reloaded = page.waitForEvent('load');
			await page.locator('[data-increment]').click();
			await reloaded;
			await page.locator('[data-increment]').click();
			await expect.poll(() => text(page, '[data-count]')).toBe('1');
			expect(documents).toEqual(['/', '/']);
			await page.close();
		});

		test('a route chunk that stays missing reloads the page at most once', async () => {
			const { page, documents } = await openAfterDeploy(browser, false);
			const reloaded = page.waitForEvent('load');
			await page.locator('[data-increment]').click();
			await reloaded;
			await page.locator('[data-increment]').click();
			await page.waitForTimeout(500);
			expect(documents).toEqual(['/', '/']);
			expect(await text(page, '[data-count]')).toBe('0');
			await page.close();
		});
	});
}
