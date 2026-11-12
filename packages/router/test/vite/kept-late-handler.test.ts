import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page, type Request } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startFixtureDev, type FixtureDevServer } from '../support/fixture-dev.ts';

// /guide and /reference keep two parts, one with state() and one with storage(). As a link click starts an in-place
// navigation, the page tells both which page the reader leaves; a dev server serves each handler as its own module,
// and the test holds those back until the navigation has done all it can without them.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const PARTS = ['[data-leave-note]', '[data-leave-store]'];
let root = '';
let server: FixtureDevServer | undefined;
let origin = '';
let browser: Browser | undefined;
let handlerModules: ReadonlySet<string> = new Set();
// Longer than any test run, so only the cases that test the deadline meet it.
const LONG_DEADLINE_MS = 10 * 60_000;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-kept-late-handler-app-')));
	await cp(resolve(import.meta.dirname, '../fixtures/kept-late-handler-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	server = await startFixtureDev(root);
	origin = server.origin;
	for (const path of ['/guide', '/reference', '/changelog', '/plain', '/rows']) await fetch(`${origin}${path}`);
	browser = await launchBrowser(chromium);
	handlerModules = await firstRunModules();
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

const shown = (page: Page) =>
	page.evaluate(() => ({
		title: document.querySelector('[data-title]')?.textContent,
		left: document.querySelector('[data-left]')?.textContent,
		saved: localStorage.getItem('leave-store-left'),
	}));

const heard = (page: Page) => page.textContent('[data-heard]');

// Events a container received and has not handled yet, summed over the page's containers.
const unhandledCount = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('[data-async-container]')].reduce(
			(total, container) => total + ((container as Element & { __mH?: Map<object, unknown> }).__mH?.size ?? 0),
			0,
		),
	);

const storedShows = (page: Page, text: string) =>
	page.waitForFunction(
		(expected) => document.querySelector('[data-stored]')?.textContent === expected,
		text,
		{ timeout: 15_000 },
	);

async function press(page: Page): Promise<void> {
	await page.click('[data-note-press]');
	await page.click('[data-store-press]');
	await page.waitForFunction(
		() =>
			document.querySelector('[data-note-press]')?.textContent === 'presses 1' &&
			document.querySelector('[data-store-press]')?.textContent === 'stored 1',
	);
}

// Every request but the held ones has finished and the page has drawn twice since, so a navigation is either in place or waiting on held code.
function quiet(page: Page, held: (url: string) => boolean): () => Promise<void> {
	const open = new Set<Request>();
	let changed: () => void = () => {};
	page.on('request', (request) => {
		if (!held(request.url())) open.add(request);
	});
	const done = (request: Request) => {
		open.delete(request);
		changed();
	};
	page.on('requestfinished', done);
	page.on('requestfailed', done);
	return async () => {
		for (;;) {
			while (open.size > 0) await new Promise<void>((resolve) => (changed = resolve));
			await page.evaluate(
				() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
			);
			if (open.size === 0) return;
		}
	};
}

// Each part's handler module: the first module its first dispatch asks for, since the handler loads before anything its write needs.
async function firstRunModules(): Promise<Set<string>> {
	const page = await browser!.newPage();
	const rest = quiet(page, () => false);
	await page.goto(`${origin}/guide`);
	await press(page);
	await rest();
	const handlers = new Set<string>();
	for (const [part, shows] of [
		['[data-leave-note]', '[data-left]'],
		['[data-leave-store]', '[data-stored]'],
	] as const) {
		let first: string | undefined;
		const note = (request: Request) => {
			if (request.resourceType() === 'script') first ??= request.url();
		};
		page.on('request', note);
		await page.evaluate(
			(selector) =>
				document.querySelector(selector)!.dispatchEvent(new CustomEvent('navleave', { detail: 'probe' })),
			part,
		);
		await page.waitForFunction((selector) => document.querySelector(selector)?.textContent === 'probe', shows);
		await rest();
		page.off('request', note);
		if (first) handlers.add(first);
	}
	await page.close();
	return handlers;
}

// The router's swap deadline, set on its config as the page creates it, so a test decides the deadline instead of the clock.
async function swapDeadline(page: Page, ms: number): Promise<void> {
	await page.addInitScript((deadline) => {
		let state: { config: { swapDeadlineMs: number } } | undefined;
		Object.defineProperty(document, '__marklessFragmentNav', {
			configurable: true,
			get: () => state,
			set: (next: typeof state) => {
				if (next) next.config.swapDeadlineMs = deadline;
				state = next;
			},
		});
	}, ms);
}

