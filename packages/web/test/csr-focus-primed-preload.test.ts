import {
	ASYNC_PROTOCOL_VERSION,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { expect, test } from 'vitest';
import { renderCsrRuntime } from '../src/render-csr.ts';

// A client-rendered container demand-loads its handlers too. Focus lands before
// any key event can, so the focused element's key records are fetched then -
// without the focus becoming a dispatch.

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	isContentEditable?: boolean;
	readonly childNodes: FakeElement[];
	parentElement?: FakeElement | null;
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void> | void;
	}>;
	addEventListener(type: string, listener: (event: FakeEvent) => Promise<void> | void): void;
	removeEventListener(type: string, listener: (event: FakeEvent) => Promise<void> | void): void;
};

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	defaultPrevented: boolean;
	preventDefault(): void;
	stopPropagation(): void;
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

function event(type: string, target: FakeElement): FakeEvent {
	return {
		type,
		target,
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {},
	};
}

function csrView(eventName: string, tagName: string): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName },
		],
		events: [{ hostNodeId: 'h1', eventName, symbolIds: ['symbol:key'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

async function mount(input: { readonly eventName: string; readonly tagName?: string }) {
	const tagName = input.tagName ?? 'div';
	const target = element(tagName.toUpperCase());
	const root = element('SECTION', [target]);
	const loadedSymbols: string[] = [];
	let handlerRuns = 0;
	const container = await renderCsrRuntime({
		output: {
			root: root as never,
			view: csrView(input.eventName, tagName),
			liveHostNodes: new Map([
				['h0', root as never],
				['h1', target as never],
			]),
			loadSymbol: (symbolId: string) => {
				loadedSymbols.push(symbolId);
				return () => {
					handlerRuns++;
				};
			},
		},
		options: { target: { replaceChildren() {} } as never },
	});
	const focusIn = () => {
		const entry = root.listeners.find((listener) => listener.type === 'focusin');
		void entry?.listener(event('focusin', target));
		return !!entry;
	};
	return {
		root,
		target,
		focusIn,
		loadedSymbols,
		handlerRuns: () => handlerRuns,
		dispose: () => container.runtime.dispose?.(),
	};
}

test('a client-rendered focus fetches the focused element key handler', async () => {
	const page = await mount({ eventName: 'keydown' });

	expect(page.loadedSymbols).toEqual([]);
	expect(page.focusIn()).toBe(true);

	expect(page.loadedSymbols).toEqual(['symbol:key']);
	// Fetched, not run: the focus is not a dispatch.
	expect(page.handlerRuns()).toBe(0);
	page.dispose();
});

test('a client-rendered focus onto a press-only element fetches the press handler', async () => {
	const page = await mount({ eventName: 'click' });

	expect(page.focusIn()).toBe(true);
	expect(page.loadedSymbols).toEqual(['symbol:key']);
	expect(page.handlerRuns()).toBe(0);
	page.dispose();
});

test('a client-rendered container with neither key nor press record installs no focus listener', async () => {
	const page = await mount({ eventName: 'change' });

	expect(page.focusIn()).toBe(false);
	expect(page.loadedSymbols).toEqual([]);
	page.dispose();
});

test('a repeated focus does not refetch a warm handler', async () => {
	const page = await mount({ eventName: 'keydown' });

	page.focusIn();
	page.focusIn();

	expect(page.loadedSymbols).toEqual(['symbol:key']);
	page.dispose();
});

test('the input pair is preloaded for an editable host only', async () => {
	const editable = await mount({ eventName: 'input', tagName: 'input' });
	editable.focusIn();
	expect(editable.loadedSymbols).toEqual(['symbol:key']);
	editable.dispose();

	const plain = await mount({ eventName: 'input', tagName: 'div' });
	plain.focusIn();
	expect(plain.loadedSymbols).toEqual([]);
	plain.dispose();
});

test('a key that follows the focus still dispatches exactly once', async () => {
	const page = await mount({ eventName: 'keydown' });
	page.focusIn();
	// The handler was already asked for before the key existed.
	expect(page.loadedSymbols).toEqual(['symbol:key']);

	const entry = page.root.listeners.find((listener) => listener.type === 'keydown');
	await entry!.listener(event('keydown', page.target));

	expect(page.handlerRuns()).toBe(1);
	page.dispose();
});

test('dispose drops the focus preload listener', async () => {
	const page = await mount({ eventName: 'keydown' });

	expect(page.root.listeners.some((listener) => listener.type === 'focusin')).toBe(true);
	page.dispose();
	expect(page.root.listeners.some((listener) => listener.type === 'focusin')).toBe(false);
});
