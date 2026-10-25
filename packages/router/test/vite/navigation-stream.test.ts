import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// In-place navigations to pages whose data is still streaming when the click lands, on a production build.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-navigation-stream-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/navigation-stream-app'), root, {
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
}, 240_000);

afterAll(async () => {
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

type Session = { readonly page: Page; readonly errors: string[]; readonly logs: string[] };

async function open(browser: Browser, path: string, loaded = true): Promise<Session> {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const errors: string[] = [];
	const logs: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
		else logs.push(message.text());
	});
	await page.goto(server!.origin + path, { waitUntil: loaded ? 'load' : 'commit' });
	return { page, errors, logs };
}

const landedOn = (page: Page, name: string) =>
	page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);

// Every distinct view the page paints from now on: which page, and what its region shows.
const watchViews = (page: Page) =>
	page.evaluate(() => {
		const seen: string[] = [];
		(window as unknown as { __views: string[] }).__views = seen;
		const tick = () => {
			const main = document.querySelector('main');
			const view = `${main?.getAttribute('data-page')}:${main?.querySelector('[data-which]')?.textContent ?? ''}${main?.querySelector('[data-pending]') ? ' pending' : ''}`;
			if (seen.at(-1) !== view) seen.push(view);
			requestAnimationFrame(tick);
		};
		tick();
	});

const views = (page: Page) =>
	page.evaluate(() => (window as unknown as { __views: string[] }).__views);

// Clicks `first`, and the moment the address shows its navigation started, runs `then` in the same page.
const raceFrom = (page: Page, first: string, search: string, then: string) =>
	page.evaluate(
		([first, search, then]) =>
			new Promise<void>((done) => {
				const link = document.querySelector(first) as HTMLElement;
				link.focus();
				document.activeElement?.setAttribute('data-focused', '');
				link.click();
				const started = () => {
					if (location.search !== search) return void setTimeout(started);
					if (then === 'back') history.back();
					else (document.querySelector(then) as HTMLElement | null)?.click();
					done();
				};
				started();
			}),
		[first, search, then] as const,
	);

const serverRuns = (tag: string) =>
	server!
		.output()
		.split('\n')
		.filter((line) => line.includes(`slow() server ${tag}`)).length;

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`navigation to a streaming page (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await launchBrowser(browserType);
		});
		afterAll(async () => {
			await browser?.close();
		});

		test('the server streamed answer fills the arrival and the browser never runs the recipe', async () => {
			const { page, errors, logs } = await open(browser, '/');
			const before = serverRuns('u=2');
			await page.locator('[data-to-recipe]').click();
			await landedOn(page, 'recipe');
			await page.locator('[data-answer]').waitFor();
			expect(await page.locator('[data-answer]').textContent()).toBe('loaded u=2 (server)');
			await page.waitForTimeout(900);
			expect(await page.locator('[data-answer]').textContent()).toBe('loaded u=2 (server)');
			expect(logs.filter((line) => line.startsWith('slow() browser'))).toEqual([]);
			expect(serverRuns('u=2') - before).toBe(1);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a link whose handler prevents its default, streamed in after the arrival, runs the handler', async () => {
			const { page, errors } = await open(browser, '/');
			await page.locator('[data-to-arm-link]').click();
			await landedOn(page, 'arm-link');
			await page.locator('[data-answer]').waitFor();
			await page.locator('[data-open]').click();
			await expect.poll(() => page.locator('[data-open]').textContent()).toBe('Close');
			expect(await page.locator('[data-panel]').isHidden()).toBe(false);
			expect(new URL(page.url()).search).toBe('');
			await page.locator('[data-count]').click();
			await expect.poll(() => page.locator('[data-count]').textContent()).toBe('clicked 1');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a navigation superseded before its page settled never shows, and the newest one lands', async () => {
			const { page, errors } = await open(browser, '/');
			await watchViews(page);
			await raceFrom(page, '[data-to-recipe]', '?u=2', '[data-to-other-recipe]');
			await landedOn(page, 'recipe');
			await page.locator('[data-answer]').waitFor();
			expect(await page.locator('[data-answer]').textContent()).toBe('loaded u=3 (server)');
			expect(new URL(page.url()).search).toBe('?u=3');
			expect((await views(page)).filter((view) => !view.endsWith(' pending'))).toEqual([
				'start:',
				'recipe:3',
			]);
			expect(await views(page)).not.toContain('recipe:2 pending');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a page whose data settles inside the deadline swaps in settled, never showing @pending', async () => {
			const { page, errors } = await open(browser, '/');
			await watchViews(page);
			await page.locator('[data-to-quick]').click();
			await landedOn(page, 'quick');
			await page.locator('[data-answer]').waitFor();
			await page.waitForTimeout(200);
			expect(await views(page)).toEqual(['start:', 'quick:']);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('Back pressed before the page arrived leaves the page and the focus where they were', async () => {
			const { page, errors } = await open(browser, '/');
			await watchViews(page);
			await raceFrom(page, '[data-to-recipe]', '?u=2', 'back');
			await page.waitForTimeout(1200);
			expect(await views(page)).toEqual(['start:']);
			expect(new URL(page.url()).pathname).toBe('/');
			expect(
				await page.evaluate(() => document.activeElement?.hasAttribute('data-focused')),
			).toBe(true);
			expect(errors).toEqual([]);
			await page.close();
		});

		for (const arrival of ['landing', 'in-place arrival'] as const)
			test(`after a click woke the page before its data streamed in (${arrival}), the streamed link still runs its handler`, async () => {
				const { page, errors } = await open(
					browser,
					arrival === 'landing' ? '/toggle' : '/',
					arrival !== 'landing',
				);
				if (arrival !== 'landing') {
					await page.locator('[data-to-toggle]').click();
					await landedOn(page, 'toggle');
				}
				await page.locator('[data-pending]').waitFor();
				await page.locator('[data-wake]').click();
				await expect.poll(() => page.locator('[data-wake]').textContent()).toBe('woke 1');
				await page.locator('[data-answer]').waitFor();
				await page.locator('[data-open]').click();
				await expect.poll(() => page.locator('[data-open]').textContent()).toBe('Close');
				expect(new URL(page.url()).search).toBe('');
				expect(errors).toEqual([]);
				await page.close();
			});
	});
}
