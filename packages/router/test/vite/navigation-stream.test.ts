import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';
import { MARKLESS_ROUTER_RENDERED_EVENT } from '../../src/route-state.ts';
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

// Clicks `first`, and the moment its page fetch has started, runs `then` (Back, or a click on a selector) in the same page.
const raceFrom = (page: Page, first: string, fetched: string, then: string) =>
	page.evaluate(
		([first, fetched, then]) =>
			new Promise<void>((done) => {
				const requested: string[] = [];
				const send = window.fetch;
				window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
					requested.push(new URL(String(input instanceof Request ? input.url : input), location.href).href);
					return send.call(window, input, init);
				} as typeof fetch;
				const link = document.querySelector(first) as HTMLElement;
				link.focus();
				document.activeElement?.setAttribute('data-focused', '');
				link.click();
				const started = () => {
					if (!requested.some((href) => href.endsWith(fetched))) return void setTimeout(started);
					if (then === 'back') history.back();
					else (document.querySelector(then) as HTMLElement | null)?.click();
					done();
				};
				started();
			}),
		[first, fetched, then] as const,
	);

// history.back() only queues the traversal; WebKit on Linux runs page tasks for up to ~80 ms first, so the page's fetch is held until `release`.
const holdArrival = async (page: Page, pageKey: string) => {
	let release!: () => void;
	const released = new Promise<void>((done) => (release = done));
	await page.route(
		(url) => {
			const target = fragmentPageUrl(url);
			return target?.pathname + (target?.search ?? '') === pageKey;
		},
		async (route) => {
			await released;
			await route.continue().catch(() => {});
		},
	);
	return release;
};

// Every distinct (page, address) pair the document shows, read every frame and after every DOM change.
const watchAddress = (page: Page) =>
	page.evaluate(() => {
		const seen: string[] = [];
		(window as unknown as { __addresses: string[] }).__addresses = seen;
		const read = () => {
			const view = `${document.querySelector('main')?.getAttribute('data-page')} ${location.pathname}${location.search}`;
			if (seen.at(-1) !== view) seen.push(view);
		};
		new MutationObserver(read).observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
		});
		const tick = () => {
			read();
			requestAnimationFrame(tick);
		};
		tick();
	});

