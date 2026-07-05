import type { RuntimeSizeReport } from '../test-support/runtime-size.ts';

export type RuntimeBudget = {
	readonly maxRuntimeChunkGzipBytes: number;
	readonly maxPageFetchGzipBytes: number;
	readonly maxScriptCount: number;
	readonly maxEmittedRuntimeGzipBytes: number;
	readonly forbidVitePreloadHelper?: boolean;
};

export function assertRuntimeBudget(input: {
	readonly budget: RuntimeBudget;
	readonly pageFetchReport: RuntimeSizeReport;
	readonly emittedReport: RuntimeSizeReport;
}) {
	const { budget, emittedReport, pageFetchReport } = input;
	assert(
		emittedReport.runtimeChunks.length > 0,
		`expected at least one runtime-heavy emitted chunk\n${emittedReport.summary}`,
	);
	assert(
		(emittedReport.largestRuntimeChunk?.gzipBytes ?? 0) <= budget.maxRuntimeChunkGzipBytes,
		`largest runtime chunk gzip budget exceeded: ${emittedReport.largestRuntimeChunk?.gzipBytes ?? 0} > ${budget.maxRuntimeChunkGzipBytes}\n${emittedReport.summary}`,
	);
	assert(
		pageFetchReport.asyncScripts.gzipBytes <= budget.maxPageFetchGzipBytes,
		`page fetch gzip budget exceeded: ${pageFetchReport.asyncScripts.gzipBytes} > ${budget.maxPageFetchGzipBytes}\n${pageFetchReport.summary}`,
	);
	assert(
		pageFetchReport.asyncScripts.count <= budget.maxScriptCount,
		`page fetch script count budget exceeded: ${pageFetchReport.asyncScripts.count} > ${budget.maxScriptCount}\n${pageFetchReport.summary}`,
	);
	assert(
		emittedReport.asyncScripts.gzipBytes <= budget.maxEmittedRuntimeGzipBytes,
		`emitted runtime gzip wall exceeded: ${emittedReport.asyncScripts.gzipBytes} > ${budget.maxEmittedRuntimeGzipBytes}\n${emittedReport.summary}`,
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
