import type { RuntimeSizeReport } from '../test-support/runtime-size.ts';

export type RuntimeBudget = {
	readonly maxRuntimeChunkGzipBytes: number;
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
