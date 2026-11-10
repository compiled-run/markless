import { chromium, type Browser, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { rolldown } from 'rolldown';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// Pins what the swap half (entries/fragment-entry.ts) does with a page fetch and a navigation in flight, in a real
// browser, against a stand-in for the state the link bridge leaves on the document.

vi.setConfig({ testTimeout: 30_000 });

const ORIGIN = 'http://router.test';
const DEADLINE_MS = 300;

let code = '';
let browser: Browser | undefined;

beforeAll(async () => {
	const build = await rolldown({
		input: resolve(import.meta.dirname, '../../src/vite/entries/fragment-entry.ts'),
		preserveEntrySignatures: 'strict',
	});
	const { output } = await build.generate({ format: 'es', inlineDynamicImports: true });
	await build.close();
	code = output[0]!.code;
	browser = await launchBrowser(chromium);
}, 120_000);

afterAll(async () => {
	await browser?.close();
});

const pageHtml = (name: string, title = name) =>
	`<!doctype html><html><head><title>${title}</title></head><body><main data-c data-page="${name}"><script type="markless/route"></script><h1>${name}</h1><!--page-end--></main></body></html>`;

type Harness = { readonly page: Page; readonly documents: string[] };

async function open(): Promise<Harness> {
	const page = await browser!.newPage();
	const documents: string[] = [];
	await page.route(`${ORIGIN}/**`, async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/swap.js')
			return route.fulfill({ contentType: 'text/javascript', body: code });
		if (route.request().resourceType() === 'document')
			documents.push(url.pathname + url.search);
		return route.fulfill({ contentType: 'text/html', body: pageHtml('home', 'Home') });
	});
	await page.goto(`${ORIGIN}/`);
	await install(page);
	return { page, documents };
}

