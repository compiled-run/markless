import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A page-scoped shared() whose factory calls an imported function on an imported const, used by its own module and by a page.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let origin = '';
let close: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-shared-import-'));
	await cp(resolve(import.meta.dirname, '../fixtures/shared-import-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(resolve(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		const builder = await createBuilder({ root, configFile: false, logLevel: 'silent', plugins: [markless(), router()] });
		await builder.buildApp();
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = () => server.close();
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	close?.();
	if (root) await rm(root, { recursive: true, force: true });
});

const shown = (page: import('@playwright/test').Page) =>
	page.evaluate(() => [document.querySelector('[data-v]')?.textContent, document.querySelector('[data-page]')?.textContent]);

test('the server renders the factory value in both modules', async () => {
	const response = await fetch(origin);
	expect(response.status).toBe(200);
	const html = await response.text();
	expect(html).toMatch(/data-v[^>]*>50</);
	expect(html).toMatch(/data-page[^>]*>50</);
});

test('the resumed page writes the shared state from either module', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await page.goto(origin);
	await page.click('[data-bump]');
	await expect.poll(() => shown(page)).toEqual(['52', '52']);
	expect(errors).toEqual([]);
	await page.close();
});

test('a client navigation renders the page in the browser with the factory value', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await page.goto(`${origin}/other`);
	await page.click('[data-home]');
	await expect.poll(() => shown(page)).toEqual(['50', '50']);
	await page.click('[data-bump]');
	await expect.poll(() => shown(page)).toEqual(['52', '52']);
	expect(errors).toEqual([]);
	await page.close();
});
