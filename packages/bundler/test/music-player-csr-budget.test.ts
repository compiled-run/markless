import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { MARKLESS_BUILD_PREFIX } from '../src/build/chunking.ts';
import { withoutDemand } from '../../../scripts/benchmarks/perf-guards/attribution.mjs';
import { acquireDemoBuildLock, releaseDemoBuildLock } from './helpers/demo-build-lock.ts';
import {
	chunkName,
	createStageLadder,
	eagerChunkNames,
	execPnpm,
	gzipByChunk,
	payPerUse,
	payPerUseReport,
	unexpectedUndemanded,
	readClientBuildArtifacts,
	readOverheadArtifacts,
	RESUME_MODULE_ATTRIBUTE,
	ROUTER_LINK_RESUMER_ATTRIBUTE,
	scriptSrc,
	scriptTags,
	stageBreakdown,
	stageReport,
	staticClosure,
	type BudgetMeasurement,
	type OverheadArtifacts,
} from './helpers/staged-budget.ts';

const root = resolve(import.meta.dirname, '../../..');
const demo = resolve(root, 'demos/music-player');
const clientPublic = resolve(demo, 'dist');
const clientBuild = resolve(clientPublic, MARKLESS_BUILD_PREFIX);

// The client lane of the same app the SSR lane measures: no server, a shell prerendered at build
// time, and the same delegated resumer waking symbols on demand. Stage bytes are whole-app totals,
// so they are reported, not gated (owner ruling 2026-09-24); the gate is pay-per-use on the page's
// download. Framework weight per runtime module and per construct is gated by `pnpm perf:guard`.
const STAGES = [
	'page-load download',
	'page-load execute',
	'interaction 1 marginal',
	'interaction 2 marginal',
	'interaction 3 marginal',
];

let measured: BudgetMeasurement;
let artifacts: OverheadArtifacts;
let eagerChunks: readonly string[];

// build-determinism.test.ts builds this same demo into this same dist/, and
// vitest runs the two files in parallel workers. The lock spans the whole file
// because the last test reads dist/index.html long after the build.
beforeAll(async () => {
	await acquireDemoBuildLock(demo);
	measured = await measureBuiltDemo();
}, 240_000);

afterAll(() => releaseDemoBuildLock(demo));

test('music-player CSR page-load download pays only for runtime features the page uses', () => {
	expect(measured.stages.map((stage) => stage.stage)).toEqual(STAGES);
	expect(
		measured.instrumented,
		'production build must keep execution instrumentation stripped',
	).toEqual([]);
	expect(
		measured.aggregate.chunks,
		'production build must emit client JS chunks',
	).toBeGreaterThan(0);
	console.info(report(measured));
	expect(
		measured.payPerUse.pageMaps.length,
		'the page download must carry its demand maps',
	).toBeGreaterThan(0);
	expect(
		unexpectedUndemanded(measured.payPerUse),
		payPerUseReport('music-player CSR', measured.payPerUse),
	).toEqual([]);
});

test('the pay-per-use gate goes red and names the runtime module it caught', () => {
	const id = measured.payPerUse.demandedFeatures[0];
	expect(id, 'the page must ship at least one demanded runtime feature module').toBeDefined();

	const result = payPerUse(artifacts, eagerChunks, withoutDemand(artifacts.demand, id!));

	expect(unexpectedUndemanded(result)).toEqual([id]);
	expect(payPerUseReport('music-player CSR', result)).toContain(`runtime feature module ${id}`);
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
		title: 'music-player CSR stage bytes',
		budget,
		aggregateNote: `total size-mapped shipped JS: ${budget.aggregate.gzipBytes} gzip bytes across ${budget.aggregate.chunks} chunks`,
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
	artifacts = readOverheadArtifacts(clientPublic, demo);
	eagerChunks = page.eagerChunks;
	const ladder = createStageLadder(sum, (chunks) => stageBreakdown(artifacts, chunks));

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
		payPerUse: payPerUse(artifacts, page.eagerChunks),
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
