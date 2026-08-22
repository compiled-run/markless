/**
 * The emission foundation: the one module that owns how `packages/compiler`
 * turns an AST back into emitted source.
 *
 * `specs/framework/14-emission-codegen-migration.md` stage 1 requires "one
 * module owning printer options and the graph-call AST builders, so option
 * choices are stated once and asserted rather than spread across emitters".
 * This is that module. It is not a second emission path: emitters migrate to
 * it, they do not choose between it and the string scanners (invariant 9).
 *
 * Four things live here:
 *
 * - the parse and print options, stated once (invariant 8; unknown printer
 *   options are silently ignored upstream, so options cannot be validated by
 *   observing behavior and must be pinned in one place with a test asserting
 *   each one's observable consequence)
 * - the graph read/write call-node builders, replacing the hand-built call
 *   text in `symbol-modules.ts`
 * - the TSRX-node assertion (invariant 4), so a TSRX node reaching the printer
 *   is a named compiler diagnostic instead of an upstream crash
 * - the determinism helper (invariant 7), which every migrated site's test uses
 *
 * Evidence, re-run against the installed `yuku-codegen@0.9.0` while writing
 * this module and asserted in `test/emission-foundation.test.ts`:
 * `preserveParens: false` removes `ParenthesizedExpression` nodes and the
 * printer still derives correct parentheses; comments survive only when
 * `attachComments` is on at parse *and* `comments` is on at print; a source map
 * is emitted only when `sourceMap` carries a `source`; and the printer refuses
 * TSRX node types with `unsupported ESTree node type: JSXCodeBlock` on both the
 * normal and `strip: true` paths.
 */
import { generate, type GenerateOptions, type SourceMap } from 'yuku-codegen';
import type { CompilerDiagnostic } from '../diagnostics.ts';
import type { Program } from 'yuku-tsrx';
import { parseModule, type MarklessCompileError } from '../js-ast.ts';

/**
 * `yuku-codegen` types its input against `@yuku-toolchain/types`, which models
 * the same ESTree shapes as `yuku-tsrx` but is a separate declaration. The two
 * `Program` interfaces are structurally distinct (`hashbang`, and the body
 * element union), so the compiler's tree needs one cast to cross the boundary.
 * It is taken here, once, rather than at every print site.
 */
type CodegenProgram = Parameters<typeof generate>[0];

/** A node under construction. Emitters build these; the printer consumes them. */
export type EmissionNode = {
	readonly type: string;
	readonly [key: string]: unknown;
};

/**
 * Where an emission failure happened, so the diagnostic can name its phase and
 * pass. Emission spans several passes, so the site supplies these rather than
 * this module guessing one.
 */
export type EmissionSite = {
	readonly phase: CompilerDiagnostic['phase'];
	readonly passId: string;
	/** The authored file the emitted module was derived from. */
	readonly sourceFileName: string;
	readonly symbolId?: string;
};

export const EMISSION_TSRX_NODE_CODE = 'MARKLESS_EMIT_TSRX_NODE_UNSUPPORTED';
export const EMISSION_CODEGEN_FAILED_CODE = 'MARKLESS_EMIT_CODEGEN_FAILED';
export const EMISSION_SOURCE_MAP_MISSING_CODE = 'MARKLESS_EMIT_SOURCE_MAP_MISSING';
export const EMISSION_NONDETERMINISTIC_CODE = 'MARKLESS_EMIT_NONDETERMINISTIC';

/** An emission failure that carries the diagnostic the caller should report. */
export class EmissionDiagnosticError extends Error {
	readonly diagnostic: CompilerDiagnostic;

	constructor(diagnostic: CompilerDiagnostic) {
		super(diagnostic.message);
		this.name = 'EmissionDiagnosticError';
		this.diagnostic = diagnostic;
	}
}

/**
 * Parse options for source that is on its way to the printer.
 *
 * `preserveParens: false` drops `ParenthesizedExpression` nodes so the printer
 * derives parentheses from precedence — the capability that retires the
 * hand-maintained precedence table. `attachComments: true` is half of the
 * comment contract; `comments` in the print options is the other half, and a
 * comment survives only when both are set.
 */
export const EMISSION_PARSE_OPTIONS = Object.freeze({
	preserveParens: false,
	attachComments: true,
} as const);

