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
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A link whose page answers a redirect (an auth guard, a renamed route) lands on the target in
// place, and neither the click nor a prefetch downloads the target's whole document to throw away.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let origin = '';
let close = async () => {};

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-fragment-redirect-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-redirect-app'), root, {
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
		plugins: [markless({ experimentalNativePacking: true }), router()],
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

afterAll(async () => close());

async function open(browser: Browser) {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const documents: string[] = [];
	const fetched: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (request.resourceType() === 'document') documents.push(url.pathname);
		else if (request.resourceType() === 'fetch')
			fetched.push(
				`${(fragmentPageUrl(url) ?? url).pathname}${fragmentPageUrl(url) ? ' fragment' : ''}`,
			);
	});
	await page.goto(`${origin}/`);
	await landedOn(page, 'home');
	await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));
	return { page, documents, fetched };
}

async function landedOn(page: Page, name: string) {
	await page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);
}

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`a redirected link (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await launchBrowser(browserType);
		});
		afterAll(async () => {
			await browser?.close();
		});

		for (const [link, search] of [
			['[data-moved]', '?from=moved'],
			['[data-gone]', ''],
		] as const) {
			test(`${link} lands on the target in place, with no document fetched to be thrown away`, async () => {
				const { page, documents, fetched } = await open(browser);
				await page.locator(link).hover();
				await page.waitForTimeout(200);
				await page.locator(link).click();
				await landedOn(page, 'target');
				expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
					`/target${search}`,
				);
				expect(
					await page.evaluate(() => (window as unknown as { kept?: boolean }).kept),
				).toBe(true);
				expect(documents).toEqual(['/']);
				expect(fetched.filter((entry) => !entry.endsWith(' fragment'))).toEqual([]);
				await page.goBack();
				await landedOn(page, 'home');
				await page.close();
			});
		}
	});
}
