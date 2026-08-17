import {
	compileTsrxForTypeService,
	type MarklessTsrxTypeServiceResult,
	type TsrxCodeMapping,
	type TsrxTypeServiceOptions,
} from '@markless/compiler/type-service';

/**
 * Compile Markless TSRX into the TSX and mappings consumed by Volar language tools.
 *
 * This module is the one the editor host actually invokes (through the tsconfig
 * `tsrx.compiler` declaration), so every Markless-only adjustment to how `.tsrx`
 * becomes TypeScript has to happen here. The host turns any throw into a fatal file
 * with no virtual code at all - no completions, no hover, no diagnostics - so a
 * half-typed construct or a dangling member dot is recovered first and only an
 * unusable file is rethrown as fatal.
 *
 * Recoverable compiler errors stay on `result.errors`.
 */
export function compileToVolarMappings(
	source: string,
	filename: string,
	options: TsrxTypeServiceOptions = {},
): MarklessTsrxTypeServiceResult {
	let result: MarklessTsrxTypeServiceResult;
	try {
		result = compileTsrxForTypeService(source, filename, options);
	} catch (error) {
		const recovered = compileRecoverableSource(source, filename, options);
		if (!recovered) {
			if (error && typeof error === 'object') {
				(error as { type?: 'fatal' }).type = 'fatal';
			}
			throw error;
		}
		result = recovered;
	}
	addImportClauseInteriorMappings(result, source);
	escapeMarkupTextLessThan(result);
	return {
		...result,
		cssMappings: result.cssMappings.map((mapping, index) => ({
			...mapping,
			data: {
				...mapping.data,
				customData: {
					...mapping.data.customData,
					embeddedId: `style-${fnv1a(filename)}-${index}`,
				},
			},
		})),
	};
}

// The editor host carries this id in a URI authority, which lowercases on parse, so the
// id must stay within [a-z0-9_-] or the host's embedded-code lookup misses.
function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

type AstNode = {
	readonly type: string;
	readonly start?: number;
	readonly end?: number;
	readonly specifiers?: readonly AstNode[];
	readonly body?: readonly AstNode[];
};

/**
 * Map the whitespace inside an import clause's braces, not just the specifier tokens.
 * A caret parked at `import { | Nav }` sits between mapped tokens, and TypeScript also
 * inserts an auto-imported name at that interior position, so both need a mapping that
 * covers the gap.
 */
function addImportClauseInteriorMappings(
	compiled: MarklessTsrxTypeServiceResult,
	source: string,
): void {
	const program = compiled.sourceAst as AstNode | undefined;
	if (program?.type !== 'Program') return;
	// Array.isArray narrows a readonly array to any[], so the node type is restored here.
	const body: readonly AstNode[] = Array.isArray(program.body) ? program.body : [];

	for (const declaration of body) {
		if (declaration.type !== 'ImportDeclaration') continue;
		const specifiers: readonly AstNode[] = Array.isArray(declaration.specifiers)
			? declaration.specifiers
			: [];
		const namedSpecifiers = specifiers.filter(
			(specifier) => specifier.type === 'ImportSpecifier',
		);
		const first = namedSpecifiers[0];
		const last = namedSpecifiers.at(-1);
		if (first?.start === undefined || first.end === undefined || last?.end === undefined)
			continue;

		let openBrace = first.start - 1;
		while (openBrace >= (declaration.start ?? 0) && /\s/.test(source[openBrace] ?? '')) {
			openBrace -= 1;
		}
		let closeBrace = last.end;
		while (closeBrace < (declaration.end ?? source.length)) {
			const character = source[closeBrace];
			if (character === '}') break;
			if (character !== ',' && !/\s/.test(character ?? '')) break;
			closeBrace += 1;
		}
		if (source[openBrace] !== '{' || source[closeBrace] !== '}') continue;

		const tokenMapping = compiled.mappings.find((mapping) => {
			const mappingStart = mapping.sourceOffsets[0];
			const mappingEnd = mappingStart + mapping.lengths[0];
			return mappingStart < first.end! && mappingEnd > first.start!;
		});
		if (!tokenMapping) continue;

		const sourceStart = openBrace + 1;
		const sourceLength = closeBrace - sourceStart;
		const offsetDelta = tokenMapping.generatedOffsets[0] - tokenMapping.sourceOffsets[0];
		const generatedStart = sourceStart + offsetDelta;
		const sourceText = source.slice(sourceStart, closeBrace);
		const generatedText = compiled.code.slice(generatedStart, generatedStart + sourceLength);
		if (sourceText !== generatedText) continue;

		compiled.mappings.push({
			sourceOffsets: [sourceStart],
			generatedOffsets: [generatedStart],
			lengths: [sourceLength],
			generatedLengths: [sourceLength],
			data: { ...tokenMapping.data },
		});
	}
}

