import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// The press that wakes a page stops propagating where a native listener would, on a production build in Chromium.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-first-press-propagation-'));
	await cp(resolve(import.meta.dirname, '../fixtures/first-press-propagation-app'), root, {
		recursive: true,
	});
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
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function open(path: string): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	await page.waitForLoadState('load');
	return { page, errors };
}

test('the first click honours stopPropagation like a native listener', async () => {
	const { page, errors } = await open('/first-click-propagation');
	await page.click('.inner');
	await expect.poll(() => page.locator('.probe').textContent()).toBe('inner 1 outer 0');
	await page.click('.inner');
	await expect.poll(() => page.locator('.probe').textContent()).toBe('inner 2 outer 0');
	await page.click('.probe');
	await expect.poll(() => page.locator('.probe').textContent()).toBe('inner 2 outer 1');
	expect(errors).toEqual([]);
	await page.close();
});

test('the first press on a link that stops propagation runs none of its ancestors', async () => {
	const { page, errors } = await open('/first-press-stops');
	await page.click('.open');
	await expect.poll(() => page.locator('.seen').textContent()).toBe('row 0 0');
	expect(new URL(page.url()).hash).toBe('');
	await page.click('.row span');
	await expect.poll(() => page.locator('.seen').textContent()).toBe('row 1 1');
	expect(errors).toEqual([]);
	await page.close();
});

test('the first press on a row button that stops propagation leaves the list handler alone', async () => {
	const { page, errors } = await open('/first-press-row');
	await page.click('.pick-2');
	await expect.poll(() => page.locator('.seen').textContent()).toBe('pear 0');
	await page.click('.pick-1');
	await expect.poll(() => page.locator('.seen').textContent()).toBe('apple 0');
	expect(errors).toEqual([]);
	await page.close();
});
