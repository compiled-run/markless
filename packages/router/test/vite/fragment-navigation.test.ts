import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { clientAssetsManifestPath } from '../../src/vite/client-assets-manifest.ts';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';

// A built router app served by its real Nitro server and driven in real browsers:
// every route change here is a fragment swap, and each case pins one thing the
// outgoing page must not carry into the incoming one.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
type ServedFixture = {
	readonly origin: string;
	readonly navigationEntry: string;
	readonly close: () => Promise<void>;
};

let origin = '';
let navigationEntry = '';
let docOrigin = '';
let productionOrigin = '';
const served: ServedFixture[] = [];

async function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			probe.close(() =>
				typeof address === 'object' && address ? resolvePort(address.port) : reject(),
			);
		});
	});
}

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
		await readFile(
			clientAssetsManifestPath(join(root, '.output/public')),
			'utf8',
		),
	) as { entries: { navigation: string } };
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;
	const server: ChildProcess = spawn(process.execPath, [join(root, '.output/server/index.mjs')], {
		env: { PATH: process.env.PATH, PORT: String(port), HOST: '127.0.0.1' },
		stdio: 'ignore',
	});
	const close = async () => {
		server.kill();
		await rm(root, { recursive: true, force: true });
	};
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			if ((await fetch(url)).ok)
				return { origin: url, navigationEntry: manifest.entries.navigation, close };
		} catch {}
		await new Promise((resolveWait) => setTimeout(resolveWait, 100));
	}
	await close();
	throw new Error(`${name} fixture server did not start`);
}

beforeAll(async () => {
	const app = await serveFixture('fragment-app');
	served.push(app);
	origin = app.origin;
	navigationEntry = app.navigationEntry;
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
	page.on('request', (request) =>
		requests.push(
			`${new URL(request.url()).pathname}${request.headers()['x-markless-fragment'] ? ' fragment' : ''}`,
		),
	);
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
async function homeRouteModulePath(): Promise<string> {
	const html = await (await fetch(productionOrigin)).text();
	const entry = /data-markless-resume-module="([^"]+)"/.exec(html)?.[1];
	const imports = JSON.parse(/<script type="importmap">([^<]*)<\/script>/.exec(html)?.[1] ?? '{}')
		.imports as Record<string, string> | undefined;
	const source = entry ? await (await fetch(productionOrigin + entry)).text() : '';
	const specifier = /"\/pages\/index\.tsrx":\(\)=>(?:\w+\(\(\)=>)?import\(`([^`]+)`\)/.exec(
		source,
	)?.[1];
	const path = specifier && (imports?.[specifier] ?? specifier);
	if (!path) throw new Error('home route module not found in the resume entry');
	return new URL(path, productionOrigin).pathname;
}

// The tab never got the home route chunk and the origin now 404s it. With `redeploy`, the next
// document names the route under a new URL, as the next deploy's content hash does.
async function openAfterDeploy(browser: Browser, redeploy: boolean) {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const documents: string[] = [];
	page.on('request', (request) => {
		if (request.resourceType() === 'document') documents.push(new URL(request.url()).pathname);
	});
	const routeModule = await homeRouteModulePath();
	await page.route(`**${routeModule}`, (route) => route.fulfill({ status: 404, body: '' }));
	await page.route(`${productionOrigin}/`, async (route) => {
		if (!redeploy || documents.length < 2) return route.continue();
		const response = await route.fetch();
		const body = (await response.text()).replaceAll(routeModule, `${routeModule}?deploy=b`);
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
			browser = await browserType.launch();
		});
		afterAll(async () => {
			await browser?.close();
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
			await page.route('**/other', async (route) => {
				held += 1;
				await new Promise((resolveHold) => setTimeout(resolveHold, 5000));
				await route.continue().catch(() => {});
			});
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
			expect(requests.filter((request) => request.startsWith('/missing'))).toEqual(['/missing']);
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

		test('at idle, only a few visible page links fetch their fragments, never a dead link', async () => {
			const { page, requests, errors } = await open(browser);
			await page.waitForTimeout(3500);
			const fetched = requests.filter((request) => request.endsWith(' fragment'));
			expect(fetched.length).toBeLessThanOrEqual(2);
			expect(fetched).not.toContain('/missing fragment');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('fragment responses vary on the fragment header', async () => {
			const response = await fetch(`${origin}/other`, {
				headers: { 'x-markless-fragment': '1' },
			});
			expect(response.headers.get('vary')).toContain('x-markless-fragment');
			const body = await response.text();
			expect(body).toContain('<!--markless:region-end-->');
			const document = await fetch(`${origin}/other`);
			expect(document.headers.get('vary')).toContain('x-markless-fragment');
			expect(await document.text()).not.toContain('<!--markless:region-end-->');
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
