import {
	analyze as analyzeYukuSource,
	duplicateBindingDiagnostics,
	isEventAttribute,
	normalizeEventName,
	normalizeProgram,
	parseModule as parseYukuModule,
	sourceLocation,
	type BaseNode,
	type Comment,
	type Diagnostic,
	type ParseModuleOptions,
	type Program,
	type SemanticView,
} from 'yuku-tsrx';

export { isEventAttribute, normalizeEventName };
export type { Program, SemanticView };

export type MarklessSourcePosition = {
	readonly line: number;
	readonly column: number;
};

export type MarklessSourceLocation = {
	readonly start: MarklessSourcePosition;
	readonly end: MarklessSourcePosition;
};

export interface MarklessCompileError extends SyntaxError {
	code: string | undefined;
	pos: number | undefined;
	raisedAt: number | undefined;
	end: number | undefined;
	loc: MarklessSourceLocation | undefined;
	fileName: string | null;
	type: 'fatal' | 'usage';
}

export type MarklessParserComment = Comment & {
	readonly loc: MarklessSourceLocation;
};

export type MarklessParseOptions = Omit<ParseModuleOptions, 'errors' | 'comments'> & {
	errors?: MarklessCompileError[];
	comments?: MarklessParserComment[];
};

export interface MarklessMappingData {
	verification: boolean;
	completion: boolean;
	semantic: boolean;
	navigation: boolean;
	structure: boolean;
	format: boolean;
	customData: {
		embeddedId?: string;
		content?: string;
		readonly [key: string]: unknown;
	};
	readonly [key: string]: unknown;
}

export interface MarklessCodeMapping {
	sourceOffsets: number[];
	generatedOffsets: number[];
	lengths: number[];
	generatedLengths: number[];
	data: MarklessMappingData;
}

export interface MarklessVolarMappingsResult {
	code: string;
	mappings: MarklessCodeMapping[];
	cssMappings: MarklessCodeMapping[];
	/**
	 * Reserved for mappings of `<script>` regions. The yuku parser does not surface them
	 * yet, so the type service emits an empty array to keep the result shape stable for
	 * editor hosts that already read this field.
	 */
	scriptMappings: MarklessCodeMapping[];
	errors: MarklessCompileError[];
	sourceAst: Program;
}

export function parseModule(
	source: string,
	filename = 'module.tsrx',
	options: MarklessParseOptions = {},
): Program {
	const diagnostics: Diagnostic[] = [];
	const comments: Comment[] = [];
	const {
		errors,
		comments: outputComments,
		collect = false,
		loose = false,
		...parserOptions
	} = options;
	const program = parseYukuModule(source, filename, {
		...parserOptions,
		collect: true,
		loose,
		errors: diagnostics,
		comments,
	});
	const compileErrors = [
		...diagnostics.map((diagnostic) =>
			toMarklessCompileError(diagnostic, source, filename, 'fatal'),
		),
		...duplicateBindingDiagnostics(program, source).map((diagnostic) =>
			toMarklessCompileError(diagnostic, source, filename, 'usage'),
		),
	];
	errors?.push(...compileErrors);
	outputComments?.push(
		...comments.map((comment) => ({
			...comment,
			loc: sourceLocation(source, comment.start, comment.end),
		})),
	);
	if (!collect && !loose) {
		const fatal = compileErrors.find((error) => error.type === 'fatal');
		if (fatal) throw fatal;
	}
	return normalizeProgram(program, { onNode: blankMarklessAllowDirective });
}

/**
 * The parser dialect yuku infers from a filename. `parseModule` does this for
 * us, but `analyze` takes options only, so the adapter has to say which dialect
 * a Markless file is written in. `.tsrx` is the authoring extension.
 */
function parserLangFor(filename: string): 'tsx' | 'jsx' | 'dts' | 'ts' | 'js' {
	const path = filename.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
	if (path.endsWith('.tsrx') || path.endsWith('.tsx')) return 'tsx';
	if (path.endsWith('.jsx')) return 'jsx';
	if (path.endsWith('.d.ts')) return 'dts';
	if (path.endsWith('.ts')) return 'ts';
	return 'js';
}

/**
 * Runs yuku's semantic analysis over a module and returns its tables: the
 * scopes, the bindings each scope declares, and every identifier use resolved
 * to the binding it refers to.
 *
 * This is a second pass over the source, not a by-product of `parseModule`, so
 * it roughly doubles parse cost for a file. Callers should read it only when
 * they need resolution that names alone cannot give them.
 */
export function analyzeModule(
	source: string,
	filename = 'module.tsrx',
	options: Omit<MarklessParseOptions, 'errors' | 'comments' | 'collect'> = {},
): SemanticView {
	const { loose = false, ...parserOptions } = options;
	const result = analyzeYukuSource(source, {
		...parserOptions,
		lang: parserOptions.lang ?? parserLangFor(filename),
		sourceType: 'module',
		loose,
	});
	return result.semantic;
}

const marklessAllowDirective = /^\/\/\s*markless-allow\s+[A-Z0-9_]+:\s*\S(?:.*\S)?$/;

/**
 * A `markless-allow` directive is authored as JSX text, so the child text it
 * sits in would otherwise render into the output. Overwrite it with spaces —
 * newlines kept — so the directive disappears from the rendered text without
 * moving any offset that later passes report against.
 */
function blankMarklessAllowDirective(node: BaseNode): void {
	if (node.type !== 'JSXText') return;
	const text = node as BaseNode & { value?: unknown };
	if (typeof text.value !== 'string') return;
	if (!marklessAllowDirective.test(text.value.trim())) return;
	text.value = text.value.replace(/[^\r\n]/g, ' ');
}

function toMarklessCompileError(
	diagnostic: Diagnostic,
	source: string,
	filename: string,
	type: MarklessCompileError['type'],
): MarklessCompileError {
	const { start, end } = authoredDiagnosticSpan(diagnostic, source);
	const error = new SyntaxError(diagnostic.message) as MarklessCompileError;
	error.code = undefined;
	error.pos = start;
	error.raisedAt = end;
	error.end = end;
	error.loc = sourceLocation(source, start, end);
	error.fileName = filename;
	error.type = type;
	return error;
}

function authoredDiagnosticSpan(
	diagnostic: Diagnostic,
	source: string,
): { start: number; end: number } {
	const start = Math.max(0, Math.min(source.length, diagnostic.start));
	const end = Math.max(start, Math.min(source.length, diagnostic.end));
	if (source.slice(start - 2, start) === '</') return { start: start - 2, end };

	const prefix = source.slice(0, start);
	const extraClosingAngle = prefix.match(/<\/[^<>\s]+>>\s*$/)?.[0].lastIndexOf('>');
	if (extraClosingAngle !== undefined) {
		return {
			start: prefix.length - (prefix.match(/<\/[^<>\s]+>>\s*$/)?.[0].length ?? 0) + extraClosingAngle,
			end,
		};
	}
	return { start, end };
}
