import { gzipSync } from 'node:zlib';
import { afterEach, expect, test, vi } from 'vitest';
import { createProtocolStatePayload } from '@markless/serializer';
import type { ProtocolViewPayload } from '@markless/serializer';
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer/protocol';
import { compileInlineResumerSources } from '../../bundler/src/inline-resumer.ts';
import { renderToString } from '../src/index.ts';
import {
	createInlineResumerReturnWakeSource,
	createInlineResumerSelfWakeSource,
	createInlineResumerStorageWakeSource,
	authoredSelfWakeSources,
	type InlineWakeSources,
} from '../src/inline/resumer.ts';
import { authoredLateWakeSources } from '../src/inline/wakes.ts';

const authoredInlineWakeSources = (): InlineWakeSources => ({
	...authoredSelfWakeSources(),
	...authoredLateWakeSources(),
});

const RESUME_URL = '/build/resume.js';
const REASK = '__mReaskTest';
const SLOT = 'markless.storage.test';

type Listener = (event: Record<string, unknown>) => unknown;

async function compiledWakes(): Promise<InlineWakeSources> {
	const wakes = (await compileInlineResumerSources({ debug: false, executionLog: 'never' })).wakes;
	if (!wakes) throw new Error('Expected compiled wake sources.');
	return wakes;
}

const gzip = (source: string) => gzipSync(source).byteLength;

function page() {
	const root: Record<string, unknown> = {
		__mClock: { idle: (run: () => void) => run(), frame: (run: () => void) => run() },
		isConnected: true,
		addEventListener: () => {},
		removeEventListener: () => {},
		getAttribute: () => null,
		querySelector: () => null,
		querySelectorAll: () => [],
	};
	const windowListeners = new Map<string, Listener>();
	const fakeDocument = {
		readyState: 'complete',
		currentScript: {
			closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
			getAttribute: (name: string) => (name === 'data-markless-resume-module' ? RESUME_URL : null),
		},
	};
	const resumeContainerEvent = vi.fn();
	let loads = 0;
	const load = vi.fn((url: string) =>
		++loads === 1
			? Promise.reject(new Error(`Failed to fetch ${url}`))
			: Promise.resolve({ resumeContainerEvent }),
	);
	const run = (source: string) =>
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		new Function('document', 'addEventListener', 'removeEventListener', 'load', source.slice(1))(
			fakeDocument,
			(type: string, listener: Listener) => windowListeners.set(type, listener),
			() => {},
			load,
		);
	return {
		root,
		load,
		resumeContainerEvent,
		run,
		pageshow: () => windowListeners.get('pageshow')?.({ type: 'pageshow', persisted: true }),
	};
}

const surfaced: unknown[] = [];
let restore: (() => void) | undefined;

function captureUnhandledRejections() {
	const prior = process.listeners('unhandledRejection');
	process.removeAllListeners('unhandledRejection');
	const capture = (reason: unknown) => surfaced.push(String(reason));
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
	delete (globalThis as Record<symbol, unknown>)[Symbol.for(SLOT)];
});

async function selfWakeScenario(wakes: InlineWakeSources) {
	const f = page();
	f.run(createInlineResumerSelfWakeSource(RESUME_URL, { ...wakes, moduleLoader: 'load' }));
	await drain();
	const afterReject = { resume: f.root.__mResume, surfaced: [...surfaced] };
	f.run(createInlineResumerSelfWakeSource(RESUME_URL, { ...wakes, moduleLoader: 'load' }));
	await drain();
	return {
		afterReject,
		loads: f.load.mock.calls,
		dispatched: f.resumeContainerEvent.mock.calls.map(([input]) => input.event),
		delegated: f.root.__marklessDelegatedDispatch,
	};
}

async function returnWakeScenario(wakes: InlineWakeSources) {
	const f = page();
	f.root[REASK] = true;
	f.run(createInlineResumerReturnWakeSource(RESUME_URL, REASK, { ...wakes, moduleLoader: 'load' }));
	await drain();
	const afterReject = { resume: f.root.__mResume, surfaced: [...surfaced] };
	f.root[REASK] = undefined;
	f.pageshow();
	await drain();
	return {
		afterReject,
		reask: f.root[REASK],
		loads: f.load.mock.calls,
		dispatched: f.resumeContainerEvent.mock.calls.map(([input]) => input.event),
	};
}

