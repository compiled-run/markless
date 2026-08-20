/**
 * Parity for `emitBehaviorModule`, one of the low-risk emitters in stage 1 of
 * `specs/framework/14-emission-codegen-migration.md`.
 *
 * Both paths run here: the spliced string the compiler emits today, and the
 * tree the additive emitter builds and prints through `emit-codegen.ts`. The
 * spec's per-site acceptance asks for byte equality where bytes are pinned and
 * behavior equality elsewhere; this file measures which of the two this site
 * gets and records the exact difference, so the owner's re-baseline decision
 * (invariant 2) rests on evidence rather than on a claim.
 *
 * Nothing here swaps the wired path. `emitBehaviorModule` still produces the
 * bytes the compiler ships; `buildBehaviorEmission` produces the bytes it would
 * ship after an approved re-baseline.
 *
 * The answer these fixtures give: the printed module is never byte-equal to the
 * spliced one. Indentation is the smallest part of the gap, so the divergence
 * summary below is computed on indentation-normalized text and reports only
 * what survives that normalization — blank lines, the trailing newline, the
 * parentheses the text path puts around an immediately-invoked factory, and the
 * factory body being reflowed. None of the four changes what the module does,
 * which the reprint and evaluation tests prove independently.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
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
	buildBehaviorEmission,
	canEmitBehaviorModule,
	emitBehaviorModuleNodes,
	type BehaviorEmissionInput,
} from '../src/passes/symbol-modules.ts';

type Fixture = {
	readonly name: string;
	readonly filename: string;
	readonly source: string;
	/** What the runtime would hand the factory as `context.behaviorInputs`. */
	readonly behaviorInputs: ReadonlyArray<unknown>;
	/**
	 * The host element's `dataset` after the behavior runs, or `null` when the
	 * emitted module still imports and so cannot be evaluated in isolation.
	 */
	readonly expectedDataset: Readonly<Record<string, string>> | null;
	/** The import line the module must carry, for the imported-factory shapes. */
	readonly expectedImport?: string;
};

const FIXTURES: ReadonlyArray<Fixture> = [
	{
		// The zero-input shape: an inline arrow attached directly. This is the
		// only form that emits `const inputs = [];` and calls the factory result
		// without a spread.
		name: 'inline-arrow-no-inputs',
		filename: '/workspace/app/src/InlineArrow.tsrx',
		source: `
export function App() @{
	<canvas attach={(el) => { el.dataset.ready = 'yes'; }} />
}
`,
		behaviorInputs: [],
		expectedDataset: { ready: 'yes' },
	},
	{
		// A same-file factory, the shape `compile-module.test.ts` pins as "B908
		// Unit B emits same-file function declaration behavior factories". The
		// whole `function` declaration is spliced into an initializer position,
		// so the text path has to parenthesize it and the printer does not.
		name: 'same-file-factory',
		filename: '/workspace/app/src/BehaviorFactory.tsrx',
		source: `
import { state } from '@markless/core';

function installChart(options) {
	return (canvas) => {
		canvas.dataset.points = String(options.points);
	};
}

export function App() @{
	const config = state({ points: 3 });

	<canvas attach={installChart(config)} />
}
`,
		behaviorInputs: [{ points: 7 }],
		expectedDataset: { points: '7' },
	},
	{
		// An imported factory: the only shape that emits an import, and the shape
		// whose `functionSource` is a bare identifier rather than a function.
		name: 'imported-factory',
		filename: '/workspace/app/src/Imported.tsrx',
		source: `
import { installRow } from './row-behavior.ts';

export function App() @{
	<tr attach={installRow('a')}><td>x</td></tr>
}
`,
		behaviorInputs: ['a'],
		expectedDataset: null,
		expectedImport: 'import { installRow } from "./row-behavior.ts";',
	},
	{
		// An aliased default import, to cover the other two `moduleImportNode`
		// shapes the behavior emitter can reach.
		name: 'default-import-factory',
		filename: '/workspace/app/src/DefaultImport.tsrx',
		source: `
import installDefault from './default-behavior.ts';

export function App() @{
	<tr attach={installDefault('b')}><td>y</td></tr>
}
`,
		behaviorInputs: ['b'],
		expectedDataset: null,
		expectedImport: 'import installDefault from "./default-behavior.ts";',
	},
];

