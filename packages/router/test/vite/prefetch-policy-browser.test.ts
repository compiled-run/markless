import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FragmentNavigationConfig } from '../../src/vite/entries/fragment-entry.ts';
import {
	FRAGMENT_IDLE_FRAGMENT_BYTES,
	FRAGMENT_HELD_CHARS,
	FRAGMENT_IDLE_FRAGMENT_DECODED_BYTES,
	FRAGMENT_PATH_PREFIX,
	FRAGMENT_REGION_END,
	FRAGMENT_PRERENDERED,
	PREFETCH_MARKS,
	fragmentPageUrl,
	runFragmentNavigation,
	watchViewport,
} from '../../src/vite/fragment-navigation.ts';
import { prefetchPolicy, type RouterPrefetch } from '../../src/vite/prefetch-policy.ts';
import { PREFETCH_ATTRIBUTE } from '../../src/link-attributes.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// The run half's prefetch triggers in a real browser, on a page of links whose fragments a local server answers.
// Every "nothing was fetched" check waits on the step that would have fetched: the idle callback the test runs
// itself, the viewport tier's first intersection report, or a timer that fires after the hover's dwell timer.

vi.setConfig({ testTimeout: 30_000 });

const servers: { server: Server; held: ServerResponse[] }[] = [];
const LINK = 'data-link';
const LINKS = 40;
// 40 links 40 px apart from y=45 in an 800x600 viewport: links 0 to 13 are in view on landing; a home link sits at the top.
const IN_VIEW = 14;

let browser: Browser;
beforeAll(async () => {
	browser = await launchBrowser();
});
afterAll(async () => {
	await browser?.close();
	for (const { server, held } of servers) {
		for (const response of held) response.destroy();
		server.close();
	}
});

type Setup = {
	readonly prefetch?: RouterPrefetch;
	readonly connection?: { readonly effectiveType?: string; readonly saveData?: boolean };
	readonly hidden?: boolean;
	// Extra attributes per link index.
	readonly attributes?: Record<number, string>;
	// How long each fragment answer is held, in ms; Infinity never answers.
	readonly holdMs?: number;
	// chunked: sent in two writes with no declared length.
	readonly answer?: (path: string) => {
		body: Buffer | string;
		headers?: Record<string, string>;
		chunked?: boolean;
	};
	// The query the page lands with.
	readonly search?: string;
	// 'hang': a click's navigation never swaps, as when its page is still on its way.
	// 'throw': the swap module's navigate rejects.
	readonly navigation?: 'swap' | 'hang' | 'throw';
	readonly heldChars?: number;
	// How long a fetched page counts as fresh.
	readonly ttlMs?: number;
};

type Fetch = { readonly path: string; readonly purpose?: string };

function config(setup: Setup): FragmentNavigationConfig {
	const policy = prefetchPolicy(setup.prefetch);
	return {
		entry: '/entry.js',
		entryImports: [],
		linkAttribute: LINK,
		prefetchAttribute: PREFETCH_ATTRIBUTE,
		replaceAttribute: 'data-replace',
		scrollAttribute: 'data-scroll',
		routeScriptType: 'x',
		servedHtmlAttributesProperty: 'x',
		servedBodyAttributesProperty: 'x',
		stylesheetKeyAttribute: 'data-css',
		retireProperty: 'x',
		handlingProperty: 'x',
		reaskProperty: 'x',
		sharedInstances: ['x', 'x'],
		streamExecutorGlobal: 'x',
		streamedArmSelector: 'x',
		streamOpenProperty: 'x',
		pendingDeadlineMs: 5000,
		swapDeadlineMs: 5000,
		renderedEvent: 'rendered',
		requestPrefix: FRAGMENT_PATH_PREFIX,
		regionEndMarker: FRAGMENT_REGION_END,
		prerenderedMarker: FRAGMENT_PRERENDERED,
		appendMarker: '<!--append-->',
		pageEndComment: 'end',
		pageStartComment: 'start',
		containerAttributes: ['x', 'x'],
		keepAttributes: ['', '', '', '', ''],
		documentLoads: false,
		hoverDwellMs: 20,
		prefetchTtlMs: setup.ttlMs ?? 30_000,
		heldChars: setup.heldChars ?? FRAGMENT_HELD_CHARS,
		prefetchConnections: policy.concurrency,
		guessBudget: policy.budget,
		prefetchMarks: PREFETCH_MARKS,
		strictMoves: true,
		prefetchOn: policy.levels,
		endpointPrefixes: ['/api'],
		idleFragments: 6,
		idleFragmentBytes: FRAGMENT_IDLE_FRAGMENT_BYTES,
		idleFragmentDecodedBytes: FRAGMENT_IDLE_FRAGMENT_DECODED_BYTES,
		idleWithoutConnectionInfo: true,
		prefetch: policy.levels.some(Boolean),
		pages: ['/', '/p/:'],
	};
}

