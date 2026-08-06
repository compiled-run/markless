import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { EVENT_ONLY_RESUMER_TARGET_BYTES } from '../../../poc/fixtures/proofs/resumer-script/src/resumer-source.mjs';
import {
	createInlineResumerSelfWakeSource,
	createPrerenderInlineResumerSource,
} from '../../web/src/inline/resumer.ts';
import {
	PRERENDER_INLINE_EVENT_NAMES_TOKEN,
	compileInlineResumerSource,
	compileInlineResumerSources,
	compilePrerenderInlineResumerSource,
	compilePrerenderInlineResumerSources,
	renderPrerenderInlineResumerSource,
} from '../src/inline-resumer.ts';

test('Rolldown OXC deterministically minifies the typed event-only resumer', async () => {
	const options = { debug: false, executionLog: 'never' as const };
	const first = await compileInlineResumerSources(options);
	const second = await compileInlineResumerSources(options);

	expect(first).toEqual(second);
	expect(first.event).not.toContain('runInlineResumer');
	expect(first.event).not.toContain('__MARKLESS_INLINE_');
	expect(first.event).not.toContain('preventDefault');
	expect(first.event).not.toContain('__mxLog');
	expect(first.event).not.toContain('inline-resumer');
	expect(first.event).not.toContain('router-delegation');
	expect(first.event).not.toContain('MARKLESS_DEBUG_');
	expect(gzipSync(first.event, { level: 9 }).length).toBeLessThanOrEqual(
		EVENT_ONLY_RESUMER_TARGET_BYTES,
	);
});

test('Rolldown OXC includes debug registration only in debug variants', async () => {
	const source = await compileInlineResumerSource({
		debug: true,
		executionLog: 'never',
		graphSyncPolicy: false,
		sharedGraphPolicy: false,
		syncPolicy: false,
	});

	expect(source).toContain('inline-resumer');
	expect(source).toContain('__MARKLESS_DEBUG__');
});

test('Rolldown OXC includes only the requested inline feature blocks', async () => {
	const event = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		sharedGraphPolicy: false,
		syncPolicy: false,
	});
	const syncPolicy = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		sharedGraphPolicy: false,
		syncPolicy: true,
	});
	const graphPolicyOwner = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: true,
		sharedGraphPolicy: true,
		syncPolicy: true,
	});
	const graphPolicyConsumer = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: true,
		sharedGraphPolicy: false,
		syncPolicy: true,
	});

	expect(event).not.toContain('preventDefault');
	expect(syncPolicy).toContain('preventDefault');
	expect(syncPolicy).not.toContain('__marklessInlineSyncPolicy');
	expect(graphPolicyOwner).toContain('__marklessInlineSyncPolicy');
	expect(graphPolicyOwner.length).toBeGreaterThan(graphPolicyConsumer.length);
});

// ---------------------------------------------------------------------------
// T012 / S4a: the prerender + self-wake boot compiles the same way the classic
// resumer does. Equivalence is proved by BOOTING both, unminified and
// minified, against the same fake document and comparing what each did.
// ---------------------------------------------------------------------------

function bootScript(source: string) {
	const listeners: Array<{ type: string; capture: unknown }> = [];
	const imported: string[] = [];
	const dispatched: unknown[] = [];
	const root = {
		addEventListener(type: string, _listener: unknown, capture: unknown) {
			listeners.push({ type, capture });
		},
	};
	const currentScript = {
		closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
		getAttribute: (name: string) =>
			name === 'data-markless-resume-module' ? '/build/prerender-wake-A1b2.js' : null,
	};
	const frames: Array<() => void> = [];
	const documentListeners: Array<{ type: string; listener: () => void }> = [];
	const scope = {
		document: {
			currentScript,
			readyState: 'complete',
			addEventListener: (type: string, listener: () => void) =>
				documentListeners.push({ type, listener }),
		},
		requestAnimationFrame: (callback: () => void) => frames.push(callback),
		queueMicrotask: (callback: () => void) => frames.push(callback),
		// The self-wake body calls `import()` directly, which Vite's SSR
		// transform rewrites; supplying both names keeps the harness honest
		// about which module URL the boot demands.
		__vite_ssr_dynamic_import__: async (url: string) => {
			imported.push(url);
			return { resumeContainerEvent: (input: unknown) => dispatched.push(input) };
		},
	};
	const keys = Object.keys(scope);
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	new Function(...keys, source)(...keys.map((key) => scope[key as keyof typeof scope]));
	return { listeners, imported, dispatched, frames, documentListeners };
}

test('the precompiled prerender boot behaves exactly like the authored source', async () => {
	const eventNames = ['click', 'input'];
	const authored =
		createPrerenderInlineResumerSource(eventNames, undefined) +
		createInlineResumerSelfWakeSource(undefined);
	const minified = renderPrerenderInlineResumerSource(
		await compilePrerenderInlineResumerSource(true),
		eventNames,
	);

	const fromAuthored = bootScript(authored);
	const fromMinified = bootScript(minified);

	expect(fromMinified.listeners).toEqual(fromAuthored.listeners);
	expect(fromMinified.listeners).toEqual([
		{ type: 'click', capture: true },
		{ type: 'input', capture: true },
	]);
	// The self-wake schedule is the same shape: one frame, then a microtask.
	expect(fromMinified.frames).toHaveLength(fromAuthored.frames.length);
	expect(fromMinified.frames).toHaveLength(1);
	expect(fromMinified.documentListeners).toEqual(fromAuthored.documentListeners);
});

test('the precompiled boot without self-wake schedules nothing at load', async () => {
	const minified = renderPrerenderInlineResumerSource(
		await compilePrerenderInlineResumerSource(false),
		['click'],
	);
	const booted = bootScript(minified);
	expect(booted.listeners).toEqual([{ type: 'click', capture: true }]);
	expect(booted.frames).toEqual([]);
	expect(booted.imported).toEqual([]);
});

test('the prerender boot compiles deterministically and costs far less than its source', async () => {
	const first = await compilePrerenderInlineResumerSources();
	const second = await compilePrerenderInlineResumerSources();
	expect(first).toEqual(second);

	const eventNames = ['click'];
	const url = '/build/prerender-wake-A1b2.js';
	const authored =
		createPrerenderInlineResumerSource(eventNames, url) +
		createInlineResumerSelfWakeSource(url);
	const minified = renderPrerenderInlineResumerSource(first.prerenderSelfWake, eventNames);
	// Reported as INLINE_MIN_BYTES in the T012 checkpoint.
	expect(Buffer.byteLength(minified, 'utf8')).toBeLessThan(
		Buffer.byteLength(authored, 'utf8') / 2,
	);
	expect(minified).not.toContain(PRERENDER_INLINE_EVENT_NAMES_TOKEN);
});
