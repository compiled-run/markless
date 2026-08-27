/**
 * Parity for `emitBranchUpdateModule` and `emitAsyncBoundaryUpdateModule`, the
 * arm emitters — stage 1, sketch item 3 of
 * `specs/framework/14-emission-codegen-migration.md`.
 *
 * The swap has landed: production emission at both arm sites now runs through
 * the tree the additive emitters build and print via `emit-codegen.ts`, so the
 * module the compiler ships and the module this suite prints are one path and
 * are byte-equal at every fixture — which `the swapped production path is
 * byte-equal to the printed module` asserts. Both emitted modules are still run
 * against the same stub graph so the behavior claim stays executed rather than
 * asserted, and the structural reprint, determinism, and source-map tests stay
 * as permanent gates on the swapped path.
 *
 * These two sites are assembled, not extracted: not one character of their
 * output comes from authored text. So unlike every emitter migrated before them
 * there is no authored text to splice and none to map back to. The map is
 * non-null and names the authored file (invariant 3) with no segments, which is
 * asserted here rather than assumed — along with the finding that makes the
 * guard weaker than it reads: `yuku-codegen@0.9.1` returns a non-null map for an
 * empty source too.
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
	type EmissionPrintInput,
} from '../src/passes/emit-codegen.ts';
import {
	buildAsyncBoundaryUpdateEmission,
	buildBranchUpdateEmission,
	emitAsyncBoundaryUpdateModuleNodes,
	emitBranchUpdateModuleNodes,
	emitSymbolModules,
} from '../src/passes/symbol-modules.ts';
import type {
	PlannedSymbol,
	PublicRenderPlanAsyncBoundaryArms,
	PublicRenderPlanBranchArms,
	RenderDataArtifact,
	SemanticMarkupChunk,
	SemanticMarkupResidue,
	SemanticMarkupSlot,
} from '../src/artifacts.ts';

const SOURCE_FILE_NAME = '/workspace/app/src/App.tsrx';

/**
 * The authored module's text. Nothing in either emitted module is spliced from
 * it — it exists so the map's `sourcesContent` names something real instead of
 * an empty string.
 */
const AUTHORED_SOURCE = `import { state } from '@markless/core';
export function App() @{ let open = state(true); <section>@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }</section> }
`;

type BranchSymbol = Extract<PlannedSymbol, { readonly kind: 'branch-update' }>;
type BoundarySymbol = Extract<PlannedSymbol, { readonly kind: 'async-boundary-update' }>;

// ---------------------------------------------------------------------------
// Render-data construction
//
// The pass derives arms from render data, so the spliced side is driven through
// `emitSymbolModules` on hand-built render data rather than by re-deriving the
// string the emitter would write. `expectedArms` on each fixture is the arms
// table the pass should compute from that render data, and
// `the fixtures' arm tables are the ones the pass derives` below pins the two
// together, so a drift between them fails a test instead of quietly making both
// sides agree on the wrong thing.
// ---------------------------------------------------------------------------

function renderDataOf(partial: Partial<RenderDataArtifact>): RenderDataArtifact {
	return {
		passId: 'render-data',
		filename: SOURCE_FILE_NAME,
		root: null,
		chunks: [],
		hosts: [],
		initialValues: [],
		branches: [],
		repeats: [],
		boundaries: [],
		interactions: [],
		...partial,
	};
}

function chunkOf(
	id: string,
	statics: ReadonlyArray<string>,
	slots: ReadonlyArray<SemanticMarkupSlot> = [],
): SemanticMarkupChunk {
	return {
		id,
		kind: 'branch-arm',
		componentName: 'App',
		statics: [...statics],
		hosts: [],
		slots: [...slots],
	};
}

function textSlot(staticIndex: number, residue: SemanticMarkupResidue): SemanticMarkupSlot {
	return {
		kind: 'text',
		residue,
		staticIndex,
		coordinate: { kind: 'child-index', path: [staticIndex] },
	};
}