type Paths = {
	readonly spliced: string;
	readonly printed: string;
	readonly exportName: string;
	readonly input: BehaviorEmissionInput;
	readonly mapFile: string | undefined;
	readonly mapSources: ReadonlyArray<string>;
	readonly mappings: string;
};

async function bothPaths(fixture: Fixture, omitAuthoredSource = false): Promise<Paths> {
	const result = await compileTsrxModule({
		filename: fixture.filename,
		source: fixture.source,
		symbols: [],
		...(omitAuthoredSource ? { omitAuthoredSource: true } : {}),
	});

	const spliced = result.symbolModules.modules.find((module) => module.kind === 'behavior');
	const symbol = result.symbolResolver.symbols.find((candidate) => candidate.kind === 'behavior');
	if (!spliced || !symbol || symbol.kind !== 'behavior') {
		throw new Error(`fixture ${fixture.name} produced no behavior symbol`);
	}

	const input: BehaviorEmissionInput = {
		symbol,
		omitAuthoredSource,
		sourceFileName: fixture.filename,
	};
	const emitted = emitBehaviorModuleNodes(input);

	return {
		spliced: spliced.source,
		printed: emitted.code,
		exportName: spliced.exportName,
		input,
		mapFile: emitted.map.file,
		mapSources: emitted.map.sources ?? [],
		mappings: emitted.map.mappings,
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
 */
function reprint(code: string, filename: string): string {
	const { program, errors } = parseEmissionSource(code, filename, 'ts');
	expect(errors).toEqual([]);
	return printEmittedModule({
		program,
		source: code,
		outputFileName: 'reprint.js',
		site: { phase: 'payload', passId: 'symbol-modules', sourceFileName: filename },
	}).code;
}

/**
 * Run an emitted, import-free behavior module: call its exported entry with a
 * stub context and report what the behavior did to the host element.
 */
function runBehavior(
	code: string,
	exportName: string,
	behaviorInputs: ReadonlyArray<unknown>,
): Record<string, string> {
	const body = `${code.replaceAll(/^export /gm, '')}\nreturn ${exportName};`;
	// eslint-disable-next-line no-new-func
	const entry = new Function(body)() as (context: unknown) => unknown;
	const element = { dataset: {} as Record<string, string> };
	entry({ element, behaviorInputs });
	return element.dataset;
}

test('the printed behavior module is structurally identical to the spliced one', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(
			reprint(paths.printed, fixture.filename),
			`${fixture.name}: printed and spliced modules reprint differently`,
		).toBe(reprint(paths.spliced, fixture.filename));
	}
});

test('both paths emit the same import for an imported factory', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		if (fixture.expectedImport === undefined) {
			expect(paths.printed, `${fixture.name}: unexpected import`).not.toContain('import ');
			expect(paths.spliced, `${fixture.name}: unexpected import`).not.toContain('import ');
			continue;
		}

		// Named and default specifiers both, so the printed path is exercised on
		// more than one `moduleImportNode` shape.
		expect(paths.printed).toContain(fixture.expectedImport);
		expect(paths.spliced).toContain(fixture.expectedImport);
	}
});

test('the printed and spliced behaviors do the same thing to the host element', async () => {
	for (const fixture of FIXTURES) {
		if (fixture.expectedDataset === null) continue;
		const paths = await bothPaths(fixture);

		expect(runBehavior(paths.spliced, paths.exportName, fixture.behaviorInputs)).toEqual(
			fixture.expectedDataset,
		);
		expect(runBehavior(paths.printed, paths.exportName, fixture.behaviorInputs)).toEqual(
			fixture.expectedDataset,
		);
	}
});

test('what separates the two paths, after indentation is normalized away', async () => {
	const summary: Record<string, ReadonlyArray<string>> = {};

	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		summary[fixture.name] = divergenceClasses(paths.spliced, paths.printed);
	}

	// Every class here is a printer normalization the spec already records as a
	// known upstream behavior; none of them changes what the module does. They
	// are the site's parity-beyond-indentation divergences, carried to the
	// re-baseline decision rather than papered over here.
	expect(summary).toEqual({
		'inline-arrow-no-inputs': [
			'blank-lines-dropped',
			'factory-body-expanded',
			'trailing-newline-dropped',
		],
		'same-file-factory': [
			'blank-lines-dropped',
			'factory-parentheses-dropped',
			'trailing-newline-dropped',
		],
		'imported-factory': ['blank-lines-dropped', 'trailing-newline-dropped'],
		'default-import-factory': ['blank-lines-dropped', 'trailing-newline-dropped'],
	});
});

