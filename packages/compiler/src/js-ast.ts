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

const PARSE_CACHE_LIMIT = 256;

/**
 * The same `(filename, source)` gets the same tree back rather than a re-parse:
 * vite asks for a module under `?markless-symbols` and under its plain id, and a
 * barrel walk re-reaches every dependency. Sound only while every pass on this
 * path treats the tree as read-only; the freeze mode below is what proves that.
 */
const parseCache = new Map<string, Program>();
let parseCacheHits = 0;
let parseCacheMisses = 0;
let freezeParsedTrees = false;

export type ParseCacheStats = {
	readonly hits: number;
	readonly misses: number;
	readonly size: number;
};

export function parseCacheStats(): ParseCacheStats {
	return { hits: parseCacheHits, misses: parseCacheMisses, size: parseCache.size };
}

export function resetParseCache(): void {
	parseCache.clear();
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

function parseModuleWith(
	source: string,
	filename: string,
	options: MarklessParseOptions,
	cacheable: boolean,
): Program {
	const cacheKey = cacheable ? `${filename}\u0000${source}` : null;
	if (cacheKey !== null) {
		const cached = parseCache.get(cacheKey);
		if (cached !== undefined) {
			parseCache.delete(cacheKey);
			parseCache.set(cacheKey, cached);
			parseCacheHits += 1;
			return cached;
		}
		parseCacheMisses += 1;
	}
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
	const normalized = normalizeProgram(program, {
		onNode: (node) => {
			blankMarklessAllowDirective(node);
			dropCommentContainers(node);
		},
	});
	if (cacheKey === null) return normalized;
	const shared = freezeParsedTrees ? deepFreeze(normalized) : normalized;
	parseCache.set(cacheKey, shared);
	if (parseCache.size > PARSE_CACHE_LIMIT) {
		const oldest = parseCache.keys().next();
		if (!oldest.done) parseCache.delete(oldest.value);
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

/**
 * `{/* … *\/}` is a comment, not a child. The parser reports it as a
 * `JSXExpressionContainer` wrapping a `JSXEmptyExpression`, and every collector
 * that walks children would otherwise read it as a dynamic child and carry the
 * comment text through as an authored expression — emitted as `return (/* … *\/)`,
 * an empty parenthesized expression that fails to parse. Removing it from its
 * parent's children is the JSX-standard lowering, and doing it once here spares
 * every downstream pass from having to know the shape.
 *
 * Only the array entry goes; no other node's offsets move, so spans and source
 * mapping stay exactly where the author wrote them.
 */
function dropCommentContainers(node: BaseNode): void {
	const children = (node as BaseNode & { children?: unknown }).children;
	if (!Array.isArray(children)) return;
	for (let index = children.length - 1; index >= 0; index -= 1) {
		if (isCommentContainer(children[index])) children.splice(index, 1);
	}
}

function isCommentContainer(node: unknown): boolean {
	if (!node || typeof node !== 'object') return false;
	const candidate = node as {
		type?: unknown;
		expression?: { type?: unknown } | null;
	};
	if (candidate.type !== 'JSXExpressionContainer' && candidate.type !== 'TSRXExpression') {
		return false;
	}
	return candidate.expression?.type === 'JSXEmptyExpression';
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

// Never cached: its callers rewrite the tree they get back.
export function parseJavaScriptModule(
	source: string,
	filename = 'generated.js',
): JavaScriptAstNode {
	return parseModuleWith(source, filename, {}, false) as unknown as JavaScriptAstNode;
}
