import { createRuntimeGraph } from '@markless/runtime';
import { expect, test } from 'vitest';
import { createResumeRuntime } from '../src/resume.ts';

// A pointer crosses onto a control before it presses it, and a click focuses no
// button in Safari, so the focus preload never covered a first press. These pin
// that the crossing, not the press, spends the demand-load window - and that a
// crossing is never a dispatch.

type FakeListener = {
	readonly type: string;
	readonly listener: (event: { readonly type: string; readonly target: unknown }) => unknown;
};

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	parentElement?: FakeElement | null;
	readonly childNodes: FakeElement[];
	readonly listeners: FakeListener[];
	__marklessPrimedHover?: FakeElement;
	addEventListener(type: string, listener: FakeListener['listener']): void;
	removeEventListener(type: string, listener: FakeListener['listener']): void;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener) {
			this.listeners.push({ type, listener });
		},
		removeEventListener(type, listener) {
			const index = this.listeners.findIndex(
				(entry) => entry.type === type && entry.listener === listener,
			);
			if (index >= 0) this.listeners.splice(index, 1);
		},
	};
	for (const child of childNodes) child.parentElement = node;
	return node;
}

function boot(options: {
	readonly host: FakeElement;
	readonly root: FakeElement;
	readonly eventName: string;
	readonly symbolIds?: ReadonlyArray<string>;
}) {
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:step', value: { hits: 0 } }] });
	const loadedSymbols: string[] = [];
	const ranSymbols: string[] = [];
	const runtime = createResumeRuntime({
		root: options.root as never,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{
					hostNodeId: 'h1',
					strategy: 'dom-order',
					index: 1,
					tagName: options.host.tagName.toLowerCase(),
				},
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: options.eventName,
					symbolIds: options.symbolIds ?? ['symbol:press'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		} as never,
		loadSymbol(symbolId: string) {
			loadedSymbols.push(symbolId);
			return async () => {
				ranSymbols.push(symbolId);
			};
		},
	});
	const pointerOver = (target: FakeElement = options.host) => {
		const entry = options.root.listeners.find((listener) => listener.type === 'pointerover');
		entry?.listener({ type: 'pointerover', target });
		return !!entry;
	};
	return { graph, loadedSymbols, ranSymbols, runtime, pointerOver };
}

test('a crossing onto an element fetches the press handlers it names', async () => {
	const host = element('BUTTON');
	const root = element('SECTION', [host]);
	const page = boot({
		host,
		root,
		eventName: 'pointerdown',
		symbolIds: ['symbol:down', 'symbol:repeat'],
	});
	await page.runtime.start();

	expect(page.loadedSymbols).toEqual([]);
	expect(page.pointerOver()).toBe(true);

	expect(page.loadedSymbols).toEqual(['symbol:down', 'symbol:repeat']);
	// A preload is a fetch, never a dispatch.
	expect(page.ranSymbols).toEqual([]);
	page.runtime.dispose();
});

test('click, pointerdown and pointerup each earn the crossing listener', async () => {
	for (const eventName of ['click', 'pointerdown', 'pointerup']) {
		const host = element('BUTTON');
		const page = boot({ host, root: element('SECTION', [host]), eventName });
		await page.runtime.start();

		expect(page.pointerOver()).toBe(true);
		expect(page.loadedSymbols).toEqual(['symbol:press']);
		page.runtime.dispose();
	}
});

test('a page whose records name no press installs no crossing listener', async () => {
	const host = element('DIV');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'keydown' });
	await page.runtime.start();

	expect(page.pointerOver()).toBe(false);
	expect(page.loadedSymbols).toEqual([]);
	page.runtime.dispose();
});

test('a preloaded press handler is not fetched again by a later crossing or press', async () => {
	const host = element('BUTTON');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'click' });
	await page.runtime.start();

	page.pointerOver();
	page.pointerOver();
	expect(page.loadedSymbols).toEqual(['symbol:press']);

	await page.runtime.dispatch({ type: 'click', target: host } as never);
	expect(page.ranSymbols).toEqual(['symbol:press']);
	page.runtime.dispose();
});

test('a crossing onto a label inside the control primes the control', async () => {
	const label = element('SPAN');
	const host = element('BUTTON', [label]);
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'pointerdown' });
	await page.runtime.start();

	expect(page.pointerOver(label)).toBe(true);
	expect(page.loadedSymbols).toEqual(['symbol:press']);
	page.runtime.dispose();
});

test('the pointer already resting on the control is primed when the wiring arrives', async () => {
	const host = element('BUTTON');
	const root = element('SECTION', [host]);
	root.__marklessPrimedHover = host;
	const page = boot({ host, root, eventName: 'pointerdown' });

	// The crossing that woke this runtime fired before the listener existed, and
	// a resting pointer sends no second one.
	await page.runtime.start();

	expect(page.loadedSymbols).toEqual(['symbol:press']);
	expect(page.ranSymbols).toEqual([]);
	page.runtime.dispose();
});

test('dispose drops the crossing listener', async () => {
	const host = element('BUTTON');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'click' });
	await page.runtime.start();

	expect(root.listeners.some((listener) => listener.type === 'pointerover')).toBe(true);
	page.runtime.dispose();
	expect(root.listeners.some((listener) => listener.type === 'pointerover')).toBe(false);
});
