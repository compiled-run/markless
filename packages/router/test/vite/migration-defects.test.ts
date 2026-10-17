import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// Defects real app ports hit, pinned on a production build served by its own Nitro server in Chromium.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-defects-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/defects-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await chromium.launch();
});

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function open(path: string): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${server!.origin}${path}`);
	return { page, errors };
}

const text = (page: Page, selector: string) => page.locator(selector).textContent();

test('a handler that calls a callback prop runs the rest of its body', async () => {
	const { page, errors } = await open('/callback-body');
	await page.dispatchEvent('[data-body-trigger]', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-body-calls]')).toBe('1');
	await expect.poll(() => text(page, '[data-body-open]')).toBe('open');
	await expect.poll(() => text(page, '[data-body-after]')).toBe('1');
	expect(errors).toEqual([]);
	await page.close();
});

test('a component nested in a component used many times binds handlers to its own instance', async () => {
	const { page, errors } = await open('/rows-menu');
	await page.dispatchEvent('[data-trigger="-2"]', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-2');
	await expect.poll(() => text(page, '[data-open]')).toBe('row');
	await expect.poll(() => text(page, '[data-presses="2"]')).toBe('1');
	await expect.poll(() => text(page, '[data-picked]')).toBe('1');
	await expect.poll(() => page.getAttribute('[data-trigger="-2"]', 'aria-expanded')).toBe('true');
	expect(await text(page, '[data-presses="1"]')).toBe('0');
	await page.dispatchEvent('[data-trigger="-3"]', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-3');
	await expect.poll(() => text(page, '[data-presses="3"]')).toBe('1');
	await expect.poll(() => text(page, '[data-picked]')).toBe('2');
	expect(errors).toEqual([]);
	await page.close();
});

test('a spread-forwarding trigger nested in a component used many times opens its own row', async () => {
	const { page, errors } = await open('/users-table');
	await page.dispatchEvent('#menu-row-actions-1-trigger', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-1');
	await expect.poll(() => text(page, '[data-open]')).toBe('row-actions');
	await expect
		.poll(() => page.getAttribute('#menu-row-actions-1-trigger', 'aria-expanded'))
		.toBe('true');
	expect(await page.getAttribute('#menu-row-actions-0-trigger', 'aria-expanded')).toBe('false');
	await page.dispatchEvent('#menu-row-actions-2-trigger', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-2');
	await page.click('[data-select="-2"]');
	await expect.poll(() => text(page, '[data-select="-2"]')).toBe('on');
	expect(errors).toEqual([]);
	await page.close();
});

test('a pending async handler does not hold later clicks', async () => {
	const { page, errors } = await open('/async-handler');
	await page.click('[data-slow]');
	await expect.poll(() => text(page, '[data-slow-state]')).toBe('waiting');
	await page.click('[data-quick]');
	await page.click('[data-quick]');
	// The slow handler stays pending until the page says so, so only a held queue keeps this at 0.
	await expect.poll(() => text(page, '[data-quick-count]')).toBe('2');
	expect(await text(page, '[data-slow-state]')).toBe('waiting');
	await page.evaluate(() => (globalThis as { __finishSlow?: () => void }).__finishSlow?.());
	await expect.poll(() => text(page, '[data-slow-state]')).toBe('done');
	expect(errors).toEqual([]);
	await page.close();
});

test('@for over a computed list from a module function updates in the browser', async () => {
	const { page, errors } = await open('/computed-list');
	await expect.poll(() => page.locator('[data-plain] li').count()).toBe(3);
	await page.fill('[data-needle]', 'a');
	await expect
		.poll(() => page.locator('[data-plain] li').allTextContents())
		.toEqual(['Ada', 'Brian']);
	await expect
		.poll(() => page.locator('[data-components] li').allTextContents())
		.toEqual(['Ada', 'Brian']);
	await page.fill('[data-needle]', 'cl');
	await expect.poll(() => page.locator('[data-plain] li').allTextContents()).toEqual(['Cleo']);
	await expect
		.poll(() => page.locator('[data-components] li').allTextContents())
		.toEqual(['Cleo']);
	expect(errors).toEqual([]);
	await page.close();
});

test('a text hole beside an element keeps the element when it updates', async () => {
	const { page, errors } = await open('/text-beside');
	await page.click('[data-page]');
	await expect.poll(() => text(page, '[data-page]')).toMatch(/2\s*$/);
	expect(await text(page, '[data-page] .sr-only')).toBe('Go to page 2');
	await page.click('[data-page]');
	await expect.poll(() => text(page, '[data-page] .sr-only')).toBe('Go to page 3');
	expect((await text(page, '[data-page]'))?.trim()).toMatch(/^Go to page 3\s*3$/);
	expect(errors).toEqual([]);
	await page.close();
});

test('@for over a prop adds component rows, and row attributes follow their items', async () => {
	const { page, errors } = await open('/list-rows');
	await page.click('[data-add-title]');
	await expect
		.poll(() => page.locator('[data-prop-rows] li').allTextContents())
		.toEqual(['X', 'E1']);
	await page.click('[data-flip]');
	await expect
		.poll(() =>
			page
				.locator('[data-attr-rows] li')
				.evaluateAll((items) => items.map((item) => item.getAttribute('data-on'))),
		)
		.toEqual(['yes', 'yes']);
	await page.click('[data-reverse]');
	await expect
		.poll(() => page.locator('[data-attr-rows] li').allTextContents())
		.toEqual(['b', 'a']);
	expect(errors).toEqual([]);
	await page.close();
});