/**
 * Recover the TSX for a file the compiler cannot parse yet, so an in-progress edit keeps
 * its unrelated TypeScript features instead of blanking the whole document. Returns
 * undefined when the file stays unusable.
 */
function compileRecoverableSource(
	source: string,
	fileName: string,
	options: TsrxTypeServiceOptions,
): MarklessTsrxTypeServiceResult | undefined {
	const recovered = compileWithTypeScriptRecovery(source, fileName, options);
	if (recovered) return recovered;

	// A half-typed CSS rule fails the whole file; blanking keeps every other offset valid.
	const regions = styleInteriorRegions(source);
	if (regions.length === 0) return undefined;
	const blanked = compileWithTypeScriptRecovery(
		blankStyleInteriors(source, regions),
		fileName,
		options,
	);
	if (!blanked) return undefined;
	blanked.cssMappings = authoredCssMappings(blanked, source, regions);
	return blanked;
}

function compileWithTypeScriptRecovery(
	source: string,
	fileName: string,
	options: TsrxTypeServiceOptions,
): MarklessTsrxTypeServiceResult | undefined {
	const dotPositions = danglingMemberDotPositions(source);
	let recoverableSource = removeCharactersAt(source, dotPositions);

	try {
		const compiled = compileTsrxForTypeService(recoverableSource, fileName, options);
		for (const dotPosition of dotPositions) restoreTypedDot(compiled, dotPosition, source);
		return compiled;
	} catch {
		// A bare @ is a common intermediate editor state. Replacing only those
		// incomplete tokens with a same-width expression lets unrelated mapped
		// TypeScript features remain available while the directive is unfinished.
		const recovery = replaceIncompleteConstructs(recoverableSource);
		recoverableSource = recovery.source;
		try {
			const compiled = compileTsrxForTypeService(recoverableSource, fileName, options);
			repairRecoveryEditMappings(compiled, recovery.edits);
			for (const dotPosition of dotPositions) restoreTypedDot(compiled, dotPosition, source);
			return compiled;
		} catch {
			return undefined;
		}
	}
}

type StyleRegion = { readonly start: number; readonly end: number };

function styleInteriorRegions(source: string): StyleRegion[] {
	const regions: StyleRegion[] = [];
	for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
		const start = match.index + match[0].indexOf('>') + 1;
		regions.push({ start, end: start + match[1].length });
	}
	return regions;
}

function blankStyleInteriors(source: string, regions: readonly StyleRegion[]): string {
	let blanked = source;
	for (const region of regions) {
		const blank = source.slice(region.start, region.end).replace(/[^\n]/g, ' ');
		blanked = `${blanked.slice(0, region.start)}${blank}${blanked.slice(region.end)}`;
	}
	return blanked;
}

const styleMappingData: TsrxCodeMapping['data'] = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: false,
	customData: {},
};

/**
 * Put the authored CSS back on mappings compiled from blanked style interiors, so the
 * embedded CSS document still serves the text being typed. A region the parser dropped
 * gets a mapping synthesized in the shape a style element normally compiles to.
 */
