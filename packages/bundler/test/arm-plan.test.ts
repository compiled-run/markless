import { readFileSync } from 'node:fs';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { compileTsrxModule, type CompileTsrxModuleResult } from '../../compiler/src/index.ts';
import { createMarklessRolldownPlugin } from '../src/rolldown.ts';
import { MARKLESS_BOUND_SYMBOLS_EXPORT, emitResumeModule } from '../src/source-module.ts';
import {
	perBoundaryBoundSymbolDescriptors,
	planSettleModule,
	transformTsrxModule,
} from '../src/transform.ts';
import { evaluateBuiltPageClosure } from '../../web/src/prerender/evaluator.ts';
import {
	buildArmFillEmission,
	deriveArmFillPlan,
	planArmEmission,
	renderForcedArm,
	withBuiltPrerenderPage,
	type ArmFillEmission,
} from '../src/build/prerender.ts';

const root = resolve(import.meta.dirname, '../../..');
const liveFeed = resolve(root, 'demos/live-feed/src/App.tsrx');

function serverPlugin() {
	return createMarklessRolldownPlugin({
		environment: 'server',
		options: { rootDir: root, dev: false },
	});
}

let cached: Promise<{ first: ArmFillEmission; second: ArmFillEmission }> | undefined;

// The settle facts the real build hands the plan: the page's own rendered state
// (for the build-known scalars a derived hole reads) and the flattened
// bound-symbol descriptor, both produced by the same functions the build uses.
async function settleContext(page: Parameters<typeof deriveArmFillPlan>[0]) {
	const compiled = await compiledLiveFeed();
	const runnerSymbolId = compiled.protocolView.asyncRunners!['computed:feed']!;
	const settle = planSettleModule({
		boundaries: compiled.renderData.boundaries,
		asyncRunners: compiled.protocolView.asyncRunners,
		descriptors: perBoundaryBoundSymbolDescriptors(compiled.renderData, [
			LIVE_FEED_BOUND_ROW as never,
		]),
		symbols: [
			{ id: runnerSymbolId, chunk: 'virtual:runner', exportName: 'runner' },
			{ id: LIVE_FEED_BOUND_ROW.baseSymbolId, chunk: 'virtual:base', exportName: 'base' },
		],
	});
	const output = await evaluateBuiltPageClosure(page as never);
	return { state: output.state, bound: settle?.bound };
}

// One server build, two independent plan derivations: byte-identity across
// derivations is the reproducibility proof the checkpoint reports.
function liveFeedEmissions() {
	cached ??= withBuiltPrerenderPage(
		{ entry: liveFeed, serverPlugin: serverPlugin() },
		async (page) => {
			const context = await settleContext(page);
			const first = await deriveArmFillPlan(page, context);
			const second = await deriveArmFillPlan(page, context);
			if (!first || !second) throw new Error('live-feed emitted no fill plan');
			return { first, second };
		},
	);
	return cached;
}

test('the settled arm of live-feed becomes templates plus a fill plan', async () => {
	const { first } = await liveFeedEmissions();
	expect(first.skipped).toEqual([]);
	expect(first.plan.boundaries).toHaveLength(1);
	const boundary = first.plan.boundaries[0]!;
	expect(boundary.id).toBe('boundary:0');
	expect(boundary.arm).toBe('try');

	// Arm template, row template, empty template.
	expect(first.html).toContain('<template m:arm="boundary:0">');
	expect(first.html).toContain('<template m:row="boundary:0">');
	expect(first.html).toContain('<template m:empty="boundary:0">');
	expect(first.html).toContain('<li data-feed-empty="">No local updates</li>');
	expect(first.html).toContain('type="markless/fill-plan"');
}, 180_000);

