import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// The reader's first gesture on a fresh page lands while the page's code is still loading: every script is held
// until the gesture is over, and the gesture must then do exactly what it does on a page whose code is loaded.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-first-press-built-'));
	await cp(resolve(import.meta.dirname, '../fixtures/first-press-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

type Held = { readonly page: Page; readonly errors: string[]; release(): void; close(): Promise<void> };

/** A fresh page whose scripts are all held until `release`; it resolves once the inline boot listens. */
async function heldPage(options: { readonly touch?: true } = {}): Promise<Held> {
	const context: BrowserContext = await browser!.newContext({
		viewport: { width: 800, height: 700 },
		...(options.touch && { hasTouch: true, isMobile: true }),
	});
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let release!: () => void;
	const released = new Promise<void>((done) => (release = done));
	await page.route(
		(url) => url.pathname.endsWith('.js'),
		async (route) => {
			await released;
			await route.continue();
		},
	);
	await page.goto(`${server!.origin}/`, { waitUntil: 'commit' });
	await page.waitForFunction(
		() =>
			!!(document.querySelector('[data-async-container]') as { __marklessListen?: unknown } | null)
				?.__marklessListen,
	);
	expect(await loaded(page)).toBe(false);
	return { page, errors, release, close: () => context.close() };
}

// The page's code has not run while nothing but the inline boot executed: no handler wrote yet.
const loaded = (page: Page) =>
	page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('.js')));

const text = (page: Page, attribute: string) =>
	page.evaluate((name) => document.querySelector(`[${name}]`)!.textContent, attribute);

async function centre(page: Page, selector: string): Promise<[number, number]> {
	const box = (await page.locator(selector).boundingBox())!;
	return [box.x + box.width / 2, box.y + box.height / 2];
}

test('a first click runs a handler whose imported helper writes state, and the write reaches the page', async () => {
	const { page, errors, release, close } = await heldPage();
	const [x, y] = await centre(page, '[data-tap]');
	await page.mouse.click(x, y);
	release();
	await expect.poll(() => text(page, 'data-taps')).toBe('1');
	expect(await text(page, 'data-tap-seen')).toMatch(/^click tap tap /);
	expect(await page.locator('[data-tap]').getAttribute('class')).toBe('pressed');
	expect(await page.locator('[data-tap]').getAttribute('data-held')).toBeNull();
	expect(errors).toEqual([]);
	await close();
});

test('a fast first drag keeps its pointer capture: every move and the release reach the element that captured', async () => {
	const { page, errors, release, close } = await heldPage();
	const [x, y] = await centre(page, '[data-knob] rect');
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let step = 1; step <= 5; step++) await page.mouse.move(x, y - step * 20);
	await page.mouse.up();
	release();
	await expect
		.poll(() => text(page, 'data-drag-log'))
		.toBe('pointerdown knob knob-face 1 | pointerup knob knob 1 captured=true');
	expect(await page.locator('[data-knob]').getAttribute('data-dragging')).toBe('no');
	expect(await text(page, 'data-moves')).toBe('5');
	expect(await text(page, 'data-value')).toBe('10');
	expect(errors).toEqual([]);
	await close();
});

test('a drag whose code arrives mid-gesture keeps the moves sent before it and captures the rest natively', async () => {
	const { page, errors, release, close } = await heldPage();
	const [x, y] = await centre(page, '[data-knob] rect');
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let step = 1; step <= 3; step++) await page.mouse.move(x, y - step * 20);
	release();
	await expect.poll(() => text(page, 'data-moves')).toBe('3');
	for (let step = 4; step <= 6; step++) await page.mouse.move(x, y - step * 20);
	await page.mouse.up();
	await expect.poll(() => text(page, 'data-drag-log')).toMatch(/\| pointerup knob knob 1 captured=true$/);
	expect(await page.locator('[data-knob]').getAttribute('data-dragging')).toBe('no');
	expect(await text(page, 'data-moves')).toBe('6');
	expect(await text(page, 'data-value')).toBe('12');
	expect(errors).toEqual([]);
	await close();
});

test('a first touch drag keeps its capture although the finger has lifted before its handler runs', async () => {
	const { page, errors, release, close } = await heldPage({ touch: true });
	const [x, y] = await centre(page, '[data-knob] rect');
	const session = await page.context().newCDPSession(page);
	const touch = (type: string, at?: number) =>
		session.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: at === undefined ? [] : [{ x, y: y - at * 20, id: 7 }],
		});
	await touch('touchStart', 0);
	for (let step = 1; step <= 5; step++) await touch('touchMove', step);
	await touch('touchEnd');
	release();
	await expect.poll(() => text(page, 'data-drag-log')).toMatch(/\| pointerup knob knob \d+ captured=true$/);
	expect(await page.locator('[data-knob]').getAttribute('data-dragging')).toBe('no');
	expect(await text(page, 'data-value')).toBe('10');
	expect(errors).toEqual([]);
	await close();
});

test('a first key reaches a native button, a focusable SVG group and a role=slider div with its key and target', async () => {
	for (const [focus, key, output, logged] of [
		['[data-key-button]', 'a', 'data-button-keys', 'keydown key-button key-button a;'],
		['[data-knob]', 'ArrowUp', 'data-group-keys', 'keydown knob knob ArrowUp;'],
		['[data-slider]', 'ArrowRight', 'data-slider-keys', 'keydown slider slider ArrowRight;'],
	] as const) {
		const { page, errors, release, close } = await heldPage();
		await page.evaluate((selector) => (document.querySelector(selector) as HTMLElement).focus(), focus);
		await page.keyboard.press(key);
		release();
		await expect.poll(() => text(page, output)).toBe(logged);
		expect(errors).toEqual([]);
		await close();
	}
});

test('a first Space on a role=slider div is kept from scrolling the page, and a second key follows it in order', async () => {
	const { page, errors, release, close } = await heldPage();
	await page.focus('[data-slider]');
	await page.keyboard.press(' ');
	await page.keyboard.press('ArrowRight');
	release();
	await expect.poll(() => text(page, 'data-slider-keys')).toBe(
		'keydown slider slider  ;keydown slider slider ArrowRight;',
	);
	expect(await page.evaluate(() => scrollY)).toBe(0);
	expect(await page.locator('[data-slider]').getAttribute('aria-valuenow')).toBe('2');
	expect(errors).toEqual([]);
	await close();
});
