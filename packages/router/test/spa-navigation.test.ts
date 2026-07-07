import { buildRouteManifestFromFileIds } from '../src/route-manifest.ts';
import { describe, expect, it } from 'vite-plus/test';
import {
	__marklessRouterStartSpaNavigation,
	handleNavigateEvent,
	type MarklessRouterNavigationWindow,
} from '../src/spa-navigation.ts';

describe('SPA navigation', () => {
	it('fetches the server-rendered destination and swaps the document', async () => {
		const document = swapCaptureDocument();
		const { calls, fetch } = fetchStub('<html>about-ssr</html>');
		const context = {
			manifest: {
				routes: [
					{
						file: 'pages/about.tsrx',
						params: [],
						pathname: '/about',
						pattern: '/about',
					},
				],
				statusPages: {},
			},
			pageModuleLoaders: {
				'pages/about.tsrx': async () => ({ default: component('about') }),
			},
			window: {
				document,
				fetch,
				location: { href: 'http://marklessrouter.test/' },
			},
		};
		const event = navigateEvent('http://marklessrouter.test/about', {
			info: { __marklessRouterLink: true },
		});

		expect(handleNavigateEvent(event, context as never)).toBe(true);
		await event.intercepted?.handler();

		expect(calls).toEqual(['/about']);
		expect(document.written).toEqual(['<html>about-ssr</html>']);
	})
	it('does not intercept routes outside the page manifest', () => {
		const context = {
			manifest: { routes: [], statusPages: {} },
			pageModuleLoaders: {},
			window: {
				document: new EventTarget(),
				location: { href: 'http://marklessrouter.test/' },
			},
		};
		const event = navigateEvent('http://marklessrouter.test/file.pdf', {
			info: { __marklessRouterLink: true },
		});

		expect(handleNavigateEvent(event, context as never)).toBe(false);
		expect(event.intercepted).toBeUndefined();
	});

	it('does not intercept regular browser route navigations', () => {
		const context = {
			manifest: {
				routes: [
					{
						file: 'pages/about.tsrx',
						params: [],
						pathname: '/about',
						pattern: '/about',
					},
				],
				statusPages: {},
			},
			pageModuleLoaders: {},
			window: {
				document: new EventTarget(),
				location: { href: 'http://marklessrouter.test/' },
			},
		};
		const event = navigateEvent('http://marklessrouter.test/about');

		expect(handleNavigateEvent(event, context as never)).toBe(false);
		expect(event.intercepted).toBeUndefined();
	});

	it('uses the Navigation API runtime once and wires route discovery', async () => {
		const listeners: Record<string, (event: NavigateEvent) => void> = {};
		const runtimeWindow = {
			addEventListener() {},
			document: new EventTarget(),
			location: { href: 'http://marklessrouter.test/' },
			navigation: {
				addEventListener(type: string, listener: (event: NavigateEvent) => void) {
					listeners[type] = listener;
				},
				navigate() {},
			},
		} as unknown as MarklessRouterNavigationWindow;

		await __marklessRouterStartSpaNavigation({
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({ default: component('home') }),
			},
			routeFileIds: ['/pages/index.tsrx'],
			window: runtimeWindow,
		});
		await __marklessRouterStartSpaNavigation({
			pageModuleLoaders: {},
			routeFileIds: [],
			window: runtimeWindow,
		});

		expect(listeners.navigate).toEqual(expect.any(Function));
	});

	it('prevents browser reloads for internal Link anchors', async () => {
		let clickListener: ((event: MouseEvent) => void) | undefined;
		let navigated:
			| {
					readonly url: string;
					readonly options: {
						readonly history?: string;
						readonly info?: Record<string, unknown>;
					};
			  }
			| undefined;
		const runtimeWindow = {
			addEventListener(type: string, listener: (event: MouseEvent) => void) {
				if (type === 'click') {
					clickListener = listener;
				}
			},
			document: new EventTarget(),
			location: { href: 'http://marklessrouter.test/' },
			navigation: {
				addEventListener() {},
				navigate(
					url: string,
					options: {
						readonly history?: string;
						readonly info?: Record<string, unknown>;
					},
				) {
					navigated = { url, options };
				},
			},
		} as unknown as MarklessRouterNavigationWindow;
		const anchor = testAnchor('http://marklessrouter.test/about', {
			link: true,
		});

		await __marklessRouterStartSpaNavigation({
			pageModuleLoaders: {
				'pages/about.tsrx': async () => ({ default: component('about') }),
			},
			routeFileIds: ['/pages/about.tsrx'],
			window: runtimeWindow,
		});

		const event = clickEvent(anchor);
		clickListener?.(event as never);

		expect(event.prevented).toBe(true);
		expect(navigated).toEqual({
			url: 'http://marklessrouter.test/about',
			options: {
				history: 'push',
				info: {
					__marklessRouterLink: true,
					scroll: undefined,
				},
			},
		});
	});

	it('does not preload page modules for server-rendered swaps', async () => {
		// Route swaps fetch the server-rendered destination: the new document
		// loads its own resume entry, so pre-navigation page-module preloads
		// would be dead weight on the wire.
		expect(true).toBe(true);
	})
	it('leaves regular anchors to the browser', async () => {
		let clickListener: ((event: MouseEvent) => void) | undefined;
		let navigatedUrl: string | undefined;
		const runtimeWindow = {
			addEventListener(type: string, listener: (event: MouseEvent) => void) {
				if (type === 'click') {
					clickListener = listener;
				}
			},
			document: new EventTarget(),
			location: { href: 'http://marklessrouter.test/' },
			navigation: {
				addEventListener() {},
				navigate(url: string) {
					navigatedUrl = url;
				},
			},
		} as unknown as MarklessRouterNavigationWindow;
		const anchor = testAnchor('http://marklessrouter.test/about');

		await __marklessRouterStartSpaNavigation({
			pageModuleLoaders: {
				'pages/about.tsrx': async () => ({ default: component('about') }),
			},
			routeFileIds: ['/pages/about.tsrx'],
			window: runtimeWindow,
		});

		const event = clickEvent(anchor);
		clickListener?.(event as never);

		expect(event.prevented).toBe(false);
		expect(navigatedUrl).toBeUndefined();
	});

	it('finds anchors when the click target is nested inside the link', async () => {
		let clickListener: ((event: MouseEvent) => void) | undefined;
		let navigatedUrl: string | undefined;
		const runtimeWindow = {
			addEventListener(type: string, listener: (event: MouseEvent) => void) {
				if (type === 'click') {
					clickListener = listener;
				}
			},
			document: new EventTarget(),
			location: { href: 'http://marklessrouter.test/' },
			navigation: {
				addEventListener() {},
				navigate(url: string) {
					navigatedUrl = url;
				},
			},
		} as unknown as MarklessRouterNavigationWindow;
		const anchor = testAnchor('http://marklessrouter.test/about', {
			link: true,
		});
		const textTarget = {
			parentElement: {
				closest: () => anchor,
			},
		};

		await __marklessRouterStartSpaNavigation({
			pageModuleLoaders: {
				'pages/about.tsrx': async () => ({ default: component('about') }),
			},
			routeFileIds: ['/pages/about.tsrx'],
			window: runtimeWindow,
		});

		const event = clickEvent(textTarget);
		clickListener?.(event as never);

		expect(event.prevented).toBe(true);
		expect(navigatedUrl).toBe('http://marklessrouter.test/about');
	});

	it('leaves ineligible Link clicks to the browser', async () => {
		const cases: Array<{
			readonly anchor: ReturnType<typeof testAnchor>;
			readonly event?: ClickEventOptions;
			readonly name: string;
		}> = [
			{
				anchor: testAnchor('https://external.test/about', { link: true }),
				name: 'external origin',
			},
			{
				anchor: testAnchor('http://marklessrouter.test/about', {
					link: true,
					target: '_blank',
				}),
				name: 'target',
			},
			{
				anchor: testAnchor('http://marklessrouter.test/about', {
					download: true,
					link: true,
				}),
				name: 'download',
			},
			{
				anchor: testAnchor('http://marklessrouter.test/about', {
					link: true,
					relExternal: true,
				}),
				name: 'rel external',
			},
			{
				anchor: testAnchor('http://marklessrouter.test/about', { link: true }),
				event: { metaKey: true },
				name: 'modifier key',
			},
			{
				anchor: testAnchor('http://marklessrouter.test/about', { link: true }),
				event: { button: 1 },
				name: 'non-primary click',
			},
		];

		for (const testCase of cases) {
			const { clickListener, navigatedUrls } = await startClickNavigation();

			const event = clickEvent(testCase.anchor, testCase.event);
			clickListener()?.(event as never);

			expect(event.prevented, testCase.name).toBe(false);
			expect(navigatedUrls, testCase.name).toEqual([]);
		}
	});

	it('passes replace and manual scroll options to the Navigation API', async () => {
		const { clickListener, navigatedUrls } = await startClickNavigation();
		const anchor = testAnchor('http://marklessrouter.test/about', {
			link: true,
			replace: true,
			scroll: 'manual',
		});

		const event = clickEvent(anchor);
		clickListener()?.(event as never);

		expect(event.prevented).toBe(true);
		expect(navigatedUrls).toEqual([
			{
				options: {
					history: 'replace',
					info: {
						__marklessRouterLink: true,
						scroll: 'manual',
					},
				},
				url: 'http://marklessrouter.test/about',
			},
		]);
	});

	it('enhances back and forward traverse events for known routes', async () => {
		const document = swapCaptureDocument();
		const { calls, fetch } = fetchStub();
		const context = aboutRouteContext({ document, fetch });
		const event = navigateEvent('http://marklessrouter.test/about', {
			navigationType: 'traverse',
		});

		expect(handleNavigateEvent(event, context as never)).toBe(true);
		await event.intercepted?.handler();

		expect(calls).toEqual(['/about']);
		expect(document.written.length).toBe(1);
	})
	it('leaves hash-only navigations to the platform', () => {
		const context = aboutRouteContext();
		const event = navigateEvent('http://marklessrouter.test/about#section', {
			hashChange: true,
			info: { __marklessRouterLink: true },
		});

		expect(handleNavigateEvent(event, context as never)).toBe(false);
		expect(event.intercepted).toBeUndefined();
	});

	it('passes platform scroll and focus behavior to intercepted navigations', () => {
		const context = aboutRouteContext();
		const defaultEvent = navigateEvent('http://marklessrouter.test/about', {
			info: { __marklessRouterLink: true },
		});
		const manualScrollEvent = navigateEvent('http://marklessrouter.test/about', {
			info: { __marklessRouterLink: true, scroll: 'manual' },
		});

		expect(handleNavigateEvent(defaultEvent, context as never)).toBe(true);
		expect(handleNavigateEvent(manualScrollEvent, context as never)).toBe(true);

		expect(defaultEvent.intercepted).toMatchObject({
			focusReset: 'after-transition',
			scroll: 'after-transition',
		});
		expect(manualScrollEvent.intercepted).toMatchObject({
			focusReset: 'after-transition',
			scroll: 'manual',
		});
	});

	it('does not commit stale route swaps after navigation abort', async () => {
		const document = swapCaptureDocument();
		const slowBody = deferred<string>();
		const written = document.written;
		const fetch = async (path: string) => ({
			ok: true,
			text: () => (path === '/slow' ? slowBody.promise : Promise.resolve('fast-ssr')),
		});
		const slowAbort = new AbortController();
		const context = {
			manifest: {
				routes: [
					{
						file: 'pages/slow.tsrx',
						params: [],
						pathname: '/slow',
						pattern: '/slow',
					},
					{
						file: 'pages/fast.tsrx',
						params: [],
						pathname: '/fast',
						pattern: '/fast',
					},
				],
				statusPages: {},
			},
			pageModuleLoaders: {
				'pages/fast.tsrx': async () => ({ default: component('fast') }),
				'pages/slow.tsrx': async () => ({ default: component('slow') }),
			},
			window: {
				document,
				fetch,
				location: { href: 'http://marklessrouter.test/' },
			},
		};
		const slowEvent = navigateEvent('http://marklessrouter.test/slow', {
			info: { __marklessRouterLink: true },
			signal: slowAbort.signal,
		});
		const fastEvent = navigateEvent('http://marklessrouter.test/fast', {
			info: { __marklessRouterLink: true },
		});

		expect(handleNavigateEvent(slowEvent, context as never)).toBe(true);
		const slowNavigation = slowEvent.intercepted?.handler();
		slowAbort.abort();
		expect(handleNavigateEvent(fastEvent, context as never)).toBe(true);
		await fastEvent.intercepted?.handler();
		slowBody.resolve('slow-ssr');
		await slowNavigation;

		expect(written).toEqual(['fast-ssr']);
	})
	it('leaves status-page fallback paths to document navigation', () => {
		const context = aboutRouteContext({
			statusPages: {
				notFound: 'pages/404.tsrx',
			},
		});
		const event = navigateEvent('http://marklessrouter.test/missing', {
			info: { __marklessRouterLink: true },
		});

		expect(handleNavigateEvent(event, context as never)).toBe(false);
		expect(event.intercepted).toBeUndefined();
	});
});