/**
 * Print options for every emitted module.
 *
 * - `format: 'pretty'` — emitted modules are read by humans in diffs and by
 *   source-map consumers; `compact` collapses the whole module onto one line.
 * - `indent: 2` — spaces per level. The printer has no tab mode, so emitted
 *   indentation differs from the tab-indented text the string scanners produce.
 * - `quotes: 'preserve'` — the maximum-parity choice. A literal parsed from
 *   authored source keeps its authored quote, matching what splicing did; a
 *   synthesized literal has no `raw` and prints double-quoted, matching what
 *   `JSON.stringify` produced for graph ids and paths.
 * - `comments: 'all'` — the printer's default is `'some'`, which drops line
 *   comments. Emission must not silently delete an authored comment.
 * - `strip: false` — the string scanners copied authored TypeScript through
 *   verbatim, so leaving annotations in place is the behavior-preserving
 *   choice. Whether stage 1 should strip types is not settled by the spec.
 * - `minify: false` — stated so an upstream default change cannot minify
 *   emitted modules without this line changing.
 */
export const EMISSION_PRINT_OPTIONS = Object.freeze({
	format: 'pretty',
	indent: 2,
	quotes: 'preserve',
	comments: 'all',
	strip: false,
	minify: false,
} as const) satisfies GenerateOptions;

/**
 * The TSRX-exclusive node types, as `specs/framework/14-...` enumerates them
 * from the TSRX specification. Stage 1's premise is that extracted symbol
 * sources are TSRX-free plain TypeScript by the time they are emitted;
 * invariant 4 requires that premise be asserted rather than assumed.
 *
 * Plain JSX (`JSXElement`, `JSXExpressionContainer`, ...) is deliberately not
 * in this set: `yuku-codegen@0.9.0` prints those without error, so refusing
 * them would be a false positive. `TSModuleDeclaration` and `TSModuleBlock`
 * also print without error today; they are kept because the specification
 * enumerates them, and no stage-1 extracted symbol contains a namespace.
 */
export const TSRX_ONLY_NODE_TYPES: ReadonlySet<string> = new Set([
	'JSXCodeBlock',
	'JSXStyleElement',
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
	'TSModuleDeclaration',
	'TSModuleBlock',
]);

/**
 * Keys that are not tree structure. `parent` would cycle, and the location and
 * comment side tables are not nodes the printer walks.
 *
 * This walk deliberately does not reuse `ast/nodes.ts#childNodes`, which skips
 * `id`, `openingElement`, and `closingElement`. A safety assertion must not
 * inherit another walker's blind spots.
 */
const NON_STRUCTURE_KEYS: ReadonlySet<string> = new Set([
	'parent',
	'loc',
	'range',
	'leadingComments',
	'trailingComments',
	'comments',
]);

/** The first TSRX-only node type in the tree, or `null` when there is none. */
export function findTsrxOnlyNodeType(root: unknown): string | null {
	const seen = new Set<object>();
	const stack: unknown[] = [root];

	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== 'object') continue;
		if (seen.has(value)) continue;
		seen.add(value);

		if (Array.isArray(value)) {
			for (const item of value) stack.push(item);
			continue;
		}

		const type = (value as { type?: unknown }).type;
		if (typeof type === 'string' && TSRX_ONLY_NODE_TYPES.has(type)) return type;

		for (const [key, child] of Object.entries(value)) {
			if (NON_STRUCTURE_KEYS.has(key)) continue;
			stack.push(child);
		}
	}

	return null;
}

/**
 * Invariant 4. Without this, a TSRX node reaching the printer surfaces as a
 * thrown upstream error (`unsupported ESTree node type: JSXCodeBlock`) — a
 * crash rather than a diagnostic.
 */
export function assertTsrxFreeForEmission(root: unknown, site: EmissionSite): void {
	const nodeType = findTsrxOnlyNodeType(root);
	if (!nodeType) return;

	throw new EmissionDiagnosticError(
		emissionDiagnostic(EMISSION_TSRX_NODE_CODE, site, {
			title: 'This symbol still contains TSRX syntax at emission',
			message: `Cannot emit${symbolLabel(site)} because the tree reaching the printer contains a TSRX-only node (${nodeType}).`,
			why: 'Stage 1 emission prints through yuku-codegen, which supports ESTree and TypeScript nodes only. TSRX syntax must be lowered by extraction before emission; without this check the printer throws "unsupported ESTree node type" and the failure surfaces as a crash instead of a diagnostic.',
			suggestions: [
				{
					message:
						'Check the extraction that produced this tree: a TSRX template node reached emission instead of being lowered to render data.',
				},
			],
		}),
	);
}

export type EmittedModule = {
	readonly code: string;
	/** Non-null by construction: invariant 3 treats an absent map as a failure. */
	readonly map: SourceMap;
};

