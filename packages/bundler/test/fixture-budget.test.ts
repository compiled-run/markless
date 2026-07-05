import { describe, expect, test } from 'vitest';
import { assertRuntimeBudget } from './fixture-budget.ts';

const baseReport = {
	largestRuntimeChunk: {
		fileName: 'build/runtime.js',
		gzipBytes: 100,
		hasVitePreloadHelper: false,
		origins: [],
		rawBytes: 200,
	},
	runtimeChunks: [
		{
			fileName: 'build/runtime.js',
			gzipBytes: 100,
			hasVitePreloadHelper: false,
			origins: [],
			rawBytes: 200,
		},
	],
	summary: 'synthesized runtime report',
};

describe('fixture runtime budget assertions', () => {
	test('accepts a page fetch set and emitted runtime within budget', () => {
		expect(() =>
			assertRuntimeBudget({
				budget: {
					maxEmittedRuntimeGzipBytes: 1_000,
					maxPageFetchGzipBytes: 500,
					maxRuntimeChunkGzipBytes: 200,
					maxScriptCount: 3,
				},
				emittedReport: {
					...baseReport,
					asyncScripts: { count: 4, gzipBytes: 900, rawBytes: 1_800 },
				},
				pageFetchReport: {
					...baseReport,
					asyncScripts: { count: 2, gzipBytes: 450, rawBytes: 900 },
				},
			}),
		).not.toThrow();
	});

	test('fails when a page fetch set exceeds its historical user-cost budget', () => {
		expect(() =>
			assertRuntimeBudget({
				budget: {
					maxEmittedRuntimeGzipBytes: 1_000,
					maxPageFetchGzipBytes: 500,
					maxRuntimeChunkGzipBytes: 200,
					maxScriptCount: 3,
				},
				emittedReport: {
					...baseReport,
					asyncScripts: { count: 4, gzipBytes: 900, rawBytes: 1_800 },
				},
				pageFetchReport: {
					...baseReport,
					asyncScripts: { count: 2, gzipBytes: 501, rawBytes: 1_002 },
				},
			}),
		).toThrow(/page fetch gzip budget exceeded: 501 > 500/);
	});

	test('fails when total emitted runtime exceeds the anti-bloat wall', () => {
		expect(() =>
			assertRuntimeBudget({
				budget: {
					maxEmittedRuntimeGzipBytes: 1_000,
					maxPageFetchGzipBytes: 500,
					maxRuntimeChunkGzipBytes: 200,
					maxScriptCount: 3,
				},
				emittedReport: {
					...baseReport,
					asyncScripts: { count: 4, gzipBytes: 1_001, rawBytes: 2_002 },
				},
				pageFetchReport: {
					...baseReport,
					asyncScripts: { count: 2, gzipBytes: 450, rawBytes: 900 },
				},
			}),
		).toThrow(/emitted runtime gzip wall exceeded: 1001 > 1000/);
	});
});