async function install(page: Page): Promise<void> {
	await page.addScriptTag({
		type: 'module',
		content: `import * as swap from '/swap.js'; window.__swap = swap;`,
	});
	await page.waitForFunction(
		() => 'navigate' in ((window as never as { __swap?: object }).__swap ?? {}),
	);
	await page.evaluate((deadline) => {
		type Entry = {
			at: number;
			writes: number;
			expires?: number;
			result: Promise<unknown>;
			open: boolean;
			abort: () => void;
		};
		type Request = {
			url: URL;
			key: string;
			entry: Entry;
			resolve: (value: unknown) => void;
			stream?: ReadableStreamDefaultController<Uint8Array>;
		};
		const w = window as unknown as Record<string, unknown>;
		const log: string[] = [];
		const requests: Request[] = [];
		const navs: Promise<void>[] = [];
		const encoder = new TextEncoder();
		const keyOf = (url: URL) => url.pathname + url.search;
		const config = {
			entry: '',
			entryImports: [],
			linkAttribute: 'data-link',
			prefetchAttribute: 'data-prefetch',
			replaceAttribute: 'data-replace',
			scrollAttribute: 'data-scroll',
			routeScriptType: 'markless/route',
			servedHtmlAttributesProperty: '__servedHtml',
			servedBodyAttributesProperty: '__servedBody',
			stylesheetKeyAttribute: 'data-css',
			retireProperty: '__retire',
			reaskProperty: '__reask',
			sharedInstances: ['__shared', 'data-shared-resume'],
			streamExecutorGlobal: '__exec',
			streamedArmSelector: 'template[data-streamed]',
			streamOpenProperty: '__streamOpen',
			pendingDeadlineMs: deadline,
			renderedEvent: 'rendered',
			requestPrefix: '/_f',
			regionEndMarker: '<!--end-->',
			appendMarker: '<!--append-->',
			pageEndComment: 'page-end',
			pageStartComment: 'page-start',
			containerAttributes: ['data-c', 'data-paths'],
			keepAttributes: ['data-keep', 'data-own', 'data-vary', 'data-instance', '#text'],
			documentLoads: false,
			hoverDwellMs: 20,
			prefetchTtlMs: 30_000,
			prefetchConnections: 2,
			endpointPrefixes: [],
			idleFragments: 0,
			idleFragmentBytes: 0,
			idleWithoutConnectionInfo: false,
			prefetch: true,
			pages: [],
		};
		const state: Record<string, unknown> & {
			writes: number;
			stops?: number;
			prefetches: Map<string, Entry>;
			visited: Map<string, string>;
		} = {
			config,
			routes: {},
			prefetches: new Map(),
			visited: new Map(),
			writes: 0,
			fresh: (entry: Entry, now: number) => {
				log.push(`fresh ${now}`);
				return (
					entry.writes === state.writes &&
					now - entry.at < config.prefetchTtlMs &&
					(entry.expires === undefined || now < entry.expires)
				);
			},
			shown: '/',
			eligible: () => undefined,
			preloadCode: (url: URL, low: boolean) => log.push(`code ${keyOf(url)} ${low}`),
			request: (url: URL, speculative: boolean) => {
				const key = keyOf(url);
				log.push(`request ${key} ${speculative ? 'prefetch' : 'click'}`);
				let resolve!: (value: unknown) => void;
				let reject!: (error: unknown) => void;
				const result = new Promise((done, fail) => ((resolve = done), (reject = fail)));
				result.catch(() => {});
				const request: Request = { url, key, resolve, entry: undefined as never };
				const entry: Entry = {
					at: performance.now(),
					writes: state.writes,
					result,
					open: true,
					abort: () => {
						log.push(`abort ${key}`);
						entry.open = false;
						const aborted = new DOMException('aborted', 'AbortError');
						reject(aborted);
						try {
							request.stream?.error(aborted);
						} catch {}
					},
				};
				request.entry = entry;
				requests.push(request);
				return entry;
			},
			prefetch: () => {},
			parse: (url: string, text: string) => {
				const at = text.indexOf(config.regionEndMarker);
				const prefix = at === -1 ? text : text.slice(0, at);
				return {
					url,
					prefix,
					doc: new DOMParser().parseFromString(prefix, 'text/html'),
					tail: at === -1 ? '' : text.slice(at + config.regionEndMarker.length),
				};
			},
			idleDownloads: false,
			rescan: () => log.push('rescan'),
			stops: 0,
			scrolled: new Set(),
			arriving: new Map(),
		};
		w.__marklessFragmentNav = state;
		(document as unknown as Record<string, unknown>).__marklessFragmentNav = state;
		for (const method of ['pushState', 'replaceState'] as const) {
			const own = history[method].bind(history);
			history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
				const target = url ? new URL(String(url), location.href) : undefined;
				log.push(
					`${method} ${target ? target.pathname + target.search + target.hash : ''}`,
				);
				own(data, unused, url);
			};
		}
		document.addEventListener('rendered', () => {
			const arms = document.querySelectorAll('[data-arm]').length;
			log.push(
				`rendered ${document.querySelector('main')?.getAttribute('data-page')} arms=${arms}`,
			);
		});
		const swap = w.__swap as {
			navigate: (...args: unknown[]) => Promise<void>;
		};
		w.__h = {
			log,
			state,
			go: (
				path: string,
				mode = 'push',
				options: { scroll?: unknown; stops?: number | null; askedAt?: number } = {},
			) => {
				const stops = options.stops === null ? undefined : (options.stops ?? state.stops);
				const index = navs.length;
				navs.push(
					swap
						.navigate(
							document,
							new URL(path, location.href),
							mode,
							options.scroll ?? 'reset',
							stops,
							options.askedAt,
						)
						.then(
							() => void log.push(`settled ${index}`),
							(error: unknown) => void log.push(`threw ${String(error)}`),
						),
				);
				return navs.length - 1;
			},
			prefetch: (path: string) => {
				const url = new URL(path, location.href);
				const entry = (state.request as (url: URL, speculative: boolean) => Entry)(
					url,
					true,
				);
				state.prefetches.set(keyOf(url), entry);
				return requests.length - 1;
			},
			respond: (
				index: number,
				options: {
					name: string;
					title?: string;
					url?: string;
					tail?: string;
					pieces?: string[];
					close?: boolean;
					rest?: boolean;
					region?: boolean;
				},
			) => {
				const request = requests[index]!;
				const body =
					options.region === false
						? `<!doctype html><html><head><title>x</title></head><body><p>no region</p></body></html>`
						: `<!doctype html><html><head><title>${options.title ?? options.name}</title></head><body><main data-c data-page="${options.name}"><script type="markless/route"></script><h1>${options.name}</h1><!--page-end--></main></body></html>`;
				const parsed = (state.parse as (url: string, text: string) => object)(
					new URL(options.url ?? request.url.href, location.href).href,
					`${body}${config.regionEndMarker}${options.tail ?? ''}`,
				);
				if (options.rest === false) return void request.resolve(parsed);
				const stream = new ReadableStream<Uint8Array>({
					start: (controller) => void (request.stream = controller),
					cancel: () => void log.push(`cancel ${request.key}`),
				});
				for (const piece of options.pieces ?? [])
					request.stream!.enqueue(encoder.encode(piece));
				if (options.close) request.stream!.close();
				request.resolve({ ...parsed, rest: stream.getReader() });
			},
			piece: (index: number, text: string) =>
				requests[index]!.stream!.enqueue(encoder.encode(text)),
			close: (index: number) => requests[index]!.stream!.close(),
			fail: (index: number) => requests[index]!.entry.abort(),
			requests: () => requests.map((request) => request.key),
			view: () => ({
				address: location.pathname + location.search + location.hash,
				page: document.querySelector('main')?.getAttribute('data-page'),
				title: document.title,
				arms: [...document.querySelectorAll('[data-arm]')].map((arm) => arm.textContent),
				shown: state.shown,
				open: '__streamOpen' in document,
				visited: [...state.visited.keys()],
				prefetches: [...state.prefetches.keys()],
			}),
			done: (index: number) => navs[index],
			arm: (text: string) => `<p data-arm>${text}</p>${config.appendMarker}`,
		};
	}, DEADLINE_MS);
}

