import { afterEach, expect, test, vi } from 'vitest';
import {
	UNSHIPPED_HOOK_REASON,
	createExecutionSizesAsset,
} from '../src/build/execution-sizes.ts';
import {
	EXECUTION_LOG_DISPATCH_MODULE_IDS,
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	executionLogVirtualModuleSource,
	injectExecutionLogModuleHook,
	requalifyExecutionLogModuleHook,
} from '../src/execution-log.ts';
import { transformTsrxModule } from '../src/rolldown.ts';
import { symbolVirtualModuleId } from '../src/source-module.ts';

type ExecutionLogGlobal = typeof globalThis & {
	__mxLog?: Set<string>;
	__mxLogInteraction?: (event: unknown) => void;
	__marklessExecutionLedger?: unknown;
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	delete (globalThis as ExecutionLogGlobal).__mxLog;
	delete (globalThis as ExecutionLogGlobal).__mxLogInteraction;
	delete (globalThis as ExecutionLogGlobal).__marklessExecutionLedger;
});

test('execution log hooks strip completely when disabled', () => {
	const source = 'export const value = 1;';

	expect(injectExecutionLogModuleHook(source, 'runtime:event', 'never')).toBe(source);
});

test('execution log hooks are dormant optional-chain adds when disabled at runtime', () => {
	const hooked = injectExecutionLogModuleHook('export const value = 1;', 'runtime:event', 'auto');

	expect(hooked).toBe('globalThis.__mxLog?.add("runtime:event");\nexport const value = 1;');
	expect(hooked).not.toContain('new Set');
});

test('execution log virtual module id is stable for chunk grouping', () => {
	expect(MARKLESS_EXECUTION_LOG_MODULE_ID).toBe('virtual:markless:dev-log');
});

