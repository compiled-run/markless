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
		readNormalizedResults: (input: unknown, framework?: string) => Record<string, number>;
		selectCurrentResultsForGuard: (options: {
			baseline: unknown;
			currentResults: Record<string, number>;
			explicitResultsPath: boolean;
			framework: string;
			resultsPath: string;
		}) => { currentResults: Record<string, number>; warning?: string };
		withMarklessBaselineResults: (
			baseline: unknown,
			marklessResults: Record<string, number>,
		) => unknown;
	}>;
}

function jsfbResult(
	framework: string,
	benchmark: string,
	type: string,
	key: string,
	value: number,
	summary: Partial<{
		readonly geometricMean: number;
		readonly max: number;
		readonly mean: number;
		readonly min: number;
	}> = {},
) {
	return JSON.stringify({
		framework,
		keyed: true,
		benchmark,
		type,
		values: {
			[key]: {
				min: summary.min ?? value,
				max: summary.max ?? value,
				mean: summary.mean ?? value,
				median: value,
				geometricMean: summary.geometricMean ?? value,
				standardDeviation: 0,
				values: [value],
			},
		},
	});
}

describe('js-framework-benchmark baseline guard', () => {
	test('reads current Markless scores from JSFB result files', async () => {
		const { readJsfbResultsDirectory } = await loadBenchmarkGuard();
		const resultsDir = join(tmpdir(), `markless-jsfb-results-${Date.now()}`);
		await mkdir(resultsDir, { recursive: true });

		await writeFile(
			join(resultsDir, 'markless-v0.0.0-local-keyed_05_swap1k.json'),
			jsfbResult('markless-v0.0.0-local-keyed', '05_swap1k', 'cpu', 'total', 15.9, {
				geometricMean: 3.8,
				max: 24.7,
				mean: 17.16,
				min: 14.5,
			}),
		);
		await writeFile(
			join(resultsDir, 'markless-v0.0.0-local-keyed_09_clear1k_x8.json'),
			jsfbResult('markless-v0.0.0-local-keyed', '09_clear1k_x8', 'cpu', 'total', 9.5, {
				geometricMean: 2.6,
				max: 11.5,
				mean: 9.74,
				min: 9.1,
			}),
		);
		await writeFile(
			join(resultsDir, 'markless-v0.0.0-local-keyed_41_size-uncompressed.json'),
			jsfbResult(
				'markless-v0.0.0-local-keyed',
				'41_size-uncompressed',
				'size',
				'DEFAULT',
				10.8,
			),
		);
		await writeFile(
			join(resultsDir, 'solid-v1.9.3-keyed_05_swap1k.json'),
			jsfbResult('solid-v1.9.3-keyed', '05_swap1k', 'cpu', 'total', 16.2),
		);

		await expect(
			readJsfbResultsDirectory(resultsDir, { framework: 'markless-keyed' }),
		).resolves.toEqual({
			'05_swap1k': 15.9,
			'09_clear1k': 9.5,
			'41_size-uncompressed': 10.8,
		});
	});

	test('reads Markless results from baseline-shaped JSON before benchmark metadata', async () => {
		const { readNormalizedResults } = await loadBenchmarkGuard();

		expect(
			readNormalizedResults({
				benchmarks: { cpu: ['01_run1k'] },
				frameworks: {
					markless: {
						results: {
							'01_run1k': 22.7,
						},
					},
				},
			}),
		).toEqual({ '01_run1k': 22.7 });
	});

	test('uses committed Markless baseline when implicit JSFB results have no Markless rows', async () => {
		const { selectCurrentResultsForGuard } = await loadBenchmarkGuard();
		const baseline = {
			benchmarks: {
				cpu: ['01_run1k'],
				size: ['41_size-uncompressed'],
				warnOnly: ['43_first-paint'],
			},
			frameworks: {
				markless: {
					results: {
						'01_run1k': 22.7,
						'41_size-uncompressed': 9.5,
						'43_first-paint': 50,
					},
				},
			},
		};

		const fallback = selectCurrentResultsForGuard({
			baseline,
			currentResults: {},
			explicitResultsPath: false,
			framework: 'markless-keyed',
			resultsPath: '/tmp/js-framework-benchmark/webdriver-ts/results',
		});

		expect(fallback.currentResults).toEqual(baseline.frameworks.markless.results);
		expect(fallback.warning).toContain('No markless-keyed JSFB result rows');

		const strict = selectCurrentResultsForGuard({
			baseline,
			currentResults: {},
			explicitResultsPath: true,
			framework: 'markless-keyed',
			resultsPath: '/tmp/js-framework-benchmark/webdriver-ts/results',
		});

		expect(strict.currentResults).toEqual({});
		expect(strict.warning).toBeUndefined();
	});

	test('fails on meaningful Markless regressions while keeping peer ratios fixed', async () => {
		const { compareBenchmarkResults, withMarklessBaselineResults } = await loadBenchmarkGuard();
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
				markless: {
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
			withMarklessBaselineResults(baseline, {
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

	test('warns for individual CPU row noise when same-runner geomean improves', async () => {
		const { compareBenchmarkResults } = await loadBenchmarkGuard();
		const baseline = {
			thresholds: {
				cpuGeomeanRegressionRatio: 1.03,
				cpuBenchmarkRegressionRatio: 1.07,
			},
			benchmarks: {
				cpu: ['01_run1k', '05_swap1k', '07_create10k'],
			},
			frameworks: {
				markless: {
					results: {
						'01_run1k': 95.1,
						'05_swap1k': 65.5,
						'07_create10k': 1425.8,
					},
				},
			},
		};

		const result = compareBenchmarkResults(baseline, {
			'01_run1k': 96.8,
			'05_swap1k': 72.5,
			'07_create10k': 1005.2,
		});

		expect(result.currentCpuGeomean).toBeLessThan(result.baselineCpuGeomean);
		expect(result.ok).toBe(true);
		expect(result.failures).toEqual([]);
		expect(result.warnings).toEqual([
			expect.stringContaining('05_swap1k regressed from 65.5 to 72.5'),
		]);
	});
});
