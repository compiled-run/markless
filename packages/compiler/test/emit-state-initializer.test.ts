/**
 * Parity for `emitStateInitializerModule`, the first low-risk emitter in stage 1
 * of `specs/framework/14-emission-codegen-migration.md`.
 *
 * Both paths run here: the spliced string the compiler emits today, and the
 * tree the migrated emitter builds and prints through `emit-codegen.ts`. The
 * spec's per-site acceptance asks for byte equality where bytes are pinned and
 * behavior equality elsewhere; this file measures which of the two this site
 * gets, and records the exact difference so the owner's re-baseline decision
 * (invariant 2) rests on evidence rather than on a claim.
 *
 * The answer these fixtures give: the printed module is never byte-equal to the
 * spliced one, and the difference is never semantic. Five normalizations
 * account for all of it — see `differenceClasses` below. Once the owner accepts
 * that diff, the swap lands and this file pins the printed path alone.
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
import { moduleScopeLines } from '../src/passes/public-render/shared.ts';
import {
	buildStateInitializerEmission,
	emitStateInitializerModuleNodes,
	stateInitializerPropReads,
	type StateInitializerEmissionInput,
} from '../src/passes/symbol-modules.ts';

type Fixture = {
	readonly name: string;
	readonly filename: string;
	readonly source: string;
	/** A context stub for the fixtures whose initializer reads props. */
	readonly graphReads?: Readonly<Record<string, unknown>>;
	readonly expectedValue: unknown;
};

const FIXTURES: ReadonlyArray<Fixture> = [
	{
		// The shape the existing suite exercises, in `symbol-modules.test.ts`.
		name: 'same-module-helper',
		filename: '/workspace/app/src/App.tsrx',
		source: `
import { state } from '@markless/core';
function initialWeight() { return 2; }
export function App() @{ let weight = state(initialWeight()); <main>{weight}</main> }
`,
		expectedValue: 2,
	},
	{
		// A helper that needs a second module-scope declaration: the emitter's
		// declaration selection has to reach transitively, in the same order.
		name: 'transitive-helper',
		filename: '/workspace/app/src/Transitive.tsrx',
		source: `
import { state } from '@markless/core';
const BASE = 2;
function initialWeight() { return BASE * 2; }
export function App() @{ let weight = state(initialWeight()); <main>{weight}</main> }
`,
		expectedValue: 4,
	},
	{
		// An object literal initializer: the form the text path has to wrap in
		// parentheses after `return`, and the form the printer knows it need not.
		name: 'object-literal-initializer',
		filename: '/workspace/app/src/ObjectLiteral.tsrx',
		source: `
import { state } from '@markless/core';
function makeTitle() { return 'Draft'; }
export function App() @{ let card = state({ title: makeTitle(), count: 1 }); <main>{card.title}</main> }
`,
		expectedValue: { title: 'Draft', count: 1 },
	},
	{
		// Imports: only the ones the initializer still needs may survive, so the
		// unused `other` must not be emitted by either path.
		name: 'module-import-initializer',
		filename: '/workspace/app/src/Imported.tsrx',
		source: `
import { state } from '@markless/core';
import { seed, other } from './seed.ts';
export function App() @{ let weight = state(seed()); <main>{weight}</main> }
`,
		expectedValue: undefined,
	},
	{
		// A prop-reading initializer: the only shape that emits a `context`
		// parameter and a graph read in the function body.
		name: 'prop-read-initializer',
		filename: '/workspace/app/src/PropRead.tsrx',
		source: `
import { state } from '@markless/core';
export function Child({ weight }) @{ let doubled = state(weight * 2); <span>{doubled}</span> }
export function App() @{ <main><Child weight={3} /></main> }
`,
		graphReads: { 'prop:props|weight': 5 },
		expectedValue: 10,
	},
];

type Paths = {
	readonly spliced: string;
	readonly printed: string;
	readonly exportName: string;
	readonly input: StateInitializerEmissionInput;
	readonly mapFile: string | undefined;
	readonly mapSources: ReadonlyArray<string>;
};

async function bothPaths(fixture: Fixture, omitAuthoredSource = false): Promise<Paths> {
	const result = await compileTsrxModule({
		filename: fixture.filename,
		source: fixture.source,
		symbols: [],
		...(omitAuthoredSource ? { omitAuthoredSource: true } : {}),
	});

	const spliced = result.symbolModules.modules.find(
		(module) => module.kind === 'state-initializer',
	);
	const symbol = result.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'state-initializer',
	);
	if (!spliced || !symbol || symbol.kind !== 'state-initializer') {
		throw new Error(`fixture ${fixture.name} produced no state-initializer symbol`);
	}

	const input: StateInitializerEmissionInput = {
		symbol,
		moduleDeclarations: moduleScopeLines(fixture.source, fixture.filename),
		moduleImports: result.semanticGraph.moduleImports,
		propReads: stateInitializerPropReads(
			symbol,
			result.semanticGraph,
			result.renderData,
			fixture.filename,
		),
		omitAuthoredSource,
		sourceFileName: fixture.filename,
	};
	const emitted = emitStateInitializerModuleNodes(input);

	return {
		spliced: spliced.source,
		printed: emitted.code,
		exportName: spliced.exportName,
		input,
		mapFile: emitted.map.file,
		mapSources: emitted.map.sources ?? [],
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
 * Two modules that reprint to the same bytes differ only in the things the
 * printer normalizes away — layout, blank lines, and parentheses the grammar
 * does not require. This is the parity claim that survives the printer being
 * normalizing rather than preserving.
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

/** Run an emitted, import-free module and call its exported initializer. */
function runModule(code: string, exportName: string, graphReads: Record<string, unknown>): unknown {
	const body = `${code.replaceAll(/^export /gm, '')}\nreturn ${exportName};`;
	// eslint-disable-next-line no-new-func
	const initializer = new Function(body)() as (context: unknown) => unknown;
	return initializer({
		graph: {
			read: (graphNodeId: string, path: ReadonlyArray<string>) =>
				graphReads[`${graphNodeId}|${path.join('.')}`],
		},
	});
}

test('the printed state-initializer module is structurally identical to the spliced one', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(
			reprint(paths.printed, fixture.filename),
			`${fixture.name}: printed and spliced modules reprint differently`,
		).toBe(reprint(paths.spliced, fixture.filename));
	}
});