type H = {
	log: string[];
	state: { writes: number; stops?: number; visited: Map<string, string> };
	go: (
		path: string,
		mode?: string,
		options?: { scroll?: unknown; stops?: number | null; askedAt?: number },
	) => number;
	prefetch: (path: string) => number;
	respond: (
		index: number,
		options: {
			name: string;
			title?: string;
			url?: string;
			tail?: string;
			pieces?: string[];
			close?: boolean;
			rest?: boolean;
			region?: boolean;
		},
	) => void;
	piece: (index: number, text: string) => void;
	close: (index: number) => void;
	fail: (index: number) => void;
	requests: () => string[];
	view: () => {
		address: string;
		page: string | null | undefined;
		title: string;
		arms: (string | null)[];
		shown: string;
		open: boolean;
		visited: string[];
		prefetches: string[];
	};
	done: (index: number) => Promise<void>;
	arm: (text: string) => string;
};

const h = <T>(page: Page, run: (h: H) => T | Promise<T>): Promise<T> =>
	page.evaluate(`(${run.toString()})(window.__h)`) as Promise<T>;

const logOf = (page: Page) => h(page, (h) => [...h.log]);
const viewOf = (page: Page) => h(page, (h) => h.view());
const settle = (page: Page, ms = 30) =>
	page.evaluate((ms) => new Promise((done) => setTimeout(done, ms)), ms);
const waitLog = (page: Page, line: string) =>
	page.waitForFunction(
		(line) => (window as unknown as { __h: H }).__h.log.some((entry) => entry.startsWith(line)),
		line,
	);
// Resolves once the page has asked for `count` documents, the landing included.
const documentsAsked = async (documents: string[], count: number) => {
	await vi.waitFor(() => expect(documents.length).toBe(count), { timeout: 5000 });
	return documents;
};

