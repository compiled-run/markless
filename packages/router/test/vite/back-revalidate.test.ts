import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import {
	chromium,
	firefox,
	webkit,
	type Browser,
	type BrowserType,
	type LaunchOptions,
	type Page,
} from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// Back and Forward show the page as it was left at once, then its async values re-ask quietly and update in place.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-back-revalidate-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/back-revalidate-app'), root, {
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
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}, 240_000);

afterAll(async () => {
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

type Seen = {
	first?: string;
	pending: boolean;
	pendingFrames: number;
	busy: boolean;
	persisted: boolean[];
};

// Installed before any page script: the list's first content, whether @pending or a busy mark appeared, and @pending frame count.
function record() {
	const w = window as unknown as { __seen: Seen; __resetSeen: () => void };
	const reset = () => {
		w.__seen = { pending: false, pendingFrames: 0, busy: false, persisted: w.__seen?.persisted ?? [] };
	};
	w.__resetSeen = reset;
	reset();
	const look = () => {
		const seen = w.__seen;
		if (document.querySelector('[data-pending]')) seen.pending = true;
		if (document.querySelector('[aria-busy="true"]')) seen.busy = true;
		const run = document.querySelector('[data-run]')?.textContent;
		if (run && seen.first === undefined) seen.first = run;
	};
	const frame = () =>
		requestAnimationFrame(() => {
			setTimeout(() => {
				if (document.querySelector('[data-pending]')) w.__seen.pendingFrames++;
			});
			frame();
		});
	frame();
	new MutationObserver(look).observe(document, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['aria-busy'],
	});
	addEventListener('pageshow', (event) => {
		if (event.persisted) reset();
		w.__seen.persisted.push(event.persisted);
		look();
	});
}

async function open(browser: Browser, path: string): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	page.on('pageerror', (error) => console.error(String(error)));
	await page.addInitScript(record);
	await page.goto(server!.origin + path);
	return page;
}

const landedOn = (page: Page, name: string) =>
	page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);

const run = async (page: Page) =>
	Number(await page.locator('[data-run]').textContent({ timeout: 5_000 }));

const seen = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);

const newerThan = (page: Page, before: number) =>
	page.waitForFunction(
		(old) => Number(document.querySelector('[data-run]')?.textContent) > old,
		before,
		{ timeout: 10_000 },
	);

const announced = (page: Page) =>
	page.evaluate(() => document.querySelector('[data-markless-announcer]')?.textContent ?? '');

// Marks the shown list and the caret so the update can be checked to land in place.
async function holdFocusAndScroll(page: Page): Promise<number> {
	await page.evaluate(() => {
		(document.querySelector('[data-run]') as HTMLElement & { __kept?: boolean }).__kept = true;
		(document.querySelector('[data-field]') as HTMLInputElement).focus({ preventScroll: true });
		window.scrollTo({ top: 400, behavior: 'instant' });
	});
	return page.evaluate(() => window.scrollY);
}

async function landedInPlace(page: Page, scrollY: number) {
	expect(
		await page.evaluate(() => ({
			kept: (document.querySelector('[data-run]') as HTMLElement & { __kept?: boolean }).__kept,
			focused: document.activeElement?.hasAttribute('data-field'),
			scrollY: window.scrollY,
		})),
	).toEqual({ kept: true, focused: true, scrollY });
}

const setFailing = (failing: boolean) =>
	fetch(`${server!.origin}/api/mode${failing ? '?fail=1' : ''}`, { method: 'POST' });

const firefoxInstalled = existsSync(firefox.executablePath());

const engines: ReadonlyArray<readonly [string, BrowserType]> = [
	['chromium', chromium],
	['webkit', webkit],
	...(firefoxInstalled ? [['firefox', firefox] as const] : []),
];

