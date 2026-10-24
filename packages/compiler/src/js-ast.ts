import { parse } from '@tsrx/yuku';

type ParseResult = ReturnType<typeof parse>;
export type Program = ParseResult['program'];
export type Comment = ParseResult['comments'][number];
export type Diagnostic = ParseResult['diagnostics'][number];
export type BaseNode = { type: string; start: number; end: number };

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

export type MarklessParseOptions = {
	/** The language to read, instead of the one the filename implies. */
	lang?: 'tsrx' | 'js' | 'jsx' | 'ts' | 'tsx' | 'd.ts';
	preserveParens?: boolean;
	attachComments?: boolean;
	/** Keep a fatal parse error a value in `errors` rather than a throw. */
	collect?: boolean;
	loose?: boolean;
	errors?: MarklessCompileError[];
	comments?: MarklessParserComment[];
};

const PARSE_CACHE_LIMIT = 256;

/**
 * The same `(filename, source)` gets the same tree back rather than a re-parse:
 * vite asks for a module under `?markless-symbols` and under its plain id, and a
 * barrel walk re-reaches every dependency. Sound only while every pass on this
 * path treats the tree as read-only; the freeze mode below is what proves that.
 */
// Keyed by the source string itself, whose hash the engine keeps on it; a joined key was rebuilt and rehashed per call.
const parseCache = new Map<string, Map<string, Program>>();
let parseCacheSize = 0;
let parseCacheHits = 0;
let parseCacheMisses = 0;
let freezeParsedTrees = false;

export type ParseCacheStats = {
	readonly hits: number;
	readonly misses: number;
	readonly size: number;
};

export function parseCacheStats(): ParseCacheStats {
	return { hits: parseCacheHits, misses: parseCacheMisses, size: parseCacheSize };
}

export function resetParseCache(): void {
	parseCache.clear();
	parseCacheSize = 0;
	parseCacheHits = 0;
	parseCacheMisses = 0;
}

/** Test-only. Deep-freezes every shared tree, so a pass that mutates one throws here instead of leaking into the next compile of the same source. */
export function setParseTreeFreezing(enabled: boolean): void {
	freezeParsedTrees = enabled;
	resetParseCache();
}

export function parseModule(
	source: string,
	filename = 'module.tsrx',
	options: MarklessParseOptions = {},
): Program {
	return parseModuleWith(source, filename, options, Object.keys(options).length === 0);
}