test('execution size asset maps runtime and symbol log ids to raw and gzip chunk sizes', async () => {
	const code = 'export const play = 1;';
	const asset = await createExecutionSizesAsset(
		{
			'build/chunk-play.js': {
				type: 'chunk',
				fileName: 'build/chunk-play.js',
				name: 'chunk-play',
				code,
				exports: ['play'],
				imports: [],
				dynamicImports: [],
				moduleIds: [
					'/workspace/packages/web/src/event-only-resume.ts',
					'\0virtual:markless:symbol:%2Fworkspace%2Fsrc%2FApp.tsrx:play',
				],
				facadeModuleId: null,
			},
		},
		{
			version: 1,
			modules: [
				{
					source: '/workspace/src/App.tsrx',
					payload: { virtualModuleId: 'virtual:markless:payload' },
					resolver: { virtualModuleId: 'virtual:markless:resolver' },
					symbols: [
						{
							symbolId: 'play',
							kind: 'event',
							exportName: 'play',
							virtualModuleId:
								'virtual:markless:symbol:%2Fworkspace%2Fsrc%2FApp.tsrx:play',
							fileName: 'chunk-play.js',
						},
					],
				},
			],
			bundles: {},
		},
		(fileName) => fileName.replace(/^build\//, ''),
		{
			'pages/app.tsrx': {
				'': encodeURIComponent('/workspace/src/App.tsrx'),
				'c0:': encodeURIComponent('/workspace/src/Child.tsrx'),
			},
		},
	);
	const sizes = JSON.parse(String(asset.source)) as Record<
		string,
		{ raw: number; gzip: number; chunk: string }
	> & { attribution: Record<string, Record<string, string>> };

	expect(asset.fileName).toBe('build/execution-sizes.json');
	expect(sizes.attribution).toEqual({
		'pages/app.tsrx': {
			'': encodeURIComponent('/workspace/src/App.tsrx'),
			'c0:': encodeURIComponent('/workspace/src/Child.tsrx'),
		},
	});
	expect(sizes['web:event-only-resume']).toMatchObject({
		raw: code.length,
		chunk: 'chunk-play.js',
	});
	expect(sizes['web:event-only-resume']!.gzip).toBeGreaterThan(0);
	expect(sizes['web:event-only-resume']).not.toHaveProperty('instrument');
	// Symbol sizes are keyed by the symbol virtual module id (which embeds the
	// source filename) so same-numbered symbols from different sources cannot
	// overwrite each other.
	expect(sizes['virtual:markless:symbol:%2Fworkspace%2Fsrc%2FApp.tsrx:play']).toEqual(
		sizes['web:event-only-resume'],
	);
});

test('execution gzip accounting ignores content-hash module specifier names', async () => {
	const assetFor = (hash: string) =>
		createExecutionSizesAsset(
			{
				'build/chunk-entry.js': {
					type: 'chunk',
					fileName: 'build/chunk-entry.js',
					name: 'chunk-entry',
					code:
						`import { resume } from "./chunk-${hash}.js";\n` +
						`const unrelated = "AbCdEf12 AbCdEf12 AbCdEf12 AbCdEf12";\n` +
						`resume(unrelated);`,
					exports: [],
					imports: [`build/chunk-${hash}.js`],
					dynamicImports: [],
					moduleIds: ['/workspace/packages/web/src/resume-events.ts'],
					facadeModuleId: null,
				},
			},
			{ version: 1, modules: [], bundles: {} },
			(fileName) => fileName.replace(/^build\//, ''),
		);

	const first = JSON.parse(String((await assetFor('AbCdEf12')).source)) as Record<
		string,
		{ gzip: number }
	>;
	const second = JSON.parse(String((await assetFor('zYxWvU98')).source)) as Record<
		string,
		{ gzip: number }
	>;

	expect(first['web:resume-events']?.gzip).toBe(second['web:resume-events']?.gzip);
});

test('execution size asset covers the dev-log module id that logs itself', async () => {
	const code = 'globalThis.__mxLog?.add("virtual:markless:dev-log");\nexport const log = 1;';
	const asset = await createExecutionSizesAsset(
		{
			'build/chunk-log.js': {
				type: 'chunk',
				fileName: 'build/chunk-log.js',
				name: 'chunk-log',
				code,
				exports: [],
				imports: [],
				dynamicImports: [],
				moduleIds: [`\0${MARKLESS_EXECUTION_LOG_MODULE_ID}`],
				facadeModuleId: null,
			},
		},
		{ version: 1, modules: [], bundles: {} },
		(fileName) => fileName.replace(/^build\//, ''),
	);
	const sizes = JSON.parse(String(asset.source)) as Record<
		string,
		{ raw: number; chunk: string; instrument?: true }
	>;

	expect(sizes[MARKLESS_EXECUTION_LOG_MODULE_ID]).toMatchObject({
		raw: code.length,
		chunk: 'chunk-log.js',
		instrument: true,
	});
	expect(sizes).not.toHaveProperty('attribution');
});

test('execution size asset rejects a dev-log chunk shared with app log ids', async () => {
	const create = createExecutionSizesAsset(
		{
			'build/chunk-shared.js': {
				type: 'chunk',
				fileName: 'build/chunk-shared.js',
				name: 'chunk-shared',
				code: 'export const shared = true;',
				exports: [],
				imports: [],
				dynamicImports: [],
				moduleIds: [
					`\0${MARKLESS_EXECUTION_LOG_MODULE_ID}`,
					'/workspace/packages/web/src/event-only-resume.ts',
				],
				facadeModuleId: null,
			},
		},
		{ version: 1, modules: [], bundles: {} },
		(fileName) => fileName.replace(/^build\//, ''),
	);

	await expect(create).rejects.toThrow(
		'Markless execution sizes require an isolated dev-log chunk; chunk "chunk-shared.js" also contains logged module ids: web:event-only-resume.',
	);
});

test('same-numbered symbols from two source files keep distinct size entries', async () => {
	const appSymbolId = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/App.tsrx')}:${encodeURIComponent('symbol:0')}`;
	const librarySymbolId = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Library.tsrx')}:${encodeURIComponent('symbol:0')}`;
	const chunk = (fileName: string, code: string, moduleId: string) => ({
		type: 'chunk' as const,
		fileName,
		name: fileName,
		code,
		exports: [],
		imports: [],
		dynamicImports: [],
		moduleIds: [`\0${moduleId}`],
		facadeModuleId: null,
	});
	const module = (source: string, virtualModuleId: string, fileName: string) => ({
		source,
		payload: { virtualModuleId: 'virtual:markless:payload' },
		resolver: { virtualModuleId: 'virtual:markless:resolver' },
		symbols: [
			{
				symbolId: 'symbol:0',
				kind: 'event',
				exportName: 'symbol_0',
				virtualModuleId,
				fileName,
			},
		],
	});
	const asset = await createExecutionSizesAsset(
		{
			'build/chunk-app.js': chunk('build/chunk-app.js', 'export const app = 1;', appSymbolId),
			'build/chunk-library.js': chunk(
				'build/chunk-library.js',
				'export const library = "bigger chunk";',
				librarySymbolId,
			),
		},
		{
			version: 1,
			modules: [
				module('/workspace/src/App.tsrx', appSymbolId, 'chunk-app.js'),
				module('/workspace/src/Library.tsrx', librarySymbolId, 'chunk-library.js'),
			],
			bundles: {},
		},
		(fileName) => fileName.replace(/^build\//, ''),
	);
	const sizes = JSON.parse(String(asset.source)) as Record<
		string,
		{ raw: number; chunk: string }
	>;

	expect(sizes[appSymbolId]).toMatchObject({ chunk: 'chunk-app.js' });
	expect(sizes[librarySymbolId]).toMatchObject({ chunk: 'chunk-library.js' });
	expect(sizes[appSymbolId]!.raw).not.toBe(sizes[librarySymbolId]!.raw);
});

test('requalify rewrites the injected hook id and leaves unhooked sources alone', () => {
	const hooked = injectExecutionLogModuleHook(
		'export const value = 1;',
		'symbol:symbol:0',
		'auto',
	);
	const qualified = requalifyExecutionLogModuleHook(
		hooked,
		'virtual:markless:symbol:%2Fsrc%2FApp.tsrx:symbol%3A0',
	);

	expect(qualified).toBe(
		'globalThis.__mxLog?.add("virtual:markless:symbol:%2Fsrc%2FApp.tsrx:symbol%3A0");\nexport const value = 1;',
	);
	expect(requalifyExecutionLogModuleHook('export const value = 1;', 'symbol:0')).toBe(
		'export const value = 1;',
	);
});

let executionLogModuleImport = 0;

async function importExecutionLogModule(source: string) {
	return (await import(
		`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${executionLogModuleImport++}`
	)) as {
		installMarklessExecutionLog: (input?: unknown) => Promise<void>;
		logMarklessInteraction: (event: unknown) => Promise<void>;
		logMarklessSpecializedInteraction: (input: unknown, before: Set<string>) => Promise<void>;
		logMarklessRenderSummary: (input?: unknown) => Promise<void>;
	};
}

function stubExecutionLogDom(routeFile?: string) {
	const attributes = new Map<string, string>();
	vi.stubGlobal('document', {
		documentElement: {
			getAttribute: (name: string) => attributes.get(name) ?? null,
			setAttribute: (name: string, value: string) => attributes.set(name, value),
			removeAttribute: (name: string) => attributes.delete(name),
		},
		querySelector: () =>
			routeFile === undefined ? null : { textContent: JSON.stringify({ file: routeFile }) },
		querySelectorAll: () => [],
	});
	return attributes;
}

test('rendered summary sizes every executed id the module hook can inject', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const logged: string[] = [];
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => logged.push(String(line)));

	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ moduleSizes: new Map([['web:fns/csr', 2048]]) }),
	);
	await mod.logMarklessRenderSummary();

	// Importing the module runs its own hook: the only executed id is the
	// dev-log module itself, and the size join must still resolve it.
	expect([...(globalThis as ExecutionLogGlobal).__mxLog!]).toEqual([
		MARKLESS_EXECUTION_LOG_MODULE_ID,
	]);
	expect(logged).toHaveLength(1);
	// The instrument keeps its own category and stays out of the headline, so
	// the only proof its id joined the map is a non-zero instrument mirror and
	// an absent unmapped list — a hole would show up as `unmapped`, not as 0.0.
	expect(logged[0]).toBe('markless: 0.0 KB executed at load · total 0.0 KB');
	expect(Number(attributes.get('data-markless-log-instrument-bytes'))).toBeGreaterThan(0);
	expect(attributes.has('data-markless-log-incomplete')).toBe(false);
	expect(attributes.get('data-markless-log-unit')).toBe('estimated-source-bytes');
});

