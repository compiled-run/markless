import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { FRAGMENT_REGION_END, fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { urlKeyedCache } from '../support/url-keyed-cache.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A Nitro `vercel` build served through Vercel's routing (test/support/vercel-sim.mjs), with a
// cache keyed on the URL in front. An ISR route reaches the function through Nitro's ISR rewrite,
// which drops the query string, so a navigation fetch must name its own path, not a query.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const simulator = resolve(import.meta.dirname, '../support/vercel-sim.mjs');
const cleanups: Array<() => Promise<void> | void> = [];
let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
});

afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function serveOnVercel(isrRoute: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-vercel-isr-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		nitro: { preset: 'vercel', routeRules: { [isrRoute]: { isr: true } } },
		plugins: [markless(), router()],
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
	const server = await startBuiltServer(simulator, {
		env: {
			PATH: process.env.PATH,
			VERCEL_OUTPUT: join(root, '.vercel/output'),
		},
	});
	cleanups.push(() => server.close());
	const cdn = await urlKeyedCache(server.origin);
	cleanups.push(() => cdn.close());
	return cdn.origin;
}

async function landedOn(page: Page, name: string): Promise<void> {
	await page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);
}

for (const isrRoute of ['/**', '/other']) {
	describe(`Vercel ISR on ${isrRoute}`, () => {
		let origin = '';
		beforeAll(async () => {
			origin = await serveOnVercel(isrRoute);
		}, 240_000);

		test('a link swaps in the server region, and a page load of the same URL gets the document', async () => {
			const page = await browser.newPage();
			const errors: string[] = [];
			const fragments: Array<Promise<string>> = [];
			const documents: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			page.on('response', (response) => {
				const url = new URL(response.url());
				if (fragmentPageUrl(url)?.pathname === '/other') fragments.push(response.text());
				if (response.request().resourceType() === 'document') documents.push(url.pathname);
			});
			await page.goto(`${origin}/`);
			await page.locator('[data-nav="other"]').click();
			await landedOn(page, 'other');
			expect(page.url()).toBe(`${origin}/other`);
			expect(documents).toEqual(['/']);
			expect(fragments.length).toBeGreaterThan(0);
			for (const body of await Promise.all(fragments))
				expect(body).toContain(FRAGMENT_REGION_END);
			await page.locator('[data-tap]').click();
			await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');

			const load = await page.goto(`${origin}/other`);
			expect(await load?.text()).not.toContain(FRAGMENT_REGION_END);
			await landedOn(page, 'other');
			expect(errors).toEqual([]);
			await page.close();
		});
	});
}