test('every settled-arm hole of live-feed is covered, including the derived weighted count', async () => {
	const { first } = await liveFeedEmissions();
	const boundary = first.plan.boundaries[0]!;
	const armHoles = boundary.holes.map((hole) => ({
		kind: hole.kind,
		name: hole.name,
		from: hole.from,
	}));
	// feed.channel (text), the derived weighted count, feed.updates.length (attribute).
	expect(armHoles).toEqual([
		{ kind: 'text', name: undefined, from: ['channel'] },
		{
			kind: 'text',
			name: undefined,
			from: {
				symbolId: 'bound:symbol%3A1:component-edge%3A0',
				args: [
					{ node: 'computed:feed', path: ['updates', 'length'] },
					{ node: 'state:weight', path: [] },
				],
			},
		},
		{ kind: 'attribute', name: 'data-row-count', from: ['updates', 'length'] },
	]);

	const repeat = boundary.repeat!;
	expect(repeat.from).toEqual(['updates']);
	expect(repeat.holes.map((hole) => [hole.kind, hole.name, hole.from])).toEqual([
		['attribute', 'data-row-key', ['id']],
		['text', undefined, ['project']],
		['text', undefined, ['version']],
		['text', undefined, ['stage']],
	]);
	expect(repeat.emptyHoles).toEqual([]);
}, 180_000);

test('the derived weighted count is a symbol reference, never a baked literal', async () => {
	const { first } = await liveFeedEmissions();
	// 2 * updates.length for any probe value would appear as a number after the
	// authored prefix; the template must carry an anchor there instead.
	expect(first.html).toMatch(/Weighted count <!--mh:\d+--><\/p>/);
	expect(first.html).not.toMatch(/Weighted count \d/);
}, 180_000);

test('no hole sentinel leaks into the emitted document', async () => {
	const { first } = await liveFeedEmissions();
	expect(first.html).not.toContain('');
	expect(first.html).not.toContain('mh0');
	// Every plan coordinate resolves to exactly one anchor in the emitted markup.
	const coordinates = first.plan.boundaries.flatMap((boundary) => [
		...boundary.holes.map((hole) => hole.coordinate),
		...(boundary.repeat
			? [
					boundary.repeat.coordinate,
					...boundary.repeat.holes.map((hole) => hole.coordinate),
					...boundary.repeat.emptyHoles.map((hole) => hole.coordinate),
				]
			: []),
	]);
	expect(new Set(coordinates).size).toBe(coordinates.length);
	for (const coordinate of coordinates)
		expect(first.html.split(`<!--mh:${coordinate}-->`)).toHaveLength(2);
}, 180_000);

test('plan and templates are byte-identical across derivations', async () => {
	const { first, second } = await liveFeedEmissions();
	expect(second.html).toBe(first.html);
	expect(second.planBytes).toBe(first.planBytes);
	expect(first.planBytes).toBeLessThanOrEqual(2500);
}, 180_000);

test('a structure-dependent arm emits no plan at all', async () => {
	const { first } = await liveFeedEmissions();
	// Same arm, plus a branch record inside it: the arm's SHAPE now depends on
	// data beyond the row count, which no hole can express.
	const withBranch = (probe: unknown) => {
		const clone = structuredClone(probe) as any;
		for (const pass of ['two', 'one', 'none'] as const) {
			const boundary = clone[pass].output.view.asyncBoundaries[0];
			boundary.armRecords.branches = [{ id: 'branch:0', branchSiteId: 'branch:0' }];
		}
		return clone;
	};
	const probes = await capturedProbes();
	const context = await capturedContext();
	const blocked = planArmEmission(probes.map(withBranch) as never, context);
	expect(blocked.emission).toBeUndefined();
	expect(blocked.skipped[0]?.reason).toContain('structure depends on data');
	// Control: the same captured probes without the injected branch DO plan.
	expect(buildArmFillEmission(probes as never, context)?.html).toBe(first.html);
}, 180_000);

let capturedContextCache: Promise<Awaited<ReturnType<typeof settleContext>>> | undefined;

function capturedContext() {
	capturedContextCache ??= withBuiltPrerenderPage(
		{ entry: liveFeed, serverPlugin: serverPlugin() },
		(page) => settleContext(page),
	);
	return capturedContextCache;
}