test('render summary prints one line per turn no matter how many modules call in', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const logged: string[] = [];
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => logged.push(String(line)));

	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ moduleSizes: new Map([['app:one', 1024]]) }),
	);
	// Every injected client entry module calls in as it evaluates: one click
	// evaluating eleven lazy modules must still read as one render.
	await Promise.all([
		mod.logMarklessRenderSummary(),
		mod.logMarklessRenderSummary(),
		mod.logMarklessRenderSummary(),
	]);

	expect(logged).toHaveLength(1);

	(globalThis as ExecutionLogGlobal).__mxLog!.add('app:one');
	await mod.logMarklessRenderSummary();

	expect(logged).toHaveLength(2);
	// The turn's last caller is the one printed, so the line carries the
	// cumulative accounting rather than a stale snapshot.
	expect(logged[1]).toBe('markless: 1.0 KB executed at load · total 1.0 KB');
	expect(attributes.get('data-markless-log-summary')).toBe(logged[1]);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('1024');
});

test('render summary coalesces callers arriving across separate task checkpoints', async () => {
	stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const logged: string[] = [];
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => logged.push(String(line)));
	// The browser delivers each injected entry module's call from its own
	// dynamic-import resolution, a fraction of a millisecond apart, so the
	// window that holds one render turn is the frame, not the microtask queue.
	vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));

	const mod = await importExecutionLogModule(executionLogVirtualModuleSource());
	const calls = [];
	for (let index = 0; index < 3; index++) {
		calls.push(mod.logMarklessRenderSummary());
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	await Promise.all(calls);

	expect(logged).toHaveLength(1);

	await mod.logMarklessRenderSummary();

	expect(logged).toHaveLength(2);
});

test('interaction rows resolve qualified symbol ids and display them short', async () => {
	const attributes = stubExecutionLogDom();
	const appSymbol = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/App.tsrx')}:${encodeURIComponent('symbol:0')}`;
	(globalThis as ExecutionLogGlobal).__mxLog = new Set([appSymbol]);
	const headers: string[] = [];
	const rows: string[] = [];
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => rows.push(String(line)));
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ moduleSizes: new Map([[appSymbol, 1024]]) }),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'button',
		eventRecord: { hostNodeId: 'h1', symbolIds: ['symbol:0'] },
		before: new Set<string>([MARKLESS_EXECUTION_LOG_MODULE_ID]),
		view: { behaviors: [{ hostNodeId: 'h1' }] },
	});

	expect(headers).toHaveLength(1);
	// Woken id is the qualified id; warm id is the payload's local "symbol:0".
	// Both must join the same size entry (counted once) instead of 0.0 KB, and
	// the ledger charges that entry to this click exactly once.
	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +1.0 KB · total 1.0 KB',
	);
	expect(rows[0]).toBe('click [button] · woke 1 modules · ran warm 1 modules');
	expect(
		rows.some((row) => row.startsWith('woke symbol:0 (App.tsrx) (1.0 KB est. source)')),
	).toBe(true);
	expect(
		rows.some((row) => row.startsWith('ran warm symbol:0 (App.tsrx) (1.0 KB est. source)')),
	).toBe(true);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('1024');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('0');
});

test('pull attribution resolves both first-call lazy and direct installed-hook paths', async () => {
	const attributes = stubExecutionLogDom('pages/player.tsrx');
	const appSymbol = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Player.tsrx')}:${encodeURIComponent('symbol:3')}`;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({
				'web:resume-events': { raw: 1646, gzip: 1646, chunk: 'resume.js' },
				[appSymbol]: { raw: 182, gzip: 184, chunk: 'player.js' },
				attribution: {
					'pages/player.tsrx': {
						'c1:c0:': encodeURIComponent('/workspace/src/Player.tsrx'),
					},
				},
			}),
		})),
	);
	const loggerSource = executionLogVirtualModuleSource({ sizesUrl: '/execution-sizes.json' });
	const event = {
		eventName: 'click',
		selector: 'button.play',
		eventRecord: { hostNodeId: 'player', symbolIds: ['c1:c0:symbol:3'] },
		dispatchModuleId: 'web:resume-events',
		before: new Set<string>([MARKLESS_EXECUTION_LOG_MODULE_ID]),
		view: { behaviors: [{ hostNodeId: 'player' }] },
	};
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});

	// Raw bytes, and the dispatch module is framework rather than app: the click
	// costs 182 of the page's own code plus 1646 of framework.
	const expectSplit = () => {
		expect(attributes.get('data-markless-log-app-bytes')).toBe('182');
		expect(attributes.get('data-markless-log-framework-bytes')).toBe('1646');
		expect(attributes.get('data-markless-log-turn-bytes')).toBe('1828');
	};

	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	let mod = await importExecutionLogModule(loggerSource);
	await mod.logMarklessInteraction(event);
	expectSplit();

	// A fresh page: the ledger is cumulative and charges each id once, so the
	// second path only re-proves the join if it starts from an empty ledger.
	delete (globalThis as ExecutionLogGlobal).__marklessExecutionLedger;
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	mod = await importExecutionLogModule(loggerSource);
	await mod.installMarklessExecutionLog({ printResumeSummary: false });
	await (globalThis as ExecutionLogGlobal).__mxLogInteraction!(event);
	expectSplit();
});

