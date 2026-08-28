import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { MARKLESS_BUILD_PREFIX } from '../src/build/chunking.ts';
import { acquireDemoBuildLock, releaseDemoBuildLock } from './helpers/demo-build-lock.ts';
import {
	chunkName,
	createStageLadder,
	eagerChunkNames,
	execPnpm,
	gzipByChunk,
	readClientBuildArtifacts,
	RESUME_MODULE_ATTRIBUTE,
	ROUTER_LINK_RESUMER_ATTRIBUTE,
	scriptSrc,
	scriptTags,
	stageOverruns,
	stageReport,
	staticClosure,
	type BudgetMeasurement,
	type StageAnchor,
} from './helpers/staged-budget.ts';

const root = resolve(import.meta.dirname, '../../..');
const demo = resolve(root, 'demos/music-player');
const clientPublic = resolve(demo, 'dist');
const clientBuild = resolve(clientPublic, MARKLESS_BUILD_PREFIX);

// The client lane of the same app the SSR wall measures: no server, a shell
// prerendered at build time, and the same delegated resumer waking symbols on
// demand. Stage names mirror packages/bundler/test/music-player-ssr-budget.test.ts
// so the two lanes are read side by side.
//
// MEASUREMENT LANDMINE, inherited from the SSR wall: these numbers are a
// NODE_ENV=test build, because vitest sets NODE_ENV=test and the build below
// inherits it. The same `pnpm --dir <demo> build` from a plain shell reads
// lower. Measure through the test, or export NODE_ENV=test.
//
// Anchors measured 2026-08-25 at the repo root, NODE_ENV=test,
// MARKLESS_CONSUMER_BUILD=1. Each is a must-not-exceed ceiling of anchor +
// margin; the margin absorbs gzip run variance and the few bytes an absolute
// build path costs. Headroom follows the SSR wall's banding: 128 B once a
// stage is measured in the ten-thousands of bytes, 32 B below that. Walk DOWN.
//
// The client lane's page-load download is ~2x the SSR lane's for the same app:
// the built page modulepreloads nearly every chunk it emits, and what SSR
// serves as payload inside the HTML the client lane ships as JS instead (the
// prerender data chunk and one staged trigger-group chunk per dispatching
// element).
// Re-measured 2026-08-27 on this tree, same conditions. One line per stage, each
// naming what moved it:
// MEASUREMENT LANDMINE, found while re-anchoring: this lane's page-load download
// is NOT reproducible run to run. Three consecutive builds on one unchanged tree
// measured 135,182 across 106 chunks, 135,982 across 107, and 135,788 across
// 107. The chunk count itself moves, so this is build nondeterminism and not the
// gzip run variance the margin was sized for. The anchor below is the highest of
// the three; every other stage on this lane held to within 1 B across the same
// three runs. Do not tighten this one stage on a single sample, and do not read
// a sub-800 B move here as a regression until the nondeterminism is chased down.
//   page-load download  128,534 -> 135,982 (+7,448; the +6,648 line below is the
//     lowest of the three samples). The eager
//     set carries the dispatch-core chunk this demo shares with the vite
//     fixtures (5,699 gzip here, holding both marklessNativeFocus/
//     marklessOverlayFocusOrigin/marklessPrimedHover from 529caa2d and
//     marklessQualifyGraphNodeId/marklessWidgetHostGraph/marklessRowParent from
//     9fbedb5c + 65ab93e3 + c288d956), plus one staged trigger chunk per
//     dispatching element, each of which now inlines the qualification wrapper.
//   page-load execute   15,316 -> 14,221 (-1,095). Walks DOWN: the roster no
//     longer sits in the eager static closure - it is reached on demand.
//   interaction 1       2,254 -> 2,416 (+162)
//   interaction 2       2,513 -> 2,705 (+192)
//   interaction 3       2,514 -> 2,706 (+192). All three per-trigger chunks
//     carry marklessQualifyGraphNodeId and none of the focus keys, so the whole
//     marginal growth is the widget-instance qualification family.
// Attribution here is by named change over the anchor..tip window, confirmed by
// which identifiers each measured chunk actually contains; it is not a
// revert-measurement, and the window is ~100 merges wide.
const STAGE_ANCHORS = {
	// 135,982 -> 136,775 (2026-08-27). The LANDMINE ABOVE IS CLOSED, and closing it
	// is most of this move. That anchor was the highest of three nondeterministic
	// samples (135,182 / 135,982 / 135,788, chunk count 106/107/107); the build now
	// emits the same chunk graph every run (build-determinism.test.ts pins it), and
	// the reproducible value on this tree is 136,775. So the old anchor was not a
	// smaller build, it was a luckier sample - the parallel claim loading it came
	// from could register modules in completion order and sometimes collapse the
	// graph further than a real build does.
	// Of the +793, a revert-measurement of the three element-handle-qualifier web
	// files on this tree puts ~77 B on the qualifier family (the same order as the
	// +40 / +31 residue the vite fixtures show for it); the rest is the graph
	// settling. This lane modulepreloads nearly every chunk it emits, so the
	// 1,053 B the qualifier move recovered from the fixtures' largest runtime chunk
	// does NOT come back here - splitting one eager chunk into two eager chunks
	// costs this stage a little rather than saving it.
	// 136,775 -> 137,128 (+353, render-order ordinals), by revert-measurement on
	// this tree: 136,700 with the change set out, 137,053 with it in, 108 eager
	// chunks BOTH ways. Nothing regrouped, so all of it is code in chunks this
	// lane already preloads, at the three sites the SSR wall's entry names - the
	// locator registry's extra element-handle key, and the two reads of the
	// live-roster loader. The roster module itself is absent from this build:
	// the loader specifier is written only for a payload with computed nodes and
	// this demo has none, which is why the chunk count did not move. The
	// per-site split is not restated here because it was measured on the SSR
	// lane, not this one; this lane prices the same source delta higher because
	// it modulepreloads nearly every chunk it emits.
	// +106: keyed-repeat row-template slots qualified through composition (rows may read outside their item); +9: component-local handles keyed by host scope.
	'page-load download': { gzipBytes: 137_243, margin: 128 },
	// +5: roster-count placeholder minted in the eager seed slot (the resolver itself is demand-loaded).
	'page-load execute': { gzipBytes: 14_226, margin: 128 },
	'interaction 1 marginal': { gzipBytes: 2_416, margin: 32 },
	'interaction 2 marginal': { gzipBytes: 2_705, margin: 32 },
	'interaction 3 marginal': { gzipBytes: 2_706, margin: 32 },
} as const satisfies Record<string, StageAnchor>;

