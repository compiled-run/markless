/**
 * Foundation tests for the emission codegen module
 * (`specs/framework/14-emission-codegen-migration.md`, stage 1 unit 1).
 *
 * These re-run, in-repo and against the installed `yuku-codegen@0.9.1`, the
 * printer capabilities the campaign's audit recorded in an ephemeral
 * scratchpad, and they hold invariants 3, 4, 7, and 8 for the module the
 * per-site migrations build on. No emitter is migrated here.
 */
import { expect, test } from 'vitest';
import { generate } from 'yuku-codegen';
import {
	EMISSION_NONDETERMINISTIC_CODE,
	EMISSION_PARSE_OPTIONS,
	EMISSION_PRINT_OPTIONS,
	EMISSION_TSRX_NODE_CODE,
	EmissionDiagnosticError,
	assertDeterministicEmission,
	assertTsrxFreeForEmission,
	findTsrxOnlyNodeType,
	graphDeleteCall,
	graphMethodCall,
	graphReadCall,
	graphScalarWriteCall,
	graphUpdateCall,
	graphWriteCall,
	identifierNode,
	literalNode,
	parseEmissionSource,
	printEmissionExpression,
	printEmittedModule,
	type EmissionNode,
	type EmissionSite,
} from '../src/passes/emit-codegen.ts';
import { parseModule } from '../src/js-ast.ts';

const site: EmissionSite = {
	phase: 'payload',
	passId: 'symbol-modules',
	sourceFileName: 'Counter.tsrx',
	symbolId: 'symbol:0',
};

function parseExpressionText(text: string): EmissionNode {
	const { program, errors } = parseEmissionSource(`(${text});`, 'expression.ts');
	expect(errors).toEqual([]);
	const statement = program.body[0] as { expression?: unknown };
	return statement.expression as EmissionNode;
}

function printModuleText(source: string, filename = 'emitted.ts'): string {
	const { program, errors } = parseEmissionSource(source, filename);
	expect(errors).toEqual([]);
	return printEmittedModule({
		program,
		source,
		outputFileName: 'out.js',
		site: { ...site, sourceFileName: filename },
	}).code;
}

function collectNodeTypes(root: unknown): Set<string> {
	const types = new Set<string>();
	const stack: unknown[] = [root];
	const seen = new Set<object>();
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
		if (typeof type === 'string') types.add(type);
		for (const [key, child] of Object.entries(value)) {
			if (key === 'parent' || key === 'loc' || key === 'range') continue;
			stack.push(child);
		}
	}
	return types;
}

// --- Printer options (invariant 8) -----------------------------------------

test('the print options are the ones the compiler depends on, stated once', () => {
	// Unknown printer options are accepted silently upstream, so a misspelled
	// option is a no-op that no behavioral test can catch. The option names are
	// pinned here and each one's consequence is asserted below.
	expect(EMISSION_PRINT_OPTIONS).toEqual({
		format: 'pretty',
		indent: 2,
		quotes: 'preserve',
		comments: 'all',
		strip: false,
		minify: false,
	});
	expect(EMISSION_PARSE_OPTIONS).toEqual({
		preserveParens: false,
		attachComments: true,
	});
});

test('preserveParens:false drops paren nodes and the printer derives parentheses', () => {
	const withParens = parseModule('const m = (a + b) * c;', 'a.ts', { preserveParens: true });
	const withoutParens = parseModule('const m = (a + b) * c;', 'a.ts', {
		...EMISSION_PARSE_OPTIONS,
	});
	expect(collectNodeTypes(withParens).has('ParenthesizedExpression')).toBe(true);
	expect(collectNodeTypes(withoutParens).has('ParenthesizedExpression')).toBe(false);

	// The precedence cases the hand-written table at symbol-modules.ts:2015-2107
	// exists to get right. Parentheses below come from the printer, not the tree.
	expect(printModuleText('const m = (a + b) * (c - d) / (e % f);')).toBe(
		'const m = (a + b) * (c - d) / (e % f);',
	);
	expect(printModuleText('const e2 = (2 ** 3) ** 2;')).toBe('const e2 = (2 ** 3) ** 2;');
	expect(printModuleText('const g = () => ({ a: 1 });')).toBe('const g = () => ({ a: 1 });');
	expect(printModuleText('const nc = (a ?? b) || c;')).toBe('const nc = (a ?? b) || c;');
	expect(printModuleText('const n1 = new (f())();')).toBe('const n1 = new (f())();');
	expect(printModuleText('const ni = !(a in b);')).toBe('const ni = !(a in b);');
	expect(printModuleText('const t = p ? q ? 1 : 2 : r ? 3 : 4;')).toBe(
		'const t = p ? q ? 1 : 2 : r ? 3 : 4;',
	);
});

