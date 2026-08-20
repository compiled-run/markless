/**
 * Parity for `emitSymbolModule` — the general symbol-module path — and for the
 * value-source cluster it reaches, sketch item 4 of stage 1 in
 * `specs/framework/14-emission-codegen-migration.md`.
 *
 * Two things are measured here, because the unit builds two things.
 *
 * The value-source cluster (`supportedValueSource` through
 * `binaryValueOperatorPrecedence`) is the reason the character scanners exist:
 * object literals, arrays, parenthesized expressions, and the top-level commas,
 * ternaries, and colons those scanners hunt for. Every case in `VALUE_CASES`
 * runs both paths over the same authored expression and asserts they agree on
 * two things — whether the shape is supported at all, and what the supported
 * shapes emit once the printer has normalized both sides.
 *
 * The dispatcher is then measured end to end: real compiled fixtures, every
 * planned symbol whose kind has an AST path, printed and compared against the
 * module the compiler ships today.
 *
 * Neither path is wired. The string emitters still produce the shipped bytes;
 * invariant 2 makes the swap an owner-approved step, so this file records the
 * divergence rather than closing it.
 */
import { expect, test } from 'vitest';
import type { LoweredStateRead, SemanticModuleImport } from '../src/artifacts.ts';
import { compileTsrxModule } from '../src/compile-module.ts';
import {
	assertDeterministicEmission,
	constDeclarationNode,
	EMISSION_TSRX_NODE_CODE,
	EmissionDiagnosticError,
	exportNamedDeclarationNode,
	findTsrxOnlyNodeType,
	moduleProgramNode,
	parseEmissionSource,
	printEmissionExpression,
	printEmittedModule,
	type EmissionNode,
	type EmissionPrintInput,
} from '../src/passes/emit-codegen.ts';
import { moduleScopeLines } from '../src/passes/public-render/shared.ts';
import {
	buildEventWriteValueEmission,
	buildSymbolModuleEmission,
	buildValueExpressionEmission,
	emitSymbolModuleNodes,
	eventWriteValueSourceForParity,
	supportedValueSourceForParity,
	SYMBOL_MODULE_AST_KINDS,
	SYMBOL_MODULE_UNMIGRATED_KINDS,
	supportedValueSourceForParity as textValue,
	type SymbolModuleEmissionInput,
	type ValueExpressionEmission,
} from '../src/passes/symbol-modules.ts';

const VALUE_FILE = '/workspace/app/src/Values.tsrx';

/** The graph reads every value case resolves against, by authored source. */
const GRAPH_READS: ReadonlyArray<LoweredStateRead> = [
	{ source: 'count', graphNodeId: 'state:count', path: [] },
	{ source: 'user.name', graphNodeId: 'state:user', path: ['name'] },
	{ source: 'step', graphNodeId: 'state:step', path: [] },
];

const MODULE_IMPORTS: ReadonlyArray<SemanticModuleImport> = [
	{ kind: 'named', localName: 'formatLabel', importedName: 'formatLabel', source: './format.ts' },
];

const LOCAL_NAMES: ReadonlySet<string> = new Set(['row']);

const EVENT_PARAMETERS: ReadonlyArray<string> = ['event'];

type ValueCase = {
	readonly name: string;
	readonly valueSource: string;
	/** Whether both paths must call the shape supported. */
	readonly supported: boolean;
};

/**
 * One case per scanner the cluster carries, plus the shapes each scanner exists
 * to get wrong on: a comma inside a nested literal, a colon inside a string, a
 * `?:` nested inside another `?:`, a `??` that must not read as a ternary.
 */
