import { describe, expect, test } from 'vitest';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';
import {
	BRIDGE_PHASE,
	checkBridgeMove,
	startFragmentNavigation,
	type FragmentNavigationApi,
} from '../src/vite/fragment-navigation.ts';

// Every phase move the load-time link bridge makes goes through its one transition point, which the dev bridge checks.

type Listener = (event: unknown) => void;
type Phase = keyof typeof BRIDGE_PHASE;

const named = Object.fromEntries(
	Object.entries(BRIDGE_PHASE).map(([name, phase]) => [phase, name]),
) as Record<number, Phase>;

const LEGAL: readonly (readonly [Phase, Phase])[] = [
	['idle', 'pressed'],
	['idle', 'starting'],
	['pressed', 'startingPressed'],
	['starting', 'startingPressed'],
	['starting', 'running'],
	['startingPressed', 'running'],
	['starting', 'idle'],
	['startingPressed', 'idle'],
];

function bridge() {
	const listeners = new Map<string, Listener[]>();
	const timers = new Map<number, () => void>();
	let timer = 0;
	const moves: string[] = [];
	const loads: { readonly resolve: () => void; readonly reject: () => void }[] = [];
	const w = {
		location: {
			origin: 'http://router.test',
			href: 'http://router.test/',
			pathname: '/',
			search: '',
			assign: () => {},
			reload: () => {},
		},
		navigator: {},
		performance: { now: () => 0, getEntriesByName: () => [], getEntriesByType: () => [] },
		addEventListener: (type: string, listener: Listener) =>
			void listeners.set(type, [...(listeners.get(type) ?? []), listener]),
		removeEventListener: () => {},
		setTimeout: (callback: () => void) => (timers.set(++timer, callback), timer),
		clearTimeout: (id: number) => void timers.delete(id),
		fetch: () => new Promise<Response>(() => {}),
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
	const link: Record<string, unknown> = {
		nodeType: 1,
		href: 'http://router.test/about',
		target: '',
		relList: { contains: () => false },
		hasAttribute: (name: string) => name === 'data-link',
		getAttribute: () => null,
	};
	link.closest = () => link;
	const api: FragmentNavigationApi = { traverse: () => {}, replay: () => {}, go: () => true };
	startFragmentNavigation(
		d as unknown as Document,
		() => 'data-link',
		'data-links',
		async () => ({}),
		() =>
			new Promise((resolve, reject) =>
				loads.push({
					resolve: () => resolve(() => api),
					reject: () => reject(new Error('the run half failed to load')),
				}),
			),
		() => ({
			code: [],
			hoverDwellMs: 100,
			requestPrefix: '/_fragment',
			prefetchAttribute: 'data-prefetch',
			idleBytesPerSecond: 1,
			idleMeasuredBytes: 1,
		}),
		1000,
		(from, to) => {
			checkBridgeMove(from, to);
			moves.push(`${named[from]} -> ${named[to]}`);
		},
	);
	const dispatch = (type: string, extra: Record<string, unknown> = {}) => {
		for (const listener of listeners.get(type) ?? [])
			listener({
				type,
				button: 0,
				target: link,
				composedPath: () => [link],
				preventDefault: () => {},
				...extra,
			});
	};
	return {
		moves,
		press: () => dispatch('pointerdown'),
		hover: () => dispatch('pointerover'),
		rest: () => {
			dispatch('pointermove', { pointerType: 'mouse', clientX: 1, clientY: 1 });
			for (const [id, callback] of timers) {
				timers.delete(id);
				callback();
			}
		},
		loaded: async () => {
			loads.at(-1)!.resolve();
			await new Promise((done) => setTimeout(done, 0));
		},
		failed: async () => {
			loads.at(-1)!.reject();
			await new Promise((done) => setTimeout(done, 0));
		},
	};
}

describe('link bridge phase moves', () => {
	test('idle -> pressed: a mouse resting on a link fetches its page', () => {
		const b = bridge();
		b.rest();
		expect(b.moves).toEqual(['idle -> pressed']);
	});

	test('idle -> starting: a pointer over a link loads the run half', () => {
		const b = bridge();
		b.hover();
		expect(b.moves).toEqual(['idle -> starting']);
	});

	test('pressed -> startingPressed: link intent after a rest loads the run half, keeping the fetch', () => {
		const b = bridge();
		b.rest();
		b.hover();
		expect(b.moves).toEqual(['idle -> pressed', 'pressed -> startingPressed']);
	});

	test('starting -> startingPressed: a press while the run half loads fetches its page', () => {
		const b = bridge();
		b.hover();
		b.press();
		expect(b.moves).toEqual(['idle -> starting', 'starting -> startingPressed']);
	});

	test('starting -> running: the run half arrives', async () => {
		const b = bridge();
		b.hover();
		await b.loaded();
		expect(b.moves).toEqual(['idle -> starting', 'starting -> running']);
	});

	test('startingPressed -> running: the run half arrives and takes the press fetch', async () => {
		const b = bridge();
		b.press();
		await b.loaded();
		expect(b.moves).toEqual([
			'idle -> pressed',
			'pressed -> startingPressed',
			'startingPressed -> running',
		]);
	});

	test('starting -> idle: the run half fails to load', async () => {
		const b = bridge();
		b.hover();
		await b.failed();
		expect(b.moves).toEqual(['idle -> starting', 'starting -> idle']);
	});

	test('startingPressed -> idle: the run half fails to load and the press fetch is dropped', async () => {
		const b = bridge();
		b.press();
		await b.failed();
		b.press();
		expect(b.moves).toEqual([
			'idle -> pressed',
			'pressed -> startingPressed',
			'startingPressed -> idle',
			'idle -> pressed',
			'pressed -> startingPressed',
		]);
	});

	test('the check allows exactly the legal moves and throws on every other', () => {
		const phases = Object.keys(BRIDGE_PHASE) as Phase[];
		for (const from of phases)
			for (const to of phases) {
				const legal = LEGAL.some(([a, b]) => a === from && b === to);
				const check = () => checkBridgeMove(BRIDGE_PHASE[from], BRIDGE_PHASE[to]);
				if (legal) expect(check, `${from} -> ${to}`).not.toThrow();
				else expect(check, `${from} -> ${to}`).toThrow(/no move from phase/);
			}
		expect(() => checkBridgeMove(9, 0)).toThrow(/no move from phase/);
	});

	test('the dev bridge carries the check and the built bridge does not', async () => {
		const options = {
			navigationEntryPath: '/build/navigation.js',
			fragmentEntryPath: '/build/fragment.js',
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						renderSsr: async () => ({
							html: '<a data-markless-router-link href="/about">About</a>',
						}),
					},
				}),
			},
			routeFileIds: ['pages/index.tsrx'],
			documentModuleLoader: undefined,
		};
		const dev = createServerEntry({ ...options, dev: true });
		const devHtml = await (await dev.fetch(new Request('http://router.test/'))).text();
		expect(devHtml).toContain('no move from phase');
		const built = createServerEntry(options);
		await built.fetch(new Request('http://router.test/'));
		expect(built.linkBridgeModules?.length).toBeGreaterThan(0);
		for (const module of built.linkBridgeModules ?? [])
			expect(module.source).not.toContain('no move from phase');
	});
});
