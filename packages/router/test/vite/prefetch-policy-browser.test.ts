import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FragmentNavigationConfig } from '../../src/vite/entries/fragment-entry.ts';
import {
	FRAGMENT_IDLE_FRAGMENT_BYTES,
	FRAGMENT_IDLE_FRAGMENT_DECODED_BYTES,
	FRAGMENT_PATH_PREFIX,
	FRAGMENT_REGION_END,
	fragmentPageUrl,
	runFragmentNavigation,
	watchViewport,
} from '../../src/vite/fragment-navigation.ts';
import { prefetchPolicy, type RouterPrefetch } from '../../src/vite/prefetch-policy.ts';
import { PREFETCH_ATTRIBUTE } from '../../src/link-attributes.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// The run half's prefetch triggers in a real browser, on a page of links whose fragments the test answers:
// each trigger per network class, Save-Data, a hidden tab, the concurrency cap, per-link choices and abort on click.

vi.setConfig({ testTimeout: 30_000 });

const servers: { server: Server; held: ServerResponse[] }[] = [];
const LINK = 'data-link';
const LINKS = 40;
// 40 links 40 px apart from y=5 in an 800x600 viewport: links 0 to 14 are in view on landing.
const IN_VIEW = 15;

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
	// What the page measured its own downloads at; undefined leaves the browser's report to decide.
	readonly fast?: boolean;
	readonly connection?: { readonly effectiveType?: string; readonly saveData?: boolean };
	readonly hidden?: boolean;
	// Extra attributes per link index.
	readonly attributes?: Record<number, string>;
	// How long each fragment answer is held, in ms; Infinity never answers.
	readonly holdMs?: number;
	readonly answer?: (path: string) => { body: Buffer | string; headers?: Record<string, string> };
};

type Fetch = { readonly path: string; readonly purpose?: string; readonly at: number };

function config(prefetch: RouterPrefetch | undefined): FragmentNavigationConfig {
	const policy = prefetchPolicy(prefetch);
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
		appendMarker: '<!--append-->',
		pageEndComment: 'end',
		pageStartComment: 'start',
		containerAttributes: ['x', 'x'],
		keepAttributes: ['', '', '', '', ''],
		documentLoads: false,
		hoverDwellMs: 20,
		prefetchTtlMs: 30_000,
		prefetchConnections: policy.concurrency,
		prefetchOn: policy.levels,
		endpointPrefixes: ['/api'],
		idleFragments: 6,
		idleFragmentBytes: FRAGMENT_IDLE_FRAGMENT_BYTES,
		idleFragmentDecodedBytes: FRAGMENT_IDLE_FRAGMENT_DECODED_BYTES,
		idleWithoutConnectionInfo: true,
		prefetch: policy.levels.some(Boolean),
		pages: ['/p/:'],
	};
}