function landing(setup: Setup): string {
	const links = Array.from(
		{ length: LINKS },
		(_, index) =>
			`<a ${LINK} href="/p/${index}" ${setup.attributes?.[index] ?? ''} style="position:absolute;left:20px;top:${index * 40 + 45}px;height:30px;width:200px">page ${index}</a>`,
	).join('');
	const routes = Object.fromEntries([
		['/', []],
		...Array.from({ length: LINKS }, (_, i) => [`/p/${i}`, []]),
	]);
	return `<!doctype html><html><head></head><body style="margin:0;height:${LINKS * 40 + 600}px">
<a ${LINK} href="/" ${PREFETCH_ATTRIBUTE}="none" style="position:absolute;left:400px;top:5px">home</a>${links}<script>
const d = document;
d.__marklessFragmentIdle = new Promise((done) => (window.__gate = done));
window.__navigated = [];
window.__watched = 0;
const navigate = async (_d, url) => {
	window.__navigated.push(url.pathname);
	if (${JSON.stringify(setup.navigation ?? 'swap')} === 'hang') return new Promise(() => {});
	if (${JSON.stringify(setup.navigation ?? 'swap')} === 'throw') throw new Error('navigate failed');
	const state = d.__marklessFragmentNav;
	state.shown = url.pathname;
	history.pushState(null, '', url.href);
	state.rescan();
};
const watch = (${watchViewport.toString()});
const run = (${runFragmentNavigation.toString()});
window.__api = run(d, ${JSON.stringify(config(setup))}, ${JSON.stringify(routes)},
	async () => ({ navigate }), new Set(), new Map(), undefined,
	async () => (...a) => {
		const tier = watch(...a);
		return { ...tier, watch: (more) => (tier.watch(more), window.__watched++) };
	});
</script></body></html>`;
}