test('the printed and spliced modules evaluate to the same initial value', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		// A module that still imports cannot be evaluated in isolation; its
		// structural parity is covered by the reprint test above.
		if (paths.printed.includes('import ')) continue;

		const graphReads = { ...fixture.graphReads };
		expect(runModule(paths.spliced, paths.exportName, graphReads)).toEqual(
			fixture.expectedValue,
		);
		expect(runModule(paths.printed, paths.exportName, graphReads)).toEqual(
			fixture.expectedValue,
		);
	}
});

test('the printed module is not byte-equal, and the difference is exactly the printer normalizing', async () => {
	const summary: Record<string, ReadonlyArray<string>> = {};

	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		summary[fixture.name] = differenceClasses(paths.spliced, paths.printed);
	}

	// Every class here is a printer normalization the spec already records as a
	// known upstream behavior; none of them changes what the module does.
	expect(summary).toEqual({
		'same-module-helper': [
			'blank-lines-dropped',
			'declaration-reflowed',
			'indentation-tabs-to-spaces',
			'return-parentheses-dropped',
			'trailing-newline-dropped',
		],
		'transitive-helper': [
			'blank-lines-dropped',
			'declaration-reflowed',
			'indentation-tabs-to-spaces',
			'return-parentheses-dropped',
			'trailing-newline-dropped',
		],
		'object-literal-initializer': [
			'blank-lines-dropped',
			'declaration-reflowed',
			'indentation-tabs-to-spaces',
			'return-parentheses-dropped',
			'trailing-newline-dropped',
		],
		'module-import-initializer': [
			'blank-lines-dropped',
			'indentation-tabs-to-spaces',
			'return-parentheses-dropped',
			'trailing-newline-dropped',
		],
		'prop-read-initializer': [
			'blank-lines-dropped',
			'indentation-tabs-to-spaces',
			'return-parentheses-dropped',
			'trailing-newline-dropped',
		],
	});
});

test('normalizing indentation alone does not make the two paths equal', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(paths.printed).not.toBe(paths.spliced);
		// Stated as a fact, not as a wish: indentation is the smallest of the
		// five differences, so an indentation-only normalizer cannot close the
		// gap, and the swap needs the owner's approval on the rest.
		expect(normalizeIndentation(paths.printed)).not.toBe(normalizeIndentation(paths.spliced));
	}
});

/** The named normalizations that separate the two paths, sorted for stability. */
function differenceClasses(spliced: string, printed: string): string[] {
	const classes = new Set<string>();

	if (spliced.includes('\n\n') && !printed.includes('\n\n')) classes.add('blank-lines-dropped');
	if (spliced.endsWith('\n') && !printed.endsWith('\n')) classes.add('trailing-newline-dropped');
	if (spliced.includes('\treturn (') && printed.includes('  return '))
		classes.add('return-parentheses-dropped');
	if (/^\t/m.test(spliced) && !/^\t/m.test(printed) && /^ {2}/m.test(printed))
		classes.add('indentation-tabs-to-spaces');
	if (/^(?:function|const|class|let|var).*\{.+\}$/m.test(spliced))
		classes.add('declaration-reflowed');

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
	// The spliced path agrees, so the swap does not change this behavior.
	expect(cut.spliced).not.toContain('authoredSource');
});

test('emission is deterministic and reaches a reparse fixpoint at this site', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		// Prints twice and requires identical bytes and identical mappings, then
		// reparses the emitted source and requires reprinting it to be a fixpoint
		// (invariant 7 — no recorded probe establishes printer determinism).
		const emitted = assertDeterministicEmission(buildStateInitializerEmission(paths.input));

		expect(emitted.code).toBe(paths.printed);
	}
});

test('every printed module carries a non-null source map naming the authored file', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(paths.mapSources).toEqual([fixture.filename]);
		expect(paths.mapFile).toBe(`${paths.exportName}.js`);
	}
});

test('the TSRX-node assertion is live at this site', async () => {
	const fixture = FIXTURES[0]!;
	const paths = await bothPaths(fixture);
	const clean = buildStateInitializerEmission(paths.input);

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