describe('the page fetch a navigation takes', () => {
	test('a fresh prefetch is swapped in without a new request, judged fresh as of the click (#535)', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.prefetch('/about');
			h.go('/about', 'push', { askedAt: 7 });
			h.respond(0, { name: 'about', rest: false });
		});
		await waitLog(page, 'settled 0');
		expect(await logOf(page)).toEqual([
			'request /about prefetch',
			'fresh 7',
			'pushState /about',
			'rendered about arms=0',
			'rescan',
			'settled 0',
		]);
		expect((await viewOf(page)).prefetches).toEqual([]);
	});

	test('without a click time, freshness is judged when the swap code runs', async () => {
		const { page } = await open();
		const [before, judged] = await h(page, (h) => {
			h.prefetch('/about');
			const before = performance.now();
			h.go('/about', 'push');
			return [before, Number(h.log.find((line) => line.startsWith('fresh '))!.slice(6))];
		});
		expect(judged).toBeGreaterThanOrEqual(before);
	});

	test('a prefetch older than a write is aborted and the page is fetched again, with its code', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.prefetch('/about');
			h.state.writes++;
			h.go('/about', 'push', { askedAt: 5 });
		});
		expect(await logOf(page)).toEqual([
			'request /about prefetch',
			'fresh 5',
			'abort /about',
			'code /about false',
			'request /about click',
		]);
		expect((await viewOf(page)).prefetches).toEqual([]);
	});

	test('an expired prefetch is aborted and fetched again', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.prefetch('/about');
			(
				h.state as unknown as { prefetches: Map<string, { expires?: number }> }
			).prefetches.get('/about')!.expires = 0;
			h.go('/about', 'push', { askedAt: 5 });
		});
		expect((await logOf(page)).slice(1)).toEqual([
			'fresh 5',
			'abort /about',
			'code /about false',
			'request /about click',
		]);
	});

	test('a click with no prefetch fetches the page and its code at once', async () => {
		const { page } = await open();
		await h(page, (h) => void h.go('/about'));
		expect(await logOf(page)).toEqual(['code /about false', 'request /about click']);
	});

	test('Back to a visited page restores its saved text without a fetch, aborting a newer prefetch of it', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.prefetch('/about');
			h.state.visited.set(
				'/about',
				'<!doctype html><html><head><title>about</title></head><body><main data-c data-page="about"><script type="markless/route"></script><h1>saved</h1><!--page-end--></main></body></html><!--end-->',
			);
			h.go('/about', 'traverse', { scroll: { x: 0, y: 0 }, stops: null });
		});
		await waitLog(page, 'settled 0');
		const log = await logOf(page);
		expect(log).toEqual([
			'request /about prefetch',
			'abort /about',
			'rendered about arms=0',
			'rescan',
			'settled 0',
		]);
		expect(await page.textContent('main h1')).toBe('saved');
	});
});