test('printed output for representative emitted shapes is parse-valid and a reparse fixpoint', () => {
	const shapes = [
		"import { marklessUpdateText } from '@markless/web/fns/update-text';\nexport function symbol_0(context) {\n  return marklessUpdateText(context, 'h1');\n}",
		'export async function symbol_1(context, event) {\n  event.preventDefault();\n  const next = context.graph.read("state:count", ["value"]) + 1;\n  context.graph.write({ graphNodeId: "state:count", path: ["value"], value: next });\n  return next > 10 ? "big" : "small";\n}',
		'export function symbol_2(context) {\n  const read = context.graph?.read ? context.graph.read.bind(context.graph) : context.read;\n  const query = read("state:query");\n  const run = async () => ({ title: query });\n  return run({ key: context.key, signal: context.signal, read });\n}',
		'const marklessBoundaryArms = [[{ "text": "<p>" }, { "read": { "graphNodeId": "computed:details", "path": ["title"] } }]];\nexport function symbol_3(context) {\n  return marklessBoundaryArms[context.status === "rejected" ? 1 : 0] ?? [];\n}',
	];

	for (const shape of shapes) {
		const printed = printModuleText(shape);
		const { errors } = parseEmissionSource(printed, 'emitted.ts');
		expect(errors).toEqual([]);
		expect(printModuleText(printed)).toBe(printed);
	}
});

test("quotes:'preserve' keeps authored quotes and prints synthesized literals double-quoted", () => {
	// Splice parity: authored text kept its own quotes, and so does the printer.
	expect(printModuleText("import { a } from './dep.js';\nconst s = 'single';")).toBe(
		"import { a } from './dep.js';\nconst s = 'single';",
	);
	expect(printModuleText('const d = "double";')).toBe('const d = "double";');
	// JSON.stringify parity: a synthesized literal carries no `raw`.
	expect(printEmissionExpression(literalNode('state:count'))).toBe('"state:count"');
});

test('comments survive only when the parse and the print both opt in', () => {
	const source = '/** doc */\nexport function f(a) {\n  // inside\n  return a; // trail\n}';

	expect(printModuleText(source)).toBe(source);

	const withoutAttach = parseModule(source, 'a.ts', {
		preserveParens: false,
		attachComments: false,
	});
	expect(generate(withoutAttach, EMISSION_PRINT_OPTIONS).code).not.toContain('// inside');

	const attached = parseModule(source, 'a.ts', { ...EMISSION_PARSE_OPTIONS });
	// The printer's own default is 'some', which drops line comments; 'all' is
	// the option the compiler depends on.
	expect(generate(attached, { ...EMISSION_PRINT_OPTIONS, comments: 'some' }).code).not.toContain(
		'// inside',
	);
	expect(generate(attached, EMISSION_PRINT_OPTIONS).code).toContain('// inside');
});

test('strip:false leaves TypeScript annotations in place, as splicing did', () => {
	const source = 'export function f(a: number): number {\n  const x: number = a;\n  return x;\n}';
	expect(printModuleText(source)).toBe(source);
	const { program } = parseEmissionSource(source, 'a.ts');
	expect(generate(program, { ...EMISSION_PRINT_OPTIONS, strip: true }).code).toBe(
		'export function f(a) {\n  const x = a;\n  return x;\n}',
	);
});

