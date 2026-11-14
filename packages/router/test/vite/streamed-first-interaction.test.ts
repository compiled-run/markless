import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type Page, type Request } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { PROTOCOL_LOCATOR_PATHS_ATTRIBUTE } from '../../../serializer/src/protocol-locator-paths.ts';
import { MARKLESS_FIRST_INTERACTION_ROW_LIMIT } from '../../../web/src/first-interaction-rows.ts';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// Answers the server streams are shown without the runtime; it starts at the first interaction, from preloaded code, and adopts them.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;
// WebKit has no requestIdleCallback, so it runs the start's fallback timing.
let webkitBrowser: Browser | undefined;
const engines = ['chromium', 'webkit'] as const;
const browserOf = (engine: (typeof engines)[number]) => (engine === 'webkit' ? webkitBrowser : browser)!;

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
	webkitBrowser = await launchBrowser(webkit);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await webkitBrowser?.close();
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

// The router's idle tier wakes its navigation code at idle on a page that links to another route and, on a fast link, prefetches the links in view and preloads their code; that is the page's own idle work, not the press's.
type IdleTierHost = { __marklessFragmentIdle?: Promise<boolean>; __marklessFragmentNav?: { prefetches: Map<string, unknown> } };
const idleTierWoken = (page: Page) =>
	expect
		.poll(
			() =>
				page.evaluate(async () => {
					const host = document as unknown as IdleTierHost;
					if (!host.__marklessFragmentNav) return false;
					return !(await host.__marklessFragmentIdle) || host.__marklessFragmentNav.prefetches.size > 0;
				}),
			{ timeout: 10_000 },
		)
		.toBe(true);

