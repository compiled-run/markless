import { describe, expect, test } from 'vitest';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';
import {
	startFragmentNavigation,
	type FragmentEarly,
	type FragmentNavigationApi,
} from '../src/vite/fragment-navigation.ts';
import { servedLinkBridge } from './support/link-bridge.ts';

type BridgeOptions = Pick<
	Parameters<typeof createServerEntry>[0],
	'documentNavigation' | 'prefetch' | 'dev' | 'linkBridgePaths'
>;

function bridgeEntry(options: BridgeOptions = {}) {
	return createServerEntry({
		navigationEntryPath: '/build/navigation.js',
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: {
					renderSsr: async () => ({
						html: '<a data-markless-router-link href="/about">About</a>',
					}),
				},
			}),
			'pages/about.tsrx': async () => ({
				default: { renderSsr: async () => ({ html: '<p>About</p>' }) },
			}),
		},
		routeFileIds: ['pages/index.tsrx', 'pages/about.tsrx'],
		...options,
	});
}

async function servedBridge(options: BridgeOptions = {}): Promise<string> {
	const entry = bridgeEntry(options);
	const html = await (await entry.fetch(new Request('http://router.test/'))).text();
	const bridge = servedLinkBridge(html, entry);
	if (bridge === undefined) throw new Error('served page carries no router link bridge');
	return bridge;
}

// Runs the bridge against a minimal document and reports whether a Link click is taken over.
function clickTakenOver(source: string, href: string): boolean {
	let listener: ((event: unknown) => unknown) | undefined;
	const root = {};
	const document = {
		currentScript: { closest: () => root },
		addEventListener: (type: string, handler: (event: unknown) => unknown) => {
			if (type === 'click') listener = handler;
		},
	};
	const location = {
		href: 'http://router.test/',
		hash: '',
		origin: 'http://router.test',
		assign: () => {},
	};
	const loadNavigation = () => Promise.reject(new Error('no navigation runtime here'));
	new Function(
		'document',
		'location',
		'loadNavigation',
		'setTimeout',
		source.replaceAll('import(', 'loadNavigation('),
	)(document, location, loadNavigation, () => {});
	let prevented = false;
	const anchor = {
		href,
		closest: () => anchor,
		hasAttribute: (name: string) => name === 'data-markless-router-link',
		getAttribute: () => null,
	};
	void listener?.({
		button: 0,
		target: anchor,
		preventDefault: () => {
			prevented = true;
		},
	});
	return prevented;
}

describe('router link bridge', () => {
	test('a built page calls one cached bridge module it preloads, and dev keeps the bridge inline', async () => {
		const entry = bridgeEntry();
		const html = await (await entry.fetch(new Request('http://router.test/'))).text();
		const stub =
			/<script type="module" async data-markless-router-link-resumer>import b from"([^"]+)";b\(/.exec(
				html,
			);
		expect(stub?.[1]).toMatch(/^\/_markless\/links\/[0-9a-z]+\.js$/);
		expect(html).toContain(`<link rel="modulepreload" href="${stub![1]}"`);
		expect(html).not.toContain('<script data-markless-router-link-resumer>');
		const module = entry.linkBridgeModules?.find((candidate) => candidate.path === stub![1]);
		expect(module?.source).toMatch(/^export default\(r,p,q\)=>/);
		// The build writes the bridge as a static file, so the page handler never answers for it.
		expect((await entry.fetch(new Request(`http://router.test${stub![1]}`))).status).toBe(404);

		const prebuilt = bridgeEntry({
			linkBridgePaths: ['/_markless/links/a.js', '/_markless/links/b.js'],
		});
		const prebuiltHtml = await (
			await prebuilt.fetch(new Request('http://router.test/'))
		).text();
		expect(prebuiltHtml).toContain('import b from"/_markless/links/a.js"');
		expect(prebuilt.linkBridgeModules).toBeUndefined();

		const dev = bridgeEntry({ dev: true });
		const devHtml = await (await dev.fetch(new Request('http://router.test/'))).text();
		expect(devHtml).toContain('<script data-markless-router-link-resumer>');
		expect(devHtml).not.toContain('/_markless/links/');
	});

	test('a built page runs its bridge as soon as it arrives, so the page’s own module scripts never wait for its download', async () => {
		const html = await (await bridgeEntry().fetch(new Request('http://router.test/'))).text();
		const stub = /<script\b([^>]*)\bdata-markless-router-link-resumer>import b from/.exec(html);
		expect(stub?.[1]).toMatch(/\btype="module"/);
		expect(stub?.[1]).toMatch(/\basync\b/);
	});

	test('declares only what the page uses at load', async () => {
		const source = await servedBridge({ prefetch: false });
		expect(source).not.toContain('prefetchAttr');
		expect(source).not.toContain('documentLoads');
		expect(clickTakenOver(source, 'http://router.test/about')).toBe(true);
	});

	test('link intent keeps the prefetch attribute its listener reads', async () => {
		const source = await servedBridge();
		expect(source).toContain('const prefetchAttr = "data-markless-router-prefetch"');
		expect(clickTakenOver(source, 'http://router.test/about')).toBe(true);
	});

	test('document navigation leaves route Links to the browser and keeps hash routes', async () => {
		const source = await servedBridge({ documentNavigation: 'document' });
		expect(source).not.toContain('documentLoads');
		expect(clickTakenOver(source, 'http://router.test/about')).toBe(false);
		expect(clickTakenOver(source, 'http://router.test/#/about')).toBe(true);
	});
});