let measured: BudgetMeasurement;

// build-determinism.test.ts builds this same demo into this same dist/, and
// vitest runs the two files in parallel workers. The lock spans the whole file
// because the last test reads dist/index.html long after the build.
beforeAll(async () => {
	await acquireDemoBuildLock(demo);
	measured = await measureBuiltDemo();
}, 240_000);

afterAll(() => releaseDemoBuildLock(demo));

test('music-player CSR production build holds every staged budget', () => {
	expect(measured.stages.length, 'staged measurement must produce stages').toBe(
		Object.keys(STAGE_ANCHORS).length,
	);
	expect(
		measured.instrumented,
		'production build must keep execution instrumentation stripped',
	).toEqual([]);
	expect(
		measured.aggregate.chunks,
		'production build must emit client JS chunks',
	).toBeGreaterThan(0);
	expect(stageOverruns(measured.stages, STAGE_ANCHORS), report(measured)).toEqual([]);
});

test('the staged budget goes red and names the stage it caught', () => {
	const stage = measured.stages[0]!;
	const perturbed = { ...STAGE_ANCHORS, [stage.stage]: { gzipBytes: 1, margin: 0 } };

	const overruns = stageOverruns(measured.stages, perturbed);

	expect(overruns).toHaveLength(1);
	expect(overruns[0]).toContain(stage.stage);
	expect(overruns[0]).toContain(String(stage.gzipBytes));
	expect(overruns[0]).toContain('anchor 1 (+0 margin) = 1');
});

// The SSR wall's sixth stage has no counterpart here, and this pins why rather
// than leaving it silently absent: this demo has no router, so the built page
// ships no router-link resumer and there is no first navigation to charge.
test('the CSR lane has no navigation stage because the built page ships no router link', async () => {
	const html = await readFile(resolve(clientPublic, 'index.html'), 'utf8');

	expect(
		scriptTags(html).some((script) => ROUTER_LINK_RESUMER_ATTRIBUTE.test(script.attributes)),
	).toBe(false);
});

function report(budget: BudgetMeasurement): string {
	return stageReport({
		title: 'music-player CSR staged budget',
		budget,
		anchors: STAGE_ANCHORS,
		aggregateNote: `informational, not gated - total size-mapped shipped JS: ${budget.aggregate.gzipBytes} gzip bytes across ${budget.aggregate.chunks} chunks`,
	});
}