export type EmissionPrintInput = {
	/** The tree to print. */
	readonly program: Program | EmissionNode;
	/**
	 * The authored source the tree came from. Required: the printer returns a
	 * null map when `sourceMap` is passed without a `source`.
	 */
	readonly source: string;
	/** The name of the emitted module, embedded as the map's `file`. */
	readonly outputFileName: string;
	readonly site: EmissionSite;
};

/**
 * Print an emitted module: assert TSRX-free, print with the owned options, and
 * require a non-null source map (invariant 3).
 */
export function printEmittedModule(input: EmissionPrintInput): EmittedModule {
	assertTsrxFreeForEmission(input.program, input.site);

	const options: GenerateOptions = {
		...EMISSION_PRINT_OPTIONS,
		sourceMap: {
			source: input.source,
			file: input.outputFileName,
			sourceFileName: input.site.sourceFileName,
			sourcesContent: input.source,
		},
	};

	let result;
	try {
		result = generate(input.program as unknown as CodegenProgram, options);
	} catch (error) {
		throw new EmissionDiagnosticError(
			emissionDiagnostic(EMISSION_CODEGEN_FAILED_CODE, input.site, {
				title: 'The emitted module could not be printed',
				message: `Cannot emit${symbolLabel(input.site)} because the printer rejected the tree: ${error instanceof Error ? error.message : String(error)}`,
				why: 'The printer only accepts node shapes it knows. A rejected tree means emission built a node the printer cannot render, which would otherwise abort the compile with no diagnostic.',
				suggestions: [
					{
						message:
							'Compare the node this emitter builds against the shapes the emission foundation tests cover.',
					},
				],
			}),
		);
	}

	if (result.errors.length > 0) {
		throw new EmissionDiagnosticError(
			emissionDiagnostic(EMISSION_CODEGEN_FAILED_CODE, input.site, {
				title: 'The emitted module could not be printed cleanly',
				message: `Cannot emit${symbolLabel(input.site)} because the printer reported ${result.errors.length} problem(s): ${result.errors.map((diagnostic) => diagnostic.message).join('; ')}`,
				why: 'The printer reports constructs it elided rather than rendered. Emitting the result anyway would ship a module missing the elided code.',
				suggestions: [
					{
						message:
							'Check the reported construct: emission built a node with no JavaScript equivalent under the current print options.',
					},
				],
			}),
		);
	}

	if (!result.map) {
		throw new EmissionDiagnosticError(
			emissionDiagnostic(EMISSION_SOURCE_MAP_MISSING_CODE, input.site, {
				title: 'The emitted module carries no source map',
				message: `Cannot emit${symbolLabel(input.site)} because the printer returned a null source map.`,
				why: 'Every extracted symbol module carries a source map from day one. The printer returns a null map when the source text is missing, so a null map means the print site did not thread the authored source through.',
				suggestions: [{ message: 'Pass the authored source text to printEmittedModule.' }],
			}),
		);
	}

	return { code: result.code, map: result.map };
}

const EXPRESSION_WRAPPER_NAME = 'marklessEmittedExpression';
const EXPRESSION_WRAPPER_PREFIX = `const ${EXPRESSION_WRAPPER_NAME} = `;

/**
 * Print a single expression, for tests and for call-text comparisons.
 *
 * The expression is printed in an initializer position, not as an expression
 * statement: at statement start the printer must parenthesize a string literal
 * (it would otherwise be a directive), an object literal, and a function
 * expression, which would report those forms' call text wrongly.
 */
export function printEmissionExpression(node: EmissionNode): string {
	const program: EmissionNode = {
		type: 'Program',
		sourceType: 'module',
		body: [
			{
				type: 'VariableDeclaration',
				kind: 'const',
				declarations: [
					{
						type: 'VariableDeclarator',
						id: identifierNode(EXPRESSION_WRAPPER_NAME),
						init: node,
					},
				],
			},
		],
	};
	const result = generate(program as unknown as CodegenProgram, EMISSION_PRINT_OPTIONS);
	if (result.errors.length > 0) {
		throw new Error(
			`emission: printing an expression reported ${result.errors.length} problem(s): ${result.errors.map((diagnostic) => diagnostic.message).join('; ')}`,
		);
	}
	if (!result.code.startsWith(EXPRESSION_WRAPPER_PREFIX) || !result.code.endsWith(';')) {
		throw new Error(`emission: unexpected expression wrapper output: ${result.code}`);
	}
	return result.code.slice(EXPRESSION_WRAPPER_PREFIX.length, -1);
}

