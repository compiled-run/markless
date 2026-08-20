/**
 * Parity for `emitAsyncComputedRunnerModule`, the third low-risk emitter in
 * stage 1 of `specs/framework/14-emission-codegen-migration.md`.
 *
 * Both paths run here: the spliced string the compiler emits today, and the tree
 * the additive emitter builds and prints through `emit-codegen.ts`. The string
 * path is still the wired one — this unit builds and proves, it does not swap —
 * so this file's job is to measure which kind of parity the site gets and to
 * record the exact difference, so the owner's re-baseline decision (invariant 2)
 * rests on evidence rather than on a claim.
 *
 * The answer these fixtures give: the printed module is never byte-equal to the
 * spliced one, and the difference is pure layout. Three normalizations account
 * for all of it — dropped blank lines, tabs becoming two spaces, and the dropped
 * trailing newline — each a printer behavior the spec already records. Strip all
 * three and the two paths are byte-equal at every fixture, which is what
 * `no fixture diverges beyond layout` asserts. Indentation is only one of the
 * three, so normalizing indentation alone does not close the gap; that too is
 * asserted rather than assumed.
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
	buildAsyncComputedRunnerEmission,
	emitAsyncComputedRunnerModuleNodes,
	type AsyncComputedRunnerEmissionInput,
} from '../src/passes/symbol-modules.ts';

type Fixture = {
	readonly name: string;
	readonly filename: string;
	readonly source: string;
	/** Picks one runner when a fixture declares more than one. */
	readonly graphNodeId?: string;
	/** Graph reads the runner's dependency declarations resolve against. */
	readonly graphReads?: Readonly<Record<string, unknown>>;
	readonly expectedValue?: unknown;
};

