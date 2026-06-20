import { ASYNC_PROTOCOL_VERSION } from '@arcadejs/protocol';
import type { SymbolResolverModuleInput, SymbolResolverModuleManifest } from '../artifacts.ts';

export function createSymbolResolverModuleManifest(
	input: SymbolResolverModuleInput,
): SymbolResolverModuleManifest {
	const moduleUrls: string[] = [];
	const exportNames: string[] = [];
	const moduleIndexes = new Map<string, number>();
	const exportIndexes = new Map<string, number>();
	const symbols: Record<string, readonly [moduleIndex: number, exportIndex: number]> = {};

	for (const symbol of input.symbols) {
		const moduleIndex = tableIndex(moduleIndexes, moduleUrls, symbol.chunk);
		const exportIndex = tableIndex(exportIndexes, exportNames, symbol.exportName);
		symbols[symbol.id] = [moduleIndex, exportIndex];
	}

	return [
		ASYNC_PROTOCOL_VERSION,
		input.buildId ?? null,
		input.resolverId ?? null,
		moduleUrls,
		exportNames,
		symbols,
	];
}

export function emitSymbolResolverModule(input: SymbolResolverModuleInput): string {
	const manifest = createSymbolResolverModuleManifest(input);

	return [
		'export const symbolManifest = ',
		JSON.stringify(manifest),
		';',
		'',
		'const moduleUrls = symbolManifest[3];',
		'const exportNames = symbolManifest[4];',
		'const symbolRows = symbolManifest[5];',
		'',
		'export async function loadSymbol(id) {',
		'	const row = symbolRows[id];',
		'	if (!row) throw createUnknownSymbolError(id);',
		'	return import(/* @vite-ignore */ moduleUrls[row[0]])',
		'		.then((mod) => {',
		'			runGeneratedSymbolChunkInitializers(mod);',
		'			return mod[exportNames[row[1]]];',
		'		});',
		'}',
		'',
		'function runGeneratedSymbolChunkInitializers(mod) {',
		'	for (const name in mod) {',
		'		if (!name.startsWith("init__virtual_arcade_symbol")) continue;',
		'		const init = mod[name];',
		'		if (typeof init === "function") init();',
		'	}',
		'}',
		'',
		'function createUnknownSymbolError(id) {',
		'	return Object.assign(new Error(`Unknown async symbol ${id}`), {',
		'		code: "ARCADE_SYMBOL_UNKNOWN",',
		'		phase: "resume",',
		'		symbolId: String(id),',
		'		docsUrl: "https://arcadejs.com/errors/ARCADE_SYMBOL_UNKNOWN",',
		'	});',
		'}',
		'',
	].join('\n');
}

function tableIndex(indexes: Map<string, number>, values: string[], value: string): number {
	const existing = indexes.get(value);
	if (existing !== undefined) return existing;

	const index = values.length;
	indexes.set(value, index);
	values.push(value);
	return index;
}
