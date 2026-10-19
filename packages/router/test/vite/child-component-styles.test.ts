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

// A page that keeps no <style> of its own still links the <style> blocks of the components it renders.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let origin = '';
let close = () => {};
let browser: Browser;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-child-style-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/child-style-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		});
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
}, 120_000);

afterAll(async () => {
	await browser?.close();
	close();
	if (root) await rm(root, { recursive: true, force: true });
});

test('the <style> blocks of a static child and a stateful child both reach the page', async () => {
	const page = await browser.newPage();
	await page.goto(`${origin}/`);
	const color = (selector: string) =>
		page.locator(selector).evaluate((element) => getComputedStyle(element).color);
	expect(await color('[data-banner]')).toBe('rgb(11, 22, 33)');
	expect(await color('[data-counter]')).toBe('rgb(44, 55, 66)');
	await page.close();
});

test('a page with no client code still links the <style> blocks of its static children', async () => {
	const page = await browser.newPage();
	await page.goto(`${origin}/static`);
	const color = (selector: string) =>
		page.locator(selector).evaluate((element) => getComputedStyle(element).color);
	expect(await color('[data-hero]')).toBe('rgb(77, 88, 99)');
	expect(await color('[data-banner]')).toBe('rgb(11, 22, 33)');
	expect(await color('[data-footer]')).toBe('rgb(101, 102, 103)');
	expect(await page.locator('[data-page="static"] style').count()).toBe(0);
	await page.close();
});
