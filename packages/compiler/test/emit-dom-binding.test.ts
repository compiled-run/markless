/**
 * Parity for `emitDomBindingModule`, the last of the low-risk emitters in
 * stage 1 of `specs/framework/14-emission-codegen-migration.md`.
 *
 * Both paths run here on the same symbols: the spliced string the compiler
 * emits today, and the tree the additive emitter builds and prints through
 * `emit-codegen.ts`. The spec's per-site acceptance asks for byte equality
 * where bytes are pinned and behavior equality elsewhere; this file measures
 * which of the two this site gets and records the exact difference, so the
 * owner's re-baseline decision (invariant 2) rests on evidence.
 *
 * The answer these fixtures give: the printed module is never byte-equal to the
 * spliced one, and the difference is never semantic. Six normalizations account
 * for all of it — see `differenceClasses` below. Only one of them, the import's
 * quote style, survives a reprint of both paths through the same printer; the
 * other five are layout the printer re-derives.
 *
 * This emitter synthesizes its whole module from render data, so unlike the
 * state-initializer site there is no authored text to splice and no authored
 * text to map back to. The map is non-null and names the authored file
 * (invariant 3) with no segments, which is asserted here rather than assumed.
 */
import { expect, test } from 'vitest';
import {
	assertDeterministicEmission,
	EMISSION_TSRX_NODE_CODE,
	EmissionDiagnosticError,
	findTsrxOnlyNodeType,
	parseEmissionSource,
	printEmittedModule,
	type EmissionNode,
} from '../src/passes/emit-codegen.ts';
import {
	buildDomBindingEmission,
	emitDomBindingModuleNodes,
	emitSymbolModules,
	type DomBindingEmissionInput,
} from '../src/passes/symbol-modules.ts';
import type { PlannedSymbol } from '../src/artifacts.ts';

type DomUpdateSymbol = Extract<PlannedSymbol, { readonly kind: 'dom-update' }>;

const SOURCE_FILE_NAME = '/workspace/app/src/App.tsrx';

type Fixture = {
	readonly name: string;
	readonly target: DomUpdateSymbol['target'];
	/**
	 * A context and the journal entry the emitted function must return for it.
	 * Empty for the text leaf, which returns a runtime call rather than an entry.
	 */
	readonly cases: ReadonlyArray<{
		readonly context: Record<string, unknown>;
		readonly expected: unknown;
	}>;
};

const HOST_NODE_ID = 'h1';

function textEntry(value: unknown, locator = HOST_NODE_ID): unknown {
	return { type: 'setText', locator, value };
}

function attributeEntry(name: string, value: unknown, locator = HOST_NODE_ID): unknown {
	return { type: 'setAttr', locator, name, value };
}