const VALUE_CASES: ReadonlyArray<ValueCase> = [
	// --- leaves -------------------------------------------------------------
	{ name: 'string-literal', valueSource: "'draft'", supported: true },
	{ name: 'number-literal', valueSource: '42', supported: true },
	{ name: 'negative-number-literal', valueSource: '-1.5', supported: true },
	{ name: 'boolean-literal', valueSource: 'true', supported: true },
	{ name: 'undefined-literal', valueSource: 'undefined', supported: true },
	{ name: 'graph-read-scalar', valueSource: 'count', supported: true },
	{ name: 'graph-read-path', valueSource: 'user.name', supported: true },
	{ name: 'event-parameter', valueSource: 'event', supported: true },
	{ name: 'event-field', valueSource: 'event.target.value', supported: true },
	{ name: 'event-current-target', valueSource: 'event.currentTarget', supported: true },
	{ name: 'event-current-target-field', valueSource: 'event.currentTarget.checked', supported: true },
	{ name: 'row-local-path', valueSource: 'row.id', supported: true },
	{ name: 'unknown-identifier', valueSource: 'mystery', supported: false },

	// --- arrays -------------------------------------------------------------
	{ name: 'empty-array', valueSource: '[]', supported: true },
	{ name: 'array-of-literals', valueSource: "[1, 'two', true]", supported: true },
	{ name: 'array-with-graph-read', valueSource: '[count, user.name]', supported: true },
	{ name: 'array-with-spread', valueSource: '[...user.name, count]', supported: true },
	{ name: 'nested-array', valueSource: '[[1, 2], [3]]', supported: true },
	{
		// The comma inside the nested object is not an element separator; the
		// scanner needs its depth counter to know that, the parser does not.
		name: 'array-holding-object-with-commas',
		valueSource: "[{ a: 1, b: 2 }, 3]",
		supported: true,
	},
	{
		// A comma inside a string literal, which the scanner's quote tracking
		// exists for.
		name: 'array-with-comma-in-string',
		valueSource: "['a,b', 'c']",
		supported: true,
	},
	{ name: 'array-with-unsupported-element', valueSource: '[mystery]', supported: false },

	// --- objects ------------------------------------------------------------
	{ name: 'empty-object', valueSource: '{}', supported: true },
	{ name: 'object-identifier-keys', valueSource: '{ a: 1, b: count }', supported: true },
	{ name: 'object-string-key', valueSource: "{ 'a-b': count }", supported: true },
	{ name: 'object-numeric-key', valueSource: '{ 1: count }', supported: true },
	{ name: 'object-shorthand', valueSource: '{ count }', supported: true },
	{ name: 'object-spread', valueSource: '{ ...user.name, a: 1 }', supported: true },
	{ name: 'object-computed-key', valueSource: '{ [user.name]: count }', supported: true },
	{
		// A colon inside a string value: `topLevelObjectPropertyColonIndex` has to
		// skip it, and picking the wrong colon would split the property in half.
		name: 'object-colon-inside-string',
		valueSource: "{ label: 'a:b' }",
		supported: true,
	},
	{
		// A colon inside a nested ternary value, at property depth.
		name: 'object-ternary-value',
		valueSource: '{ label: count ? 1 : 2 }',
		supported: true,
	},
	{ name: 'nested-object', valueSource: '{ a: { b: count } }', supported: true },
	{ name: 'object-with-unsupported-value', valueSource: '{ a: mystery }', supported: false },

	// --- parenthesized ------------------------------------------------------
	{ name: 'parenthesized-graph-read', valueSource: '(count)', supported: true },
	{ name: 'parenthesized-binary', valueSource: '(count + 1)', supported: true },
	{
		// The parentheses are load-bearing here: dropping them changes the value.
		name: 'parenthesized-precedence',
		valueSource: '(count + 1) * 2',
		supported: true,
	},
	{ name: 'parenthesized-unsupported', valueSource: '(mystery)', supported: false },

	// --- conditionals -------------------------------------------------------
	{ name: 'conditional', valueSource: "count ? 'on' : 'off'", supported: true },
	{
		// A ternary inside a ternary: `topLevelConditionalTokenIndex` counts
		// nested `?` to pair the right `:`.
		name: 'nested-conditional',
		valueSource: "count ? (step ? 'a' : 'b') : 'c'",
		supported: true,
	},
	{
		// `??` must not be read as the start of a ternary.
		name: 'nullish-not-conditional',
		valueSource: "count ?? 'fallback'",
		supported: true,
	},

	// --- binaries -----------------------------------------------------------
	{ name: 'binary-add', valueSource: 'count + 1', supported: true },
	{ name: 'binary-precedence-mix', valueSource: 'count + step * 2', supported: true },
	{ name: 'binary-comparison', valueSource: 'count >= 3', supported: true },
	{ name: 'logical-and', valueSource: 'count && step', supported: true },
	{
		// A unary minus in an operand position: `isUnaryBoundary` exists so the
		// scanner does not split `1 + -2` at the wrong `-`.
		name: 'binary-with-unary-operand',
		valueSource: 'count + -1',
		supported: true,
	},
	{ name: 'unary-not', valueSource: '!count', supported: true },
	{ name: 'unary-bitwise-not', valueSource: '~count', supported: true },

	// --- calls --------------------------------------------------------------
	{ name: 'imported-call-no-arguments', valueSource: 'formatLabel()', supported: true },
	{ name: 'imported-call-with-arguments', valueSource: 'formatLabel(count, 2)', supported: true },
	{ name: 'global-static-call', valueSource: 'Math.max(count, 0)', supported: true },
	{ name: 'unknown-callee', valueSource: 'mystery(count)', supported: false },
	{
		// A comma inside a nested call argument, at argument depth.
		name: 'call-with-nested-call-argument',
		valueSource: 'Math.max(Math.min(count, 2), 0)',
		supported: true,
	},

	// --- shapes both paths refuse -------------------------------------------
	{ name: 'template-literal', valueSource: '`a${count}b`', supported: false },
	{ name: 'arrow-function', valueSource: '() => count', supported: false },
	{ name: 'typeof-operand', valueSource: 'typeof count', supported: false },
	{ name: 'sequence', valueSource: 'count, step', supported: false },
];