for (const [name, type] of engines) {
	describe(`Back to a page (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await launchBrowser(type);
		});
		afterAll(async () => {
			await browser?.close();
		});

		test('the router shows the page it held at once, then re-asks quietly in place', async () => {
			const page = await open(browser, '/other');
			await page.locator('[data-to-list]').click();
			await landedOn(page, 'list');
			const before = await run(page);
			await page.locator('[data-to-other]').click();
			await landedOn(page, 'other');
			await page.evaluate(() => (window as unknown as { __resetSeen: () => void }).__resetSeen());

			await page.goBack();
			await landedOn(page, 'list');
			const scrollY = await holdFocusAndScroll(page);
			await newerThan(page, before);
			const what = await seen(page);
			expect(what.first).toBe(String(before));
			expect(what.pending).toBe(false);
			expect(what.busy).toBe(false);
			expect(await announced(page)).toBe('');
			await landedInPlace(page, scrollY);
			await page.close();
		});

		test('a page the browser shows from its HTTP cache re-asks quietly in place', async () => {
			const page = await open(browser, '/list');
			const before = await run(page);
			await page.goto(`${server!.origin}/other`);
			await landedOn(page, 'other');

			await page.goBack();
			await landedOn(page, 'list');
			expect(
				await page.evaluate(
					() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type,
				),
			).toBe('back_forward');
			const fromCache = await page.evaluate(
				() =>
					(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
						.transferSize === 0,
			);
			const shown = await run(page);
			// WebKit under Playwright fetches the document again, so it already shows a newer answer.
			if (!fromCache) {
				expect(shown).toBeGreaterThan(before);
				await page.close();
				return;
			}
			const scrollY = await holdFocusAndScroll(page);
			await newerThan(page, before);
			const what = await seen(page);
			expect(what.first).toBe(String(before));
			// The replayed document parses its @pending arm before the old answer, but never paints it.
			expect(what.pendingFrames).toBe(0);
			expect(what.busy).toBe(false);
			expect(await announced(page)).toBe('');
			await landedInPlace(page, scrollY);
			await page.close();
		});
	});
}

const bfcache: LaunchOptions = {
	// The full Chromium build: the headless shell has no back-forward cache.
	channel: 'chromium',
	ignoreDefaultArgs: ['--disable-back-forward-cache'],
};

describe('Back to a page the back-forward cache restores (chromium)', () => {
	let browser: Browser;
	beforeAll(async () => {
		browser = await launchBrowser(chromium, bfcache);
	});
	afterAll(async () => {
		await browser?.close();
	});

	test('the restored page re-asks quietly in place', async () => {
		const page = await open(browser, '/list');
		const before = await run(page);
		await page.goto(`${server!.origin}/other`);
		await landedOn(page, 'other');

		await page.goBack({ waitUntil: 'commit' });
		await landedOn(page, 'list');
		const what = await seen(page);
		expect(what.persisted.at(-1)).toBe(true);
		const scrollY = await holdFocusAndScroll(page);
		await newerThan(page, before);
		expect(what.first).toBe(String(before));
		const after = await seen(page);
		expect(after.pending).toBe(false);
		expect(after.busy).toBe(false);
		expect(await announced(page)).toBe('');
		await landedInPlace(page, scrollY);
		await page.close();
	});

	test('a page left before its runtime woke still re-asks when restored', async () => {
		const page = await open(browser, '/list');
		const before = await run(page);
		await page.goto(`${server!.origin}/other`, { waitUntil: 'commit' });
		await landedOn(page, 'other');

		await page.goBack({ waitUntil: 'commit' });
		await landedOn(page, 'list');
		expect((await seen(page)).persisted.at(-1)).toBe(true);
		await newerThan(page, before);
		expect((await seen(page)).pending).toBe(false);
		await page.close();
	});
});

describe('a failed re-ask on Back (chromium)', () => {
	let browser: Browser;
	beforeAll(async () => {
		browser = await launchBrowser(chromium);
	});
	afterAll(async () => {
		await browser?.close();
		await setFailing(false);
	});

	test('keeps the content it showed and adds @catch after it', async () => {
		const page = await open(browser, '/other');
		await page.locator('[data-to-list]').click();
		await landedOn(page, 'list');
		const before = await run(page);
		await page.locator('[data-to-other]').click();
		await landedOn(page, 'other');
		await setFailing(true);

		await page.goBack();
		await landedOn(page, 'list');
		await page.locator('[data-failed]').waitFor({ timeout: 10_000 });
		expect(await run(page)).toBe(before);
		await page.close();
	});
});