// --- Source maps (invariant 3) ---------------------------------------------

test('every printed module carries a non-null source map naming the authored file', () => {
	const source = 'export function symbol_0(context) {\n  return context.key;\n}';
	const { program } = parseEmissionSource(source, 'Counter.tsrx');
	const emitted = printEmittedModule({
		program,
		source,
		outputFileName: 'Counter.symbol_0.js',
		site,
	});

	expect(emitted.map.version).toBe(3);
	expect(emitted.map.file).toBe('Counter.symbol_0.js');
	expect(emitted.map.sources).toEqual(['Counter.tsrx']);
	expect(emitted.map.sourcesContent).toEqual([source]);
	expect(emitted.map.mappings.length).toBeGreaterThan(0);
});

test('the printer returns a null map when no source is threaded, which is why the guard exists', () => {
	const source = 'export const a = 1;';
	const { program } = parseEmissionSource(source, 'a.ts');
	expect(generate(program, EMISSION_PRINT_OPTIONS).map).toBeNull();
	// Passing the option without the source text is the silent-failure shape
	// invariant 3 names; printEmittedModule always threads the source.
	const noSource = { source: undefined } as unknown as { source: string };
	expect(generate(program, { ...EMISSION_PRINT_OPTIONS, sourceMap: noSource }).map).toBeNull();
});

// --- Graph call builders ----------------------------------------------------

/** `graphReadCallSource` as `symbol-modules.ts:2679` builds it today. */
function todaysGraphReadCallText(
	callee: string,
	graphNodeId: string,
	path: ReadonlyArray<string>,
): string {
	return path.length === 0
		? `${callee}(${JSON.stringify(graphNodeId)})`
		: `${callee}(${JSON.stringify(graphNodeId)}, ${JSON.stringify(path)})`;
}

test('the read builder prints the call text symbol-modules emits today', () => {
	const noPath = graphReadCall({
		callee: 'context.graph.read',
		graphNodeId: 'state:count',
		path: [],
	});
	expect(printEmissionExpression(noPath)).toBe('context.graph.read("state:count")');
	expect(printEmissionExpression(noPath)).toBe(
		todaysGraphReadCallText('context.graph.read', 'state:count', []),
	);

	const onePath = graphReadCall({
		callee: 'context.graph.read',
		graphNodeId: 'state:count',
		path: ['value'],
	});
	expect(printEmissionExpression(onePath)).toBe('context.graph.read("state:count", ["value"])');
	expect(printEmissionExpression(onePath)).toBe(
		todaysGraphReadCallText('context.graph.read', 'state:count', ['value']),
	);

	// The bound-local callee the computed derive emitter uses.
	expect(
		printEmissionExpression(
			graphReadCall({ callee: 'read', graphNodeId: 'state:query', path: [] }),
		),
	).toBe('read("state:query")');
});

test('a multi-segment read path is the one recorded divergence from the current text', () => {
	const printed = printEmissionExpression(
		graphReadCall({
			callee: 'context.graph.read',
			graphNodeId: 'state:menu',
			path: ['a', 'b'],
		}),
	);
	// The printer separates array elements with ", "; JSON.stringify does not.
	// The two denote the same call, so this is a formatting diff a migrating
	// emitter must carry to an owner-approved re-baseline, not a semantic one.
	expect(printed).toBe('context.graph.read("state:menu", ["a", "b"])');
	expect(todaysGraphReadCallText('context.graph.read', 'state:menu', ['a', 'b'])).toBe(
		'context.graph.read("state:menu", ["a","b"])',
	);
	expect(printEmissionExpression(parseExpressionText(printed))).toBe(printed);
});