test('indentation and blank lines alone close the gap only where nothing was reflowed', async () => {
	const closed: Record<string, boolean> = {};

	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(paths.printed, `${fixture.name}: printed unexpectedly byte-equal`).not.toBe(
			paths.spliced,
		);
		closed[fixture.name] =
			meaningfulLines(paths.printed).join('\n') === meaningfulLines(paths.spliced).join('\n');
	}

	// Stated as a fact, not as a wish. The two import fixtures splice nothing the
	// printer reflows, so for them the whole remaining gap is whitespace; the
	// other two need the owner's approval on more than whitespace.
	expect(closed).toEqual({
		'inline-arrow-no-inputs': false,
		'same-file-factory': false,
		'imported-factory': true,
		'default-import-factory': true,
	});
});

/** Non-blank lines, with leading whitespace removed. */
function meaningfulLines(code: string): string[] {
	return normalizeIndentation(code)
		.split('\n')
		.filter((line) => line.trim() !== '');
}

/**
 * The named divergences that separate the two paths once indentation is
 * normalized away, sorted for stability.
 */
function divergenceClasses(spliced: string, printed: string): string[] {
	const classes = new Set<string>();

	if (spliced.includes('\n\n') && !printed.includes('\n\n')) classes.add('blank-lines-dropped');
	if (spliced.endsWith('\n') && !printed.endsWith('\n')) classes.add('trailing-newline-dropped');
	// The text path wraps an inline factory in parentheses before invoking it;
	// in an initializer position the grammar does not require them, so the
	// printer omits them.
	if (/=\s*\(function\b/.test(spliced) && /=\s*function\b/.test(printed)) {
		classes.add('factory-parentheses-dropped');
	}

	const splicedLines = meaningfulLines(spliced).length;
	const printedLines = meaningfulLines(printed).length;
	if (printedLines > splicedLines) classes.add('factory-body-expanded');
	if (printedLines < splicedLines) classes.add('factory-body-collapsed');

	return [...classes].sort();
}

test('omitting the authored source removes only that export from the printed module', async () => {
	const fixture = FIXTURES[0]!;
	const kept = await bothPaths(fixture);
	const cut = await bothPaths(fixture, true);

	expect(kept.printed).toContain('export const authoredSource =');
	expect(cut.printed).not.toContain('authoredSource');
	expect(
		kept.printed
			.split('\n')
			.filter((line) => !line.startsWith('export const authoredSource ='))
			.join('\n'),
	).toBe(cut.printed);
	// The spliced path agrees, so the swap would not change this behavior.
	expect(cut.spliced).not.toContain('authoredSource');
});

test('emission is deterministic and reaches a reparse fixpoint at this site', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		// Prints twice and requires identical bytes and identical mappings, then
		// reparses the emitted source and requires reprinting it to be a fixpoint
		// (invariant 7 — no recorded probe establishes printer determinism).
		const emitted = assertDeterministicEmission(buildBehaviorEmission(paths.input));

		expect(emitted.code).toBe(paths.printed);
	}
});

test('every printed behavior module carries a non-null source map naming the authored file', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(paths.mapSources).toEqual([fixture.filename]);
		expect(paths.mapFile).toBe(`${paths.exportName}.js`);
		expect(paths.mappings.length, `${fixture.name}: empty mappings`).toBeGreaterThan(0);
	}
});

test('the TSRX-node assertion is live at this site', async () => {
	const fixture = FIXTURES[0]!;
	const paths = await bothPaths(fixture);
	const clean = buildBehaviorEmission(paths.input);

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

test('the emitter gate the printed path inherits still refuses a non-callable factory', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		expect(canEmitBehaviorModule(paths.input.symbol)).toBe(true);
	}

	// A factory that is neither imported nor an inline function has no emitted
	// module on either path, so the printed path is never asked to parse it.
	expect(
		canEmitBehaviorModule({
			id: 'symbol:0',
			kind: 'behavior',
			hostNodeId: 'h0',
			source: 'behaviors.install',
			functionSource: 'behaviors.install',
			inputSources: [],
			order: 0,
		}),
	).toBe(false);
});