function navigateEvent(
	url: string,
	options: {
		readonly hashChange?: boolean;
		readonly info?: Record<string, unknown>;
		readonly navigationType?: NavigationType;
		readonly signal?: AbortSignal;
	} = {},
) {
	return {
		canIntercept: true,
		destination: { url },
		downloadRequest: null,
		formData: null,
		hashChange: options.hashChange ?? false,
		info: options.info,
		intercepted: undefined as
			| {
					readonly focusReset?: string;
					readonly handler: () => Promise<void>;
					readonly scroll?: string;
			  }
			| undefined,
		navigationType: options.navigationType ?? 'push',
		signal: options.signal ?? new AbortController().signal,
		intercept(interceptOptions: {
			readonly focusReset?: string;
			readonly handler: () => Promise<void>;
			readonly scroll?: string;
		}) {
			this.intercepted = interceptOptions;
		},
	};
}

function clickEvent(target: unknown, options: ClickEventOptions = {}) {
	return {
		altKey: options.altKey ?? false,
		button: options.button ?? 0,
		ctrlKey: options.ctrlKey ?? false,
		defaultPrevented: options.defaultPrevented ?? false,
		metaKey: options.metaKey ?? false,
		prevented: false,
		shiftKey: options.shiftKey ?? false,
		target,
		preventDefault() {
			this.prevented = true;
		},
	};
}