test('embedded attribution selects the child-owned symbol without fetching or guessing', async () => {
	const attributes = stubExecutionLogDom('routes/arena.tsrx');
	const parent = await transformTsrxModule({
		filename: '/workspace/routes/Arena.tsrx',
		source: `
import { state } from '@markless/core';
import Banner from '../widgets/Banner.tsrx';
import ScorePad from '../widgets/ScorePad.tsrx';
export default function Arena() @{
	let round = state(0);
	<main>
		<button onClick={() => round++}>Next {round}</button>
		<Banner />
		<ScorePad />
	</main>
}`,
		environment: 'client',
	});
	const child = await transformTsrxModule({
		filename: '/workspace/widgets/ScorePad.tsrx',
		source: `
import { state } from '@markless/core';
export default function ScorePad() @{
	let score = state(0);
	<button onClick={() => score++}>Score {score}</button>
}`,
		environment: 'client',
	});
	const parentSymbol = parent.manifest.symbols[0]!;
	const childSymbol = child.manifest.symbols[0]!;
	const childRoute = parent.manifest.symbolRoutes?.find((route) =>
		route.importSource.includes('ScorePad.tsrx'),
	);
	if (!childRoute) throw new Error('expected compiler-produced child route');
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const headers: string[] = [];
	const rows: string[] = [];
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => rows.push(String(line)));

	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({
			moduleSizes: new Map([
				[parentSymbol.virtualModuleId, 1024],
				[childSymbol.virtualModuleId, 4096],
			]),
			attribution: {
				'routes/arena.tsrx': {
					'': encodeURIComponent(parent.manifest.source),
					[childRoute.prefix]: encodeURIComponent(child.manifest.source),
				},
			},
		}),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'button.score',
		eventRecord: {
			hostNodeId: `${childRoute.prefix}h4`,
			symbolIds: [`${childRoute.prefix}${childSymbol.symbolId}`],
		},
		before: new Set<string>([MARKLESS_EXECUTION_LOG_MODULE_ID]),
		view: { behaviors: [{ hostNodeId: `${childRoute.prefix}h4` }] },
	});

	expect(fetch).not.toHaveBeenCalled();
	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +4.0 KB · total 4.0 KB',
	);
	expect(headers[0]).not.toContain('unmapped');
	expect(attributes.get('data-markless-log-unit')).toBe('estimated-source-bytes');
	expect(rows).toContainEqual(
		expect.stringContaining('ran warm symbol:0 (ScorePad.tsrx) (4.0 KB est. source)'),
	);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('4096');
});

test('bound symbol attribution charges the base module once and preserves the observed id', async () => {
	const attributes = stubExecutionLogDom('routes/arena.tsrx');
	const childSource = '/workspace/widgets/ScorePad.tsrx';
	const baseSymbol = symbolVirtualModuleId(childSource, 'symbol:0');
	const boundSymbolId = `bound:${encodeURIComponent('symbol:0')}:${encodeURIComponent('component-edge:0')}`;
	(globalThis as ExecutionLogGlobal).__mxLog = new Set([baseSymbol]);
	const headers: string[] = [];
	const rows: string[] = [];
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => rows.push(String(line)));

	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({
			moduleSizes: new Map([[baseSymbol, 4096]]),
			attribution: {
				'routes/arena.tsrx': { 'c1:': encodeURIComponent(childSource) },
			},
		}),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'button.score',
		eventRecord: { hostNodeId: 'c1:h4', symbolIds: [boundSymbolId] },
		before: new Set<string>([MARKLESS_EXECUTION_LOG_MODULE_ID]),
		view: { behaviors: [{ hostNodeId: 'c1:h4' }] },
	});

	// The base module is charged once even though the woken id and the warm
	// bound id both resolve to it.
	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +4.0 KB · total 4.0 KB',
	);
	expect(rows[0]).toBe('click [button.score] · woke 1 modules · ran warm 1 modules');
	expect(rows).toContainEqual(
		expect.stringContaining(`ran warm ${boundSymbolId} (ScorePad.tsrx) (4.0 KB est. source)`),
	);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('4096');
});

test.each([
	['missing route', 'routes/missing.tsrx', 'c1:symbol:0', 'c1:h4'],
	['unknown scope', 'routes/arena.tsrx', 'c9:symbol:0', 'c9:h4'],
	['ambiguous local symbol', 'routes/arena.tsrx', 'symbol:0', 'h4'],
])(
	'embedded attribution excludes %s from the totals',
	async (_, routeFile, symbolId, hostNodeId) => {
		const attributes = stubExecutionLogDom(routeFile);
		const parentSource = '/workspace/routes/Arena.tsrx';
		const childSource = '/workspace/widgets/ScorePad.tsrx';
		(globalThis as ExecutionLogGlobal).__mxLog = new Set();
		const headers: string[] = [];
		vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
			headers.push(String(line)),
		);
		vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const mod = await importExecutionLogModule(
			executionLogVirtualModuleSource({
				moduleSizes: new Map([
					[symbolVirtualModuleId(parentSource, 'symbol:0'), 1024],
					[symbolVirtualModuleId(childSource, 'symbol:0'), 4096],
				]),
				attribution: {
					'routes/arena.tsrx': { 'c1:': encodeURIComponent(childSource) },
				},
			}),
		);
		await mod.logMarklessInteraction({
			eventName: 'click',
			eventRecord: { hostNodeId, symbolIds: [symbolId] },
			before: new Set<string>([MARKLESS_EXECUTION_LOG_MODULE_ID]),
		});

		// An id the map cannot back is named and excluded, never folded into a
		// number the ledger cannot defend.
		expect(headers[0]).toContain('· 1 unmapped (excluded)');
		expect(attributes.get('data-markless-log-incomplete')).toBe('1');
		expect(attributes.get('data-markless-log-app-bytes')).toBe('0');
		expect(attributes.get('data-markless-log-turn-bytes')).toBe('0');
	},
);