async function heldPage(deadlineMs?: number): Promise<{
	page: Page;
	errors: string[];
	rest: () => Promise<void>;
	release: () => void;
	landed: () => Promise<void>;
}> {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	if (deadlineMs !== undefined) await swapDeadline(page, deadlineMs);
	let release!: () => void;
	const released = new Promise<void>((done) => (release = done));
	const held = (url: string) => handlerModules.has(url);
	const routed = new Set<string>();
	const finished = new Set<string>();
	let changed: () => void = () => {};
	page.on('requestfinished', (request) => {
		if (held(request.url())) finished.add(request.url());
		changed();
	});
	await page.route(
		(url) => held(url.href),
		async (route) => {
			routed.add(route.request().url());
			await released;
			await route.continue();
		},
	);
	// Every held module the page asked for has arrived.
	const landed = async () => {
		while ([...routed].some((url) => !finished.has(url)))
			await new Promise<void>((resolve) => (changed = resolve));
	};
	const rest = quiet(page, held);
	await page.goto(`${origin}/guide`);
	// As the docs navbar does: the page's own capture listener tells the parts before the router takes the click.
	await page.evaluate((parts) => {
		document.addEventListener(
			'click',
			(event) => {
				if (!(event.target as Element).closest('a[href]')) return;
				for (const part of parts)
					document.querySelector(part)!.dispatchEvent(new CustomEvent('navleave', { detail: 'guide' }));
			},
			true,
		);
	}, PARTS);
	return { page, errors, rest, release, landed };
}

test('each handler loads its own code on its first run, so the test can hold it back', () => {
	expect(handlerModules.size).toBe(2);
});

test('a kept part whose handler code arrives after the link click writes onto the next page', async () => {
	const { page, errors, rest, release } = await heldPage(LONG_DEADLINE_MS);
	await press(page);
	await page.click('[data-nav="reference"]');
	await rest();
	release();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	await rest();
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'guide', saved: 'guide' });
	await storedShows(page, 'guide');
	await page.click('[data-note-press]');
	await page.waitForFunction(() => document.querySelector('[data-note-press]')?.textContent === 'presses 2');
	expect(errors).toEqual([]);
	await page.close();
});

test('an event the page sends before its runtime has started is handled, and its write reaches the next page', async () => {
	const { page, errors, rest, release } = await heldPage(LONG_DEADLINE_MS);
	// No pointer crosses the page first, so nothing has woken its runtime.
	await page.evaluate(() => document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click());
	await rest();
	release();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	await rest();
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'guide', saved: 'guide' });
	await storedShows(page, 'guide');
	expect(await heard(page)).toBe('heard 1');
	expect(await unhandledCount(page)).toBe(0);
	expect(errors).toEqual([]);
	await page.close();
});

test('an event the page sends before its runtime has started, with no navigation after it, is handled once', async () => {
	const { page, errors, rest, release } = await heldPage(LONG_DEADLINE_MS);
	await page.evaluate(() =>
		document.querySelector('[data-leave-note]')!.dispatchEvent(new CustomEvent('navleave', { detail: 'early' })),
	);
	await rest();
	expect(await unhandledCount(page)).toBe(1);
	release();
	await page.waitForFunction(() => document.querySelector('[data-left]')?.textContent === 'early');
	await rest();
	expect(await heard(page)).toBe('heard 1');
	expect(await unhandledCount(page)).toBe(0);
	expect(new URL(page.url()).pathname).toBe('/guide');
	expect(errors).toEqual([]);
	await page.close();
});

test('two events the page sends before its runtime has started are both handled before the next page swaps in', async () => {
	const { page, errors, rest, release } = await heldPage(LONG_DEADLINE_MS);
	await page.evaluate(() => {
		document.querySelector('[data-leave-note]')!.dispatchEvent(new CustomEvent('navleave', { detail: 'first' }));
		document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click();
	});
	await rest();
	expect(await page.textContent('[data-title]')).toBe('Guide page');
	release();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	await rest();
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'guide', saved: 'guide' });
	expect(await heard(page)).toBe('heard 2');
	expect(await unhandledCount(page)).toBe(0);
	expect(errors).toEqual([]);
	await page.close();
});

test('a navigation still swaps in when an event the page sent before its runtime started never gets its handler code', async () => {
	const { page, errors } = await heldPage();
	await page.evaluate(() => document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click());
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	expect(new URL(page.url()).pathname).toBe('/reference');
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'none', saved: null });
	expect(await heard(page)).toBe('heard 0');
	expect(await unhandledCount(page)).toBe(0);
	expect(await page.textContent('main')).toBe(
		'Reference pageThe reference page has its own content, which a navigation replaces.',
	);
	expect(errors).toEqual([]);
	await page.unrouteAll({ behavior: 'ignoreErrors' });
	await page.close();
});