describe('a navigation in flight', () => {
	test('the address and history entry change only when the page swaps in (#452)', async () => {
		const { page } = await open();
		await h(page, (h) => void h.go('/about#part'));
		await settle(page);
		expect(await viewOf(page)).toMatchObject({ address: '/', page: 'home', shown: '/' });
		await h(page, (h) => h.respond(0, { name: 'about', title: 'About', rest: false }));
		await waitLog(page, 'settled 0');
		expect(await logOf(page)).toEqual([
			'code /about#part false'.replace('#part', ''),
			'request /about click',
			'pushState /about#part',
			'rendered about arms=0',
			'rescan',
			'settled 0',
		]);
		expect(await viewOf(page)).toMatchObject({
			address: '/about#part',
			page: 'about',
			title: 'About',
			shown: '/about',
			open: false,
		});
	});

	test('the response URL names the address, with the clicked link’s hash', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about#part');
			h.respond(0, { name: 'about', url: '/moved', rest: false });
		});
		await waitLog(page, 'settled 0');
		expect(await viewOf(page)).toMatchObject({ address: '/moved#part', shown: '/moved' });
	});

	test('replace mode replaces the history entry', async () => {
		const { page } = await open();
		const length = await page.evaluate(() => history.length);
		await h(page, (h) => {
			h.go('/about', 'replace');
			h.respond(0, { name: 'about', rest: false });
		});
		await waitLog(page, 'settled 0');
		expect((await logOf(page)).filter((line) => line.includes('State'))).toEqual([
			'replaceState /about',
		]);
		expect(await page.evaluate(() => history.length)).toBe(length);
	});

	test('a navigation asked with stops older than the page’s does nothing', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.state.stops = 2;
			h.go('/about', 'push', { stops: 1 });
		});
		await waitLog(page, 'settled 0');
		expect(await logOf(page)).toEqual(['settled 0']);
	});

	test('Back, a hash link or a click on the shown page while loading cancels the navigation and its fetch (#441, #452)', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.state.stops = (h.state.stops ?? 0) + 1;
			h.respond(0, { name: 'about', rest: false });
		});
		await waitLog(page, 'settled 0');
		expect(await logOf(page)).toEqual([
			'code /about false',
			'request /about click',
			'abort /about',
			'settled 0',
		]);
		expect(await viewOf(page)).toMatchObject({ address: '/', page: 'home', shown: '/' });
	});

	test('a stops bump while the stream is held cancels the navigation before it swaps', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.respond(0, { name: 'about', pieces: [h.arm('one')] });
		});
		await settle(page);
		await h(page, (h) => void (h.state.stops = (h.state.stops ?? 0) + 1));
		await waitLog(page, 'settled 0');
		expect(await logOf(page)).toEqual([
			'code /about false',
			'request /about click',
			'abort /about',
			'settled 0',
		]);
		expect((await viewOf(page)).page).toBe('home');
	});

	test('Back and Forward ignore stops', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about', 'traverse', { scroll: { x: 0, y: 0 }, stops: null });
			h.state.stops = (h.state.stops ?? 0) + 1;
			h.respond(0, { name: 'about', rest: false });
		});
		await waitLog(page, 'settled 0');
		expect((await viewOf(page)).page).toBe('about');
		expect((await logOf(page)).filter((line) => line.includes('State'))).toEqual([]);
	});

	test('a newer navigation supersedes one still loading', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.go('/other');
			h.respond(1, { name: 'other', rest: false });
		});
		await waitLog(page, 'settled 1');
		await h(page, (h) => h.respond(0, { name: 'about', rest: false }));
		await waitLog(page, 'settled 0');
		expect(await logOf(page)).toEqual([
			'code /about false',
			'request /about click',
			'code /other false',
			'request /other click',
			'pushState /other',
			'rendered other arms=0',
			'rescan',
			'settled 1',
			'abort /about',
			'settled 0',
		]);
		expect(await viewOf(page)).toMatchObject({ address: '/other', page: 'other' });
	});

	test('pagehide while loading cancels the swap', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			window.dispatchEvent(new PageTransitionEvent('pagehide'));
			h.respond(0, { name: 'about', rest: false });
		});
		await waitLog(page, 'settled 0');
		expect((await logOf(page)).slice(2)).toEqual(['abort /about', 'settled 0']);
		expect((await viewOf(page)).page).toBe('home');
		expect(await page.evaluate(() => history.scrollRestoration)).toBe('auto');
	});

	test('a page with no region falls back to a document load of the landed address at once', async () => {
		const { page, documents } = await open();
		const loaded = page.waitForRequest(`${ORIGIN}/moved`);
		await h(page, (h) => {
			h.go('/about#part');
			h.respond(0, { name: 'about', url: '/moved', region: false, rest: false });
		});
		await loaded;
		expect(await documentsAsked(documents, 2)).toEqual(['/', '/moved']);
	});
});

describe('a navigation whose page fetch fails', () => {
	test('a click falls back to loading the document once the deadline passes', async () => {
		const { page, documents } = await open();
		const loaded = page.waitForRequest(`${ORIGIN}/about`);
		await h(page, (h) => {
			h.go('/about');
			h.fail(0);
		});
		await loaded;
		expect(await documentsAsked(documents, 2)).toEqual(['/', '/about']);
	});

	test('the fallback waits for the deadline', async () => {
		const { page, documents } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.fail(0);
		});
		await settle(page, DEADLINE_MS / 3);
		expect(documents).toEqual(['/']);
	});

	test('Back, or a click on the shown page, within the deadline keeps the page (#469)', async () => {
		const { page, documents } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.fail(0);
		});
		await h(page, (h) => void (h.state.stops = (h.state.stops ?? 0) + 1));
		await settle(page, DEADLINE_MS * 2);
		expect(documents).toEqual(['/']);
		expect((await viewOf(page)).page).toBe('home');
	});

	test('a newer navigation within the deadline cancels the fallback', async () => {
		const { page, documents } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.fail(0);
			h.go('/other');
		});
		await settle(page, DEADLINE_MS * 2);
		expect(documents).toEqual(['/']);
	});

	test('pagehide within the deadline cancels the fallback', async () => {
		const { page, documents } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.fail(0);
			window.dispatchEvent(new PageTransitionEvent('pagehide'));
		});
		await settle(page, DEADLINE_MS * 2);
		expect(documents).toEqual(['/']);
	});

	test('Back or Forward reloads, whatever the stops', async () => {
		const { page, documents } = await open();
		const loaded = page.waitForRequest(`${ORIGIN}/`);
		await h(page, (h) => {
			h.go('/about', 'traverse', { scroll: { x: 0, y: 0 }, stops: null });
			h.fail(0);
			h.state.stops = (h.state.stops ?? 0) + 1;
		});
		await loaded;
		expect(await documentsAsked(documents, 2)).toEqual(['/', '/']);
	});
});

