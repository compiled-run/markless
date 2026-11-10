import { afterEach, expect, test, vi } from 'vitest';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE } from '@markless/serializer/protocol';
import {
	createInlineResumerReturnWakeSource,
	createInlineResumerSelfWakeSource,
	createInlineResumerSource,
	INLINE_MODULE_LOADER_SOURCE,
	INLINE_RESUMER_PAGE_TOKEN,
	renderInlineResumerPageSource,
} from '../src/inline/resumer.ts';
import { createSyncPolicyTable, inlineResumerPage, withEventHostMarks } from '../src/render-to-string.ts';

const RESUME_URL = '/build/resume.js';
const REASK = '__mReaskTest';
const BOOT_TAIL = `(${INLINE_MODULE_LOADER_SOURCE},${INLINE_RESUMER_PAGE_TOKEN});`;

type Listener = (event: Record<string, unknown>) => unknown;

// The served scripts run against this fake page; vitest would fail the run on the rethrown import error, so it is captured here instead.
function page() {
	const view = {
		asyncBoundaries: [],
		events: [{ hostNodeId: 'h1', eventName: 'click' }],
		locators: [{ hostNodeId: 'h1', index: 1 }],
	};
	const marked = withEventHostMarks(view as never, '<button></button>', createSyncPolicyTable());
	const mark = new RegExp(`${PROTOCOL_EVENT_HOST_ATTRIBUTE}="([^"]*)"`).exec(marked)?.[1] ?? null;
	const host = {
		tagName: 'BUTTON',
		parentElement: null as unknown,
		getAttribute: (name: string) => (name === PROTOCOL_EVENT_HOST_ATTRIBUTE ? mark : null),
	};
	const rootListeners = new Map<string, Listener>();
	const root: Record<string, unknown> = {
		__mClock: { idle: (run: () => void) => run(), frame: (run: () => void) => run() },
		isConnected: true,
		addEventListener: (type: string, listener: Listener) => rootListeners.set(type, listener),
		removeEventListener: () => {},
		getAttribute: () => null,
		querySelector: () => null,
		querySelectorAll: () => [],
	};
	host.parentElement = root;
	const windowListeners = new Map<string, Listener>();
	const fakeDocument = {
		readyState: 'complete',
		currentScript: {
			closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
			getAttribute: (name: string) => (name === 'data-markless-resume-module' ? RESUME_URL : null),
		},
		createTreeWalker: () => {
			const all = [host];
			let next = 0;
			return { nextNode: () => all[next++] ?? null };
		},
	};
	const resumeContainerEvent = vi.fn();
	const failure = new Error('Failed to fetch dynamically imported module');
	let loads = 0;
	const load = vi.fn(() =>
		++loads === 1 ? Promise.reject(failure) : Promise.resolve({ resumeContainerEvent }),
	);
	const run = (source: string) =>
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		new Function('document', 'addEventListener', 'removeEventListener', 'load', source)(
			fakeDocument,
			(type: string, listener: Listener) => windowListeners.set(type, listener),
			() => {},
			load,
		);
	const bootClassic = () =>
		run(
			renderInlineResumerPageSource(
				createInlineResumerSource({
					debug: false,
					executionLog: 'never',
					graphSyncPolicy: false,
					resumeModuleUrl: RESUME_URL,
					sharedGraphPolicy: false,
					syncPolicy: false,
				}).replace(BOOT_TAIL, `(load,${INLINE_RESUMER_PAGE_TOKEN});`),
				inlineResumerPage(view as never),
			),
		);
	return {
		root,
		load,
		failure,
		resumeContainerEvent,
		run,
		bootClassic,
		click: () => rootListeners.get('click')?.({ type: 'click', target: host }),
		pageshow: () => windowListeners.get('pageshow')?.({ type: 'pageshow', persisted: true }),
	};
}

const surfaced: unknown[] = [];
let restore: (() => void) | undefined;

function captureUnhandledRejections() {
	const prior = process.listeners('unhandledRejection');
	process.removeAllListeners('unhandledRejection');
	const capture = (reason: unknown) => surfaced.push(reason);
	process.on('unhandledRejection', capture);
	restore = () => {
		process.off('unhandledRejection', capture);
		for (const listener of prior) process.on('unhandledRejection', listener);
	};
}

async function drain() {
	for (let hop = 0; hop < 20; hop++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	restore?.();
	restore = undefined;
	surfaced.length = 0;
	delete (globalThis as { __mDefer?: unknown }).__mDefer;
});

test('a click after a rejected forward import imports again and reaches the runtime', async () => {
	captureUnhandledRejections();
	const f = page();
	f.bootClassic();
	void f.click()?.catch(() => {});
	await drain();
	expect(f.root.__mResume).toBeUndefined();

	await f.click();

	expect(f.load).toHaveBeenCalledTimes(2);
	expect(f.resumeContainerEvent).toHaveBeenCalledOnce();
});

test('a click after a rejected self-wake import imports again and still surfaces the failure', async () => {
	captureUnhandledRejections();
	const f = page();
	f.bootClassic();
	f.run(createInlineResumerSelfWakeSource(RESUME_URL).replace(INLINE_MODULE_LOADER_SOURCE, 'load').slice(1));
	await drain();
	expect(f.root.__mResume).toBeUndefined();
	expect(surfaced).toEqual([f.failure]);

	await f.click();

	expect(f.load).toHaveBeenCalledTimes(2);
	expect(f.resumeContainerEvent).toHaveBeenCalledOnce();
});

test('a back-forward restore after a rejected return-wake import imports again', async () => {
	captureUnhandledRejections();
	const f = page();
	f.root[REASK] = true;
	f.run(
		createInlineResumerReturnWakeSource(RESUME_URL, REASK)
			.replace(INLINE_MODULE_LOADER_SOURCE, 'load')
			.slice(1),
	);
	await drain();
	expect(f.root.__mResume).toBeUndefined();
	expect(surfaced).toEqual([f.failure]);

	f.pageshow();
	await drain();

	expect(f.load).toHaveBeenCalledTimes(2);
	expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({ root: f.root, event: 0 });
});
