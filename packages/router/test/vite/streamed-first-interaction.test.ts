import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page, type Request } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// Answers the server streams are shown without the runtime; it starts at the first interaction, from preloaded code, and adopts them.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-streamed-first-interaction-'));
	await cp(resolve(import.meta.dirname, '../fixtures/streamed-first-interaction-app'), root, {
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
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

type Host = { __asyncResumeRuntimeStarted?: unknown };

const runtimeStarted = (page: Page) =>
	page.evaluate(
		() =>
			!!(document.querySelector('[data-async-container]') as Host | null)
				?.__asyncResumeRuntimeStarted,
	);
const browserRuns = (page: Page) =>
	page.evaluate(() => (window as { browserRuns?: number }).browserRuns ?? 0);
const titles = (page: Page, shelf: string) =>
	page.locator(`[data-shelf="${shelf}"] .books li`).allTextContents();

async function openIdle(path: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const requests: Request[] = [];
	page.on('request', (request) => requests.push(request));
	await page.goto(`${server!.origin}${path}`, { waitUntil: 'load' });
	await page.evaluate(
		() =>
			new Promise<void>((done) =>
				(globalThis as unknown as { __mArm?: { idle: (run: () => void) => void } }).__mArm
					? (globalThis as unknown as { __mArm: { idle: (run: () => void) => void } }).__mArm.idle(
							() => requestIdleCallback(() => done()),
						)
					: requestIdleCallback(() => done()),
			),
	);
	// Idle-time link prefetches are the page's own, not the interaction's: wait until the network is quiet.
	for (let seen = -1; seen !== requests.length; ) {
		seen = requests.length;
		await page.waitForTimeout(500);
	}
	return { page, errors, requests };
}

test('streamed answers show before any interaction, and the runtime has not started', async () => {
	const { page, errors } = await openIdle('/');
	try {
		expect(await titles(page, 'all')).toEqual(['Dune', 'Emma', 'Ulysses']);
		expect(await page.locator('[data-shelf="remote"] .failed').textContent()).toContain(
			'shelf offline',
		);
		expect(await runtimeStarted(page)).toBe(false);
		expect(await browserRuns(page)).toBe(0);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('the first interaction fetches nothing, applies at once and keeps the streamed lists', async () => {
	const { page, errors, requests } = await openIdle('/');
	try {
		const before = requests.length;
		await page.click('.tap');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		await page.waitForTimeout(300);
		expect(requests.slice(before).map((request) => request.url())).toEqual([]);
		expect(await titles(page, 'all')).toEqual(['Dune', 'Emma', 'Ulysses']);
		expect(await browserRuns(page)).toBe(0);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a refresh, a save and a reset after the first interaction behave as before', async () => {
	const { page, errors } = await openIdle('/');
	try {
		await page.click('[data-shelf="all"] .filter');
		await expect.poll(() => titles(page, 'all')).toEqual(['Dune']);
		await page.click('[data-shelf="all"] .filter');
		await expect.poll(() => titles(page, 'all')).toEqual(['Dune', 'Emma', 'Ulysses']);
		await page.click('[data-shelf="remote"] .retry');
		await expect.poll(() => titles(page, 'remote')).toEqual(['Dune', 'Emma', 'Ulysses']);
		await page.click('[data-shelf="all"] .save');
		await expect
			.poll(() => titles(page, 'all'))
			.toEqual(['Dune', 'Emma', 'Ulysses', 'Middlemarch']);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a press before any code has arrived is held and applied, never lost', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let release = () => {};
	const released = new Promise<void>((done) => (release = done));
	await page.route('**/*.js', async (route) => {
		await released;
		await route.continue();
	});
	try {
		await page.goto(`${server!.origin}/`, { waitUntil: 'commit' });
		await page.locator('.tap').waitFor();
		await page.click('.tap');
		release();
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		await expect.poll(() => titles(page, 'all')).toEqual(['Dune', 'Emma', 'Ulysses']);
		expect(errors).toEqual([]);
	} finally {
		release();
		await page.close();
	}
});

test('a repeating timer started at idle keeps refreshing with no interaction', async () => {
	const { page, errors } = await openIdle('/ticking');
	try {
		await expect.poll(async () => Number(await page.locator('.ticks').textContent())).toBeGreaterThan(2);
		expect(await titles(page, 'all')).toEqual(['Dune', 'Emma', 'Ulysses']);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('after Back and Forward the page still answers its first interaction', async () => {
	const { page, errors } = await openIdle('/');
	try {
		await page.click('.away');
		await page.locator('[data-page="away"]').waitFor();
		await page.goBack();
		await page.locator('[data-page="home"]').waitFor();
		await expect.poll(() => titles(page, 'all')).toEqual(['Dune', 'Emma', 'Ulysses']);
		await page.click('.tap');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		await page.goForward();
		await page.locator('[data-page="away"]').waitFor();
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});
