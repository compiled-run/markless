import { ASYNC_PROTOCOL_VERSION, type ProtocolViewPayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { renderCsrRuntime } from '../src/render-csr.ts';

// A client-rendered container demand-loads its handlers too, and its press
// handlers were as uncovered as a served page's. The crossing fetches them
// without becoming a dispatch.

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	defaultPrevented: boolean;
	preventDefault(): void;
	stopPropagation(): void;
};

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	parentElement?: FakeElement | null;
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void> | void;
	}>;
	addEventListener(type: string, listener: (event: FakeEvent) => Promise<void> | void): void;
	removeEventListener(type: string, listener: (event: FakeEvent) => Promise<void> | void): void;
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
		events: [{ hostNodeId: 'h1', eventName, symbolIds: ['symbol:press'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

async function mount(input: { readonly eventName: string; readonly tagName?: string }) {
	const tagName = input.tagName ?? 'button';
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
	const pointerOver = (over: FakeElement = target) => {
		const entry = root.listeners.find((listener) => listener.type === 'pointerover');
		void entry?.listener(event('pointerover', over));
		return !!entry;
	};
	return {
		root,
		target,
		pointerOver,
		loadedSymbols,
		handlerRuns: () => handlerRuns,
		dispose: () => container.runtime.dispose?.(),
	};
}

test('a client-rendered crossing fetches the press handler under the pointer', async () => {
	const page = await mount({ eventName: 'pointerdown' });

	expect(page.loadedSymbols).toEqual([]);
	expect(page.pointerOver()).toBe(true);

	expect(page.loadedSymbols).toEqual(['symbol:press']);
	// Fetched, not run: the crossing is not a dispatch.
	expect(page.handlerRuns()).toBe(0);
	page.dispose();
});

test('a client-rendered container with no press record installs no crossing listener', async () => {
	const page = await mount({ eventName: 'keydown', tagName: 'div' });

	expect(page.pointerOver()).toBe(false);
	expect(page.loadedSymbols).toEqual([]);
	page.dispose();
});

test('a repeated crossing does not refetch a warm press handler', async () => {
	const page = await mount({ eventName: 'click' });

	page.pointerOver();
	page.pointerOver();

	expect(page.loadedSymbols).toEqual(['symbol:press']);
	page.dispose();
});

test('disposing the container drops the crossing listener', async () => {
	const page = await mount({ eventName: 'click' });

	expect(page.root.listeners.some((entry) => entry.type === 'pointerover')).toBe(true);
	page.dispose();
	expect(page.root.listeners.some((entry) => entry.type === 'pointerover')).toBe(false);
});