type Listener = (event: unknown) => void;

// The load-time bridge in a minimal window whose run half fails to load, or loads, in the order given.
function bridgeBeforeRunHalf(loads: ('fails' | 'loads')[]) {
	const listeners = new Map<string, Set<Listener>>();
	const timers = new Map<number, () => void>();
	let timer = 0;
	let now = 0;
	const fetched: string[] = [];
	const left: string[] = [];
	const handed: (FragmentEarly | undefined)[] = [];
	const went: string[] = [];
	const location = {
		origin: 'http://router.test',
		href: 'http://router.test/',
		pathname: '/',
		search: '',
		assign: (href: string) => void left.push(href),
		reload: () => void left.push('reload'),
	};
	const w = {
		location,
		navigator: {},
		performance: { now: () => ++now, getEntriesByName: () => [], getEntriesByType: () => [] },
		addEventListener: (type: string, listener: Listener) => {
			const set = listeners.get(type) ?? new Set();
			listeners.set(type, set.add(listener));
		},
		removeEventListener: (type: string, listener: Listener) =>
			void listeners.get(type)?.delete(listener),
		setTimeout: (callback: () => void) => (timers.set(++timer, callback), timer),
		clearTimeout: (id: number) => void timers.delete(id),
		fetch: (href: string) => (fetched.push(href), new Promise<Response>(() => {})),
	};
	const table = { textContent: JSON.stringify([['/c/about.js'], { '/about': [0] }]) };
	const d = {
		defaultView: w,
		baseURI: 'http://router.test/',
		readyState: 'loading',
		head: { querySelectorAll: () => [], appendChild: () => {} },
		createElement: () => ({}),
		querySelectorAll: () => [table],
		querySelector: () => null,
		addEventListener: () => {},
	};
	const anchor: Record<string, unknown> = {
		nodeType: 1,
		href: 'http://router.test/about',
		target: '',
		relList: { contains: () => false },
		hasAttribute: (name: string) => name === 'data-link',
		getAttribute: () => null,
	};
	anchor.closest = () => anchor;
	const api: FragmentNavigationApi = {
		traverse: () => {},
		replay: () => {},
		go: (link) => (went.push((link as unknown as { href: string }).href), true),
	};
	startFragmentNavigation(
		d as unknown as Document,
		() => 'data-link',
		'data-links',
		async () => ({}),
		() =>
			loads.shift() === 'loads'
				? Promise.resolve(
						(...args: unknown[]) => (handed.push(args[5] as FragmentEarly), api),
					)
				: Promise.reject(new Error('the run half failed to load')),
		() => ({
			code: [],
			hoverDwellMs: 100,
			requestPrefix: '/_fragment',
			prefetchAttribute: 'data-prefetch',
			idleBytesPerSecond: 1,
			idleMeasuredBytes: 1,
		}),
		1000,
	);
	const dispatch = (type: string, event: Record<string, unknown> = {}) => {
		for (const listener of listeners.get(type) ?? [])
			listener({
				type,
				button: 0,
				target: anchor,
				composedPath: () => [anchor],
				preventDefault: () => {},
				...event,
			});
	};
	return {
		fetched,
		left,
		handed,
		went,
		location,
		dispatch,
		settled: () => new Promise((done) => setTimeout(done, 0)),
		deadline: () => {
			for (const [id, callback] of timers) {
				timers.delete(id);
				callback();
			}
		},
	};
}

describe('router link bridge after a failed run-half load', () => {
	test('a press after a failed load fetches its page and hands the next run that fetch, not the stale one', async () => {
		const bridge = bridgeBeforeRunHalf(['fails', 'loads']);
		bridge.dispatch('pointerdown');
		await bridge.settled();
		bridge.dispatch('pointerdown');
		await bridge.settled();
		expect(bridge.fetched).toEqual([
			'http://router.test/_fragment/about',
			'http://router.test/_fragment/about',
		]);
		expect(bridge.handed).toHaveLength(1);
		expect(bridge.handed[0]?.controller.signal.aborted).toBe(false);
	});

	test('Back during a failed load reloads the page its address names, and a hash-only Back keeps it', async () => {
		const bridge = bridgeBeforeRunHalf(['fails', 'fails']);
		bridge.dispatch('popstate', { target: {}, composedPath: () => [] });
		await bridge.settled();
		bridge.deadline();
		expect(bridge.left).toEqual([]);
		Object.assign(bridge.location, { pathname: '/about', href: 'http://router.test/about' });
		bridge.dispatch('popstate', { target: {}, composedPath: () => [] });
		await bridge.settled();
		bridge.deadline();
		expect(bridge.left).toEqual(['reload']);
	});

	test('two clicks after a failed load load the last clicked page once', async () => {
		const bridge = bridgeBeforeRunHalf(['fails', 'fails', 'fails']);
		bridge.dispatch('click');
		await bridge.settled();
		bridge.dispatch('click');
		await bridge.settled();
		bridge.dispatch('click');
		await bridge.settled();
		bridge.deadline();
		expect(bridge.left).toEqual(['http://router.test/about']);
	});

	test('a click whose retried load succeeds swaps, and the failed click before it never loads its page', async () => {
		const bridge = bridgeBeforeRunHalf(['fails', 'loads']);
		bridge.dispatch('click');
		await bridge.settled();
		bridge.dispatch('click');
		await bridge.settled();
		bridge.deadline();
		expect(bridge.went).toEqual(['http://router.test/about']);
		expect(bridge.left).toEqual([]);
	});
});
