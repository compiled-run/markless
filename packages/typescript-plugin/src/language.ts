import { compileTsrxForTypeService, type TsrxCodeMapping } from '@markless/compiler/type-service';
import type { MarklessTsrxTypeServiceResult } from '@markless/compiler/type-service';

type FileNameOrUri = string | { readonly fsPath: string };
type ScriptSnapshot = {
	getText(start: number, end: number): string;
	getLength(): number;
	getChangeRange(): unknown;
};
type VirtualCodeSnapshot = {
	getText(start: number, end: number): string;
	getLength(): number;
	getChangeRange(): undefined;
};

export const MARKLESS_TSRX_LANGUAGE_ID = 'markless-tsrx';
export const MARKLESS_TSRX_EXTENSIONS = ['.tsrx'];
export const MARKLESS_TSRX_PARSE_ERROR_CODE = 91001;

export type MarklessTsrxParseFailure = {
	readonly message: string;
	readonly pos: number;
};

const parseFailures = new Map<string, MarklessTsrxParseFailure>();

const SCRIPT_KIND_TSX = 4;
const SCRIPT_KIND_DEFERRED = 7;

export function isMarklessTsrxFile(fileName: FileNameOrUri): boolean {
	return MARKLESS_TSRX_EXTENSIONS.some((extension) =>
		normalizeFileName(fileName).endsWith(extension),
	);
}

export function getMarklessTsrxParseFailure(
	fileName: string,
): MarklessTsrxParseFailure | undefined {
	return parseFailures.get(normalizeFileName(fileName));
}

export function mapMarklessSourcePositionToGenerated(
	fileName: string,
	snapshot: ScriptSnapshot,
	position: number,
): number | undefined {
	const virtualCode = new MarklessTsrxVirtualCode(fileName, snapshot);
	const candidates = virtualCode.mappings.filter((mapping) => {
		const sourceStart = mapping.sourceOffsets[0];
		const sourceEnd = sourceStart + mapping.lengths[0];
		return mapping.data.structure && sourceStart <= position && position <= sourceEnd;
	});
	const mapping =
		candidates.find(
			(candidate) => candidate.sourceOffsets[0] + candidate.lengths[0] === position,
		) ?? candidates[0];
	if (!mapping) return undefined;

	const sourceDelta = position - mapping.sourceOffsets[0];
	return mapping.generatedOffsets[0] + Math.min(sourceDelta, mapping.generatedLengths[0]);
}

export function getMarklessTsrxLanguagePlugin(): any {
	return {
		getLanguageId(fileNameOrUri: FileNameOrUri) {
			if (isMarklessTsrxFile(fileNameOrUri)) return MARKLESS_TSRX_LANGUAGE_ID;
		},
		createVirtualCode(
			fileNameOrUri: FileNameOrUri,
			languageId: unknown,
			snapshot: ScriptSnapshot,
		) {
			if (!shouldCreateMarklessTsrxVirtualCode(fileNameOrUri, languageId)) return undefined;
			return new MarklessTsrxVirtualCode(normalizeFileName(fileNameOrUri), snapshot);
		},
		updateVirtualCode(
			_fileNameOrUri: FileNameOrUri,
			virtualCode: unknown,
			snapshot: ScriptSnapshot,
		) {
			if (!(virtualCode instanceof MarklessTsrxVirtualCode)) return undefined;
			virtualCode.update(snapshot);
			return virtualCode;
		},
		typescript: {
			extraFileExtensions: MARKLESS_TSRX_EXTENSIONS.map((extension) => ({
				extension: extension.slice(1),
				isMixedContent: false,
				scriptKind: SCRIPT_KIND_DEFERRED,
			})),
			getServiceScript(virtualCode) {
				if (virtualCode.languageId !== MARKLESS_TSRX_LANGUAGE_ID) return undefined;
				return {
					code: virtualCode,
					extension: '.tsx',
					scriptKind: SCRIPT_KIND_TSX,
					preventLeadingOffset: true,
				};
			},
		},
	};
}

export class MarklessTsrxVirtualCode {
	id = 'root';
	languageId = MARKLESS_TSRX_LANGUAGE_ID;
	embeddedCodes: MarklessTsrxCssVirtualCode[] = [];
	codegenStacks: unknown[] = [];
	generatedCode = '';
	mappings: TsrxCodeMapping[] = [];
	fileName: string;
	sourceSnapshot: ScriptSnapshot;
	sourceAst: unknown;
	usageErrors: unknown[] = [];
	snapshot: VirtualCodeSnapshot;

	constructor(fileName: string, snapshot: ScriptSnapshot) {
		this.fileName = fileName;
		this.sourceSnapshot = snapshot;
		this.sourceAst = undefined;
		this.snapshot = {
			getText: () => '',
			getLength: () => 0,
			getChangeRange: () => undefined,
		};
		this.update(snapshot);
	}