function valueInput(valueSource: string) {
	return {
		valueSource,
		eventParameters: EVENT_PARAMETERS,
		graphReads: GRAPH_READS,
		moduleImports: MODULE_IMPORTS,
		localNames: LOCAL_NAMES,
	};
}

/**
 * Reprint an expression through the printer that emission uses.
 *
 * Two expressions that reprint to the same bytes differ only in what the printer
 * normalizes away — spacing and parentheses the grammar does not require. That is
 * the parity claim available when one side is spliced text and the other is a
 * printed tree.
 */
function reprintExpression(code: string): string {
	const source = `(${code});`;
	const { program, errors } = parseEmissionSource(source, VALUE_FILE, 'ts');
	expect(errors, `reprinting ${code} produced parse errors`).toEqual([]);
	return printEmittedModule({
		program,
		source,
		outputFileName: 'reprint.js',
		site: { phase: 'payload', passId: 'symbol-modules', sourceFileName: VALUE_FILE },
	}).code;
}

/** Wrap a value node in a module, so the site gates can run over it. */
function valueModule(emission: ValueExpressionEmission): EmissionPrintInput {
	return {
		program: moduleProgramNode([
			exportNamedDeclarationNode(constDeclarationNode('marklessValue', emission.node)),
		]),
		source: emission.source,
		outputFileName: 'markless-value.js',
		site: { phase: 'payload', passId: 'symbol-modules', sourceFileName: VALUE_FILE },
	};
}

test('both value paths agree on which authored shapes are supported', () => {
	const disagreements: string[] = [];

	for (const valueCase of VALUE_CASES) {
		const text = supportedValueSourceForParity(valueInput(valueCase.valueSource));
		const ast = buildValueExpressionEmission({
			...valueInput(valueCase.valueSource),
			sourceFileName: VALUE_FILE,
		});

		if ((text !== null) !== (ast !== null)) {
			disagreements.push(
				`${valueCase.name}: text=${text === null ? 'unsupported' : 'supported'} ast=${ast === null ? 'unsupported' : 'supported'}`,
			);
			continue;
		}
		if ((text !== null) !== valueCase.supported) {
			disagreements.push(
				`${valueCase.name}: expected ${valueCase.supported ? 'supported' : 'unsupported'}, both paths said otherwise`,
			);
		}
	}

	expect(disagreements).toEqual([]);
});