test('a forward whose resume module fails to load is reported once, leaves no record, and the navigation after it completes', async () => {
	const probe = await browser!.newPage();
	await probe.goto(`${origin}/guide`);
	const modules = await probe.evaluate(() =>
		[...document.querySelectorAll('[data-markless-resume-module]')].map(
			(script) => new URL(script.getAttribute('data-markless-resume-module')!, location.href).href,
		),
	);
	await probe.close();
	expect(modules.length).toBeGreaterThan(0);
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await swapDeadline(page, LONG_DEADLINE_MS);
	await page.route(
		(url) => modules.includes(url.href),
		(route) => route.abort(),
	);
	await page.goto(`${origin}/guide`);
	await page.evaluate(() =>
		document.querySelector('[data-leave-note]')!.dispatchEvent(new CustomEvent('navleave', { detail: 'guide' })),
	);
	await expect.poll(() => errors.length).toBe(1);
	expect(errors[0]).toMatch(/dynamically imported module/);
	expect(await unhandledCount(page)).toBe(0);
	await page.evaluate(() => document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click());
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'none', saved: null });
	// The next page asks for the same blocked module on its own; only that import fails again.
	expect(errors.every((message) => /dynamically imported module/.test(message))).toBe(true);
	await page.unrouteAll({ behavior: 'ignoreErrors' });
	await page.close();
});

test('an event on a kept part after an in-place navigation is handled before the next navigation swaps in', async () => {
	const { page, errors, rest, release } = await heldPage(LONG_DEADLINE_MS);
	await page.evaluate(() => document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click());
	await rest();
	release();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	await rest();
	expect(await heard(page)).toBe('heard 1');
	await page.evaluate(() => {
		document.querySelector('[data-leave-note]')!.dispatchEvent(new CustomEvent('navleave', { detail: 'reference' }));
		document.querySelector<HTMLAnchorElement>('[data-nav="changelog"]')!.click();
	});
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Changelog page');
	await rest();
	// The page's own listener tells both parts it leaves "guide" on every link click.
	expect(await shown(page)).toEqual({ title: 'Changelog page', left: 'guide', saved: 'guide' });
	expect(await heard(page)).toBe('heard 3');
	expect(await unhandledCount(page)).toBe(0);
	expect(errors).toEqual([]);
	await page.close();
});

test('a link click on a page that forwards it records nothing, so the navigation does not wait for the forward', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${origin}/rows`);
	// Rows take clicks and the page has a branch, so the boot forwards a click on the link too.
	expect(
		await page.evaluate(() => {
			document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click();
			return [...document.querySelectorAll('[data-async-container]')].map(
				(container) =>
					(container as Element & { __mH?: Map<object, unknown> }).__mH?.size ?? 0,
			);
		}),
	).not.toContain(1);
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	expect(errors).toEqual([]);
	await page.close();
});

test('a row click before the runtime starts is recorded until it is handled', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${origin}/rows`);
	expect(
		await page.evaluate(() => {
			document.querySelector<HTMLButtonElement>('[data-pick="b"]')!.click();
			return (
				document.querySelector('[data-async-container]') as Element & { __mH?: Map<object, unknown> }
			).__mH?.size;
		}),
	).toBe(1);
	await page.waitForFunction(() => document.querySelector('[data-picked]')?.textContent === 'b');
	await expect.poll(() => unhandledCount(page)).toBe(0);
	expect(errors).toEqual([]);
	await page.close();
});

test('a page with no handlers records no event and still navigates', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const rest = quiet(page, () => false);
	await page.goto(`${origin}/plain`);
	await page.click('[data-title]');
	expect(await unhandledCount(page)).toBe(0);
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	await rest();
	await page.click('[data-note-press]');
	await page.waitForFunction(() => document.querySelector('[data-note-press]')?.textContent === 'presses 1');
	expect(errors).toEqual([]);
	await page.close();
});

// A handler whose code never arrives holds the navigation no longer than the destination's own code may.
test('a navigation still swaps in when a handler on the leaving page never gets its code, without that write', async () => {
	const { page, errors } = await heldPage();
	await press(page);
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	expect(new URL(page.url()).pathname).toBe('/reference');
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'none', saved: null });
	expect(errors).toEqual([]);
	await page.unrouteAll({ behavior: 'ignoreErrors' });
	await page.close();
});

test('a second link clicked while a navigation waits on handler code that never arrives lands on the second page', async () => {
	const { page, errors, rest } = await heldPage();
	await press(page);
	await page.click('[data-nav="reference"]');
	await rest();
	await page.click('[data-nav="changelog"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Changelog page');
	await rest();
	expect(new URL(page.url()).pathname).toBe('/changelog');
	expect(await shown(page)).toEqual({ title: 'Changelog page', left: 'none', saved: null });
	expect(errors).toEqual([]);
	await page.unrouteAll({ behavior: 'ignoreErrors' });
	await page.close();
});