async function open(setup: Setup) {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	if (setup.connection)
		await page.addInitScript(
			(connection) => Object.defineProperty(navigator, 'connection', { value: connection }),
			setup.connection,
		);
	if (setup.hidden)
		await page.addInitScript(() => {
			Object.defineProperty(document, 'visibilityState', {
				configurable: true,
				get: () =>
					(window as unknown as { __shown?: boolean }).__shown ? 'visible' : 'hidden',
			});
		});
	// The test runs idle callbacks itself, and records every fragment fetch as the page makes it.
	await page.addInitScript((prefix) => {
		const w = window as unknown as Record<string, unknown>;
		const idle: (() => void)[] = [];
		w.requestIdleCallback = (callback: () => void) => idle.push(callback);
		w.__idle = () => idle.splice(0).map((callback) => callback()).length;
		const fetches: { path: string; purpose?: string }[] = [];
		w.__fetches = fetches;
		const send = window.fetch;
		window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
			const url = new URL(String(input), location.href);
			if (url.pathname.startsWith(`${prefix}/`))
				fetches.push({
					path: url.pathname.slice(prefix.length),
					purpose: (init?.headers as Record<string, string> | undefined)?.purpose,
				});
			return send.call(this, input, init);
		};
	}, FRAGMENT_PATH_PREFIX);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	const answered: Fetch[] = [];
	const aborted: string[] = [];
	let open = 0;
	let mostOpen = 0;
	// A real server: the browser decodes a compressed answer only off the network, never from a routed one.
	const server = createServer(async (request, response) => {
		const url = new URL(request.url!, 'http://localhost');
		const destination = fragmentPageUrl(url);
		if (!destination) {
			response.writeHead(200, {
				'content-type': url.pathname === '/' ? 'text/html' : 'text/javascript',
			});
			return response.end(url.pathname === '/' ? landing(setup) : '');
		}
		answered.push({
			path: destination.pathname,
			purpose: request.headers.purpose as string | undefined,
		});
		open++;
		mostOpen = Math.max(mostOpen, open);
		request.on('close', () => request.destroyed && open--);
		const hold = setup.holdMs ?? 0;
		if (hold === Infinity)
			return void servers.at(-1)!.held.push(
				Object.assign(response, { page: destination.pathname }),
			);
		await new Promise((done) => setTimeout(done, hold));
		open--;
		const answer = setup.answer?.(destination.pathname) ?? {
			body: `<main>${destination.pathname}</main>${FRAGMENT_REGION_END}`,
		};
		response.writeHead(200, { 'content-type': 'text/html;charset=utf-8', ...answer.headers });
		if (!answer.chunked) return void response.end(answer.body);
		const half = Math.floor(answer.body.length / 2);
		response.write(answer.body.slice(0, half));
		response.end(answer.body.slice(half));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const own: { server: Server; held: ServerResponse[] } = { server, held: [] };
	servers.push(own);
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	page.on('requestfailed', (request) => {
		const destination = fragmentPageUrl(new URL(request.url()));
		if (destination) aborted.push(destination.pathname);
	});
	await page.goto(`${origin}/${setup.search ?? ''}`);
	const fetches = () =>
		page.evaluate(() => (window as unknown as { __fetches: Fetch[] }).__fetches.slice());
	const paths = async () => (await fetches()).map((fetch) => fetch.path);
	return {
		page,
		errors,
		answered,
		aborted,
		fetches,
		paths,
		mostOpen: () => mostOpen,
		// Answers every response held so far, as an instantly answering server would have.
		release: () => {
			for (const response of own.held.splice(0)) {
				const path = (response as ServerResponse & { page: string }).page;
				if (response.destroyed) continue;
				open--;
				response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
				response.end(`<main>${path}</main>${FRAGMENT_REGION_END}`);
			}
		},
		// Runs the idle callbacks the page queued; the idle tier's fetches start inside them.
		idle: () => page.evaluate(() => (window as unknown as { __idle: () => number }).__idle()),
		// The page's first idle moment: guessing arms in the idle callback queued once the page is measured.
		armed: () =>
			expect
				.poll(() => page.evaluate(() => (window as unknown as { __idle: () => number }).__idle()))
				.toBeGreaterThan(0),
		// Resolves the page's own-download measurement: whether its link is fast.
		measured: (fast: boolean) =>
			page.evaluate(
				(fast) => (window as unknown as { __gate: (v: boolean) => void }).__gate(fast),
				fast,
			),
		// The viewport tier has observed the page's links and had its first intersection report.
		viewportSettled: async () => {
			await expect
				.poll(() => page.evaluate(() => (window as unknown as { __watched: number }).__watched))
				.toBeGreaterThan(0);
			await afterFrames(page);
		},
		// A timer scheduled now fires after the hover's dwell timer the test's pointer started.
		afterDwell: () => page.evaluate(() => new Promise((done) => setTimeout(done, 60))),
		held: () =>
			page.evaluate(() => [
				...(
					document as unknown as {
						__marklessFragmentNav: { prefetches: Map<string, unknown> };
					}
				).__marklessFragmentNav.prefetches.keys(),
			]),
		marks: (name: string) =>
			page.evaluate(
				(name) =>
					performance
						.getEntriesByName(name, 'mark')
						.map((mark) => (mark as PerformanceMark).detail),
				name,
			),
		allArrived: () =>
			page.evaluate(() =>
				[
					...(
						document as unknown as {
							__marklessFragmentNav: { prefetches: Map<string, { phase: number }> };
						}
					).__marklessFragmentNav.prefetches.values(),
				].every((entry) => entry.phase >= 2),
			),
	};
}

// Intersection observers report at the next rendering steps, which two animation frames have passed.
const afterFrames = (page: Page) =>
	page.evaluate(
		() =>
			new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
	);
const sorted = (paths: string[]) =>
	paths.toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const inView = Array.from({ length: IN_VIEW }, (_, index) => `/p/${index}`);

describe('idle tier', () => {
	test('by default it fetches six links in view on a fast link, never one out of view', async () => {
		const s = await open({});
		await s.measured(true);
		await expect.poll(s.idle).toBe(1);
		await expect.poll(async () => (await s.fetches()).length).toBe(6);
		await expect.poll(s.allArrived).toBe(true);
		await afterFrames(s.page);
		const fetches = await s.fetches();
		expect(fetches).toHaveLength(6);
		for (const fetch of fetches) {
			expect(inView).toContain(fetch.path);
			expect(fetch.purpose).toBe('prefetch');
		}
		await s.page.close();
	});

	test("by default it fetches nothing on a slow link; set to 'all' it does", async () => {
		const slow = await open({});
		await slow.measured(false);
		await afterFrames(slow.page);
		await slow.armed();
		expect(await slow.fetches()).toEqual([]);
		expect(await slow.marks(PREFETCH_MARKS[1])).toEqual([
			{ page: '/', reason: 'network', triggers: ['idle'] },
		]);
		await slow.page.close();
		const all = await open({ prefetch: { idle: 'all' } });
		await all.measured(false);
		await expect.poll(all.idle).toBe(1);
		await expect.poll(async () => (await all.fetches()).length).toBe(6);
		await all.page.close();
	});

	test('a click before the idle scan runs leaves the next page its own scan', async () => {
		const s = await open({});
		await s.measured(true);
		await s.page.locator('a[href="/p/2"]').click();
		await expect
			.poll(() =>
				s.page.evaluate(() => (window as unknown as { __navigated: string[] }).__navigated),
			)
			.toEqual(['/p/2']);
		// The landing page's scan and the next page's: the stale one does nothing, the current one runs.
		await expect.poll(s.idle).toBeGreaterThan(0);
		await expect
			.poll(async () => (await s.fetches()).filter((fetch) => fetch.path !== '/p/2').length)
			.toBe(6);
		await s.page.close();
	});
});

describe('viewport tier', () => {
	test("off by default; 'all' fetches every page link in view, and links scrolled into view after", async () => {
		const off = await open({ prefetch: { idle: 'none' } });
		await off.measured(true);
		await afterFrames(off.page);
		expect(await off.page.evaluate(() => (window as unknown as { __watched: number }).__watched)).toBe(0);
		expect(await off.fetches()).toEqual([]);
		await off.page.close();
		const s = await open({ prefetch: { viewport: 'all', idle: 'none' } });
		await s.measured(false);
		await s.armed();
		await expect.poll(async () => sorted(await s.paths())).toEqual(inView);
		await s.page.mouse.wheel(0, 800);
		await expect.poll(s.paths).toContain('/p/33');
		const paths = await s.paths();
		expect(new Set(paths).size).toBe(paths.length);
		await s.page.close();
	});

	test("'fast' fetches nothing on a link measured slow", async () => {
		const s = await open({ prefetch: { viewport: 'fast', idle: 'none' } });
		await s.measured(false);
		await s.armed();
		await s.viewportSettled();
		expect(await s.fetches()).toEqual([]);
		await s.page.close();
	});

	test('keeps at most the concurrency in flight, and fetches the link nearest the pointer first', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 3 },
			holdMs: 150,
		});
		// Rest the pointer on link 12's row, off the links, before the tier starts.
		await s.page.mouse.move(500, 12 * 40 + 60);
		await s.page.mouse.move(501, 12 * 40 + 60);
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length, { timeout: 10_000 }).toBe(IN_VIEW);
		expect(s.mostOpen()).toBe(3);
		expect((await s.paths()).slice(0, 3).toSorted()).toEqual(['/p/11', '/p/12', '/p/13']);
		await s.page.close();
	});

	test("a link marked prefetch 'intent' is left out; one marked 'viewport' is fetched with the tier off", async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none' },
			attributes: { 3: `${PREFETCH_ATTRIBUTE}="intent"`, 4: `${PREFETCH_ATTRIBUTE}="none"` },
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(IN_VIEW - 2);
		await expect.poll(s.allArrived).toBe(true);
		await afterFrames(s.page);
		expect(await s.paths()).not.toContain('/p/3');
		expect(await s.paths()).not.toContain('/p/4');
		await s.page.close();
		const opted = await open({
			prefetch: { idle: 'none' },
			attributes: {
				5: `${PREFETCH_ATTRIBUTE}="viewport"`,
				30: `${PREFETCH_ATTRIBUTE}="viewport"`,
			},
		});
		await opted.measured(true);
		await opted.armed();
		await expect.poll(opted.paths).toEqual(['/p/5']);
		await opted.page.close();
	});

	test('links the page adds after an interaction join the tier', async () => {
		const s = await open({ prefetch: { viewport: 'all', idle: 'none' } });
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(IN_VIEW);
		await s.page.evaluate((attribute) => {
			const button = document.createElement('button');
			button.textContent = 'more';
			button.style.cssText = 'position:absolute;left:400px;top:100px';
			button.onclick = () => {
				const link = document.createElement('a');
				link.href = '/p/39';
				link.setAttribute(attribute, '');
				link.textContent = 'added';
				link.style.cssText = 'position:absolute;left:400px;top:200px';
				document.body.append(link);
			};
			document.body.append(button);
		}, LINK);
		await s.page.click('button');
		await expect.poll(s.idle).toBeGreaterThan(0);
		await expect.poll(s.paths).toContain('/p/39');
		await s.page.close();
	});
});