test('generated logger inherits unprefixed symbol scope from the event host', async () => {
	const attributes = stubExecutionLogDom('pages/player.tsrx');
	const source = (name: string) => encodeURIComponent(`/workspace/src/${name}.tsrx`);
	const symbol = (name: string, id: string) =>
		`virtual:markless:symbol:${source(name)}:${encodeURIComponent(id)}`;
	const entries = [
		[symbol('Root', 'symbol:1'), 101],
		[symbol('Root', 'symbol:3'), 103],
		[symbol('Player', 'symbol:3'), 184],
		[symbol('Self', 'symbol:4'), 104],
		[symbol('Leaf', 'symbol:5'), 105],
	] as const;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({
				...Object.fromEntries(entries.map(([id, gzip]) => [id, { raw: gzip, gzip }])),
				attribution: {
					'pages/player.tsrx': {
						'': source('Root'),
						'c2:': source('Player'),
						'c7:': source('Self'),
						'c1:c0:': source('Leaf'),
					},
				},
			}),
		})),
	);
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ sizesUrl: '/execution-sizes.json' }),
	);
	await mod.installMarklessExecutionLog({ printResumeSummary: false });
	const run = (hostNodeId: string, symbolId: string) => {
		(globalThis as ExecutionLogGlobal).__mxLogInteraction!({
			eventName: 'click',
			eventRecord: { hostNodeId, symbolIds: [symbolId] },
			before: new Set([MARKLESS_EXECUTION_LOG_MODULE_ID]),
		});
		return attributes.get('data-markless-log-app-bytes');
	};

	expect(run('c2:h9', 'symbol:3')).toBe('184');
	expect(run('c2:h9', 'c7:symbol:4')).toBe('104');
	expect(run('h1', 'symbol:1')).toBe('101');
	expect(run('c1:c0:h2', 'symbol:5')).toBe('105');
	// A scope the attribution table does not name stays unjoined: the turn
	// charges nothing and the id is listed as unmapped rather than guessed.
	expect(run('c9:h2', 'symbol:3')).toBe('0');
	expect(attributes.get('data-markless-log-incomplete')).toBe('1');
});

test('interaction accounting stays bounded by each caller snapshot', async () => {
	const attributes = stubExecutionLogDom();
	const loggerSource = executionLogVirtualModuleSource({
		moduleSizes: new Map([
			['app:first', 100],
			['app:second', 200],
		]),
	});
	const headers: string[] = [];
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	(globalThis as ExecutionLogGlobal).__mxLog = new Set(['app:first']);
	const mod = await importExecutionLogModule(loggerSource);
	const firstAfter = new Set((globalThis as ExecutionLogGlobal).__mxLog);
	const first = mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'first',
		before: new Set(),
		after: firstAfter,
	});
	(globalThis as ExecutionLogGlobal).__mxLog!.add('app:second');
	const second = mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'second',
		before: new Set(),
		after: new Set((globalThis as ExecutionLogGlobal).__mxLog),
	});
	await Promise.all([first, second]);

	// Each caller's own snapshot bounds its turn: the first click charges only
	// app:first, the second only app:second — never the other's modules.
	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +0.1 KB · total 0.1 KB',
	);
	expect(headers[1]).toBe(
		'markless: 0.0 KB executed at load · this click +0.2 KB · total 0.3 KB',
	);
	expect(attributes.get('data-markless-log-turn-label')).toBe('click [second]');
	expect(attributes.get('data-markless-log-interactions')).toBe('2');
});

test('concurrent first interactions share installation and both reach the hook', async () => {
	const attributes = stubExecutionLogDom();
	let release!: () => void;
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise(
					(resolve) => (release = () => resolve({ ok: true, json: async () => ({}) })),
				),
		),
	);
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ sizesUrl: '/execution-sizes.json' }),
	);
	const first = mod.logMarklessInteraction({ eventName: 'click', selector: 'first' });
	const second = mod.logMarklessInteraction({ eventName: 'click', selector: 'second' });
	release();
	await Promise.all([first, second]);

	expect(attributes.get('data-markless-log-interactions')).toBe('2');
});

test('generated logger accounts an instrument-only interaction', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const headers: string[] = [];
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});

	const mod = await importExecutionLogModule(executionLogVirtualModuleSource());
	await mod.installMarklessExecutionLog({
		printResumeSummary: false,
		moduleSizes: {
			[MARKLESS_EXECUTION_LOG_MODULE_ID]: {
				raw: 2048,
				gzip: 512,
				chunk: 'chunk-log.js',
				instrument: true,
			},
		},
	});
	await (globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>(),
	});

	// The instrument's raw bytes are charged and mirrored, but never enter the
	// headline: the sentence is what the page cost, not what dev tooling cost.
	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +0.0 KB · total 0.0 KB (gzip 0.5 KB)',
	);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('0');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('2048');
});

test('generated logger partitions mixed app and instrument interaction accounting', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set(['app:play']);
	const headers: string[] = [];
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});

	const mod = await importExecutionLogModule(executionLogVirtualModuleSource());
	await mod.installMarklessExecutionLog({
		printResumeSummary: false,
		moduleSizes: {
			'app:play': { raw: 4096, gzip: 1024, chunk: 'chunk-app.js' },
			[MARKLESS_EXECUTION_LOG_MODULE_ID]: {
				raw: 2048,
				gzip: 512,
				chunk: 'chunk-log.js',
				instrument: true,
			},
		},
	});
	await (globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>(),
	});

	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +4.0 KB · total 4.0 KB (gzip 1.5 KB)',
	);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('4096');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('2048');
});

test('generated logger formats specialized interaction snapshots in the lazy bridge', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set(['app:action']);
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});

	const mod = await importExecutionLogModule(executionLogVirtualModuleSource());
	await mod.logMarklessSpecializedInteraction(
		{
			event: { type: 'keydown', target: { id: 'field', tagName: 'INPUT' } },
			eventRecord: { hostNodeId: 'host:field', symbolIds: [] },
		},
		new Set<string>(),
	);

	expect(attributes.get('data-markless-log-turn-label')).toBe('keydown [input#field]');
	expect(attributes.get('data-markless-log-last')).toContain('this keydown +');
});

test('generated logger treats old unmarked object size maps as app entries', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set(['app:legacy']);
	const headers: string[] = [];
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});

	const mod = await importExecutionLogModule(executionLogVirtualModuleSource());
	await mod.installMarklessExecutionLog({
		printResumeSummary: false,
		moduleSizes: { 'app:legacy': { raw: 3072, gzip: 768, chunk: 'legacy.js' } },
	});
	await (globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>([MARKLESS_EXECUTION_LOG_MODULE_ID]),
	});

	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +3.0 KB · total 3.0 KB (gzip 0.8 KB)',
	);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('3072');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('0');
});

