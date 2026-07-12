import { afterEach, expect, test, vi } from 'vitest';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	createExecutionSizesAsset,
	executionLogVirtualModuleSource,
	injectExecutionLogModuleHook,
	requalifyExecutionLogModuleHook,
} from '../src/execution-log.ts';

type ExecutionLogGlobal = typeof globalThis & {
	__mxLog?: Set<string>;
	__mxLogInteraction?: (event: unknown) => void;
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	delete (globalThis as ExecutionLogGlobal).__mxLog;
	delete (globalThis as ExecutionLogGlobal).__mxLogInteraction;
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
	);
	const sizes = JSON.parse(String(asset.source)) as Record<
		string,
		{ raw: number; gzip: number; chunk: string }
	>;

	expect(asset.fileName).toBe('build/execution-sizes.json');
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
		logMarklessRenderSummary: (input?: unknown) => Promise<void>;
	};
}

function stubExecutionLogDom() {
	const attributes = new Map<string, string>();
	vi.stubGlobal('document', {
		documentElement: {
			getAttribute: (name: string) => attributes.get(name) ?? null,
			setAttribute: (name: string, value: string) => attributes.set(name, value),
			removeAttribute: (name: string) => attributes.delete(name),
		},
		querySelectorAll: () => [],
	});
	return attributes;
}

test('rendered summary sizes every executed id the module hook can inject', async () => {
	stubExecutionLogDom();
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
	expect(logged[0]).toMatch(
		/^markless: rendered — 0 app modules executed \(0\.0 KB app\) · 1 instrument module executed \(\d+\.\d KB est\.\)$/,
	);
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
	// Both must join the same size entry (counted once) instead of 0.0 KB.
	expect(headers[0]).toContain('woke 1 modules');
	expect(headers[0]).toMatch(/· 1\.0 KB est\. app · 0\.0 KB instrument$/);
	expect(rows.some((row) => row.startsWith('woke symbol:0 (App.tsrx) (1.0 KB est.)'))).toBe(true);
	expect(rows.some((row) => row.startsWith('ran warm symbol:0 (App.tsrx) (1.0 KB est.)'))).toBe(
		true,
	);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('1024');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('0');
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
	(globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>(),
	});

	expect(headers[0]).toMatch(/· 0\.0 KB app · 0\.5 KB instrument$/);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('0');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('512');
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
	(globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>(),
	});

	expect(headers[0]).toMatch(/· 1\.0 KB app · 0\.5 KB instrument$/);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('1024');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('512');
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
	(globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>([MARKLESS_EXECUTION_LOG_MODULE_ID]),
	});

	expect(headers[0]).toMatch(/· 0\.8 KB app · 0\.0 KB instrument$/);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('768');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('0');
});

test('generated logger uses emitted gzip bytes for both accounting partitions', async () => {
	const attributes = stubExecutionLogDom();
	(globalThis as ExecutionLogGlobal).__mxLog = new Set(['app:emitted']);
	vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
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
	(globalThis as ExecutionLogGlobal).__mxLogInteraction!({
		eventName: 'click',
		selector: 'button',
		before: new Set<string>(),
	});

	expect(attributes.get('data-markless-log-app-bytes')).toBe('900');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('700');
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
		'markless: click [button.play] — no event record matched · 0.0 KB app · 0.0 KB instrument',
	]);
	expect(attributes.get('data-markless-log-last')).toBe(lines[0]);
	expect(attributes.get('data-markless-log-app-bytes')).toBe('0');
	expect(attributes.get('data-markless-log-instrument-bytes')).toBe('0');
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
	expect(attributes.has('data-markless-log-app-bytes')).toBe(false);
	expect(attributes.has('data-markless-log-instrument-bytes')).toBe(false);
});
