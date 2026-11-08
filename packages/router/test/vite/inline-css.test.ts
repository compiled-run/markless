import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { fragmentRequestUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A built page's CSS, its components' scoped blocks and the stylesheets it imports, arrives inside its HTML.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-inline-css-'));
	await cp(resolve(import.meta.dirname, '../fixtures/inline-css-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const nodeEnv = process.env.NODE_ENV;
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

async function open(path: string): Promise<{ page: Page; stylesheetRequests: string[] }> {
	const page = await browser!.newPage({ viewport: { width: 900, height: 700 } });
	const stylesheetRequests: string[] = [];
	page.on('request', (request) => {
		if (request.resourceType() === 'stylesheet') stylesheetRequests.push(request.url());
	});
	await page.goto(`${server!.origin}${path}`);
	await page.waitForLoadState('networkidle');
	return { page, stylesheetRequests };
}

// Every computed property of every probed element, keyed by probe name.
const computedStyles = (page: Page) =>
	page.evaluate(() =>
		Object.fromEntries(
			[...document.querySelectorAll('[data-probe]')].map((element) => {
				const style = getComputedStyle(element);
				return [
					element.getAttribute('data-probe'),
					Object.fromEntries(
						[...style].map((property) => [property, style.getPropertyValue(property)]),
					),
				];
			}),
		),
	);

// The text of every rule the document applies, once per sheet that holds it.
const appliedRules = (page: Page) =>
	page.evaluate(() =>
		[...document.styleSheets]
			.filter(
				(sheet) =>
					!sheet.disabled &&
					(sheet.media.length === 0 || matchMedia(sheet.media.mediaText).matches),
			)
			.flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)),
	);

async function navigate(page: Page, link: string, title: string) {
	await page.locator(`[data-nav="${link}"]`).click();
	await page.waitForFunction(
		(title) => document.querySelector('[data-title]')?.textContent === title,
		title,
	);
	await page.waitForLoadState('networkidle');
}

test('a cold load carries the page CSS in its HTML and requests no stylesheet, before or after the first click', async () => {
	const html = await (await fetch(`${server!.origin}/`)).text();
	expect(html).not.toMatch(/<link[^>]*rel="?stylesheet/);
	const { page, stylesheetRequests } = await open('/');
	const color = (probe: string) =>
		page
			.locator(`[data-probe="${probe}"]`)
			.evaluate((element) => getComputedStyle(element).color);
	expect(await color('counter')).toBe('rgb(44, 55, 66)');
	expect(await color('lead')).toBe('rgb(150, 30, 30)');
	expect(
		await page
			.locator('[data-probe="nav"]')
			.evaluate((element) => getComputedStyle(element).backgroundColor),
	).toBe('rgb(230, 240, 250)');
	expect(
		await page
			.locator('[data-probe="mark"]')
			.evaluate((element) => getComputedStyle(element).letterSpacing),
	).toBe('2px');
	await page.locator('[data-counter]').click();
	await expect.poll(() => page.locator('[data-counter]').textContent()).toBe('Count 1');
	await page.waitForLoadState('networkidle');
	expect(stylesheetRequests).toEqual([]);
	expect(await page.locator('link[rel="stylesheet"]').count()).toBe(0);
	const rules = await appliedRules(page);
	expect(rules.length).toBeGreaterThan(0);
	expect(new Set(rules).size).toBe(rules.length);
	await page.close();
});

test('a fragment carries inline only the CSS its page adds to what every page has', async () => {
	const fragment = await (await fetch(fragmentRequestUrl(`${server!.origin}/other`))).text();
	const home = await (await fetch(`${server!.origin}/`)).text();
	const other = await (await fetch(`${server!.origin}/other`)).text();
	// The card and the page's own stylesheet are this page's alone; the nav and the site stylesheet are on every page.
	for (const mark of ['--card-mark', '--other-mark']) {
		expect(other).toContain(mark);
		expect(fragment).toContain(mark);
	}
	for (const mark of ['--nav-mark', '--site-mark']) {
		expect(home).toContain(mark);
		expect(fragment).not.toContain(mark);
	}
	expect(fragment).not.toContain('--home-mark');
});

test('after in-place navigations no rule applies twice, nothing is fetched, and every element computes as on a cold load', async () => {
	const coldOther = await open('/other');
	const otherStyles = await computedStyles(coldOther.page);
	await coldOther.page.close();
	const coldHome = await open('/');
	const homeStyles = await computedStyles(coldHome.page);
	await coldHome.page.close();

	const { page, stylesheetRequests } = await open('/');
	await navigate(page, 'other', 'Other');
	expect(await computedStyles(page)).toEqual(otherStyles);
	let rules = await appliedRules(page);
	expect(new Set(rules).size).toBe(rules.length);
	await navigate(page, 'home', 'Home');
	expect(await computedStyles(page)).toEqual(homeStyles);
	rules = await appliedRules(page);
	expect(new Set(rules).size).toBe(rules.length);
	expect(stylesheetRequests).toEqual([]);
	await page.close();
});