describe('intent', () => {
	test('a mouse resting on a link fetches it on a slow link by default', async () => {
		const s = await open({ connection: { effectiveType: '3g' } });
		await s.measured(false);
		await s.armed();
		await s.page.hover('a[href="/p/2"]');
		await expect
			.poll(s.fetches)
			.toEqual([expect.objectContaining({ path: '/p/2', purpose: 'prefetch' })]);
		await s.page.close();
	});

	test("'fast' intent waits for a fast link; 'none' never fetches on hover or focus", async () => {
		const fastOnly = await open({ prefetch: { intent: 'fast', idle: 'none' } });
		await fastOnly.measured(false);
		await fastOnly.armed();
		await fastOnly.page.hover('a[href="/p/2"]');
		await fastOnly.afterDwell();
		expect(await fastOnly.fetches()).toEqual([]);
		await fastOnly.page.close();
		const none = await open({ prefetch: { intent: 'none', idle: 'none' } });
		await none.measured(true);
		await none.armed();
		await none.page.hover('a[href="/p/2"]');
		await none.page.focus('a[href="/p/3"]');
		await none.afterDwell();
		expect(await none.fetches()).toEqual([]);
		await none.page.close();
	});

	test('a hover fetches even when guesses fill every slot, and a later hover does not cancel it', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 1 },
			holdMs: Infinity,
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(1);
		const [guess] = await s.paths();
		await s.page.hover('a[href="/p/7"]');
		await expect.poll(s.paths).toContain('/p/7');
		await s.page.hover('a[href="/p/8"]');
		await expect.poll(s.paths).toContain('/p/8');
		await expect.poll(() => s.aborted).toEqual([guess]);
		await s.page.close();
	});
});

