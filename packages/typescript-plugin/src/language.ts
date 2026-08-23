import type { TsrxCodeMapping } from '@markless/compiler/type-service';
import type { MarklessTsrxTypeServiceResult } from '@markless/compiler/type-service';
import { compileToVolarMappings } from './volar.ts';

type FileNameOrUri = string | { readonly fsPath: string };
type ScriptSnapshot = {
	getText(start: number, end: number): string;
	getLength(): number;
	// Accepted but never called here, so it stays wide enough for a real ts.IScriptSnapshot
	// (whose getChangeRange takes the previous snapshot) as well as for a test stub.
	getChangeRange?: unknown;
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

export function isMarklessTsrxFile(fileName: FileNameOrUri): boolean {
	return MARKLESS_TSRX_EXTENSIONS.some((extension) =>
		normalizeFileName(fileName).endsWith(extension),
	);
}

export function getMarklessTsrxParseFailure(
	fileName: string,
): MarklessTsrxParseFailure | undefined {
	return parseFailures.get(canonicalParseFailureFileName(fileName));
}

export function clampMarklessDiagnosticStart(
	position: number,
	sourceSnapshotLength: number,
	sourceFileLength: number | undefined,
): number {
	return Math.min(
		Math.max(position, 0),
		sourceSnapshotLength,
		sourceFileLength ?? Number.POSITIVE_INFINITY,
	);
}

/**
 * Convert an authored TSRX offset into an offset in the generated TSX.
 *
 * @tsrx/typescript-plugin registers `.tsrx` with Volar and does so WITHOUT
 * `preventLeadingOffset`, so Volar serves the generated TSX behind a blanked copy of the
 * authored source. A generated offset therefore reaches TypeScript as
 * `sourceLength + generatedOffset`, which is how src/index.ts calls the raw language
 * service and why it re-anchors code-action changes that land in the blanked copy.
 * Opting out of the leading offset upstream would shift every one of those positions.
 * The completion matrix proves the convention end to end (M12 jsxClosingTag, M14
 * auto-import).
 */
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

/**
 * The generated TSX for one authored `.tsrx` file, plus the source mappings that tie the
 * two together.
 *
 * This is no longer a Volar language plugin. @tsrx/typescript-plugin registers `.tsrx`
 * with Volar and owns the virtual-code lifecycle; it reaches this compiler through the
 * tsconfig `tsrx.compiler` declaration. What stays Markless-only is the compile itself -
 * `@`-construct recovery and the parse-failure record - which src/volar.ts performs and
 * this class and src/index.ts read.
 */
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
		const compiled = updateMarklessTsrxParseFailure(this.fileName, source);

		// Keep the last successful virtual document when an edit cannot yet be
		// parsed. Volar can continue serving the existing program until the next
		// successful update instead of allowing a parser exception to escape.
		if (!compiled) return;
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

/**
 * Compile TSRX the way the editor host does - Markless recovery included - and keep this
 * file's parse-failure record in sync: a clean or recovered compile clears it, a file that
 * stays unusable records it. This is the single place the record is written, because the
 * host owns the registered language layer and reports compile failures only when it runs
 * as a type checker, never inside tsserver.
 */
export function updateMarklessTsrxParseFailure(
	fileName: string,
	source: string,
): MarklessTsrxTypeServiceResult | undefined {
	try {
		const compiled = compileToVolarMappings(source, fileName, { loose: true });
		const firstError = compiled.errors[0];
		if (firstError) {
			parseFailures.set(
				canonicalParseFailureFileName(fileName),
				parserFailureDetails(firstError),
			);
		} else {
			parseFailures.delete(canonicalParseFailureFileName(fileName));
		}
		return compiled;
	} catch (error) {
		parseFailures.set(canonicalParseFailureFileName(fileName), parserFailureDetails(error));
		return undefined;
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

function normalizeFileName(fileNameOrUri: FileNameOrUri): string {
	return typeof fileNameOrUri === 'string'
		? fileNameOrUri
		: fileNameOrUri.fsPath.replace(/\\/g, '/');
}

function canonicalParseFailureFileName(fileNameOrUri: FileNameOrUri): string {
	return normalizeFileName(fileNameOrUri).replace(/\\/g, '/').toLowerCase();
}