// The language a filename implies; a name with no standard extension, such as a virtual id, is JavaScript.
function languageOf(filename: string): NonNullable<MarklessParseOptions['lang']> {
	const path = filename.split(/[?#]/, 1)[0]!.toLowerCase();
	if (path.endsWith('.tsrx') || path.endsWith('.tsx')) return 'tsrx';
	if (path.endsWith('.jsx')) return 'jsx';
	if (path.endsWith('.d.ts')) return 'd.ts';
	if (path.endsWith('.ts')) return 'ts';
	return 'js';
}

// A mismatched closing tag is reported on its name; the author wrote the tag from its `</`.
function authoredSpan(diagnostic: Diagnostic, source: string): Diagnostic {
	const { start } = diagnostic;
	if (!diagnostic.message.startsWith('Expected closing tag') || source.slice(start - 2, start) !== '</')
		return diagnostic;
	return { ...diagnostic, start: start - 2 };
}

/** The parser options that read `filename`'s language, for a parse or an analysis of it. */
export function parserLanguageFor(filename: string): { readonly path?: string } {
	return languageOptions(languageOf(filename));
}

// Without a path the parser reads TSRX, which is TSX with the TSRX syntax; a standard extension selects that language.
function languageOptions(lang: NonNullable<MarklessParseOptions['lang']>): { readonly path?: string } {
	return lang === 'tsrx' || lang === 'tsx' ? {} : { path: `module.${lang}` };
}

// Redeclarations come from the parser's scope pass and leave a usable tree, so they are usage errors, not fatal ones.
const REDECLARATION = /has already been declared$/;

function parseModuleWith(
	source: string,
	filename: string,
	options: MarklessParseOptions,
	cacheable: boolean,
): Program {
	if (cacheable) {
		const byFile = parseCache.get(source);
		const cached = byFile?.get(filename);
		if (cached !== undefined) {
			parseCache.delete(source);
			parseCache.set(source, byFile!);
			parseCacheHits += 1;
			return cached;
		}
		parseCacheMisses += 1;
	}
	const {
		errors,
		comments: outputComments,
		collect = false,
		loose = false,
		lang = languageOf(filename),
		preserveParens = true,
		attachComments = outputComments !== undefined,
	} = options;
	const result = parse(source, {
		...languageOptions(lang),
		preserveParens,
		attachComments,
		// Scope checking costs as much as the parse itself, so it runs only for a caller that collects errors.
		semanticErrors: errors !== undefined,
	});
	const program = result.program;
	let lines: number[] | undefined;
	const locate = (start: number, end: number): MarklessSourceLocation =>
		sourceLocation((lines ??= lineStarts(source)), source.length, start, end);
	const compileErrors = result.diagnostics
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) =>
			toMarklessCompileError(
				authoredSpan(diagnostic, source),
				locate,
				filename,
				REDECLARATION.test(diagnostic.message) ? 'usage' : 'fatal',
			),
		);
	errors?.push(...compileErrors);
	if (outputComments) {
		for (const comment of result.comments) {
			outputComments.push({ ...comment, loc: locate(comment.start, comment.end) });
		}
	}
	if (!collect && !loose) {
		const fatal = compileErrors.find((error) => error.type === 'fatal');
		if (fatal) throw fatal;
	}
	settleTemplateShapes(program, source, result.comments);
	if (!cacheable) return program;
	const shared = freezeParsedTrees ? deepFreeze(program) : program;
	const byFile = parseCache.get(source) ?? new Map<string, Program>();
	parseCache.delete(source);
	parseCache.set(source, byFile);
	byFile.set(filename, shared);
	parseCacheSize += 1;
	while (parseCacheSize > PARSE_CACHE_LIMIT) {
		const [oldestSource, oldest] = parseCache.entries().next().value!;
		parseCacheSize -= oldest.size;
		parseCache.delete(oldestSource);
	}
	return shared;
}

// Data properties only: reading an accessor would run it, and a lazily
// memoising one would then fail against the object just frozen.
function deepFreeze<T>(root: T): T {
	const seen = new Set<object>();
	const pending: unknown[] = [root];
	while (pending.length > 0) {
		const value = pending.pop();
		if (!value || typeof value !== 'object') continue;
		if (seen.has(value)) continue;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const entry of value) pending.push(entry);
		} else {
			for (const key of Object.getOwnPropertyNames(value)) {
				const descriptor = Object.getOwnPropertyDescriptor(value, key);
				if (descriptor && 'value' in descriptor) pending.push(descriptor.value);
			}
		}
		Object.freeze(value);
	}
	return root;
}

type SpanNode = { type?: unknown; start?: unknown; end?: unknown; [key: string]: unknown };

/**
 * Three spots where the compiler reads TSRX in the shape it was written against, settled once
 * here by visiting only the nodes on the path to each spot, never the whole tree:
 * a `{/* … *\/}` or `//` comment among JSX children is a comment, not a child; an `@else if`
 * is the same construct as the `@if` it continues; and an `@case` body is its template's
 * nodes. No node's offsets move.
 */
