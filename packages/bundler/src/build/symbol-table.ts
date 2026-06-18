import {
	charIn,
	charNotIn,
	createRegExp,
	digit,
	exactly,
	global as globalFlag,
	oneOrMore,
	whitespace,
} from 'magic-regexp';
import { dirname, relative } from 'pathe';
import { ARCADE_VIRTUAL_PREFIX } from '../transform.ts';

type GeneratedChunk = {
	readonly type: 'chunk';
	readonly fileName: string;
	code: string;
	readonly moduleIds: readonly string[];
	readonly facadeModuleId?: string | null;
};

export type SymbolTableUrlRewriteResult = {
	readonly rewritten: number;
	readonly unresolved: readonly string[];
};

const SYMBOL_VIRTUAL_PREFIX = `${ARCADE_VIRTUAL_PREFIX}symbol:`;
const jsQuote = charIn('"\'`');
const looseJsStringContent = charNotIn('"\'`').times.any();
const looseJsString = jsQuote.and(looseJsStringContent, jsQuote);
const looseJsArray = exactly('[', charNotIn(']').times.any(), ']');
const looseJsObject = exactly('{', charNotIn('}').times.any(), '}');
const nullableLooseJsString = exactly('null').or(looseJsString);

const symbolVirtualStringMatcher = createRegExp(
	jsQuote
		.groupedAs('quote')
		.and(
			exactly(SYMBOL_VIRTUAL_PREFIX)
				.and(oneOrMore(charNotIn('"\'`')))
				.groupedAs('virtualId'),
		)
		.and.referenceTo('quote'),
	[globalFlag],
);
const symbolManifestTupleMatcher = createRegExp(
	exactly('[1,', nullableLooseJsString, ',', nullableLooseJsString, ',').groupedAs('prefix'),
	looseJsArray.groupedAs('moduleUrlsSource'),
	',',
	looseJsArray.groupedAs('exportNamesSource'),
	',',
	looseJsObject.groupedAs('symbolRowsSource'),
	exactly(']').groupedAs('suffix'),
	[globalFlag],
);
const stringLiteralMatcher = createRegExp(
	jsQuote
		.groupedAs('quote')
		.and(looseJsStringContent.groupedAs('value'))
		.and.referenceTo('quote'),
	[globalFlag],
);
const symbolRowMatcher = createRegExp(
	looseJsString
		.and(whitespace.times.any(), ':', whitespace.times.any(), '[')
		.groupedAs('rowPrefix'),
	oneOrMore(digit).groupedAs('moduleIndexSource'),
	exactly(',', whitespace.times.any(), oneOrMore(digit), ']').groupedAs('rowSuffix'),
	[globalFlag],
);

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
		chunk.code.replace(
			symbolVirtualStringMatcher,
			(match, _quote: string, virtualId: string) => {
				const fileName = symbolFiles.get(virtualId);
				if (!fileName) {
					unresolved.add(virtualId);
					return match;
				}

				rewritten++;
				return JSON.stringify(relativeChunkSpecifier(chunk.fileName, fileName));
			},
		),
	);

	return { code, rewritten, unresolved: [...unresolved] };
}

function compactSymbolManifestTables(code: string): string {
	return code.replace(
		symbolManifestTupleMatcher,
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
				symbolRowMatcher,
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
	for (const match of source.matchAll(stringLiteralMatcher)) {
		values.push(match[2]!);
		end = (match.index ?? 0) + match[0].length;
	}

	if (source.slice(end).trim() !== ']') return undefined;
	return values;
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
