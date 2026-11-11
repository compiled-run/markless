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
	for (const path of ['/guide', '/reference']) await fetch(`${origin}${path}`);
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

async function heldPage(): Promise<{
	page: Page;
	errors: string[];
	rest: () => Promise<void>;
	release: () => void;
}> {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let release!: () => void;
	const released = new Promise<void>((done) => (release = done));
	const held = (url: string) => handlerModules.has(url);
	await page.route(
		(url) => held(url.href),
		async (route) => {
			await released;
			await route.continue();
		},
	);
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
	return { page, errors, rest, release };
}

test('each handler loads its own code on its first run, so the test can hold it back', () => {
	expect(handlerModules.size).toBe(2);
});

test('a kept part whose handler code arrives after the link click writes onto the next page', async () => {
	const { page, errors, rest, release } = await heldPage();
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

// Known gap: the inline boot forwards an event before any runtime exists and tells no navigation about it, so the swap retires the page first and the event is dropped.
test.fails('an event the page sends before its runtime has started is handled, and its write reaches the next page', async () => {
	const { page, errors, rest, release } = await heldPage();
	// No pointer crosses the page first, so nothing has woken its runtime.
	await page.evaluate(() => document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click());
	await rest();
	release();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	await rest();
	expect(await shown(page)).toEqual({ title: 'Reference page', left: 'guide', saved: 'guide' });
	await storedShows(page, 'guide');
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