async function measureBuiltDemo(): Promise<BudgetMeasurement> {
	await rm(clientPublic, { force: true, recursive: true });
	// Consumer posture: the wall measures the 'never' build even though the
	// demo's default build keeps the lab instrument (owner rulings 2026-07-12).
	await execPnpm(root, ['--dir', demo, 'build'], { MARKLESS_CONSUMER_BUILD: '1' });

	const { aggregateChunks, graph, instrumented } = await readClientBuildArtifacts(clientPublic);
	const gzip = gzipByChunk(clientBuild);
	const sum = (chunks: Iterable<string>) =>
		[...chunks].reduce((total, name) => total + gzip(name), 0);

	const html = await readFile(resolve(clientPublic, 'index.html'), 'utf8');
	const page = parsePrerenderedPage(html);
	const resumeClosure = staticClosure(graph, [...page.entryChunks, page.resumeChunk]);
	const triggers = await stagedTriggers(resumeClosure);
	const ladder = createStageLadder(sum);

	ladder.standalone(
		'page-load download',
		'every JS file the built HTML makes the browser fetch before any interaction',
		page.eagerChunks,
	);
	ladder.marginal(
		'page-load execute',
		'the static import closure of the entry script and the resume module the built page names',
		resumeClosure,
	);
	for (const [index, trigger] of triggers.slice(0, 3).entries()) {
		ladder.marginal(
			`interaction ${index + 1} marginal`,
			`${trigger.eventName} on <${trigger.tagName}> at DOM-order index ${trigger.hostIndex} loading ${trigger.chunk}`,
			staticClosure(graph, [trigger.chunk]),
		);
	}

	return {
		stages: ladder.stages,
		aggregate: { chunks: aggregateChunks.length, gzipBytes: sum(aggregateChunks) },
		instrumented,
	};
}

type PrerenderedPage = {
	readonly eagerChunks: readonly string[];
	readonly entryChunks: readonly string[];
	readonly resumeChunk: string;
};

function parsePrerenderedPage(html: string): PrerenderedPage {
	const scripts = scriptTags(html);
	const resumer = scripts.find((script) => RESUME_MODULE_ATTRIBUTE.test(script.attributes));
	if (!resumer) throw new Error('built page carries no resume module marker');
	const resumeChunk = chunkName(RESUME_MODULE_ATTRIBUTE.exec(resumer.attributes)![1]!);

	return {
		eagerChunks: eagerChunkNames(html, scripts),
		entryChunks: scripts.flatMap((script) => {
			const src = scriptSrc(script);
			return src && chunkName(src) !== resumeChunk ? [chunkName(src)] : [];
		}),
		resumeChunk,
	};
}

type StagedTrigger = {
	readonly hostIndex: number;
	readonly tagName: string;
	readonly eventName: string;
	readonly chunk: string;
};

// The client lane carries no protocol payload in its HTML, so what a click
// costs is read off the staged trigger table the resume module ships: one
// `(DOM-order index, tag, event) -> import(chunk)` arm per dispatching element,
// emitted by packages/bundler/src/source-module.ts.
const STAGED_TRIGGER =
	/,\s*(\d+)\s*,\s*[`'"]([^`'"]*)[`'"]\s*,\s*[`'"]([^`'"]*)[`'"]\s*\)[\s)]*(?:\?|return)\s*import\(\s*[`'"]([^`'"]+\.js)[`'"]/g;

// DOM order is reading order: a reader meets a page's controls top-down, so the
// first three interactions are the first three dispatching elements.
async function stagedTriggers(closure: Iterable<string>): Promise<StagedTrigger[]> {
	const triggers = new Map<number, StagedTrigger>();
	for (const chunk of [...closure].sort()) {
		const source = await readFile(resolve(clientBuild, chunk), 'utf8');
		for (const match of source.matchAll(STAGED_TRIGGER)) {
			const hostIndex = Number(match[1]);
			if (triggers.has(hostIndex))
				throw new Error(`two staged triggers claim DOM-order index ${hostIndex}`);
			triggers.set(hostIndex, {
				hostIndex,
				tagName: match[2]!,
				eventName: match[3]!,
				chunk: chunkName(match[4]!),
			});
		}
	}
	if (triggers.size < 3)
		throw new Error(
			`built resume module stages ${triggers.size} triggers; the staged budget needs at least 3`,
		);
	return [...triggers.values()].sort((left, right) => left.hostIndex - right.hostIndex);
}