const FIXTURES: ReadonlyArray<Fixture> = [
	{
		// The plainest runner: one state dependency, an awaited body.
		name: 'single-dependency',
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
		graphReads: { 'state:query|': 'rope' },
		expectedValue: { text: 'Detail rope' },
	},
	{
		// A runner whose dependency is a member path: the trailing-member
		// arithmetic in the dependency binding has to agree across both paths.
		name: 'member-path-dependency',
		filename: '/workspace/app/src/MemberPath.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let profile = state({ region: 'north' });
	const summary = computed(async () => {
		return { text: 'Region ' + profile.region };
	});

	<article>
		@try {
			<strong>{summary.text}</strong>
		} @pending {
			<strong>Loading</strong>
		} @catch {
			<strong>Unavailable</strong>
		}
	</article>
}
`,
		graphReads: { 'state:profile|': { region: 'north' } },
		expectedValue: { text: 'Region north' },
	},
	{
		// Two runners, the downstream one depending on the upstream computed: the
		// chained shape `chained-async-transport.test.ts` pins.
		name: 'chained-runner',
		filename: '/workspace/app/src/CeramicLedger.tsrx',
		graphNodeId: 'computed:archiveLabel',
		source: `
import { computed, state } from '@markless/core';

export function CeramicLedger() @{
	let mineral = state('azurite');
	const kilnSensor = computed(async () => {
		const batch = mineral;
		return { tone: batch + '-fired' };
	});
	const archiveLabel = computed(async () => {
		return { text: 'Archive ' + kilnSensor.tone };
	});

	<article>
		@try {
			<strong>{archiveLabel.text}</strong>
		} @pending {
			<strong>Cataloguing</strong>
		} @catch {
			<strong>Archive unavailable</strong>
		}
	</article>
}
`,
		// The dependency source is `kilnSensor.tone`, so the trailing member is
		// dropped from the graph path and the runner reads the boundary's `value`.
		graphReads: { 'computed:kilnSensor|value': { tone: 'azurite-fired' } },
		expectedValue: { text: 'Archive azurite-fired' },
	},
	{
		// The upstream half of the same fixture: a runner with no member path on
		// its dependency and a multi-statement body.
		name: 'chained-runner-upstream',
		filename: '/workspace/app/src/CeramicLedgerUpstream.tsrx',
		graphNodeId: 'computed:kilnSensor',
		source: `
import { computed, state } from '@markless/core';

export function CeramicLedger() @{
	let mineral = state('azurite');
	const kilnSensor = computed(async () => {
		const batch = mineral;
		return { tone: batch + '-fired' };
	});
	const archiveLabel = computed(async () => {
		return { text: 'Archive ' + kilnSensor.tone };
	});

	<article>
		@try {
			<strong>{archiveLabel.text}</strong>
		} @pending {
			<strong>Cataloguing</strong>
		} @catch {
			<strong>Archive unavailable</strong>
		}
	</article>
}
`,
		graphReads: { 'state:mineral|': 'azurite' },
		expectedValue: { tone: 'azurite-fired' },
	},
	{
		// A runner that uses its `signal`, so the emitted call's object argument
		// is actually consumed rather than merely present.
		name: 'signal-consuming-runner',
		filename: '/workspace/app/src/SignalRunner.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let query = state('kiln');
	const details = computed(async ({ signal }) => {
		return { text: 'Detail ' + query, signalThreaded: signal !== undefined };
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
		graphReads: { 'state:query|': 'kiln' },
		expectedValue: { text: 'Detail kiln', signalThreaded: true },
	},
];

type Paths = {
	readonly spliced: string;
	readonly printed: string;
	readonly exportName: string;
	readonly input: AsyncComputedRunnerEmissionInput;
	readonly mapFile: string | undefined;
	readonly mapSources: ReadonlyArray<string>;
	readonly mapSegmentCount: number;
};

async function bothPaths(fixture: Fixture, omitAuthoredSource = false): Promise<Paths> {
	const result = await compileTsrxModule({
		filename: fixture.filename,
		source: fixture.source,
		symbols: [],
		...(omitAuthoredSource ? { omitAuthoredSource: true } : {}),
	});

	const symbol = result.symbolResolver.symbols.find(
		(candidate) =>
			candidate.kind === 'async-computed-runner' &&
			(fixture.graphNodeId === undefined || candidate.graphNodeId === fixture.graphNodeId),
	);
	if (!symbol || symbol.kind !== 'async-computed-runner') {
		throw new Error(`fixture ${fixture.name} produced no matching async-computed-runner symbol`);
	}
	const spliced = result.symbolModules.modules.find((module) => module.symbolId === symbol.id);
	if (!spliced) throw new Error(`fixture ${fixture.name} produced no runner module`);

	// The same capture-slot selection `emitSymbolModules` makes before it calls
	// the emitter, so both paths see identical slots.
	const extracted = result.captureAnalysis.extractedSymbols.find(
		(candidate) => !candidate.loaderSymbolId && candidate.symbolId === symbol.id,
	);
	const captureSlots = (extracted?.captureSlots ?? []).filter((slot) =>
		slot.routes.some((route) => route.componentEdgeId !== undefined),
	);

	const input: AsyncComputedRunnerEmissionInput = {
		symbol,
		captureSlots,
		omitAuthoredSource,
		sourceFileName: fixture.filename,
	};
	const emitted = emitAsyncComputedRunnerModuleNodes(input);

	return {
		spliced: spliced.source,
		printed: emitted.code,
		exportName: spliced.exportName,
		input,
		mapFile: emitted.map.file,
		mapSources: emitted.map.sources ?? [],
		mapSegmentCount: countMapSegments(emitted.map.mappings),
	};
}

function countMapSegments(mappings: string): number {
	return mappings
		.split(';')
		.flatMap((line) => line.split(',').filter((segment) => segment.length > 0)).length;
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
 * Run an emitted, import-free runner module and await what it returns.
 *
 * The context stub covers both shapes the emitted `read` binding chooses
 * between: `context.graph.read` is present here, so the bound branch is the one
 * these fixtures exercise. The bare-`context.read` branch is covered separately.
 */
async function runModule(
	code: string,
	exportName: string,
	graphReads: Record<string, unknown>,
	useBareRead = false,
): Promise<unknown> {
	const body = `${code.replaceAll(/^export /gm, '')}\nreturn ${exportName};`;
	// eslint-disable-next-line no-new-func
	const runner = new Function(body)() as (context: unknown) => unknown;
	const read = (graphNodeId: string, path: ReadonlyArray<string> = []) =>
		graphReads[`${graphNodeId}|${path.join('.')}`];
	// A real-shaped signal rather than `undefined`, so a fixture can observe that
	// the emitted call actually threads `context.signal` into the runner.
	const signal = { aborted: false };
	const context = useBareRead
		? { key: 'k', signal, read }
		: { key: 'k', signal, graph: { read } };
	return await runner(context);
}

test('the printed async-runner module is structurally identical to the spliced one', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(
			reprint(paths.printed, fixture.filename),
			`${fixture.name}: printed and spliced modules reprint differently`,
		).toBe(reprint(paths.spliced, fixture.filename));
	}
});

test('the printed and spliced runners resolve to the same value', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		// A module that still imports cannot be evaluated in isolation; its
		// structural parity is covered by the reprint test above.
		if (paths.printed.includes('import ')) continue;

		const graphReads = { ...fixture.graphReads };
		await expect(runModule(paths.spliced, paths.exportName, graphReads)).resolves.toEqual(
			fixture.expectedValue,
		);
		await expect(runModule(paths.printed, paths.exportName, graphReads)).resolves.toEqual(
			fixture.expectedValue,
		);
	}
});

test('both paths take the bare-context.read branch identically', async () => {
	// The emitted `read` binding is a conditional, so both of its arms have to be
	// exercised for the two paths to be shown equal rather than merely agreeing
	// on the arm the graph context happens to select.
	const fixture = FIXTURES[0]!;
	const paths = await bothPaths(fixture);
	const graphReads = { ...fixture.graphReads };

	await expect(
		runModule(paths.spliced, paths.exportName, graphReads, true),
	).resolves.toEqual(fixture.expectedValue);
	await expect(
		runModule(paths.printed, paths.exportName, graphReads, true),
	).resolves.toEqual(fixture.expectedValue);
});

test('the printed module is not byte-equal, and the difference is exactly the printer normalizing', async () => {
	const summary: Record<string, ReadonlyArray<string>> = {};

	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		summary[fixture.name] = differenceClasses(paths.spliced, paths.printed);
	}

	// Every class here is a printer normalization the spec already records as a
	// known upstream behavior; none of them changes what the module does, and
	// `token-divergence-beyond-layout` appears nowhere. This is the diff the
	// owner's re-baseline decision is made against.
	const layoutOnly = [
		'blank-lines-dropped',
		'indentation-tabs-to-spaces',
		'trailing-newline-dropped',
	];
	expect(summary).toEqual({
		'single-dependency': layoutOnly,
		'member-path-dependency': layoutOnly,
		'chained-runner': layoutOnly,
		'chained-runner-upstream': layoutOnly,
		'signal-consuming-runner': layoutOnly,
	});
});

test('normalizing indentation alone does not make the two paths equal', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(paths.printed).not.toBe(paths.spliced);
		// Stated as a fact, not as a wish: indentation is one of three differences,
		// so an indentation-only normalizer cannot close the gap and the swap needs
		// the owner's approval on the rest.
		expect(normalizeIndentation(paths.printed)).not.toBe(normalizeIndentation(paths.spliced));
	}
});

/**
 * The named normalizations that separate the two paths, sorted for stability.
 *
 * The last class is the one that matters: `token-divergence-beyond-layout` is
 * set by comparing the two modules with blank lines, the trailing newline, and
 * leading whitespace all removed. Anything that survives that is a real
 * difference in what the module says, not in how it is laid out, and would be
 * the item a re-baseline unit has to carry. The other three classes are only
 * reported when they are actually observed, so a fixture that stops exhibiting
 * one shows up as a changed summary rather than passing silently.
 */
function differenceClasses(spliced: string, printed: string): string[] {
	const classes = new Set<string>();

	if (spliced.endsWith('\n') && !printed.endsWith('\n')) classes.add('trailing-newline-dropped');

	const splicedLines = spliced.replace(/\n+$/, '').split('\n');
	const printedLines = printed.replace(/\n+$/, '').split('\n');
	const splicedFilled = splicedLines.filter((line) => line.trim() !== '');
	const printedFilled = printedLines.filter((line) => line.trim() !== '');

	if (splicedFilled.length < splicedLines.length && printedFilled.length === printedLines.length) {
		classes.add('blank-lines-dropped');
	}
	if (
		splicedFilled.some((line) => line.startsWith('\t')) &&
		printedFilled.some((line) => line.startsWith(' ')) &&
		!printedFilled.some((line) => line.startsWith('\t'))
	) {
		classes.add('indentation-tabs-to-spaces');
	}
	if (
		splicedFilled.map((line) => line.trim()).join('\n') !==
		printedFilled.map((line) => line.trim()).join('\n')
	) {
		classes.add('token-divergence-beyond-layout');
	}

	return [...classes].sort();
}

test('no fixture diverges beyond layout', async () => {
	// The parity claim in one assertion: with blank lines, the trailing newline,
	// and leading whitespace removed, the two paths are byte-equal at every
	// fixture. That is what makes the residual difference a layout re-baseline
	// rather than a behavior change.
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(
			differenceClasses(paths.spliced, paths.printed),
			`${fixture.name}: divergence beyond layout`,
		).not.toContain('token-divergence-beyond-layout');
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
	// The spliced path agrees, so the swap does not change this behavior.
	expect(cut.spliced).not.toContain('authoredSource');
});

test('the dependency declarations agree line for line across both paths', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(
			dependencyDeclarationLines(paths.printed),
			`${fixture.name}: dependency declarations differ`,
		).toEqual(dependencyDeclarationLines(paths.spliced));
	}
});

/**
 * The `const <name> = read(...)` / `context.capture.read(...)` lines, trimmed.
 *
 * Trimming is the indentation normalization the packet allows; the tokens either
 * side of it must match exactly, because a difference there would be a real
 * divergence rather than a layout one.
 */
function dependencyDeclarationLines(code: string): string[] {
	return code
		.split('\n')
		.map((line) => line.trim())
		.filter(
			(line) =>
				/^const [$\w]+ = read\(/.test(line) ||
				/^const [$\w]+ = context\.capture\.read\(/.test(line),
		);
}

test('the read binding and the runner call are emitted identically by both paths', async () => {
	const readBinding =
		'const read = context.graph?.read ? context.graph.read.bind(context.graph) : context.read;';
	const runnerCall = 'return run({ key: context.key, signal: context.signal, read });';

	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		const printedLines = paths.printed.split('\n').map((line) => line.trim());
		const splicedLines = paths.spliced.split('\n').map((line) => line.trim());

		expect(printedLines, `${fixture.name}: printed read binding`).toContain(readBinding);
		expect(splicedLines, `${fixture.name}: spliced read binding`).toContain(readBinding);
		expect(printedLines, `${fixture.name}: printed runner call`).toContain(runnerCall);
		expect(splicedLines, `${fixture.name}: spliced runner call`).toContain(runnerCall);
	}
});

test('emission is deterministic and reaches a reparse fixpoint at this site', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);
		// Prints twice and requires identical bytes and identical mappings, then
		// reparses the emitted source and requires reprinting it to be a fixpoint
		// (invariant 7 — no recorded probe establishes printer determinism).
		const emitted = assertDeterministicEmission(buildAsyncComputedRunnerEmission(paths.input));

		expect(emitted.code, `${fixture.name}: determinism helper disagreed with the emitter`).toBe(
			paths.printed,
		);
	}
});

test('every printed module carries a non-null source map naming the authored file', async () => {
	for (const fixture of FIXTURES) {
		const paths = await bothPaths(fixture);

		expect(paths.mapSources).toEqual([fixture.filename]);
		expect(paths.mapFile).toBe(`${paths.exportName}.js`);
		// Non-null is the invariant; a map with no segments would satisfy the type
		// and carry no information, so the segment count is asserted too.
		expect(paths.mapSegmentCount, `${fixture.name}: empty source map`).toBeGreaterThan(0);
	}
});

test('the TSRX-node assertion is live at this site', async () => {
	const fixture = FIXTURES[0]!;
	const paths = await bothPaths(fixture);
	const clean = buildAsyncComputedRunnerEmission(paths.input);

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
