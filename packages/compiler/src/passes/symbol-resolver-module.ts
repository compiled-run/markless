import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import type { SymbolResolverModuleInput, SymbolResolverModuleManifest } from '../artifacts.ts';

const SMALL_SYMBOL_SWITCH_LIMIT = 3;

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
	if ((input.boundSymbols?.length ?? 0) === 0) {
		return input.symbols.length > 0 && input.symbols.length <= SMALL_SYMBOL_SWITCH_LIMIT
			? emitSmallSymbolResolverModule(input)
			: emitTableSymbolResolverModule(manifest);
	}
	return [
		'export const symbolManifest = ',
		JSON.stringify(manifest),
		';',
		'',
		'const moduleUrls = symbolManifest[3];',
		'const exportNames = symbolManifest[4];',
		'const symbolRows = symbolManifest[5];',
		`const boundRows = ${JSON.stringify(Object.fromEntries((input.boundSymbols ?? []).map((row) => [row.id, row])))};`,
		'',
		'export async function loadSymbol(id) {',
		'	const bound = boundRows[id];',
		'	if (bound) return loadBoundSymbol(bound);',
		'	const row = symbolRows[id];',
		'	if (!row) throw createUnknownSymbolError(id);',
		'	return import(/* @vite-ignore */ moduleUrls[row[0]])',
		'		.then((mod) => {',
		'			runGeneratedSymbolChunkInitializers(mod);',
		'			return mod[exportNames[row[1]]];',
		'		});',
		'}',
		'',
		'async function loadBoundSymbol(bound) {',
		'	const base = await loadSymbol(bound.baseSymbolId);',
		'	return (context) => base({ ...context, capture: createCaptureContext(context, bound) });',
		'}',
		'',
		'function createCaptureContext(context, bound) {',
		'	const slots = Object.fromEntries(bound.captureSlots.map((slot) => [slot.slotId, slot]));',
		'	return {',
		'		read(slotId) {',
		'			const slot = requiredCaptureSlot(slots, slotId);',
		'			const route = slot.route;',
		'			if (route.kind === "compiler-known-constant") return slot.path.reduce((value, key) => value == null ? value : value[key], route.value);',
		'			if (route.kind === "graph-reference") return context.graph.read(route.graphNodeId, route.path);',
		'			throw new Error(`Capture slot ${slotId} is a callback route`);',
		'		},',
		'		invoke(slotId, args) {',
		'			const route = requiredCaptureSlot(slots, slotId).route;',
		'			if (route.kind !== "callback-route") throw new Error(`Capture slot ${slotId} is not a callback route`);',
		'			if (typeof context.invokeSymbol !== "function") throw new Error("Bound callback invocation is unavailable");',
		'			return context.invokeSymbol(route.callbackSymbolId, { ...context, event: context.event, args });',
		'		},',
		'	};',
		'}',
		'',
		'function requiredCaptureSlot(slots, slotId) {',
		'	const slot = slots[slotId];',
		'	if (!slot) throw new Error(`Unknown capture slot ${slotId}`);',
		'	return slot;',
		'}',
		'',
		'function runGeneratedSymbolChunkInitializers(mod) {',
		'	for (const name in mod) {',
		'		if (!name.startsWith("init__virtual_markless_symbol")) continue;',
		'		const init = mod[name];',
		'		if (typeof init === "function") init();',
		'	}',
		'}',
		'',
		'function createUnknownSymbolError(id) {',
		'	return Object.assign(new Error(`Unknown async symbol ${id}`), {',
		'		code: "MARKLESS_SYMBOL_UNKNOWN",',
		'		phase: "resume",',
		'		symbolId: String(id),',
		'		docsUrl: "https://markless.dev/errors/MARKLESS_SYMBOL_UNKNOWN",',
		'	});',
		'}',
		'',
	].join('\n');
}

function emitTableSymbolResolverModule(manifest: SymbolResolverModuleManifest): string {
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
		'\tconst row = symbolRows[id];',
		'\tif (!row) throw createUnknownSymbolError(id);',
		'\treturn import(/* @vite-ignore */ moduleUrls[row[0]])',
		'\t\t.then((mod) => {',
		'\t\t\trunGeneratedSymbolChunkInitializers(mod);',
		'\t\t\treturn mod[exportNames[row[1]]];',
		'\t\t});',
		'}',
		'',
		'function runGeneratedSymbolChunkInitializers(mod) {',
		'\tfor (const name in mod) {',
		'\t\tif (!name.startsWith("init__virtual_markless_symbol")) continue;',
		'\t\tconst init = mod[name];',
		'\t\tif (typeof init === "function") init();',
		'\t}',
		'}',
		'',
		'function createUnknownSymbolError(id) {',
		'\treturn Object.assign(new Error(`Unknown async symbol ${id}`), {',
		'\t\tcode: "MARKLESS_SYMBOL_UNKNOWN",',
		'\t\tphase: "resume",',
		'\t\tsymbolId: String(id),',
		'\t\tdocsUrl: "https://markless.dev/errors/MARKLESS_SYMBOL_UNKNOWN",',
		'\t});',
		'}',
		'',
	].join('\n');
}

function emitSmallSymbolResolverModule(input: SymbolResolverModuleInput): string {
	const symbolBranches = input.symbols.flatMap((symbol) => [
		`	if (id === ${JSON.stringify(symbol.id)}) return import(/* @vite-ignore */ ${JSON.stringify(symbol.chunk)})`,
		`		.then((mod) => { mod.init__virtual_markless_symbol?.(); return mod${moduleExportAccess(symbol.exportName)}; });`,
	]);

	return [
		'export async function loadSymbol(id) {',
		...symbolBranches,
		'	throw new Error(`Unknown async symbol ${id}`);',
		'}',
		'',
	].join('\n');
}

function moduleExportAccess(exportName: string): string {
	return /^[$A-Z_a-z][$\w]*$/.test(exportName)
		? `.${exportName}`
		: `[${JSON.stringify(exportName)}]`;
}

function tableIndex(indexes: Map<string, number>, values: string[], value: string): number {
	const existing = indexes.get(value);
	if (existing !== undefined) return existing;

	const index = values.length;
	indexes.set(value, index);
	values.push(value);
	return index;
}