test('emitted raw bytes are the headline and gzip rides along in parentheses', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set(['app:emitted']);
	const headers: string[] = [];
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		headers.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});

	const mod = await importExecutionLogModule(executionLogVirtualModuleSource());
	await mod.installMarklessExecutionLog({
		printResumeSummary: false,
		moduleSizes: {
			'app:emitted': { raw: 9000, gzip: 900, chunk: 'chunk-app.js' },
			[MARKLESS_EXECUTION_LOG_MODULE_ID]: {
				raw: 7000,
				gzip: 700,
				chunk: 'chunk-log.js',
				instrument: true,
			},
		},
	});
	await (globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>(),
	});

	// Raw is what a browser actually parses and runs, so it owns the sentence
	// and the mirrors; gzip is the payload story, kept as a parenthetical.
	expect(headers[0]).toBe(
		'markless: 0.0 KB executed at load · this click +8.8 KB · total 8.8 KB (gzip 1.6 KB)',
	);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('9000');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('7000');
	expect(attributes.get('data-markless-log-unit')).toBe('chunk-raw-bytes');
});

test('no-match line has exact zero categories and integer mirrors', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const lines: string[] = [];
	vi.spyOn(console, 'info').mockImplementation((line: unknown) => lines.push(String(line)));
	const mod = await importExecutionLogModule(executionLogVirtualModuleSource());
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'button.play',
		noMatch: true,
	});

	expect(lines).toEqual([
		'markless: 0.0 KB executed at load · this click +0.0 KB · total 0.0 KB · no event record matched [button.play]',
	]);
	expect(attributes.get('data-markless-log-last')).toBe(lines[0]);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('0');
	expect(attributes.get('data-markless-log-framework-bytes')).toBe('0');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('0');
	expect(attributes.has('data-markless-log-incomplete')).toBe(false);
});

test('ambiguous local symbol ids refuse to guess a size instead of joining wrong', async () => {
	const attributes = stubExecutionLogDom();
	attributes.set('data-markless-log-app-bytes', '999');
	attributes.set('data-markless-log-instrument-bytes', '999');
	const appSymbol = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/App.tsrx')}:${encodeURIComponent('symbol:0')}`;
	const librarySymbol = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Library.tsrx')}:${encodeURIComponent('symbol:0')}`;
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const rows: string[] = [];
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => rows.push(String(line)));
	vi.spyOn(console, 'groupCollapsed').mockImplementation((line: unknown) =>
		rows.push(String(line)),
	);
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({
			moduleSizes: new Map([
				[appSymbol, 1024],
				[librarySymbol, 4096],
			]),
		}),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'button',
		eventRecord: { hostNodeId: 'h1', symbolIds: ['symbol:0'] },
		before: new Set<string>(),
		view: { behaviors: [{ hostNodeId: 'h1' }] },
	});

	expect(rows.some((row) => row.startsWith('ran warm symbol:0 (bytes unknown)'))).toBe(true);
	// Two sources own a `symbol:0`; guessing either would print a number the
	// ledger cannot back, so the id is excluded and named instead.
	expect(attributes.get('data-markless-log-app-bytes')).toBe('0');
	expect(attributes.get('data-markless-log-turn-bytes')).toBe('0');
	expect(attributes.get('data-markless-log-incomplete')).toBe('1');
	// The only id this turn could back is the instrument's own module.
	expect(attributes.get('data-markless-log-turn-modules')).toBe(MARKLESS_EXECUTION_LOG_MODULE_ID);
});

// --- Slice 1: complete, fail-closed size map -------------------------------

const APP_SYMBOL_ID = 'virtual:markless:symbol:%2Fworkspace%2Fsrc%2FApp.tsrx:play';