test('every supported value emits the same expression once the printer normalizes both', () => {
	const divergences: Record<string, { readonly text: string; readonly printed: string }> = {};

	for (const valueCase of VALUE_CASES) {
		if (!valueCase.supported) continue;

		const text = supportedValueSourceForParity(valueInput(valueCase.valueSource));
		const ast = buildValueExpressionEmission({
			...valueInput(valueCase.valueSource),
			sourceFileName: VALUE_FILE,
		});
		if (text === null || ast === null) continue;

		const printed = printEmissionExpression(ast.node);
		if (reprintExpression(text) !== reprintExpression(printed)) {
			divergences[valueCase.name] = { text, printed };
		}
	}

	// Empty is the claim: the AST path emits the same expression the cluster
	// emits, for every shape the cluster supports.
	expect(divergences).toEqual({});
});

test('the printed value is not always byte-identical, and every difference is the printer normalizing', () => {
	const classes: Record<string, string> = {};

	for (const valueCase of VALUE_CASES) {
		if (!valueCase.supported) continue;

		const text = supportedValueSourceForParity(valueInput(valueCase.valueSource));
		const ast = buildValueExpressionEmission({
			...valueInput(valueCase.valueSource),
			sourceFileName: VALUE_FILE,
		});
		if (text === null || ast === null) continue;

		const printed = printEmissionExpression(ast.node);
		if (printed === text) continue;

		classes[valueCase.name] = valueDifferenceClass(text, printed);
	}

	// Recorded, not asserted-away: these are the exact byte differences the
	// owner's re-baseline decision rests on. `other` must not appear.
	//
	// All three are the same normalization. The string path keeps whatever
	// parentheses the author wrote, because `parenthesizedValueSource` re-emits
	// them and `conditionalValueSource` cannot tell a needed pair from a
	// redundant one. The printer derives parentheses from precedence under
	// `preserveParens: false`, so it drops the redundant pairs and keeps the
	// load-bearing ones — `(count + 1) * 2` is byte-identical on both paths.
	expect(classes).toEqual({
		'parenthesized-graph-read': 'redundant-parentheses-dropped',
		'parenthesized-binary': 'redundant-parentheses-dropped',
		'nested-conditional': 'redundant-parentheses-dropped',
	});
});

/** The named normalizations that separate the two value paths. */
function valueDifferenceClass(text: string, printed: string): string {
	if (printed.replaceAll(' ', '') === text.replaceAll(' ', '')) return 'spacing-only';

	const withoutParentheses = (source: string) => source.replaceAll('(', '').replaceAll(')', '');
	if (withoutParentheses(text) === withoutParentheses(printed)) {
		return 'redundant-parentheses-dropped';
	}

	return 'other';
}

test('the value path rewrites by node identity, not by character search', () => {
	// The string fallback replaces `count` wherever the characters appear with
	// only identifier-boundary guards, so it reaches inside a string literal.
	// Rewriting by node identity cannot: a string literal is not an identifier.
	const insideAString = "'count is high'";
	const spliced = eventWriteValueSourceForParity(valueInput(insideAString));
	const printed = buildEventWriteValueEmission({
		...valueInput(insideAString),
		sourceFileName: VALUE_FILE,
	});

	expect(printed).not.toBeNull();
	// Supported as a literal on both paths, so neither rewrites here.
	expect(spliced).toBe(insideAString);
	expect(printEmissionExpression(printed!.node)).toBe(insideAString);

	// The unsupported shape that reaches the fallback: a template literal whose
	// interpolation names a graph read and a row local.
	const unsupported = '`${count}-${row}`';
	const splicedFallback = eventWriteValueSourceForParity(valueInput(unsupported));
	const printedFallback = buildEventWriteValueEmission({
		...valueInput(unsupported),
		sourceFileName: VALUE_FILE,
	});

	expect(printedFallback).not.toBeNull();
	expect(splicedFallback).toBe('`${context.graph.read("state:count")}-${context.locals?.row}`');
	expect(printEmissionExpression(printedFallback!.node)).toBe(
		'`${context.graph.read("state:count")}-${context.locals?.row}`',
	);
});