describe('never early', () => {
	test('under Save-Data no trigger fetches until a mouse press, and the click navigates in place', async () => {
		const s = await open({
			prefetch: { intent: 'all', viewport: 'all', idle: 'all' },
			connection: { effectiveType: '4g', saveData: true },
		});
		await s.measured(true);
		await s.armed();
		await s.viewportSettled();
		await s.idle();
		await s.page.hover('a[href="/p/2"]');
		await s.afterDwell();
		expect(await s.fetches()).toEqual([]);
		expect(await s.marks(PREFETCH_MARKS[1])).toEqual([
			{ page: '/', reason: 'save-data', triggers: ['viewport', 'idle'] },
		]);
		await s.page.click('a[href="/p/2"]');
		await expect
			.poll(() =>
				s.page.evaluate(() => (window as unknown as { __navigated: string[] }).__navigated),
			)
			.toEqual(['/p/2']);
		// The mouse press is the click starting, not a guess: it fetches the page.
		expect(await s.paths()).toEqual(['/p/2']);
		await s.page.close();
	});

	test('a hidden tab fetches nothing until it is shown', async () => {
		const s = await open({ prefetch: { viewport: 'all', idle: 'none' }, hidden: true });
		await s.measured(true);
		await s.armed();
		await s.viewportSettled();
		expect(await s.fetches()).toEqual([]);
		await s.page.evaluate(() => {
			(window as unknown as { __shown: boolean }).__shown = true;
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await expect.poll(async () => (await s.fetches()).length).toBe(IN_VIEW);
		await s.page.close();
	});
});

describe('a click', () => {
	test('cancels every speculative fetch still arriving except the clicked page, and starts no more', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 4 },
			holdMs: Infinity,
			navigation: 'hang',
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(4);
		const [kept, ...others] = await s.paths();
		await s.page.click(`a[href="${kept}"]`);
		await expect.poll(() => s.aborted.toSorted()).toEqual(others.toSorted());
		await afterFrames(s.page);
		expect(await s.fetches()).toHaveLength(4);
		await s.page.close();
	});

	test('cancelled by a click on the page shown, guessing resumes, and the pages it dropped are fetched again', async () => {
		// Only links 0 to 3 are guessed, so the pages fetched after the cancel can only be the ones dropped.
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 4 },
			holdMs: Infinity,
			navigation: 'hang',
			attributes: Object.fromEntries(
				Array.from({ length: LINKS - 4 }, (_, i) => [i + 4, `${PREFETCH_ATTRIBUTE}="intent"`]),
			),
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(4);
		const [kept, ...others] = await s.paths();
		await s.page.click(`a[href="${kept}"]`);
		await expect.poll(() => s.aborted.length).toBe(3);
		await s.page.click('a[href="/"]');
		await s.armed();
		await expect.poll(async () => (await s.paths()).slice(4).toSorted()).toEqual(others.toSorted());
		await s.page.close();
	});
});

