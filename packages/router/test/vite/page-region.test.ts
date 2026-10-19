import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// The page's markup lands where its author put it: a document whose body holds only {children}
// serves the page as body's own children, so the site's `body > footer` CSS keeps matching on
// the landing, after a fragment swap and after a client render.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');

const documentWith = (body: string) =>
	[
		"import type { Children } from '@markless/core';",
		"import { Html } from '@markless/router';",
		'export default function Document({ children }: { readonly children?: Children }) @{',
		'\t<Html>',
		'\t\t<head><meta charset="utf-8" /><link rel="stylesheet" href="/site.css" /></head>',
		`\t\t${body}`,
		'\t</Html>',
		'}',
	].join('\n');

const chromeDocument = documentWith(
	'<body>{children}<aside data-chrome><input data-chrome-field value="" /></aside></body>',
);
const leadingDocument = documentWith('<body><nav data-chrome>Site</nav>{children}</body>');

type App = { readonly origin: string; readonly close: () => Promise<void> };

async function serve(
	name: string,
	files: Record<string, string> = {},
	prerender = false,
): Promise<App> {
	const root = await mkdtemp(join(tmpdir(), `markless-${name}-`));
	await cp(resolve(import.meta.dirname, '../fixtures/page-region-app'), root, {
		recursive: true,
	});
	for (const [file, source] of Object.entries(files)) await writeFile(join(root, file), source);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		...(prerender && { nitro: { routeRules: { '/': { prerender: true } } } }),
		plugins: [markless(), router()],
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
	let server: BuiltServer;
	try {
		server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
			env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
		});
	} catch (error) {
		await rm(root, { recursive: true, force: true });
		throw error;
	}
	return {
		origin: server.origin,
		close: async () => {
			server.close();
			await rm(root, { recursive: true, force: true });
		},
	};
}

let plain: App;
let chrome: App;
let leading: App;
let prerendered: App;

beforeAll(async () => {
	const chromeFiles = {
		'document.tsrx': chromeDocument,
		'public/site.css':
			'body > header:first-child { color: rgb(1, 2, 3); }\nheader + main { color: rgb(4, 5, 6); }\nbody > footer { color: rgb(7, 8, 9); }\nfooter ~ aside { color: rgb(10, 11, 12); }\n',
	};
	[plain, chrome, leading, prerendered] = await Promise.all([
		serve('page-region'),
		serve('page-region-chrome', chromeFiles),
		serve('page-region-leading', { 'document.tsrx': leadingDocument }),
		serve('page-region-prerendered', chromeFiles, true),
	]);
}, 240_000);

afterAll(async () => {
	await Promise.all(
		[plain, chrome, leading, prerendered].filter(Boolean).map((app) => app.close()),
	);
});

type Opened = { readonly page: Page; readonly errors: string[]; readonly requests: string[] };

async function open(browser: Browser, url: string): Promise<Opened> {
	const page = await browser.newPage();
	const errors: string[] = [];
	const requests: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('request', (request) => {
		const requested = new URL(request.url());
		const fragment = fragmentPageUrl(requested);
		requests.push(`${(fragment ?? requested).pathname}${fragment ? ' fragment' : ''}`);
	});
	await page.goto(url);
	return { page, errors, requests };
}

const landedOn = (page: Page, name: string) =>
	page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);

const color = (page: Page, selector: string) =>
	page.locator(selector).evaluate((element) => getComputedStyle(element).color);

// What the site's own CSS sees: body's element children, framework scripts aside.
const bodyShape = (page: Page) =>
	page.evaluate(() =>
		[...document.body.children]
			.map((element) => element.localName)
			.filter((name) => name !== 'script' && name !== 'template'),
	);

async function expectAuthoredShape(page: Page, trailing: readonly string[] = []) {
	expect(await bodyShape(page)).toEqual(['header', 'main', 'footer', ...trailing]);
	expect(await page.locator('div[data-async-container]').count()).toBe(0);
	expect(await page.locator('[data-markless-route-holder]').count()).toBe(0);
	expect(await color(page, 'header')).toBe('rgb(1, 2, 3)');
	expect(await color(page, 'main')).toBe('rgb(4, 5, 6)');
	expect(await color(page, 'footer')).toBe('rgb(7, 8, 9)');
}

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`page region (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await browserType.launch();
		});
		afterAll(async () => {
			await browser?.close();
		});

		test('the landing serves the page as body children and resumes', async () => {
			const { page, errors } = await open(browser, `${plain.origin}/`);
			await expectAuthoredShape(page);
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a fragment swap keeps the authored shape and each page resumes once', async () => {
			const { page, errors, requests } = await open(browser, `${plain.origin}/`);
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await expectAuthoredShape(page);
			expect(await page.locator('[data-footer]').textContent()).toBe('other footer');
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			await page.locator('[data-nav="home"]').click();
			await landedOn(page, 'home');
			await expectAuthoredShape(page);
			await page.locator('[data-bump]').click();
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('2');
			expect(requests).toContain('/other fragment');
			expect(requests).toContain('/ fragment');
			expect(requests.filter((request) => request === '/')).toHaveLength(1);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a client render of a hash route keeps the authored shape', async () => {
			const { page, errors } = await open(browser, `${plain.origin}/#/other`);
			await landedOn(page, 'other');
			await expectAuthoredShape(page);
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('document content after the page stays in place and survives a swap', async () => {
			const { page, errors } = await open(browser, `${chrome.origin}/`);
			await expectAuthoredShape(page, ['aside']);
			expect(await color(page, 'aside')).toBe('rgb(10, 11, 12)');
			await page.locator('[data-chrome-field]').fill('kept');
			await page.evaluate(() => {
				(window as { __chrome?: Element }).__chrome =
					document.querySelector('[data-chrome]')!;
			});
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('1');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await expectAuthoredShape(page, ['aside']);
			expect(
				await page.evaluate(
					() =>
						(window as { __chrome?: Element }).__chrome ===
						document.querySelector('[data-chrome]'),
				),
			).toBe(true);
			expect(await page.locator('[data-chrome-field]').inputValue()).toBe('kept');
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a prerendered page keeps the authored shape and resumes', async () => {
			const { page, errors, requests } = await open(browser, `${prerendered.origin}/`);
			await expectAuthoredShape(page, ['aside']);
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('1');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await expectAuthoredShape(page, ['aside']);
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			expect(requests).toContain('/other fragment');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('document content before the page keeps the page in its own container', async () => {
			const { page, errors } = await open(browser, `${leading.origin}/`);
			expect(await bodyShape(page)).toEqual(['nav', 'div']);
			expect(await page.locator('body > div[data-async-container] > header').count()).toBe(1);
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('1');
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});
	});
}