function sizeChunk(fileName: string, moduleIds: readonly string[], code = 'export const a = 1;') {
	return {
		type: 'chunk' as const,
		fileName,
		name: fileName.replace(/^build\//, '').replace(/\.js$/, ''),
		code,
		exports: [],
		imports: [],
		dynamicImports: [],
		moduleIds: [...moduleIds],
		facadeModuleId: null,
	};
}

function sizeMetadata(symbol: { fileName?: string } = {}) {
	return {
		version: 1 as const,
		modules: [
			{
				source: '/workspace/src/App.tsrx',
				payload: { virtualModuleId: 'virtual:markless:payload' },
				resolver: { virtualModuleId: 'virtual:markless:resolver' },
				symbols: [
					{
						symbolId: 'play',
						kind: 'event' as const,
						exportName: 'play',
						virtualModuleId: APP_SYMBOL_ID,
						...symbol,
					},
				],
			},
		],
		bundles: {},
	};
}

const stripBuild = (fileName: string) => fileName.replace(/^build\//, '');

test('execution log module keeps no second copy of the size-asset builder', async () => {
	const module = await import('../src/execution-log.ts');

	expect(Object.keys(module)).not.toContain('createExecutionSizesAsset');
	expect(Object.keys(module)).not.toContain('MARKLESS_EXECUTION_SIZES');
});

test('execution sizes fail the build when a shipped symbol id joins no chunk', async () => {
	await expect(
		createExecutionSizesAsset(
			{
				'build/chunk-app.js': sizeChunk('build/chunk-app.js', [
					'/workspace/packages/web/src/resume-events.ts',
				]),
			},
			sizeMetadata({ fileName: 'chunk-vanished.js' }),
			stripBuild,
			undefined,
			{ executionLogActive: true },
		),
	).rejects.toThrow(APP_SYMBOL_ID);
});

test('execution sizes source a symbol entry from the chunk that absorbed it', async () => {
	const asset = await createExecutionSizesAsset(
		{
			'build/chunk-app.js': sizeChunk('build/chunk-app.js', [`\0${APP_SYMBOL_ID}`]),
		},
		sizeMetadata(),
		stripBuild,
		undefined,
		{ executionLogActive: true },
	);
	const sizes = JSON.parse(String(asset.source)) as Record<string, { chunk: string }>;

	expect(sizes[APP_SYMBOL_ID]?.chunk).toBe('chunk-app.js');
});

test('execution sizes resolve a required id from any workspace package chunk', async () => {
	const asset = await createExecutionSizesAsset(
		{
			'build/chunk-router.js': sizeChunk('build/chunk-router.js', [
				'/workspace/packages/router/src/preload.ts',
			]),
		},
		sizeMetadata({ fileName: 'chunk-router.js' }),
		stripBuild,
		undefined,
		{
			executionLogActive: true,
			hookedIds: new Map([['router:preload', '/workspace/packages/router/src/preload.ts']]),
		},
	);
	const sizes = JSON.parse(String(asset.source)) as Record<string, { chunk: string }>;

	expect(sizes['router:preload']?.chunk).toBe('chunk-router.js');
});

// Hooks are injected in `transform`, which runs before chunk assignment exists,
// so the injection site cannot refuse to hook a module that will not ship. The
// map therefore carries the exemption explicitly instead of dropping the id.
test('execution sizes name a hooked id that no client chunk carries, with its reason', async () => {
	const asset = await createExecutionSizesAsset(
		{ 'build/chunk-app.js': sizeChunk('build/chunk-app.js', [`\0${APP_SYMBOL_ID}`]) },
		sizeMetadata(),
		stripBuild,
		undefined,
		{
			executionLogActive: true,
			hookedIds: new Map([
				['web:never-bundled', '/workspace/packages/web/src/never-bundled.ts'],
			]),
		},
	);
	const payload = JSON.parse(String(asset.source)) as {
		unshipped?: Record<string, string>;
	};

	expect(payload.unshipped).toEqual({ 'web:never-bundled': UNSHIPPED_HOOK_REASON });
	expect(UNSHIPPED_HOOK_REASON).toContain('can never execute in a browser');
});

test('execution sizes fail the build when a hooked module ships but its log id joins nothing', async () => {
	await expect(
		createExecutionSizesAsset(
			{
				'build/chunk-app.js': sizeChunk('build/chunk-app.js', [
					'/workspace/packages/mystery/src/thing.ts',
				]),
			},
			sizeMetadata(),
			stripBuild,
			undefined,
			{
				executionLogActive: true,
				// The bundle carries the hooked module, but this build's log-id
				// derivation names it something the map cannot join: a real hole.
				hookedIds: new Map([
					['unjoinable:thing', '/workspace/packages/mystery/src/thing.ts'],
				]),
			},
		),
	).rejects.toThrow('unjoinable:thing');
});

test('execution sizes stay unenforced when the execution log is off', async () => {
	const asset = await createExecutionSizesAsset(
		{
			'build/chunk-app.js': sizeChunk('build/chunk-app.js', [
				'/workspace/packages/web/src/resume-events.ts',
			]),
		},
		sizeMetadata({ fileName: 'chunk-vanished.js' }),
		stripBuild,
	);

	// The chunk answers to its own emitted specifier as well as to the module ids
	// it carries; what "unenforced" means is that the vanished symbol is absent.
	expect(Object.keys(JSON.parse(String(asset.source)))).toEqual([
		'./chunk-app.js',
		'web:resume-events',
	]);
});

test('every dispatchModuleId literal packages/web can emit is declared to the bundler', async () => {
	const { readFileSync, readdirSync } = await import('node:fs');
	const { resolve } = await import('pathe');
	const webSrc = resolve(import.meta.dirname, '../../web/src');
	const literals = new Set<string>();
	for (const entry of readdirSync(webSrc, { recursive: true, encoding: 'utf8' })) {
		if (!entry.endsWith('.ts')) continue;
		const source = readFileSync(resolve(webSrc, entry), 'utf8');
		for (const match of source.matchAll(/dispatchModuleId\s*[:=]\s*'([^']+)'/g))
			literals.add(match[1]!);
	}

	expect([...literals].sort()).toEqual([...EXECUTION_LOG_DISPATCH_MODULE_IDS].sort());
});

test('every declared dispatch module id names a real framework source file', async () => {
	const { existsSync } = await import('node:fs');
	const { resolve } = await import('pathe');
	const missing = EXECUTION_LOG_DISPATCH_MODULE_IDS.filter((id) => {
		const [namespace, ...rest] = id.split(':');
		return !existsSync(
			resolve(import.meta.dirname, `../../${namespace}/src/${rest.join(':')}.ts`),
		);
	});

	expect(missing).toEqual([]);
});

test('a dispatch id joins the emitted map and the runtime total is never nullable', async () => {
	const asset = await createExecutionSizesAsset(
		{
			'build/chunk-resume.js': sizeChunk('build/chunk-resume.js', [
				'/workspace/packages/web/src/resume-events.ts',
			]),
			'build/chunk-app.js': sizeChunk('build/chunk-app.js', [`\0${APP_SYMBOL_ID}`]),
			'build/chunk-log.js': sizeChunk('build/chunk-log.js', [
				`\0${MARKLESS_EXECUTION_LOG_MODULE_ID}`,
			]),
		},
		sizeMetadata(),
		stripBuild,
		undefined,
		{ executionLogActive: true },
	);
	const sizes = JSON.parse(String(asset.source)) as Record<string, { gzip: number; raw: number }>;
	expect(sizes['web:resume-events']!.gzip).toBeGreaterThan(0);
	expect(sizes[APP_SYMBOL_ID]!.gzip).toBeGreaterThan(0);
	expect(sizes[MARKLESS_EXECUTION_LOG_MODULE_ID]!.gzip).toBeGreaterThan(0);

	const attributes = stubExecutionLogDom();
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok: true, json: async () => sizes })),
	);
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ sizesUrl: '/execution-sizes.json' }),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'li',
		eventRecord: { hostNodeId: 'h1', symbolIds: [APP_SYMBOL_ID] },
		dispatchModuleId: EXECUTION_LOG_DISPATCH_MODULE_IDS[1],
		before: new Set<string>(),
		view: { behaviors: [{ hostNodeId: 'h1' }] },
	});

	// The dispatch id is framework, the symbol is the page's own code, and the
	// turn's arithmetic is the sum of the two — in raw chunk bytes, the unit the
	// map actually holds.
	expect(attributes.get('data-markless-log-last')).not.toContain('unmapped');
	expect(attributes.has('data-markless-log-incomplete')).toBe(false);
	expect(Number(attributes.get('data-markless-log-app-bytes'))).toBe(sizes[APP_SYMBOL_ID]!.raw);
	expect(Number(attributes.get('data-markless-log-framework-bytes'))).toBe(
		sizes['web:resume-events']!.raw,
	);
	expect(Number(attributes.get('data-markless-log-turn-bytes'))).toBe(
		sizes['web:resume-events']!.raw + sizes[APP_SYMBOL_ID]!.raw,
	);
});

