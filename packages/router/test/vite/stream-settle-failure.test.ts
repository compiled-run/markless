import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A streamed @try whose settled content fails to render, on a production build served by its own Nitro server.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-stream-settle-failure-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/stream-settle-failure-app'), root, {
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

test('settled content that fails to render on the server streams its @catch content', async () => {
	const response = await fetch(`${server!.origin}/settle-failure`);
	// The status went out with the shell, before the value settled.
	expect(response.status).toBe(200);
	expect(await response.text()).toContain('<p>failed</p>');
	expect(server!.output()).toContain('MARKLESS_COMPOSED_READ_UNMAPPED');
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}/settle-failure`);
	await expect.poll(() => page.locator('main').innerText()).toBe('failed');
	expect(errors).toEqual([]);
	await page.close();
});

test('only the boundary whose settled content fails to render takes @catch', async () => {
	const html = await (await fetch(`${server!.origin}/settle-failure-pair`)).text();
	expect(html).toContain('<p>broken failed</p>');
	expect(html).toContain('<p id="fine">fine</p>');
	const page = await browser!.newPage();
	await page.goto(`${server!.origin}/settle-failure-pair`);
	await expect.poll(() => page.locator('#broken').innerText()).toBe('broken failed');
	expect(await page.locator('#fine').innerText()).toBe('fine');
	await page.close();
});

test('settled content that fails to render before the shell goes out answers 500', async () => {
	const response = await fetch(`${server!.origin}/settle-failure-inline`);
	expect(response.status).toBe(500);
});
