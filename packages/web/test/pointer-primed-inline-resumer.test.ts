import { expect, test } from 'vitest';
import { createInlineResumerSource } from '../src/inline/resumer.ts';

// The served boot is the only layer that can spend a crossing on the import,
// because on a cold page nothing else is running yet. These pin that a hover
// over a control wakes the runtime, that a hover over anything else does not,
// and that the wake never turns into a second dispatcher.

const LOADER_TAIL = '((url) => import(/* @vite-ignore */ url));';

type FakeElement = {
	readonly tagName: string;
	parentElement: FakeElement | null;
};

type Listener = (event: { readonly type: string; readonly target: FakeElement }) => unknown;

type ViewEventRecord = { readonly hostNodeId: string; readonly eventName: string };

function bootResumer(options: { readonly events: ReadonlyArray<ViewEventRecord> }) {
	const source = createInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		resumeModuleUrl: '/build/resume-C3d4.js',
		sharedGraphPolicy: false,
		syncPolicy: false,
	});
	expect(source).toContain(LOADER_TAIL);

	const arrivals: Array<string | 'wake'> = [];
	const module = {
		resumeContainerEvent: (input: { readonly event: { readonly type: string } | 0 }) => {
			arrivals.push(input.event === 0 ? 'wake' : input.event.type);
		},
	};
	let loads = 0;
	let resolveLoad: (() => void) | undefined;
	const loadModule = () => {
		loads += 1;
		return new Promise<typeof module>((resolve) => {
			resolveLoad = () => resolve(module);
		});
	};

	const host: FakeElement = { tagName: 'BUTTON', parentElement: null };
	const listeners = new Map<string, Listener>();
	const view = {
		asyncBoundaries: [],
		events: options.events,
		locators: [{ hostNodeId: 'h1', index: 1 }],
	};
	const root: Record<string, unknown> = {
		addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
		removeEventListener: (type: string) => listeners.delete(type),
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

	return {
		arrivals,
		host,
		fire: (type: string, target: FakeElement = host) =>
			listeners.get(type)?.({ type, target }),
		hasListener: (type: string) => listeners.has(type),
		loadCount: () => loads,
		finishLoad: () => resolveLoad?.(),
		primedHover: () => root.__marklessPrimedHover,
	};
}

async function settle(hops = 8): Promise<void> {
	for (let hop = 0; hop < hops; hop++) await Promise.resolve();
}

test('a crossing onto an element with a press record wakes the runtime before the press', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'pointerdown' }] });

	resumer.fire('pointerover');
	expect(resumer.loadCount()).toBe(1);

	resumer.finishLoad();
	await settle();
	expect(resumer.arrivals).toEqual(['wake']);
	// A resting pointer sends no second crossing, so the control is left here for
	// the runtime's own preload to read once its wiring exists.
	expect(resumer.primedHover()).toBe(resumer.host);
});

test('a page whose records name no press installs no crossing listener', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'keydown' }] });

	expect(resumer.hasListener('pointerover')).toBe(false);
	resumer.fire('pointerover');
	await settle();

	expect(resumer.loadCount()).toBe(0);
	expect(resumer.arrivals).toEqual([]);
});

test('a press landing inside the wake is delivered exactly once, behind it', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'pointerdown' }] });

	resumer.fire('pointerover');
	resumer.fire('pointerdown');
	resumer.finishLoad();
	await settle();

	expect(resumer.arrivals).toEqual(['wake', 'pointerdown']);
	// One import promise per root is what keeps the wake ahead of the gesture.
	expect(resumer.loadCount()).toBe(1);
});

test('the wake is spent once: a second crossing does not re-import', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'click' }] });

	resumer.fire('pointerover');
	resumer.fire('pointerover');
	resumer.finishLoad();
	await settle();

	expect(resumer.loadCount()).toBe(1);
	expect(resumer.arrivals).toEqual(['wake']);
});

test('a crossing that lands after the page already woke stays quiet', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'click' }] });

	resumer.fire('click');
	expect(resumer.loadCount()).toBe(1);
	resumer.fire('pointerover');
	resumer.finishLoad();
	await settle();

	expect(resumer.arrivals).toEqual(['click']);
	expect(resumer.loadCount()).toBe(1);
});