function authoredCssMappings(
	compiled: MarklessTsrxTypeServiceResult,
	source: string,
	regions: readonly StyleRegion[],
): TsrxCodeMapping[] {
	return regions.map((region) => {
		const content = source.slice(region.start, region.end);
		const data =
			compiled.cssMappings.find(
				(mapping) =>
					mapping.sourceOffsets[0] >= region.start && mapping.sourceOffsets[0] <= region.end,
			)?.data ?? styleMappingData;
		return {
			sourceOffsets: [region.start],
			generatedOffsets: [0],
			lengths: [content.length],
			generatedLengths: [content.length],
			data: { ...data, customData: { ...data.customData, content } },
		};
	});
}

/**
 * A `<` that cannot open a tag is literal text in TSRX markup, but TSX has no such
 * rule and reads it as a malformed tag, so the emitted document would not parse.
 * Rewrite each one to the `&lt;` entity and move the mappings that follow along by
 * the three characters it adds - the same generated-code edit `restoreTypedDot`
 * makes for a dot.
 */
function escapeMarkupTextLessThan(compiled: MarklessTsrxTypeServiceResult): void {
	const textSpans = markupTextSpans(compiled.sourceAst);
	if (textSpans.length === 0) return;

	const positions = new Set<number>();
	for (const mapping of compiled.mappings) {
		const sourceStart = mapping.sourceOffsets[0];
		const inText = textSpans.some((span) => sourceStart >= span.start && sourceStart < span.end);
		if (!inText) continue;
		const generatedStart = mapping.generatedOffsets[0];
		const generated = compiled.code.slice(
			generatedStart,
			generatedStart + mapping.generatedLengths[0],
		);
		let index = generated.indexOf('<');
		while (index !== -1) {
			positions.add(generatedStart + index);
			index = generated.indexOf('<', index + 1);
		}
	}

	for (const position of [...positions].sort((left, right) => right - left)) {
		compiled.code = `${compiled.code.slice(0, position)}&lt;${compiled.code.slice(position + 1)}`;
		for (const mapping of compiled.mappings) {
			const generatedStart = mapping.generatedOffsets[0];
			if (generatedStart > position) mapping.generatedOffsets[0] += 3;
			else if (generatedStart + mapping.generatedLengths[0] > position) {
				mapping.generatedLengths[0] += 3;
			}
		}
	}
}

function markupTextSpans(sourceAst: unknown): Array<{ start: number; end: number }> {
	const spans: Array<{ start: number; end: number }> = [];
	const seen = new Set<unknown>();
	const visit = (node: unknown): void => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const entry of node) visit(entry);
			return;
		}
		const candidate = node as { type?: unknown; start?: unknown; end?: unknown };
		if (
			candidate.type === 'JSXText' &&
			typeof candidate.start === 'number' &&
			typeof candidate.end === 'number'
		) {
			spans.push({ start: candidate.start, end: candidate.end });
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata') continue;
			visit(value);
		}
	};
	visit(sourceAst);
	return spans;
}

type RecoveryEdit = { readonly offset: number; readonly replacement: string };

