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

// '#/' addresses rendered in the browser, on a production build served by its own Nitro server in Chromium.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-hash-route-settle-'));
	await cp(resolve(import.meta.dirname, '../fixtures/hash-route-settle-app'), root, {
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

test('a #/ address from a hash-routed app lands on its route and later hash changes route too', async () => {
	const { page, errors } = await open('/#/story/1');
	await expect.poll(() => page.locator('.page').textContent()).toBe('story 1');
	await page.evaluate(() => (location.hash = '#/story/2'));
	await expect.poll(() => page.locator('.page').textContent()).toBe('story 2');
	await page.evaluate(() => (location.hash = '#/user/ada'));
	await expect.poll(() => page.locator('.page').textContent()).toBe('user value ada');
	await page.goBack();
	await expect.poll(() => page.locator('.page').textContent()).toBe('story 2');
	expect(errors).toEqual([]);
	await page.close();
});

test('a #/ route change announces the first heading when the document has no title, and nothing when the title stays the same', async () => {
	const { page, errors } = await open('/#/story/1');
	await expect.poll(() => page.locator('.page').textContent()).toBe('story 1');
	const announcement = () =>
		page.evaluate(
			() =>
				document
					.querySelector('markless-route-announcer')
					?.shadowRoot?.querySelector('[role="alert"]')?.textContent ?? null,
		);
	expect(await announcement()).toBeNull();
	await page.evaluate(() => {
		document.title = '';
		location.hash = '#/story/2';
	});
	await expect.poll(() => page.locator('.page').textContent()).toBe('story 2');
	await expect.poll(announcement).toBe('story 2');
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				document.title = 'Stories';
				document
					.querySelector('markless-route-announcer')!
					.shadowRoot!.querySelector('[role="alert"]')!.textContent = '';
				navigation.addEventListener('navigatesuccess', () => done(), { once: true });
				location.hash = '#/story/4';
			}),
	);
	expect(await page.locator('.page').textContent()).toBe('story 4');
	expect(await announcement()).toBe('');
	expect(errors).toEqual([]);
	await page.close();
});
