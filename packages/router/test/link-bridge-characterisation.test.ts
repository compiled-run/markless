import { describe, expect, test } from 'vitest';
import {
	startFragmentNavigation,
	type FragmentEarly,
	type FragmentNavigationApi,
} from '../src/vite/fragment-navigation.ts';

// Pins what the load-time link bridge does before, while and after its run half loads, as seen from the window it runs in.

type Listener = (event: unknown) => void;

type Anchor = Record<string, unknown> & { href: string };

type BridgeOptions = {
	// The page lists destinations, so the idle tier may wake the run half.
	readonly listed?: boolean;
	// The page has finished loading and its browser has requestIdleCallback.
	readonly idle?: boolean;
	// What the run half's go() answers for a held click.
	readonly goes?: boolean;
};

const DWELL_MS = 100;
const LEAVE_MS = 1000;
const LINK = 'data-link';
const PREFETCH = 'data-prefetch';

function bridge(options: BridgeOptions = {}) {
	const listeners = new Map<string, Listener[]>();
	const documentClicks: Listener[] = [];
	const timers = new Map<number, { readonly callback: () => void; readonly ms: number }>();
	const idleCallbacks: (() => void)[] = [];
	let timer = 0;
	let clock = 0;
	const log: string[] = [];
	const fetches: { readonly href: string; readonly signal: AbortSignal }[] = [];
	const preloaded: string[] = [];
	const loads: { readonly resolve: () => void; readonly reject: () => void }[] = [];
	const handed: (FragmentEarly | undefined)[] = [];
	const location = {
		origin: 'http://router.test',
		href: 'http://router.test/',
		pathname: '/',
		search: '',
		assign: (href: string) => void log.push(`assign ${href}`),
		reload: () => void log.push('reload'),
	};
	const w: Record<string, unknown> = {
		location,
		navigator: {},
		performance: {
			now: () => clock,
			getEntriesByName: () => [],
			getEntriesByType: () => [],
		},
		addEventListener: (type: string, listener: Listener) => {
			listeners.set(type, [...(listeners.get(type) ?? []), listener]);
		},
		removeEventListener: () => {},
		setTimeout: (callback: () => void, ms: number) => (
			timers.set(++timer, { callback, ms }),
			timer
		),
		clearTimeout: (id: number) => void timers.delete(id),
		fetch: (href: string, init: RequestInit) => {
			fetches.push({ href, signal: init.signal! });
			return new Promise<Response>(() => {});
		},
	};
	if (options.idle)
		w.requestIdleCallback = (callback: () => void) => idleCallbacks.push(callback);
	const table = {
		textContent: JSON.stringify([
			['/c/about.js', '/c/other.js'],
			{ '/about': [0], '/other': [1] },
		]),
	};
	const d = {
		defaultView: w,
		baseURI: 'http://router.test/',
		readyState: options.idle ? 'complete' : 'loading',
		head: {
			querySelectorAll: () => [],
			appendChild: (link: { href: string }) => void preloaded.push(link.href),
		},
		createElement: () => ({}),
		querySelectorAll: () => [table],
		querySelector: () => (options.listed ? table : null),
		addEventListener: (type: string, listener: Listener) => {
			if (type === 'click') documentClicks.push(listener);
		},
	};
	const api: FragmentNavigationApi = {
		traverse: () => void log.push('traverse'),
		replay: (event) => void log.push(`replay ${event?.type ?? 'none'}`),
		go: (link, askedAt) => {
			log.push(`go ${(link as unknown as Anchor).href} at ${askedAt}`);
			return options.goes ?? true;
		},
	};
	startFragmentNavigation(
		d as unknown as Document,
		() => LINK,
		'data-links',
		async () => ({}),
		() =>
			new Promise((resolve, reject) =>
				loads.push({
					resolve: () =>
						resolve((...args: unknown[]) => {
							handed.push(args[5] as FragmentEarly | undefined);
							log.push('run');
							return api;
						}),
					reject: () => reject(new Error('the run half failed to load')),
				}),
			),
		() => ({
			code: ['/c/swap.js'],
			hoverDwellMs: DWELL_MS,
			requestPrefix: '/_fragment',
			prefetchAttribute: PREFETCH,
			idleBytesPerSecond: 1,
			idleMeasuredBytes: 1,
		}),
		LEAVE_MS,
	);
	const anchor = (
		href: string,
		attributes: Record<string, string> = { [LINK]: '' },
		extra: Record<string, unknown> = {},
	): Anchor => {
		const element: Anchor = {
			nodeType: 1,
			href: new URL(href, 'http://router.test/').href,
			target: '',
			relList: { contains: (name: string) => attributes.rel === name },
			hasAttribute: (name: string) => name in attributes,
			getAttribute: (name: string) => attributes[name] ?? null,
			...extra,
		};
		element.closest = () => element;
		return element;
	};
	const event = (
		type: string,
		target: Anchor | undefined,
		extra: Record<string, unknown> = {},
	) => {
		const fired: Record<string, unknown> = {
			type,
			button: 0,
			target,
			defaultPrevented: false,
			composedPath: () => (target ? [target] : []),
			preventDefault: () => void (fired.defaultPrevented = true),
			...extra,
		};
		return fired;
	};
	const fire = (fired: Record<string, unknown>) => {
		for (const listener of listeners.get(fired.type as string) ?? []) listener(fired);
		return fired;
	};
	return {
		log,
		fetches,
		preloaded,
		loads,
		handed,
		location,
		anchor,
		at: (time: number) => void (clock = time),
		dispatch: (type: string, target?: Anchor, extra?: Record<string, unknown>) =>
			fire(event(type, target, extra)),
		// A click that bubbles to the document once window capture listeners saw it.
		click: (target: Anchor, extra?: Record<string, unknown>) => {
			const fired = fire(event('click', target, extra));
			for (const listener of documentClicks.splice(0)) listener(fired);
			return fired.defaultPrevented as boolean;
		},
		pending: () => [...timers.values()].map((entry) => entry.ms),
		elapse: (ms: number) => {
			for (const [id, entry] of timers)
				if (entry.ms === ms) {
					timers.delete(id);
					entry.callback();
				}
		},
		idle: () => {
			for (const callback of idleCallbacks.splice(0)) callback();
		},
		settled: () => new Promise((done) => setTimeout(done, 0)),
	};
}

