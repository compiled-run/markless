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
