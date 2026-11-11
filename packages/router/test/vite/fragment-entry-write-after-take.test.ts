import { chromium, type Browser, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { rolldown } from 'rolldown';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A write between a click and its swap makes the page it fetched stale, as it does a page fetched ahead.

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
	const { output } = await build.generate({ format: 'es', codeSplitting: false });
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
			handlingProperty: '__handling',
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

const viewOf = (page: Page) => h(page, (h) => h.view());
const waitLog = (page: Page, line: string) =>
	page.waitForFunction(
		(line) => (window as unknown as { __h: H }).__h.log.some((entry) => entry.startsWith(line)),
		line,
	);

// What the bridge's write hook does: count the write and drop every page fetched ahead (vite/fragment-navigation.ts).
const write = (page: Page) =>
	h(page, (h) => {
		const state = h.state as unknown as {
			writes: number;
			prefetches: Map<string, { abort: () => void }>;
			visited: Map<string, string>;
		};
		state.writes++;
		for (const entry of state.prefetches.values()) entry.abort();
		state.prefetches.clear();
		state.visited.clear();
	});

describe('a write between the click and the swap', () => {
	test('a page taken from the prefetches is fetched again, and the page after the write shows', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.prefetch('/about');
			h.go('/about', 'push', { askedAt: 1 });
		});
		await write(page);
		await h(page, (h) => h.respond(0, { name: 'before', rest: false }));
		await page.waitForFunction(
			() =>
				(window as unknown as { __h: H }).__h.requests().length === 2 ||
				(window as unknown as { __h: H }).__h.log.some((line) =>
					line.startsWith('settled 0'),
				),
		);
		expect(await h(page, (h) => h.requests())).toEqual(['/about', '/about']);
		await h(page, (h) => h.respond(1, { name: 'after', rest: false }));
		await page.waitForFunction(
			() => document.querySelector('main')?.getAttribute('data-page') === 'after',
		);
		expect(await viewOf(page)).toMatchObject({ address: '/about', page: 'after' });
	});

	test('a page the click itself fetched is fetched again', async () => {
		const { page } = await open();
		await h(page, (h) => void h.go('/about'));
		await write(page);
		await h(page, (h) => h.respond(0, { name: 'before', pieces: [h.arm('one')], close: true }));
		await page.waitForFunction(
			() =>
				(window as unknown as { __h: H }).__h.requests().length === 2 ||
				(window as unknown as { __h: H }).__h.log.some((line) =>
					line.startsWith('settled 0'),
				),
		);
		expect(await h(page, (h) => h.requests())).toEqual(['/about', '/about']);
		await h(page, (h) => h.respond(1, { name: 'after', rest: false }));
		await page.waitForFunction(
			() => document.querySelector('main')?.getAttribute('data-page') === 'after',
		);
		expect((await viewOf(page)).page).toBe('after');
	});

	test('a page that keeps writing still navigates: the second fetch is shown whatever writes follow', async () => {
		const { page } = await open();
		await h(page, (h) => void h.go('/about'));
		await write(page);
		await h(page, (h) => h.respond(0, { name: 'before', rest: false }));
		await page.waitForFunction(
			() => (window as unknown as { __h: H }).__h.requests().length === 2,
		);
		await write(page);
		await h(page, (h) => h.respond(1, { name: 'after', rest: false }));
		await waitLog(page, 'settled 0');
		expect(await h(page, (h) => h.requests())).toEqual(['/about', '/about']);
		expect((await viewOf(page)).page).toBe('after');
	});

	test('with no write, the page fetched once is the one shown', async () => {
		const { page } = await open();
		await h(page, (h) => {
			h.go('/about');
			h.respond(0, { name: 'about', rest: false });
		});
		await waitLog(page, 'settled 0');
		expect(await h(page, (h) => h.requests())).toEqual(['/about']);
		expect((await viewOf(page)).page).toBe('about');
	});
});
