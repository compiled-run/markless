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

// A child declared beside its parent, whose async value and attributes read a prop, fails a search
// and retries it, on a production build: loaded as a document and reached through a link.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-child-async-catch-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/child-async-catch-app'), root, {
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

const items = (page: Page) => page.locator('li').allInnerTexts();

async function searchFailsThenRetries(page: Page, errors: ReadonlyArray<string>) {
	await expect.poll(() => items(page)).toHaveLength(7);
	await page.waitForLoadState('networkidle');
	await page.locator('input').pressSequentially('ap', { delay: 100 });
	await expect.poll(() => items(page)).toEqual(['apple', 'apricot', 'grape']);
	await expect.poll(() => page.locator('ul').getAttribute('style')).toBe('opacity: 1');
	await page.locator('input').fill('');
	await expect.poll(() => items(page)).toHaveLength(7);
	await page.locator('input').pressSequentially('berry!', { delay: 100 });
	await expect.poll(() => page.locator('main p').allInnerTexts()).toEqual(['Search is down']);
	expect(await page.locator('ul').count()).toBe(0);
	await expect.poll(() => page.locator('[aria-busy="true"]').count()).toBe(0);
	await page.getByText('Try again').click();
	await expect.poll(() => items(page)).toEqual(['blueberry']);
	await expect.poll(() => page.locator('ul').getAttribute('style')).toBe('opacity: 1');
	await expect.poll(() => page.locator('[aria-busy="true"]').count()).toBe(0);
	expect(errors).toEqual([]);
}

async function open() {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	return { page, errors };
}

test('loaded as a document: a failed search shows @catch, and Try again recovers', async () => {
	const { page, errors } = await open();
	await page.goto(`${server!.origin}/search`);
	await searchFailsThenRetries(page, errors);
	await page.close();
});

test('reached through a link: a failed search shows @catch, and Try again recovers', async () => {
	const { page, errors } = await open();
	await page.goto(`${server!.origin}/`);
	await page.waitForLoadState('networkidle');
	await page.getByText('Search').click();
	await expect.poll(() => page.url()).toBe(`${server!.origin}/search`);
	await searchFailsThenRetries(page, errors);
	await page.close();
});
