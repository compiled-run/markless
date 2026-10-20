import { expect, test } from 'vitest';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE } from '@markless/serializer/protocol';
import { createInlineDeferTriggerSource, INLINE_DEFER_LOADER_SOURCE } from '../src/inline/defer.ts';
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

// The served boot is the only layer that can spend a crossing on the import,
// because on a cold page nothing else is running yet. These pin that a hover
// over a control wakes the runtime, that a hover over anything else does not,
// and that the wake never turns into a second dispatcher.

const BOOT_TAIL = `(${INLINE_MODULE_LOADER_SOURCE},${INLINE_RESUMER_PAGE_TOKEN});`;

type FakeElement = {
	readonly tagName: string;
	parentElement: FakeElement | null;
	getAttribute?: (name: string) => string | null;
};

type Listener = (event: { readonly type: string; readonly target: FakeElement }) => unknown;

type ViewEventRecord = { readonly hostNodeId: string; readonly eventName: string };

function servedHostMark(view: object, html: string): string | null {
	const marked = withEventHostMarks(view as never, html, createSyncPolicyTable());
	return new RegExp(`${PROTOCOL_EVENT_HOST_ATTRIBUTE}="([^"]*)"`).exec(marked)?.[1] ?? null;
}

// Answers the attribute prefix and substring selectors the deferred trigger finds its hosts with.
function matchesSelector(element: FakeElement, selector: string): boolean {
	return selector.split(',').some((part) => {
		const match = /^\[(.+?)([\^*])="(.*)"\]$/.exec(part);
		if (!match) throw new Error(`unsupported selector ${part}`);
		const value = element.getAttribute?.(match[1]!.replace('\\:', ':'));
		return (
			value != null &&
			(match[2] === '^' ? value.startsWith(match[3]!) : value.includes(match[3]!))
		);
	});
}

function bootResumer(options: {
	readonly events: ReadonlyArray<ViewEventRecord>;
	readonly locators?: ReadonlyArray<{ hostNodeId: string; index: number }>;
}) {
	const source = createInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		resumeModuleUrl: '/build/resume-C3d4.js',
		sharedGraphPolicy: false,
		syncPolicy: false,
	});
	expect(source).toContain(BOOT_TAIL);

	const arrivals: Array<string | 'wake'> = [];
	const primingElements: Array<unknown> = [];
	const module = {
		resumeContainerEvent: (input: {
			readonly event: { readonly type: string } | 0;
			readonly element?: unknown;
		}) => {
			arrivals.push(input.event === 0 ? 'wake' : input.event.type);
			if (input.event === 0) primingElements.push(input.element);
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

	const listeners = new Map<string, Listener>();
	const view = {
		asyncBoundaries: [],
		events: options.events,
		locators: options.locators ?? [{ hostNodeId: 'h1', index: 1 }],
	};
	const mark = servedHostMark(view, '<button></button>');
	const host: FakeElement = {
		tagName: 'BUTTON',
		parentElement: null,
		getAttribute: (name) => (name === PROTOCOL_EVENT_HOST_ATTRIBUTE ? mark : null),
	};
	const root: Record<string, unknown> = {
		addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
		removeEventListener: (type: string) => listeners.delete(type),
		querySelector: () => null,
		querySelectorAll: (selector: string) =>
			[host].filter((element) => matchesSelector(element, selector)),
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

	return {
		arrivals,
		primingElements,
		host,
		fire: (type: string, target: FakeElement = host) => listeners.get(type)?.({ type, target }),
		hasListener: (type: string) => listeners.has(type),
		loadCount: () => loads,
		finishLoad: () => resolveLoad?.(),
		primedHover: () => root.__marklessPrimedHover,
		fakeDocument,
		root,
	};
}

async function settle(hops = 8): Promise<void> {
	for (let hop = 0; hop < hops; hop++) await Promise.resolve();
}

test.each(['click', 'keyup'])(
	'%s ignores missing locators while retaining the matching control',
	async (eventName) => {
		const missing = bootResumer({
			events: [{ hostNodeId: 'detached-control', eventName }],
			locators: [{ hostNodeId: 'detached-control', index: 30 }],
		});
		missing.fire(eventName);
		expect(missing.loadCount()).toBe(0);

		const present = bootResumer({
			events: [{ hostNodeId: 'remaining-control', eventName }],
			locators: [
				{ hostNodeId: 'detached-control', index: 30 },
				{ hostNodeId: 'remaining-control', index: 1 },
			],
		});
		present.fire(eventName);
		present.finishLoad();
		await settle();
		expect(present.arrivals).toEqual([eventName]);
	},
);

test('visible-only records install no input listeners and load no module', () => {
	const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'visible' }] });
	for (const eventName of ['visible', 'click', 'focusin', 'pointerover']) {
		expect(resumer.hasListener(eventName)).toBe(false);
		resumer.fire(eventName);
	}
	expect(resumer.loadCount()).toBe(0);
});

test.each(['pointerover', 'focusin'])(
	'%s identifies the primed control without dispatching its action',
	async (eventName) => {
		const resumer = bootResumer({ events: [{ hostNodeId: 'h1', eventName: 'click' }] });
		resumer.fire(eventName);
		resumer.finishLoad();
		await settle();
		expect(resumer.primingElements).toEqual([resumer.host]);
		expect(resumer.arrivals).toEqual(['wake']);
	},
);

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

test('a visibility forward leaves the crossing primer armed, and both share one import', async () => {
	const resumer = bootResumer({
		events: [
			{ hostNodeId: 'h1', eventName: 'visible' },
			{ hostNodeId: 'h1', eventName: 'click' },
		],
	});
	let intersect: ((entries: unknown[]) => void) | undefined;
	class FakeObserver {
		constructor(callback: (entries: unknown[]) => void) {
			intersect = callback;
		}
		observe() {}
		unobserve() {}
	}
	const visibleArrivals: string[] = [];
	let visibleLoads = 0;
	const loadVisible = async () => {
		visibleLoads += 1;
		return {
			resumeContainerEvent: (input: { readonly event: { readonly type: string } | 0 }) => {
				visibleArrivals.push(input.event === 0 ? 'wake' : input.event.type);
			},
		};
	};
	const primer = createInlineDeferTriggerSource('visible', false)
		.replace(INLINE_DEFER_LOADER_SOURCE, 'load')
		.slice(1);
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	new Function('document', 'IntersectionObserver', 'load', primer)(
		{
			currentScript: {
				closest: () => resumer.root,
				getAttribute: () => '/build/resume-C3d4.js',
			},
			createTreeWalker: () => {
				let done = false;
				return { nextNode: () => (done ? null : ((done = true), resumer.host)) };
			},
		},
		FakeObserver,
		loadVisible,
	);
	delete (globalThis as { __mDefer?: unknown }).__mDefer;
	intersect?.([{ target: resumer.host, isIntersecting: true }]);
	await settle();
	expect(visibleArrivals).toEqual(['visible']);

	resumer.fire('pointerover');
	await settle();
	expect(visibleArrivals).toEqual(['visible', 'wake']);
	expect(resumer.primedHover()).toBe(resumer.host);

	resumer.fire('click');
	await settle();
	expect(visibleArrivals).toEqual(['visible', 'wake', 'click']);
	resumer.fire('pointerover');
	await settle();
	expect(visibleArrivals).toEqual(['visible', 'wake', 'click']);
	expect(visibleLoads).toBe(1);
	expect(resumer.loadCount()).toBe(0);
});
