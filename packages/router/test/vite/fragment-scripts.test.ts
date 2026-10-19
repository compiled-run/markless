import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// A page swapped in place runs its scripts as a fresh load of it would: head additions first,
// classic scripts in document order, then deferred and module scripts, then its load listeners.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let origin = '';
let close: (() => Promise<void>) | undefined;

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-fragment-scripts-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-scripts-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = async () => {
		server.close();
		await rm(root, { recursive: true, force: true });
	};
}, 240_000);

afterAll(async () => {
	await close?.();
});

type Session = { readonly page: Page; readonly errors: string[]; readonly documents: string[] };

async function open(browser: Browser, path: string): Promise<Session> {
	const page = await browser.newPage();
	const errors: string[] = [];
	const documents: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (request.resourceType() === 'document' && !fragmentPageUrl(url))
			documents.push(url.pathname);
	});
	await page.goto(origin + path, { waitUntil: 'load' });
	return { page, errors, documents };
}

const read = (page: Page, name: string) =>
	page.evaluate((key) => (window as unknown as Record<string, unknown>)[key], name);

const landedOn = (page: Page, name: string) =>
	page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);

const freshLoadOrder = [
	'head-inline',
	'library',
	'inline:Hello reader',
	'late',
	'after-late:late ready',
	'define',
	'deferred',
	'module-inline',
	'module-src',
	'DOMContentLoaded',
	'load',
];

async function settled(page: Page): Promise<unknown> {
	await expect.poll(() => read(page, '__order')).toContain('load');
	await expect.poll(() => read(page, '__asyncRuns')).toBe(1);
	return read(page, '__order');
}

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`scripts on a page swapped in place (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await browserType.launch();
		});
		afterAll(async () => {
			await browser?.close();
		});

		test('a full load of the page runs its scripts in the order the swap must match', async () => {
			const { page, errors } = await open(browser, '/library');
			expect(await settled(page)).toEqual(freshLoadOrder);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('the head library, body scripts and inline handlers work after an in-place swap', async () => {
			const { page, errors, documents } = await open(browser, '/');
			expect(await read(page, '__sharedRuns')).toBe(1);
			await page.locator('[data-go="library"]').click();
			await landedOn(page, 'library');
			expect(await settled(page)).toEqual(freshLoadOrder);
			expect(documents).toEqual(['/']);
			expect(await page.title()).toBe('Library page');
			expect(await page.locator('[data-greeting]').textContent()).toBe('Hello reader');
			await page.locator('[data-onclick]').click();
			expect(await page.locator('[data-tapped]').textContent()).toBe('tapped Hello button');
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			// The same external file on both pages, and the shell's own, already ran on this document.
			expect(await read(page, '__sharedRuns')).toBe(1);
			expect(await read(page, '__shellRuns')).toBe(1);
			expect(await read(page, '__libraryRuns')).toBe(1);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('coming back to the page reruns its inline scripts, never a file this document already ran', async () => {
			const { page, errors, documents } = await open(browser, '/');
			await page.locator('[data-go="library"]').click();
			await landedOn(page, 'library');
			await settled(page);
			await page.locator('[data-go="plain"]').click();
			await landedOn(page, 'plain');
			await page.locator('[data-go="library"]').click();
			await landedOn(page, 'library');
			await expect.poll(() => read(page, '__inlineRuns')).toBe(2);
			expect(await page.locator('[data-greeting]').textContent()).toBe('Hello reader');
			await page.locator('[data-onclick]').click();
			expect(await page.locator('[data-tapped]').textContent()).toBe('tapped Hello button');
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			for (const counter of [
				'__libraryRuns',
				'__sharedRuns',
				'__shellRuns',
				'__moduleRuns',
				'__asyncRuns',
			])
				expect([counter, await read(page, counter)]).toEqual([counter, 1]);
			expect(documents).toEqual(['/']);
			expect(errors).toEqual([]);
			await page.close();
		});
	});
}
