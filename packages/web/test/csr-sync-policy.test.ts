import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	type ProtocolStatePayload,
	type ProtocolSyncPolicy,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { expect, test } from 'vitest';
import { renderCsrRuntime } from '../src/render-csr.ts';

// The browser reads defaultPrevented the moment the dispatch that carried the
// event returns. A CSR container's listener awaits the demand-loaded handler,
// so anything the handler cancels lands too late; the compiler-extracted policy
// has to run in the listener itself, exactly as the served page's inline
// resumer runs it.

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

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	readonly button: number;
	defaultPrevented: boolean;
	propagationStopped: boolean;
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

function event(type: string, target: FakeElement, button = 2): FakeEvent {
	return {
		type,
		target,
		button,
		defaultPrevented: false,
		propagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
	};
}

function captureListener(
	root: FakeElement,
	type: string,
): (event: FakeEvent) => Promise<void> | void {
	const entry = root.listeners.find((listener) => listener.type === type);
	expect(entry, `expected a ${type} capture listener on the container`).toBeDefined();
	return entry!.listener;
}

const cancelAlways: ProtocolSyncPolicy = {
	when: { type: 'constant-truthy', value: true },
	actions: ['preventDefault'],
};

function csrView(record: {
	readonly syncPolicy?: ProtocolSyncPolicy;
	readonly action?: ProtocolViewPayload['events'][number]['action'];
}): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
		],
		events: [
			{
				hostNodeId: 'h1',
				eventName: 'contextmenu',
				symbolIds: ['symbol:contextmenu'],
				...(record.syncPolicy ? { syncPolicy: record.syncPolicy } : {}),
				...(record.action ? { action: record.action } : {}),
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

// A CSR mount seeds its cells on the live channel: the value never crosses HTML.
function seededState(open: unknown): ProtocolStatePayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [
			{
				graphNodeId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				directValue: { open },
			},
		],
		computed: [],
	};
}

async function mount(input: {
	readonly view: ProtocolViewPayload;
	readonly state?: ProtocolStatePayload;
}): Promise<{
	readonly root: FakeElement;
	readonly target: FakeElement;
	readonly handlerRuns: () => number;
	readonly dispose: () => void;
}> {
	const target = element('P');
	const root = element('SECTION', [target]);
	let handlerRuns = 0;
	const container = await renderCsrRuntime({
		output: {
			root: root as never,
			...(input.state ? { state: input.state } : {}),
			view: input.view,
			liveHostNodes: new Map([
				['h0', root as never],
				['h1', target as never],
			]),
			loadSymbol: () => (context: { readonly event?: { preventDefault?: () => void } }) => {
				handlerRuns++;
				context.event?.preventDefault?.();
			},
		},
		options: { target: { replaceChildren() {} } as never },
	});
	return {
		root,
		target,
		handlerRuns: () => handlerRuns,
		dispose: () => container.runtime.dispose?.(),
	};
}

test('a CSR right-click is cancelled inside the dispatch, before the handler is awaited', async () => {
	const page = await mount({ view: csrView({ syncPolicy: cancelAlways }) });
	const gesture = event('contextmenu', page.target);

	const pending = captureListener(page.root, 'contextmenu')(gesture);
	// Read where the browser reads it: the dispatch has returned and the
	// handler module has not been fetched yet.
	expect(gesture.defaultPrevented).toBe(true);
	expect(page.handlerRuns()).toBe(0);

	await pending;
	expect(page.handlerRuns()).toBe(1);
	page.dispose();
});

test('a record with no extracted policy leaves the gesture uncancelled inside the dispatch', async () => {
	const page = await mount({ view: csrView({}) });
	const gesture = event('contextmenu', page.target);

	const pending = captureListener(page.root, 'contextmenu')(gesture);
	expect(gesture.defaultPrevented).toBe(false);

	await pending;
	// The handler's own preventDefault lands, but only after the dispatch returned.
	expect(gesture.defaultPrevented).toBe(true);
	page.dispose();
});

test('a policy branch naming stopPropagation stops it inside the dispatch', async () => {
	const page = await mount({
		view: csrView({
			syncPolicy: {
				when: { type: 'constant-truthy', value: true },
				actions: ['preventDefault', 'stopPropagation'],
			},
		}),
	});
	const gesture = event('contextmenu', page.target);

	const pending = captureListener(page.root, 'contextmenu')(gesture);
	expect(gesture.propagationStopped).toBe(true);

	await pending;
	page.dispose();
});

test('an event-equals branch answers off the gesture that is being dispatched', async () => {
	const rightButtonOnly: ProtocolSyncPolicy = {
		branches: [
			{
				when: { type: 'event-equals', field: 'button', value: 2 },
				actions: ['preventDefault'],
			},
		],
	};
	const page = await mount({ view: csrView({ syncPolicy: rightButtonOnly }) });

	const leftClick = event('contextmenu', page.target, 0);
	const leftPending = captureListener(page.root, 'contextmenu')(leftClick);
	expect(leftClick.defaultPrevented).toBe(false);
	await leftPending;

	const rightClick = event('contextmenu', page.target, 2);
	const rightPending = captureListener(page.root, 'contextmenu')(rightClick);
	expect(rightClick.defaultPrevented).toBe(true);
	await rightPending;
	page.dispose();
});

test('a graph-truthy branch reads the seeded cell before the graph is demanded', async () => {
	const whenOpen: ProtocolSyncPolicy = {
		when: { type: 'graph-truthy', graphNodeId: 'state:menu', path: ['open'] },
		actions: ['preventDefault'],
	};

	const open = await mount({
		view: csrView({ syncPolicy: whenOpen }),
		state: seededState(true),
	});
	const openGesture = event('contextmenu', open.target);
	const openPending = captureListener(open.root, 'contextmenu')(openGesture);
	expect(openGesture.defaultPrevented).toBe(true);
	await openPending;
	open.dispose();

	const closed = await mount({
		view: csrView({ syncPolicy: whenOpen }),
		state: seededState(false),
	});
	const closedGesture = event('contextmenu', closed.target);
	const closedPending = captureListener(closed.root, 'contextmenu')(closedGesture);
	expect(closedGesture.defaultPrevented).toBe(false);
	await closedPending;
	closed.dispose();
});

test('an externally delegated record applies no policy, as the served page applies none', async () => {
	const page = await mount({
		view: csrView({
			syncPolicy: cancelAlways,
			action: { kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate, owner: 'host' },
		}),
	});
	const gesture = event('contextmenu', page.target);

	const pending = captureListener(page.root, 'contextmenu')(gesture);
	expect(gesture.defaultPrevented).toBe(false);

	await pending;
	expect(gesture.defaultPrevented).toBe(false);
	expect(page.handlerRuns()).toBe(0);
	page.dispose();
});
