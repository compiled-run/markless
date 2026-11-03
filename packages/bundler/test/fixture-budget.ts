import { readFileSync } from 'node:fs';
import {
	formatChange,
	readAnchorsWithChanges,
	recordChange,
} from '../../../scripts/benchmarks/anchor-ledger.mjs';
import { runtimeModuleSizes } from '../../../scripts/benchmarks/perf-guards/attribution.mjs';
import { BUDGETS } from '../../../scripts/benchmarks/perf-guards/config.mjs';
import { marklessBuildManifestPath } from '../src/build/build-manifests.ts';
import { MARKLESS_BYTE_ATTRIBUTION } from '../src/build/chunking.ts';
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
	const { maxEmittedRuntimeGzipBytes: emittedRuntimeGzipBytes } = measuredWalls(emittedReport);
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
type Wall = { readonly measured: number; readonly margin: number };
export type FixtureRuntimeAnchors = {
	readonly modules: RuntimeModuleAnchors;
	readonly walls: Record<string, Record<string, Wall>>;
};

const ACCEPT_ENV = 'MARKLESS_ACCEPT_FIXTURE_RUNTIME';
const REASON_ENV = 'MARKLESS_ACCEPT_REASON';
const ACCEPT_COMMAND = `${ACCEPT_ENV}=1 ${REASON_ENV}="<one line>" pnpm exec vp test --run packages/bundler/test/fixture-builds.test.ts`;

/** Emitted runtime gzip bytes, the quantities the walls limit; neither is executed or downloaded bytes. */
export function measuredWalls(report: RuntimeSizeReport) {
	return {
		maxEmittedRuntimeGzipBytes: report.runtimeChunks.reduce(
			(total, chunk) => total + chunk.gzipBytes,
			0,
		),
		maxRuntimeChunkGzipBytes: report.largestRuntimeChunk?.gzipBytes ?? 0,
	};
}

/** Each wall is its last accepted measurement plus the margin recorded beside it. */
export function fixtureRuntimeBudget(
	fixture: string,
	options: { readonly forbidVitePreloadHelper?: boolean } = {},
): RuntimeBudget {
	const walls = readFixtureRuntimeAnchors().walls[fixture];
	if (!walls?.maxEmittedRuntimeGzipBytes)
		throw new Error(
			`${fixture}: no emitted runtime gzip wall recorded. Record it with ${ACCEPT_COMMAND}`,
		);
	const limit = (wall: Wall | undefined) => (wall ? wall.measured + wall.margin : undefined);
	return {
		maxEmittedRuntimeGzipBytes: limit(walls.maxEmittedRuntimeGzipBytes)!,
		...(walls.maxRuntimeChunkGzipBytes
			? { maxRuntimeChunkGzipBytes: limit(walls.maxRuntimeChunkGzipBytes) }
			: {}),
		...options,
	};
}

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
		JSON.parse(
			readFileSync(marklessBuildManifestPath(dist, MARKLESS_BYTE_ATTRIBUTION), 'utf8'),
		),
	);
}

/** fixture-runtime-anchors.json with every pending change file in scripts/benchmarks/anchor-changes applied. */
export function readFixtureRuntimeAnchors(): FixtureRuntimeAnchors {
	return readAnchorsWithChanges('fixture-runtime') as FixtureRuntimeAnchors;
}

/** With the accept variable set, records this fixture's measured modules and walls as this branch's change instead of checking them. */
export function acceptFixtureRuntime(
	fixture: string,
	measured: Record<string, number>,
	report: RuntimeSizeReport,
): boolean {
	if (process.env[ACCEPT_ENV] !== '1') return false;
	const reason = process.env[REASON_ENV];
	if (!reason?.trim())
		throw new Error(
			`${ACCEPT_ENV}=1 needs ${REASON_ENV}="<one line: what the bytes buy or which win this records>"`,
		);
	const walls = measuredWalls(report);
	const { file, changes } = recordChange(
		'fixture-runtime',
		(anchors: FixtureRuntimeAnchors) => {
			const next = structuredClone(anchors) as {
				modules: RuntimeModuleAnchors;
				walls: Record<string, Record<string, { measured: number; margin: number }>>;
			};
			next.modules[fixture] = measured;
			for (const [name, wall] of Object.entries(next.walls[fixture] ?? {}))
				wall.measured = walls[name as keyof typeof walls];
			return next;
		},
		{ reason },
	);
	console.error(
		changes.length
			? `[fixture-runtime] ${fixture} recorded in ${file}:\n${changes.map((entry) => `  ${formatChange(entry)}`).join('\n')}`
			: `[fixture-runtime] ${fixture}: measured the same as the anchors without this branch's changes`,
	);
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