const ABOUT = 'http://router.test/about';
const OTHER = 'http://router.test/other';
const ABOUT_FRAGMENT = 'http://router.test/_fragment/about';

describe('link bridge before the run half loads', () => {
	test('a press fetches its page and code at once, wakes the run half, and hands it that fetch', async () => {
		const b = bridge();
		b.at(10);
		b.dispatch('pointerdown', b.anchor('/about'));
		expect(b.fetches.map((fetch) => fetch.href)).toEqual([ABOUT_FRAGMENT]);
		expect(b.preloaded).toEqual([
			'http://router.test/c/swap.js',
			'http://router.test/c/about.js',
		]);
		expect(b.loads).toHaveLength(1);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.handed).toHaveLength(1);
		expect(b.handed[0]).toMatchObject({ url: ABOUT, at: 10 });
		expect(b.handed[0]!.controller.signal.aborted).toBe(false);
		expect(b.log).toEqual(['run', 'replay pointerdown']);
	});

	test('every intent before the run half arrives shares one load, and only the first press fetches', async () => {
		const b = bridge();
		b.dispatch('pointerdown', b.anchor('/about'));
		b.dispatch('touchstart', b.anchor('/other'));
		b.dispatch('focusin', b.anchor('/other'));
		expect(b.fetches.map((fetch) => fetch.href)).toEqual([ABOUT_FRAGMENT]);
		expect(b.loads).toHaveLength(1);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.handed.map((early) => early?.url)).toEqual([ABOUT]);
		expect(b.log).toEqual(['run', 'replay pointerdown', 'replay touchstart', 'replay focusin']);
	});

	test('a focused link fetches its page and wakes the run half', () => {
		const b = bridge();
		b.dispatch('focusin', b.anchor('/about'));
		expect(b.fetches.map((fetch) => fetch.href)).toEqual([ABOUT_FRAGMENT]);
		expect(b.loads).toHaveLength(1);
	});

	test('a pointer over a link wakes the run half without fetching its page', async () => {
		const b = bridge();
		b.dispatch('pointerover', b.anchor('/about'));
		expect(b.fetches).toEqual([]);
		expect(b.loads).toHaveLength(1);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.handed).toEqual([undefined]);
		expect(b.log).toEqual(['run', 'replay pointerover']);
	});

	test('a press on a link marked prefetch none, to the page shown, or to no route wakes without fetching', () => {
		for (const target of [
			(b: ReturnType<typeof bridge>) =>
				b.anchor('/about', { [LINK]: '', [PREFETCH]: 'none' }),
			(b: ReturnType<typeof bridge>) => b.anchor('/'),
			(b: ReturnType<typeof bridge>) => b.anchor('/missing'),
			(b: ReturnType<typeof bridge>) => b.anchor('https://elsewhere.test/about'),
		]) {
			const b = bridge();
			b.dispatch('pointerdown', target(b));
			expect(b.fetches).toEqual([]);
			expect(b.loads).toHaveLength(1);
		}
	});

	test('a press outside any link does nothing', () => {
		const b = bridge();
		b.dispatch('pointerdown', undefined, {
			target: { nodeType: 1, parentElement: null, closest: () => null },
		});
		expect(b.fetches).toEqual([]);
		expect(b.loads).toEqual([]);
	});

	test('a mouse resting on a link for the dwell fetches its page without waking, and the next press hands that fetch on', async () => {
		const b = bridge();
		b.at(5);
		b.dispatch('pointermove', b.anchor('/about'), {
			pointerType: 'mouse',
			clientX: 1,
			clientY: 1,
		});
		expect(b.pending()).toEqual([DWELL_MS]);
		b.elapse(DWELL_MS);
		expect(b.fetches.map((fetch) => fetch.href)).toEqual([ABOUT_FRAGMENT]);
		expect(b.loads).toEqual([]);
		b.dispatch('pointerdown', b.anchor('/other'));
		expect(b.fetches).toHaveLength(1);
		expect(b.loads).toHaveLength(1);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.handed[0]).toMatchObject({ url: ABOUT, at: 5 });
		expect(b.handed[0]!.controller.signal.aborted).toBe(false);
	});

	test('a move to the same spot ends the rest, and a touch pointer never rests', () => {
		const b = bridge();
		const link = b.anchor('/about');
		b.dispatch('pointermove', link, { pointerType: 'mouse', clientX: 1, clientY: 1 });
		b.dispatch('pointermove', link, { pointerType: 'mouse', clientX: 1, clientY: 1 });
		expect(b.pending()).toEqual([]);
		b.dispatch('pointermove', link, { pointerType: 'touch', clientX: 2, clientY: 2 });
		expect(b.pending()).toEqual([]);
		b.dispatch('pointermove', link, { pointerType: 'mouse', clientX: 3, clientY: 3 });
		expect(b.pending()).toEqual([DWELL_MS]);
	});

	test('a rest that ends after the run half arrived fetches nothing', async () => {
		const b = bridge();
		const link = b.anchor('/about');
		b.dispatch('pointermove', link, { pointerType: 'mouse', clientX: 1, clientY: 1 });
		b.dispatch('pointerover', link);
		b.loads[0]!.resolve();
		await b.settled();
		b.elapse(DWELL_MS);
		expect(b.fetches).toEqual([]);
	});

	test('a page listing destinations wakes the run half once loaded and idle, fetching nothing', async () => {
		const b = bridge({ listed: true, idle: true });
		await b.settled();
		await b.settled();
		expect(b.loads).toEqual([]);
		b.idle();
		expect(b.loads).toHaveLength(1);
		expect(b.fetches).toEqual([]);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.log).toEqual(['run', 'replay none']);
	});

	test('a page listing no destinations never wakes at idle', async () => {
		const b = bridge({ idle: true });
		await b.settled();
		await b.settled();
		b.idle();
		expect(b.loads).toEqual([]);
		expect(b.pending()).toEqual([]);
	});

	test('Back wakes the run half and hands it the popstate', async () => {
		const b = bridge();
		b.dispatch('popstate');
		expect(b.loads).toHaveLength(1);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.log).toEqual(['run', 'replay none', 'traverse']);
	});

	test('a Link click is held, then swapped with the time of the click once the run half arrives', async () => {
		const b = bridge();
		b.at(20);
		expect(b.click(b.anchor('/about'))).toBe(true);
		expect(b.loads).toHaveLength(1);
		b.at(900);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.log).toEqual(['run', 'replay none', `go ${ABOUT} at 20`]);
	});

	test('a held click the run half declines loads its page as a document', async () => {
		const b = bridge({ goes: false });
		b.click(b.anchor('/about'));
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.log).toContain(`assign ${ABOUT}`);
	});

	test('a click on the page shown keeps it and loads nothing until a navigation was woken', async () => {
		const b = bridge();
		expect(b.click(b.anchor('/'))).toBe(true);
		expect(b.loads).toEqual([]);
		b.dispatch('pointerover', b.anchor('/about'));
		expect(b.click(b.anchor('/'))).toBe(true);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.log).toEqual([
			'run',
			'replay pointerover',
			'replay none',
			'go http://router.test/ at 0',
		]);
	});

	test('a plain anchor is taken only once its click reaches the document unhandled', () => {
		const b = bridge();
		const plain = b.anchor('/about', {});
		expect(b.click(plain, { defaultPrevented: true })).toBe(true);
		expect(b.loads).toEqual([]);
		expect(b.click(plain)).toBe(true);
		expect(b.loads).toHaveLength(1);
	});

	test('a modified click, another button, or a link this tab would not follow is left to the browser', () => {
		const b = bridge();
		const cases: [Anchor, Record<string, unknown>][] = [
			[b.anchor('/about'), { metaKey: true }],
			[b.anchor('/about'), { ctrlKey: true }],
			[b.anchor('/about'), { shiftKey: true }],
			[b.anchor('/about'), { altKey: true }],
			[b.anchor('/about'), { button: 1 }],
			[b.anchor('/about', { [LINK]: '', download: '' }), {}],
			[b.anchor('/about', { [LINK]: '', rel: 'external' }), {}],
			[b.anchor('/about', { [LINK]: '' }, { target: '_blank' }), {}],
			[b.anchor('https://elsewhere.test/about'), {}],
			[b.anchor('/#/settings'), {}],
			[b.anchor('/#spot'), {}],
		];
		for (const [target, extra] of cases) expect(b.click(target, extra)).toBe(false);
		expect(b.loads).toEqual([]);
	});

	test('once the run half runs, link events are its own: no fetch, no hold, no rest', async () => {
		const b = bridge();
		b.dispatch('pointerover', b.anchor('/about'));
		b.loads[0]!.resolve();
		await b.settled();
		b.dispatch('pointerdown', b.anchor('/about'));
		b.dispatch('pointermove', b.anchor('/about'), {
			pointerType: 'mouse',
			clientX: 4,
			clientY: 4,
		});
		expect(b.click(b.anchor('/about'))).toBe(false);
		expect(b.fetches).toEqual([]);
		expect(b.pending()).toEqual([]);
		expect(b.loads).toHaveLength(1);
	});

	test('Back after the run half runs goes straight to it, without another load', async () => {
		const b = bridge();
		b.dispatch('pointerover', b.anchor('/about'));
		b.loads[0]!.resolve();
		await b.settled();
		b.dispatch('popstate');
		await b.settled();
		expect(b.loads).toHaveLength(1);
		expect(b.log).toEqual(['run', 'replay pointerover', 'replay none', 'traverse']);
	});
});

