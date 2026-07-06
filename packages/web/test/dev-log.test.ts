import { expect, test } from 'vitest';
import {
	describeMarklessExecutionCauses,
	formatMarklessResumeSummary,
	shouldActivateMarklessExecutionLog,
} from '../src/dev-log.ts';

test('activation predicate enables local origins, query flag, storage flag, and always mode', () => {
	const activeLocations = [
		{ origin: 'http://localhost:4173', search: '' }, { origin: 'http://127.0.0.1:4173', search: '' },
		{ origin: 'http://[::1]:4173', search: '' }, { origin: 'https://example.test', search: '?markless-log' },
	];
	for (const location of activeLocations) expect(shouldActivateMarklessExecutionLog({ mode: 'auto', location })).toBe(true);
	expect(shouldActivateMarklessExecutionLog({
		mode: 'auto', location: { origin: 'https://example.test', search: '' },
		localStorage: { getItem: () => '1' },
	})).toBe(true);
	expect(shouldActivateMarklessExecutionLog({
		mode: 'auto', location: { origin: 'https://example.test', search: '' },
		localStorage: { getItem: () => null },
	})).toBe(false);
	expect(shouldActivateMarklessExecutionLog({
		mode: 'always', location: { origin: 'https://example.test', search: '' },
	})).toBe(true);
});

test('resume summary uses byte estimates when provided and counts otherwise', () => {
	expect(formatMarklessResumeSummary({
		executedModules: ['runtime:event', 'symbol:play'],
		preloadedModuleCount: 4,
		moduleSizes: new Map([['runtime:event', 512], ['symbol:play', 1536]]),
	})).toBe('markless: resumed — 2.0 KB est. executed, 4 modules preloaded (2 executed)');
	expect(formatMarklessResumeSummary({
		executedModules: ['runtime:event'],
		preloadedModuleCount: 2,
	})).toBe('markless: resumed — 1 module executed, 2 modules preloaded (1 executed)');
});

test('cause derivation reports woken modules and untouched capabilities from payload records', () => {
	const rows = describeMarklessExecutionCauses({
		eventName: 'click',
		eventRecord: { hostNodeId: 'h1', symbolIds: ['symbol:play'] },
		before: new Set(['runtime:inline']),
		after: new Set(['runtime:inline', 'runtime:event-dispatch', 'symbol:play']),
		view: {
			behaviors: [{ hostNodeId: 'h2', symbolId: 'symbol:behavior' }],
			domUpdates: [{ hostNodeId: 'h1', symbolId: 'symbol:text' }],
		},
	});

	expect(rows).toEqual(['woke runtime:event-dispatch <- click matched event record h1', 'woke symbol:play <- click matched event record h1', 'skip behavior — no matching record touched']);
});