test('one chunk reached under two names is charged once', async () => {
	const attributes = stubExecutionLogDom('pages/index.tsrx');
	const symbolId = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Player.tsrx')}:${encodeURIComponent('symbol:3')}`;
	// Rolldown rewrites a symbol module's own hook literal to the specifier it
	// emits, so the same chunk arrives once as `./chunk-play.js` (what executed)
	// and once as the symbol id (what the event record names).
	const shared = { raw: 512, gzip: 200, chunk: 'chunk-play.js' };
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({
				'./chunk-play.js': shared,
				[symbolId]: shared,
				'web:resume-events': { raw: 4000, gzip: 1500, chunk: 'chunk-events.js' },
				'virtual:markless:dev-log': { raw: 900, gzip: 400, chunk: 'chunk-log.js', instrument: true },
				attribution: {
					'pages/index.tsrx': { 'c2:': encodeURIComponent('/workspace/src/Player.tsrx') },
				},
			}),
		})),
	);
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ sizesUrl: '/execution-sizes.json' }),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'button',
		eventRecord: { hostNodeId: 'c2:h9', symbolIds: ['symbol:3'] },
		before: new Set<string>(),
		after: new Set(['./chunk-play.js']),
	});

	expect(attributes.has('data-markless-log-incomplete')).toBe(false);
	// 512, not 1024: the accounting unit is the chunk.
	expect(Number(attributes.get('data-markless-log-app-bytes'))).toBe(512);
	const charged = attributes.get('data-markless-log-turn-modules')!.split(' ');
	expect(charged).toContain('./chunk-play.js');
	expect(charged).not.toContain(symbolId);
});

test('a prop-passed handler joins through the owning ancestor scope', async () => {
	const attributes = stubExecutionLogDom('pages/index.tsrx');
	const source = (name: string) => encodeURIComponent(`/workspace/src/${name}.tsrx`);
	const appSymbol = `virtual:markless:symbol:${source('App')}:${encodeURIComponent('symbol:2')}`;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({
				[appSymbol]: { raw: 400, gzip: 150, chunk: 'chunk-app-2.js' },
				// Nav ships symbols of its own, but not symbol:2: the toggle handler
				// is App's closure passed down as a prop and rendered at Nav's scope.
				[`virtual:markless:symbol:${source('Nav')}:${encodeURIComponent('symbol:0')}`]: {
					raw: 100,
					gzip: 50,
					chunk: 'chunk-nav-0.js',
				},
				'virtual:markless:dev-log': { raw: 900, gzip: 400, chunk: 'chunk-log.js', instrument: true },
				attribution: {
					'pages/index.tsrx': { '': source('App'), 'c0:': source('Nav') },
				},
			}),
		})),
	);
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ sizesUrl: '/execution-sizes.json' }),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'button',
		eventRecord: { hostNodeId: 'c0:h2', symbolIds: ['symbol:2'] },
		before: new Set<string>(),
	});

	expect(attributes.has('data-markless-log-incomplete')).toBe(false);
	expect(Number(attributes.get('data-markless-log-app-bytes'))).toBe(400);
	expect(attributes.get('data-markless-log-turn-modules')!.split(' ')).toContain(appSymbol);
});

test('a routeless document reads the single-root attribution table', async () => {
	const attributes = stubExecutionLogDom();
	const symbolId = `virtual:markless:symbol:${encodeURIComponent('/workspace/src/Player.tsrx')}:${encodeURIComponent('symbol:3')}`;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({
				[symbolId]: { raw: 244, gzip: 90, chunk: 'chunk-play.js' },
				'virtual:markless:dev-log': { raw: 900, gzip: 400, chunk: 'chunk-log.js', instrument: true },
				attribution: {
					// A CSR page names no route file; one root is the only page there is.
					'src/App.tsrx': { 'c2:': encodeURIComponent('/workspace/src/Player.tsrx') },
				},
			}),
		})),
	);
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
	vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ sizesUrl: '/execution-sizes.json' }),
	);
	await mod.logMarklessInteraction({
		eventName: 'click',
		selector: 'span',
		eventRecord: { hostNodeId: 'c2:h9', symbolIds: ['symbol:3'] },
		before: new Set<string>(),
	});

	expect(attributes.has('data-markless-log-incomplete')).toBe(false);
	expect(Number(attributes.get('data-markless-log-app-bytes'))).toBe(244);
});

test('the resume summary publishes into the ledger without printing a line', async () => {
	const attributes = stubExecutionLogDom('pages/index.tsrx');
	(globalThis as ExecutionLogGlobal).__mxLog = new Set();
	const logged: string[] = [];
	vi.spyOn(console, 'log').mockImplementation((line: unknown) => logged.push(String(line)));
	const mod = await importExecutionLogModule(
		executionLogVirtualModuleSource({ moduleSizes: new Map([['web:fns/csr', 2048]]) }),
	);

	await mod.installMarklessExecutionLog();

	// The ledger's turn line is the only printed line; this summary mirrors and
	// publishes, so a resume landing beside a render cannot print the same load
	// figure twice.
	expect(logged).toEqual([]);
	expect(attributes.get('data-markless-log-summary')).toContain('executed at load');
	expect(Number(attributes.get('data-markless-log-instrument-bytes'))).toBeGreaterThan(0);
	const ledger = (globalThis as ExecutionLogGlobal).__marklessExecutionLedger as {
		turns: ReadonlyArray<{ kind: string }>;
	};
	expect(ledger.turns.map((turn) => turn.kind)).toEqual(['resume']);
});
