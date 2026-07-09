import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, expect, test } from 'vitest';
import { runtimeSizeReport } from '../test-support/runtime-size.ts';
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

	test('accepts zero demanded runtime chunks', () => {
		expect(() =>
			assertRuntimeBudget({
				budget: {
					maxEmittedRuntimeGzipBytes: 1_000,
					maxRuntimeChunkGzipBytes: 200,
				},
				emittedReport: {
					...baseReport,
					largestRuntimeChunk: undefined,
					runtimeChunks: [],
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

	test('runtime report excludes record-kind-gated runtime families from the emitted set', async () => {
		const dist = await mkdtemp(join(tmpdir(), 'markless-runtime-report-'));
		await mkdir(join(dist, 'build'), { recursive: true });
		await writeFile(join(dist, 'build', 'event.js'), 'createResumeRuntime();');
		await writeFile(join(dist, 'build', 'branch.js'), 'createResumeRuntime();');
		await writeFile(
			join(dist, 'build', 'execution-sizes.json'),
			JSON.stringify({
				'web:resume-events': { chunk: 'event.js', raw: 1, gzip: 1 },
				'web:resume-branches': { chunk: 'branch.js', raw: 1, gzip: 1 },
			}),
		);
		await writeFile(
			join(dist, 'build', 'execution-demand.json'),
			JSON.stringify({
				'/workspace/app/branchless.tsrx': {
					payloadRecords: [
						{ kind: 'event', runtimeModuleIds: ['web/resume-events'] },
					],
				},
			}),
		);

		const report = await runtimeSizeReport({ dist });

		// Filter deliberately reverted until preload gating lands: the wall
		// counts every emitted runtime chunk; the demand set only classifies
		// which ones the honesty guard must prove never ship.
		expect(report.runtimeChunks.map((chunk) => chunk.fileName).sort()).toEqual([
			'branch.js',
			'event.js',
		]);
		expect(report.undemandedRuntimeChunks.map((chunk) => chunk.fileName)).toEqual([
			'branch.js',
		]);
	});

	test('runtime report treats an empty demand map as zero demanded runtime chunks', async () => {
		const dist = await mkdtemp(join(tmpdir(), 'markless-runtime-report-'));
		await mkdir(join(dist, 'build'), { recursive: true });
		await writeFile(join(dist, 'build', 'branch.js'), 'createResumeRuntime();');
		await writeFile(
			join(dist, 'build', 'execution-sizes.json'),
			JSON.stringify({
				'web:resume-branches': { chunk: 'branch.js', raw: 1, gzip: 1 },
			}),
		);
		await writeFile(
			join(dist, 'build', 'execution-demand.json'),
			JSON.stringify({
				'/workspace/app/static.tsrx': {
					actions: [],
					payloadRecords: [],
					symbols: [],
				},
			}),
		);

		const report = await runtimeSizeReport({ dist });

		// Filter reverted: the emitted runtime chunk still counts toward the
		// wall; the empty demand map classifies it undemanded for the guard.
		expect(report.runtimeChunks.map((chunk) => chunk.fileName)).toEqual(['branch.js']);
		expect(report.undemandedRuntimeChunks.map((chunk) => chunk.fileName)).toEqual([
			'branch.js',
		]);
	});

	test('demand ids with no size entry are tree-shaken modules: excluded, not fatal', async () => {
		const dist = await mkdtemp(join(tmpdir(), 'markless-runtime-report-'));
		await mkdir(join(dist, 'build'), { recursive: true });
		await writeFile(join(dist, 'build', 'branch.js'), 'createResumeRuntime();');
		await writeFile(join(dist, 'build', 'execution-sizes.json'), JSON.stringify({}));
		await writeFile(
			join(dist, 'build', 'execution-demand.json'),
			JSON.stringify({
				'/workspace/app/branch.tsrx': {
					payloadRecords: [
						{ kind: 'branch', runtimeModuleIds: ['web/resume-branches'] },
					],
				},
			}),
		);

		// A demanded module absent from execution-sizes.json was tree-shaken
		// out of the emit: not fatal. The wall still counts every emitted
		// runtime chunk until preload gating lands (filter reverted).
		const report = await runtimeSizeReport({ dist });
		expect(report.runtimeChunks.map((chunk) => chunk.fileName)).toEqual(['branch.js']);
	});
});