	update(snapshot: ScriptSnapshot): void {
		const source = snapshot.getText(0, snapshot.getLength());
		this.sourceSnapshot = snapshot;
		let compiled: MarklessTsrxTypeServiceResult | undefined;
		let parseFailure: unknown;
		try {
			compiled = compileTsrxForTypeService(source, this.fileName, { loose: true });
		} catch (error) {
			parseFailure = error;
			compiled = compileRecoverableSource(source, this.fileName);
		}

		// Keep the last successful virtual document when an edit cannot yet be
		// parsed. Volar can continue serving the existing program until the next
		// successful update instead of allowing a parser exception to escape.
		if (!compiled) {
			parseFailures.set(this.fileName, parserFailureDetails(parseFailure));
			return;
		}
		parseFailures.delete(this.fileName);
		addImportClauseInteriorMappings(compiled, source);
		this.generatedCode = compiled.code;
		this.sourceAst = compiled.sourceAst;
		this.usageErrors = compiled.errors;
		this.embeddedCodes = compiled.cssMappings.map(
			(mapping, index) => new MarklessTsrxCssVirtualCode(this.fileName, mapping, index),
		);
		this.snapshot = {
			getText: (start, end) => this.generatedCode.substring(start, end),
			getLength: () => this.generatedCode.length,
			getChangeRange: () => undefined,
		};
		this.mappings = compiled.mappings;
	}
}

function parserFailureDetails(error: unknown): MarklessTsrxParseFailure {
	const message = error instanceof Error ? error.message : String(error);
	const pos =
		typeof error === 'object' &&
		error !== null &&
		'pos' in error &&
		typeof error.pos === 'number'
			? error.pos
			: 0;
	return { message, pos };
}

type AstNode = {
	readonly type: string;
	readonly start?: number;
	readonly end?: number;
	readonly specifiers?: readonly AstNode[];
	readonly body?: readonly AstNode[];
};

function addImportClauseInteriorMappings(
	compiled: MarklessTsrxTypeServiceResult,
	source: string,
): void {
	const program = compiled.sourceAst as AstNode | undefined;
	if (program?.type !== 'Program' || !Array.isArray(program.body)) return;

	for (const declaration of program.body) {
		if (declaration.type !== 'ImportDeclaration' || !Array.isArray(declaration.specifiers)) {
			continue;
		}
		const namedSpecifiers = declaration.specifiers.filter(
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

function compileRecoverableSource(
	source: string,
	fileName: string,
): MarklessTsrxTypeServiceResult | undefined {
	const dotPositions = danglingMemberDotPositions(source);
	let recoverableSource = removeCharactersAt(source, dotPositions);

	try {
		const compiled = compileTsrxForTypeService(recoverableSource, fileName, { loose: true });
		for (const dotPosition of dotPositions) restoreTypedDot(compiled, dotPosition, source);
		return compiled;
	} catch {
		// A bare @ is a common intermediate editor state. Replacing only those
		// incomplete tokens with a same-width expression lets unrelated mapped
		// TypeScript features remain available while the directive is unfinished.
		const recovery = replaceIncompleteConstructs(recoverableSource);
		recoverableSource = recovery.source;
		try {
			const compiled = compileTsrxForTypeService(recoverableSource, fileName, {
				loose: true,
			});
			repairRecoveryEditMappings(compiled, recovery.edits);
			for (const dotPosition of dotPositions) restoreTypedDot(compiled, dotPosition, source);
			return compiled;
		} catch {
			return undefined;
		}
	}
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

class MarklessTsrxCssVirtualCode {
	languageId = 'css';
	embeddedCodes: [] = [];
	codegenStacks: unknown[] = [];
	id: string;
	fileName: string;
	snapshot: VirtualCodeSnapshot;
	mappings: TsrxCodeMapping[];

	constructor(fileName: string, mapping: TsrxCodeMapping, index: number) {
		const content = mapping.data?.customData?.content ?? '';
		this.id = `style_${index}`;
		this.fileName = `${fileName}.${this.id}.css`;
		this.snapshot = {
			getText: (start, end) => content.substring(start, end),
			getLength: () => content.length,
			getChangeRange: () => undefined,
		};
		this.mappings = [
			{
				...mapping,
				generatedOffsets: [0],
				generatedLengths: [content.length],
			},
		];
	}
}

export function transformTsrxForTypeScriptService(source) {
	return compileTsrxForTypeService(source, 'module.tsrx', { loose: true }).code;
}

function normalizeFileName(fileNameOrUri: FileNameOrUri): string {
	return typeof fileNameOrUri === 'string'
		? fileNameOrUri
		: fileNameOrUri.fsPath.replace(/\\/g, '/');
}

function shouldCreateMarklessTsrxVirtualCode(
	fileNameOrUri: FileNameOrUri,
	languageId: unknown,
): boolean {
	return isMarklessTsrxFile(fileNameOrUri) && isMarklessTsrxLanguageId(languageId);
}

function isMarklessTsrxLanguageId(languageId: unknown): boolean {
	if (languageId === MARKLESS_TSRX_LANGUAGE_ID) return true;
	if (typeof languageId !== 'string') return false;
	const normalizedLanguageId = languageId.toLowerCase();
	return (
		normalizedLanguageId === 'tsrx' ||
		normalizedLanguageId === 'tsx' ||
		normalizedLanguageId === 'typescriptreact'
	);
}