function replaceIncompleteConstructs(source: string): {
	readonly source: string;
	readonly edits: readonly RecoveryEdit[];
} {
	const edits: RecoveryEdit[] = [];
	for (const match of source.matchAll(/@(?![\w{])/g)) {
		const offset = match.index;
		const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
		const lineBefore = source.slice(lineStart, offset);
		const trimmedBefore = source.slice(Math.max(0, offset - 96), offset).trimEnd();
		let replacement = '@{}';
		if (lineStart === offset) replacement = '0';
		else if ('=+-*/%?:,('.includes(trimmedBefore.at(-1) ?? '')) replacement = '0';
		else if (/@try\b/.test(lineBefore)) replacement = '@pending {}';
		else if (/@switch\b/.test(lineBefore)) replacement = '@default: {}';
		edits.push({ offset, replacement });
	}
	let recovered = source;
	for (const edit of edits.toReversed()) {
		recovered = `${recovered.slice(0, edit.offset)}${edit.replacement}${recovered.slice(edit.offset + 1)}`;
	}
	return { source: recovered, edits };
}

function repairRecoveryEditMappings(
	compiled: MarklessTsrxTypeServiceResult,
	edits: readonly RecoveryEdit[],
): void {
	for (const edit of edits) {
		const expandedOffset =
			edit.offset +
			edits
				.filter((candidate) => candidate.offset < edit.offset)
				.reduce((total, candidate) => total + candidate.replacement.length - 1, 0);
		const containing = compiled.mappings.find(
			(mapping) =>
				mapping.sourceOffsets[0] <= expandedOffset &&
				mapping.sourceOffsets[0] + mapping.lengths[0] >= expandedOffset,
		);
		if (containing) {
			compiled.mappings.push({
				sourceOffsets: [edit.offset],
				generatedOffsets: [
					containing.generatedOffsets[0] +
						Math.min(
							expandedOffset - containing.sourceOffsets[0],
							containing.generatedLengths[0],
						),
				],
				lengths: [1],
				generatedLengths: [1],
				data: { ...containing.data },
			});
		}
	}
	for (const mapping of compiled.mappings) {
		const expandedOffset = mapping.sourceOffsets[0];
		const shift = edits.reduce((total, edit) => {
			const editExpandedOffset =
				edit.offset +
				edits
					.filter((candidate) => candidate.offset < edit.offset)
					.reduce((sum, candidate) => sum + candidate.replacement.length - 1, 0);
			return editExpandedOffset < expandedOffset
				? total + edit.replacement.length - 1
				: total;
		}, 0);
		mapping.sourceOffsets[0] -= shift;
	}
}

function danglingMemberDotPositions(source: string): number[] {
	const positions: number[] = [];
	const pattern = /[$#_\u200C\u200D\p{ID_Continue})\]}]\.(?=\s*(?:;|\n|$))/gu;
	for (const match of source.matchAll(pattern)) positions.push(match.index + match[0].length - 1);
	return positions;
}

function removeCharactersAt(source: string, positions: readonly number[]): string {
	const removed = new Set(positions);
	return Array.from(source)
		.filter((_character, index) => !removed.has(index))
		.join('');
}

function restoreTypedDot(
	compiled: MarklessTsrxTypeServiceResult,
	dotPosition: number,
	source: string,
): void {
	const dotMapping = compiled.mappings.find((mapping) => {
		if (!mapping.data.completion) return false;
		if (mapping.sourceOffsets[0] + mapping.lengths[0] !== dotPosition) return false;
		const recoveredToken = source.slice(mapping.sourceOffsets[0], dotPosition);
		const generated = compiled.code.slice(
			mapping.generatedOffsets[0],
			mapping.generatedOffsets[0] + mapping.generatedLengths[0],
		);
		return generated === recoveredToken;
	});
	if (!dotMapping) return;

	const generatedPosition = dotMapping.generatedOffsets[0] + dotMapping.generatedLengths[0];
	compiled.code = `${compiled.code.slice(0, generatedPosition)}.${compiled.code.slice(generatedPosition)}`;
	const dotMappingIndex = compiled.mappings.indexOf(dotMapping);
	const insertedMapping: TsrxCodeMapping = {
		sourceOffsets: [dotPosition],
		generatedOffsets: [generatedPosition],
		lengths: [1],
		generatedLengths: [1],
		data: { ...dotMapping.data },
	};
	compiled.mappings.splice(dotMappingIndex + 1, 0, insertedMapping);

	for (const mapping of compiled.mappings) {
		if (mapping === dotMapping || mapping === insertedMapping) continue;
		if (mapping.generatedOffsets[0] >= generatedPosition) mapping.generatedOffsets[0] += 1;
		if (mapping.sourceOffsets[0] >= dotPosition) mapping.sourceOffsets[0] += 1;
	}
}
