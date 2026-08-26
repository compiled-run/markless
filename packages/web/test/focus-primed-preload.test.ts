import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createResumeRuntime } from '../src/resume.ts';

// Focus reaches an element before any key event can, so the runtime fetches the
// handler modules a focused element's key records name while the user is still
// deciding what to press. Fetch only: a preload is never a dispatch.

type FakeListener = {
	readonly type: string;
	readonly listener: (event: { readonly type: string; readonly target: unknown }) => unknown;
};

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	isContentEditable?: boolean;
	parentElement?: FakeElement | null;
	readonly childNodes: FakeElement[];
	readonly listeners: FakeListener[];
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
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:menu', value: { hits: 0 } }] });
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
					symbolIds: options.symbolIds ?? ['symbol:key'],
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
	const focusIn = () => {
		const entry = options.root.listeners.find((listener) => listener.type === 'focusin');
		entry?.listener({ type: 'focusin', target: options.host });
		return !!entry;
	};
	return { graph, loadedSymbols, ranSymbols, runtime, focusIn };
}

test('focus preloads the handler modules the focused element names for keys', async () => {
	const host = element('DIV');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'keydown', symbolIds: ['symbol:a', 'symbol:b'] });
	await page.runtime.start();

	expect(page.loadedSymbols).toEqual([]);
	expect(page.focusIn()).toBe(true);

	expect(page.loadedSymbols).toEqual(['symbol:a', 'symbol:b']);
	// A preload is a fetch, never a dispatch.
	expect(page.ranSymbols).toEqual([]);
	page.runtime.dispose();
});

test('focus onto a press-only element preloads it: Enter and Space reach a press', async () => {
	const host = element('DIV');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'click' });
	await page.runtime.start();

	expect(page.focusIn()).toBe(true);
	expect(page.loadedSymbols).toEqual(['symbol:key']);
	expect(page.ranSymbols).toEqual([]);
	page.runtime.dispose();
});

test('focus onto an element whose only record is neither key nor press loads nothing', async () => {
	const host = element('DIV');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'change' });
	await page.runtime.start();

	// Nothing focus can lead to means no focus listener at all.
	expect(page.focusIn()).toBe(false);
	expect(page.loadedSymbols).toEqual([]);
	page.runtime.dispose();
});

test('a preloaded symbol is not fetched a second time by a later focus or dispatch', async () => {
	const host = element('DIV');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'keydown' });
	await page.runtime.start();

	page.focusIn();
	page.focusIn();
	expect(page.loadedSymbols).toEqual(['symbol:key']);

	await page.runtime.dispatch({ type: 'keydown', target: host } as never);
	expect(page.ranSymbols).toEqual(['symbol:key']);
	page.runtime.dispose();
});

test('the input pair preloads for an editable host only', async () => {
	const editableHost = element('INPUT');
	const editablePage = boot({
		host: editableHost,
		root: element('SECTION', [editableHost]),
		eventName: 'input',
	});
	await editablePage.runtime.start();
	editablePage.focusIn();
	expect(editablePage.loadedSymbols).toEqual(['symbol:key']);
	editablePage.runtime.dispose();

	const plainHost = element('DIV');
	const plainPage = boot({
		host: plainHost,
		root: element('SECTION', [plainHost]),
		eventName: 'input',
	});
	await plainPage.runtime.start();
	plainPage.focusIn();
	expect(plainPage.loadedSymbols).toEqual([]);
	plainPage.runtime.dispose();
});

test('focus on a descendant preloads the ancestor record that would have handled the key', async () => {
	const label = element('SPAN');
	const host = element('DIV', [label]);
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'keydown' });
	await page.runtime.start();

	const entry = root.listeners.find((listener) => listener.type === 'focusin');
	entry?.listener({ type: 'focusin', target: label });

	expect(page.loadedSymbols).toEqual(['symbol:key']);
	page.runtime.dispose();
});

test('dispose drops the focus preload listener', async () => {
	const host = element('DIV');
	const root = element('SECTION', [host]);
	const page = boot({ host, root, eventName: 'keydown' });
	await page.runtime.start();

	expect(root.listeners.some((listener) => listener.type === 'focusin')).toBe(true);
	page.runtime.dispose();
	expect(root.listeners.some((listener) => listener.type === 'focusin')).toBe(false);
});
