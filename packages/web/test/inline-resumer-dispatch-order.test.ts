import { expect, test } from 'vitest';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE } from '@markless/serializer/protocol';
import {
	createInlineResumerSource,
	INLINE_MODULE_LOADER_SOURCE,
	INLINE_RESUMER_PAGE_TOKEN,
	renderInlineResumerPageSource,
} from '../src/inline/resumer.ts';
import {
	createSyncPolicyTable,
	inlineResumerPage,
	withEventHostMarks,
} from '../src/render-to-string.ts';

// The inline resumer used to call loadModule(url) fresh for every
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

const BOOT_TAIL = `(${INLINE_MODULE_LOADER_SOURCE},${INLINE_RESUMER_PAGE_TOKEN});`;

// How many microtask hops the "cold" load costs. Any value above the number of
// events in the burst is enough to sort a scrambled run from an ordered one.
const COLD_HOPS = 12;

type FakeElement = {
	readonly tagName: string;
	parentElement: FakeElement | null;
	getAttribute?: (name: string) => string | null;
};

type Listener = (event: { readonly type: string; readonly target: FakeElement }) => unknown;

function servedHostMark(view: object, html: string): string | null {
	const marked = withEventHostMarks(view as never, html, createSyncPolicyTable());
	return new RegExp(`${PROTOCOL_EVENT_HOST_ATTRIBUTE}="([^"]*)"`).exec(marked)?.[1] ?? null;
}

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
	expect(source).toContain(BOOT_TAIL);

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
	const mark = servedHostMark(view, '<input>');
	const host: FakeElement = {
		tagName: 'INPUT',
		parentElement: null,
		getAttribute: (name) => (name === PROTOCOL_EVENT_HOST_ATTRIBUTE ? mark : null),
	};
	const root = {
		addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
		querySelector: () => null,
	};
	host.parentElement = root as unknown as FakeElement;
	const fakeDocument = {
		currentScript: {
			closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
			getAttribute: () => null,
		},
		// The resumer pins the container's census at its first forward; index 0 is the root.
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

	const runnable = renderInlineResumerPageSource(
		source.replace(BOOT_TAIL, `(__load,${INLINE_RESUMER_PAGE_TOKEN});`),
		inlineResumerPage(view as never),
	);
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	new Function('document', 'addEventListener', '__load', runnable)(
		fakeDocument,
		() => {},
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
