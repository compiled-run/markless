import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

const repositoryRoot = process.cwd();
const fixtureConfigPath = join(
	repositoryRoot,
	'demos/js-framework-benchmark/frameworks/keyed/markless/vite.config.ts',
);

type FixtureAlias = { find: RegExp; replacement: string };

async function loadFixtureModuleMap() {
	process.env.MARKLESS_REPO_ROOT = repositoryRoot;
	return import(pathToFileURL(fixtureConfigPath).href) as Promise<{
		marklessWorkspaceAliases: (root: string) => FixtureAlias[];
		unmappedMarklessSpecifierGuard: {
			name: string;
			resolveId: (
				this: {
					resolve: (
						source: string,
						importer: string | undefined,
						options: Record<string, unknown>,
					) => Promise<{ external?: boolean | string; id: string } | null>;
				},
				source: string,
				importer?: string,
				options?: Record<string, unknown>,
			) => Promise<unknown>;
		};
	}>;
}

// Vite picks the first alias whose find matches, then rewrites the id with it.
function applyAliases(aliases: FixtureAlias[], specifier: string) {
	const match = aliases.find((alias) => alias.find.test(specifier));
	return match ? specifier.replace(match.find, match.replacement) : undefined;
}

function declaredWorkspaceExports() {
	const packagesDir = join(repositoryRoot, 'packages');
	const declared: { specifier: string; target: string }[] = [];

	for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const manifestPath = join(packagesDir, entry.name, 'package.json');
		if (!existsSync(manifestPath)) continue;

		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			exports?: Record<string, unknown>;
			name?: string;
		};
		if (!manifest.name?.startsWith('@markless/') || !manifest.exports) continue;

		for (const [subpath, value] of Object.entries(manifest.exports)) {
			if (typeof value !== 'string' || !value.startsWith('./')) continue;
			declared.push({
				specifier: subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`,
				target: resolve(packagesDir, entry.name, value),
			});
		}
	}

	return declared;
}

describe('js-framework-benchmark fixture module map', () => {
	test('maps every subpath a workspace package declares in its exports map', async () => {
		const { marklessWorkspaceAliases } = await loadFixtureModuleMap();
		const aliases = marklessWorkspaceAliases(repositoryRoot);
		const declared = declaredWorkspaceExports();

		expect(declared.length).toBeGreaterThan(20);
		for (const { specifier, target } of declared) {
			if (specifier.includes('*')) continue;
			expect({ specifier, resolved: applyAliases(aliases, specifier) }).toEqual({
				specifier,
				resolved: target,
			});
		}
	});

	test('resolves the async-boundary-arm subpath the emitted browser entry imports', async () => {
		const { marklessWorkspaceAliases } = await loadFixtureModuleMap();
		const aliases = marklessWorkspaceAliases(repositoryRoot);

		const resolved = applyAliases(aliases, '@markless/serializer/async-boundary-arm');

		expect(resolved).toBe(join(repositoryRoot, 'packages/serializer/src/async-boundary-arm.ts'));
		expect(existsSync(resolved as string)).toBe(true);
	});

	test('expands a wildcard export instead of matching it as a prefix', async () => {
		const { marklessWorkspaceAliases } = await loadFixtureModuleMap();
		const aliases = marklessWorkspaceAliases(repositoryRoot);

		expect(applyAliases(aliases, '@markless/web/fns/update-text')).toBe(
			join(repositoryRoot, 'packages/web/src/fns/update-text.ts'),
		);
	});

	test('never rewrites an undeclared subpath through a catch-all', async () => {
		const { marklessWorkspaceAliases } = await loadFixtureModuleMap();
		const aliases = marklessWorkspaceAliases(repositoryRoot);

		for (const specifier of [
			'@markless/serializer/not-a-declared-subpath',
			'@markless/core/not-a-declared-subpath',
			'@markless/runtime/not-a-declared-subpath',
		]) {
			expect(applyAliases(aliases, specifier)).toBeUndefined();
		}
	});

	test('fails the build on an @markless specifier nothing resolves', async () => {
		const { unmappedMarklessSpecifierGuard } = await loadFixtureModuleMap();

		const resolvedContext = {
			resolve: async () => ({ id: '/resolved/by/another/plugin.ts' }),
		};
		await expect(
			unmappedMarklessSpecifierGuard.resolveId.call(
				resolvedContext,
				'@markless/web/inline/sync-policy-core',
				'/importer.ts',
				{},
			),
		).resolves.toEqual({ id: '/resolved/by/another/plugin.ts' });

		const unresolvedContext = { resolve: async () => null };
		await expect(
			unmappedMarklessSpecifierGuard.resolveId.call(
				unresolvedContext,
				'@markless/serializer/not-a-declared-subpath',
				'/importer.ts',
				{},
			),
		).rejects.toThrow(/not declared in any packages\/\*\/package\.json "exports" map/);

		await expect(
			unmappedMarklessSpecifierGuard.resolveId.call(unresolvedContext, 'vite', '/importer.ts', {}),
		).resolves.toBeNull();
	});
});

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

	test('same-machine baseline results keep owner-ratified size rows', async () => {
		const { compareBenchmarkResults, withMarklessBaselineResults } = await loadBenchmarkGuard();
		const baseline = {
			thresholds: { gzipSizeRegressionKb: 0.15, rawSizeRegressionKb: 0.5 },
			benchmarks: {
				cpu: [],
				size: ['41_size-uncompressed', '42_size-compressed'],
				warnOnly: [],
			},
			frameworks: {
				markless: {
					// Ratified size (owner-accepted growth) is larger than what a
					// same-machine build of the base commit measures.
					results: { '41_size-uncompressed': 12, '42_size-compressed': 4.6 },
				},
			},
		};
		const merged = withMarklessBaselineResults(baseline, {
			'41_size-uncompressed': 10.6,
			'42_size-compressed': 4.2,
		});

		expect(merged.frameworks.markless.results).toEqual({
			'41_size-uncompressed': 12,
			'42_size-compressed': 4.6,
		});
		expect(
			compareBenchmarkResults(merged, {
				'41_size-uncompressed': 12.4,
				'42_size-compressed': 4.7,
			}).ok,
		).toBe(true);
		expect(
			compareBenchmarkResults(merged, {
				'41_size-uncompressed': 12.6,
				'42_size-compressed': 4.7,
			}).failures,
		).toEqual([expect.stringContaining('raw size regressed')]);

		// A same-machine base that is larger than the ratified value still wins:
		// the guard never loosens below what the base commit actually ships.
		const larger = withMarklessBaselineResults(baseline, {
			'41_size-uncompressed': 13,
			'42_size-compressed': 5,
		});
		expect(larger.frameworks.markless.results).toEqual({
			'41_size-uncompressed': 13,
			'42_size-compressed': 5,
		});
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

	test('warns for individual CPU row noise while the geomean stays inside its threshold', async () => {
		const { compareBenchmarkResults } = await loadBenchmarkGuard();
		const baseline = {
			thresholds: {
				cpuGeomeanRegressionRatio: 1.03,
				cpuBenchmarkRegressionRatio: 1.07,
			},
			benchmarks: {
				cpu: ['01_run1k', '05_swap1k', '06_remove-one-1k', '07_create10k'],
			},
			frameworks: {
				markless: {
					results: {
						'01_run1k': 95.1,
						'05_swap1k': 60.6,
						'06_remove-one-1k': 41.1,
						'07_create10k': 1425.8,
					},
				},
			},
		};

		// Same-runner noise on one small benchmark (+13.9%) while the geomean
		// only moves ~+2.8% — inside the 1.03 gate. Must warn, not fail.
		const result = compareBenchmarkResults(baseline, {
			'01_run1k': 94.8,
			'05_swap1k': 59.8,
			'06_remove-one-1k': 46.8,
			'07_create10k': 1419.4,
		});

		expect(result.currentCpuGeomean).toBeGreaterThan(result.baselineCpuGeomean);
		expect(result.currentCpuGeomean / result.baselineCpuGeomean).toBeLessThan(1.03);
		expect(result.ok).toBe(true);
		expect(result.failures).toEqual([]);
		expect(result.warnings).toEqual([
			expect.stringContaining('06_remove-one-1k regressed from 41.1 to 46.8'),
		]);
	});

	test('warns for one uncorroborated clear CPU regression with a flat geomean', async () => {
		const { compareBenchmarkResults } = await loadBenchmarkGuard();
		const baseline = {
			thresholds: {
				cpuGeomeanRegressionRatio: 1.03,
				cpuBenchmarkRegressionRatio: 1.07,
				cpuBenchmarkClearRegressionRatio: 1.25,
			},
			benchmarks: {
				cpu: [
					'01_run1k',
					'02_replace1k',
					'03_update10th1k',
					'04_select1k',
					'05_swap1k',
					'06_remove-one-1k',
					'07_create10k',
					'08_create1k-after1k',
					'09_clear1k',
				],
			},
			frameworks: {
				markless: {
					results: {
						'01_run1k': 95.1,
						'02_replace1k': 107.2,
						'03_update10th1k': 57.3,
						'04_select1k': 22.5,
						'05_swap1k': 60.6,
						'06_remove-one-1k': 41.1,
						'07_create10k': 1425.8,
						'08_create1k-after1k': 82.4,
						'09_clear1k': 24.3,
					},
				},
			},
		};

		// Reproduces the hosted-runner evidence: one row is 130.4% of baseline
		// while the other eight keep the geomean inside the unchanged 1.03 gate.
		const result = compareBenchmarkResults(baseline, {
			'01_run1k': 94.8,
			'02_replace1k': 106.9,
			'03_update10th1k': 57.2,
			'04_select1k': 22.4,
			'05_swap1k': 79.0224,
			'06_remove-one-1k': 41.3,
			'07_create10k': 1421.6,
			'08_create1k-after1k': 82.1,
			'09_clear1k': 24.2,
		});

		expect(result.currentCpuGeomean / result.baselineCpuGeomean).toBeLessThan(1.03);
		expect(result.ok).toBe(true);
		expect(result.failures).toEqual([]);
		expect(result.warnings).toEqual([
			expect.stringContaining(
				'05_swap1k clearly regressed from 60.6 to 79.0224 (130.4% of baseline), but is not corroborated',
			),
		]);

		const otherRound = compareBenchmarkResults(baseline, {
			'01_run1k': 94.8,
			'02_replace1k': 106.9,
			'03_update10th1k': 57.2,
			'04_select1k': 22.4,
			'05_swap1k': 45,
			'06_remove-one-1k': 41.3,
			'07_create10k': 1940.3138,
			'08_create1k-after1k': 82.1,
			'09_clear1k': 24.2,
		});

		expect(otherRound.currentCpuGeomean / otherRound.baselineCpuGeomean).toBeLessThan(1.03);
		expect(otherRound.ok).toBe(true);
		expect(otherRound.failures).toEqual([]);
		expect(otherRound.warnings).toEqual([
			expect.stringContaining(
				'07_create10k clearly regressed from 1425.8 to 1940.3138 (136.1% of baseline), but is not corroborated',
			),
		]);
	});

	test('fails when two CPU rows clearly regress despite a flat geomean', async () => {
		const { compareBenchmarkResults } = await loadBenchmarkGuard();
		const baseline = {
			thresholds: {
				cpuGeomeanRegressionRatio: 1.03,
				cpuBenchmarkRegressionRatio: 1.07,
				cpuBenchmarkClearRegressionRatio: 1.25,
			},
			benchmarks: { cpu: ['05_swap1k', '07_create10k', '09_clear1k'] },
			frameworks: {
				markless: { results: { '05_swap1k': 100, '07_create10k': 100, '09_clear1k': 100 } },
			},
		};

		const result = compareBenchmarkResults(baseline, {
			'05_swap1k': 130.4,
			'07_create10k': 136.1,
			'09_clear1k': 55,
		});

		expect(result.currentCpuGeomean / result.baselineCpuGeomean).toBeLessThan(1.03);
		expect(result.ok).toBe(false);
		expect(result.failures).toEqual([
			expect.stringContaining('05_swap1k clearly regressed'),
			expect.stringContaining('07_create10k clearly regressed'),
		]);
	});

	test('keeps geomean and size regressions hard failures with one clear CPU row', async () => {
		const { compareBenchmarkResults } = await loadBenchmarkGuard();
		const baseline = {
			thresholds: {
				cpuGeomeanRegressionRatio: 1.03,
				cpuBenchmarkRegressionRatio: 1.07,
				cpuBenchmarkClearRegressionRatio: 1.25,
				rawSizeRegressionKb: 0.5,
			},
			benchmarks: { cpu: ['05_swap1k', '07_create10k'], size: ['41_size-uncompressed'] },
			frameworks: {
				markless: {
					results: { '05_swap1k': 100, '07_create10k': 100, '41_size-uncompressed': 10 },
				},
			},
		};

		const result = compareBenchmarkResults(baseline, {
			'05_swap1k': 130,
			'07_create10k': 100,
			'41_size-uncompressed': 10.6,
		});

		expect(result.ok).toBe(false);
		expect(result.failures).toEqual(
			expect.arrayContaining([
				expect.stringContaining('CPU geomean regressed'),
				expect.stringContaining('05_swap1k clearly regressed'),
				expect.stringContaining('raw size regressed'),
			]),
		);
	});
});
