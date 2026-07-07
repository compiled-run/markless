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
	test('accepts an emitted runtime within budget', () => {
		expect(() =>
			assertRuntimeBudget({
				budget: {
					maxEmittedRuntimeGzipBytes: 1_000,
					maxRuntimeChunkGzipBytes: 200,
				},
				emittedReport: {
					...baseReport,
					asyncScripts: { count: 4, gzipBytes: 900, rawBytes: 1_800 },
				},
			}),
		).not.toThrow();
	});

	test('fails when total emitted runtime exceeds the anti-bloat wall', () => {
		expect(() =>
			assertRuntimeBudget({
				budget: {
					maxEmittedRuntimeGzipBytes: 1_000,
					maxRuntimeChunkGzipBytes: 200,
				},
				emittedReport: {
					...baseReport,
					runtimeChunks: [
						{ ...baseReport.runtimeChunks[0], gzipBytes: 1_001, rawBytes: 2_002 },
					],
					largestRuntimeChunk: undefined,
				},
			}),
		).toThrow(/emitted runtime gzip wall exceeded/);
	});
});
