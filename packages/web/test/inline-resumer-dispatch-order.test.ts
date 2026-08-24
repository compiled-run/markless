import { expect, test } from 'vitest';
import { createInlineResumerSource } from '../src/inline/resumer.ts';

// Defect 94. The inline resumer used to call loadModule(url) fresh for every
// event, then `.then` the resulting promise. Resolution order across SEPARATE
// promises is not FIFO: the promise the first gesture created has to walk the
// real import (several microtask hops), while a gesture arriving after the
// module is warm gets a promise that settles on the next tick. The later
// gesture's `resumeContainerEvent` therefore ran FIRST, and the per-root
// dispatch queue faithfully serialized the scrambled arrivals.
//
// This harness reproduces exactly that timing shape without a browser: the
// first load is deep, the rest are shallow. The fix is one import promise per
// root - `.then` callbacks on the SAME promise always run in registration
// order, and the capture listener registers them synchronously as each event
// fires, so arrival order is fire order.

const LOADER_TAIL = '((url) => import(/* @vite-ignore */ url));';

// How many microtask hops the "cold" load costs. Any value above the number of
// events in the burst is enough to sort a scrambled run from an ordered one.
const COLD_HOPS = 12;

type FakeElement = {
	readonly tagName: string;
	parentElement: FakeElement | null;
};

type Listener = (event: { readonly type: string; readonly target: FakeElement }) => unknown;

function deferredBy<T>(hops: number, value: T): Promise<T> {
	let promise = Promise.resolve();
	for (let hop = 0; hop < hops; hop++) promise = promise.then(() => undefined);
	return promise.then(() => value);
}

/**
 * Boots the emitted inline resumer against a fake document, with a loader whose
 * FIRST call resolves deep in the microtask queue and whose later calls resolve
 * immediately - the warm-module-registry shape a real burst hits.
 */
function bootResumer() {
	const source = createInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		resumeModuleUrl: '/build/resume-A1b2.js',
		sharedGraphPolicy: false,
		syncPolicy: false,
	});
	// Fail closed rather than silently testing a shape that no longer exists.
	expect(source).toContain(LOADER_TAIL);

	const arrivals: string[] = [];
	const module = {
		resumeContainerEvent: (input: { readonly event: { readonly type: string } }) => {
			arrivals.push(input.event.type);
		},
	};
	let loads = 0;
	const loadModule = () => {
		loads += 1;
		return loads === 1 ? deferredBy(COLD_HOPS, module) : Promise.resolve(module);
	};

	const host: FakeElement = { tagName: 'INPUT', parentElement: null };
	const listeners = new Map<string, Listener>();
	const view = {
		asyncBoundaries: [],
		events: [
			{ hostNodeId: 'h1', eventName: 'keydown' },
			{ hostNodeId: 'h1', eventName: 'input' },
			{ hostNodeId: 'h1', eventName: 'keyup' },
		],
		locators: [{ hostNodeId: 'h1', index: 1 }],
	};
	const root = {
		addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
		querySelector: (selector: string) =>
			selector === 'script[type="markless/view"]'
				? { textContent: JSON.stringify(view) }
				: null,
	};
	host.parentElement = root as unknown as FakeElement;
	const fakeDocument = {
		currentScript: {
			closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
			getAttribute: () => null,
		},
		// The resumer walks the container once to index locator positions. Index 0
		// is the root itself, so the host lands at index 1.
		createTreeWalker: () => {
			let done = false;
			return {
				nextNode: () => {
					if (done) return null;
					done = true;
					return host;
				},
			};
		},
	};

	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	new Function('document', '__load', source.replace(LOADER_TAIL, '(__load);'))(
		fakeDocument,
		loadModule,
	);

	const fire = (type: string) => listeners.get(type)?.({ type, target: host });
	return { arrivals, fire, loadCount: () => loads };
}

// One keystroke, then a backspace: six events, no await between them, exactly
// as the browser delivers a fast burst.
const BURST = ['keydown', 'input', 'keyup', 'keydown', 'input', 'keyup'] as const;

async function settle(hops: number): Promise<void> {
	for (let hop = 0; hop < hops; hop++) await Promise.resolve();
}

test('the inline resumer forwards a burst to the dispatch queue in fire order', async () => {
	const resumer = bootResumer();

	for (const type of BURST) resumer.fire(type);
	await settle(COLD_HOPS * 4);

	expect(resumer.arrivals).toEqual([...BURST]);
});

test('a burst that straddles the module load still arrives in fire order', async () => {
	const resumer = bootResumer();

	// The first gesture starts the cold load; the rest land while it is still in
	// flight, then more land after it has resolved. This is the interleave that
	// scrambled arrivals when each event took its own import promise.
	resumer.fire('keydown');
	await settle(2);
	resumer.fire('input');
	resumer.fire('keyup');
	await settle(COLD_HOPS * 2);
	resumer.fire('keydown');
	resumer.fire('input');
	resumer.fire('keyup');
	await settle(COLD_HOPS * 4);

	expect(resumer.arrivals).toEqual([...BURST]);
});

test('one root imports the resume module once, however many gestures it forwards', async () => {
	const resumer = bootResumer();

	for (const type of BURST) resumer.fire(type);
	await settle(COLD_HOPS * 4);

	// The per-event import was the defect. One promise per root is what makes
	// `.then` registration order the arrival order.
	expect(resumer.loadCount()).toBe(1);
});
