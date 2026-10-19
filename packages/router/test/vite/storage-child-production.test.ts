import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A page with no storage() of its own renders two components that share one
// module-scope storage() cell, built for production and served by its real server.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];
let origin = '';
let browser: Browser;

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-storage-child-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/storage-child-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	// Vitest's NODE_ENV=test leaves import.meta.env.DEV true in a build.
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
	cleanups.push(() => server.close());
	origin = server.origin;
	browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
}, 240_000);

afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test('a storage() cell declared in a child module resumes, updates both readers, and survives a reload', async () => {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${origin}/`);
	expect(await page.textContent('[data-first-count]')).toBe('0');

	await page.click('[data-first]');
	await expect.poll(() => page.textContent('[data-first-count]')).toBe('1');
	await expect.poll(() => page.textContent('[data-second-count]')).toBe('1');
	await page.click('[data-second]');
	await expect.poll(() => page.textContent('[data-second-count]')).toBe('2');
	expect(await page.evaluate(() => localStorage.getItem('persist-demo-count'))).toBe('2');

	await page.reload();
	await expect.poll(() => page.textContent('[data-first-count]')).toBe('2');
	await page.click('[data-first]');
	await expect.poll(() => page.textContent('[data-second-count]')).toBe('3');
	expect(errors).toEqual([]);
	await page.close();
});