test('a handler whose code arrives after the deadline writes into neither the page it left nor the next one', async () => {
	const { page, errors, rest, release, landed } = await heldPage(0);
	await press(page);
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	release();
	await landed();
	await rest();
	expect(errors).toEqual([]);
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'none', saved: null });
	await storedShows(page, 'none');
	expect(await page.textContent('main')).toBe(
		'Reference pageThe reference page has its own content, which a navigation replaces.',
	);
	await page.click('[data-note-press]');
	await page.waitForFunction(() => document.querySelector('[data-note-press]')?.textContent === 'presses 2');
	expect(errors).toEqual([]);
	await page.close();
});

test('a save a handler sent before the reader navigates answers after the swap without touching either page', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let answer!: () => void;
	const answered = new Promise<void>((done) => (answer = done));
	const saves: string[] = [];
	await page.route(
		(url) => url.pathname === '/save',
		async (route) => {
			saves.push(`${route.request().method()} ${route.request().postData()}`);
			await answered;
			await route.fulfill({ status: 204 });
		},
	);
	const rest = quiet(page, (url) => new URL(url).pathname === '/save');
	await page.goto(`${origin}/guide`);
	await page.waitForFunction(() => document.querySelector('[data-names]')?.textContent === 'Ada');
	await page.click('[data-save]');
	await page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === 'saving');
	const status = await page.$('[data-save-status]');
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	const saved = page.waitForEvent('requestfinished', (request) => new URL(request.url()).pathname === '/save');
	answer();
	await saved;
	await rest();
	expect(saves).toEqual(['POST Grace']);
	expect(errors).toEqual([]);
	expect(new URL(page.url()).pathname).toBe('/reference');
	expect(await page.$('[data-save-shelf]')).toBeNull();
	expect(await status!.evaluate((element) => [element.isConnected, element.textContent])).toEqual([false, 'saving']);
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'none', saved: null });
	await page.click('[data-note-press]');
	await page.waitForFunction(() => document.querySelector('[data-note-press]')?.textContent === 'presses 1');
	expect(errors).toEqual([]);
	await page.close();
});

test('a form whose save is still out when the reader navigates releases its hold without touching either page', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let answer!: () => void;
	const answered = new Promise<void>((done) => (answer = done));
	const saves: string[] = [];
	await page.route(
		(url) => url.pathname === '/save',
		async (route) => {
			saves.push(`${route.request().method()} ${route.request().postData()}`);
			await answered;
			await route.fulfill({ status: 204 });
		},
	);
	const rest = quiet(page, (url) => new URL(url).pathname === '/save');
	await page.goto(`${origin}/guide`);
	await page.waitForFunction(() => document.querySelector('[data-names]')?.textContent === 'Ada');
	await page.click('[data-submit]');
	await page.waitForFunction(() => document.querySelector('[data-save-form]')?.getAttribute('aria-busy') === 'true');
	const form = await page.$('[data-save-form]');
	const submitter = await page.$('[data-submit]');
	const status = await page.$('[data-save-status]');
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	const saved = page.waitForEvent('requestfinished', (request) => new URL(request.url()).pathname === '/save');
	answer();
	await saved;
	await form!.evaluate(
		(element) =>
			new Promise<void>((done) => {
				if (!element.hasAttribute('aria-busy')) return done();
				new MutationObserver((_records, observer) => {
					if (element.hasAttribute('aria-busy')) return;
					observer.disconnect();
					done();
				}).observe(element, { attributes: true, attributeFilter: ['aria-busy'] });
			}),
	);
	await rest();
	expect(saves).toEqual(['POST name=Grace']);
	expect(errors).toEqual([]);
	expect(new URL(page.url()).pathname).toBe('/reference');
	expect(await form!.evaluate((element) => element.isConnected)).toBe(false);
	expect(await submitter!.evaluate((element) => element.hasAttribute('aria-disabled'))).toBe(false);
	expect(await status!.evaluate((element) => [element.isConnected, element.textContent])).toEqual([false, 'submitting']);
	expect(await page.evaluate(() => document.querySelectorAll('[aria-busy], [aria-disabled]').length)).toBe(0);
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'none', saved: null });
	await page.click('[data-note-press]');
	await page.waitForFunction(() => document.querySelector('[data-note-press]')?.textContent === 'presses 1');
	expect(saves).toHaveLength(1);
	expect(errors).toEqual([]);
	await page.close();
});

test('a handler that returns the navigation it starts does not hold that navigation back', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${origin}/guide`);
	await page.click('[data-go]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	expect(errors).toEqual([]);
	await page.close();
});
