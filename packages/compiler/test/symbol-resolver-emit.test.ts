import { expect, test } from 'vitest';
import { emitSymbolResolverModule } from '../src/passes/symbol-resolver-module.ts';

test('emitSymbolResolverModule emits compact table rows with a constant loader', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		[
			'export const onKeyDown_symbol_key = () => "loaded";',
			'export const textDomUpdate_symbol_domUpdate = "dom-update";',
			'export const behavior_symbol_menu = "behavior";',
			'export const asyncRunner_symbol_details = "runner";',
		].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:key',
				chunk: moduleUrl,
				exportName: 'onKeyDown_symbol_key',
			},
			{
				id: 'symbol:domUpdate',
				chunk: moduleUrl,
				exportName: 'textDomUpdate_symbol_domUpdate',
			},
			{
				id: 'symbol:behavior',
				chunk: moduleUrl,
				exportName: 'behavior_symbol_menu',
			},
			{
				id: 'symbol:runner',
				chunk: moduleUrl,
				exportName: 'asyncRunner_symbol_details',
			},
		],
	});

	expect(output).toContain('export async function loadSymbol(id)');
	expect(output).toContain('const moduleUrls = symbolManifest[3];');
	expect(output).toContain('const exportNames = symbolManifest[4];');
	expect(output).toContain('const symbolRows = symbolManifest[5];');
	expect(output).toContain('import(/* @vite-ignore */ moduleUrls[row[0]])');
	expect(output).not.toContain('switch (id)');
	expect(output).not.toContain('case "symbol:key":');
	expect(output).not.toContain('case "symbol:domUpdate":');
	expect(output).toContain('throw createUnknownSymbolError(id);');
	expect(output).toContain('code: "ARCADE_SYMBOL_UNKNOWN"');

	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:key');
	expect((loaded as () => string)()).toBe('loaded');
	await expect(generatedModule.loadSymbol('symbol:domUpdate')).resolves.toBe('dom-update');
});

test('emitSymbolResolverModule emits direct imports for small symbol tables', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		['export const symbol_0 = () => "clicked";', 'export const symbol_1 = "text";'].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:0',
				chunk: moduleUrl,
				exportName: 'symbol_0',
			},
			{
				id: 'symbol:1',
				chunk: moduleUrl,
				exportName: 'symbol_1',
			},
		],
	});

	expect(output).toContain('if (id === "symbol:0")');
	expect(output).toContain('return mod.symbol_0;');
	expect(output).toContain('if (id === "symbol:1")');
	expect(output).not.toContain('export const symbolManifest');
	expect(output).not.toContain('const moduleUrls = symbolManifest[3];');
	expect(output).not.toContain('runGeneratedSymbolChunkInitializers');

	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:0');
	expect((loaded as () => string)()).toBe('clicked');
	await expect(generatedModule.loadSymbol('symbol:1')).resolves.toBe('text');
	await expect(generatedModule.loadSymbol('symbol:missing')).rejects.toThrow(
		'Unknown async symbol symbol:missing',
	);
});

test('emitSymbolResolverModule runs generated init exports for small symbol tables', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		[
			'let initialized = false;',
			'export function init__virtual_arcade_symbol() { initialized = true; }',
			'export function symbol_0() { return initialized ? "ready" : "cold"; }',
		].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:0',
				chunk: moduleUrl,
				exportName: 'symbol_0',
			},
		],
	});

	expect(output).toContain('mod.init__virtual_arcade_symbol?.();');

	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:0');
	expect((loaded as () => string)()).toBe('ready');
});

test('emitSymbolResolverModule runs generated symbol chunk init exports before returning a symbol', async () => {
	const moduleUrl = `data:text/javascript,${encodeURIComponent(
		[
			'let initialized = false;',
			'export function init__virtual_arcade_symbol__root() { initialized = true; }',
			'export function symbol_0() { return initialized ? "ready" : "cold"; }',
			'export function symbol_1() { return "one"; }',
			'export function symbol_2() { return "two"; }',
			'export function symbol_3() { return "three"; }',
		].join('\n'),
	)}`;
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:0',
				chunk: moduleUrl,
				exportName: 'symbol_0',
			},
			{
				id: 'symbol:1',
				chunk: moduleUrl,
				exportName: 'symbol_1',
			},
			{
				id: 'symbol:2',
				chunk: moduleUrl,
				exportName: 'symbol_2',
			},
			{
				id: 'symbol:3',
				chunk: moduleUrl,
				exportName: 'symbol_3',
			},
		],
	});
	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	const loaded = await generatedModule.loadSymbol('symbol:0');
	expect((loaded as () => string)()).toBe('ready');
});

test('emitSymbolResolverModule fails closed for unknown symbols with structured metadata', async () => {
	const output = emitSymbolResolverModule({
		symbols: [],
	});
	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		loadSymbol(id: string): Promise<unknown>;
	};

	await expect(generatedModule.loadSymbol('symbol:missing')).rejects.toMatchObject({
		code: 'ARCADE_SYMBOL_UNKNOWN',
		phase: 'resume',
		symbolId: 'symbol:missing',
		docsUrl: 'https://arcadejs.com/errors/ARCADE_SYMBOL_UNKNOWN',
	});
	await expect(generatedModule.loadSymbol('symbol:missing')).rejects.toThrow(
		'Unknown async symbol symbol:missing',
	);
});

test('emitSymbolResolverModule exports the symbol manifest with protocol and build identity', async () => {
	const output = emitSymbolResolverModule({
		buildId: 'build:abc123',
		resolverId: 'resolver:/src/App.tsrx',
		symbols: [
			{
				id: 'symbol:key',
				chunk: '/assets/menu.handlers.ab12.js',
				exportName: 'onKeyDown_symbol_key',
			},
			{
				id: 'symbol:private-export',
				chunk: '/assets/private.cd34.js',
				exportName: 'menu dom update',
			},
			{
				id: 'symbol:behavior',
				chunk: '/assets/behavior.ef56.js',
				exportName: 'behaviorSymbol',
			},
			{
				id: 'symbol:runner',
				chunk: '/assets/runner.gh78.js',
				exportName: 'runnerSymbol',
			},
		],
	});
	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		symbolManifest: unknown;
	};

	expect(generatedModule.symbolManifest).toEqual([
		1,
		'build:abc123',
		'resolver:/src/App.tsrx',
		[
			'/assets/menu.handlers.ab12.js',
			'/assets/private.cd34.js',
			'/assets/behavior.ef56.js',
			'/assets/runner.gh78.js',
		],
		['onKeyDown_symbol_key', 'menu dom update', 'behaviorSymbol', 'runnerSymbol'],
		{
			'symbol:key': [0, 0],
			'symbol:private-export': [1, 1],
			'symbol:behavior': [2, 2],
			'symbol:runner': [3, 3],
		},
	]);
});