/**
 * Parse source that is destined for the printer, under the owned options.
 *
 * `lang` is explicit because language inference from a path is unreliable —
 * `specs/framework/14-...` records the analyzer inferring `lang: "js"` from a
 * `.tsrx` path. A stage-1 emitter reuses an authored `.tsrx` filename for the
 * source map while the text it parses is already plain TypeScript, so it passes
 * `lang: 'ts'` rather than letting the extension decide.
 */
export function parseEmissionSource(
	source: string,
	filename: string,
	lang?: 'js' | 'ts' | 'tsx',
): { readonly program: Program; readonly errors: ReadonlyArray<MarklessCompileError> } {
	const errors: MarklessCompileError[] = [];
	const program = parseModule(source, filename, {
		...EMISSION_PARSE_OPTIONS,
		...(lang ? { lang } : {}),
		errors,
	});
	return { program, errors };
}

/**
 * Invariant 7. No recorded probe establishes printer determinism, so every
 * migrated site proves it: print the tree twice and require identical bytes,
 * then reparse the emitted source and reprint it and require a fixpoint.
 *
 * Returns the emitted module, so a caller can assert on it afterwards.
 */
export function assertDeterministicEmission(input: EmissionPrintInput): EmittedModule {
	const first = printEmittedModule(input);
	const second = printEmittedModule(input);

	if (first.code !== second.code) {
		throw new EmissionDiagnosticError(
			nondeterminismDiagnostic(
				input.site,
				'printing the same tree twice produced different code',
			),
		);
	}
	if (first.map.mappings !== second.map.mappings) {
		throw new EmissionDiagnosticError(
			nondeterminismDiagnostic(
				input.site,
				'printing the same tree twice produced different source-map mappings',
			),
		);
	}

	// The emitted module is plain TypeScript by stage 1's premise, and the TSRX
	// assertion above has already ruled out the alternative.
	const reparsed = parseModule(first.code, input.outputFileName, {
		...EMISSION_PARSE_OPTIONS,
		lang: 'ts',
		errors: [],
	});
	const reprinted = printEmittedModule({
		...input,
		program: reparsed,
		source: first.code,
	});

	if (reprinted.code !== first.code) {
		throw new EmissionDiagnosticError(
			nondeterminismDiagnostic(
				input.site,
				'reparsing and reprinting the emitted source was not a fixpoint',
			),
		);
	}

	return first;
}

// ---------------------------------------------------------------------------
// Node builders
//
// Small constructors, then the graph call shapes `symbol-modules.ts` emits as
// text today. The call text these print is asserted against the current text in
// `test/emission-foundation.test.ts`.
// ---------------------------------------------------------------------------

export function identifierNode(name: string): EmissionNode {
	return { type: 'Identifier', name };
}

/** A literal with no `raw`, so the printer's `quotes` option governs it. */
export function literalNode(value: string | number | boolean | null): EmissionNode {
	return { type: 'Literal', value };
}

export function stringArrayNode(values: ReadonlyArray<string>): EmissionNode {
	return { type: 'ArrayExpression', elements: values.map((value) => literalNode(value)) };
}

export function arrayNode(elements: ReadonlyArray<EmissionNode>): EmissionNode {
	return { type: 'ArrayExpression', elements: [...elements] };
}

/** `a.b.c` from `'a.b.c'`. Dotted names only; emission builds no computed access. */
export function memberChainNode(dottedName: string): EmissionNode {
	const [head, ...rest] = dottedName.split('.');
	if (!head) throw new Error(`emission: memberChainNode requires a name, got ${dottedName}`);

	let node: EmissionNode = identifierNode(head);
	for (const property of rest) {
		node = {
			type: 'MemberExpression',
			object: node,
			property: identifierNode(property),
			computed: false,
			optional: false,
		};
	}
	return node;
}

/**
 * `<object>.<property>` where the object is already a node.
 *
 * `memberChainNode` starts from a name, so it cannot reach a property of a call
 * or a `new` expression. The behavior emitter needs exactly that, for
 * `new Array(n).fill(undefined)`.
 */
export function memberNode(object: EmissionNode, property: string): EmissionNode {
	return {
		type: 'MemberExpression',
		object,
		property: identifierNode(property),
		computed: false,
		optional: false,
	};
}

/** `new <callee>(<args>)`. */
export function newNode(
	callee: EmissionNode,
	callArguments: ReadonlyArray<EmissionNode>,
): EmissionNode {
	return { type: 'NewExpression', callee, arguments: [...callArguments] };
}

/**
 * `<left> <operator> <right>` for the short-circuiting operators.
 *
 * The behavior emitter builds `??`; the printer derives the parentheses that
 * mixing `??` with `&&`/`||` requires, which is the capability that retires the
 * hand-maintained precedence table.
 */
