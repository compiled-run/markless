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

// An async value in a component the page imports, on a production build served by its own Nitro server.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-async-child-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/async-child-app'), root, {
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

async function served(path: string, expected: ReadonlyArray<string>) {
	const html = await (await fetch(`${server!.origin}${path}`)).text();
	expect(expected.filter((text) => !html.includes(`>${text}<`))).toEqual([]);
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	await expect.poll(() => page.locator('main').innerText()).toBe(expected.join('\n'));
	await page.waitForLoadState('networkidle');
	// lib/slow.ts counts every run of the recipe in the browser.
	expect(await page.evaluate(() => (window as { browserRuns?: number }).browserRuns ?? 0)).toBe(
		0,
	);
	expect(errors).toEqual([]);
	await page.close();
}

test('an async value in a component the page imports streams from the server', async () => {
	await served('/async-in-child', ['item 1']);
});

test('each instance of an async component, at any depth, streams its own value', async () => {
	await served('/async-in-children', ['head', 'item 1', 'item 2', 'item 3']);
});
