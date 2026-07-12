import { expect, test } from 'vitest';
import {
	accountMarklessExecution,
	describeMarklessEventTarget,
	describeMarklessExecutionCauses,
	formatMarklessExecutedSize,
	formatMarklessModuleId,
	formatMarklessResumeSummary,
	shouldActivateMarklessExecutionLog,
} from '../src/dev-log.ts';

const APP_SYMBOL_ID = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/App.tsrx')}:${encodeURIComponent('symbol:0')}`;
const LIBRARY_SYMBOL_ID = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Library.tsrx')}:${encodeURIComponent('symbol:0')}`;

test('module display names shorten qualified symbol ids to author-readable form', () => {
	expect(
		formatMarklessModuleId(
			`virtual:markless:symbol:${encodeURIComponent('/src/components/Player.tsrx')}:${encodeURIComponent('symbol:2')}`,
		),
	).toBe('symbol:2 (Player.tsrx)');
	expect(formatMarklessModuleId('web:resume-events')).toBe('web:resume-events');
});

test('executed sizes join local and route-prefixed symbol ids to a unique qualified entry', () => {
	const sizes = new Map([[APP_SYMBOL_ID, { raw: 1024, estimated: true }]]);

	expect(formatMarklessExecutedSize(['symbol:0'], sizes)).toBe(
		'1.0 KB est. app executed · 0.0 KB instrument',
	);
	expect(formatMarklessExecutedSize(['c0:symbol:0'], sizes)).toBe(
		'1.0 KB est. app executed · 0.0 KB instrument',
	);
	// Two spellings of the same module count once.
	expect(formatMarklessExecutedSize(['symbol:0', APP_SYMBOL_ID], sizes)).toBe(
		'1.0 KB est. app executed · 0.0 KB instrument',
	);
});

test('ambiguous local symbol ids refuse to guess a size', () => {
	const sizes = new Map([
		[APP_SYMBOL_ID, { raw: 1024, estimated: true }],
		[LIBRARY_SYMBOL_ID, { raw: 4096, estimated: true }],
	]);

	expect(formatMarklessExecutedSize(['symbol:0'], sizes)).toBe(
		'1 app module (bytes unknown; 1 unmapped) executed · 0.0 KB instrument',
	);
});

test('accounting partitions, deduplicates, and reports unmapped ids honestly', () => {
	const accounting = accountMarklessExecution(
		['app', 'app', 'instrument', 'missing'],
		new Map([
			['app', { raw: 4096, gzip: 1024, chunk: 'shared.js' }],
			['instrument', { raw: 2048, estimated: true, instrument: true }],
		]),
	);
	expect(accounting).toEqual({
		appBytes: null,
		instrumentBytes: 2048,
		appModules: 2,
		instrumentModules: 1,
		estimated: { app: false, instrument: true },
		unmappedIds: ['missing'],
	});
});

test('cause rows display qualified woken symbol ids in short form with sizes', () => {
	const rows = describeMarklessExecutionCauses({
		eventName: 'click',
		eventRecord: { hostNodeId: 'h1', symbolIds: ['symbol:0'] },
		before: new Set<string>(),
		after: new Set([APP_SYMBOL_ID]),
		moduleSizes: new Map([[APP_SYMBOL_ID, { raw: 1024, gzip: 512, chunk: 'chunk-app.js' }]]),
		view: { behaviors: [{ hostNodeId: 'h1' }] },
	});

	expect(rows).toEqual([
		'woke symbol:0 (App.tsrx) (0.5 KB) <- click matched event record h1',
		'ran warm symbol:0 (App.tsrx) (0.5 KB) <- click matched event record h1',
	]);
});

test('cause rows accept pull-attributed warm ids while unknown ids stay unchanged', () => {
	const sizes = new Map([[APP_SYMBOL_ID, { raw: 1024, gzip: 512 }]]);
	expect(
		describeMarklessExecutionCauses({
			eventName: 'click',
			eventRecord: { hostNodeId: 'h1', symbolIds: ['c1:symbol:0'] },
			before: new Set(),
			after: new Set(),
			moduleSizes: sizes,
			attribution: { 'pages/a.tsrx': { 'c1:': encodeURIComponent('/src/App.tsrx') } },
			routeFile: 'pages/a.tsrx',
			view: { behaviors: [{ hostNodeId: 'h1' }] },
		}),
	).toEqual(['ran warm symbol:0 (App.tsrx) (0.5 KB) <- click matched event record h1']);
});

test('pull attribution resolves root, sibling, and nested scopes by exact route', () => {
	const root = APP_SYMBOL_ID;
	const sibling = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Sibling.tsrx')}:${encodeURIComponent('symbol:0')}`;
	const leaf = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Leaf.tsrx')}:${encodeURIComponent('symbol:0')}`;
	const rows = describeMarklessExecutionCauses({
		eventName: 'click',
		eventRecord: {
			hostNodeId: 'h1',
			symbolIds: ['symbol:0', 'c0:symbol:0', 'c1:c0:symbol:0', 'c9:symbol:0'],
		},
		before: new Set(),
		after: new Set(),
		moduleSizes: new Map([root, sibling, leaf].map((id) => [id, { raw: 100 }])),
		attribution: {
			'pages/a.tsrx': {
				'': encodeURIComponent('/workspace/src/App.tsrx'),
				'c0:': encodeURIComponent('/workspace/src/Sibling.tsrx'),
				'c1:c0:': encodeURIComponent('/workspace/src/Leaf.tsrx'),
			},
		},
		routeFile: '/pages/a.tsrx',
		view: { behaviors: [{ hostNodeId: 'h1' }] },
	});

	expect(rows.map((row) => row.split(' <- ')[0])).toEqual([
		'ran warm symbol:0 (App.tsrx) (0.1 KB)',
		'ran warm symbol:0 (Sibling.tsrx) (0.1 KB)',
		'ran warm symbol:0 (Leaf.tsrx) (0.1 KB)',
		'ran warm c9:symbol:0 (bytes unknown)',
	]);
});