export function logicalNode(
	operator: '??' | '&&' | '||',
	left: EmissionNode,
	right: EmissionNode,
): EmissionNode {
	return { type: 'LogicalExpression', operator, left, right };
}

/** `...<argument>`, in a call-argument or array-element position. */
export function spreadNode(argument: EmissionNode): EmissionNode {
	return { type: 'SpreadElement', argument };
}

/**
 * `<operator><argument>` — the prefix operators emission builds, which today is
 * only `!` in front of a call.
 */
export function unaryNode(operator: '!' | '-' | 'typeof', argument: EmissionNode): EmissionNode {
	return { type: 'UnaryExpression', operator, prefix: true, argument };
}

/**
 * `<object>[<property>]`, where the property is an expression rather than a
 * name.
 *
 * `memberNode` and `memberChainNode` both build the non-computed form, which
 * cannot index by a variable. The arm emitters need exactly that, for
 * `marklessBranchArms[arm]` and `value[key]`.
 */
export function computedMemberNode(object: EmissionNode, property: EmissionNode): EmissionNode {
	return {
		type: 'MemberExpression',
		object,
		property,
		computed: true,
		optional: false,
	};
}

/**
 * `(<params>) => <expression>` — the concise-body arrow.
 *
 * Only the expression body is built here. Emission has no arrow with a block
 * body: a site that needs statements builds a `FunctionExpression` through
 * `methodPropertyNode` instead.
 */
export function arrowFunctionNode(
	parameterNames: ReadonlyArray<string>,
	body: EmissionNode,
): EmissionNode {
	return {
		type: 'ArrowFunctionExpression',
		id: null,
		async: false,
		generator: false,
		expression: true,
		params: parameterNames.map((name) => identifierNode(name)),
		body,
	};
}

export function callNode(
	callee: EmissionNode,
	callArguments: ReadonlyArray<EmissionNode>,
): EmissionNode {
	return {
		type: 'CallExpression',
		callee,
		arguments: [...callArguments],
		optional: false,
	};
}

/** `<test> ? <consequent> : <alternate>`. */
export function conditionalNode(
	test: EmissionNode,
	consequent: EmissionNode,
	alternate: EmissionNode,
): EmissionNode {
	return { type: 'ConditionalExpression', test, consequent, alternate };
}

/**
 * `<left> <operator> <right>` for a non-short-circuiting operator.
 *
 * No parentheses are built here and none are needed: `preserveParens: false`
 * means the printer derives them from precedence, which is the capability that
 * retires the hand-maintained precedence table.
 */
export function binaryNode(
	operator: string,
	left: EmissionNode,
	right: EmissionNode,
): EmissionNode {
	return { type: 'BinaryExpression', operator, left, right };
}

/**
 * `<object>?.<property>`, wrapped in the `ChainExpression` ESTree requires
 * around an optional member access. The wrapper is the whole chain, so this
 * builds the outermost link; a longer chain nests its non-optional links inside
 * `object` with `memberChainNode`.
 */
export function optionalMemberNode(object: EmissionNode, property: string): EmissionNode {
	return {
		type: 'ChainExpression',
		expression: {
			type: 'MemberExpression',
			object,
			property: identifierNode(property),
			computed: false,
			optional: true,
		},
	};
}

/**
 * Attach a leading block comment to a statement.
 *
 * The printer takes comments from a node's own `comments` array, in the shape
 * the parser attaches — `leadingComments` is ignored, which was checked against
 * the installed `yuku-codegen@0.9.0` while writing this. `value` is the text
 * between the delimiters and excludes them: passing `" marker "` prints a block
 * comment whose body is `" marker "`, with the printer supplying `slash-star`
 * and `star-slash` itself.
 */
export function withLeadingBlockComment(node: EmissionNode, value: string): EmissionNode {
	return {
		...node,
		comments: [{ type: 'Block', position: 'before', sameLine: false, value }],
	};
}

/**
 * `<object>?.[<property>]` — the computed twin of `optionalMemberNode`, for a
 * key that is not identifier-shaped.
 */
export function optionalComputedMemberNode(
	object: EmissionNode,
	property: EmissionNode,
): EmissionNode {
	return {
		type: 'ChainExpression',
		expression: {
			type: 'MemberExpression',
			object,
			property,
			computed: true,
			optional: true,
		},
	};
}

export function propertyNode(key: string, value: EmissionNode): EmissionNode {
	return {
		type: 'Property',
		kind: 'init',
		method: false,
		shorthand: false,
		computed: false,
		key: identifierNode(key),
		value,
	};
}