describe('guess budget', () => {
	test('once a page has spent its budget, viewport and idle stop; intent still fetches; the next page starts afresh', async () => {
		const body = `<main>${'x'.repeat(10_000)}</main>${FRAGMENT_REGION_END}`;
		const size = Buffer.byteLength(body);
		const s = await open({
			prefetch: { viewport: 'all', idle: 'all', concurrency: 1, budget: 3 * size - 1 },
			answer: () => ({ body, headers: { 'content-length': String(size) } }),
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(3);
		await expect.poll(s.allArrived).toBe(true);
		await s.idle();
		await afterFrames(s.page);
		expect(await s.fetches()).toHaveLength(3);
		expect(await s.marks(PREFETCH_MARKS[0])).toEqual([{ page: '/', bytes: 3 * size }]);
		const guessed = await s.paths();
		const hovered = inView.find((path) => !guessed.includes(path))!;
		await s.page.hover(`a[href="${hovered}"]`);
		await expect.poll(s.paths).toContain(hovered);
		await s.page.click(`a[href="${hovered}"]`);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(7);
		await expect.poll(s.allArrived).toBe(true);
		await s.idle();
		await afterFrames(s.page);
		expect(await s.fetches()).toHaveLength(7);
		expect((await s.marks(PREFETCH_MARKS[0])).map((mark) => mark.page)).toEqual(['/', hovered]);
		await s.page.close();
	});
});

describe('guess budget, every exit', () => {
	test('a guess stopped for size with no declared length counts the bytes it received', async () => {
		const body = `<main>${'x'.repeat(1024 * 1024)}</main>${FRAGMENT_REGION_END}`;
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 1, budget: 600_000 },
			answer: () => ({ body, chunked: true }),
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.marks(PREFETCH_MARKS[0])).length).toBe(1);
		const [spent] = await s.marks(PREFETCH_MARKS[0]);
		expect(spent.bytes).toBeGreaterThanOrEqual(600_000);
		await afterFrames(s.page);
		// Each stops a little past 256 KiB: three at most, against all fourteen in view before.
		expect((await s.fetches()).length).toBeLessThanOrEqual(3);
		await s.page.close();
	});

	test('a guess cancelled to make room for intent is not guessed again on that page', async () => {
		// Every answer is held until the test releases it, so the guess is still arriving when the hover lands.
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 1 },
			holdMs: Infinity,
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(1);
		const [guess] = await s.paths();
		const hovered = inView.find((path) => path !== guess)!;
		await s.page.hover(`a[href="${hovered}"]`);
		await expect.poll(() => s.aborted).toEqual([guess]);
		await expect
			.poll(
				async () => {
					s.release();
					return (await s.fetches()).length;
				},
				{ timeout: 15_000 },
			)
			.toBe(IN_VIEW);
		s.release();
		await expect.poll(s.allArrived).toBe(true);
		await afterFrames(s.page);
		const paths = await s.paths();
		expect(paths.filter((path) => path === guess)).toHaveLength(1);
		expect(new Set(paths).size).toBe(IN_VIEW);
		await s.page.close();
	});

	test('a budget of 0 marks the budget spent at once, with the pathname only', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'all', budget: 0 },
			search: '?email=someone%40example.com',
		});
		await s.measured(true);
		await s.armed();
		await afterFrames(s.page);
		expect(await s.marks(PREFETCH_MARKS[0])).toEqual([{ page: '/', bytes: 0 }]);
		expect(await s.fetches()).toEqual([]);
		await s.page.close();
	});
});