test('pull attribution inherits unprefixed symbol scope from the event host', () => {
	const source = (name: string) => encodeURIComponent(`/workspace/src/${name}.tsrx`);
	const symbol = (name: string, id: string) =>
		`virtual:markless:symbol:${source(name)}:${encodeURIComponent(id)}`;
	const ids = [
		symbol('Root', 'symbol:1'),
		symbol('Root', 'symbol:3'),
		symbol('Player', 'symbol:3'),
		symbol('Self', 'symbol:4'),
		symbol('Leaf', 'symbol:5'),
	];
	const base = {
		eventName: 'click',
		before: new Set<string>(),
		after: new Set<string>(),
		moduleSizes: new Map(ids.map((id, index) => [id, { raw: 100 + index }])),
		attribution: {
			'pages/a.tsrx': {
				'': source('Root'),
				'c2:': source('Player'),
				'c7:': source('Self'),
				'c1:c0:': source('Leaf'),
			},
		},
		routeFile: 'pages/a.tsrx',
	};
	const warmRow = (hostNodeId: string, symbolId: string) =>
		describeMarklessExecutionCauses({
			...base,
			eventRecord: { hostNodeId, symbolIds: [symbolId] },
		})[0];

	expect(warmRow('c2:h9', 'symbol:3')).toContain('symbol:3 (Player.tsrx)');
	expect(warmRow('c2:h9', 'c7:symbol:4')).toContain('symbol:4 (Self.tsrx)');
	expect(warmRow('h1', 'symbol:1')).toContain('symbol:1 (Root.tsrx)');
	expect(warmRow('c1:c0:h2', 'symbol:5')).toContain('symbol:5 (Leaf.tsrx)');
	expect(warmRow('c9:h2', 'symbol:3')).toContain('symbol:3 (bytes unknown)');
});

test('cause rows retain original ids for missing routes and unknown sources', () => {
	const input = {
		eventName: 'click',
		eventRecord: { hostNodeId: 'h1', symbolIds: ['symbol:0', 'symbol:1'] },
		before: new Set<string>(),
		after: new Set<string>(),
		view: { behaviors: [{ hostNodeId: 'h1' }] },
	};
	expect(
		describeMarklessExecutionCauses({
			...input,
			moduleSizes: new Map([[APP_SYMBOL_ID, { raw: 1024 }]]),
			attribution: { 'pages/a.tsrx': { '': encodeURIComponent('/src/App.tsrx') } },
			routeFile: '../pages/a.tsrx',
		}),
	).toEqual([
		'ran warm symbol:0 (App.tsrx) (1.0 KB) <- click matched event record h1',
		'ran warm symbol:1 (bytes unknown) <- click matched event record h1',
	]);
	expect(
		describeMarklessExecutionCauses({
			...input,
			moduleSizes: new Map([
				[APP_SYMBOL_ID, { raw: 1024 }],
				[LIBRARY_SYMBOL_ID, { raw: 2048 }],
			]),
			attribution: { 'pages/a.tsrx': { '': encodeURIComponent('/src/Unknown.tsrx') } },
			routeFile: 'pages/a.tsrx',
		}),
	).toEqual([
		'ran warm symbol:0 (bytes unknown) <- click matched event record h1',
		'ran warm symbol:1 (bytes unknown) <- click matched event record h1',
	]);
});

test('cause rows mark instrument modules after their size', () => {
	const rows = describeMarklessExecutionCauses({
		eventName: 'click',
		before: new Set<string>(),
		after: new Set(['virtual:markless:dev-log']),
		moduleSizes: new Map([
			[
				'virtual:markless:dev-log',
				{ raw: 2048, gzip: 1024, chunk: 'chunk-log.js', instrument: true },
			],
		]),
	});

	expect(rows).toEqual([
		'woke virtual:markless:dev-log (1.0 KB instrument) <- click matched runtime records',
	]);
});

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
	).toBe(
		'markless: resumed — 2.0 KB est. app executed, 4 modules preloaded (2 app executed) · 0.0 KB instrument',
	);
	expect(
		formatMarklessResumeSummary({
			executedModules: ['runtime:event'],
			preloadedModuleCount: 2,
		}),
	).toBe(
		'markless: resumed — 1 app module executed, 2 modules preloaded (1 app executed) · 0.0 KB instrument',
	);
});

test('executed size labels estimates and real gzip bytes distinctly', () => {
	expect(
		formatMarklessExecutedSize(
			['web:event-only-resume'],
			new Map([['web:event-only-resume', { raw: 2048, estimated: true }]]),
		),
	).toBe('2.0 KB est. app executed · 0.0 KB instrument');
	expect(
		formatMarklessExecutedSize(
			['web:missing'],
			new Map([['web:event-only-resume', { raw: 2048, estimated: true }]]),
		),
	).toBe('1 app module (bytes unknown; 1 unmapped) executed · 0.0 KB instrument');
	expect(
		formatMarklessExecutedSize(
			['web:event-only-resume'],
			new Map([['web:event-only-resume', { raw: 4096, gzip: 1024, chunk: 'chunk-a.js' }]]),
		),
	).toBe('1.0 KB app executed · 0.0 KB instrument');
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