let capturedCache: Promise<ReadonlyArray<unknown>> | undefined;

// Probe passes captured as plain data so fail-closed paths can be exercised
// against a mutated fixture without another server build.
function capturedProbes() {
	capturedCache ??= withBuiltPrerenderPage(
		{ entry: liveFeed, serverPlugin: serverPlugin() },
		async (page) =>
			Promise.all(
				[1_000_003, 8_000_017].map(async (tag) => ({
					two: plain(await renderForcedArm(page, 2, tag)),
					one: plain(await renderForcedArm(page, 1, tag)),
					none: plain(await renderForcedArm(page, null, tag)),
				})),
			),
	);
	return capturedCache;
}

function plain(pass: Awaited<ReturnType<typeof renderForcedArm>>) {
	return {
		output: {
			html: pass.output.html,
			state: JSON.parse(JSON.stringify(pass.output.state ?? null)),
			view: JSON.parse(JSON.stringify(pass.output.view ?? null)),
			structure: pass.output.structure,
		},
		minter: { paths: pass.minter.paths },
	};
}

// ---------------------------------------------------------------------------
// T012 / S4a: the lean bound-symbol descriptor.
//
// The plan's derived hole is a REFERENCE to `bound:symbol%3A1:component-edge%3A0`.
// Calling it needs the base symbol the loader resolves plus the mapping from
// the child's legacy prop reads onto the parent routes — facts that live only
// in the compiler's bound-resolver rows. The row below is the row the real
// live-feed build produces; the chunk graph is compiled from the real source.
// ---------------------------------------------------------------------------

const LIVE_FEED_BOUND_ROW = {
	id: 'bound:symbol%3A1:component-edge%3A0',
	baseSymbolId: 'imported:%2Fdemos%2Flive-feed%2Fsrc%2FUpdateSummary.tsrx:symbol:1',
	componentEdgePath: ['component-edge:0'],
	ancestry: [
		{ componentEdgeId: 'component-edge:0', branchScopeIds: [], keyedRepeatScopeIds: [] },
	],
	captureSlots: [
		{
			slotId: 'capture-slot:prop:UpdateSummary:updates.length#0',
			path: ['length'],
			route: {
				kind: 'graph-reference',
				componentEdgeId: 'component-edge:0',
				componentEdgePath: ['component-edge:0'],
				graphNodeId: 'computed:feed',
				path: ['updates', 'length'],
			},
			legacyGraphRead: { graphNodeId: 'prop:props', path: ['updates', 'length'] },
		},
		{
			slotId: 'capture-slot:prop:UpdateSummary:weight#0',
			path: [],
			route: {
				kind: 'graph-reference',
				componentEdgeId: 'component-edge:0',
				componentEdgePath: ['component-edge:0'],
				graphNodeId: 'state:weight',
				path: [],
			},
			legacyGraphRead: { graphNodeId: 'prop:props', path: ['weight'] },
		},
	],
} as const;

let compiledCache: Promise<CompileTsrxModuleResult> | undefined;

function compiledLiveFeed() {
	compiledCache ??= compileTsrxModule({
		filename: liveFeed,
		source: readFileSync(liveFeed, 'utf8'),
		resolverId: 'virtual:markless:resolver:live-feed',
		symbols: [],
	} as never);
	return compiledCache;
}

test('the bound-symbol descriptor is derived per boundary from the arm chunk graph', async () => {
	const compiled = await compiledLiveFeed();
	const descriptors = perBoundaryBoundSymbolDescriptors(compiled.renderData, [
		LIVE_FEED_BOUND_ROW as never,
	]);

	// One boundary, and the row is attached to it because `component-edge:0` is
	// reachable from that boundary's own try-arm chunk — not because it is the
	// only row in the module.
	expect(descriptors).toEqual({
		'boundary:0': [
			{
				id: 'bound:symbol%3A1:component-edge%3A0',
				base: 'imported:%2Fdemos%2Flive-feed%2Fsrc%2FUpdateSummary.tsrx:symbol:1',
				slots: [
					['prop:props', ['updates', 'length'], 'computed:feed', ['updates', 'length']],
					['prop:props', ['weight'], 'state:weight', []],
				],
			},
		],
	});
});

