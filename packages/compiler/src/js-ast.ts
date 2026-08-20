import {
	duplicateBindingDiagnostics,
	normalizeProgram,
	parseModule as parseYukuModule,
	sourceLocation,
	type BaseNode,
	type Comment,
	type Diagnostic,
	type ParseModuleOptions,
	type Program,
} from 'yuku-tsrx';

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

/**
 * Markless reports parse failures as `SyntaxError`s carrying the offsets, the
 * `loc`, and the filename a caller needs to place the failure, plus a `type`
 * separating a module that cannot be compiled at all (`fatal`) from one whose
 * authoring mistake is recoverable (`usage`). The spans come from yuku-tsrx as
 * given: `parseModule` there already re-anchors the malformed-markup shapes
 * onto the markup the author wrote.
 */
function toMarklessCompileError(
	diagnostic: Diagnostic,
	source: string,
	filename: string,
	type: MarklessCompileError['type'],
): MarklessCompileError {
	const { start, end } = diagnostic;
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

export type JavaScriptAstNode = {
	readonly type?: string;
	readonly start?: number;
	readonly end?: number;
	readonly [key: string]: unknown;
};

export function parseJavaScriptModule(
	source: string,
	filename = 'generated.js',
): JavaScriptAstNode {
	return parseModule(source, filename) as unknown as JavaScriptAstNode;
}