test('the write builders print the shapes symbol-modules emits today', () => {
	const write = graphWriteCall({
		graphNodeId: 'state:count',
		path: ['value'],
		value: identifierNode('next'),
	});
	expect(printEmissionExpression(write)).toBe(
		'context.graph.write({ graphNodeId: "state:count", path: ["value"], value: next })',
	);

	const update = graphUpdateCall({
		graphNodeId: 'state:count',
		path: [],
		returnValue: 'next',
		updateExpression: parseExpressionText('Number(value) + 1'),
	});
	expect(printEmissionExpression(update)).toBe(
		'context.graph.update({ graphNodeId: "state:count", path: [], returnValue: "next", update(value) {\n  return Number(value) + 1;\n} })',
	);

	expect(
		printEmissionExpression(graphDeleteCall({ graphNodeId: 'state:menu', path: ['title'] })),
	).toBe('context.graph.delete({ graphNodeId: "state:menu", path: ["title"] })');

	expect(
		printEmissionExpression(
			graphMethodCall({
				graphNodeId: 'state:items',
				path: [],
				method: 'push',
				args: [identifierNode('item')],
			}),
		),
	).toBe(
		'context.graph.call({ graphNodeId: "state:items", path: [], method: "push", args: [item] })',
	);

	expect(
		printEmissionExpression(
			graphScalarWriteCall({ graphNodeId: 'state:count', value: literalNode(1) }),
		),
	).toBe('marklessWriteScalar(context, { graphNodeId: "state:count", value: 1 })');

	expect(
		printEmissionExpression(
			graphScalarWriteCall({
				graphNodeId: 'state:count',
				returnValue: 'next',
				updateExpression: parseExpressionText('Number(value) + 1'),
			}),
		),
	).toBe(
		'marklessWriteScalar(context, { graphNodeId: "state:count", returnValue: "next", update(value) {\n  return Number(value) + 1;\n} })',
	);
});

test('each write builder denotes the same call the current emitter text denotes', () => {
	// The current emitters build these as tab-indented multi-line text
	// (symbol-modules.ts:1008-1080, de-indented by emitEventWriteExpression).
	// Printing the parse of that text and printing the built node must agree,
	// which pins the shape rather than the whitespace.
	const cases: ReadonlyArray<readonly [EmissionNode, string]> = [
		[
			graphWriteCall({
				graphNodeId: 'state:count',
				path: ['value'],
				value: identifierNode('next'),
			}),
			'context.graph.write({\n\tgraphNodeId: "state:count",\n\tpath: ["value"],\n\tvalue: next,\n})',
		],
		[
			graphUpdateCall({
				graphNodeId: 'state:count',
				path: [],
				returnValue: 'next',
				updateExpression: parseExpressionText('value + step'),
			}),
			'context.graph.update({\n\tgraphNodeId: "state:count",\n\tpath: [],\n\treturnValue: "next",\n\tupdate(value) {\n\t\treturn value + step;\n\t},\n})',
		],
		[
			graphDeleteCall({ graphNodeId: 'state:menu', path: ['title'] }),
			'context.graph.delete({\n\tgraphNodeId: "state:menu",\n\tpath: ["title"],\n})',
		],
		[
			graphMethodCall({
				graphNodeId: 'state:items',
				path: [],
				method: 'push',
				args: [identifierNode('item')],
			}),
			'context.graph.call({\n\tgraphNodeId: "state:items",\n\tpath: [],\n\tmethod: "push",\n\targs: [item],\n})',
		],
	];

	for (const [built, currentText] of cases) {
		expect(printEmissionExpression(built)).toBe(
			printEmissionExpression(parseExpressionText(currentText)),
		);
	}
});

// --- TSRX assertion (invariant 4) ------------------------------------------

const TSRX_SOURCE =
	'export function App({ value }: { value: string }) @{\n' +
	"  let label = state('Hi');\n" +
	"  @if (value === 'a') { <span>{label}</span> } @else { <span>b</span> }\n" +
	'  <section><style>.card { color: red; }</style><h2>{label}</h2></section>\n' +
	'}';

