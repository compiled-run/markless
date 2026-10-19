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
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

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
// The common layout: site chrome before and after the page, in the same element.
const leadingFiles = {
	'document.tsrx': documentWith(
		'<body><header data-site><a href="/" data-nav="home">Home</a><a href="/other" data-nav="other">Other</a><a href="/slow" data-nav="slow">Slow</a><button type="button" data-site-button>Menu</button></header>{children}<footer data-site-footer>Site footer</footer></body>',
	),
	'pages/index.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Home() @{',
		'\tlet count = state(0);',
		'\t<main data-page="home"><button type="button" data-bump onClick={() => count++}>Bump</button><output data-count>{count}</output></main>',
		'\t<aside data-page-aside>home aside</aside>',
		'}',
	].join('\n'),
	'pages/other.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Other() @{',
		'\tlet taps = state(0);',
		'\t<main data-page="other"><button type="button" data-tap onClick={() => taps++}>Tap</button><output data-taps>{taps}</output></main>',
		'}',
	].join('\n'),
	'pages/slow.tsrx': [
		"import { computed, state } from '@markless/core';",
		'export default function Slow() @{',
		'\tlet taps = state(0);',
		'\tconst report = computed(async () => {',
		'\t\tawait new Promise((resolve) => setTimeout(resolve, 300));',
		"\t\treturn { text: 'report ready' };",
		'\t});',
		'\t<main data-page="slow">',
		'\t\t<button type="button" data-tap onClick={() => taps++}>Taps {taps}</button>',
		'\t\t@try {',
		'\t\t\t<p data-settled>{report.text} <button type="button" data-settled-tap onClick={() => taps++}>more</button></p>',
		'\t\t} @pending {',
		'\t\t\t<p data-pending>loading report</p>',
		'\t\t} @catch {',
		'\t\t\t<p data-failed>report failed</p>',
		'\t\t}',
		'\t\t<output data-taps>{taps}</output>',
		'\t</main>',
		'}',
	].join('\n'),
	'public/site.css':
		'body > header:first-child { color: rgb(1, 2, 3); }\nheader + main { color: rgb(4, 5, 6); }\nbody > main { background-color: rgb(9, 9, 9); }\nbody > footer:last-of-type { color: rgb(7, 8, 9); }\n',
};

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
		serve('page-region-leading', leadingFiles),
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
			browser = await launchBrowser(browserType);
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

		// What the site's CSS sees around the page: the document's header first, its footer last.
		async function expectLeadingShape(page: Page, pageElements: readonly string[]) {
			expect(await bodyShape(page)).toEqual(['header', ...pageElements, 'footer']);
			expect(await page.locator('div[data-async-container]').count()).toBe(0);
			expect(await page.locator('[data-markless-route-holder]').count()).toBe(0);
			expect(await page.locator('body > main').count()).toBe(1);
			expect(await color(page, 'header[data-site]')).toBe('rgb(1, 2, 3)');
			expect(await color(page, 'main')).toBe('rgb(4, 5, 6)');
			expect(
				await page
					.locator('main')
					.evaluate((element) => getComputedStyle(element).backgroundColor),
			).toBe('rgb(9, 9, 9)');
			expect(await color(page, 'footer[data-site-footer]')).toBe('rgb(7, 8, 9)');
		}

		const markSiteChrome = (page: Page) =>
			page.evaluate(() => {
				const site = window as { __header?: Element; __menu?: number };
				site.__header = document.querySelector('[data-site]')!;
				site.__menu = 0;
				document
					.querySelector('[data-site-button]')!
					.addEventListener('click', () => site.__menu!++);
			});

		const siteChromeKept = (page: Page) =>
			page.evaluate(() => {
				const site = window as { __header?: Element; __menu?: number };
				(document.querySelector('[data-site-button]') as HTMLElement).click();
				return site.__header === document.querySelector('[data-site]') && site.__menu === 1;
			});

		test('document content before the page leaves the page as body children and resumes', async () => {
			const { page, errors } = await open(browser, `${leading.origin}/`);
			await expectLeadingShape(page, ['main', 'aside']);
			await page.locator('[data-bump]').click();
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('2');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a fragment swap replaces only the page between the document content', async () => {
			const { page, errors, requests } = await open(browser, `${leading.origin}/`);
			await markSiteChrome(page);
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			await expectLeadingShape(page, ['main']);
			expect(await page.locator('[data-page-aside]').count()).toBe(0);
			expect(await siteChromeKept(page)).toBe(true);
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			await page.locator('[data-nav="home"]').click();
			await landedOn(page, 'home');
			await expectLeadingShape(page, ['main', 'aside']);
			await page.locator('[data-bump]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('1');
			expect(requests).toContain('/other fragment');
			expect(requests.filter((request) => request === '/')).toHaveLength(1);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a streamed @pending page between document content settles and resumes', async () => {
			const { page, errors } = await open(browser, `${leading.origin}/slow`);
			await expectLeadingShape(page, ['main']);
			await page.locator('[data-settled]').waitFor();
			await page.locator('[data-tap]').click();
			await page.locator('[data-settled-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('2');
			expect(await bodyShape(page)).toEqual(['header', 'main', 'footer']);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a fragment swap to a streamed @pending page keeps the document content', async () => {
			const { page, errors } = await open(browser, `${leading.origin}/`);
			await markSiteChrome(page);
			await page.locator('[data-nav="slow"]').click();
			await landedOn(page, 'slow');
			await page.locator('[data-settled]').waitFor();
			await expectLeadingShape(page, ['main']);
			expect(await siteChromeKept(page)).toBe(true);
			await page.locator('[data-settled-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});

		// A click on the document's own chrome after the arm commits wakes the runtime through the
		// streamed arm's listener; every press after it must still run its handler once.
		test.each(['landing', 'fragment swap'])(
			'a document click before a streamed @pending page wakes leaves each press dispatched once (%s)',
			async (arrival) => {
				const page = await browser.newPage();
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(String(error)));
				// The defer clock seam holds the idle wake, so the arm commits before any runtime starts.
				await page.addInitScript(() => {
					(HTMLElement.prototype as { __mClock?: unknown }).__mClock = {
						idle: () => {},
						frame: (run: () => void) => requestAnimationFrame(run),
					};
				});
				if (arrival === 'landing') await page.goto(`${leading.origin}/slow`);
				else {
					await page.goto(`${leading.origin}/`);
					await page.locator('[data-nav="slow"]').click();
					await landedOn(page, 'slow');
				}
				await page.locator('[data-settled]').waitFor();
				await page.locator('[data-site-button]').click();
				await page.locator('[data-settled-tap]').click();
				await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
				await page.locator('[data-settled-tap]').click();
				await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('2');
				await page.locator('[data-tap]').click();
				await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('3');
				expect(errors).toEqual([]);
				await page.close();
			},
		);

		test('a client render of a hash route between document content keeps its shape', async () => {
			const { page, errors } = await open(browser, `${leading.origin}/#/other`);
			await landedOn(page, 'other');
			await expectLeadingShape(page, ['main']);
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
			expect(errors).toEqual([]);
			await page.close();
		});
	});
}
