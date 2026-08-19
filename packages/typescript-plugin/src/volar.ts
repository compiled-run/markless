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
	const selection = compileEditorSource(source, filename, options);
	const result = selection.result;
	// `result.sourceAst` indexes the recovered source a ladder rung produced, while the
	// mappings were translated back to the authored source. Everything below reasons about
	// authored offsets, so AST positions cross over here and nowhere else.
	addImportClauseInteriorMappings(result, source, selection.toAuthoredOffset);
	escapeMarkupTextLessThan(result, selection.toAuthoredOffset);
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

export type EditorSourceSelection = {
	readonly result: MarklessTsrxTypeServiceResult;
	readonly source: string;
	readonly translateOffset: (offset: number) => number;
	/**
	 * The inverse of `translateOffset`: a `source`/`result.sourceAst` offset back to the
	 * authored source. `result.mappings` and `result.cssMappings` are already authored-space,
	 * so anything correlating an AST position with a mapping has to come through here.
	 */
	readonly toAuthoredOffset: (offset: number) => number;
};

/**
 * Compile authored or classifier TSRX without admitting a truncated loose parse.
 * Candidates are cumulative, and only the first candidate without parser diagnostics
 * may replace the original result.
 */
export function compileEditorSource(
	source: string,
	fileName: string,
	options: TsrxTypeServiceOptions = {},
): EditorSourceSelection {
	let original: MarklessTsrxTypeServiceResult | undefined;
	let originalError: unknown;
	try {
		original = compileTsrxForTypeService(source, fileName, options);
		if (original.errors.length === 0) return selectedSource(original, source, []);
		const fatal = original.errors.find((error) => error.type === 'fatal');
		if (!fatal) return selectedSource(original, source, []);
		originalError = fatal;
	} catch (error) {
		originalError = error;
	}

	let candidate: RecoveryCandidate = { source, edits: [] };
	const attemptedSources = new Set([source]);
	const transformations = [
		removeDanglingMemberDots,
		replaceIncompleteConstructs,
		wrapMultiSiblingRenderRuns,
		inferImmediatelyTerminatedClosingTag,
	] as const;
	for (const transform of transformations) {
		candidate = transform(candidate, source);
		if (attemptedSources.has(candidate.source)) continue;
		attemptedSources.add(candidate.source);
		try {
			const compiled = compileTsrxForTypeService(candidate.source, fileName, options);
			if (compiled.errors.length !== 0) continue;
			removeInferredClosingTagsFromGenerated(compiled, candidate.edits);
			repairSelectedSourceMappings(compiled, candidate.edits);
			for (const edit of candidate.edits) {
				if (edit.deletedText === '.') restoreTypedDot(compiled, edit.offset, source);
			}
			return selectedSource(compiled, candidate.source, candidate.edits);
		} catch {
			// Continue to the next cumulative, source-preserving recovery shape.
		}
	}

	if (originalError && typeof originalError === 'object') {
		(originalError as { type?: 'fatal' }).type = 'fatal';
	}
	throw originalError;
}