function repeatSlot(staticIndex: number, repeatId: string, rowChunkId: string): SemanticMarkupSlot {
	return {
		kind: 'repeat',
		repeatId,
		rowTemplateId: rowChunkId,
		staticIndex,
		coordinate: { kind: 'comment-anchor', path: [staticIndex] },
	};
}

function graphRead(graphNodeId: string, path: ReadonlyArray<string> = []): SemanticMarkupResidue {
	return { kind: 'graph-read', graphNodeId, path };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type RunCase = {
	readonly context: Record<string, unknown>;
	// Branch modules also report `resolved` (the arm's parts were found); the
	// parity test defaults it to true, so a case states it only when it is false.
	readonly expected: {
		readonly arm: number;
		readonly html: string;
		readonly resolved?: boolean;
	};
};

type BranchFixture = {
	readonly kind: 'branch';
	readonly name: string;
	readonly renderData: RenderDataArtifact;
	readonly symbol: BranchSymbol;
	readonly expectedArms: PublicRenderPlanBranchArms;
	readonly cases: ReadonlyArray<RunCase>;
};

type BoundaryFixture = {
	readonly kind: 'boundary';
	readonly name: string;
	readonly renderData: RenderDataArtifact;
	readonly symbol: BoundarySymbol;
	readonly expectedArms: PublicRenderPlanAsyncBoundaryArms;
	readonly cases: ReadonlyArray<RunCase>;
};

type Fixture = BranchFixture | BoundaryFixture;

/** A graph whose `read` walks a path against a table of node values. */
function graphOf(values: Record<string, unknown>): { read: (id: string, path?: string[]) => unknown } {
	return {
		read: (graphNodeId, path = []) =>
			path.reduce<unknown>(
				(value, key) =>
					value == null ? value : (value as Record<string, unknown>)[key],
				values[graphNodeId],
			),
	};
}

function branchSymbol(overrides: Partial<BranchSymbol> = {}): BranchSymbol {
	return {
		id: 'symbol:0',
		kind: 'branch-update',
		branchSiteId: 'branch:0',
		testSource: 'open',
		testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
		...overrides,
	};
}

const IF_BRANCH: BranchFixture = {
	kind: 'branch',
	name: 'if-branch',
	renderData: renderDataOf({
		chunks: [chunkOf('arm0', ['<p>Shown</p>']), chunkOf('arm1', ['<p>Hidden</p>'])],
		branches: [
			{
				branchSiteId: 'branch:0',
				kind: 'if',
				testSource: 'open',
				testReads: [{ graphNodeId: 'state:open', path: [] }],
				armChunkIds: ['arm0', 'arm1'],
				anchorOrder: 0,
				update: 'range',
			},
		],
	}),
	symbol: branchSymbol(),
	expectedArms: {
		branchSiteId: 'branch:0',
		testRead: { graphNodeId: 'state:open', path: [] },
		arms: [[{ text: '<p>Shown</p>' }], [{ text: '<p>Hidden</p>' }]],
	},
	cases: [
		{
			context: { graph: graphOf({ 'state:open': true }) },
			expected: { arm: 0, html: '<p>Shown</p>' },
		},
		{
			context: { graph: graphOf({ 'state:open': false }) },
			expected: { arm: 1, html: '<p>Hidden</p>' },
		},
		{
			// The runtime may pass the arm it already decided on, which short-circuits
			// the test read entirely.
			context: { arm: 1, graph: graphOf({ 'state:open': true }) },
			expected: { arm: 1, html: '<p>Hidden</p>' },
		},
	],
};

const IF_BRANCH_WITH_READ: BranchFixture = {
	kind: 'branch',
	name: 'if-branch-with-read',
	renderData: renderDataOf({
		chunks: [
			chunkOf('arm0', ['<p>Hi ', '</p>'], [textSlot(0, graphRead('state:user', ['name']))]),
			chunkOf('arm1', ['<p>Bye</p>']),
		],
		branches: [
			{
				branchSiteId: 'branch:0',
				kind: 'if',
				testSource: 'user.here',
				testReads: [{ graphNodeId: 'state:user', path: ['here'] }],
				armChunkIds: ['arm0', 'arm1'],
				anchorOrder: 0,
				update: 'range',
			},
		],
	}),
	symbol: branchSymbol({
		testSource: 'user.here',
		testReads: [{ source: 'user.here', graphNodeId: 'state:user', path: ['here'] }],
	}),
	expectedArms: {
		branchSiteId: 'branch:0',
		testRead: { graphNodeId: 'state:user', path: ['here'] },
		arms: [
			[{ text: '<p>Hi ' }, { read: { graphNodeId: 'state:user', path: ['name'] } }, { text: '</p>' }],
			[{ text: '<p>Bye</p>' }],
		],
	},
	cases: [
		{
			context: { graph: graphOf({ 'state:user': { here: true, name: 'Ada' } }) },
			expected: { arm: 0, html: '<p>Hi Ada</p>' },
		},
		{
			// The escaper is not decoration: an arm read is interpolated into HTML.
			// `&` is replaced first, so the ampersands the later replacements
			// introduce are not double-escaped.
			context: { graph: graphOf({ 'state:user': { here: true, name: '<b>&</b>' } }) },
			expected: { arm: 0, html: '<p>Hi &lt;b&gt;&amp;&lt;/b&gt;</p>' },
		},
		{
			context: { graph: graphOf({ 'state:user': { here: true, name: null } }) },
			expected: { arm: 0, html: '<p>Hi </p>' },
		},
		{
			context: { graph: graphOf({ 'state:user': { here: false } }) },
			expected: { arm: 1, html: '<p>Bye</p>' },
		},
	],
};

const SWITCH_BRANCH: BranchFixture = {
	kind: 'branch',
	name: 'switch-branch',
	renderData: renderDataOf({
		chunks: [
			chunkOf('arm0', ['<p>Alpha</p>']),
			chunkOf('arm1', ['<p>Beta</p>']),
			chunkOf('arm2', ['<p>Other</p>']),
		],
		branches: [
			{
				branchSiteId: 'branch:0',
				kind: 'switch',
				testSource: 'mode',
				testReads: [{ graphNodeId: 'state:mode', path: [] }],
				armChunkIds: ['arm0', 'arm1', 'arm2'],
				anchorOrder: 0,
				armTests: ['a', 'b', null],
				update: 'range',
			},
		],
	}),
	symbol: branchSymbol({
		testSource: 'mode',
		testReads: [{ source: 'mode', graphNodeId: 'state:mode', path: [] }],
	}),
	expectedArms: {
		branchSiteId: 'branch:0',
		testRead: { graphNodeId: 'state:mode', path: [] },
		arms: [[{ text: '<p>Alpha</p>' }], [{ text: '<p>Beta</p>' }], [{ text: '<p>Other</p>' }]],
		armTests: ['a', 'b', null],
	},
	cases: [
		{ context: { graph: graphOf({ 'state:mode': 'a' }) }, expected: { arm: 0, html: '<p>Alpha</p>' } },
		{ context: { graph: graphOf({ 'state:mode': 'b' }) }, expected: { arm: 1, html: '<p>Beta</p>' } },
		{
			// No case matches, so the selector falls through to the @default arm.
			context: { graph: graphOf({ 'state:mode': 'zzz' }) },
			expected: { arm: 2, html: '<p>Other</p>' },
		},
		{
			// A null value must not match the @default slot's own null test.
			context: { graph: graphOf({ 'state:mode': null }) },
			expected: { arm: 2, html: '<p>Other</p>' },
		},
	],
};

const BRANCH_WITHOUT_TEST_READ: BranchFixture = {
	kind: 'branch',
	name: 'branch-without-test-read',
	renderData: renderDataOf({
		chunks: [chunkOf('arm0', ['<p>Yes</p>']), chunkOf('arm1', ['<p>No</p>'])],
		branches: [
			{
				branchSiteId: 'branch:0',
				kind: 'if',
				testSource: 'Date.now() > 0',
				testReads: [],
				armChunkIds: ['arm0', 'arm1'],
				anchorOrder: 0,
				update: 'range',
			},
		],
	}),
	symbol: branchSymbol({ testSource: 'Date.now() > 0', testReads: [] }),
	expectedArms: {
		branchSiteId: 'branch:0',
		testRead: null,
		arms: [[{ text: '<p>Yes</p>' }], [{ text: '<p>No</p>' }]],
	},
	cases: [
		// With no test read the emitted test is the literal `undefined`, so the
		// site always flips to arm 1 unless the runtime supplies an arm.
		{ context: { graph: graphOf({}) }, expected: { arm: 1, html: '<p>No</p>' } },
		{ context: { arm: 0, graph: graphOf({}) }, expected: { arm: 0, html: '<p>Yes</p>' } },
		// An arm the table has no parts for is reported unresolved, which is the
		// runtime's discriminator between a failed arm and one that renders empty.
		{
			context: { arm: 5, graph: graphOf({}) },
			expected: { arm: 5, html: '', resolved: false },
		},
	],
};

const BRANCH_WITH_REPEAT: BranchFixture = {
	kind: 'branch',
	name: 'branch-with-repeat',
	renderData: renderDataOf({
		chunks: [
			chunkOf('arm0', ['<ul>', '</ul>'], [repeatSlot(0, 'repeat:0', 'row0')]),
			chunkOf('arm1', ['<p>Empty</p>']),
			chunkOf('row0', ['<li>', ' ', '</li>'], [
				textSlot(0, { kind: 'repeat-item', repeatId: 'repeat:0', path: ['title'] }),
				textSlot(1, graphRead('state:suffix', [])),
			]),
		],
		repeats: [
			{
				repeatId: 'repeat:0',
				parentHostNodeId: 'h1',
				itemName: 'entry',
				collectionGraphNodeId: 'state:entries',
				collectionPath: [],
				keyPath: ['code'],
				rowChunkId: 'row0',
				rowElementCount: 1,
				directSupported: true,
			},
		],
		branches: [
			{
				branchSiteId: 'branch:0',
				kind: 'if',
				testSource: 'open',
				testReads: [{ graphNodeId: 'state:open', path: [] }],
				armChunkIds: ['arm0', 'arm1'],
				anchorOrder: 0,
				update: 'range',
			},
		],
	}),
	symbol: branchSymbol(),
	expectedArms: {
		branchSiteId: 'branch:0',
		testRead: { graphNodeId: 'state:open', path: [] },
		arms: [
			[
				{ text: '<ul>' },
				{
					repeat: {
						read: { graphNodeId: 'state:entries', path: [] },
						rowParts: [
							{ text: '<li>' },
							{ itemPath: ['title'] },
							{ text: ' ' },
							{ read: { graphNodeId: 'state:suffix', path: [] } },
							{ text: '</li>' },
						],
					},
				},
				{ text: '</ul>' },
			],
			[{ text: '<p>Empty</p>' }],
		],
	},
	cases: [
		{
			context: {
				graph: graphOf({
					'state:open': true,
					'state:entries': [{ title: 'Alpha' }, { title: 'Beta' }],
					'state:suffix': '!',
				}),
			},
			expected: { arm: 0, html: '<ul><li>Alpha !</li><li>Beta !</li></ul>' },
		},
		{
			// A non-array collection drops the rows rather than throwing.
			context: { graph: graphOf({ 'state:open': true, 'state:entries': null }) },
			expected: { arm: 0, html: '<ul></ul>' },
		},
		{
			// The item-path walk short-circuits on a nullish intermediate.
			context: {
				graph: graphOf({
					'state:open': true,
					'state:entries': [{}],
					'state:suffix': null,
				}),
			},
			expected: { arm: 0, html: '<ul><li> </li></ul>' },
		},
		{
			context: { graph: graphOf({ 'state:open': false }) },
			expected: { arm: 1, html: '<p>Empty</p>' },
		},
	],
};

const BOUNDARY: BoundaryFixture = {
	kind: 'boundary',
	name: 'boundary',
	renderData: renderDataOf({
		chunks: [
			chunkOf('try0', ['<p>', '</p>'], [textSlot(0, graphRead('computed:details', ['title']))]),
			chunkOf('catch0', ['<p>Broken</p>']),
		],
		boundaries: [
			{
				boundaryId: 'boundary:0',
				anchorOrder: 0,
				runnerGraphNodeId: 'computed:details',
				initiallyServedArm: 0,
				reads: [],
				unresolvedSources: [],
				armChunkIds: { try: 'try0', catch: 'catch0' },
				protocolSupported: true,
			},
		],
	}),
	symbol: {
		id: 'symbol:0',
		kind: 'async-boundary-update',
		boundaryId: 'boundary:0',
		graphNodeId: 'computed:details',
	},
	expectedArms: {
		boundaryId: 'boundary:0',
		arms: [
			[
				{ text: '<p>' },
				{ read: { graphNodeId: 'computed:details', path: ['title'] } },
				{ text: '</p>' },
			],
			[{ text: '<p>Broken</p>' }],
		],
	},
	cases: [
		{
			context: {
				status: 'fulfilled',
				graph: graphOf({ 'computed:details': { title: 'Ada' } }),
			},
			expected: { arm: 0, html: '<p>Ada</p>' },
		},
		{
			context: { status: 'rejected', graph: graphOf({}) },
			expected: { arm: 1, html: '<p>Broken</p>' },
		},
		{
			// Any status that is not "rejected" serves the @try arm, including none.
			context: { graph: graphOf({ 'computed:details': { title: '<x>' } }) },
			expected: { arm: 0, html: '<p>&lt;x&gt;</p>' },
		},
	],
};

const BOUNDARY_TRY_ONLY: BoundaryFixture = {
	kind: 'boundary',
	name: 'boundary-try-only',
	renderData: renderDataOf({
		chunks: [chunkOf('try0', ['<p>Ready</p>'])],
		boundaries: [
			{
				boundaryId: 'boundary:0',
				anchorOrder: 0,
				runnerGraphNodeId: 'computed:details',
				initiallyServedArm: 0,
				reads: [],
				unresolvedSources: [],
				armChunkIds: { try: 'try0' },
				protocolSupported: true,
			},
		],
	}),
	symbol: {
		id: 'symbol:0',
		kind: 'async-boundary-update',
		boundaryId: 'boundary:0',
		graphNodeId: 'computed:details',
	},
	expectedArms: {
		boundaryId: 'boundary:0',
		arms: [[{ text: '<p>Ready</p>' }]],
	},
	cases: [
		{ context: { graph: graphOf({}) }, expected: { arm: 0, html: '<p>Ready</p>' } },
		{
			// A boundary with no @catch arm still reports arm 1 and renders nothing.
			context: { status: 'rejected', graph: graphOf({}) },
			expected: { arm: 1, html: '' },
		},
	],
};

const FIXTURES: ReadonlyArray<Fixture> = [
	IF_BRANCH,
	IF_BRANCH_WITH_READ,
	SWITCH_BRANCH,
	BRANCH_WITHOUT_TEST_READ,
	BRANCH_WITH_REPEAT,
	BOUNDARY,
	BOUNDARY_TRY_ONLY,
];

// ---------------------------------------------------------------------------
// Running both paths
// ---------------------------------------------------------------------------

type Paths = {
	readonly assembled: string;
	readonly printed: string;
	readonly exportName: string;
	readonly input: EmissionPrintInput;
	readonly mapFile: string | undefined;
	readonly mapSources: ReadonlyArray<string>;
	readonly mapMappings: string;
	readonly mapSourcesContent: ReadonlyArray<string> | undefined;
};

/**
 * Run both emitters over one fixture.
 *
 * The assembled side goes through `emitSymbolModules`, the pass entry point, so
 * the string under test is the one the compiler actually ships rather than a
 * re-derivation of it; neither arm emitter is exported.
 */
function bothPaths(fixture: Fixture): Paths {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [fixture.symbol],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: { passId: 'capture-analysis', extractedSymbols: [], diagnostics: [] },
		renderData: fixture.renderData,
	});

	const assembled = artifact.modules.find((module) => module.kind === fixture.symbol.kind);
	if (!assembled) throw new Error(`fixture ${fixture.name} produced no ${fixture.symbol.kind} module`);

	const input =
		fixture.kind === 'branch'
			? buildBranchUpdateEmission({
					symbol: fixture.symbol,
					arms: fixture.expectedArms,
					sourceFileName: SOURCE_FILE_NAME,
					authoredSource: AUTHORED_SOURCE,
				})
			: buildAsyncBoundaryUpdateEmission({
					symbol: fixture.symbol,
					arms: fixture.expectedArms,
					sourceFileName: SOURCE_FILE_NAME,
					authoredSource: AUTHORED_SOURCE,
				});

	const emitted =
		fixture.kind === 'branch'
			? emitBranchUpdateModuleNodes({
					symbol: fixture.symbol,
					arms: fixture.expectedArms,
					sourceFileName: SOURCE_FILE_NAME,
					authoredSource: AUTHORED_SOURCE,
				})
			: emitAsyncBoundaryUpdateModuleNodes({
					symbol: fixture.symbol,
					arms: fixture.expectedArms,
					sourceFileName: SOURCE_FILE_NAME,
					authoredSource: AUTHORED_SOURCE,
				});

	return {
		assembled: assembled.source,
		printed: emitted.code,
		exportName: assembled.exportName,
		input,
		mapFile: emitted.map.file,
		mapSources: emitted.map.sources ?? [],
		mapMappings: emitted.map.mappings,
		mapSourcesContent: emitted.map.sourcesContent ?? undefined,
	};
}