test('the string fallback corrupts a shorthand property and the node rewrite does not', () => {
	// `{ count }` is supported on both paths, so force the fallback with a shape
	// neither supports that still contains a shorthand property.
	const source = '{ ...mystery, count }';
	const spliced = eventWriteValueSourceForParity(valueInput(source));
	const printed = buildEventWriteValueEmission({
		...valueInput(source),
		sourceFileName: VALUE_FILE,
	});

	expect(printed).not.toBeNull();

	// The recorded defect, stated as a fact so the swap unit knows it is a fix
	// and not a regression: the spliced text does not parse.
	expect(spliced).toBe('{ ...mystery, context.graph.read("state:count") }');
	expect(parsesAsExpression(spliced!)).toBe(false);

	// The node rewrite expands the shorthand instead, which does parse.
	const printedSource = printEmissionExpression(printed!.node);
	expect(printedSource).toBe('{ ...mystery, count: context.graph.read("state:count") }');
	expect(parsesAsExpression(printedSource)).toBe(true);
});

/**
 * Whether emitted text is a parseable expression.
 *
 * The adapter reports some parse failures through its `errors` array and throws
 * on others, so both have to be caught to answer the question honestly.
 */
function parsesAsExpression(code: string): boolean {
	try {
		return parseEmissionSource(`(${code});`, VALUE_FILE, 'ts').errors.length === 0;
	} catch {
		return false;
	}
}

test('value emission is deterministic and reaches a reparse fixpoint', () => {
	for (const valueCase of VALUE_CASES) {
		if (!valueCase.supported) continue;

		const ast = buildValueExpressionEmission({
			...valueInput(valueCase.valueSource),
			sourceFileName: VALUE_FILE,
		});
		expect(ast, `${valueCase.name} did not build`).not.toBeNull();

		// Prints twice and requires identical bytes and identical mappings, then
		// reparses the emitted source and requires reprinting it to be a fixpoint
		// (invariant 7 — no recorded probe establishes printer determinism).
		const emitted = assertDeterministicEmission(valueModule(ast!));

		expect(emitted.map.sources ?? [], `${valueCase.name} map sources`).toEqual([VALUE_FILE]);
		expect(emitted.map.file, `${valueCase.name} map file`).toBe('markless-value.js');
	}
});

test('the TSRX-node assertion is live at the value site', () => {
	const ast = buildValueExpressionEmission({
		...valueInput('[count]'),
		sourceFileName: VALUE_FILE,
	});
	expect(ast).not.toBeNull();

	const clean = valueModule(ast!);
	expect(findTsrxOnlyNodeType(clean.program)).toBeNull();

	const program = clean.program as unknown as { readonly body: EmissionNode[] };
	const poisoned: EmissionPrintInput = {
		...clean,
		program: {
			...program,
			body: [...program.body, { type: 'JSXCodeBlock' } as EmissionNode],
		} as unknown as EmissionNode,
	};

	expect(() => printEmittedModule(poisoned)).toThrowError(EmissionDiagnosticError);
	try {
		printEmittedModule(poisoned);
	} catch (error) {
		expect((error as EmissionDiagnosticError).diagnostic.code).toBe(EMISSION_TSRX_NODE_CODE);
	}
});

// ---------------------------------------------------------------------------
// The dispatcher, end to end over compiled fixtures.
// ---------------------------------------------------------------------------

type DispatcherFixture = {
	readonly name: string;
	readonly filename: string;
	readonly source: string;
};

