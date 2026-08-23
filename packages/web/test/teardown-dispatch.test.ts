import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { ASYNC_PROTOCOL_VERSION, createProtocolStatePayload } from '@markless/serializer';
import type { ProtocolViewPayload } from '@markless/serializer';
import { createResumeRuntime } from '../src/index.ts';
import type { ResumeViewRecord } from '../src/index.ts';
import { renderCsrRuntime } from '../src/render-csr.ts';

// A dispatch that resolves after its container was torn down is never a fault:
// the click was live when it fired and the container is gone by the time the
// runtime is loaded. Fail-closed unmatched dispatch applies to LIVE containers.

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	parentElement?: FakeElement | null;
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void> | void;
		readonly options?: { readonly capture?: boolean };
	}>;
	textContent?: string;
	addEventListener(
		type: string,
		listener: (event: FakeEvent) => Promise<void> | void,
		options?: { readonly capture?: boolean },
	): void;
	removeEventListener(
		type: string,
		listener: (event: FakeEvent) => Promise<void> | void,
		options?: { readonly capture?: boolean },
	): void;
	dispatchEvent(event: unknown): boolean;
};

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	defaultPrevented?: boolean;
	propagationStopped?: boolean;
	preventDefault(): void;
	stopPropagation(): void;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
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

function event(type: string, target: FakeElement): FakeEvent {
	return {
		type,
		target,
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

function detach(child: FakeElement): void {
	const parent = child.parentElement;
	if (!parent) return;
	const index = parent.childNodes.indexOf(child);
	if (index >= 0) parent.childNodes.splice(index, 1);
	child.parentElement = null;
}

function clickCaptureListener(root: FakeElement): (event: FakeEvent) => Promise<void> | void {
	const entry = root.listeners.find((listener) => listener.type === 'click');
	expect(entry).toBeDefined();
	return entry!.listener;
}

function capturedReports(): {
	readonly reports: unknown[];
	readonly restore: () => void;
} {
	const reports: unknown[] = [];
	const host = globalThis as { reportError?: (error: unknown) => void };
	const previous = host.reportError;
	host.reportError = (error: unknown) => {
		reports.push(error);
	};
	return {
		reports,
		restore: () => {
			if (previous) host.reportError = previous;
			else delete host.reportError;
		},
	};
}

function csrView(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function resumeView(): ResumeViewRecord {
	return {
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

test('a CSR dispatch queued behind the runtime import reports nothing once the container is disposed', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	let symbolRuns = 0;
	const container = await renderCsrRuntime({
		output: {
			root: root as never,
			state,
			view: csrView(),
			liveHostNodes: new Map([
				['h0', root as never],
				['h1', button as never],
			]),
			loadSymbol: () => () => {
				symbolRuns++;
			},
		},
		options: { target: { replaceChildren() {} } as never },
	});

	const capture = capturedReports();
	try {
		// The click is live when it fires; the runtime module load is still in
		// flight when teardown lands.
		const pending = clickCaptureListener(root)(event('click', button));
		container.runtime.dispose?.();
		detach(button);
		await pending;
		// The queued dispatch settles well after the runtime finished loading.
		await new Promise((resolve) => setTimeout(resolve, 0));
	} finally {
		capture.restore();
	}

	expect(capture.reports).toEqual([]);
	expect(symbolRuns).toBe(0);
});

test('a resume runtime dispatch after dispose is a no-op rather than an unmatched error', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	let symbolRuns = 0;
	const runtime = createResumeRuntime({
		root: root as never,
		graph: createRuntimeGraph({ cells: [{ graphNodeId: 'state:count', value: 0 }] }),
		view: resumeView(),
		loadSymbol: () => () => {
			symbolRuns++;
		},
	});
	await runtime.start();

	runtime.dispose?.();
	detach(button);

	await expect(runtime.dispatch(event('click', button) as never)).resolves.toBeUndefined();
	expect(symbolRuns).toBe(0);
});

test('a capture listener still holding a disposed host reports no unmatched dispatch', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const runtime = createResumeRuntime({
		root: root as never,
		graph: createRuntimeGraph({ cells: [{ graphNodeId: 'state:count', value: 0 }] }),
		view: resumeView(),
		loadSymbol: () => () => {},
	});
	await runtime.start();

	// The browser already handed this listener the event before dispose removed it.
	const listener = clickCaptureListener(root);
	runtime.dispose?.();
	detach(button);

	await expect(
		(async () => listener(event('click', button)))(),
	).resolves.not.toThrow();
});

test('a live container still fails closed on an unmatched dispatch', async () => {
	const button = element('BUTTON');
	const stray = element('SPAN');
	const root = element('SECTION', [button, stray]);
	const runtime = createResumeRuntime({
		root: root as never,
		graph: createRuntimeGraph({ cells: [{ graphNodeId: 'state:count', value: 0 }] }),
		view: resumeView(),
		loadSymbol: () => () => {},
	});
	await runtime.start();

	await expect(runtime.dispatch(event('click', stray) as never)).rejects.toMatchObject({
		code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED',
	});

	// A live container with a detached target is equally a defect.
	detach(button);
	await expect(runtime.dispatch(event('click', button) as never)).rejects.toMatchObject({
		code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED',
	});
});