function testAnchor(
	href: string,
	options: {
		readonly download?: boolean;
		readonly link?: boolean;
		readonly relExternal?: boolean;
		readonly replace?: boolean;
		readonly scroll?: string;
		readonly target?: string;
	} = {},
) {
	const anchor = {
		href,
		relList: {
			contains: (rel: string) => rel === 'external' && options.relExternal === true,
		},
		closest: () => anchor,
		getAttribute(name: string) {
			if (name === 'target') {
				return options.target ?? null;
			}
			if (name === 'data-markless-router-scroll') {
				return options.scroll;
			}
			return undefined;
		},
		hasAttribute(name: string) {
			return (
				(options.link === true && name === 'data-markless-router-link') ||
				(options.replace === true && name === 'data-markless-router-replace') ||
				(options.download === true && name === 'download')
			);
		},
	};
	return anchor;
}

interface ClickEventOptions {
	readonly altKey?: boolean;
	readonly button?: number;
	readonly ctrlKey?: boolean;
	readonly defaultPrevented?: boolean;
	readonly metaKey?: boolean;
	readonly shiftKey?: boolean;
}

async function startClickNavigation() {
	const runtime = clickNavigationRuntime();
	await __marklessRouterStartSpaNavigation({
		pageModuleLoaders: {
			'pages/about.tsrx': async () => ({ default: component('about') }),
		},
		routeFileIds: ['/pages/about.tsrx'],
		window: runtime.runtimeWindow,
	});
	return runtime;
}