async function storageWakeScenario(wakes: InlineWakeSources, saved: string) {
	(globalThis as Record<symbol, unknown>)[Symbol.for(SLOT)] = { 'cell:theme': saved };
	const f = page();
	f.load.mockImplementation(() => Promise.resolve({ resumeContainerEvent: f.resumeContainerEvent }));
	f.run(
		createInlineResumerStorageWakeSource(RESUME_URL, SLOT, JSON.stringify([['cell:theme', 'light']]), {
			...wakes,
			moduleLoader: 'load',
		}),
	);
	await drain();
	return { loads: f.load.mock.calls, dispatched: f.resumeContainerEvent.mock.calls.length };
}

test('the compiled wakes are minified and share no authored function text', async () => {
	const wakes = await compiledWakes();
	const authored = authoredInlineWakeSources();
	for (const key of ['selfWake', 'returnWake', 'storageWake', 'moduleLoader'] as const) {
		expect(wakes[key].length).toBeLessThan(authored[key].length);
	}
	expect(createInlineResumerSelfWakeSource(RESUME_URL, wakes)).not.toContain(authored.selfWake);
	expect(createInlineResumerReturnWakeSource(RESUME_URL, REASK, wakes)).not.toContain(
		authored.returnWake,
	);
});

test('a minified self-wake drops a rejected import, surfaces it, and wakes on the next run', async () => {
	captureUnhandledRejections();
	const authored = await selfWakeScenario(authoredInlineWakeSources());
	surfaced.length = 0;
	delete (globalThis as { __mDefer?: unknown }).__mDefer;
	const minified = await selfWakeScenario(await compiledWakes());

	expect(minified).toEqual(authored);
	expect(minified.afterReject).toEqual({
		resume: undefined,
		surfaced: [`Error: Failed to fetch ${RESUME_URL}`],
	});
	expect(minified.loads).toEqual([[RESUME_URL], [RESUME_URL]]);
	expect(minified.dispatched).toEqual([0]);
});

test('a minified return wake re-asks on load and again on a back-forward restore', async () => {
	captureUnhandledRejections();
	const authored = await returnWakeScenario(authoredInlineWakeSources());
	surfaced.length = 0;
	const minified = await returnWakeScenario(await compiledWakes());

	expect(minified).toEqual(authored);
	expect(minified.afterReject.resume).toBeUndefined();
	expect(minified.reask).toBe(true);
	expect(minified.loads).toHaveLength(2);
	expect(minified.dispatched).toEqual([0]);
});

test('a minified storage wake wakes only when a saved value differs from the rendered one', async () => {
	const wakes = await compiledWakes();
	const differs = await storageWakeScenario(wakes, 'dark');
	delete (globalThis as { __mDefer?: unknown }).__mDefer;
	const matches = await storageWakeScenario(wakes, 'light');
	delete (globalThis as { __mDefer?: unknown }).__mDefer;
	const authoredDiffers = await storageWakeScenario(authoredInlineWakeSources(), 'dark');

	expect(differs).toEqual(authoredDiffers);
	expect(differs).toEqual({ loads: [[RESUME_URL]], dispatched: 1 });
	expect(matches).toEqual({ loads: [], dispatched: 0 });
});

function asyncPage() {
	return {
		html: '<p>Loading</p>',
		state: {
			...createProtocolStatePayload({ cells: [] }),
			computed: [
				{
					graphNodeId: 'computed:source',
					name: 'source',
					async: true,
					snapshot: { status: 'pending', version: 1, key: null },
				},
			],
		} as never,
		view: {
			version: ASYNC_PROTOCOL_VERSION,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncRunners: { 'computed:source': 'symbol:source' },
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [{ source: 'source', graphNodeId: 'computed:source', path: [] }],
				},
			],
		} as ProtocolViewPayload,
	};
}

test('a built page serves its self-wake and return wake minified', async () => {
	const inlineResumerSources = await compileInlineResumerSources({
		debug: false,
		executionLog: 'never',
	});
	const wakes = inlineResumerSources.wakes!;
	const authored = authoredInlineWakeSources();
	const html = await renderToString({
		renderSsr: asyncPage,
		resumeModuleUrl: '/app.js',
		executionLog: 'never',
		inlineResumerSources,
	});
	const { wakes: _wakes, ...withoutWakes } = inlineResumerSources;
	const authoredHtml = await renderToString({
		renderSsr: asyncPage,
		resumeModuleUrl: '/app.js',
		executionLog: 'never',
		inlineResumerSources: withoutWakes,
	});

	expect(html).toContain('data-markless-self-wake');
	expect(html).toContain(wakes.selfWake);
	expect(html).toContain(wakes.returnWake);
	expect(html).not.toContain(authored.selfWake);
	expect(html).not.toContain(authored.returnWake);
	expect(authoredHtml).toContain(authored.selfWake);
	expect(authoredHtml).toContain(authored.returnWake);
	expect(gzip(html)).toBeLessThan(gzip(authoredHtml));
});