describe('guessing resumes', () => {
	test('after a navigation that threw', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 4 },
			holdMs: Infinity,
			navigation: 'throw',
			attributes: Object.fromEntries(
				Array.from({ length: LINKS - 4 }, (_, i) => [i + 4, `${PREFETCH_ATTRIBUTE}="intent"`]),
			),
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(4);
		const [kept, ...others] = await s.paths();
		await s.page.click(`a[href="${kept}"]`);
		await expect.poll(() => s.aborted.length).toBe(3);
		await s.armed();
		await expect
			.poll(async () => (await s.paths()).slice(4).toSorted())
			.toEqual(others.toSorted());
		await s.page.close();
	});

	test('when the page returns from the back/forward cache', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 4 },
			holdMs: Infinity,
			navigation: 'hang',
			attributes: Object.fromEntries(
				Array.from({ length: LINKS - 4 }, (_, i) => [i + 4, `${PREFETCH_ATTRIBUTE}="intent"`]),
			),
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(4);
		const [kept, ...others] = await s.paths();
		await s.page.click(`a[href="${kept}"]`);
		await expect.poll(() => s.aborted.length).toBe(3);
		await s.page.evaluate(() =>
			window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
		);
		await s.armed();
		await expect
			.poll(async () => (await s.paths()).slice(4).toSorted())
			.toEqual(others.toSorted());
		await s.page.close();
	});
});

describe('memory', () => {
	test('pages fetched ahead are kept as text up to the cap, the oldest dropped first', async () => {
		// Each answer is 1 MB of text and the cap is 3.5 MB: three pages fit.
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 1 },
			heldChars: 3.5 * 1024 * 1024,
			answer: (path) => ({
				body: gzipSync(`<main>${path}${'x'.repeat(1024 * 1024)}</main>${FRAGMENT_REGION_END}`),
				headers: { 'content-encoding': 'gzip' },
			}),
		});
		await s.measured(true);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBe(IN_VIEW);
		await expect.poll(s.allArrived).toBe(true);
		expect(await s.held()).toEqual((await s.paths()).slice(-3));
		// A guess holds text, not a parsed document.
		expect(
			await s.page.evaluate(() =>
				Promise.all(
					[
						...(
							document as unknown as {
								__marklessFragmentNav: {
									prefetches: Map<string, { result: Promise<object> }>;
								};
							}
						).__marklessFragmentNav.prefetches.values(),
					].map(async (entry) => Object.getOwnPropertyDescriptor(await entry.result, 'doc')?.get !== undefined),
				),
			),
		).toEqual([true, true, true]);
		await s.page.close();
	});
});