function selectedSource(
	result: MarklessTsrxTypeServiceResult,
	source: string,
	edits: readonly RecoveryEdit[],
): EditorSourceSelection {
	return {
		result,
		source,
		translateOffset: (offset) => originalOffsetToSelected(offset, edits),
		toAuthoredOffset: (offset) => selectedOffsetToOriginal(offset, edits),
	};
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
	toAuthoredOffset: (offset: number) => number,
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
		const rawFirst = namedSpecifiers[0];
		const rawLast = namedSpecifiers.at(-1);
		if (rawFirst?.start === undefined || rawFirst.end === undefined || rawLast?.end === undefined)
			continue;

		// The clause is scanned in `source`, so every AST offset used here crosses into
		// authored space first; a recovery rung that edited earlier text shifts them all.
		const first = {
			start: toAuthoredOffset(rawFirst.start),
			end: toAuthoredOffset(rawFirst.end),
		};
		const last = { end: toAuthoredOffset(rawLast.end) };
		const declarationStart =
			declaration.start === undefined ? 0 : toAuthoredOffset(declaration.start);
		const declarationEnd =
			declaration.end === undefined ? source.length : toAuthoredOffset(declaration.end);

		let openBrace = first.start - 1;
		while (openBrace >= declarationStart && /\s/.test(source[openBrace] ?? '')) {
			openBrace -= 1;
		}
		let closeBrace = last.end;
		while (closeBrace < declarationEnd) {
			const character = source[closeBrace];
			if (character === '}') break;
			if (character !== ',' && !/\s/.test(character ?? '')) break;
			closeBrace += 1;
		}
		if (source[openBrace] !== '{' || source[closeBrace] !== '}') continue;

		const tokenMapping = compiled.mappings.find((mapping) => {
			const mappingStart = mapping.sourceOffsets[0];
			const mappingEnd = mappingStart + mapping.lengths[0];
			return mappingStart < first.end && mappingEnd > first.start;
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
 * A `<` that cannot open a tag is literal text in TSRX markup, but TSX has no such
 * rule and reads it as a malformed tag, so the emitted document would not parse.
 * Rewrite each one to the `&lt;` entity and move the mappings that follow along by
 * the three characters it adds - the same generated-code edit `restoreTypedDot`
 * makes for a dot.
 */
function escapeMarkupTextLessThan(
	compiled: MarklessTsrxTypeServiceResult,
	toAuthoredOffset: (offset: number) => number,
): void {
	// Compared against authored-space mapping offsets below, so the AST spans are moved
	// out of the recovered source's coordinates first. A run of real tags sitting at the
	// shifted position of a text node would otherwise be escaped into literal text.
	const textSpans = markupTextSpans(compiled.sourceAst).map((span) => ({
		start: toAuthoredOffset(span.start),
		end: toAuthoredOffset(span.end),
	}));
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

type RecoveryEdit = {
	readonly offset: number;
	readonly deletedText: string;
	readonly replacement: string;
};

type RecoveryCandidate = {
	readonly source: string;
	readonly edits: readonly RecoveryEdit[];
};

function removeDanglingMemberDots(
	candidate: RecoveryCandidate,
	originalSource: string,
): RecoveryCandidate {
	const edits = danglingMemberDotPositions(candidate.source).map((offset) => ({
		offset: selectedOffsetToOriginal(offset, candidate.edits),
		deletedText: '.',
		replacement: '',
	}));
	return withRecoveryEdits(candidate, originalSource, edits);
}

function replaceIncompleteConstructs(
	candidate: RecoveryCandidate,
	originalSource: string,
): RecoveryCandidate {
	const edits: RecoveryEdit[] = [];
	for (const match of candidate.source.matchAll(/@(?![\w{])/g)) {
		const offset = match.index;
		const lineStart = candidate.source.lastIndexOf('\n', offset - 1) + 1;
		const lineBefore = candidate.source.slice(lineStart, offset);
		const trimmedBefore = candidate.source.slice(Math.max(0, offset - 96), offset).trimEnd();
		let replacement = '@{}';
		if (lineStart === offset) replacement = '0';
		else if ('=+-*/%?:,('.includes(trimmedBefore.at(-1) ?? '')) replacement = '0';
		else if (/@try\b/.test(lineBefore)) replacement = '@pending {}';
		else if (/@switch\b/.test(lineBefore)) replacement = '@default: {}';
		edits.push({
			offset: selectedOffsetToOriginal(offset, candidate.edits),
			deletedText: '@',
			replacement,
		});
	}
	return withRecoveryEdits(candidate, originalSource, edits);
}

function wrapMultiSiblingRenderRuns(
	candidate: RecoveryCandidate,
	originalSource: string,
): RecoveryCandidate {
	const insertions: RecoveryEdit[] = [];
	for (const run of multiSiblingRenderRuns(candidate.source)) {
		insertions.push(
			{
				offset: selectedOffsetToOriginal(run.start, candidate.edits),
				deletedText: '',
				replacement: '<>',
			},
			{
				offset: selectedOffsetToOriginal(run.end, candidate.edits),
				deletedText: '',
				replacement: '</>',
			},
		);
	}
	return withRecoveryEdits(candidate, originalSource, insertions);
}

function inferImmediatelyTerminatedClosingTag(
	candidate: RecoveryCandidate,
	originalSource: string,
): RecoveryCandidate {
	const edits: RecoveryEdit[] = [];
	for (const component of componentBodies(candidate.source)) {
		const body = candidate.source.slice(component.start, component.end);
		const authoredEnd = body.trimEnd().length;
		const authored = body.slice(0, authoredEnd);
		const opening = authored.match(/<([A-Za-z][\w.-]*)(?:\s[^<>]*?)?>$/u);
		if (!opening || opening[0].endsWith('/>')) continue;
		const tag = opening[1];
		const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		// A self-closing `<Foo />` opens nothing, so it must not count toward the
		// unclosed-tag balance. The pattern therefore runs to the tag's own `>` and
		// reports whether a `/` preceded it: a lookahead-terminated match only ever
		// captures `<Foo`, which can never end in `/>`, so filtering on the matched
		// text would silently keep counting self-closing tags as openings and skip
		// the recovery for every body that contains one.
		const openingCount = [
			...authored.matchAll(new RegExp(`<${escapedTag}(?:\\s[^<>]*?)?\\s*(/?)>`, 'gu')),
		].filter((match) => match[1] !== '/').length;
		const closingCount = [...authored.matchAll(new RegExp(`</${escapedTag}\\s*>`, 'gu'))]
			.length;
		if (openingCount !== closingCount + 1) continue;
		const selectedOffset = component.start + authoredEnd;
		edits.push({
			offset: selectedOffsetToOriginal(selectedOffset, candidate.edits),
			deletedText: '',
			replacement: `</${tag}>`,
		});
	}
	return withRecoveryEdits(candidate, originalSource, edits);
}

function withRecoveryEdits(
	candidate: RecoveryCandidate,
	originalSource: string,
	additional: readonly RecoveryEdit[],
): RecoveryCandidate {
	if (additional.length === 0) return candidate;
	const edits = [...candidate.edits, ...additional].sort(
		(left, right) =>
			left.offset - right.offset || left.deletedText.length - right.deletedText.length,
	);
	let recovered = originalSource;
	for (const edit of edits.toReversed()) {
		recovered = `${recovered.slice(0, edit.offset)}${edit.replacement}${recovered.slice(
			edit.offset + edit.deletedText.length,
		)}`;
	}
	return { source: recovered, edits };
}

function componentBodies(source: string): Array<{ readonly start: number; readonly end: number }> {
	const bodies: Array<{ start: number; end: number }> = [];
	for (const match of source.matchAll(/@\{/g)) {
		const lineStart = source.lastIndexOf('\n', match.index - 1) + 1;
		const indentation = source.slice(lineStart, match.index).match(/^\s*/)?.[0] ?? '';
		const closing = new RegExp(`^${indentation.replace(/\t/g, '\\t')}\\}`, 'gmu');
		closing.lastIndex = match.index + 2;
		const close = closing.exec(source);
		if (!close) continue;
		bodies.push({ start: match.index + 2, end: close.index });
	}
	return bodies;
}

function multiSiblingRenderRuns(
	source: string,
): Array<{ readonly start: number; readonly end: number }> {
	const runs: Array<{ start: number; end: number }> = [];
	for (const component of componentBodies(source)) {
		const body = source.slice(component.start, component.end);
		const tagLines = [...body.matchAll(/^([ \t]+)<(?!\/)/gmu)];
		if (tagLines.length < 2) continue;
		const rootIndentLength = Math.min(...tagLines.map((match) => match[1].length));
		const roots = tagLines.filter((match) => match[1].length === rootIndentLength);
		if (roots.length < 2) continue;
		const first = roots[0];
		const runStart = component.start + first.index + first[1].length;
		const runEnd = component.start + body.trimEnd().length;
		const run = source.slice(runStart, runEnd);
		const crossesAuthoredStatement = [...run.matchAll(/^([ \t]*)(\S.*)$/gmu)].some(
			(line) =>
				line[1].length <= rootIndentLength && !line[2].startsWith('<') && line[2] !== '>',
		);
		if (!crossesAuthoredStatement) runs.push({ start: runStart, end: runEnd });
	}
	return runs;
}

function removeInferredClosingTagsFromGenerated(
	compiled: MarklessTsrxTypeServiceResult,
	edits: readonly RecoveryEdit[],
): void {
	for (const edit of edits.toReversed()) {
		if (edit.deletedText !== '' || !/^<\/[A-Za-z][\w.-]*>$/u.test(edit.replacement)) {
			continue;
		}
		const selectedStart = originalOffsetToSelected(edit.offset, edits);
		const selectedEnd = selectedStart + edit.replacement.length;
		const syntheticMappings = compiled.mappings.filter((mapping) => {
			const mappingStart = mapping.sourceOffsets[0];
			const mappingEnd = mappingStart + mapping.lengths[0];
			return mappingStart >= selectedStart && mappingEnd <= selectedEnd;
		});
		if (syntheticMappings.length === 0) continue;
		const generatedStart = Math.min(
			...syntheticMappings.map((mapping) => mapping.generatedOffsets[0]),
		);
		const generatedEnd = Math.max(
			...syntheticMappings.map(
				(mapping) => mapping.generatedOffsets[0] + mapping.generatedLengths[0],
			),
		);
		compiled.code = `${compiled.code.slice(0, generatedStart)}${compiled.code.slice(
			generatedEnd,
		)}`;
		for (const mapping of [...compiled.mappings, ...compiled.cssMappings]) {
			if (mapping.generatedOffsets[0] >= generatedEnd) {
				mapping.generatedOffsets[0] -= generatedEnd - generatedStart;
			}
		}
	}
}

function repairSelectedSourceMappings(
	compiled: MarklessTsrxTypeServiceResult,
	edits: readonly RecoveryEdit[],
): void {
	const authoredSegments = selectedAuthoredSegments(edits);
	compiled.mappings = translateMappings(compiled.mappings, authoredSegments);
	compiled.cssMappings = translateMappings(compiled.cssMappings, authoredSegments);
}

type AuthoredSegment = {
	readonly selectedStart: number;
	readonly selectedEnd: number;
	readonly originalStart: number;
};

function selectedAuthoredSegments(edits: readonly RecoveryEdit[]): AuthoredSegment[] {
	const segments: AuthoredSegment[] = [];
	let originalCursor = 0;
	let selectedCursor = 0;
	for (const edit of edits) {
		if (edit.offset > originalCursor) {
			const length = edit.offset - originalCursor;
			segments.push({
				selectedStart: selectedCursor,
				selectedEnd: selectedCursor + length,
				originalStart: originalCursor,
			});
			selectedCursor += length;
		}
		const authoredReplacementLength = Math.min(
			edit.deletedText.length,
			edit.replacement.length,
		);
		if (authoredReplacementLength > 0) {
			segments.push({
				selectedStart: selectedCursor,
				selectedEnd: selectedCursor + authoredReplacementLength,
				originalStart: edit.offset,
			});
		}
		selectedCursor += edit.replacement.length;
		originalCursor = edit.offset + edit.deletedText.length;
	}
	segments.push({
		selectedStart: selectedCursor,
		selectedEnd: Number.POSITIVE_INFINITY,
		originalStart: originalCursor,
	});
	return segments;
}

function translateMappings(
	mappings: readonly TsrxCodeMapping[],
	segments: readonly AuthoredSegment[],
): TsrxCodeMapping[] {
	const translated: TsrxCodeMapping[] = [];
	for (const mapping of mappings) {
		const sourceStart = mapping.sourceOffsets[0];
		const sourceEnd = sourceStart + mapping.lengths[0];
		for (const segment of segments) {
			const start = Math.max(sourceStart, segment.selectedStart);
			const end = Math.min(sourceEnd, segment.selectedEnd);
			if (end <= start) continue;
			const relativeStart = start - sourceStart;
			const relativeEnd = end - sourceStart;
			const generatedStart =
				mapping.generatedOffsets[0] + Math.min(relativeStart, mapping.generatedLengths[0]);
			const generatedEnd =
				mapping.generatedOffsets[0] + Math.min(relativeEnd, mapping.generatedLengths[0]);
			translated.push({
				sourceOffsets: [segment.originalStart + start - segment.selectedStart],
				generatedOffsets: [generatedStart],
				lengths: [end - start],
				generatedLengths: [Math.max(0, generatedEnd - generatedStart)],
				data: { ...mapping.data },
			});
		}
	}
	return translated;
}

function originalOffsetToSelected(offset: number, edits: readonly RecoveryEdit[]): number {
	let translated = offset;
	for (const edit of edits) {
		if (edit.offset >= offset) break;
		translated += edit.replacement.length - edit.deletedText.length;
	}
	return translated;
}

function selectedOffsetToOriginal(offset: number, edits: readonly RecoveryEdit[]): number {
	let shift = 0;
	for (const edit of edits) {
		const selectedStart = edit.offset + shift;
		const selectedEnd = selectedStart + edit.replacement.length;
		if (offset < selectedStart) break;
		if (offset <= selectedEnd) {
			return edit.offset + Math.min(offset - selectedStart, edit.deletedText.length);
		}
		shift += edit.replacement.length - edit.deletedText.length;
	}
	return offset - shift;
}

function danglingMemberDotPositions(source: string): number[] {
	const positions: number[] = [];
	const pattern = /[$#_\u200C\u200D\p{ID_Continue})\]}]\.(?=\s*(?:;|\n|$))/gu;
	for (const match of source.matchAll(pattern)) positions.push(match.index + match[0].length - 1);
	return positions;
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
	}
}