const FIXTURES: ReadonlyArray<Fixture> = [
	{
		// The one shape that emits an import and a runtime call instead of a
		// journal entry, and the only DOM binding the byte-equality golden pins.
		name: 'text-leaf',
		target: { kind: 'text' },
		cases: [],
	},
	{
		// Affixes: the concatenation the text path builds with hand-placed
		// parentheses, which the printer re-derives from precedence.
		name: 'text-prefix-suffix',
		target: { kind: 'text', prefix: 'Total: ', suffix: '!' },
		cases: [
			{ context: { value: 3 }, expected: textEntry('Total: 3!') },
			{ context: { value: null }, expected: textEntry('Total: !') },
			{ context: {}, expected: textEntry('Total: !') },
			{ context: { value: 'x' }, expected: textEntry('Total: x!') },
		],
	},
	{
		// A boolean text binding, and the fixture that exercises the locator
		// override the runtime passes on `context.domUpdate`.
		name: 'text-conditional',
		target: { kind: 'text', trueValue: 'On', falseValue: 'Off' },
		cases: [
			{ context: { value: true }, expected: textEntry('On') },
			{ context: { value: false }, expected: textEntry('Off') },
			{
				context: { value: true, domUpdate: { hostNodeId: 'h9' } },
				expected: textEntry('On', 'h9'),
			},
		],
	},
	{
		// Both text normalizations at once: the conditional is the operand the
		// text path parenthesizes twice.
		name: 'text-conditional-affixed',
		target: { kind: 'text', prefix: '[', suffix: ']', trueValue: 'On', falseValue: 'Off' },
		cases: [
			{ context: { value: true }, expected: textEntry('[On]') },
			{ context: { value: false }, expected: textEntry('[Off]') },
		],
	},
	{
		name: 'property',
		target: { kind: 'property', name: 'value' },
		cases: [
			{
				context: { value: 'abc' },
				expected: { type: 'setProp', locator: HOST_NODE_ID, name: 'value', value: 'abc' },
			},
			{
				context: { value: 'abc', domUpdate: { hostNodeId: 'h9' } },
				expected: { type: 'setProp', locator: 'h9', name: 'value', value: 'abc' },
			},
		],
	},
	{
		name: 'class-conditional',
		target: { kind: 'class', trueValue: 'active', falseValue: 'idle' },
		cases: [
			{ context: { value: true }, expected: attributeEntry('class', 'active') },
			{ context: { value: false }, expected: attributeEntry('class', 'idle') },
		],
	},
	{
		name: 'class-plain',
		target: { kind: 'class' },
		cases: [{ context: { value: 'a b' }, expected: attributeEntry('class', 'a b') }],
	},
	{
		name: 'style',
		target: { kind: 'style' },
		cases: [
			{ context: { value: 'color: red' }, expected: attributeEntry('style', 'color: red') },
		],
	},
	{
		name: 'attribute',
		target: { kind: 'attribute', name: 'aria-label' },
		cases: [{ context: { value: 'Close' }, expected: attributeEntry('aria-label', 'Close') }],
	},
];

type Paths = {
	readonly spliced: string;
	readonly printed: string;
	readonly exportName: string;
	readonly input: DomBindingEmissionInput;
	readonly mapFile: string | undefined;
	readonly mapSources: ReadonlyArray<string>;
	readonly mapMappings: string;
};

function domUpdateSymbol(fixture: Fixture): DomUpdateSymbol {
	return {
		id: 'symbol:0',
		kind: 'dom-update',
		hostNodeId: HOST_NODE_ID,
		source: 'count',
		graphNodeId: 'state:count',
		target: fixture.target,
	};
}

/**
 * Run both emitters over one fixture.
 *
 * The spliced side goes through `emitSymbolModules`, the pass entry point, so
 * the string under test is the one the compiler actually ships rather than a
 * re-derivation of it; `emitDomBindingModule` itself is not exported.
 */
function bothPaths(fixture: Fixture): Paths {
	const symbol = domUpdateSymbol(fixture);
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [symbol],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: { passId: 'capture-analysis', extractedSymbols: [], diagnostics: [] },
	});

	const spliced = artifact.modules.find((module) => module.kind === 'dom-update');
	if (!spliced) throw new Error(`fixture ${fixture.name} produced no dom-update module`);

	const input: DomBindingEmissionInput = { symbol, sourceFileName: SOURCE_FILE_NAME };
	const emitted = emitDomBindingModuleNodes(input);

	return {
		spliced: spliced.source,
		printed: emitted.code,
		exportName: spliced.exportName,
		input,
		mapFile: emitted.map.file,
		mapSources: emitted.map.sources ?? [],
		mapMappings: emitted.map.mappings,
	};
}

/** Leading whitespace only. Tokens, blank lines, and line breaks stay put. */
function normalizeIndentation(code: string): string {
	return code
		.split('\n')
		.map((line) => line.replace(/^[\t ]+/, ''))
		.join('\n');
}

/**
 * Reprint a module through the same printer.
 *
 * Two modules that reprint to the same bytes differ only in what the printer
 * normalizes away — layout, blank lines, and parentheses the grammar does not
 * require. This is the parity claim that survives the printer being normalizing
 * rather than preserving.
 *
 * `normalizeQuotes` additionally drops every literal's `raw`, which is what the
 * `quotes: 'preserve'` option reads. The two paths quote the one module
 * specifier they emit differently — the text path hard-codes single quotes, the
 * printed path emits a synthesized literal — so the option preserves a
 * difference that is not structural. Dropping `raw` makes the comparison see
 * past it, and the difference itself is pinned as a named class below rather
 * than normalized out of sight.
 */