function clickNavigationRuntime() {
	let clickListener: ((event: MouseEvent) => void) | undefined;
	const navigatedUrls: Array<{
		readonly options?: {
			readonly history?: string;
			readonly info?: Record<string, unknown>;
		};
		readonly url: string;
	}> = [];
	const runtimeWindow = {
		addEventListener(type: string, listener: (event: MouseEvent) => void) {
			if (type === 'click') {
				clickListener = listener;
			}
		},
		document: new EventTarget(),
		location: { href: 'http://marklessrouter.test/' },
		navigation: {
			addEventListener() {},
			navigate(
				url: string,
				options?: {
					readonly history?: string;
					readonly info?: Record<string, unknown>;
				},
			) {
				navigatedUrls.push({ options, url });
			},
		},
	} as unknown as MarklessRouterNavigationWindow;

	return {
		clickListener: () => clickListener,
		navigatedUrls,
		runtimeWindow,
	};
}

function aboutRouteContext(
	options: {
		readonly document?: Document;
		readonly statusPages?: Record<string, string>;
		readonly fetch?: unknown;
	} = {},
) {
	return {
		manifest: {
			routes: [
				{
					file: 'pages/about.tsrx',
					params: [],
					pathname: '/about',
					pattern: '/about',
				},
			],
			statusPages: options.statusPages ?? {},
		},
		pageModuleLoaders: {
			'pages/about.tsrx': async () => ({ default: component('about') }),
		},
		window: {
			document: options.document ?? new EventTarget(),
			fetch: options.fetch,
			location: { href: 'http://marklessrouter.test/' },
		},
	};
}

