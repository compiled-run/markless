/**
 * Parity for `emitBehaviorModule`, one of the low-risk emitters in stage 1 of
 * `specs/framework/14-emission-codegen-migration.md`.
 *
 * The swap has landed: `emitBehaviorModuleNodes` is the wired path, so the
 * module the compiler ships ("spliced" below) and the module this suite prints
 * are one path, and the re-baseline the owner approved is what these fixtures
 * now pin. `the swapped production path is byte-equal to the printed module`
 * asserts that directly, fixture by fixture — the pre-swap tests that measured
 * and classified the gap between the two paths have no gap left to describe.
 *
 * The rest of the file is the permanent gate around the printed path: it still
 * reprints structurally identical, still does the same thing to the host
 * element, still prints deterministically to a reparse fixpoint, still carries
 * a source map naming the authored file, and still refuses a TSRX-only node.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import { moduleScopeLines } from '../src/passes/public-render/shared.ts';
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
		// Production supplies both (buildSymbolModuleEmission); without them this
		// hand-built input compares a carried module against an uncarried one.
		moduleDeclarations: moduleScopeLines(fixture.source, fixture.filename),
		moduleImports: result.semanticGraph.moduleImports,
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

test('the swapped production path is byte-equal to the printed module', async () => {
	// The swap wired `emitBehaviorModuleNodes` into production, so the module the
	// compiler ships and the module this suite prints are one path.
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		expect(paths.spliced, `${fixture.name}: production diverged from the printed module`).toBe(
			paths.printed,
		);
	}
});

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
