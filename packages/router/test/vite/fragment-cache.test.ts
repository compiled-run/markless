import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { FRAGMENT_HOVER_DWELL_MS, fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A page fetched ahead of a click is shown only while it can still be what the server would send:
// a write the page makes, or the page's own Cache-Control, sends the click to the server again.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let origin = '';
let close = async () => {};

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-fragment-cache-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-cache-app'), root, {
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
		plugins: [markless({ experimentalNativePacking: true }), router()],
	});
	await builder.buildApp();
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = async () => {
		server.close();
		await rm(root, { recursive: true, force: true });
	};
}, 240_000);

afterAll(async () => close());

// A write the page never sees, as another tab or another user makes it.
async function bumpElsewhere(): Promise<number> {
	const response = await fetch(`${origin}/api/bump`, { method: 'POST' });
	return ((await response.json()) as { count: number }).count;
}

// Pages the server answered. Not requestfinished: a fetch the page already read can still end as net::ERR_ABORTED.
function trackFetches(page: Page) {
	const arrived: string[] = [];
	const waiting = new Map<string, (() => void)[]>();
	page.on('response', (response) => {
		const path = fragmentPageUrl(new URL(response.url()))?.pathname;
		if (!path) return;
		arrived.push(path);
		for (const done of waiting.get(path) ?? []) done();
		waiting.delete(path);
	});
	const fetched = (path: string) =>
		arrived.includes(path)
			? Promise.resolve()
			: new Promise<void>((done) => waiting.set(path, [...(waiting.get(path) ?? []), done]));
	return { arrived, fetched };
}

type Fetched = (path: string) => Promise<void>;

async function open(browser: Browser) {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const { arrived, fetched } = trackFetches(page);
	await page.goto(`${origin}/`);
	await landedOn(page, 'home');
	return { page, arrived, fetched };
}

async function landedOn(page: Page, name: string) {
	await page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);
}

async function fetchedAhead(page: Page, fetched: Fetched, link: string, path: string) {
	await page.locator(link).hover();
	await fetched(path);
}

async function follow(page: Page, link: string, name: string) {
	await page.locator(link).click();
	await landedOn(page, name);
	return Number(await page.locator('[data-count]').textContent());
}

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`pages fetched ahead (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await launchBrowser(browserType);
		});
		afterAll(async () => {
			await browser?.close();
		});

		test('a page fetched ahead is shown as fetched when nothing on this page wrote since', async () => {
			const { page, fetched } = await open(browser);
			await fetchedAhead(page, fetched, '[data-list]', '/list');
			const now = await bumpElsewhere();
			expect(await follow(page, '[data-list]', 'list')).toBe(now - 1);
			await page.close();
		});

		test('a fetch the page sends that is not a read makes the click ask the server again', async () => {
			const { page, fetched } = await open(browser);
			await fetchedAhead(page, fetched, '[data-list]', '/list');
			const now = await page.evaluate(async () => {
				const response = await fetch('/api/bump', { method: 'POST' });
				return ((await response.json()) as { count: number }).count;
			});
			expect(await follow(page, '[data-list]', 'list')).toBe(now);
			await page.close();
		});

		test('a submitted form makes the click ask the server again', async () => {
			const { page, fetched } = await open(browser);
			await fetchedAhead(page, fetched, '[data-list]', '/list');
			const now = await bumpElsewhere();
			await page.locator('[data-form] button').click();
			await expect
				.poll(() => page.locator('[data-form] button').textContent())
				.toBe('Send 1');
			expect(await follow(page, '[data-list]', 'list')).toBe(now);
			await page.close();
		});

		test('Back to a page shown before a write fetches it again', async () => {
			const { page } = await open(browser);
			const before = await follow(page, '[data-list]', 'list');
			await page.goBack();
			await landedOn(page, 'home');
			const now = await page.evaluate(async () => {
				const response = await fetch('/api/bump', { method: 'POST' });
				return ((await response.json()) as { count: number }).count;
			});
			expect(now).toBe(before + 1);
			await page.goForward();
			await landedOn(page, 'list');
			expect(Number(await page.locator('[data-count]').textContent())).toBe(now);
			await page.close();
		});

		test("a host's default Cache-Control (public, max-age=0, must-revalidate) still lets a click reuse the hover fetch", async () => {
			const { page, arrived, fetched } = await open(browser);
			await fetchedAhead(page, fetched, '[data-edge]', '/edge');
			const now = await bumpElsewhere();
			expect(await follow(page, '[data-edge]', 'edge')).toBe(now - 1);
			expect(arrived.filter((path) => path === '/edge')).toHaveLength(1);
			await page.close();
		});

		test('a page that answers Cache-Control: no-store is fetched again at the click', async () => {
			const { page, fetched } = await open(browser);
			await fetchedAhead(page, fetched, '[data-live]', '/live');
			const now = await bumpElsewhere();
			expect(await follow(page, '[data-live]', 'live')).toBe(now);
			await page.close();
		});

		test('a mouse still over the link that woke the navigation code, through moves that go nowhere, fetches that page ahead', async () => {
			const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
			const { fetched } = trackFetches(page);
			// Page timers wait for the test, so only the pointer wakes the code and only the clock ends the dwell.
			await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
			await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
			await page.goto(`${origin}/`);
			await landedOn(page, 'home');
			const box = (await page.locator('[data-live]').boundingBox())!;
			const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
			await page.mouse.move(x, y);
			await page.waitForFunction(
				() => !(document as { __marklessFragmentWake?: unknown }).__marklessFragmentWake,
			);
			// A move to the same point over the same link, as Chromium sends after a layout, is no reason to stop resting.
			await page.mouse.move(x, y);
			await page.clock.runFor(FRAGMENT_HOVER_DWELL_MS);
			await fetched('/live');
			await page.close();
		});

		test('a page fetched ahead is not shown past its Cache-Control max-age', async () => {
			const { page, fetched } = await open(browser);
			await fetchedAhead(page, fetched, '[data-brief]', '/brief');
			await page.waitForTimeout(1_200);
			const now = await bumpElsewhere();
			expect(await follow(page, '[data-brief]', 'brief')).toBe(now);
			await page.close();
		});
	});
}
