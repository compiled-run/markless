import { expect, test } from 'vitest';
import { emitSymbolResolverModule } from '../src/passes/symbol-resolver-module.ts';

test('emitSymbolResolverModule emits dynamic imports owned by the generated resolver', () => {
	const output = emitSymbolResolverModule({
		symbols: [
			{
				id: 'symbol:key',
				chunk: '/assets/menu.handlers.ab12.js',
				exportName: 'onKeyDown_symbol_key',
			},
			{
				id: 'symbol:domUpdate',
				chunk: '/assets/menu.domUpdates.cd34.js',
				exportName: 'textDomUpdate_symbol_domUpdate',
			},
		],
	});

	expect(output).toContain('export async function loadSymbol(id)');
	expect(output).toContain('case "symbol:key":');
	expect(output).toContain('return import("/assets/menu.handlers.ab12.js")');
	expect(output).toContain('.then((mod) => mod.onKeyDown_symbol_key);');
	expect(output).toContain('case "symbol:domUpdate":');
	expect(output).toContain('return import("/assets/menu.domUpdates.cd34.js")');
	expect(output).toContain('throw createUnknownSymbolError(id);');
	expect(output).toContain('code: "ARCADE_SYMBOL_UNKNOWN"');
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
		],
	});
	const generatedModule = (await import(
		`data:text/javascript,${encodeURIComponent(output)}`
	)) as {
		symbolManifest: unknown;
	};

	expect(generatedModule.symbolManifest).toEqual({
		protocolVersion: 1,
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
		],
	});
});
