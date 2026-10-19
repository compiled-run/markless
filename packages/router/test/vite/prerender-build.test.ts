import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// Nitro builds its prerenderer separately from the Vite services; a page it cannot reach prerenders as a 404.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];
afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test('routes with a prerender route rule are written as their page HTML at build', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-prerender-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/prerender-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		nitro: { routeRules: { '/': { prerender: true }, '/guide': { prerender: true } } },
		plugins: [markless(), router()],
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();

	const publicDir = join(root, '.output/public');
	const home = await readFile(join(publicDir, 'index.html'), 'utf8');
	expect(home).toContain('data-page="home"');
	expect(home).toContain('Prerendered home');
	expect(home).toContain('<title>Prerender app</title>');
	const guide = await readFile(join(publicDir, 'guide/index.html'), 'utf8');
	expect(guide).toContain('data-page="guide"');
	expect(guide).toContain('Prerendered guide');

	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	cleanups.push(() => server.close());
	const browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(server.origin + '/');
	await page.click('[data-click]');
	await expect.poll(() => page.textContent('[data-click]')).toBe('1');
	await page.click('[data-to-guide]');
	await page.waitForSelector('[data-page="guide"]');
	expect(new URL(page.url()).pathname).toBe('/guide');
	expect(errors).toEqual([]);
}, 180_000);
