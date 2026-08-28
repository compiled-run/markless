/**
 * Type-stripping for the one emitted module that is still assembled as text.
 *
 * Every other emitted module is printed from an AST by `printEmittedModule`,
 * which prints under `strip: true`. The SSR module is not: `public-render`
 * builds it by splicing authored spans into a hand-written template, so a span
 * lifted verbatim carries whatever TypeScript the author wrote into a file that
 * is loaded as JavaScript (the dev SSR module runner serves it raw).
 *
 * The template is not reprinted — only the spliced spans are, and only when a
 * span actually carries TypeScript-only syntax. A span with none is returned
 * byte-for-byte, so no existing SSR fixture moves.
 *
 * Not a regex: a `as` inside a string or a template literal is text, and only a
 * parse can tell the two apart.
 */
import { generate } from 'yuku-codegen';
import { parseModule } from '../../js-ast.ts';
import { EMISSION_PARSE_OPTIONS, EMISSION_PRINT_OPTIONS } from '../emit-codegen.ts';
import type { AnyNode } from '../../ast/nodes.ts';

export const SSR_STRIP_FAILED_CODE = 'MARKLESS_SSR_STRIP_FAILED';

/** A span that cannot be reprinted as JavaScript, named by its construct. */
export class SsrStripError extends Error {
	readonly code = SSR_STRIP_FAILED_CODE;
	constructor(message: string) {
		super(message);
		this.name = 'SsrStripError';
	}
}

const EXPRESSION_NAME = 'marklessSsrSpan';
const EXPRESSION_PREFIX = `const ${EXPRESSION_NAME} = `;
const PATTERN_SUFFIX = ` = ${EXPRESSION_NAME};`;

/**
 * The node flags that spell TypeScript on a node type JavaScript also has.
 * Every purely type-level node already answers to the `TS` type-name prefix;
 * these are the ones carried as a field on an ordinary node instead.
 */
const TYPESCRIPT_FLAGS = [
	'declare',
	'abstract',
	'definite',
	'override',
	'accessibility',
] as const;

/** True when the tree contains syntax with no JavaScript spelling. */
function carriesTypeScript(node: unknown): boolean {
	if (!node || typeof node !== 'object') return false;
	if (Array.isArray(node)) return node.some((child) => carriesTypeScript(child));

	const record = node as Record<string, unknown>;
	const type = record.type;
	if (typeof type === 'string' && type.startsWith('TS')) return true;
	if (record.importKind === 'type' || record.exportKind === 'type') return true;
	if (TYPESCRIPT_FLAGS.some((flag) => record[flag])) return true;
	// `readonly` is TypeScript-only on a class member; an ordinary node never
	// carries the field at all.
	if (record.readonly === true) return true;
	if (Array.isArray(record.implements) && record.implements.length > 0) return true;

	for (const [key, value] of Object.entries(record)) {
		if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') continue;
		if (carriesTypeScript(value)) return true;
	}
	return false;
}

type StripSite = {
	/** The authored file, for the parse and for the message a refusal carries. */
	readonly filename: string;
	/** What is being stripped, named in a refusal: `a state initializer`. */
	readonly what: string;
};

function printStripped(wrapped: string, site: StripSite, span: string): string | null {
	const errors: Array<{ message: string }> = [];
	// `collect` keeps a parse failure a value rather than a throw: a span that
	// does not stand alone is answered with null, not an aborted compile.
	const program = parseModule(wrapped, site.filename, {
		...EMISSION_PARSE_OPTIONS,
		lang: 'ts',
		collect: true,
		errors: errors as never,
	});
	if (errors.length > 0) return null;
	if (!carriesTypeScript(program)) return null;

	const result = generate(program as never, EMISSION_PRINT_OPTIONS);
	if (result.errors.length > 0) {
		throw new SsrStripError(
			`Cannot emit the SSR module because ${site.what} uses TypeScript with no JavaScript form: ${result.errors
				.map((diagnostic) => diagnostic.message)
				.join('; ')}. Authored text: ${span.length > 120 ? `${span.slice(0, 120)}…` : span}`,
		);
	}
	return result.code;
}

/**
 * Strip an authored expression span. Printed in initializer position, never as
 * an expression statement: at statement start an object literal, a function
 * expression and a string literal all need parentheses the author did not write.
 */
export function stripAuthoredExpression(span: string, site: StripSite): string {
	const trimmed = span.trim();
	if (trimmed === '') return span;

	// Parenthesised so a comma expression stays one initializer rather than
	// splitting into two declarators. `preserveParens: false` drops the node
	// again, and the printer re-derives whatever parentheses the text needs.
	const printed = printStripped(`${EXPRESSION_PREFIX}(${trimmed}\n);`, site, trimmed);
	if (printed === null) return span;
	if (!printed.startsWith(EXPRESSION_PREFIX) || !printed.endsWith(';')) {
		throw new SsrStripError(
			`Cannot emit the SSR module because ${site.what} did not reprint in place: ${printed}`,
		);
	}
	return printed.slice(EXPRESSION_PREFIX.length, -1);
}

const BODY_PREFIX = `function ${EXPRESSION_NAME}() {\n`;
const BODY_SUFFIX = '\n}';

/**
 * Strip an authored statement span: one or more whole statements.
 *
 * A component body's statements are lifted mid-function, so a guard `return`
 * among them is not a valid program on its own. Such a span is re-tried inside a
 * function body, which is the scope it was authored in.
 */
export function stripAuthoredStatements(span: string, site: StripSite): string {
	const trimmed = span.trim();
	if (trimmed === '') return span;

	const printed = printStripped(trimmed, site, trimmed);
	if (printed !== null) return printed.replace(/\n+$/, '');

	const inBody = printStripped(`${BODY_PREFIX}${trimmed}${BODY_SUFFIX}`, site, trimmed);
	if (inBody === null) return span;
	const opened = inBody.indexOf('{');
	if (!inBody.startsWith(`function ${EXPRESSION_NAME}(`) || opened === -1 || !inBody.endsWith('}'))
		throw new SsrStripError(
			`Cannot emit the SSR module because ${site.what} did not reprint in place: ${inBody}`,
		);
	return inBody
		.slice(opened + 1, -1)
		.replace(/^\n+|\n+$/g, '')
		.split('\n')
		.map((line) => (line.startsWith('  ') ? line.slice(2) : line))
		.join('\n');
}

/**
 * Strip an authored binding pattern (`{ cap = WIDTH as Limit }`), printed in
 * declaration position so the pattern is the only thing the printer renders.
 */
export function stripAuthoredPattern(span: string, site: StripSite): string {
	const trimmed = span.trim();
	if (trimmed === '') return span;

	const printed = printStripped(`const ${trimmed}${PATTERN_SUFFIX}`, site, trimmed);
	if (printed === null) return span;
	if (!printed.startsWith('const ') || !printed.endsWith(PATTERN_SUFFIX)) {
		throw new SsrStripError(
			`Cannot emit the SSR module because ${site.what} did not reprint in place: ${printed}`,
		);
	}
	return printed.slice('const '.length, -PATTERN_SUFFIX.length);
}

/** The authored text of a node, stripped of TypeScript, for an expression span. */
export function strippedExpressionSource(
	node: AnyNode | undefined,
	source: string,
	site: StripSite,
): string {
	if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') return '';
	return stripAuthoredExpression(source.slice(node.start, node.end).trim(), site);
}