describe('guessing state', () => {
	test("nothing is guessed, and no guess code runs, before the page's first idle moment", async () => {
		const s = await open({ prefetch: { viewport: 'all', idle: 'all' } });
		await s.measured(true);
		await afterFrames(s.page);
		expect(await s.page.evaluate(() => (window as unknown as { __watched: number }).__watched)).toBe(0);
		expect(await s.fetches()).toEqual([]);
		// Intent is not a guess: a hover still fetches before idle.
		await s.page.hover('a[href="/p/2"]');
		await expect.poll(s.paths).toEqual(['/p/2']);
		await s.armed();
		await expect.poll(async () => (await s.fetches()).length).toBeGreaterThan(1);
		await s.page.close();
	});

	test('a click in the same task as a cancel leaves guessing paused, without an error', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'all' },
			holdMs: Infinity,
			navigation: 'hang',
		});
		await s.measured(true);
		await s.armed();
		await s.page.locator('a[href="/p/2"]').click();
		await s.page.evaluate(() => {
			document.querySelector<HTMLAnchorElement>('a[href="/"]')!.click();
			document.querySelector<HTMLAnchorElement>('a[href="/p/3"]')!.click();
		});
		await afterFrames(s.page);
		await s.idle();
		expect(s.errors).toEqual([]);
		await s.page.close();
	});
});

describe('byte budget', () => {
	test('counts wire bytes: a compressed fragment far larger decoded completes; an uncompressed one past the budget stops', async () => {
		const big = `<main>${'x'.repeat(FRAGMENT_IDLE_FRAGMENT_BYTES * 3)}</main>${FRAGMENT_REGION_END}`;
		const compressed = await open({
			prefetch: { viewport: 'all', idle: 'none' },
			heldChars: 1e12,
			answer: () => ({ body: gzipSync(big), headers: { 'content-encoding': 'gzip' } }),
		});
		await compressed.measured(true);
		await compressed.armed();
		await expect.poll(async () => (await compressed.fetches()).length).toBe(IN_VIEW);
		expect(
			await compressed.page.evaluate(
				async (url) => (await (await fetch(url)).text()).length,
				`${FRAGMENT_PATH_PREFIX}/p/0`,
			),
		).toBe(big.length);
		await expect.poll(async () => (await compressed.held()).length).toBe(IN_VIEW);
		await compressed.page.close();
		const raw = await open({
			prefetch: { viewport: 'all', idle: 'none' },
			answer: () => ({ body: big }),
		});
		await raw.measured(true);
		await raw.armed();
		// Each stops a little past 256 KiB and counts what it received, so the 2 MiB budget ends guessing early.
		await expect.poll(async () => (await raw.marks(PREFETCH_MARKS[0])).length).toBe(1);
		await expect.poll(raw.allArrived).toBe(true);
		expect(await raw.held()).toEqual([]);
		expect((await raw.fetches()).length).toBeLessThan(IN_VIEW);
		await raw.page.close();
	});
});

describe('a prerendered fragment', () => {
	test('fetched ahead but never shown, it keeps the time limit like any other page', async () => {
		const s = await open({
			prefetch: { idle: 'none' },
			ttlMs: 200,
			answer: (path) => ({
				body: `<main>${path}</main>${FRAGMENT_PRERENDERED}${FRAGMENT_REGION_END}`,
			}),
		});
		await s.measured(true);
		await s.page.hover('a[href="/p/2"]');
		await expect.poll(s.held).toEqual(['/p/2']);
		await expect.poll(s.held).toEqual([]);
		await s.page.close();
	});

	test('shown pages are kept up to eight, and within the cap on held text, the oldest dropped first', async () => {
		const s = await open({ heldChars: 3.5 * 1024 * 1024 });
		const kept = (pages: [string, number][]) =>
			s.page.evaluate((pages) => {
				const state = (
					document as unknown as {
						__marklessFragmentNav: {
							keep: (key: string, text: string) => void;
							visited: Map<string, string>;
						};
					}
				).__marklessFragmentNav;
				for (const [key, size] of pages) state.keep(key, 'x'.repeat(size));
				return [...state.visited.keys()];
			}, pages);
		const small = Array.from({ length: 10 }, (_, i): [string, number] => [`/p/${i}`, 10]);
		expect(await kept(small)).toEqual(small.slice(2).map(([key]) => key));
		const large: [string, number][] = [
			['/p/20', 1024 * 1024],
			['/p/21', 1024 * 1024],
			['/p/22', 1024 * 1024],
			['/p/23', 1024 * 1024],
		];
		expect((await kept(large)).slice(-3)).toEqual(['/p/21', '/p/22', '/p/23']);
		expect(await kept([])).not.toContain('/p/20');
		await s.page.close();
	});
});

