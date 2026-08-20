/**
 * Parity for `emitDomBindingModule`, the last of the low-risk emitters in
 * stage 1 of `specs/framework/14-emission-codegen-migration.md`.
 *
 * The swap has landed: production emission at this site runs through the AST
 * printer, so the module the compiler ships and the module this suite prints
 * are one path. The pre-swap difference classes — dropped blank lines, tabs
 * becoming spaces, the collapsed object literal, the dropped trailing newline,
 * the redundant parentheses, and the import's quote style — no longer exist to
 * be measured, so this file pins the printed path alone: byte equality between
 * the two paths, plus the behavioral, determinism, source-map, and TSRX-node
 * gates that outlive the migration.
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

/**
 * Reprint a module through the same printer.
 *
 * Two modules that reprint to the same bytes differ only in what the printer
 * normalizes away — layout, blank lines, and parentheses the grammar does not
 * require. This is the parity claim that survives the printer being normalizing
 * rather than preserving.
 *
 * `normalizeQuotes` additionally drops every literal's `raw`, which is what the
 * `quotes: 'preserve'` option reads, so the comparison sees a literal's value
 * rather than the quote characters an author or emitter happened to type. Since
 * the swap both paths are one path and quote alike, so it changes no result
 * here; it stays because the structural claim it makes — same tree, whatever
 * the quoting — is the one this test means, and byte equality is pinned
 * separately by its own test.
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

test('the swapped production path is byte-equal to the printed module', () => {
	// The swap wired the dom-binding build through the printer, so the module the
	// compiler ships and the module this suite prints are one path.
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);
		expect(paths.spliced, `${fixture.name}: production diverged from the printed module`).toBe(
			paths.printed,
		);
	}
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