function landing(setup: Setup): string {
	const links = Array.from(
		{ length: LINKS },
		(_, index) =>
			`<a ${LINK} href="/p/${index}" ${setup.attributes?.[index] ?? ''} style="position:absolute;left:20px;top:${index * 40 + 5}px;height:30px;width:200px">page ${index}</a>`,
	).join('');
	const routes = Object.fromEntries(Array.from({ length: LINKS }, (_, i) => [`/p/${i}`, []]));
	return `<!doctype html><html><head></head><body style="margin:0;height:${LINKS * 40 + 600}px">${links}<script>
const d = document;
d.__marklessFragmentIdle = new Promise((done) => (window.__gate = done));
window.__navigated = [];
const run = (${runFragmentNavigation.toString()});
window.__api = run(d, ${JSON.stringify(config(setup.prefetch))}, ${JSON.stringify(routes)},
	async () => ({ navigate: async (_d, url) => void window.__navigated.push(url.pathname) }), new Set(), new Map(), undefined,
	async () => (${watchViewport.toString()}));
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
	const fetches: Fetch[] = [];
	const aborted: string[] = [];
	let open = 0;
	let mostOpen = 0;
	const started = Date.now();
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
		fetches.push({
			path: destination.pathname,
			purpose: request.headers.purpose as string | undefined,
			at: Date.now() - started,
		});
		open++;
		mostOpen = Math.max(mostOpen, open);
		const hold = setup.holdMs ?? 0;
		if (hold === Infinity) return void servers.at(-1)!.held.push(response);
		await new Promise((done) => setTimeout(done, hold));
		open--;
		const answer = setup.answer?.(destination.pathname) ?? {
			body: `<main>${destination.pathname}</main>${FRAGMENT_REGION_END}`,
		};
		response.writeHead(200, { 'content-type': 'text/html;charset=utf-8', ...answer.headers });
		response.end(answer.body);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	servers.push({ server, held: [] });
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	page.on('requestfailed', (request) => {
		const destination = fragmentPageUrl(new URL(request.url()));
		if (destination) aborted.push(destination.pathname);
	});
	await page.goto(`${origin}/`);
	return {
		page,
		fetches,
		aborted,
		mostOpen: () => mostOpen,
		paths: () => fetches.map((fetch) => fetch.path),
		held: () =>
			page.evaluate(() => [
				...(
					document as unknown as {
						__marklessFragmentNav: { prefetches: Map<string, unknown> };
					}
				).__marklessFragmentNav.prefetches.keys(),
			]),
		// Resolves the page's own-download measurement: whether its link is fast.
		measured: (fast: boolean) =>
			page.evaluate(
				(fast) => (window as unknown as { __gate: (v: boolean) => void }).__gate(fast),
				fast,
			),
	};
}

const settle = (page: Page, ms = 600) => page.waitForTimeout(ms);
const sorted = (paths: string[]) =>
	paths.toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const inView = Array.from({ length: IN_VIEW }, (_, index) => `/p/${index}`);

describe('idle tier', () => {
	test('by default it fetches six links in view on a fast link, never one out of view', async () => {
		const s = await open({});
		await s.measured(true);
		await settle(s.page, 1500);
		expect(s.fetches).toHaveLength(6);
		for (const fetch of s.fetches) {
			expect(inView).toContain(fetch.path);
			expect(fetch.purpose).toBe('prefetch');
		}
		await s.page.close();
	});

	test("by default it fetches nothing on a slow link; set to 'all' it does", async () => {
		const slow = await open({});
		await slow.measured(false);
		await settle(slow.page, 1500);
		expect(slow.fetches).toEqual([]);
		await slow.page.close();
		const all = await open({ prefetch: { idle: 'all' } });
		await all.measured(false);
		await settle(all.page, 1500);
		expect(all.fetches).toHaveLength(6);
		await all.page.close();
	});
});

describe('viewport tier', () => {
	test("off by default; 'all' fetches every page link in view, and links scrolled into view after", async () => {
		const off = await open({ prefetch: { idle: 'none' } });
		await off.measured(true);
		await settle(off.page);
		expect(off.fetches).toEqual([]);
		await off.page.close();
		const s = await open({ prefetch: { viewport: 'all', idle: 'none' } });
		await s.measured(false);
		await expect.poll(() => s.fetches.length).toBe(IN_VIEW);
		expect(sorted(s.paths())).toEqual(inView);
		await s.page.mouse.wheel(0, 800);
		await expect.poll(() => s.paths()).toContain('/p/34');
		expect(s.fetches.length).toBeGreaterThanOrEqual(IN_VIEW + 15);
		expect(new Set(s.paths()).size).toBe(s.fetches.length);
		await s.page.close();
	});

	test("'fast' fetches nothing on a link measured slow", async () => {
		const s = await open({ prefetch: { viewport: 'fast', idle: 'none' } });
		await s.measured(false);
		await settle(s.page);
		expect(s.fetches).toEqual([]);
		await s.page.close();
	});

	test('keeps at most the concurrency in flight, and fetches the link nearest the pointer first', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 3 },
			holdMs: 150,
		});
		// Rest the pointer on link 12's row, off the links, before the tier starts.
		await s.page.mouse.move(500, 12 * 40 + 20);
		await s.page.mouse.move(501, 12 * 40 + 20);
		await s.measured(true);
		await expect.poll(() => s.fetches.length, { timeout: 10_000 }).toBe(IN_VIEW);
		expect(s.mostOpen()).toBe(3);
		expect(s.paths().slice(0, 3).toSorted()).toEqual(['/p/11', '/p/12', '/p/13']);
		await s.page.close();
	});

	test("a link marked prefetch 'intent' is left out; one marked 'viewport' is fetched with the tier off", async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none' },
			attributes: { 3: `${PREFETCH_ATTRIBUTE}="intent"`, 4: `${PREFETCH_ATTRIBUTE}="none"` },
		});
		await s.measured(true);
		await expect.poll(() => s.fetches.length).toBe(IN_VIEW - 2);
		expect(s.paths()).not.toContain('/p/3');
		expect(s.paths()).not.toContain('/p/4');
		await s.page.close();
		const opted = await open({
			prefetch: { idle: 'none' },
			attributes: {
				5: `${PREFETCH_ATTRIBUTE}="viewport"`,
				30: `${PREFETCH_ATTRIBUTE}="viewport"`,
			},
		});
		await opted.measured(true);
		await expect.poll(() => opted.paths()).toEqual(['/p/5']);
		await opted.page.close();
	});
});

describe('intent', () => {
	test('a mouse resting on a link fetches it on a slow link by default', async () => {
		const s = await open({ connection: { effectiveType: '3g' } });
		await s.measured(false);
		await s.page.hover('a[href="/p/2"]');
		await expect
			.poll(() => s.fetches)
			.toEqual([expect.objectContaining({ path: '/p/2', purpose: 'prefetch' })]);
		await s.page.close();
	});

	test("'fast' intent waits for a fast link; 'none' never fetches on hover or focus", async () => {
		const fastOnly = await open({ prefetch: { intent: 'fast', idle: 'none' } });
		await fastOnly.measured(false);
		await fastOnly.page.hover('a[href="/p/2"]');
		await settle(fastOnly.page, 300);
		expect(fastOnly.fetches).toEqual([]);
		await fastOnly.page.close();
		const none = await open({ prefetch: { intent: 'none', idle: 'none' } });
		await none.measured(true);
		await none.page.hover('a[href="/p/2"]');
		await none.page.focus('a[href="/p/3"]');
		await settle(none.page, 300);
		expect(none.fetches).toEqual([]);
		await none.page.close();
	});
});

describe('never early', () => {
	test('under Save-Data no trigger fetches, and a click still navigates in place', async () => {
		const s = await open({
			prefetch: { intent: 'all', viewport: 'all', idle: 'all' },
			connection: { effectiveType: '4g', saveData: true },
		});
		await s.measured(true);
		await s.page.hover('a[href="/p/2"]');
		await settle(s.page);
		expect(s.fetches).toEqual([]);
		await s.page.click('a[href="/p/2"]');
		await expect
			.poll(() =>
				s.page.evaluate(() => (window as unknown as { __navigated: string[] }).__navigated),
			)
			.toEqual(['/p/2']);
		await s.page.close();
	});

	test('a hidden tab fetches nothing until it is shown', async () => {
		const s = await open({ prefetch: { viewport: 'all', idle: 'none' }, hidden: true });
		await s.measured(true);
		await settle(s.page);
		expect(s.fetches).toEqual([]);
		await s.page.evaluate(() => {
			(window as unknown as { __shown: boolean }).__shown = true;
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await expect.poll(() => s.fetches.length).toBe(IN_VIEW);
		await s.page.close();
	});
});

describe('a click', () => {
	test('cancels every speculative fetch still arriving except the clicked page, and starts no more', async () => {
		const s = await open({
			prefetch: { viewport: 'all', idle: 'none', concurrency: 4 },
			holdMs: Infinity,
		});
		await s.measured(true);
		await expect.poll(() => s.fetches.length).toBe(4);
		const [kept, ...others] = s.paths();
		await s.page.click(`a[href="${kept}"]`);
		await expect.poll(() => s.aborted.toSorted()).toEqual(others.toSorted());
		await settle(s.page);
		expect(s.fetches).toHaveLength(4);
		await s.page.close();
	});
});

describe('byte budget', () => {
	test('counts wire bytes: a compressed fragment far larger decoded completes; an uncompressed one past the budget stops', async () => {
		const big = `<main>${'x'.repeat(FRAGMENT_IDLE_FRAGMENT_BYTES * 3)}</main>${FRAGMENT_REGION_END}`;
		const compressed = await open({
			prefetch: { viewport: 'all', idle: 'none' },
			answer: () => ({ body: gzipSync(big), headers: { 'content-encoding': 'gzip' } }),
		});
		await compressed.measured(true);
		await expect.poll(() => compressed.fetches.length).toBe(IN_VIEW);
		expect(
			await compressed.page.evaluate(
				async (url) => (await (await fetch(url)).text()).length,
				`${FRAGMENT_PATH_PREFIX}/p/0`,
			),
		).toBe(big.length);
		await expect.poll(() => compressed.held().then((held) => held.length)).toBe(IN_VIEW);
		await compressed.page.close();
		const raw = await open({
			prefetch: { viewport: 'all', idle: 'none' },
			answer: () => ({ body: big }),
		});
		await raw.measured(true);
		await expect.poll(() => raw.fetches.length).toBe(IN_VIEW);
		await settle(raw.page);
		expect(await raw.held()).toEqual([]);
		await raw.page.close();
	});
});
