import { afterEach, expect, test, vi } from 'vitest';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE, PROTOCOL_VISIBLE_EVENT_NAME } from '@markless/serializer';
import { createInlineDeferTriggerSource, INLINE_DEFER_LOADER_SOURCE } from '../src/inline/defer.ts';
import {
	createInlineResumerSelfWakeSource,
	createPrerenderSettleInlineResumerSource,
} from '../src/inline/resumer.ts';

const RESUME_URL = '/build/resume.js';

type Root = Record<string, unknown>;

// The served scripts run against this fake page; vitest would fail the run on the rethrown import error, so it is captured here instead.
function page() {
	const entries = `${PROTOCOL_VISIBLE_EVENT_NAME}:0`;
	const host = {
		getAttribute: (name: string) => (name === PROTOCOL_EVENT_HOST_ATTRIBUTE ? entries : null),
	};
	const root: Root = {
		__mClock: { idle: (run: () => void) => run(), frame: (run: () => void) => run() },
		getElementsByTagName: () => [host],
		querySelectorAll: (selector: string) =>
			selector.includes(`^="${PROTOCOL_VISIBLE_EVENT_NAME}:"`) ? [host] : [],
		querySelector: () => null,
		addEventListener: () => {},
	};
	const fakeDocument = {
		readyState: 'complete',
		currentScript: {
			closest: () => root,
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
	let intersect: ((entries: ReadonlyArray<unknown>) => void) | undefined;
	class FakeIntersectionObserver {
		constructor(callback: (entries: ReadonlyArray<unknown>) => void) {
			intersect = callback;
		}
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	const run = (source: string) =>
		new Function('document', 'IntersectionObserver', 'load', source)(
			fakeDocument,
			FakeIntersectionObserver,
			load,
		);
	run(
		createInlineDeferTriggerSource('visible', false)
			.replace(INLINE_DEFER_LOADER_SOURCE, 'load')
			.slice(1),
	);
	return {
		root,
		load,
		failure,
		resumeContainerEvent,
		run,
		intersect: () => intersect!([{ isIntersecting: true, target: host }]),
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

test('a rejected visible-forward import releases the root and still surfaces the failure', async () => {
	captureUnhandledRejections();
	const f = page();
	f.intersect();
	expect(f.root.__marklessDelegatedDispatch).toBe(PROTOCOL_VISIBLE_EVENT_NAME);
	await drain();

	expect(f.root.__marklessDelegatedDispatch).toBeUndefined();
	expect(f.root.__mResume).toBeUndefined();
	expect(surfaced).toEqual([f.failure]);
});

test('the settle boot failure-path wake still reaches the runtime after a rejected visible forward', async () => {
	captureUnhandledRejections();
	const f = page();
	f.intersect();
	await drain();

	f.run(createPrerenderSettleInlineResumerSource(['click'], RESUME_URL).replace('u=>import(u)', 'load'));
	await drain();

	expect(f.load).toHaveBeenCalledTimes(2);
	expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({ root: f.root, event: 0 });
});

test('the self-wake re-imports after a rejected visible forward instead of reusing the rejection', async () => {
	captureUnhandledRejections();
	const f = page();
	f.intersect();
	await drain();

	f.run(createInlineResumerSelfWakeSource(RESUME_URL).replace(INLINE_DEFER_LOADER_SOURCE, 'load').slice(1));
	await drain();

	expect(f.load).toHaveBeenCalledTimes(2);
	expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({ root: f.root, event: 0 });
	expect(surfaced).toEqual([f.failure]);
});