/**
 * `"key": <value>` — a property whose key is a string literal rather than a
 * bare identifier.
 *
 * `propertyNode` builds the identifier form, which is only legal for
 * identifier-shaped names. Data tables emitted from `JSON.stringify` quote every
 * key, so `jsonValueNode` builds this form and never has to decide per key
 * whether a name is identifier-shaped.
 */
export function stringKeyPropertyNode(key: string, value: EmissionNode): EmissionNode {
	return {
		type: 'Property',
		kind: 'init',
		method: false,
		shorthand: false,
		computed: false,
		key: literalNode(key),
		value,
	};
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * A JSON-shaped data table as nodes: what `JSON.stringify` would have written,
 * built for the printer instead.
 *
 * The value is round-tripped through `JSON.stringify` and `JSON.parse` before
 * any node is built, so the tree reproduces `JSON.stringify`'s own coercions —
 * `undefined` object properties dropped, `undefined` array elements as `null`,
 * `NaN` and `Infinity` as `null` — rather than a second, subtly different set.
 * The arm emitters' text path writes these tables with `JSON.stringify`, so
 * matching its semantics exactly is what makes the two paths comparable.
 *
 * Strings are built without `raw`, so the printer's `quotes` option governs
 * them, which under `EMISSION_PRINT_OPTIONS` means double quotes — the quoting
 * `JSON.stringify` also produces.
 */
export function jsonValueNode(value: unknown): EmissionNode {
	const text = JSON.stringify(value);
	if (text === undefined) {
		throw new Error('emission: jsonValueNode requires a JSON-serializable value');
	}
	return jsonNode(JSON.parse(text) as JsonValue);
}

function jsonNode(value: JsonValue): EmissionNode {
	if (value === null) return literalNode(null);
	if (Array.isArray(value)) return arrayNode(value.map((item) => jsonNode(item)));
	if (typeof value === 'object') {
		return objectNode(
			Object.entries(value).map(([key, child]) => stringKeyPropertyNode(key, jsonNode(child))),
		);
	}
	return literalNode(value);
}

/**
 * A shorthand property: `{ read }` rather than `{ read: read }`.
 *
 * `shorthand: true` with `key` and `value` both naming the same identifier is
 * the shape the parser produces for authored shorthand, so the printer renders
 * it the same way whether the node was parsed or synthesized.
 */
export function shorthandPropertyNode(name: string): EmissionNode {
	return {
		type: 'Property',
		kind: 'init',
		method: false,
		shorthand: true,
		computed: false,
		key: identifierNode(name),
		value: identifierNode(name),
	};
}


/** A method-shorthand property: `update(value) { ... }`. */
export function methodPropertyNode(
	key: string,
	parameterNames: ReadonlyArray<string>,
	body: ReadonlyArray<EmissionNode>,
): EmissionNode {
	return {
		type: 'Property',
		kind: 'init',
		method: true,
		shorthand: false,
		computed: false,
		key: identifierNode(key),
		value: {
			type: 'FunctionExpression',
			id: null,
			async: false,
			generator: false,
			params: parameterNames.map((name) => identifierNode(name)),
			body: { type: 'BlockStatement', body: [...body] },
		},
	};
}

export function objectNode(properties: ReadonlyArray<EmissionNode>): EmissionNode {
	return { type: 'ObjectExpression', properties: [...properties] };
}

export function returnStatementNode(argument: EmissionNode): EmissionNode {
	return { type: 'ReturnStatement', argument };
}

/** `const <name> = <init>;` — the declaration kind most stage-1 emission builds. */
export function constDeclarationNode(name: string, init: EmissionNode): EmissionNode {
	return {
		type: 'VariableDeclaration',
		kind: 'const',
		declarations: [
			{ type: 'VariableDeclarator', id: identifierNode(name), init },
		],
	};
}

/**
 * `let <name> = <init>` — built only as a `for` initializer, where the loop
 * counter has to be reassignable.
 */
export function letDeclarationNode(name: string, init: EmissionNode): EmissionNode {
	return {
		type: 'VariableDeclaration',
		kind: 'let',
		declarations: [
			{ type: 'VariableDeclarator', id: identifierNode(name), init },
		],
	};
}

/** `<argument>++` / `<argument>--`, in the postfix position. */
export function postfixUpdateNode(operator: '++' | '--', argument: EmissionNode): EmissionNode {
	return { type: 'UpdateExpression', operator, prefix: false, argument };
}

/** `{ <body> }` — a statement block. */
export function blockStatementNode(body: ReadonlyArray<EmissionNode>): EmissionNode {
	return { type: 'BlockStatement', body: [...body] };
}

/**
 * `if (<test>) <consequent>` — no `else` arm.
 *
 * The consequent is a statement, not a list, because the emitted guards this
 * builds are single unbraced statements (`if (...) return index;`) and wrapping
 * them in a block would change the emitted bytes for no reason.
 */
export function ifStatementNode(test: EmissionNode, consequent: EmissionNode): EmissionNode {
	return { type: 'IfStatement', test, consequent, alternate: null };
}

/** `for (<init>; <test>; <update>) { <body> }` — the C-style counted loop. */
export function forStatementNode(
	init: EmissionNode,
	test: EmissionNode,
	update: EmissionNode,
	body: ReadonlyArray<EmissionNode>,
): EmissionNode {
	return { type: 'ForStatement', init, test, update, body: blockStatementNode(body) };
}

/** `function <name>(<params>) { <body> }`, as a declaration statement. */
export function functionDeclarationNode(
	name: string,
	parameterNames: ReadonlyArray<string>,
	body: ReadonlyArray<EmissionNode>,
): EmissionNode {
	return {
		type: 'FunctionDeclaration',
		id: identifierNode(name),
		async: false,
		generator: false,
		params: parameterNames.map((parameterName) => identifierNode(parameterName)),
		body: { type: 'BlockStatement', body: [...body] },
	};
}

/** `export <declaration>` — the named-export form with no specifier list. */
export function exportNamedDeclarationNode(declaration: EmissionNode): EmissionNode {
	return { type: 'ExportNamedDeclaration', specifiers: [], source: null, declaration };
}

export type ModuleImportShape =
	| { readonly kind: 'default'; readonly localName: string; readonly source: string }
	| { readonly kind: 'namespace'; readonly localName: string; readonly source: string }
	| {
			readonly kind: 'named';
			readonly localName: string;
			readonly importedName?: string;
			readonly source: string;
	  };

/**
 * `import x from "m"` / `import * as x from "m"` / `import { a as b } from "m"`
 * — the three shapes `symbol-modules.ts` builds as text in `emitModuleImport`.
 *
 * The module specifier is a synthesized literal with no `raw`, so it prints
 * double-quoted, matching the `JSON.stringify` the text path used.
 */
export function moduleImportNode(moduleImport: ModuleImportShape): EmissionNode {
	const local = identifierNode(moduleImport.localName);
	const specifier: EmissionNode =
		moduleImport.kind === 'default'
			? { type: 'ImportDefaultSpecifier', local }
			: moduleImport.kind === 'namespace'
				? { type: 'ImportNamespaceSpecifier', local }
				: {
						type: 'ImportSpecifier',
						imported: identifierNode(moduleImport.importedName ?? moduleImport.localName),
						local,
					};

	return {
		type: 'ImportDeclaration',
		specifiers: [specifier],
		source: literalNode(moduleImport.source),
	};
}

/** A `Program` wrapper for a printed module. */
export function moduleProgramNode(body: ReadonlyArray<EmissionNode>): EmissionNode {
	return { type: 'Program', sourceType: 'module', body: [...body] };
}

export type GraphReadCallInput = {
	/**
	 * The read callee. `symbol-modules.ts` emits `context.graph.read` at most
	 * sites and a bound local `read` inside computed derive modules.
	 */
	readonly callee: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

/**
 * `context.graph.read("id")` / `context.graph.read("id", ["a"])` — the shape
 * `graphReadCallSource` builds as text today, which omits the path argument
 * when the path is empty.
 */
export function graphReadCall(input: GraphReadCallInput): EmissionNode {
	return callNode(memberChainNode(input.callee), [
		literalNode(input.graphNodeId),
		...(input.path.length === 0 ? [] : [stringArrayNode(input.path)]),
	]);
}

export type GraphWriteCallInput = {
	readonly callee?: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly value: EmissionNode;
};

/** `context.graph.write({ graphNodeId, path, value })`. */
export function graphWriteCall(input: GraphWriteCallInput): EmissionNode {
	return callNode(memberChainNode(input.callee ?? 'context.graph.write'), [
		objectNode([
			propertyNode('graphNodeId', literalNode(input.graphNodeId)),
			propertyNode('path', stringArrayNode(input.path)),
			propertyNode('value', input.value),
		]),
	]);
}

export type GraphUpdateCallInput = {
	readonly callee?: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly returnValue: string;
	/** The updater parameter name; `symbol-modules.ts` uses `value`. */
	readonly parameterName?: string;
	/** The expression the updater returns. */
	readonly updateExpression: EmissionNode;
};

/**
 * `context.graph.update({ graphNodeId, path, returnValue, update(value) { ... } })`.
 */
export function graphUpdateCall(input: GraphUpdateCallInput): EmissionNode {
	const parameterName = input.parameterName ?? 'value';
	return callNode(memberChainNode(input.callee ?? 'context.graph.update'), [
		objectNode([
			propertyNode('graphNodeId', literalNode(input.graphNodeId)),
			propertyNode('path', stringArrayNode(input.path)),
			propertyNode('returnValue', literalNode(input.returnValue)),
			methodPropertyNode(
				'update',
				[parameterName],
				[returnStatementNode(input.updateExpression)],
			),
		]),
	]);
}

export type GraphDeleteCallInput = {
	readonly callee?: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

/** `context.graph.delete({ graphNodeId, path })`. */
export function graphDeleteCall(input: GraphDeleteCallInput): EmissionNode {
	return callNode(memberChainNode(input.callee ?? 'context.graph.delete'), [
		objectNode([
			propertyNode('graphNodeId', literalNode(input.graphNodeId)),
			propertyNode('path', stringArrayNode(input.path)),
		]),
	]);
}

export type GraphMethodCallInput = {
	readonly callee?: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly method: string;
	readonly args: ReadonlyArray<EmissionNode>;
};

/** `context.graph.call({ graphNodeId, path, method, args: [...] })`. */
export function graphMethodCall(input: GraphMethodCallInput): EmissionNode {
	return callNode(memberChainNode(input.callee ?? 'context.graph.call'), [
		objectNode([
			propertyNode('graphNodeId', literalNode(input.graphNodeId)),
			propertyNode('path', stringArrayNode(input.path)),
			propertyNode('method', literalNode(input.method)),
			propertyNode('args', arrayNode(input.args)),
		]),
	]);
}

export type ScalarWriteCallInput = {
	readonly callee?: string;
	readonly contextName?: string;
	readonly graphNodeId: string;
} & (
	| { readonly value: EmissionNode; readonly returnValue?: undefined }
	| {
			readonly value?: undefined;
			readonly returnValue: string;
			readonly parameterName?: string;
			readonly updateExpression: EmissionNode;
	  }
);

/**
 * The scalar-leaf write `symbol-modules.ts` emits for a single path-free write:
 * `marklessWriteScalar(context, { graphNodeId, value })`, or its updater form
 * `marklessWriteScalar(context, { graphNodeId, returnValue, update(value) { ... } })`.
 */
export function graphScalarWriteCall(input: ScalarWriteCallInput): EmissionNode {
	const properties: EmissionNode[] = [
		propertyNode('graphNodeId', literalNode(input.graphNodeId)),
	];

	if (input.value !== undefined) {
		properties.push(propertyNode('value', input.value));
	} else {
		properties.push(propertyNode('returnValue', literalNode(input.returnValue)));
		properties.push(
			methodPropertyNode(
				'update',
				[input.parameterName ?? 'value'],
				[returnStatementNode(input.updateExpression)],
			),
		);
	}

	return callNode(memberChainNode(input.callee ?? 'marklessWriteScalar'), [
		identifierNode(input.contextName ?? 'context'),
		objectNode(properties),
	]);
}

// ---------------------------------------------------------------------------

function symbolLabel(site: EmissionSite): string {
	return site.symbolId ? ` symbol "${site.symbolId}"` : ' this module';
}

function nondeterminismDiagnostic(site: EmissionSite, detail: string): CompilerDiagnostic {
	return emissionDiagnostic(EMISSION_NONDETERMINISTIC_CODE, site, {
		title: 'Emission is not deterministic',
		message: `Emission for${symbolLabel(site)} is not deterministic: ${detail}.`,
		why: 'Emitted bytes must be a function of the tree alone. Nondeterministic emission makes byte-equality snapshots unstable and makes build output depend on print order.',
		suggestions: [
			{
				message:
					'Check the emitter for nodes whose fields are computed on access, or for iteration over an unordered collection.',
			},
		],
	});
}

function emissionDiagnostic(
	code: string,
	site: EmissionSite,
	fields: {
		readonly title: string;
		readonly message: string;
		readonly why: string;
		readonly suggestions: CompilerDiagnostic['suggestions'];
	},
): CompilerDiagnostic {
	return {
		code,
		severity: 'error',
		phase: site.phase,
		passId: site.passId,
		symbolId: site.symbolId,
		title: fields.title,
		message: fields.message,
		why: fields.why,
		suggestions: fields.suggestions,
		docsUrl: `https://markless.dev/errors/${code}`,
	};
}
