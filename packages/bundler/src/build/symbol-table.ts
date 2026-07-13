import { dirname, join, normalize, relative } from 'pathe';
import { MARKLESS_VIRTUAL_PREFIX } from '../transform.ts';
import type { MarklessSymbolManifestEntry, MarklessTransformManifest } from '../types.ts';

type GeneratedChunk = {
	readonly type: 'chunk';
	readonly fileName: string;
	code: string;
	readonly moduleIds: readonly string[];
	readonly facadeModuleId?: string | null;
	readonly exports?: readonly string[];
	readonly imports?: readonly string[];
	readonly dynamicImports?: readonly string[];
};

export type SymbolTableUrlRewriteResult = {
	readonly rewritten: number;
	readonly unresolved: readonly string[];
};

export type SymbolTableIntegrityError = {
	readonly symbolId: string;
	readonly claimedChunk: string;
	readonly reason: string;
};

export type SymbolTableIntegrityResult = {
	readonly verified: number;
	readonly errors: readonly SymbolTableIntegrityError[];
};

const SYMBOL_VIRTUAL_PREFIX = `${MARKLESS_VIRTUAL_PREFIX}symbol:`;
// OXC packs sufficiently long string arrays as "a,b,c".split(","). Recover
// that emitted representation before resolving each compiler-owned URL.
const PACKED_SYMBOL_VIRTUAL_LIST_RE =
	/(["'`])((?:virtual:markless:symbol:)[^"'`]+)\1\.split\(\s*(["'`]),\3\s*\)/g;
const SYMBOL_VIRTUAL_STRING_RE = /(["'`])((?:virtual:markless:symbol:)[^"'`]+)\1/g;
const STRING_LIST_SOURCE = String.raw`(?:\[[^\]]*\]|["'\x60][^"'\x60]*["'\x60]\.split\(\s*["'\x60][^"'\x60]*["'\x60]\s*\))`;
const SYMBOL_MANIFEST_TUPLE_RE = new RegExp(
	String.raw`(\[1,(?:null|["'\x60][^"'\x60]*["'\x60]),(?:null|["'\x60][^"'\x60]*["'\x60]),)(${STRING_LIST_SOURCE}),(${STRING_LIST_SOURCE}),(\{[^}]*\})(\])`,
	'g',
);
const STRING_LITERAL_RE = /(["'`])([^"'`]*)\1/g;
const SYMBOL_ROW_RE = /((?:["'`][^"'`]*["'`])\s*:\s*\[)(\d+)(,\s*\d+\])/g;
const SYMBOL_ROW_CAPTURE_RE = /(["'`])([^"'`]*)\1\s*:\s*\[(\d+),\s*(\d+)\]/g;

export function rewriteGeneratedSymbolTableUrls(
	bundle: Record<string, unknown>,
): SymbolTableUrlRewriteResult {
	const chunks = collectChunks(bundle);
	const symbolFiles = collectGeneratedSymbolFiles(chunks);
	let rewritten = 0;
	const unresolved = new Set<string>();

	for (const chunk of chunks.values()) {
		if (!chunk.code.includes(SYMBOL_VIRTUAL_PREFIX)) continue;
		const result = rewriteSymbolVirtualStrings(chunk, symbolFiles);
		chunk.code = result.code;
		rewritten += result.rewritten;
		for (const id of result.unresolved) unresolved.add(id);
	}

	return { rewritten, unresolved: [...unresolved].sort() };
}

/**
 * Checks emitted resolver routes against compiler manifests and Rolldown's
 * chunk ownership/export metadata. Table source is read only to recover each
 * claimed file; termination evidence stays structural.
 */
export function verifyGeneratedSymbolTableRoutes(
	bundle: Record<string, unknown>,
	manifests: Iterable<MarklessTransformManifest>,
): SymbolTableIntegrityResult {
	const chunks = collectChunks(bundle);
	const errors: SymbolTableIntegrityError[] = [];
	let verified = 0;

	for (const manifest of manifests) {
		if (manifest.symbols.length === 0) continue;
		const resolverChunk = findChunkForVirtualId(chunks, manifest.resolver.virtualModuleId);
		const routeChunk = resolverChunk ?? findChunkForVirtualId(chunks, manifest.source);
		if (!routeChunk) {
			for (const symbol of manifest.symbols) {
				errors.push({
					symbolId: symbol.symbolId,
					claimedChunk: '<missing route chunk>',
					reason: `neither compiler resolver ${manifest.resolver.virtualModuleId} nor source ${manifest.source} was emitted`,
				});
			}
			continue;
		}

		const table = resolverChunk
			? findSymbolTable(routeChunk.code, manifest.symbols)
			: undefined;
		for (const symbol of manifest.symbols) {
			if (!table) {
				const directRoute = verifyDirectRoute(chunks, routeChunk, symbol);
				if (directRoute.reason) {
					errors.push({
						symbolId: symbol.symbolId,
						claimedChunk: directRoute.claimedChunk,
						reason: directRoute.reason,
					});
				} else {
					verified++;
				}
				continue;
			}

			const specifier = tableRouteSpecifier(table, symbol, routeChunk.fileName, errors);
			if (!specifier) {
				continue;
			}

			const claimedChunk = resolveChunkSpecifier(routeChunk.fileName, specifier);
			const reason = routeTerminationError(chunks, claimedChunk, symbol);
			if (reason) {
				errors.push({ symbolId: symbol.symbolId, claimedChunk, reason });
			} else {
				verified++;
			}
		}
	}

	return { verified, errors };
}

function collectChunks(bundle: Record<string, unknown>): Map<string, GeneratedChunk> {
	const chunks = new Map<string, GeneratedChunk>();
	for (const output of Object.values(bundle)) {
		if (isGeneratedChunk(output)) chunks.set(output.fileName, output);
	}
	return chunks;
}

function collectGeneratedSymbolFiles(
	chunks: ReadonlyMap<string, GeneratedChunk>,
): Map<string, string> {
	const symbolFiles = new Map<string, string>();
	for (const chunk of chunks.values()) {
		for (const id of virtualIds(chunk)) {
			if (id.startsWith(SYMBOL_VIRTUAL_PREFIX)) {
				symbolFiles.set(id, chunk.fileName);
			}
		}
	}
	return symbolFiles;
}

type ParsedSymbolTable = {
	readonly moduleUrls: readonly string[];
	readonly exportNames: readonly string[];
	readonly rows: ReadonlyMap<string, readonly [moduleIndex: number, exportIndex: number]>;
};

function findSymbolTable(
	code: string,
	symbols: readonly MarklessSymbolManifestEntry[],
): ParsedSymbolTable | undefined {
	let bestMatch: ParsedSymbolTable | undefined;
	let bestScore = -1;
	for (const match of code.matchAll(SYMBOL_MANIFEST_TUPLE_RE)) {
		const moduleUrls = parseStringList(match[2]!);
		const exportNames = parseStringList(match[3]!);
		if (!moduleUrls || !exportNames) continue;

		const rows = new Map<string, readonly [number, number]>();
		for (const row of match[4]!.matchAll(SYMBOL_ROW_CAPTURE_RE)) {
			rows.set(row[2]!, [Number(row[3]), Number(row[4])]);
		}
		if (rows.size === 0) continue;
		const score = symbols.filter((symbol) => exportNames.includes(symbol.exportName)).length;
		if (score > bestScore) {
			bestMatch = { moduleUrls, exportNames, rows };
			bestScore = score;
		}
	}
	return bestMatch;
}

function tableRouteSpecifier(
	table: ParsedSymbolTable,
	symbol: MarklessSymbolManifestEntry,
	resolverFileName: string,
	errors: SymbolTableIntegrityError[],
): string | undefined {
	const row = table.rows.get(symbol.symbolId);
	if (!row) {
		errors.push({
			symbolId: symbol.symbolId,
			claimedChunk: resolverFileName,
			reason: 'emitted symbol table has no row for this compiler symbol',
		});
		return undefined;
	}

	const specifier = table.moduleUrls[row[0]];
	if (!specifier) {
		errors.push({
			symbolId: symbol.symbolId,
			claimedChunk: resolverFileName,
			reason: `emitted symbol table references missing module URL index ${row[0]}`,
		});
		return undefined;
	}
	const exportName = table.exportNames[row[1]];
	if (exportName !== symbol.exportName) {
		errors.push({
			symbolId: symbol.symbolId,
			claimedChunk: resolveChunkSpecifier(resolverFileName, specifier),
			reason: `emitted symbol table claims export ${exportName ?? `<missing index ${row[1]}>`} instead of ${symbol.exportName}`,
		});
		return undefined;
	}
	return specifier;
}

function verifyDirectRoute(
	chunks: ReadonlyMap<string, GeneratedChunk>,
	routeChunk: GeneratedChunk,
	symbol: MarklessSymbolManifestEntry,
): { readonly claimedChunk: string; readonly reason?: string } {
	const target = findChunkForVirtualId(chunks, symbol.virtualModuleId);
	if (!target) {
		return {
			claimedChunk: '<missing symbol chunk>',
			reason: `generated symbol module ${symbol.virtualModuleId} was not emitted`,
		};
	}
	if (!(target.exports ?? []).includes(symbol.exportName)) {
		return {
			claimedChunk: target.fileName,
			reason: `claimed chunk does not export ${symbol.exportName}`,
		};
	}
	if (!dynamicRouteReachesChunk(chunks, routeChunk, target.fileName)) {
		return {
			claimedChunk: target.fileName,
			reason: `source chunk ${routeChunk.fileName} has no emitted dynamic route to the claimed chunk`,
		};
	}
	return { claimedChunk: target.fileName };
}

function dynamicRouteReachesChunk(
	chunks: ReadonlyMap<string, GeneratedChunk>,
	start: GeneratedChunk,
	targetFileName: string,
): boolean {
	const pending = [start];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const chunk = pending.shift()!;
		if (chunk.fileName === targetFileName) return true;
		if (visited.has(chunk.fileName)) continue;
		visited.add(chunk.fileName);
		for (const importedFileName of chunk.dynamicImports ?? []) {
			const imported = chunks.get(importedFileName);
			if (imported) pending.push(imported);
		}
	}
	return false;
}

function routeTerminationError(
	chunks: ReadonlyMap<string, GeneratedChunk>,
	claimedChunk: string,
	symbol: MarklessSymbolManifestEntry,
): string | undefined {
	const target = chunks.get(claimedChunk);
	if (!target) return 'claimed chunk was not emitted';

	const symbolVirtualId = normalizeVirtualId(symbol.virtualModuleId);
	if (!chunkOrReexportChainContainsSymbol(chunks, target, symbolVirtualId, symbol.exportName)) {
		return `claimed chunk does not contain its generated symbol module ${symbol.virtualModuleId} or a live re-export chain to it`;
	}
	if (!(target.exports ?? []).includes(symbol.exportName)) {
		return `claimed chunk does not export ${symbol.exportName}`;
	}
	return undefined;
}

function chunkOrReexportChainContainsSymbol(
	chunks: ReadonlyMap<string, GeneratedChunk>,
	start: GeneratedChunk,
	virtualId: string,
	exportName: string,
): boolean {
	const pending = [start];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const chunk = pending.shift()!;
		if (visited.has(chunk.fileName)) continue;
		visited.add(chunk.fileName);
		if (virtualIds(chunk).includes(virtualId) && (chunk.exports ?? []).includes(exportName)) {
			return true;
		}
		if (!(chunk.exports ?? []).includes(exportName)) continue;
		for (const importedFileName of chunk.imports ?? []) {
			const imported = chunks.get(importedFileName);
			if (imported && (imported.exports ?? []).includes(exportName)) pending.push(imported);
		}
	}
	return false;
}

function findChunkForVirtualId(
	chunks: ReadonlyMap<string, GeneratedChunk>,
	virtualId: string,
): GeneratedChunk | undefined {
	const normalized = normalizeVirtualId(virtualId);
	return [...chunks.values()].find((chunk) => virtualIds(chunk).includes(normalized));
}

function resolveChunkSpecifier(importerFileName: string, specifier: string): string {
	if (!specifier.startsWith('.')) return normalize(specifier);
	return normalize(join(dirname(importerFileName), specifier));
}

function virtualIds(chunk: GeneratedChunk): string[] {
	return [chunk.facadeModuleId ?? undefined, ...chunk.moduleIds]
		.filter((id): id is string => !!id)
		.map(normalizeVirtualId);
}

function rewriteSymbolVirtualStrings(
	chunk: GeneratedChunk,
	symbolFiles: ReadonlyMap<string, string>,
): {
	readonly code: string;
	readonly rewritten: number;
	readonly unresolved: readonly string[];
} {
	let rewritten = 0;
	const unresolved = new Set<string>();
	const code = compactSymbolManifestTables(
		chunk.code
			.replace(
				PACKED_SYMBOL_VIRTUAL_LIST_RE,
				(match, _quote: string, packedVirtualIds: string) => {
					const virtualIds = packedVirtualIds.split(',');
					if (
						virtualIds.length < 2 ||
						virtualIds.some((id) => !id.startsWith(SYMBOL_VIRTUAL_PREFIX))
					) {
						return match;
					}

					return JSON.stringify(
						virtualIds.map((virtualId) => {
							const fileName = symbolFiles.get(virtualId);
							if (!fileName) return virtualId;
							rewritten++;
							return relativeChunkSpecifier(chunk.fileName, fileName);
						}),
					);
				},
			)
			.replace(SYMBOL_VIRTUAL_STRING_RE, (match, _quote: string, virtualId: string) => {
				const fileName = symbolFiles.get(virtualId);
				if (!fileName) {
					unresolved.add(virtualId);
					return match;
				}

				rewritten++;
				return JSON.stringify(relativeChunkSpecifier(chunk.fileName, fileName));
			}),
	);

	return { code, rewritten, unresolved: [...unresolved] };
}

function compactSymbolManifestTables(code: string): string {
	return code.replace(
		SYMBOL_MANIFEST_TUPLE_RE,
		(
			match,
			prefix: string,
			moduleUrlsSource: string,
			exportNamesSource: string,
			symbolRowsSource: string,
			suffix: string,
		) => {
			const moduleUrls = parseStringArray(moduleUrlsSource);
			if (!moduleUrls) return match;

			const nextModuleUrls: string[] = [];
			const moduleIndexMap = new Map<number, number>();
			const seen = new Map<string, number>();
			for (const [index, moduleUrl] of moduleUrls.entries()) {
				let nextIndex = seen.get(moduleUrl);
				if (nextIndex === undefined) {
					nextIndex = nextModuleUrls.length;
					seen.set(moduleUrl, nextIndex);
					nextModuleUrls.push(moduleUrl);
				}
				moduleIndexMap.set(index, nextIndex);
			}
			if (nextModuleUrls.length === moduleUrls.length) return match;

			const nextSymbolRows = symbolRowsSource.replace(
				SYMBOL_ROW_RE,
				(rowMatch, rowPrefix: string, moduleIndexSource: string, rowSuffix: string) => {
					const moduleIndex = Number(moduleIndexSource);
					const nextModuleIndex = moduleIndexMap.get(moduleIndex);
					if (nextModuleIndex === undefined) return rowMatch;
					return `${rowPrefix}${nextModuleIndex}${rowSuffix}`;
				},
			);

			return `${prefix}${JSON.stringify(nextModuleUrls)},${exportNamesSource},${nextSymbolRows}${suffix}`;
		},
	);
}

function parseStringArray(source: string): string[] | undefined {
	const values: string[] = [];
	let end = 1;
	for (const match of source.matchAll(STRING_LITERAL_RE)) {
		values.push(match[2]!);
		end = (match.index ?? 0) + match[0].length;
	}

	if (source.slice(end).trim() !== ']') return undefined;
	return values;
}

function parseStringList(source: string): string[] | undefined {
	if (source.startsWith('[')) return parseStringArray(source);
	const packed = source.match(/^(["'`])([^"'`]*)\1\.split\(\s*(["'`])([^"'`]*)\3\s*\)$/);
	return packed ? packed[2]!.split(packed[4]!) : undefined;
}

function relativeChunkSpecifier(importerFileName: string, targetFileName: string): string {
	const value = relative(dirname(importerFileName), targetFileName).replaceAll('\\', '/');
	return value.startsWith('.') ? value : `./${value}`;
}

function isGeneratedChunk(value: unknown): value is GeneratedChunk {
	if (!value || typeof value !== 'object') return false;
	const chunk = value as Partial<GeneratedChunk> & { readonly type?: unknown };
	return (
		chunk.type === 'chunk' &&
		typeof chunk.fileName === 'string' &&
		typeof chunk.code === 'string' &&
		Array.isArray(chunk.moduleIds)
	);
}

function normalizeVirtualId(id: string): string {
	return id.startsWith('\0') ? id.slice(1) : id;
}
