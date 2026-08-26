import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createResumeRuntime } from '../src/index.ts';
import type { ResumeViewRecord } from '../src/index.ts';

// Dispatch runs from ONE capture listener on the container root, which the DOM
// hands each descendant's own `pointerenter`/`focus`/`blur` as well. Only the
// element that declared such a handler may answer, and every other descendant
// passing through is normal traffic, not an unmatched-dispatch defect.

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
	dispatchEvent(event: unknown): boolean;
};

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	readonly bubbles?: boolean;
	defaultPrevented?: boolean;
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
		dispatchEvent() {
			return true;
		},
	};
	for (const child of childNodes) child.parentElement = node;
	return node;
}

function event(type: string, target: FakeElement, bubbles: boolean): FakeEvent {
	return {
		type,
		target,
		bubbles,
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {},
	};
}

// A list whose container answers `pointerenter` while an option answers only
// `click`, so a hovered option is a target that carries a record of its own and
// still has none for the event in hand.
function listFixture(): {
	readonly root: FakeElement;
	readonly list: FakeElement;
	readonly option: FakeElement;
	readonly label: FakeElement;
	readonly runs: string[];
	readonly runtime: ReturnType<typeof createResumeRuntime>;
} {
	const label = element('SPAN');
	const option = element('DIV', [label]);
	const list = element('DIV', [option]);
	const root = element('SECTION', [list]);
	const view: ResumeViewRecord = {
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'div' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'div' },
		],
		events: [
			{ hostNodeId: 'h1', eventName: 'pointerenter', symbolIds: ['symbol:enter'] },
			{ hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:choose'] },
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const runs: string[] = [];
	const runtime = createResumeRuntime({
		root: root as never,
		graph: createRuntimeGraph({ cells: [{ graphNodeId: 'state:count', value: 0 }] }),
		view,
		loadSymbol: (symbolId: string) => () => {
			runs.push(symbolId);
		},
	});
	return { root, list, option, label, runs, runtime };
}

test('a non-bubbling event whose target carries no record for it passes through silently', async () => {
	const { option, label, runs, runtime } = listFixture();
	await runtime.start();

	// The option carries a click record, the label carries none at all; neither
	// answers pointerenter, and neither may borrow the list's handler.
	await expect(runtime.dispatch(event('pointerenter', option, false) as never)).resolves.toBe(
		undefined,
	);
	await expect(runtime.dispatch(event('pointerenter', label, false) as never)).resolves.toBe(
		undefined,
	);
	expect(runs).toEqual([]);

	// The element that declared the handler still answers its own event.
	await runtime.dispatch(event('click', option, true) as never);
	expect(runs).toEqual(['symbol:choose']);
});

test('a non-bubbling event runs the record on the element it was declared on', async () => {
	const { list, runs, runtime } = listFixture();
	await runtime.start();

	await runtime.dispatch(event('pointerenter', list, false) as never);
	expect(runs).toEqual(['symbol:enter']);
});

test('a bubbling event that matches no record is still a loud unmatched dispatch', async () => {
	const { label, runs, runtime } = listFixture();
	await runtime.start();

	// Nothing on the label-to-root chain answers `input`, which is the routing
	// defect the refusal exists for.
	await expect(runtime.dispatch(event('input', label, true) as never)).rejects.toMatchObject({
		code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED',
		phase: 'event',
		eventName: 'input',
	});
	expect(runs).toEqual([]);
});

test('an unmatched dispatch from outside the container refuses however the event propagates', async () => {
	const { runs, runtime } = listFixture();
	const stray = element('DIV');
	await runtime.start();

	await expect(
		runtime.dispatch(event('pointerenter', stray, false) as never),
	).rejects.toMatchObject({
		code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED',
		eventName: 'pointerenter',
	});
	expect(runs).toEqual([]);
});