const addresses = (page: Page) =>
	page.evaluate(() => (window as unknown as { __addresses: string[] }).__addresses);

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
			await raceFrom(page, '[data-to-recipe]', '/recipe?u=2', '[data-to-other-recipe]');
			await landedOn(page, 'recipe');
			await page.locator('[data-answer]').waitFor();
			expect(await page.locator('[data-answer]').textContent()).toBe('loaded u=3 (server)');
			expect(new URL(page.url()).search).toBe('?u=3');
			// The watcher records on the next frame, which can come after the answer is in the DOM.
			await expect.poll(async () => (await views(page)).at(-1)).toBe('recipe:3');
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

		test('the address and its history entry change in the task that swaps the page in, never at the click', async () => {
			const { page, errors } = await open(browser, '/');
			const before = await page.evaluate(() => history.length);
			await watchAddress(page);
			await page.locator('[data-to-recipe]').evaluate((link) => (link as HTMLElement).click());
			await landedOn(page, 'recipe');
			await page.locator('[data-answer]').waitFor();
			expect(await addresses(page)).toEqual(['start /', 'recipe /recipe?u=2']);
			expect(await page.evaluate(() => history.length)).toBe(before + 1);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('Back pressed before the page arrived cancels it and goes back from the page still shown', async () => {
			const { page, errors } = await open(browser, '/');
			await page.locator('[data-to-quick]').click();
			await landedOn(page, 'quick');
			const before = await page.evaluate(() => history.length);
			await watchViews(page);
			const release = await holdArrival(page, '/recipe?u=4');
			await raceFrom(page, '[data-to-recipe]', '/recipe?u=4', 'back');
			await landedOn(page, 'start');
			release();
			await page.waitForTimeout(1200);
			expect(new URL(page.url()).pathname).toBe('/');
			expect((await views(page)).some((view) => view.startsWith('recipe'))).toBe(false);
			expect(await page.evaluate(() => history.length)).toBe(before);
			await page.goForward();
			await landedOn(page, 'quick');
			expect(new URL(page.url()).pathname).toBe('/quick');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('Back before arrival fires popstate and one rendered event, for the page it goes back to, and nothing for the cancelled page', async () => {
			const { page, errors } = await open(browser, '/');
			// As a site part does: on each rendered page, store what it shows (the shadcn sidebar's docs-sidebar-scroll).
			await page.evaluate((rendered) => {
				const events: string[] = [];
				(window as unknown as { __events: string[] }).__events = events;
				const at = () => location.pathname + location.search;
				addEventListener('popstate', () => events.push(`popstate ${at()}`));
				document.addEventListener(rendered, () => {
					events.push(`rendered ${at()}`);
					sessionStorage.setItem('shown', at());
				});
			}, MARKLESS_ROUTER_RENDERED_EVENT);
			const events = () => page.evaluate(() => (window as unknown as { __events: string[] }).__events);
			await page.locator('[data-to-quick]').click();
			await landedOn(page, 'quick');
			const release = await holdArrival(page, '/recipe?u=4');
			await raceFrom(page, '[data-to-recipe]', '/recipe?u=4', 'back');
			await landedOn(page, 'start');
			release();
			await page.waitForTimeout(1200);
			expect(await events()).toEqual(['rendered /quick', 'popstate /', 'rendered /']);
			expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBe('/');
			await page.locator('[data-to-recipe]').evaluate((link) => (link as HTMLElement).click());
			await landedOn(page, 'recipe');
			expect((await events()).slice(3)).toEqual(['rendered /recipe?u=2']);
			expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBe('/recipe?u=2');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('Back pressed before the page arrived on the landing page leaves the document, and Forward returns to the page it left', async () => {
			const { page, errors } = await open(browser, '/');
			const loads: string[] = [];
			page.on('framenavigated', (frame) => {
				if (frame === page.mainFrame()) loads.push(frame.url());
			});
			const release = await holdArrival(page, '/recipe?u=2');
			// Back leaves this document (the page script may not get to answer), and WebKit aborts the swap module's import as it does.
			await raceFrom(page, '[data-to-recipe]', '/recipe?u=2', 'back').catch(() => {});
			await page.waitForURL('about:blank');
			release();
			await page.waitForTimeout(600);
			expect(loads).toEqual(['about:blank']);
			await page.goForward();
			await landedOn(page, 'start');
			await page.waitForTimeout(1200);
			expect(await page.locator('main').getAttribute('data-page')).toBe('start');
			expect(new URL(page.url()).pathname).toBe('/');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a second click before arrival wins with one history entry', async () => {
			const { page, errors } = await open(browser, '/');
			const before = await page.evaluate(() => history.length);
			await raceFrom(page, '[data-to-recipe]', '/recipe?u=2', '[data-to-quick]');
			await landedOn(page, 'quick');
			await page.waitForTimeout(1200);
			expect(await page.locator('main').getAttribute('data-page')).toBe('quick');
			expect(new URL(page.url()).pathname).toBe('/quick');
			expect(await page.evaluate(() => history.length)).toBe(before + 1);
			await page.goBack();
			await landedOn(page, 'start');
			expect(new URL(page.url()).pathname).toBe('/');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a click on the page already shown, before another page arrived, cancels that page and keeps this one', async () => {
			const { page, errors } = await open(browser, '/');
			const before = await page.evaluate(() => history.length);
			await watchViews(page);
			await raceFrom(page, '[data-to-recipe]', '/recipe?u=2', '[data-to-start]');
			await page.waitForTimeout(1200);
			expect(await views(page)).toEqual(['start:']);
			expect(new URL(page.url()).pathname).toBe('/');
			expect(await page.evaluate(() => history.length)).toBe(before);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a hash link on this page clicked before another page arrived wins over it', async () => {
			const { page, errors } = await open(browser, '/');
			await watchViews(page);
			await raceFrom(page, '[data-to-recipe]', '/recipe?u=2', '[data-to-spot]');
			await page.waitForTimeout(1200);
			expect(await views(page)).toEqual(['start:']);
			expect(new URL(page.url()).hash).toBe('#spot');
			expect(new URL(page.url()).pathname).toBe('/');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a link to another page with a hash lands on that page at its target, and Back returns', async () => {
			const { page, errors } = await open(browser, '/');
			await page.locator('[data-to-quick]').click();
			await landedOn(page, 'quick');
			await page.locator('[data-to-spot]').evaluate((link) => (link as HTMLElement).click());
			await landedOn(page, 'start');
			expect(new URL(page.url()).hash).toBe('#spot');
			await expect
				.poll(() =>
					page.evaluate(() =>
						Math.abs(Math.round(document.getElementById('spot')!.getBoundingClientRect().top)),
					),
				)
				.toBe(0);
			await page.goBack();
			await landedOn(page, 'quick');
			expect(new URL(page.url()).pathname).toBe('/quick');
			await page.goForward();
			await landedOn(page, 'start');
			expect(new URL(page.url()).hash).toBe('#spot');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('Back after arrival restores the scroll offset the page had when it was left, not at the click', async () => {
			const { page, errors } = await open(browser, '/');
			await page.evaluate(() => window.scrollTo(0, 400));
			await page.waitForTimeout(100);
			await page.locator('[data-to-recipe]').evaluate((link) => {
				(link as HTMLElement).click();
				window.scrollTo(0, 900);
			});
			await landedOn(page, 'recipe');
			await page.locator('[data-answer]').waitFor();
			await page.goBack();
			await landedOn(page, 'start');
			await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900);
			await page.goForward();
			await landedOn(page, 'recipe');
			expect(new URL(page.url()).search).toBe('?u=2');
			expect(errors).toEqual([]);
			await page.close();
		});

		for (const leave of ['link', 'back'] as const)
			test(`leaving by ${leave} while the page's @try still streams never runs its recipe in the browser`, async () => {
				const { page, errors, logs } = await open(browser, '/');
				await page.locator('[data-to-recipe]').click();
				await landedOn(page, 'recipe');
				await page.locator('[data-pending]').waitFor();
				if (leave === 'link') await page.locator('[data-leave]').click();
				else await page.goBack();
				await landedOn(page, leave === 'link' ? 'quick' : 'start');
				await page.waitForTimeout(900);
				expect(logs.filter((line) => line.startsWith('slow() browser'))).toEqual([]);
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
