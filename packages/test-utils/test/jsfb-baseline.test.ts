import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';

const scriptUrl = pathToFileURL(join(process.cwd(), 'scripts/benchmarks/jsfb-baseline.mjs')).href;

async function loadBenchmarkGuard() {
	return import(scriptUrl) as Promise<{
		compareBenchmarkResults: (
			baseline: unknown,
			currentResults: Record<string, number>,
		) => {
			ok: boolean;
			failures: string[];
			warnings: string[];
			ratios: Record<string, number>;
		};
		readJsfbResultsDirectory: (
			resultsDir: string,
			options?: { framework?: string },
		) => Promise<Record<string, number>>;
		withArcadeBaselineResults: (
			baseline: unknown,
			arcadeResults: Record<string, number>,
		) => unknown;
	}>;
}

function jsfbResult(
	framework: string,
	benchmark: string,
	type: string,
	key: string,
	value: number,
) {
	return JSON.stringify({
		framework,
		keyed: true,
		benchmark,
		type,
		values: {
			[key]: {
				min: value,
				max: value,
				mean: value,
				median: value,
				geometricMean: value,
				standardDeviation: 0,
				values: [value],
			},
		},
	});
}

describe('js-framework-benchmark baseline guard', () => {
	test('reads current Arcade scores from JSFB result files', async () => {
		const { readJsfbResultsDirectory } = await loadBenchmarkGuard();
		const resultsDir = join(tmpdir(), `arcade-jsfb-results-${Date.now()}`);
		await mkdir(resultsDir, { recursive: true });

		await writeFile(
			join(resultsDir, 'arcade-keyed_01_run1k.json'),
			jsfbResult('arcade-keyed', '01_run1k', 'cpu', 'total', 22.7),
		);
		await writeFile(
			join(resultsDir, 'arcade-keyed_41_size-uncompressed.json'),
			jsfbResult('arcade-keyed', '41_size-uncompressed', 'size', 'DEFAULT', 10.8),
		);
		await writeFile(
			join(resultsDir, 'solid-keyed_01_run1k.json'),
			jsfbResult('solid-keyed', '01_run1k', 'cpu', 'total', 20.6),
		);

		await expect(
			readJsfbResultsDirectory(resultsDir, { framework: 'arcade-keyed' }),
		).resolves.toEqual({
			'01_run1k': 22.7,
			'41_size-uncompressed': 10.8,
		});
	});

	test('fails on meaningful Arcade regressions while keeping peer ratios fixed', async () => {
		const { compareBenchmarkResults, withArcadeBaselineResults } = await loadBenchmarkGuard();
		const baseline = {
			thresholds: {
				cpuGeomeanRegressionRatio: 1.03,
				cpuBenchmarkRegressionRatio: 1.07,
				firstPaintRegressionRatio: 1.2,
				gzipSizeRegressionKb: 0.15,
				rawSizeRegressionKb: 0.5,
			},
			benchmarks: {
				cpu: ['01_run1k', '02_replace1k'],
				size: ['41_size-uncompressed', '42_size-compressed'],
				warnOnly: ['43_first-paint'],
			},
			frameworks: {
				arcade: {
					results: {
						'01_run1k': 20,
						'02_replace1k': 20,
						'41_size-uncompressed': 10,
						'42_size-compressed': 4,
						'43_first-paint': 50,
					},
				},
				solid: {
					results: {
						'01_run1k': 40,
						'02_replace1k': 40,
					},
				},
				ripple: {
					results: {
						'01_run1k': 30,
						'02_replace1k': 30,
					},
				},
			},
		};

		const result = compareBenchmarkResults(baseline, {
			'01_run1k': 24,
			'02_replace1k': 20,
			'41_size-uncompressed': 10.6,
			'42_size-compressed': 4.2,
			'43_first-paint': 80,
		});

		expect(result.ok).toBe(false);
		expect(result.failures).toEqual(
			expect.arrayContaining([
				expect.stringContaining('CPU geomean regressed'),
				expect.stringContaining('01_run1k regressed'),
				expect.stringContaining('raw size regressed'),
				expect.stringContaining('gzip size regressed'),
			]),
		);
		expect(result.warnings).toEqual([expect.stringContaining('43_first-paint regressed')]);
		expect(result.ratios.solid).toBeCloseTo(0.547723, 6);
		expect(result.ratios.ripple).toBeCloseTo(0.730297, 6);

		const sameMachineResult = compareBenchmarkResults(
			withArcadeBaselineResults(baseline, {
				'01_run1k': 24,
				'02_replace1k': 20,
				'41_size-uncompressed': 10.6,
				'42_size-compressed': 4.2,
				'43_first-paint': 80,
			}),
			{
				'01_run1k': 24.5,
				'02_replace1k': 20.4,
				'41_size-uncompressed': 10.6,
				'42_size-compressed': 4.2,
				'43_first-paint': 80,
			},
		);
		expect(sameMachineResult.ok).toBe(true);
	});
});