describe('the stream after the region', () => {
	test('arms that all arrived within the deadline are in place when the page shows', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.respond(0, { name: 'about', pieces: [h.arm('one'), h.arm('two')], close: true });
		});
		await waitLog(page, 'settled 0');
		// The rendered event goes out first; the arms go in later in the same task, before a paint.
		expect(await logOf(page)).toContain('rendered about arms=0');
		expect(await viewOf(page)).toMatchObject({
			arms: ['one', 'two'],
			open: false,
			visited: ['/about'],
		});
	});

	test('past the deadline the page shows with its stream open, and arms append as they arrive', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.respond(0, { name: 'about', pieces: [h.arm('one')] });
		});
		await waitLog(page, 'rendered');
		expect(await logOf(page)).toContain('rendered about arms=0');
		await page.waitForFunction(() => document.querySelectorAll('[data-arm]').length === 1);
		expect(await viewOf(page)).toMatchObject({ arms: ['one'], open: true, visited: [] });
		await h(page, (h) => h.piece(0, h.arm('two')));
		await page.waitForFunction(() => document.querySelectorAll('[data-arm]').length === 2);
		await h(page, (h) => h.close(0));
		await page.waitForFunction(() => !('__streamOpen' in document));
		expect(await viewOf(page)).toMatchObject({ arms: ['one', 'two'], visited: ['/about'] });
	});

	test('the leaving page’s stream stays open until the next page swaps in, not when it is asked for (#280)', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.respond(0, { name: 'about', pieces: [h.arm('one')] });
		});
		await waitLog(page, 'rendered');
		const resolved = await h(page, (h) => {
			const open = (document as unknown as { __streamOpen: Promise<void> }).__streamOpen;
			const flag = { done: false };
			void open.then(() => (flag.done = true));
			(window as unknown as { __flag: typeof flag }).__flag = flag;
			h.go('/other');
			return flag.done;
		});
		expect(resolved).toBe(false);
		await h(page, (h) => h.piece(0, h.arm('two')));
		await page.waitForFunction(() => document.querySelectorAll('[data-arm]').length === 2);
		expect(
			await page.evaluate(
				() => (window as unknown as { __flag: { done: boolean } }).__flag.done,
			),
		).toBe(false);
		await h(page, (h) => h.respond(1, { name: 'other', rest: false }));
		await waitLog(page, 'settled 1');
		expect(
			await page.evaluate(
				() => (window as unknown as { __flag: { done: boolean } }).__flag.done,
			),
		).toBe(true);
		expect(await viewOf(page)).toMatchObject({
			page: 'other',
			arms: [],
			open: false,
			visited: ['/other'],
		});
		// The aborted stream notices at its next piece, which it drops.
		await h(page, (h) => h.piece(0, h.arm('three')));
		await waitLog(page, 'cancel /about');
		await settle(page);
		expect(await viewOf(page)).toMatchObject({ page: 'other', arms: [], visited: ['/other'] });
	});

	test('a finished stream records the page for Back, the newest eight kept', async () => {
		const { page } = await open();
		for (let index = 0; index < 9; index++) {
			await h(
				page,
				new Function(
					'h',
					`h.go('/p${index}'); h.respond(${index}, { name: 'p${index}', close: true });`,
				) as (h: H) => void,
			);
			await waitLog(page, `settled ${index}`);
		}
		expect((await viewOf(page)).visited).toEqual([
			'/p1',
			'/p2',
			'/p3',
			'/p4',
			'/p5',
			'/p6',
			'/p7',
			'/p8',
		]);
	});
});
