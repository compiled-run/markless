import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'pathe';
import { beforeAll, expect, test } from 'vitest';
import { MARKLESS_BUILD_PREFIX } from '../src/build/chunking.ts';
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
// Anchors measured 2026-08-25 on a local macOS worktree, NODE_ENV=test,
// MARKLESS_CONSUMER_BUILD=1. Each is a must-not-exceed ceiling of anchor +
// margin; the margin absorbs gzip run variance and the few bytes an absolute
// build path costs. Headroom follows the SSR wall's banding: 128 B once a
// stage is measured in the ten-thousands of bytes, 32 B below that. Walk DOWN.
//
// The client lane's page-load download is ~2x the SSR lane's for the same app:
// the built page modulepreloads 104 of its 107 chunks, and what SSR serves as
// payload inside the HTML the client lane ships as JS instead (the prerender
// data chunk and one staged trigger-group chunk per dispatching element).
const STAGE_ANCHORS = {
	'page-load download': { gzipBytes: 127_674, margin: 128 },
	'page-load execute': { gzipBytes: 15_313, margin: 128 },
	'interaction 1 marginal': { gzipBytes: 2_293, margin: 32 },
	'interaction 2 marginal': { gzipBytes: 2_556, margin: 32 },
	'interaction 3 marginal': { gzipBytes: 2_555, margin: 32 },
} as const satisfies Record<string, StageAnchor>;

let measured: BudgetMeasurement;

beforeAll(async () => {
	measured = await measureBuiltDemo();
}, 240_000);

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