/**
 * `JSON.stringify` with the printer's object-literal spacing: `{ "text": "x" }`
 * where `JSON.stringify` writes `{"text":"x"}`. Keys stay quoted and arrays stay
 * on one line, because the arm tables reach the module through `jsonValueNode`,
 * which builds string-literal keys and prints each array inline.
 */
function spacedJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map((item) => spacedJson(item)).join(', ')}]`;

	const entries = Object.entries(value).map(
		([key, child]) => `${JSON.stringify(key)}: ${spacedJson(child)}`,
	);
	return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

/**
 * Reprint a module through the same printer.
 *
 * Two modules that reprint to the same bytes differ only in what the printer
 * normalizes away — layout, blank lines, and parentheses the grammar does not
 * require. This is the parity claim that survives the printer being normalizing
 * rather than preserving.
 */
function reprint(code: string): string {
	const { program, errors } = parseEmissionSource(code, SOURCE_FILE_NAME, 'ts');
	expect(errors).toEqual([]);

	return printEmittedModule({
		program,
		source: code,
		outputFileName: 'reprint.js',
		site: { phase: 'payload', passId: 'symbol-modules', sourceFileName: SOURCE_FILE_NAME },
	}).code;
}

/** Run an emitted module and call its exported update with one context. */
function runModule(code: string, exportName: string, context: Record<string, unknown>): unknown {
	const body = `${code.replaceAll(/^export /gm, '')}\nreturn ${exportName};`;
	const update = new Function(body)() as (context: unknown) => unknown;
	return update(context);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('the fixtures’ arm tables are the ones the pass derives from their render data', () => {
	// The additive path is fed `expectedArms` directly, so if those drifted from
	// what `renderBranchArms`/`renderBoundaryArms` compute the two paths would
	// agree on the wrong table. The assembled module embeds the arms as the
	// printer wrote them, which is the pass's own answer.
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);
		expect(paths.assembled, `${fixture.name}: arm table drifted from the pass`).toContain(
			spacedJson(fixture.expectedArms.arms),
		);
	}
});

test('the printed arm module is structurally identical to the assembled one', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);

		expect(
			reprint(paths.printed),
			`${fixture.name}: printed and assembled modules reprint differently`,
		).toBe(reprint(paths.assembled));
	}
});

test('both paths return the same arm and the same HTML for every case', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);

		for (const { context, expected } of fixture.cases) {
			const fromAssembled = runModule(paths.assembled, paths.exportName, context);
			const fromPrinted = runModule(paths.printed, paths.exportName, context);
			const result =
				fixture.kind === 'branch' ? { resolved: true, ...expected } : expected;

			expect(fromAssembled, `${fixture.name}: assembled result`).toEqual(result);
			expect(fromPrinted, `${fixture.name}: printed result`).toEqual(result);
		}
	}
});

test('the swapped production path is byte-equal to the printed module', () => {
	// The swap wired both arm builds through the printer, so the module the
	// compiler ships and the module this suite prints are one path.
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);
		expect(paths.assembled, `${fixture.name}: production diverged from the printed module`).toBe(
			paths.printed,
		);
	}
});

test('emission is deterministic and reaches a reparse fixpoint at both arm sites', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);
		// Prints twice and requires identical bytes and identical mappings, then
		// reparses the emitted source and requires reprinting it to be a fixpoint
		// (invariant 7 — no recorded probe establishes printer determinism).
		const emitted = assertDeterministicEmission(paths.input);

		expect(emitted.code, `${fixture.name}: determinism helper disagreed with the emitter`).toBe(
			paths.printed,
		);
	}
});

test('every printed arm module carries a non-null source map naming the authored file', () => {
	for (const fixture of FIXTURES) {
		const paths = bothPaths(fixture);

		expect(paths.mapSources).toEqual([SOURCE_FILE_NAME]);
		expect(paths.mapFile).toBe(`${paths.exportName}.js`);
		expect(paths.mapSourcesContent).toEqual([AUTHORED_SOURCE]);
		// Recorded, not wished away: these emitters assemble every node from render
		// data, so no node carries a span into the authored file and the map has no
		// segments. Invariant 3's requirement is a non-null map; a segment-bearing
		// map would need authored text these sites never splice.
		expect(paths.mapMappings, `${fixture.name}: unexpected map segments`).toBe('');
	}
});

test('the non-null-map guard does not distinguish a threaded source from an absent one', () => {
	// The finding behind the spec gap this unit reports: `printEmittedModule`
	// treats a null map as a hard failure (invariant 3), but the printer returns a
	// non-null map for an empty source too. At an assembled site, where mappings
	// are empty either way, the guard therefore proves only that `sourceMap` was
	// passed at all — not that the authored source reached it.
	const sourceless = printEmittedModule({
		...buildAsyncBoundaryUpdateEmission({
			symbol: BOUNDARY.symbol,
			arms: BOUNDARY.expectedArms,
			sourceFileName: SOURCE_FILE_NAME,
			authoredSource: AUTHORED_SOURCE,
		}),
		source: '',
	});

	expect(sourceless.map).not.toBeNull();
	expect(sourceless.map.mappings).toBe('');
	expect(sourceless.map.sourcesContent).toEqual(['']);
	expect(sourceless.code).toBe(bothPaths(BOUNDARY).printed);
});

test('the TSRX-node assertion is live at both arm sites', () => {
	for (const fixture of [IF_BRANCH, BOUNDARY]) {
		const clean = bothPaths(fixture).input;

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
	}
});

test('the switch selector and the row rebuilder are emitted only where the site needs them', () => {
	const withTests = bothPaths(SWITCH_BRANCH);
	const withoutTests = bothPaths(IF_BRANCH);
	const withRepeat = bothPaths(BRANCH_WITH_REPEAT);

	expect(withTests.printed).toContain('function marklessSelectSwitchArm(');
	expect(withoutTests.printed).not.toContain('marklessSelectSwitchArm');
	expect(withRepeat.printed).toContain('function marklessBranchRows(');
	expect(withoutTests.printed).not.toContain('marklessBranchRows');

	// The same conditionals on the assembled side, so the two paths gate on the
	// same facts rather than on two independently drifting conditions.
	expect(withTests.assembled).toContain('function marklessSelectSwitchArm(');
	expect(withoutTests.assembled).not.toContain('marklessSelectSwitchArm');
	expect(withRepeat.assembled).toContain('function marklessBranchRows(');
	expect(withoutTests.assembled).not.toContain('marklessBranchRows');
});
