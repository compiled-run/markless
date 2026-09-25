import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';

// Links the fragment router must leave to the browser, or fetch no more than once:
// in-page anchors, server endpoints, the document's own head scripts, and prefetches the user never takes.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let origin = '';
let close: (() => Promise<void>) | undefined;

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

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-fragment-edge-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-edge-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	const port = await freePort();
	origin = `http://127.0.0.1:${port}`;
	const server: ChildProcess = spawn(process.execPath, [join(root, '.output/server/index.mjs')], {
		env: { PATH: process.env.PATH, PORT: String(port), HOST: '127.0.0.1' },
		stdio: 'ignore',
	});
	close = async () => {
		server.kill();
		await rm(root, { recursive: true, force: true });
	};
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			if ((await fetch(origin)).ok) return;
		} catch {}
		await new Promise((resolveWait) => setTimeout(resolveWait, 100));
	}
	throw new Error('fragment-edge-app fixture server did not start');
}, 240_000);

afterAll(async () => {
	await close?.();
});

type Seen = { readonly path: string; readonly fragment: boolean; readonly purpose?: string };
type Session = { readonly page: Page; readonly errors: string[]; readonly requests: Seen[] };

// Save-Data turns the idle tier off, so every fragment request below comes from the gesture under test.
async function open(browser: Browser, path = '/'): Promise<Session> {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.addInitScript(() =>
		Object.defineProperty(navigator, 'connection', {
			value: { effectiveType: '4g', saveData: true },
		}),
	);
	const errors: string[] = [];
	const requests: Seen[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('request', (request) => {
		const url = new URL(request.url());
		const headers = request.headers();
		requests.push({
			path: url.pathname + url.search,
			fragment: headers['x-markless-fragment'] === '1',
			purpose: headers.purpose,
		});
	});
	await page.goto(origin + path);
	return { page, errors, requests };
}

async function landedOn(page: Page, name: string, timeout = 5000): Promise<void> {
	await page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
		{ timeout },
	);
}

const text = (page: Page, selector: string) => page.locator(selector).first().textContent();
const fragments = (requests: readonly Seen[]) =>
	requests.filter((request) => request.fragment).map((request) => request.path);
const logouts = async () =>
	((await (await fetch(`${origin}/api/logouts`)).json()) as { count: number }).count;