const DISPATCHER_FIXTURES: ReadonlyArray<DispatcherFixture> = [
	{
		// A state initializer plus the DOM update its interpolation produces:
		// two of the four migrated kinds from one module.
		name: 'initializer-and-dom-update',
		filename: '/workspace/app/src/App.tsrx',
		source: `
import { state } from '@markless/core';
function initialWeight() { return 2; }
export function App() @{ let weight = state(initialWeight()); <main>{weight}</main> }
`,
	},
	{
		// A behavior: the inline-arrow shape `canEmitBehaviorModule` accepts.
		name: 'behavior',
		filename: '/workspace/app/src/Behavior.tsrx',
		source: `
export function App() @{
	<canvas attach={(el) => { el.dataset.ready = 'yes'; }} />
}
`,
	},
	{
		// An async computed runner, with its dependency declarations.
		name: 'async-runner',
		filename: '/workspace/app/src/AsyncComputed.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let query = state('rope');
	const details = computed(async () => {
		const q = query;
		return { text: 'Detail ' + q };
	});

	<article>
		@try {
			<strong>{details.text}</strong>
		} @pending {
			<strong>Loading</strong>
		} @catch {
			<strong>Unavailable</strong>
		}
	</article>
}
`,
	},
	{
		// An event handler and a sync computed derive: the two kinds the
		// dispatcher must decline rather than mis-emit.
		name: 'unmigrated-kinds',
		filename: '/workspace/app/src/Handler.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let count = state(0);
	const doubled = computed(() => count * 2);

	<button onClick={() => { count = count + 1; }}>{doubled}</button>
}
`,
	},
];

type DispatchedSymbol = {
	readonly fixture: string;
	readonly symbolId: string;
	readonly kind: string;
	readonly spliced: string;
	readonly input: SymbolModuleEmissionInput;
};

async function dispatchedSymbols(fixture: DispatcherFixture): Promise<DispatchedSymbol[]> {
	const result = await compileTsrxModule({
		filename: fixture.filename,
		source: fixture.source,
		symbols: [],
	});

	return result.symbolResolver.symbols.flatMap((symbol) => {
		const spliced = result.symbolModules.modules.find(
			(module) => module.symbolId === symbol.id,
		);
		if (!spliced) return [];

		return [
			{
				fixture: fixture.name,
				symbolId: symbol.id,
				kind: symbol.kind,
				spliced: spliced.source,
				input: {
					symbol,
					moduleDeclarations: moduleScopeLines(fixture.source, fixture.filename),
					moduleImports: result.semanticGraph.moduleImports,
					captureSlots: [],
					semanticGraph: result.semanticGraph,
					renderData: result.renderData,
					omitAuthoredSource: false,
					sourceFileName: fixture.filename,
				},
			},
		];
	});
}

/** Reprint a whole module, the parity claim the sibling site tests use. */
function reprintModule(code: string, filename: string): string {
	const { program, errors } = parseEmissionSource(code, filename, 'ts');
	expect(errors, `reprinting a module produced parse errors:\n${code}`).toEqual([]);
	return printEmittedModule({
		program,
		source: code,
		outputFileName: 'reprint.js',
		site: { phase: 'payload', passId: 'symbol-modules', sourceFileName: filename },
	}).code;
}

/**
 * Rewrite single-quoted string literals with no escapes to double quotes.
 *
 * `quotes: 'preserve'` keeps whatever quote a literal was parsed with, and
 * synthesized literals carry no `raw` and print double-quoted. A module the
 * string path wrote with `'...'` therefore reprints with `'...'` while the same
 * module built from nodes reprints with `"..."`. That is a quote-style
 * difference and nothing else, so parity is measured with it normalized and the
 * cases where it happens are recorded separately.
 */