function settleTemplateShapes(program: Program, source: string, comments: readonly Comment[]): void {
	const elseIfStarts = new Set<number>();
	const switchStarts = new Set<number>();
	const targets: number[] = [];
	for (const comment of comments) {
		targets.push(comment.start);
	}
	for (const match of source.matchAll(/@else\s+if\b/g)) {
		const keyword = match.index + match[0].length - 2;
		elseIfStarts.add(match.index).add(keyword);
		targets.push(keyword);
	}
	// An empty `{}` among children is dropped like a comment; extra targets only widen the descent.
	for (const match of source.matchAll(/\{\s*\}/g)) targets.push(match.index);
	for (const match of source.matchAll(/@switch\b/g)) {
		switchStarts.add(match.index);
		targets.push(match.index);
	}
	if (targets.length === 0) return;
	targets.sort((left, right) => left - right);

	const settle = (node: SpanNode): void => {
		const children = node.children;
		if (Array.isArray(children)) {
			for (let index = children.length - 1; index >= 0; index -= 1) {
				const child = children[index] as SpanNode | undefined;
				const expression = child?.expression as SpanNode | null | undefined;
				if (child?.type === 'JSXExpressionContainer' && expression?.type === 'JSXEmptyExpression')
					children.splice(index, 1);
			}
		}
		if (node.type === 'IfStatement' && elseIfStarts.has(node.start as number)) {
			node.type = 'JSXIfExpression';
		}
		if (node.type === 'JSXSwitchExpression' && switchStarts.has(node.start as number)) {
			for (const switchCase of node.cases as SpanNode[]) {
				const [block, ...rest] = switchCase.consequent as SpanNode[];
				if (block?.type === 'BlockStatement' && rest.length === 0) switchCase.consequent = block.body;
			}
		}
	};
	const visit = (node: SpanNode, from: number, to: number): void => {
		settle(node);
		for (const key in node) {
			const value = node[key];
			if (!value || typeof value !== 'object') continue;
			if (Array.isArray(value)) {
				for (const item of value) descend(item as SpanNode, from, to);
			} else {
				descend(value as SpanNode, from, to);
			}
		}
	};
	const descend = (node: SpanNode, from: number, to: number): void => {
		if (!node || typeof node.type !== 'string' || typeof node.start !== 'number') return;
		const start = node.start;
		const end = node.end as number;
		let first = from;
		while (first < to && targets[first]! < start) first += 1;
		let last = first;
		while (last < to && targets[last]! < end) last += 1;
		if (first < last) visit(node, first, last);
	};
	visit(program as unknown as SpanNode, 0, targets.length);
}

function lineStarts(source: string): number[] {
	const starts = [0];
	for (let index = source.indexOf('\n'); index !== -1; index = source.indexOf('\n', index + 1)) {
		starts.push(index + 1);
	}
	return starts;
}

function sourcePosition(lines: readonly number[], length: number, offset: number): MarklessSourcePosition {
	const at = Math.min(Math.max(offset, 0), length);
	let low = 0;
	let high = lines.length - 1;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (lines[middle]! <= at) low = middle;
		else high = middle - 1;
	}
	return { line: low + 1, column: at - lines[low]! };
}

function sourceLocation(
	lines: readonly number[],
	length: number,
	start: number,
	end: number,
): MarklessSourceLocation {
	return {
		start: sourcePosition(lines, length, start),
		end: sourcePosition(lines, length, end),
	};
}

/**
 * Markless reports parse failures as `SyntaxError`s carrying the offsets, the
 * `loc`, and the filename a caller needs to place the failure, plus a `type`
 * separating a module that cannot be compiled at all (`fatal`) from one whose
 * authoring mistake is recoverable (`usage`).
 */
function toMarklessCompileError(
	diagnostic: Diagnostic,
	locate: (start: number, end: number) => MarklessSourceLocation,
	filename: string,
	type: MarklessCompileError['type'],
): MarklessCompileError {
	const { start, end } = diagnostic;
	const error = new SyntaxError(diagnostic.message) as MarklessCompileError;
	error.code = undefined;
	error.pos = start;
	error.raisedAt = end;
	error.end = end;
	error.loc = locate(start, end);
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

// Never cached: its callers rewrite the tree they get back.
export function parseJavaScriptModule(
	source: string,
	filename = 'generated.js',
): JavaScriptAstNode {
	return parseModuleWith(source, filename, {}, false) as unknown as JavaScriptAstNode;
}