describe('fragment navigation edges (chromium)', () => {
	let browser: Browser;
	beforeAll(async () => {
		browser = await chromium.launch();
	});
	afterAll(async () => {
		await browser?.close();
	});

	test('href="#" is followed by the browser in place: no fetch, no state reset', async () => {
		const { page, errors, requests } = await open(browser);
		await page.locator('[data-increment]').click();
		await expect.poll(() => text(page, '[data-count]')).toBe('1');
		await page.locator('[data-hash-empty]').click();
		await page.waitForTimeout(500);
		expect(page.url()).toBe(`${origin}/#`);
		expect(await text(page, '[data-count]')).toBe('1');
		expect(fragments(requests)).toEqual([]);
		expect(errors).toEqual([]);
		await page.close();
	});

	test('a Link without href and same-page #anchors stay in place', async () => {
		const { page, errors, requests } = await open(browser);
		await page.locator('[data-increment]').click();
		await expect.poll(() => text(page, '[data-count]')).toBe('1');
		await page.locator('[data-nowhere]').click();
		await page.waitForTimeout(300);
		await page.locator('[data-hash-section]').click();
		await page.waitForTimeout(300);
		expect(page.url()).toBe(`${origin}/#section`);
		await page.evaluate(() => scrollTo(0, 0));
		await page.locator('[data-path-section]').click();
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
		expect(await text(page, '[data-count]')).toBe('1');
		expect(fragments(requests)).toEqual([]);
		expect(errors).toEqual([]);
		await page.close();
	});

	test('hovering, pressing or focusing a Link to a server endpoint never requests it', async () => {
		const { page, requests } = await open(browser);
		const before = await logouts();
		await page.locator('[data-nav="logout"]').hover();
		await page.waitForTimeout(400);
		await page.locator('[data-nav="logout"]').focus();
		await page.dispatchEvent('[data-nav="logout"]', 'pointerdown', { button: 0 });
		await page.waitForTimeout(400);
		expect(requests.filter((request) => request.path.startsWith('/api/logout'))).toEqual([]);
		expect(await logouts()).toBe(before);
		await page.close();
	});

	test('clicking a Link to a server endpoint requests it exactly once, as a document load', async () => {
		const { page, requests } = await open(browser);
		const before = await logouts();
		await page.locator('[data-nav="logout"]').evaluate((link) => (link as HTMLElement).click());
		await page.waitForURL(/api\/logout/);
		await page.waitForLoadState('load');
		await page.waitForTimeout(300);
		expect(requests.filter((request) => request.path.startsWith('/api/logout'))).toEqual([
			{ path: '/api/logout', fragment: false, purpose: undefined },
		]);
		expect(await logouts()).toBe(before + 1);
		await page.close();
	});

	test('prefetches say so; the click-time fetch does not', async () => {
		const { page, requests } = await open(browser);
		await page.locator('[data-nav="item1"]').hover();
		await expect.poll(() => fragments(requests)).toEqual(['/item/1']);
		expect(requests.find((request) => request.fragment)?.purpose).toBe('prefetch');
		await page.locator('[data-nav="item2"]').evaluate((link) => (link as HTMLElement).click());
		await landedOn(page, 'item-2');
		const click = requests.find((request) => request.fragment && request.path === '/item/2');
		expect(click?.purpose).toBeUndefined();
		await page.close();
	});

	test('inline head scripts of the document shell run once, not once per navigation', async () => {
		const { page, errors } = await open(browser);
		expect(await page.evaluate(() => (window as { __headRuns?: number }).__headRuns)).toBe(1);
		for (const [nav, name] of [
			['item1', 'item-1'],
			['item2', 'item-2'],
			['home', 'home'],
		] as const) {
			await page.locator(`[data-nav="${nav}"]`).click();
			await landedOn(page, name);
		}
		await page.waitForTimeout(200);
		expect(await page.evaluate(() => (window as { __headRuns?: number }).__headRuns)).toBe(1);
		expect(errors).toEqual([]);
		await page.close();
	});

	test('one click fetches the destination once, even after a long pause before the press', async () => {
		const { page, requests } = await open(browser);
		const box = (await page.locator('[data-nav="item1"]').boundingBox())!;
		await page.mouse.move(400, 500);
		await page.waitForTimeout(1000);
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.waitForTimeout(150);
		await page.mouse.down();
		await page.waitForTimeout(80);
		await page.mouse.up();
		await landedOn(page, 'item-1');
		await page.waitForTimeout(2000);
		expect(fragments(requests)).toEqual(['/item/1']);
		await page.close();
	});

	test('a Playwright click fetches the destination once', async () => {
		const { page, requests } = await open(browser);
		await page.locator('[data-nav="item1"]').click();
		await landedOn(page, 'item-1');
		await page.waitForTimeout(500);
		expect(fragments(requests)).toEqual(['/item/1']);
		await page.close();
	});

	test('unused prefetches of slow-streaming pages never hold the connection pool', async () => {
		const { page, errors } = await open(browser, '/slow');
		for (let n = 1; n <= 6; n += 1) {
			await page.locator(`[data-slow="${n}"]`).hover();
			await page.waitForTimeout(120);
		}
		await page.mouse.move(700, 580);
		await page.waitForTimeout(300);
		const started = Date.now();
		await page.locator('[data-slow="item"]').click();
		await landedOn(page, 'item-1', 20_000);
		expect(Date.now() - started).toBeLessThan(3000);
		expect(errors).toEqual([]);
		await page.close();
	}, 60_000);
});