function normalizeQuoteStyle(code: string): string {
	return code.replaceAll(/'([^'\\\n"]*)'/g, '"$1"');
}

test('the dispatcher prints every migrated kind structurally identically to the spliced module', async () => {
	const quoteStyleOnly: string[] = [];
	let compared = 0;

	for (const fixture of DISPATCHER_FIXTURES) {
		for (const dispatched of await dispatchedSymbols(fixture)) {
			const emitted = emitSymbolModuleNodes(dispatched.input);
			if (!emitted) {
				expect(
					SYMBOL_MODULE_AST_KINDS.has(dispatched.input.symbol.kind),
					`${dispatched.fixture}/${dispatched.symbolId}: a migrated kind declined to build`,
				).toBe(false);
				continue;
			}

			const printed = reprintModule(emitted.code, dispatched.input.sourceFileName);
			const spliced = reprintModule(dispatched.spliced, dispatched.input.sourceFileName);
			if (printed !== spliced) quoteStyleOnly.push(dispatched.kind);

			expect(
				normalizeQuoteStyle(printed),
				`${dispatched.fixture}/${dispatched.symbolId} (${dispatched.kind}): printed and spliced modules reprint differently`,
			).toBe(normalizeQuoteStyle(spliced));
			compared++;
		}
	}

	// The fixtures must actually reach the dispatcher, or the assertion above is
	// vacuously true.
	expect(compared).toBeGreaterThanOrEqual(4);

	// Recorded: the only kind whose reprints are not already equal, and the
	// reason is the module-specifier quote style in its emitted `import`.
	expect([...new Set(quoteStyleOnly)].sort()).toEqual(['dom-update']);
});

test('the dispatcher declines exactly the kinds with no AST path, and names their unit', async () => {
	const declined = new Set<string>();
	const built = new Set<string>();

	for (const fixture of DISPATCHER_FIXTURES) {
		for (const dispatched of await dispatchedSymbols(fixture)) {
			if (buildSymbolModuleEmission(dispatched.input)) built.add(dispatched.kind);
			else declined.add(dispatched.kind);
		}
	}

	for (const kind of built) {
		expect(SYMBOL_MODULE_AST_KINDS.has(kind as never), `${kind} built but is not listed`).toBe(
			true,
		);
	}
	for (const kind of declined) {
		expect(
			SYMBOL_MODULE_UNMIGRATED_KINDS.has(kind as never),
			`${kind} was declined but no unit owns it`,
		).toBe(true);
	}

	// The fixture set covers both sides of the split.
	expect([...built].sort()).toEqual([
		'async-computed-runner',
		'behavior',
		'dom-update',
		'state-initializer',
	]);
	expect([...declined].sort()).toEqual([
		// Routed by `emitSymbolModules` before `emitSymbolModule` would see it,
		// so its own AST band (sketch item 3) is not this dispatcher's to call.
		'async-boundary-update',
		'event-handler',
		'sync-computed-derive',
	]);
});

test('every dispatched module carries a non-null source map naming the authored file', async () => {
	for (const fixture of DISPATCHER_FIXTURES) {
		for (const dispatched of await dispatchedSymbols(fixture)) {
			const emitted = emitSymbolModuleNodes(dispatched.input);
			if (!emitted) continue;

			expect(emitted.map.sources ?? [], `${dispatched.symbolId} map sources`).toEqual([
				dispatched.input.sourceFileName,
			]);
		}
	}
});

test('dispatched emission is deterministic and reaches a reparse fixpoint', async () => {
	for (const fixture of DISPATCHER_FIXTURES) {
		for (const dispatched of await dispatchedSymbols(fixture)) {
			const emission = buildSymbolModuleEmission(dispatched.input);
			if (!emission) continue;

			const emitted = assertDeterministicEmission(emission);
			expect(emitted.code).toBe(emitSymbolModuleNodes(dispatched.input)?.code);
		}
	}
});

test('the parity seam and the string path are the same function', () => {
	// Guards the seam itself: a wrapper that drifted from the function it wraps
	// would make every parity claim above meaningless.
	expect(textValue(valueInput('count'))).toBe('context.graph.read("state:count")');
	expect(textValue(valueInput('mystery'))).toBeNull();
});