function reprint(code: string, normalizeQuotes = false): string {
	const { program, errors } = parseEmissionSource(code, SOURCE_FILE_NAME, 'ts');
	expect(errors).toEqual([]);
	if (normalizeQuotes) dropLiteralRaw(program);

	return printEmittedModule({
		program,
		source: code,
		outputFileName: 'reprint.js',
		site: { phase: 'payload', passId: 'symbol-modules', sourceFileName: SOURCE_FILE_NAME },
	}).code;
}

function dropLiteralRaw(root: unknown): void {
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

		const node = value as Record<string, unknown>;
		if (node.type === 'Literal' && typeof node.raw === 'string') delete node.raw;
		for (const [key, child] of Object.entries(node)) {
			if (key === 'parent' || key === 'loc' || key === 'range') continue;
			stack.push(child);
		}
	}
}

/** Run an emitted module and call its exported binding with one context. */
function runModule(
	code: string,
	exportName: string,
	context: Record<string, unknown>,
	updateText?: (context: unknown, hostNodeId: string) => unknown,
): unknown {
	const body = `${code
		.split('\n')
		.filter((line) => !line.startsWith('import '))
		.join('\n')
		.replaceAll(/^export /gm, '')}\nreturn ${exportName};`;
	const binding = new Function('marklessUpdateText', body)(updateText) as (
		context: unknown,
	) => unknown;
	return binding(context);
}

test('the printed dom-binding module is structurally identical to the spliced one', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);

		expect(
			reprint(paths.printed, true),
			`${fixture.name}: printed and spliced modules reprint differently`,
		).toBe(reprint(paths.spliced, true));
	}
});

test('quote style is the only difference a reprint of both paths does not erase', () => {
	const differing = FIXTURES.filter(
		(fixture) => {
			const paths = bothPaths(fixture);
			return reprint(paths.printed) !== reprint(paths.spliced);
		},
	).map((fixture) => fixture.name);

	// Only the text leaf emits an import, and the module specifier is the only
	// string literal whose quoting the two paths disagree about.
	expect(differing).toEqual(['text-leaf']);

	const leaf = bothPaths(FIXTURES[0]!);
	expect(reprint(leaf.spliced)).toContain("from '@markless/web/fns/update-text'");
	expect(reprint(leaf.printed)).toContain('from "@markless/web/fns/update-text"');
	expect(reprint(leaf.printed).replace('"@markless/web/fns/update-text"', "'@markless/web/fns/update-text'")).toBe(
		reprint(leaf.spliced),
	);
});

test('the printed and spliced journal entries are equal, and are the expected entry', () => {
	for (const fixture of FIXTURES) {
		if (fixture.cases.length === 0) continue;
		const paths = bothPaths(fixture);

		for (const { context, expected } of fixture.cases) {
			const fromSpliced = runModule(paths.spliced, paths.exportName, context);
			const fromPrinted = runModule(paths.printed, paths.exportName, context);

			expect(fromSpliced, `${fixture.name}: spliced entry`).toEqual(expected);
			expect(fromPrinted, `${fixture.name}: printed entry`).toEqual(expected);
		}
	}
});

test('the text leaf calls the update-text runtime the same way on both paths', () => {
	const paths = bothPaths(FIXTURES[0]!);
	const calls: unknown[][] = [];
	const stub = (context: unknown, hostNodeId: string) => {
		calls.push([context, hostNodeId]);
		return 'updated';
	};

	const context = { value: 'ignored' };
	expect(runModule(paths.spliced, paths.exportName, context, stub)).toBe('updated');
	expect(runModule(paths.printed, paths.exportName, context, stub)).toBe('updated');
	expect(calls).toEqual([
		[context, HOST_NODE_ID],
		[context, HOST_NODE_ID],
	]);

	// The marker comment is not decoration: the byte-equality golden pins it, so
	// the printed path has to carry it across into a synthesized program.
	expect(paths.printed).toContain('/* text update leaf marker: type: "setText" */');
});