test('the TSRX assertion fires on a TSRX node and names it in a diagnostic', () => {
	const program = parseModule(TSRX_SOURCE, 'App.tsrx', { collect: true });
	expect(findTsrxOnlyNodeType(program)).not.toBeNull();

	let thrown: unknown;
	try {
		assertTsrxFreeForEmission(program, site);
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(EmissionDiagnosticError);
	const { diagnostic } = thrown as EmissionDiagnosticError;
	expect(diagnostic.code).toBe(EMISSION_TSRX_NODE_CODE);
	expect(diagnostic.severity).toBe('error');
	expect(diagnostic.phase).toBe('payload');
	expect(diagnostic.passId).toBe('symbol-modules');
	expect(diagnostic.symbolId).toBe('symbol:0');
	expect(diagnostic.message).toMatch(/JSX(CodeBlock|StyleElement|IfExpression)/);
	expect(diagnostic.docsUrl).toBe(`https://markless.dev/errors/${EMISSION_TSRX_NODE_CODE}`);
});

test('printing a TSRX tree is a diagnostic here, where upstream it is a crash', () => {
	const program = parseModule(TSRX_SOURCE, 'App.tsrx', { collect: true });

	// Why the assertion exists: without it this is the failure the compiler gets.
	expect(() => generate(program)).toThrow(/unsupported ESTree node type/);
	expect(() => generate(program, { strip: true })).toThrow(/unsupported ESTree node type/);

	expect(() =>
		printEmittedModule({
			program,
			source: TSRX_SOURCE,
			outputFileName: 'App.js',
			site,
		}),
	).toThrow(EmissionDiagnosticError);
});

test('the assertion does not fire on plain TypeScript or on plain JSX', () => {
	const { program: plain } = parseEmissionSource(
		'export function f(a: number) {\n  return a + 1;\n}',
		'a.ts',
	);
	expect(findTsrxOnlyNodeType(plain)).toBeNull();

	// Plain JSX prints without error in yuku-codegen@0.9.1, so refusing it would
	// be a false positive. Only the TSRX-exclusive node types are refused.
	const jsx = parseModule('const a = <div className="x">{y}</div>;', 'a.tsx', {
		...EMISSION_PARSE_OPTIONS,
	});
	expect(collectNodeTypes(jsx).has('JSXElement')).toBe(true);
	expect(findTsrxOnlyNodeType(jsx)).toBeNull();
	expect(generate(jsx, EMISSION_PRINT_OPTIONS).errors).toEqual([]);
});

// --- Determinism helper (invariant 7) --------------------------------------

test('the determinism helper passes a stable tree and returns its emitted module', () => {
	const source =
		'export async function symbol_0(context, event) {\n' +
		'  event.preventDefault();\n' +
		'  const next = context.graph.read("state:count", ["value"]) + 1;\n' +
		'  context.graph.write({ graphNodeId: "state:count", path: ["value"], value: next });\n' +
		'  return next > 10 ? "big" : "small";\n' +
		'}';
	const { program } = parseEmissionSource(source, 'Counter.tsrx');

	const emitted = assertDeterministicEmission({
		program,
		source,
		outputFileName: 'Counter.symbol_0.js',
		site,
	});

	expect(emitted.code).toBe(source);
	expect(emitted.map.sources).toEqual(['Counter.tsrx']);
});

test('the determinism helper catches an injected nondeterminism', () => {
	// A field computed on access: the printer encodes the tree on every call, so
	// two prints of this one program disagree.
	let counter = 0;
	const flaky = {
		type: 'Program',
		sourceType: 'module',
		body: [
			{
				type: 'VariableDeclaration',
				kind: 'const',
				declarations: [
					{
						type: 'VariableDeclarator',
						id: {
							type: 'Identifier',
							get name() {
								return `emitted_${counter++}`;
							},
						},
						init: { type: 'Literal', value: 1 },
					},
				],
			},
		],
	} as unknown as EmissionNode;

	let thrown: unknown;
	try {
		assertDeterministicEmission({
			program: flaky,
			source: 'const emitted_0 = 1;',
			outputFileName: 'flaky.js',
			site,
		});
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(EmissionDiagnosticError);
	expect((thrown as EmissionDiagnosticError).diagnostic.code).toBe(
		EMISSION_NONDETERMINISTIC_CODE,
	);
	expect((thrown as EmissionDiagnosticError).diagnostic.message).toContain(
		'printing the same tree twice produced different code',
	);
});
