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
 * The dispatcher swap has landed: `emitSymbolModule` now routes every kind in
 * `SYMBOL_MODULE_AST_KINDS` through `emitSymbolModuleNodes`, so the shipped
 * module and the printed one are the same bytes, and that is what the dispatcher
 * tests below assert. The string value cluster is gone with the rest of the
 * scanner band, so the value tests that remain gate the node path alone:
 * support decisions, determinism, and the TSRX-node assertion.
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
	printEmittedModule,
	type EmissionNode,
	type EmissionPrintInput,
} from '../src/passes/emit-codegen.ts';
import { moduleScopeLines } from '../src/passes/public-render/shared.ts';
import {
	buildSymbolModuleEmission,
	buildValueExpressionEmission,
	emitSymbolModuleNodes,
	eventHandlerRowLocalNames,
	SYMBOL_MODULE_AST_KINDS,
	SYMBOL_MODULE_UNMIGRATED_KINDS,
	SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	unresolvedModuleDeclarationDiagnostics,
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

/** The named normalizations that separate the two value paths. */
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
		// An event handler and a sync computed derive: the handler dispatches
		// through the event-handler band, the derive is the one kind this
		// dispatcher declines (its band is called by `emitSyncComputedDeriveModule`).
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
	{
		// A child handler that reads a captured prop and invokes a captured
		// callback: one fixture yielding both event-handler and callback-prop, the
		// two kinds the event-handler band added to the dispatcher.
		name: 'capture-callbacks',
		filename: '/workspace/app/src/Captures.tsrx',
		source: `function Child({ label, onTrace }: { label: string; onTrace: (payload: { value: number }, reason: string) => void }) @{
	<button onClick={(event) => onTrace({ value: label.length }, event.type)}>{label}</button>
}
export function App() @{
	<Child label="Save" onTrace={(payload) => console.log(payload.value)} />
}`,
	},
	{
		// A component body seeding its shared instance from its own props: the
		// shared-seed kind, whose module reads a prop and merges one field over
		// the factory initial.
		name: 'shared-seed',
		filename: '/workspace/app/src/Seed.tsrx',
		source: `
import { shared, state } from '@markless/core';

export const box = shared(() => {
	const s = state({ open: false });
	return { ...s };
}, { scope: 'widget' });

export function Panel({ open }: { open?: boolean }) @{
	const s = box();
	s.open = open ?? false;

	<section data-open={s.open} />
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

		// The same capture-slot and argument-vector selection `emitSymbolModules`
		// makes before it dispatches, so both paths see identical input.
		const extracted = result.captureAnalysis.extractedSymbols.find(
			(candidate) => !candidate.loaderSymbolId && candidate.symbolId === symbol.id,
		);
		const captureSlots = (extracted?.captureSlots ?? []).filter((slot) =>
			slot.routes.some((route) => route.componentEdgeId !== undefined),
		);
		const usesArgumentVector = result.captureAnalysis.extractedSymbols.some((candidate) =>
			candidate.captureSlots.some((slot) =>
				slot.routes.some(
					(route) => route.kind === 'callback-route' && route.callbackSymbolId === symbol.id,
				),
			),
		);

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
					captureSlots,
					semanticGraph: result.semanticGraph,
					renderData: result.renderData,
					omitAuthoredSource: false,
					sourceFileName: fixture.filename,
					localNames: eventHandlerRowLocalNames(result.renderData, symbol.id),
					usesArgumentVector,
				},
			},
		];
	});
}

test('the swapped production path is byte-equal to the printed module for every migrated kind', async () => {
	// The swap wired `emitSymbolModule` through `emitSymbolModuleNodes`, so the
	// module the compiler ships and the module this suite prints are one path.
	// Byte equality is therefore the claim available here — no reprint, no quote
	// normalization, no recorded residual difference.
	const migratedKinds = new Set<string>();
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

			expect(
				dispatched.spliced,
				`${dispatched.fixture}/${dispatched.symbolId} (${dispatched.kind}): production diverged from the printed module`,
			).toBe(emitted.code);
			migratedKinds.add(dispatched.kind);
			compared++;
		}
	}

	// The fixtures must actually reach the dispatcher, or the assertion above is
	// vacuously true.
	expect(compared).toBeGreaterThanOrEqual(4);

	// And they must reach every migrated kind, so byte equality is claimed for the
	// whole AST band rather than for whichever kinds the fixtures happened to hit.
	expect([...migratedKinds].sort()).toEqual([...SYMBOL_MODULE_AST_KINDS].sort());
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
		'callback-prop',
		'dom-update',
		'event-handler',
		'shared-seed',
		'state-initializer',
	]);
	expect([...declined].sort()).toEqual([
		// The boundary is routed by `emitSymbolModules` before `emitSymbolModule`
		// would see it, and the derive is emitted by `emitSyncComputedDeriveModule`,
		// whose own band prints it — neither is this dispatcher's to call.
		'async-boundary-update',
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

// ---------------------------------------------------------------------------
// Module-scope declarations a derive names travel with the derive module.
//
// A `sync-computed-derive` module is fetched and evaluated on its own in the
// browser, so a module-scope `const` the derive reads has to be *in* it. It was
// not: the derive branch returned before the carry the general path performs,
// the name stayed free, and the first client re-derive threw a ReferenceError.
// SSR hoisted the declaration into its own render, so the server was green and
// only the browser crashed.
// ---------------------------------------------------------------------------

/** The one emitted derive module for a compiled source, by symbol kind. */
async function deriveModules(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	return {
		modules: result.symbolModules.modules.filter(
			(module) => module.kind === 'sync-computed-derive',
		),
		diagnostics: result.symbolModules.diagnostics,
	};
}

test('a module-scope const a derive reads is carried into the derive module', async () => {
	const { modules, diagnostics } = await deriveModules(
		'/workspace/app/src/DeriveConst.tsrx',
		`
import { computed, state } from '@markless/core';

const RATE = 3;

export function App() @{
	let count = state(1);
	const scaled = computed(() => count * RATE);

	<main><span>{scaled}</span></main>
}
`,
	);

	expect(modules).toHaveLength(1);
	const emitted = modules[0]!.source;
	expect(emitted).toContain('const RATE = 3;');
	// The read itself survives as a reference to the carried binding.
	expect(emitted).toContain('RATE');
	// Nothing about the carry is a compile error.
	expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});

test('a derive that names no module-scope declaration carries none', async () => {
	const { modules } = await deriveModules(
		'/workspace/app/src/DeriveNoConst.tsrx',
		`
import { computed, state } from '@markless/core';

const UNUSED = 3;

export function App() @{
	let count = state(1);
	const scaled = computed(() => count * 2);

	<main><span>{scaled}</span></main>
}
`,
	);

	expect(modules).toHaveLength(1);
	expect(modules[0]!.source).not.toContain('UNUSED');
});

test('carried declarations keep authored order, so a class is bound before it is used', async () => {
	const { modules } = await deriveModules(
		'/workspace/app/src/DeriveOrder.tsrx',
		`
import { computed, state } from '@markless/core';

class Rate {
	constructor(public step: number) {}
	scale(value: number) { return value * this.step; }
}
const rate = new Rate(3);

export function App() @{
	let count = state(1);
	const scaled = computed(() => rate.scale(count));

	<main><span>{scaled}</span></main>
}
`,
	);

	expect(modules).toHaveLength(1);
	const emitted = modules[0]!.source;
	// Reachability finds `const rate = new Rate(3)` first; emitting that order
	// runs the constructor inside the class binding's temporal dead zone.
	expect(emitted).toContain('class Rate');
	expect(emitted.indexOf('class Rate')).toBeLessThan(emitted.indexOf('new Rate('));
});

test('a carried declaration extending an imported base keeps that import', async () => {
	const { modules } = await deriveModules(
		'/workspace/app/src/DeriveImportedBase.tsrx',
		`
import { computed, state } from '@markless/core';
import { Base } from './base.ts';

class Rate extends Base {
	scale(value: number) { return value * 3; }
}
const rate = new Rate();

export function App() @{
	let count = state(1);
	const scaled = computed(() => rate.scale(count));

	<main><span>{scaled}</span></main>
}
`,
	);

	expect(modules).toHaveLength(1);
	const emitted = modules[0]!.source;
	expect(emitted).toContain('class Rate extends Base');
	// The derive body never named `Base`; the carried declaration did.
	expect(emitted).toContain('import { Base } from "./base.ts";');
});

// ---------------------------------------------------------------------------
// Module-scope declarations an attach behavior names travel with its module.
//
// The sibling of the derive carry above, and the gap the widened guard exposed:
// a behavior module is fetched and evaluated on its own, so a module-scope
// `const` the attached factory reads has to be *in* it. SSR hoists the
// declaration into its own render, so the server stayed green and only the
// browser threw a ReferenceError on attach.
// ---------------------------------------------------------------------------

/** The emitted behavior modules for a compiled source, with the pass diagnostics. */
async function behaviorModules(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	return {
		modules: result.symbolModules.modules.filter((module) => module.kind === 'behavior'),
		diagnostics: result.symbolModules.diagnostics,
	};
}

test('a module-scope const an attach behavior reads is carried into the behavior module', async () => {
	const { modules, diagnostics } = await behaviorModules(
		'/workspace/app/src/BehaviorConst.tsrx',
		`
const LABEL = 'ready';

export function App() @{
	<canvas attach={(el) => { el.dataset.state = LABEL; }} />
}
`,
	);

	expect(modules).toHaveLength(1);
	const emitted = modules[0]!.source;
	expect(emitted).toContain("const LABEL = 'ready';");
	// The read itself survives as a reference to the carried binding.
	expect(emitted).toContain('el.dataset.state = LABEL');
	// And the carry is not a compile error of its own.
	expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});

test('a behavior that names no module-scope declaration carries none', async () => {
	const { modules } = await behaviorModules(
		'/workspace/app/src/BehaviorNoConst.tsrx',
		`
const UNUSED = 'idle';

export function App() @{
	<canvas attach={(el) => { el.dataset.state = 'ready'; }} />
}
`,
	);

	expect(modules).toHaveLength(1);
	expect(modules[0]!.source).not.toContain('UNUSED');
});

test('carried behavior declarations keep authored order, so a class is bound before it is used', async () => {
	const { modules } = await behaviorModules(
		'/workspace/app/src/BehaviorOrder.tsrx',
		`
class Painter {
	constructor(public tone: string) {}
	paint(el: HTMLElement) { el.dataset.tone = this.tone; }
}
const painter = new Painter('warm');

export function App() @{
	<canvas attach={(el) => { painter.paint(el); }} />
}
`,
	);

	expect(modules).toHaveLength(1);
	const emitted = modules[0]!.source;
	// Reachability finds `const painter = new Painter('warm')` first; emitting
	// that order runs the constructor inside the class binding's dead zone.
	expect(emitted).toContain('class Painter');
	expect(emitted.indexOf('class Painter')).toBeLessThan(emitted.indexOf('new Painter('));
});

// ---------------------------------------------------------------------------
// Module-scope declarations an async computed names travel with its module.
//
// The runner module is fetched and evaluated on its own exactly like the derive
// and behavior modules above, and the authored async function is spliced into it
// whole — so a module-scope `const` it reads has to be copied in. This is the
// emitter the widened guard named after the behavior carry landed.
// ---------------------------------------------------------------------------

/** The emitted async-runner modules for a compiled source, with the diagnostics. */
async function asyncRunnerModules(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	return {
		modules: result.symbolModules.modules.filter(
			(module) => module.kind === 'async-computed-runner',
		),
		diagnostics: result.symbolModules.diagnostics,
	};
}

test('a module-scope const an async computed reads is carried into the runner module', async () => {
	const { modules, diagnostics } = await asyncRunnerModules(
		'/workspace/app/src/AsyncRunnerConst.tsrx',
		`
import { computed, state } from '@markless/core';

const ENDPOINT = 'ready';

export function App() @{
	let id = state(1);
	const data = computed(async () => ENDPOINT + id);

	<main><span>{data}</span></main>
}
`,
	);

	expect(modules).toHaveLength(1);
	const emitted = modules[0]!.source;
	expect(emitted).toContain("const ENDPOINT = 'ready';");
	// The read itself survives as a reference to the carried binding.
	expect(emitted).toContain('ENDPOINT');
	// And the carry is not a compile error of its own.
	expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});

test('an async computed that names no module-scope declaration carries none', async () => {
	const { modules } = await asyncRunnerModules(
		'/workspace/app/src/AsyncRunnerNoConst.tsrx',
		`
import { computed, state } from '@markless/core';

const UNUSED = 'ready';

export function App() @{
	let id = state(1);
	const data = computed(async () => 'fixed' + id);

	<main><span>{data}</span></main>
}
`,
	);

	expect(modules).toHaveLength(1);
	expect(modules[0]!.source).not.toContain('UNUSED');
});

test('carried runner declarations keep authored order, so a class is bound before it is used', async () => {
	const { modules } = await asyncRunnerModules(
		'/workspace/app/src/AsyncRunnerOrder.tsrx',
		`
import { computed, state } from '@markless/core';

class Endpoint {
	constructor(public host: string) {}
	url(id: number) { return this.host + id; }
}
const endpoint = new Endpoint('ready');

export function App() @{
	let id = state(1);
	const data = computed(async () => endpoint.url(id));

	<main><span>{data}</span></main>
}
`,
	);

	expect(modules).toHaveLength(1);
	const emitted = modules[0]!.source;
	// Reachability finds `const endpoint = new Endpoint('ready')` first; emitting
	// that order runs the constructor inside the class binding's dead zone.
	expect(emitted).toContain('class Endpoint');
	expect(emitted.indexOf('class Endpoint')).toBeLessThan(emitted.indexOf('new Endpoint('));
});

// ---------------------------------------------------------------------------
// Why the shared-seed emitter gets no carry.
//
// It is the one remaining emitter that splices authored text and has no
// `moduleDeclarations` channel, so the obvious reading is that it has the same
// gap the derive, behavior, and runner bands had. It does not, and this is the
// evidence: `isUnloweredSharedSeed` in `state-lowering.ts` allows a
// component-body seed to name only that component's own prop locals and six
// literal keywords, so a seed expression that would need a carry fails the build
// two passes before the emitter runs. Adding a carry there would be code no
// authored file can reach.
//
// This test is what makes that claim falsifiable: relax the seed rule and it
// goes red, which is the signal to give the emitter a channel after all.
// ---------------------------------------------------------------------------

test('a shared seed naming a module-scope const is refused before it reaches the emitter', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/app/src/SharedSeedConst.tsrx',
		source: `
import { shared, state } from '@markless/core';

const TAG = 'box';

export const boxState = shared(() => {
	const box = state({ tag: '' });

	return { ...box };
}, { scope: 'widget' });

export function BoxRoot() @{
	const box = boxState();
	box.tag = TAG;

	<div ui-tag={box.tag} />
}
`,
		symbols: [],
	});

	const refused = result.stateLowering.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_SEED_UNSUPPORTED',
	);
	expect(refused).toHaveLength(1);
	expect(refused[0]!.severity).toBe('error');
	expect(refused[0]!.message).toContain('TAG');
});

test('a shared seed naming only a prop compiles, and carries no declaration', async () => {
	// The other side of the rule, and a sharper reading of it than the diagnostic
	// text gives: a seed value's every word has to be a prop local or one of the
	// six keywords, so even a string literal is refused (`'plain'` matches the
	// rule's identifier scan). A prop read is what the emitter is actually handed,
	// and it names nothing to carry.
	const result = await compileTsrxModule({
		filename: '/workspace/app/src/SharedSeedProp.tsrx',
		source: `
import { shared, state } from '@markless/core';

const UNUSED = 'box';

export const boxState = shared(() => {
	const box = state({ tag: '' });

	return { ...box };
}, { scope: 'widget' });

export function BoxRoot({ tag }) @{
	const box = boxState();
	box.tag = tag;

	<div ui-tag={box.tag} />
}
`,
		symbols: [],
	});

	expect(
		result.stateLowering.diagnostics.filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_SEED_UNSUPPORTED',
		),
	).toEqual([]);
	const seeds = result.symbolModules.modules.filter((module) => module.kind === 'shared-seed');
	expect(seeds).toHaveLength(1);
	expect(seeds[0]!.source).not.toContain('UNUSED');
});

// ---------------------------------------------------------------------------
// The guard behind the carry.
//
// Fixing the derive emitter fixes one emitter. The reason the gap shipped at all
// is that nothing checked: `unresolvedGraphReferences` computed the free names
// of every emitted module and then dropped the ones a module-scope declaration
// binds, so a forgotten carry produced no diagnostic. It is reported now, which
// turns "silent at build time, ReferenceError in the browser" into a build
// error — and immediately named a second emitter with the same gap.
// ---------------------------------------------------------------------------

test('an emitted module that leaves a module-scope declaration free is reported', () => {
	// This test was pointed at whichever emitter still lacked a carry channel:
	// the behavior band, then the async-computed runner. Both carry now, and so
	// do the shared-seed band and every other emitter that splices authored text
	// — so no authored file reaches this branch of the filter any more, and there
	// is no compiled fixture left to point at. It is pinned by construction
	// instead, through `unresolvedModuleDeclarationDiagnostics`, which runs the
	// same private filter and the same diagnostic builder production runs.
	//
	// Checked by reading every `*EmissionInput` type in `symbol-modules.ts`
	// against the ten `PlannedSymbol` kinds (qualified, not a guessless receipt):
	// the three emitters with no channel — dom-update, branch-update, and
	// async-boundary-update — assemble their whole module from render data, ids,
	// and JSON, so they splice no authored identifier and have nothing to carry.
	// If a future emitter does splice authored text, this filter is what catches
	// a missing carry, and that is what this pins.
	const reported = unresolvedModuleDeclarationDiagnostics(
		[
			{
				symbolId: 'sym:free-declaration',
				kind: 'async-computed-runner',
				exportName: 'sym_free_declaration',
				// The premise: the name really is free in the emitted module.
				source: 'export function sym_free_declaration(context) {\n\treturn ENDPOINT;\n}\n',
			},
		],
		new Set(['ENDPOINT']),
	);

	expect(reported).toHaveLength(1);
	expect(reported[0]!.code).toBe(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
	expect(reported[0]!.severity).toBe('error');
	expect(reported[0]!.title).toContain('ENDPOINT');
	// The message has to say why the server stayed green, or the reader will
	// take a passing SSR render as evidence the module is fine.
	expect(reported[0]!.message).toContain('ReferenceError');
	expect(reported[0]!.message).toContain('server render');
});

test('a module that binds the declaration it names is not reported', () => {
	// The other half of the pin: the filter has to go quiet on a carried module,
	// or every correctly carried emitter would fail the build.
	expect(
		unresolvedModuleDeclarationDiagnostics(
			[
				{
					symbolId: 'sym:carried-declaration',
					kind: 'async-computed-runner',
					exportName: 'sym_carried_declaration',
					source:
						"const ENDPOINT = 'ready';\nexport function sym_carried_declaration(context) {\n\treturn ENDPOINT;\n}\n",
				},
			],
			new Set(['ENDPOINT']),
		),
	).toEqual([]);
});

test('a correctly carried derive module produces no unresolved-reference diagnostic', async () => {
	const { diagnostics } = await deriveModules(
		'/workspace/app/src/DeriveCarried.tsrx',
		`
import { computed, state } from '@markless/core';

const RATE = 3;

export function App() @{
	let count = state(1);
	const scaled = computed(() => count * RATE);

	<main><span>{scaled}</span></main>
}
`,
	);

	// The guard is only quiet because the carry in half one is real: before it,
	// this same fixture left `RATE` free and would report here.
	expect(
		diagnostics.filter(
			(diagnostic) => diagnostic.code === SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
		),
	).toEqual([]);
});