test('the printed module is not byte-equal, and the difference is exactly the printer normalizing', () => {
	const summary: Record<string, ReadonlyArray<string>> = {};

	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);
		summary[fixture.name] = differenceClasses(paths.spliced, paths.printed);
	}

	// Every class here is a printer normalization the spec already records as a
	// known upstream behavior, or a quoting choice the emission foundation states
	// once. None of them changes what the module does.
	expect(summary).toEqual({
		'text-leaf': [
			'blank-lines-dropped',
			'indentation-tabs-to-spaces',
			'module-specifier-double-quoted',
			'trailing-newline-dropped',
		],
		'text-prefix-suffix': [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'trailing-newline-dropped',
		],
		'text-conditional': [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'trailing-newline-dropped',
		],
		'text-conditional-affixed': [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'redundant-parentheses-dropped',
			'trailing-newline-dropped',
		],
		property: [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'trailing-newline-dropped',
		],
		'class-conditional': [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'trailing-newline-dropped',
		],
		'class-plain': [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'trailing-newline-dropped',
		],
		style: [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'trailing-newline-dropped',
		],
		attribute: [
			'indentation-tabs-to-spaces',
			'object-literal-collapsed',
			'trailing-newline-dropped',
		],
	});
});

test('normalizing indentation alone does not make the two paths equal', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);

		expect(paths.printed).not.toBe(paths.spliced);
		// Stated as a fact, not as a wish: indentation is the smallest of the
		// differences at this site, so an indentation-only normalizer cannot close
		// the gap and the swap needs the owner's approval on the rest.
		expect(
			normalizeIndentation(paths.printed),
			`${fixture.name}: indentation alone closed the gap`,
		).not.toBe(normalizeIndentation(paths.spliced));
	}
});

/** The named normalizations that separate the two paths, sorted for stability. */
function differenceClasses(spliced: string, printed: string): string[] {
	const classes = new Set<string>();

	if (spliced.includes('\n\n') && !printed.includes('\n\n')) classes.add('blank-lines-dropped');
	if (spliced.endsWith('\n') && !printed.endsWith('\n')) classes.add('trailing-newline-dropped');
	if (/^\t/m.test(spliced) && !/^\t/m.test(printed) && /^ {2}/m.test(printed))
		classes.add('indentation-tabs-to-spaces');
	if (spliced.includes("from '") && printed.includes('from "'))
		classes.add('module-specifier-double-quoted');
	if (spliced.includes('return {\n') && printed.includes('return { '))
		classes.add('object-literal-collapsed');
	if (spliced.includes('String((') && !printed.includes('String(('))
		classes.add('redundant-parentheses-dropped');

	return [...classes].sort();
}

test('emission is deterministic and reaches a reparse fixpoint at this site', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);
		// Prints twice and requires identical bytes and identical mappings, then
		// reparses the emitted source and requires reprinting it to be a fixpoint
		// (invariant 7 — no recorded probe establishes printer determinism).
		const emitted = assertDeterministicEmission(buildDomBindingEmission(paths.input));

		expect(emitted.code, `${fixture.name}: determinism helper disagreed with the emitter`).toBe(
			paths.printed,
		);
	}
});

test('every printed module carries a non-null source map naming the authored file', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);

		expect(paths.mapSources).toEqual([SOURCE_FILE_NAME]);
		expect(paths.mapFile).toBe(`${paths.exportName}.js`);
		// Recorded, not wished away: this emitter synthesizes every node from
		// render data, so no node carries a span into the authored file and the
		// map has no segments. Invariant 3's requirement is a non-null map; a
		// segment-bearing map would need authored text this site never splices.
		expect(paths.mapMappings, `${fixture.name}: unexpected map segments`).toBe('');
	}
});

test('the TSRX-node assertion is live at this site', () => {
	const paths = bothPaths(FIXTURES[0]!);
	const clean = buildDomBindingEmission(paths.input);

	expect(findTsrxOnlyNodeType(clean.program)).toBeNull();

	const program = clean.program as unknown as { readonly body: EmissionNode[] };
	const poisoned = {
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

test('the marker comment survives a reparse of the printed leaf', () => {
	const paths = bothPaths(FIXTURES[0]!);

	// The comment lives on the node's own `comments` array, which is what the
	// printer reads and what the parser writes. If a reparse dropped it, the
	// fixpoint check above would still pass on a module missing the marker the
	// golden pins, so it is asserted separately.
	expect(reprint(paths.printed)).toContain('/* text update leaf marker: type: "setText" */');
});