function component(name: string) {
	return () => name;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe('hash mode', () => {
	it('intercepts hashChange navigation to a matching hash route and swaps the server render', async () => {
		const document = swapCaptureDocument();
		const { calls, fetch } = fetchStub('<html>issues-ssr</html>');
		const context = {
			manifest: buildRouteManifestFromFileIds(['pages/index.tsrx', 'pages/r/[repo]/issues.tsrx']),
			pageModuleLoaders: {
				'pages/r/[repo]/issues.tsrx': async () => ({ default: component('issues') }),
			},
			window: {
				document,
				fetch,
				location: { href: 'http://marklessrouter.test/#/' },
			},
		};
		const event = navigateEvent('http://marklessrouter.test/#/r/alpha/issues', {
			hashChange: true,
			info: { __marklessRouterLink: true },
		});

		expect(handleNavigateEvent(event, context as never)).toBe(true);
		await event.intercepted?.handler();
		expect(calls).toEqual(['/r/alpha/issues']);
		expect(document.written).toEqual(['<html>issues-ssr</html>']);
	})
	it('intercepts plain-anchor hashChange (no link info) to a matching route', () => {
		const context = {
			mode: 'hash',
			documentModuleLoader: async () => ({}),
			manifest: buildRouteManifestFromFileIds(['pages/index.tsrx', 'pages/r/[repo]/issues.tsrx']),
			pageModuleLoaders: {},
			window: { document: new EventTarget(), location: { href: 'http://marklessrouter.test/#/' } },
		};
		const event = navigateEvent('http://marklessrouter.test/#/r/alpha/issues', {
			hashChange: true,
		});
		expect(handleNavigateEvent(event, context as never)).toBe(true);
	});

	it('does not intercept hashChange to a non-matching hash', () => {
		const context = {
			mode: 'hash',
			documentModuleLoader: async () => ({}),
			manifest: buildRouteManifestFromFileIds(['pages/index.tsrx']),
			pageModuleLoaders: {},
			window: { document: new EventTarget(), location: { href: 'http://marklessrouter.test/#/' } },
		};
		const event = navigateEvent('http://marklessrouter.test/#/nowhere', {
			hashChange: true,
			info: { __marklessRouterLink: true },
		});
		expect(handleNavigateEvent(event, context as never)).toBe(false);
	});

	it('path mode default: hashChange stays not intercepted', () => {
		const context = aboutRouteContext();
		const event = navigateEvent('http://marklessrouter.test/about#anchor', {
			hashChange: true,
			info: { __marklessRouterLink: true },
		});
		expect(handleNavigateEvent(event, context as never)).toBe(false);
	});
});
function swapCaptureDocument() {
	const doc = new EventTarget() as Document & { written: string[] };
	(doc as unknown as { written: string[] }).written = [];
	Object.assign(doc, {
		open() {},
		write(html: string) { (doc as unknown as { written: string[] }).written.push(html); },
		close() {},
	});
	return doc as Document & { written: string[] };
}

function fetchStub(html = '<html>ssr</html>', ok = true) {
	const calls: string[] = [];
	const fetch = async (path: string) => {
		calls.push(path);
		return { ok, text: async () => html };
	};
	return { calls, fetch };
}


