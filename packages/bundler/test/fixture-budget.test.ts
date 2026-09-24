import { describe, expect, test } from 'vitest';
import { assertRuntimeBudget, runtimeModuleOverruns } from './fixture-budget.ts';

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

describe('fixture runtime module anchors', () => {
	const anchors = { 'web/resume-branches': 4_000, 'web/resume-runtime': 9_000 };

	test('growth within the per-module budget passes', () => {
		expect(
			runtimeModuleOverruns(
				'@fixtures/x',
				{ ...anchors, 'web/resume-branches': 4_100 },
				anchors,
			),
		).toEqual([]);
	});

	test('a heavier runtime module fails and names itself', () => {
		expect(
			runtimeModuleOverruns(
				'@fixtures/x',
				{ ...anchors, 'web/resume-branches': 4_200 },
				anchors,
			),
		).toEqual([
			expect.stringContaining(
				'@fixtures/x: runtime module web/resume-branches got heavier: 4000 -> 4200 B (+200 B rendered, budget +128 B)',
			),
		]);
	});

	test('a runtime module with no anchor fails', () => {
		expect(
			runtimeModuleOverruns('@fixtures/x', { ...anchors, 'web/new-helper': 90 }, anchors),
		).toEqual([
			expect.stringContaining('@fixtures/x: new runtime module web/new-helper ships 90 B'),
		]);
	});
});
