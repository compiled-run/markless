import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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

// A proxy that ends the response where the first streamed arm would begin, as a dropped connection or a cancelled stream does.
async function cutBeforeArms(upstream: string) {
	const proxy = createServer(async (request, response) => {
		const answer = await fetch(`${upstream}${request.url}`, { headers: { accept: 'text/html' } });
		response.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'text/html' });
		const decoder = new TextDecoder();
		let held = '';
		for await (const chunk of answer.body as unknown as AsyncIterable<Uint8Array>) {
			held += decoder.decode(chunk, { stream: true });
			const at = held.indexOf('<template m:arm');
			if (at >= 0) {
				response.end(held.slice(0, at));
				return;
			}
		}
		response.end(held);
	});
	await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done));
	const { port } = proxy.address() as AddressInfo;
	return {
		origin: `http://127.0.0.1:${port}`,
		close: () => new Promise<void>((done) => proxy.close(() => done())),
	};
}

const scriptRequests = (requests: Request[], from: number) =>
	requests.slice(from).filter((request) => request.resourceType() === 'script').map((request) => request.url());

test('a visible host inside a streamed arm fires on scroll with no click', async () => {
	const { page, errors } = await openIdle('/watched');
	try {
		await page.locator('.sentinel').scrollIntoViewIfNeeded();
		await expect.poll(() => page.locator('.sentinel').textContent()).toBe('Seen 1');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

// Existing defect, same on main: an onIdle host inside a streamed arm never runs, even once the runtime has started.
test.fails('an idle host inside a streamed arm ticks with no click', async () => {
	const { page } = await openIdle('/watched');
	try {
		await expect.poll(async () => Number(await page.locator('.arm-ticks').textContent()), { timeout: 3_000 }).toBeGreaterThan(1);
	} finally {
		await page.close();
	}
});

test('a streamed answer that never arrives wakes the runtime and the block settles with no click', async () => {
	const proxy = await cutBeforeArms(server!.origin);
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		await page.goto(`${proxy.origin}/`, { waitUntil: 'load' });
		await expect.poll(() => titles(page, 'all'), { timeout: 10_000 }).toEqual(['Dune', 'Emma', 'Ulysses']);
		await expect.poll(() => titles(page, 'remote'), { timeout: 10_000 }).toEqual(['Dune', 'Emma', 'Ulysses']);
		expect(await browserRuns(page)).toBeGreaterThan(0);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
		await proxy.close();
	}
});

// Existing defect, same on main: a child's own slower @try inside a streamed arm stays on @pending.
test.fails('a child with its own slower async value inside a streamed arm settles with no click', async () => {
	const { page, errors } = await openIdle('/nested');
	try {
		await expect.poll(() => page.locator('.outer .count').textContent()).toBe('3 books');
		await expect.poll(() => page.locator('.late').textContent(), { timeout: 5_000 }).toBe('late answer');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

// Existing defect, same on main: a shared() value read only inside a streamed arm does not repaint on a write.
test.fails('shared() read only inside a streamed arm shows its value and updates on the first click', async () => {
	const { page, errors, requests } = await openIdle('/shared');
	try {
		expect(await page.locator('.theme').textContent()).toBe('Theme paper');
		const before = requests.length;
		await page.click('.flip');
		await expect.poll(() => page.locator('.theme').textContent()).toBe('Theme ink');
		expect(scriptRequests(requests, before)).toEqual([]);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

for (const [name, selector, effect] of [
	['a button inside the streamed arm', '[data-shelf="all"] .mark', async (page: Page) => expect.poll(() => page.locator('[data-shelf="all"] .mark').textContent()).toBe('Marked 1')],
	['the streamed @catch Retry', '[data-shelf="remote"] .retry', async (page: Page) => expect.poll(() => titles(page, 'remote')).toEqual(['Dune', 'Emma', 'Ulysses'])],
] as const)
	test(`${name} as the first interaction applies and fetches no script`, async () => {
		const { page, errors, requests } = await openIdle('/');
		try {
			const before = requests.length;
			await page.click(selector);
			await effect(page);
			await page.waitForTimeout(200);
			expect(scriptRequests(requests, before)).toEqual([]);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

for (const typed of [false, true])
	// Same on main: the form is sent in place but never marked aria-busy.
	test.fails(`a plain form inside the streamed arm as the first interaction is busy in the press task${typed ? ', with typed input' : ''}`, async () => {
		const { page, errors, requests } = await openIdle('/');
		try {
			await page.evaluate(() => {
				addEventListener('submit', (event) => {
					(window as { busyAtSubmit?: string | null }).busyAtSubmit = (event.target as Element).getAttribute('aria-busy');
				});
			});
			const title = typed ? `typed ${Date.now()}` : '';
			if (typed) await page.locator('[data-shelf="all"] .note-title').pressSequentially(title);
			const before = requests.length;
			await page.click('[data-shelf="all"] .note-submit');
			await expect.poll(() => page.evaluate(() => (window as { busyAtSubmit?: string | null }).busyAtSubmit)).toBe('true');
			await page.waitForTimeout(500);
			expect(scriptRequests(requests, before)).toEqual([]);
			if (typed) expect(await (await fetch(`${server!.origin}/api/notes`)).json()).toContain(title);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

test('two quick clicks as the first interaction both apply exactly once', async () => {
	const { page, errors } = await openIdle('/');
	try {
		await page.click('.tap');
		await page.click('.tap');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('2');
		await page.waitForTimeout(300);
		expect(await page.locator('.tap').textContent()).toBe('2');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('Enter on a focused button with no pointer events applies', async () => {
	const { page, errors } = await openIdle('/');
	try {
		await page.focus('.tap');
		await page.keyboard.press('Enter');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a link pressed before the runtime started leaves no runtime work on the next page', async () => {
	const { page, errors } = await openIdle('/');
	try {
		await page.click('.away');
		await page.locator('[data-page="away"]').waitFor();
		await page.waitForTimeout(500);
		await page.goBack();
		await page.locator('[data-page="home"]').waitFor();
		await page.waitForTimeout(500);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});
