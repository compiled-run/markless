import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'pathe';
import { runtimeModuleSizes } from '../../../scripts/benchmarks/perf-guards/attribution.mjs';
import { BUDGETS } from '../../../scripts/benchmarks/perf-guards/config.mjs';
import type { RuntimeSizeReport } from '../test-support/runtime-size.ts';

export type RuntimeBudget = {
	readonly maxRuntimeChunkGzipBytes?: number;
	readonly maxEmittedRuntimeGzipBytes: number;
	readonly forbidVitePreloadHelper?: boolean;
};

export function assertRuntimeBudget(input: {
	readonly budget: RuntimeBudget;
	readonly emittedReport: RuntimeSizeReport;
}) {
	const { budget, emittedReport } = input;
	assert(
		emittedReport.runtimeChunks.length > 0,
		`expected at least one runtime-heavy emitted chunk\n${emittedReport.summary}`,
	);
	assert(
		budget.maxRuntimeChunkGzipBytes === undefined ||
			(emittedReport.largestRuntimeChunk?.gzipBytes ?? 0) <= budget.maxRuntimeChunkGzipBytes,
		`largest runtime chunk gzip budget exceeded: ${emittedReport.largestRuntimeChunk?.gzipBytes ?? 0} > ${budget.maxRuntimeChunkGzipBytes}\n${emittedReport.summary}`,
	);
	// Owner ruling 2026-07-05: no per-page fetch metric — fetched-but-unexecuted code is
	// cheap under progressive execution; 'emitted = required' assertions arrive with the
	// runtime-stdlib goal. The emitted wall + per-chunk caps guard bloat.
	const emittedRuntimeGzipBytes = emittedReport.runtimeChunks.reduce(
		(total, chunk) => total + chunk.gzipBytes,
		0,
	);
	assert(
		emittedRuntimeGzipBytes <= budget.maxEmittedRuntimeGzipBytes,
		`emitted runtime gzip wall exceeded: ${emittedRuntimeGzipBytes} > ${budget.maxEmittedRuntimeGzipBytes}\n${emittedReport.summary}`,
	);
	if (budget.forbidVitePreloadHelper) {
		const chunksWithVitePreloadHelper = emittedReport.runtimeChunks
			.filter((chunk) => chunk.hasVitePreloadHelper)
			.map((chunk) => chunk.fileName);
		assert(
			chunksWithVitePreloadHelper.length === 0,
			`runtime chunks retained Vite preload helper: ${chunksWithVitePreloadHelper.join(', ')}\n${emittedReport.summary}`,
		);
	}
}

export type RuntimeModuleAnchors = Record<string, Record<string, number>>;

export const FIXTURE_RUNTIME_ANCHORS = resolve(import.meta.dirname, 'fixture-runtime-anchors.json');
const ACCEPT_ENV = 'MARKLESS_ACCEPT_FIXTURE_RUNTIME';
const ACCEPT_COMMAND = `${ACCEPT_ENV}=1 pnpm exec vp test --run packages/bundler/test/fixture-builds.test.ts`;

/** Per-feature framework weight on a minimal fixture: each runtime module's rendered bytes against its anchor. */
export function runtimeModuleOverruns(
	fixture: string,
	measured: Record<string, number>,
	anchors: Record<string, number> | undefined,
): string[] {
	const overruns: string[] = [];
	if (!anchors)
		return [
			`${fixture}: no runtime module anchors recorded. Record them with ${ACCEPT_COMMAND}`,
		];
	for (const [id, bytes] of Object.entries(measured)) {
		const anchor = anchors[id];
		if (anchor === undefined) {
			overruns.push(
				`${fixture}: new runtime module ${id} ships ${bytes} B (rendered) with no anchor. If intended, record it with ${ACCEPT_COMMAND}`,
			);
			continue;
		}
		const delta = bytes - anchor;
		if (delta > BUDGETS.runtimeModuleGrowthBytes)
			overruns.push(
				`${fixture}: runtime module ${id} got heavier: ${anchor} -> ${bytes} B (+${delta} B rendered, budget +${BUDGETS.runtimeModuleGrowthBytes} B). If intended, re-anchor with ${ACCEPT_COMMAND}`,
			);
	}
	return overruns;
}

export function fixtureRuntimeModules(dist: string): Record<string, number> {
	return runtimeModuleSizes(
		JSON.parse(readFileSync(resolve(dist, 'build/byte-attribution.json'), 'utf8')),
	);
}

export function readFixtureRuntimeAnchors(): RuntimeModuleAnchors {
	return JSON.parse(readFileSync(FIXTURE_RUNTIME_ANCHORS, 'utf8')) as RuntimeModuleAnchors;
}

/** With the accept variable set, records this fixture's measured sizes instead of checking them. */
export function acceptFixtureRuntime(fixture: string, measured: Record<string, number>): boolean {
	if (process.env[ACCEPT_ENV] !== '1') return false;
	const anchors = readFixtureRuntimeAnchors();
	anchors[fixture] = measured;
	const sorted = Object.fromEntries(
		Object.keys(anchors)
			.sort()
			.map((key) => [key, anchors[key]!]),
	);
	writeFileSync(FIXTURE_RUNTIME_ANCHORS, `${JSON.stringify(sorted, null, '\t')}\n`);
	return true;
}

export function pageFetchScriptsFromHtml(html: string): string[] {
	const moduleScripts = [
		...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g),
	].map((match) => match[1]!);
	const modulePreloads = [
		...html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/g),
	].map((match) => match[1]!);

	assert(
		modulePreloads.length > 0,
		'Missing emitted modulepreload plan: fixture budget checks need the page preload links to enumerate the real fetch set.',
	);
	return [...new Set([...moduleScripts, ...modulePreloads])];
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
