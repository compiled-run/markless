import { expect, test } from 'vitest';
import {
	describeMarklessEventTarget,
	describeMarklessExecutionCauses,
	formatMarklessExecutedSize,
	formatMarklessResumeSummary,
	shouldActivateMarklessExecutionLog,
} from '../src/dev-log.ts';

test('activation predicate enables local origins, query flag, storage flag, and always mode', () => {
	const activeLocations = [
		{ origin: 'http://localhost:4173', search: '' },
		{ origin: 'http://127.0.0.1:4173', search: '' },
		{ origin: 'http://[::1]:4173', search: '' },
		{ origin: 'https://example.test', search: '?markless-log' },
	];
	for (const location of activeLocations)
		expect(shouldActivateMarklessExecutionLog({ mode: 'auto', location })).toBe(true);
	expect(
		shouldActivateMarklessExecutionLog({
			mode: 'auto',
			location: { origin: 'https://example.test', search: '' },
			localStorage: { getItem: () => '1' },
		}),
	).toBe(true);
	expect(
		shouldActivateMarklessExecutionLog({
			mode: 'auto',
			location: { origin: 'https://example.test', search: '' },
			localStorage: { getItem: () => null },
		}),
	).toBe(false);
	expect(
		shouldActivateMarklessExecutionLog({
			mode: 'always',
			location: { origin: 'https://example.test', search: '' },
		}),
	).toBe(true);
});

test('resume summary uses byte estimates when provided and counts otherwise', () => {
	expect(
		formatMarklessResumeSummary({
			executedModules: ['runtime:event', 'symbol:play'],
			preloadedModuleCount: 4,
			moduleSizes: new Map([
				['runtime:event', { raw: 512, estimated: true }],
				['symbol:play', { raw: 1536, estimated: true }],
			]),
		}),
	).toBe('markless: resumed — 2.0 KB est. executed, 4 modules preloaded (2 executed)');
	expect(
		formatMarklessResumeSummary({
			executedModules: ['runtime:event'],
			preloadedModuleCount: 2,
		}),
	).toBe('markless: resumed — 1 module executed, 2 modules preloaded (1 executed)');
});

test('executed size labels estimates and real gzip bytes distinctly', () => {
	expect(
		formatMarklessExecutedSize(
			['web:event-only-resume'],
			new Map([['web:event-only-resume', { raw: 2048, estimated: true }]]),
		),
	).toBe('2.0 KB est. executed');
	expect(
		formatMarklessExecutedSize(
			['web:missing'],
			new Map([['web:event-only-resume', { raw: 2048, estimated: true }]]),
		),
	).toBe('0.0 KB est. executed');
	expect(
		formatMarklessExecutedSize(
			['web:event-only-resume'],
			new Map([['web:event-only-resume', { raw: 4096, gzip: 1024, chunk: 'chunk-a.js' }]]),
		),
	).toBe('1.0 KB executed');
});

test('selector derivation names tag, id, classes, and stable data attributes', () => {
	const target = {
		tagName: 'BUTTON',
		id: 'play',
		className: 'primary active ignored',
		getAttribute: (name: string) => (name === 'data-track-id' ? 'abc123' : null),
		getAttributeNames: () => ['aria-label', 'data-track-id'],
	};

	expect(describeMarklessEventTarget(target)).toBe(
		'button#play.primary.active[data-track-id="abc123"]',
	);
});

test('cause derivation reports woken and warm modules from payload records', () => {
	const rows = describeMarklessExecutionCauses({
		eventName: 'click',
		eventRecord: { hostNodeId: 'h1', symbolIds: ['symbol:play'] },
		before: new Set(['runtime:inline']),
		after: new Set(['runtime:inline', 'runtime:event-dispatch', 'symbol:play']),
		dispatchModuleId: 'web:event-only-resume',
		moduleSizes: new Map([
			['runtime:event-dispatch', { raw: 1024, gzip: 512, chunk: 'dispatch.js' }],
			['web:event-only-resume', { raw: 2048, gzip: 1024, chunk: 'event.js' }],
			['symbol:play', { raw: 4096, gzip: 2048, chunk: 'play.js' }],
		]),
		view: {
			behaviors: [{ hostNodeId: 'h2', symbolId: 'symbol:behavior' }],
			domUpdates: [{ hostNodeId: 'h1', symbolId: 'symbol:text' }],
		},
	});

	expect(rows).toEqual([
		'woke runtime:event-dispatch (0.5 KB) <- click matched event record h1',
		'woke symbol:play (2.0 KB) <- click matched event record h1',
		'ran warm web:event-only-resume (1.0 KB) <- click matched event record h1',
		'ran warm symbol:play (2.0 KB) <- click matched event record h1',
		'skip behavior — no matching record touched',
	]);
});
