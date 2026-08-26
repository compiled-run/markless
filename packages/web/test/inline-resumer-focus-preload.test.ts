import { expect, test } from 'vitest';
import { createInlineResumerSource } from '../src/inline/resumer.ts';

// A key event can only reach an element that already holds focus, and focus
// lands first. These pin that the served boot spends the focus, not the first
// keystroke, on the import - without the focus becoming a second dispatcher.

const LOADER_TAIL = '((url) => import(/* @vite-ignore */ url));';

type FakeElement = {
	readonly tagName: string;
	isContentEditable?: boolean;
	parentElement: FakeElement | null;
};

type Listener = (event: { readonly type: string; readonly target: FakeElement }) => unknown;

type ViewEventRecord = { readonly hostNodeId: string; readonly eventName: string };

function bootResumer(options: {
	readonly events: ReadonlyArray<ViewEventRecord>;
	readonly hostTagName?: string;
	readonly contentEditable?: boolean;
}) {
	const source = createInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		resumeModuleUrl: '/build/resume-A1b2.js',
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

	const host: FakeElement = {
		tagName: options.hostTagName ?? 'DIV',
		isContentEditable: options.contentEditable,
		parentElement: null,
	};
	const listeners = new Map<string, Listener>();
	const view = {
		asyncBoundaries: [],
		events: options.events,
		locators: [{ hostNodeId: 'h1', index: 1 }],
	};
	const root = {
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
	};
}

async function settle(hops = 8): Promise<void> {
	for (let hop = 0; hop < hops; hop++) await Promise.resolve();
}

test('focus onto an element with a key record wakes the runtime before the key', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'keydown' }] });

	resumer.fire('focusin');
	expect(resumer.loadCount()).toBe(1);

	resumer.finishLoad();
	await settle();
	expect(resumer.arrivals).toEqual(['wake']);
});

test('focus onto a press-only element wakes the runtime: Enter and Space reach a press', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'click' }] });

	expect(resumer.hasListener('focusin')).toBe(true);
	resumer.fire('focusin');
	expect(resumer.loadCount()).toBe(1);

	resumer.finishLoad();
	await settle();
	expect(resumer.arrivals).toEqual(['wake']);
});

test('focus onto an element with neither key nor press record loads nothing', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'change' }] });

	expect(resumer.hasListener('focusin')).toBe(false);
	resumer.fire('focusin');
	await settle();

	expect(resumer.loadCount()).toBe(0);
	expect(resumer.arrivals).toEqual([]);
});

test('a key pressed during the preload is delivered exactly once, behind the wake', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'keydown' }] });

	resumer.fire('focusin');
	resumer.fire('keydown');
	resumer.finishLoad();
	await settle();

	expect(resumer.arrivals).toEqual(['wake', 'keydown']);
	// One import promise per root is what keeps the wake ahead of the gesture.
	expect(resumer.loadCount()).toBe(1);
});

test('the wake is spent once: a second focus does not re-import', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'keydown' }] });

	resumer.fire('focusin');
	resumer.fire('focusin');
	resumer.finishLoad();
	await settle();

	expect(resumer.loadCount()).toBe(1);
	expect(resumer.arrivals).toEqual(['wake']);
});

test('an input record primes an editable host and not a plain one', async () => {
	const editable = bootResumer({
		events: [{ hostNodeId: 'h1', eventName: 'input' }],
		hostTagName: 'INPUT',
	});
	editable.fire('focusin');
	expect(editable.loadCount()).toBe(1);

	const plain = bootResumer({
		events: [{ hostNodeId: 'h1', eventName: 'input' }],
		hostTagName: 'DIV',
	});
	plain.fire('focusin');
	expect(plain.loadCount()).toBe(0);

	const contentEditable = bootResumer({
		events: [{ hostNodeId: 'h1', eventName: 'input' }],
		hostTagName: 'DIV',
		contentEditable: true,
	});
	contentEditable.fire('focusin');
	expect(contentEditable.loadCount()).toBe(1);
});

test('a focus that lands after the page already woke stays quiet', async () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'keydown' }] });

	resumer.fire('keydown');
	expect(resumer.loadCount()).toBe(1);
	resumer.fire('focusin');
	resumer.finishLoad();
	await settle();

	expect(resumer.arrivals).toEqual(['keydown']);
	expect(resumer.loadCount()).toBe(1);
});