test("a row outside the boundary's arm chunks is not attached to it", async () => {
	const compiled = await compiledLiveFeed();
	const elsewhere = {
		...LIVE_FEED_BOUND_ROW,
		ancestry: [
			{ componentEdgeId: 'component-edge:9', branchScopeIds: [], keyedRepeatScopeIds: [] },
		],
	};
	expect(
		perBoundaryBoundSymbolDescriptors(compiled.renderData, [elsewhere as never]),
	).toBeUndefined();
	expect(perBoundaryBoundSymbolDescriptors(compiled.renderData, [])).toBeUndefined();
});

test('the emitted descriptor is a data-only export, minimal and byte-identical', async () => {
	const compiled = await compiledLiveFeed();
	const boundSymbolDescriptors = perBoundaryBoundSymbolDescriptors(compiled.renderData, [
		LIVE_FEED_BOUND_ROW as never,
	])!;
	const emit = () =>
		emitResumeModule({
			payloadId: 'virtual:markless:payload:live-feed',
			resolverId: 'virtual:markless:resolver:live-feed',
			boundSymbolDescriptors,
			symbols: [],
			symbolRoutes: [],
		});
	const source = emit();
	expect(source).toBe(emit());

	const line = source
		.split('\n')
		.find((candidate) => candidate.includes(MARKLESS_BOUND_SYMBOLS_EXPORT))!;
	expect(line).toContain('export const marklessBoundSymbols = {"boundary:0":');
	// Nothing in the module reads it: this slice is plumbing, S4b is the consumer.
	expect(source.split(MARKLESS_BOUND_SYMBOLS_EXPORT)).toHaveLength(2);
	// Minimal: only the parent routes and the legacy reads that answer them —
	// no slot ids, no ancestry, no component-edge paths.
	expect(line).not.toContain('capture-slot');
	expect(line).not.toContain('ancestry');
	expect(line).not.toContain('componentEdgePath');
	expect(line).not.toContain('graph-reference');

	// Reported as DESCRIPTOR_BYTES in the T012 checkpoint.
	expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(400);

	// A module with no bound rows emits nothing at all.
	expect(
		emitResumeModule({
			payloadId: 'virtual:markless:payload:live-feed',
			resolverId: 'virtual:markless:resolver:live-feed',
			symbols: [],
			symbolRoutes: [],
		}),
	).not.toContain(MARKLESS_BOUND_SYMBOLS_EXPORT);
});

test('consumer builds ship symbol chunks without authored-source strings', async () => {
	const source = readFileSync(liveFeed, 'utf8');
	const transform = (executionLog: 'auto' | 'never') =>
		transformTsrxModule({
			filename: liveFeed,
			source,
			environment: 'client',
			executionLog,
		});

	const [lab, consumer] = await Promise.all([transform('auto'), transform('never')]);
	const symbolSources = (result: Awaited<ReturnType<typeof transform>>) =>
		result.virtualModules.filter((module) => module.type === 'symbol').map((module) => module.source);

	const labSymbols = symbolSources(lab);
	const consumerSymbols = symbolSources(consumer);
	expect(labSymbols.length).toBeGreaterThan(0);
	expect(consumerSymbols).toHaveLength(labSymbols.length);
	expect(labSymbols.some((module) => module.includes('authoredSource'))).toBe(true);
	expect(consumerSymbols.some((module) => module.includes('authoredSource'))).toBe(false);
});

// A module the compiler produced no render data for cannot have settled arms.
// Planning must decline rather than throw: a transform crash here would take
// down every consumer build whose artifact set lacks render data.
test('a module with no render data plans no settle module instead of crashing', () => {
	expect(planSettleModule({ boundaries: undefined, symbols: [] })).toBeUndefined();
});
