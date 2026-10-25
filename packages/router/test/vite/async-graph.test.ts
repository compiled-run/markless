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

// Async values feeding shared fields, derived lists and streamed content, on a production build in Chromium.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-async-graph-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/async-graph-app'), root, {
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
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function open(
	path: string,
	beforeLoad?: (page: Page) => void,
): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	beforeLoad?.(page);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${server!.origin}${path}`);
	return { page, errors };
}

const text = (page: Page, selector: string) => page.locator(selector).textContent();
const items = (page: Page) => page.locator('[data-list] li').allTextContents();

test('an async value that reads a page-scoped shared field loads and reruns when it changes', async () => {
	const { page, errors } = await open('/shared-async');
	await expect.poll(() => text(page, 'main')).toContain('loaded v0');
	await page.click('[data-bump]');
	await expect.poll(() => text(page, '[data-text]')).toBe('loaded v1');
	expect(await page.locator('[data-caught]').count()).toBe(0);
	expect(errors).toEqual([]);
	await page.close();
});

test('a sync value over an async one that reads a page-scoped shared field updates', async () => {
	const { page, errors } = await open('/shared-sync');
	await expect.poll(() => text(page, 'main')).toContain('loaded+one+two #1');
	await page.click('[data-step]');
	await expect.poll(() => text(page, '[data-label]')).toBe('loaded+one+two #2');
	expect(errors).toEqual([]);
	await page.close();
});

test('a sync value over a pending async one waits for it after an in-place arrival', async () => {
	const { page, errors } = await open('/start');
	await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
	await page.click('[data-to-derived]');
	await expect
		.poll(() => page.locator('[data-derived] li').allTextContents())
		.toEqual(['LOADED', 'ALPHA', 'BETA']);
	expect(errors).toEqual([]);
	await page.close();
});

for (const name of ['empty-attribute-rows', 'empty-with-catch']) {
	test(`a derived list that empties shows no rows and fills again (${name})`, async () => {
		const { page, errors } = await open(`/${name}`);
		await expect.poll(() => items(page)).toEqual(['loaded', 'alpha', 'beta']);
		await page.fill('[data-filter]', 'zz');
		await expect.poll(() => items(page)).toEqual([]);
		await page.fill('[data-filter]', 'al');
		await expect.poll(() => items(page)).toEqual(['alpha']);
		expect(errors).toEqual([]);
		await page.close();
	});
}

test('a derived list shows its @empty arm while empty and its rows after', async () => {
	const { page, errors } = await open('/empty-arm');
	await expect.poll(() => items(page)).toEqual(['loaded', 'alpha', 'beta']);
	await page.fill('[data-filter]', 'zz');
	await expect.poll(() => items(page)).toEqual(['none']);
	await page.fill('[data-filter]', 'al');
	await expect.poll(() => items(page)).toEqual(['alpha']);
	expect(errors).toEqual([]);
	await page.close();
});

for (const name of ['optional-and-whole', 'plain-and-whole']) {
	test(`a member read beside the whole async value streams in (${name})`, async () => {
		const response = await fetch(`${server!.origin}/${name}`);
		expect(await response.text()).toContain('</html>');
		const { page, errors } = await open(`/${name}`);
		await expect.poll(() => text(page, '[data-heading]')).toBe('loaded json');
		expect(await text(page, '[data-json]')).toBe(JSON.stringify({ text: 'loaded json' }));
		expect(errors).toEqual([]);
		await page.close();
	});
}