async function openIdle(path: string, on: Browser = browser!) {
	const page = await on.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const requests: Request[] = [];
	page.on('request', (request) => requests.push(request));
	await page.goto(`${server!.origin}${path}`, { waitUntil: 'load' });
	// The stream executor's reveal train, then one idle period; a headless page can go long without one, so it is bounded as the page's own idle work is.
	await page.evaluate(
		() =>
			new Promise<void>((done, fail) => {
				const arm = (globalThis as unknown as { __mArm?: { idle: (run: () => void) => void } }).__mArm;
				const stalled = setTimeout(() => fail(new Error('the stream executor never finished its reveal train')), 10_000);
				const idle = () => (clearTimeout(stalled), typeof requestIdleCallback === 'function' ? requestIdleCallback(() => done(), { timeout: 2000 }) : setTimeout(done));
				if (arm) arm.idle(idle);
				else idle();
			}),
	);
	// The page's own idle work runs in idle periods after this one: its resume modules, then link prefetches.
	await expect.poll(() => routeModuleEvaluated(page), { timeout: 10_000 }).toBe(true);
	// Idle-time link prefetches are the page's own, not the interaction's: wait until the network is quiet.
	for (let seen = -1, round = 0; seen !== requests.length; round++) {
		if (round === 20)
			throw new Error(`the network never went quiet: ${requests.slice(-6).map((request) => request.url()).join(', ')}`);
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

// Whether the chunk holding the page's own resume module, named by its route script, has run.
const routeModuleEvaluated = (page: Page) =>
	page.evaluate(() => {
		const route = JSON.parse(
			document.querySelector('script[type="@markless/core/route"]')?.textContent ?? '{}',
		) as { resume?: [string] };
		const packs = (globalThis as { __marklessPacks?: Record<string, unknown> }).__marklessPacks ?? {};
		return !!route.resume && new URL(route.resume[0], location.href).href in packs;
	});

for (const engine of engines)
test(`at idle the page evaluates its resume modules and the runtime stays asleep (${engine})`, async () => {
	const { page, errors } = await openIdle('/rows', browserOf(engine));
	try {
		expect(await routeModuleEvaluated(page)).toBe(true);
		expect(await runtimeStarted(page)).toBe(false);
		expect(
			await page.evaluate(
				() => !!(document.querySelector('[data-async-container]') as { __marklessDispatch?: unknown }).__marklessDispatch,
			),
		).toBe(false);
		expect(await browserRuns(page)).toBe(0);
		await page.locator('.pick').nth(1).click();
		await expect.poll(() => page.locator('.picked').textContent()).toBe('Picked Emma');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

for (const engine of engines)
test(`a page serving rows up to the limit stays asleep; one more row starts the runtime after load (${engine})`, async () => {
	for (const [rows, started] of [
		[MARKLESS_FIRST_INTERACTION_ROW_LIMIT, false],
		[MARKLESS_FIRST_INTERACTION_ROW_LIMIT + 1, true],
	] as const) {
		const { page, errors } = await openIdle(`/long?rows=${rows}`, browserOf(engine));
		try {
			expect(await page.locator('.pick').count()).toBe(rows);
			expect(await runtimeStarted(page)).toBe(started);
			await page.locator('.pick').nth(1).click();
			await expect.poll(() => page.locator('.picked').textContent()).toBe('Picked Book 1');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	}
});

for (const engine of engines)
test(`a press soon after load, before idle, starts the runtime once and fetches nothing (${engine})`, async () => {
	const page = await browserOf(engine).newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		await page.goto(`${server!.origin}/rows`, { waitUntil: 'load' });
		const requests: string[] = [];
		page.on('request', (request) => request.resourceType() === 'script' && requests.push(request.url()));
		await page.locator('.pick').nth(1).click();
		await expect.poll(() => page.locator('.picked').textContent()).toBe('Picked Emma');
		await page.locator('.pick').nth(0).click();
		await expect.poll(() => page.locator('.picked').textContent()).toBe('Picked Dune');
		expect(requests).toEqual([]);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('the census pinned at idle counts the served page, not the answers streamed after it', async () => {
	const { page, errors } = await openIdle('/');
	try {
		const census = await page.evaluate((attribute) => {
			const root = document.querySelector('[data-async-container]') as Element & {
				__marklessCensus?: unknown[];
				__marklessShifted?: number;
			};
			return { pinned: root.__marklessCensus?.length, served: parseInt(root.getAttribute(attribute) ?? ''), shifted: !!root.__marklessShifted };
		}, PROTOCOL_LOCATOR_PATHS_ATTRIBUTE);
		expect(census).toEqual({ pinned: census.served, served: census.served, shifted: false });
		await page.click('.tap');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a press on a row of a streamed list is the first interaction, and it applies', async () => {
	const { page, errors } = await openIdle('/rows');
	try {
		expect(await runtimeStarted(page)).toBe(false);
		await page.locator('.pick').nth(1).click();
		await expect.poll(() => page.locator('.picked').textContent()).toBe('Picked Emma');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

for (const engine of engines)
test(`the first interaction fetches nothing, applies at once and keeps the streamed lists (${engine})`, async () => {
	const { page, errors, requests } = await openIdle('/', browserOf(engine));
	try {
		await idleTierWoken(page);
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

// A proxy that ends the response where the first streamed arm would begin: cleanly, or by failing the body as the host does when a settle errors.
async function cutBeforeArms(upstream: string, fail = false) {
	const proxy = createServer(async (request, response) => {
		const answer = await fetch(`${upstream}${request.url}`, { headers: { accept: 'text/html' } });
		response.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'text/html' });
		const decoder = new TextDecoder();
		let held = '';
		for await (const chunk of answer.body as unknown as AsyncIterable<Uint8Array>) {
			held += decoder.decode(chunk, { stream: true });
			const at = held.indexOf('<template m:arm');
			if (at >= 0) {
				if (!fail) return void response.end(held.slice(0, at));
				response.write(held.slice(0, at));
				// The shell reaches the browser first; then the body fails, as when the host errors it after a failed settle.
				setTimeout(() => response.socket?.destroy(), 500);
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

test('an idle host inside a streamed arm ticks with no click', async () => {
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

// Same on main: a failed body leaves the document loading, so nothing on the page learns the answer will not come.
test.fails('a streamed answer that never arrives because the body failed settles with no click', async () => {
	const proxy = await cutBeforeArms(server!.origin, true);
	const page = await browser!.newPage();
	try {
		await page.goto(`${proxy.origin}/`, { waitUntil: 'commit' });
		await expect.poll(() => titles(page, 'all'), { timeout: 10_000 }).toEqual(['Dune', 'Emma', 'Ulysses']);
	} finally {
		await page.close();
		await proxy.close();
	}
});

test('a child with its own slower async value inside a streamed arm settles with no click', async () => {
	const { page, errors } = await openIdle('/nested');
	try {
		await expect.poll(() => page.locator('.outer .count').textContent()).toBe('3 books');
		await expect.poll(() => page.locator('.late').textContent(), { timeout: 5_000 }).toBe('late answer');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('shared() read only inside a streamed arm shows its value and updates on the first click', async () => {
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
			await idleTierWoken(page);
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

for (const engine of engines)
test(`two quick clicks as the first interaction both apply exactly once (${engine})`, async () => {
	const { page, errors } = await openIdle('/', browserOf(engine));
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

for (const engine of engines)
test(`Enter on a focused button with no pointer events applies (${engine})`, async () => {
	const { page, errors } = await openIdle('/', browserOf(engine));
	try {
		await page.focus('.tap');
		await page.keyboard.press('Enter');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a press forwarded while the resume module loads stays with the page it was pressed on', async () => {
	// Hold the page's resume module until the link's navigation has swapped the next page in.
	const probe = await browser!.newPage();
	await probe.goto(`${server!.origin}/`, { waitUntil: 'commit' });
	const resumeModule = await probe
		.locator('[data-markless-resume-module]')
		.first()
		.getAttribute('data-markless-resume-module');
	await probe.close();
	expect(resumeModule).toBeTruthy();
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let release = () => {};
	const released = new Promise<void>((done) => (release = done));
	await page.route(`${server!.origin}${resumeModule}`, async (route) => {
		await released;
		await route.continue();
	});
	try {
		await page.goto(`${server!.origin}/`, { waitUntil: 'commit' });
		await page.locator('.away').waitFor();
		await page.click('.away');
		await page.locator('[data-page="away"]').waitFor();
		release();
		await page.waitForTimeout(800);
		expect(errors).toEqual([]);
	} finally {
		release();
		await page.close();
	}
});

// The deferred triggers' idle clock, held by the test: every start that waits for the page's idle point waits for a release.
async function openHeld(path: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const held: Array<() => void> = [];
		const clock = { frame: (run: () => void) => requestAnimationFrame(run), idle: (run: () => void) => void held.push(run) };
		Object.defineProperty(Element.prototype, '__mClock', { configurable: true, get: () => clock });
		(window as { releaseIdle?: () => number }).releaseIdle = () => {
			const runs = held.splice(0);
			for (const run of runs) run();
			return runs.length;
		};
	});
	await page.goto(`${server!.origin}${path}`, { waitUntil: 'load' });
	return { page, errors };
}
const asked = (page: Page) =>
	page.evaluate(() => !!(document.querySelector('[data-async-container]') as { __mResume?: unknown }).__mResume);

for (const [name, path] of [
	['streamed rows over the limit', `/long?rows=${MARKLESS_FIRST_INTERACTION_ROW_LIMIT + 1}`],
	['rows over the limit served with the page', `/long?rows=1&shell=${MARKLESS_FIRST_INTERACTION_ROW_LIMIT + 1}`],
] as const)
	test(`a page with ${name} starts its runtime at the deferred triggers' idle point, as main's self-wake does, and at no other`, async () => {
		const { page, errors } = await openHeld(path);
		try {
			await page.locator('.pick').first().waitFor();
			await page.waitForTimeout(1_000);
			expect(await asked(page)).toBe(false);
			expect(await runtimeStarted(page)).toBe(false);
			await expect
				.poll(async () => (await page.evaluate(() => (window as unknown as { releaseIdle: () => number }).releaseIdle()), runtimeStarted(page)), { timeout: 10_000 })
				.toBe(true);
			expect(await browserRuns(page)).toBe(0);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

test('a page within the row limit evaluates nothing before the idle point, then only modules', async () => {
	const { page, errors } = await openHeld('/rows');
	try {
		await page.locator('.pick').first().waitFor();
		await page.waitForTimeout(1_000);
		expect(await asked(page)).toBe(false);
		await expect
			.poll(async () => (await page.evaluate(() => (window as unknown as { releaseIdle: () => number }).releaseIdle()), routeModuleEvaluated(page)), { timeout: 10_000 })
			.toBe(true);
		expect(await runtimeStarted(page)).toBe(false);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a value another tab stored while this page sleeps: the first press flips the value this page shows, as a started page does', async () => {
	const context = await browser!.newContext();
	const errors: string[] = [];
	try {
		const open = async () => {
			const page = await context.newPage();
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto(`${server!.origin}/stored`, { waitUntil: 'load' });
			await expect.poll(() => routeModuleEvaluated(page), { timeout: 10_000 }).toBe(true);
			return page;
		};
		const sleeping = await open();
		expect(await sleeping.locator('.mode').textContent()).toBe('Mode light');
		const other = await open();
		await other.click('.mode');
		await expect.poll(() => other.locator('.mode').textContent()).toBe('Mode dark');
		expect(await runtimeStarted(sleeping)).toBe(false);
		await sleeping.click('.mode');
		await expect.poll(() => sleeping.locator('.mode').textContent()).toBe('Mode dark');
		await sleeping.waitForTimeout(300);
		expect(await sleeping.locator('.mode').textContent()).toBe('Mode dark');
		expect(errors).toEqual([]);
	} finally {
		await context.close();
	}
});

test('the first interaction keeps the scroll position, the typed text and the focus the press gave', async () => {
	const { page, errors } = await openIdle('/tall');
	try {
		await page.locator('.note-title').fill('kept text');
		await page.evaluate(() => scrollTo(0, 1200));
		expect(await runtimeStarted(page)).toBe(false);
		await page.click('.pinned');
		await expect.poll(() => page.locator('.pinned').textContent()).toBe('Taps 1');
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => scrollY)).toBe(1200);
		expect(await page.locator('.note-title').inputValue()).toBe('kept text');
		expect(await page.evaluate(() => document.activeElement?.className)).toBe('pinned');
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a reload of a scrolled page that sleeps is restored to its scroll position, and its first press applies', async () => {
	const { page, errors } = await openIdle('/tall');
	try {
		await page.evaluate(() => scrollTo(0, 1500));
		await page.reload({ waitUntil: 'load' });
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(1500);
		await expect.poll(() => routeModuleEvaluated(page), { timeout: 10_000 }).toBe(true);
		expect(await runtimeStarted(page)).toBe(false);
		await page.click('.pinned');
		await expect.poll(() => page.locator('.pinned').textContent()).toBe('Taps 1');
		expect(await page.evaluate(() => scrollY)).toBe(1500);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a field the browser autofilled while the page sleeps keeps its value through the first interaction and is sent', async () => {
	const { page, errors } = await openIdle('/tall');
	try {
		const title = `autofilled ${Date.now()}`;
		// Autofill sets the value and fires input and change, with no key or pointer event.
		await page.evaluate((value) => {
			const field = document.querySelector<HTMLInputElement>('.note-title')!;
			field.value = value;
			field.dispatchEvent(new Event('input', { bubbles: true }));
			field.dispatchEvent(new Event('change', { bubbles: true }));
		}, title);
		await page.click('.pinned');
		await expect.poll(() => page.locator('.pinned').textContent()).toBe('Taps 1');
		expect(await page.locator('.note-title').inputValue()).toBe(title);
		await page.click('.note-submit');
		await expect.poll(async () => (await (await fetch(`${server!.origin}/api/notes`)).json()) as string[]).toContain(title);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

// Neither Playwright browser restores from the back/forward cache (Chromium: disabled for its automation delegate; WebKit: never kept), so the restore's own event is sent.
test('a back/forward cache restore of a sleeping page (pageshow, persisted) leaves its first press working', async () => {
	const { page, errors } = await openIdle('/');
	try {
		await page.evaluate(() => {
			dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
			dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
		});
		await page.click('.tap');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('1');
		await page.click('.tap');
		await expect.poll(() => page.locator('.tap').textContent()).toBe('2');
		expect(await titles(page, 'all')).toEqual(['Dune', 'Emma', 'Ulysses']);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
});

test('a handler that throws on the first press inside a streamed block reports once, and the next press applies', async () => {
	const { page, errors } = await openIdle('/faulty');
	try {
		expect(await runtimeStarted(page)).toBe(false);
		await page.click('.fail');
		await expect.poll(() => errors.filter((message) => message.includes('first press failed')).length).toBe(1);
		await page.click('.fail');
		await expect.poll(() => page.locator('.fail').textContent()).toBe('Tries 2');
		expect(await page.locator('.faulty .count').textContent()).toBe('3 books');
		expect(errors.filter((message) => !message.includes('first press failed'))).toEqual([]);
	} finally {
		await page.close();
	}
});