describe('link bridge after a failed run-half load', () => {
	test('a failed load aborts the press fetch and forgets it; the next press fetches again and hands its own fetch on', async () => {
		const b = bridge();
		b.dispatch('pointerdown', b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		expect(b.fetches[0]!.signal.aborted).toBe(true);
		b.dispatch('pointerdown', b.anchor('/other'));
		expect(b.fetches.map((fetch) => fetch.href)).toEqual([
			ABOUT_FRAGMENT,
			'http://router.test/_fragment/other',
		]);
		expect(b.loads).toHaveLength(2);
		b.loads[1]!.resolve();
		await b.settled();
		expect(b.handed.map((early) => early?.url)).toEqual([OTHER]);
		expect(b.handed[0]!.controller.signal.aborted).toBe(false);
	});

	test('a failed load after a rest aborts the rested fetch, and the next rest fetches again', async () => {
		const b = bridge();
		const link = b.anchor('/about');
		b.dispatch('pointermove', link, { pointerType: 'mouse', clientX: 1, clientY: 1 });
		b.elapse(DWELL_MS);
		b.dispatch('pointerover', link);
		b.loads[0]!.reject();
		await b.settled();
		expect(b.fetches[0]!.signal.aborted).toBe(true);
		b.dispatch('pointermove', link, { pointerType: 'mouse', clientX: 2, clientY: 2 });
		b.elapse(DWELL_MS);
		expect(b.fetches).toHaveLength(2);
		expect(b.fetches[1]!.signal.aborted).toBe(false);
	});

	test('a click whose load fails loads its page as a document once the deadline passes', async () => {
		const b = bridge();
		b.click(b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		expect(b.pending()).toEqual([LEAVE_MS]);
		b.elapse(LEAVE_MS);
		expect(b.log).toEqual([`assign ${ABOUT}`]);
	});

	test('pagehide cancels that document load', async () => {
		const b = bridge();
		b.click(b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		b.dispatch('pagehide');
		expect(b.pending()).toEqual([]);
		b.elapse(LEAVE_MS);
		expect(b.log).toEqual([]);
	});

	test('a new click cancels the earlier fallback, and only the last clicked page loads, once', async () => {
		const b = bridge();
		b.click(b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		b.click(b.anchor('/other'));
		expect(b.pending()).toEqual([]);
		b.loads[1]!.reject();
		await b.settled();
		expect(b.pending()).toEqual([LEAVE_MS]);
		b.elapse(LEAVE_MS);
		expect(b.log).toEqual([`assign ${OTHER}`]);
	});

	test('Back cancels a failed click’s fallback', async () => {
		const b = bridge();
		b.click(b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		b.dispatch('popstate');
		expect(b.pending()).toEqual([]);
		b.loads[1]!.reject();
		await b.settled();
		b.elapse(LEAVE_MS);
		expect(b.log).toEqual([]);
	});

	test('Back during a failed load reloads the page its address names, and a Back that keeps the address keeps it', async () => {
		const b = bridge();
		b.dispatch('popstate');
		b.loads[0]!.reject();
		await b.settled();
		expect(b.pending()).toEqual([]);
		Object.assign(b.location, { pathname: '/about', href: ABOUT });
		b.dispatch('popstate');
		b.loads[1]!.reject();
		await b.settled();
		b.elapse(LEAVE_MS);
		expect(b.log).toEqual(['reload']);
	});

	test('a wake that is not a click leaves a failed click’s fallback armed', async () => {
		const b = bridge();
		b.click(b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		b.dispatch('focusin', b.anchor('/other'));
		expect(b.loads).toHaveLength(2);
		expect(b.pending()).toEqual([LEAVE_MS]);
		b.elapse(LEAVE_MS);
		expect(b.log).toEqual([`assign ${ABOUT}`]);
	});

	test('a click whose retried load succeeds swaps, and the failed click before it never loads its page', async () => {
		const b = bridge();
		b.click(b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		b.click(b.anchor('/about'));
		b.loads[1]!.resolve();
		await b.settled();
		b.elapse(LEAVE_MS);
		expect(b.log).toEqual(['run', 'replay none', `go ${ABOUT} at 0`]);
	});

	test('a click on the page shown after a failed load is kept, with nothing loaded', async () => {
		const b = bridge();
		b.dispatch('pointerover', b.anchor('/about'));
		b.loads[0]!.reject();
		await b.settled();
		expect(b.click(b.anchor('/'))).toBe(true);
		expect(b.loads).toHaveLength(1);
	});
});

describe('link bridge press and click timing (#535)', () => {
	test('a click hands the run half the time of the click and the fetch its press started, unaborted', async () => {
		const b = bridge();
		const link = b.anchor('/about');
		b.at(10);
		b.dispatch('pointerdown', link);
		b.at(20);
		b.click(link);
		b.at(900);
		b.loads[0]!.resolve();
		await b.settled();
		expect(b.fetches).toHaveLength(1);
		expect(b.handed[0]).toMatchObject({ url: ABOUT, at: 10 });
		expect(b.handed[0]!.controller.signal.aborted).toBe(false);
		expect(b.log).toEqual(['run', 'replay pointerdown', 'replay none', `go ${ABOUT} at 20`]);
	});
});
