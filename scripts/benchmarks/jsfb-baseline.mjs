#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_BASELINE_PATH = join(ROOT_DIR, 'demos/js-framework-benchmark/baseline.json');
const DEFAULT_FRAMEWORK = 'markless-keyed';
const DEFAULT_RESULTS_PATHS = [
	process.env.MARKLESS_JSFB_RESULTS,
	process.env.JSFB_RESULTS_DIR,
	process.env.JSFB_ROOT ? join(process.env.JSFB_ROOT, 'webdriver-ts/results') : undefined,
	join(ROOT_DIR, '../js-framework-benchmark/webdriver-ts/results'),
];
const DEFAULT_BASELINE_RESULTS_PATHS = [process.env.MARKLESS_JSFB_BASELINE_RESULTS];

const BENCHMARK_ALIASES = new Map([
	['03_update10th1k_x16', '03_update10th1k'],
	['08_create1k-after1k_x2', '08_create1k-after1k'],
	['09_clear1k_x8', '09_clear1k'],
]);

function isObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const number = Number(value);
		if (Number.isFinite(number)) return number;
	}
	return undefined;
}

function valueFromSummary(summary) {
	if (!isObject(summary)) return readNumber(summary);
	for (const key of ['median', 'geometricMean', 'mean', 'min']) {
		const value = readNumber(summary[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function normalizeBenchmarkId(benchmark) {
	const normalized = String(benchmark).trim();
	return BENCHMARK_ALIASES.get(normalized) ?? normalized;
}

function frameworkMatches(actual, expected) {
	if (!expected) return true;
	if (!actual) return false;
	if (actual === expected) return true;

	const actualName = String(actual);
	const expectedName = String(expected);
	const actualKeyed = actualName.includes('keyed');
	const expectedKeyed = expectedName.includes('keyed');
	const expectedBase = expectedName.replace(/-keyed$/, '');

	return actualKeyed === expectedKeyed && actualName.includes(expectedBase);
}

function extractFrameworkFromFileName(fileName) {
	const match = /^(.+?)_(\d\d_.+)\.json$/u.exec(fileName);
	return match?.[1];
}

function extractBenchmarkFromFileName(fileName) {
	const match = /^(.+?)_(\d\d_.+)\.json$/u.exec(fileName);
	return match?.[2];
}

function extractMetricValue(result) {
	if (!isObject(result)) return undefined;
	if (isObject(result.values)) {
		const keys =
			result.type === 'cpu'
				? ['total', 'DEFAULT']
				: ['DEFAULT', 'total', 'size', 'bytes', 'compressed', 'uncompressed'];
		for (const key of keys) {
			const value = valueFromSummary(result.values[key]);
			if (value !== undefined) return value;
		}
		for (const value of Object.values(result.values)) {
			const number = valueFromSummary(value);
			if (number !== undefined) return number;
		}
	}
	return valueFromSummary(result);
}

export async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function readJsfbResultsDirectory(resultsDir, options = {}) {
	const framework = options.framework ?? DEFAULT_FRAMEWORK;
	const entries = await readdir(resultsDir, { withFileTypes: true });
	const results = {};

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

		const filePath = join(resultsDir, entry.name);
		const result = await readJson(filePath);
		const actualFramework =
			isObject(result) && typeof result.framework === 'string'
				? result.framework
				: extractFrameworkFromFileName(entry.name);

		if (!frameworkMatches(actualFramework, framework)) continue;

		const benchmark =
			isObject(result) && typeof result.benchmark === 'string'
				? result.benchmark
				: extractBenchmarkFromFileName(entry.name);
		if (!benchmark) continue;

		const value = extractMetricValue(result);
		if (value === undefined) continue;
		results[normalizeBenchmarkId(benchmark)] = value;
	}

	return results;
}

export function readNormalizedResults(input, framework = 'markless') {
	if (!isObject(input)) {
		throw new Error('Expected benchmark results to be a JSON object.');
	}
	if (isObject(input.frameworks)) {
		const frameworkResult = input.frameworks[framework] ?? input.frameworks[DEFAULT_FRAMEWORK];
		if (isObject(frameworkResult?.results)) return frameworkResult.results;
	}
	if (isObject(input.results)) return input.results;
	if (isObject(input.benchmarks)) return input.benchmarks;
	return input;
}

export async function readBenchmarkResults(inputPath, options = {}) {
	const resolved = resolve(inputPath);
	const stats = await stat(resolved);
	if (stats.isDirectory()) {
		return readJsfbResultsDirectory(resolved, { framework: options.framework });
	}

	return readNormalizedResults(await readJson(resolved), options.frameworkName ?? 'markless');
}

export function withMarklessBaselineResults(baseline, marklessResults) {
	if (!isObject(baseline)) throw new Error('Expected baseline to be a JSON object.');
	if (!isObject(marklessResults))
		throw new Error('Expected Markless baseline results to be a JSON object.');

	return {
		...baseline,
		frameworks: {
			...baseline.frameworks,
			markless: {
				...baseline.frameworks?.markless,
				results: marklessResults,
			},
		},
	};
}

function geometricMean(values) {
	if (values.length === 0) return undefined;
	return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function requiredResult(results, key, failures) {
	const value = readNumber(results[key]);
	if (value === undefined) failures.push(`Missing current result for ${key}.`);
	return value;
}

function benchmarkKeysForBaseline(baseline) {
	return [
		...(baseline.benchmarks?.cpu ?? []),
		...(baseline.benchmarks?.size ?? []),
		...(baseline.benchmarks?.warnOnly ?? []),
	];
}

export function selectCurrentResultsForGuard(options) {
	const { baseline, currentResults, explicitResultsPath, framework, resultsPath } = options;
	const marklessBaseline = baseline?.frameworks?.markless?.results;
	if (
		explicitResultsPath ||
		!isObject(marklessBaseline) ||
		benchmarkKeysForBaseline(baseline).some(
			(key) => readNumber(currentResults[key]) !== undefined,
		)
	) {
		return { currentResults };
	}

	return {
		currentResults: marklessBaseline,
		warning: `No ${framework} JSFB result rows found in ${resultsPath}; using committed Markless baseline results for the local guard. Run JSFB and pass --results or set MARKLESS_JSFB_RESULTS to enforce fresh benchmark results.`,
	};
}

function formatRatio(value) {
	return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(value) {
	return `${value >= 0 ? '+' : ''}${value.toFixed(2)}kB`;
}

export function compareBenchmarkResults(baseline, currentResults) {
	if (!isObject(baseline)) throw new Error('Expected baseline to be a JSON object.');
	if (!isObject(currentResults)) throw new Error('Expected current results to be a JSON object.');

	const marklessBaseline = baseline.frameworks?.markless?.results;
	if (!isObject(marklessBaseline)) {
		throw new Error('Baseline must include frameworks.markless.results.');
	}

	const cpuBenchmarks = baseline.benchmarks?.cpu ?? [];
	const sizeBenchmarks = baseline.benchmarks?.size ?? [];
	const warnOnlyBenchmarks = baseline.benchmarks?.warnOnly ?? [];
	const thresholds = baseline.thresholds ?? {};
	const failures = [];
	const warnings = [];
	const cpuBenchmarkRegressions = [];

	const currentCpu = [];
	const baselineCpu = [];
	for (const key of cpuBenchmarks) {
		const current = requiredResult(currentResults, key, failures);
		const previous = readNumber(marklessBaseline[key]);
		if (current === undefined || previous === undefined) continue;

		currentCpu.push(current);
		baselineCpu.push(previous);
		const ratio = current / previous;
		if (ratio > (thresholds.cpuBenchmarkRegressionRatio ?? 1.07)) {
			cpuBenchmarkRegressions.push(
				`${key} regressed from ${previous} to ${current} (${formatRatio(ratio)} of baseline).`,
			);
		}
	}

	const currentGeo = geometricMean(currentCpu);
	const baselineGeo = geometricMean(baselineCpu);
	let cpuGeomeanDidNotRegress = false;
	if (currentGeo !== undefined && baselineGeo !== undefined) {
		const ratio = currentGeo / baselineGeo;
		cpuGeomeanDidNotRegress = ratio <= 1;
		if (ratio > (thresholds.cpuGeomeanRegressionRatio ?? 1.03)) {
			failures.push(
				`CPU geomean regressed from ${baselineGeo.toFixed(2)} to ${currentGeo.toFixed(2)} (${formatRatio(ratio)} of baseline).`,
			);
		}
	}
	if (cpuGeomeanDidNotRegress) warnings.push(...cpuBenchmarkRegressions);
	else failures.push(...cpuBenchmarkRegressions);

	for (const key of sizeBenchmarks) {
		const current = requiredResult(currentResults, key, failures);
		const previous = readNumber(marklessBaseline[key]);
		if (current === undefined || previous === undefined) continue;

		const delta = current - previous;
		const compressedSize = isCompressedSizeBenchmark(key);
		const threshold = compressedSize
			? (thresholds.gzipSizeRegressionKb ?? 0.15)
			: (thresholds.rawSizeRegressionKb ?? 0.5);
		const label = compressedSize ? 'gzip size' : 'raw size';
		if (delta > threshold) {
			failures.push(`${label} regressed for ${key}: ${formatDelta(delta)}.`);
		}
	}

	for (const key of warnOnlyBenchmarks) {
		const current = requiredResult(currentResults, key, failures);
		const previous = readNumber(marklessBaseline[key]);
		if (current === undefined || previous === undefined) continue;

		const ratio = current / previous;
		if (ratio > (thresholds.firstPaintRegressionRatio ?? 1.2)) {
			warnings.push(
				`${key} regressed from ${previous} to ${current} (${formatRatio(ratio)} of baseline).`,
			);
		}
	}

	const ratios = {};
	if (currentGeo !== undefined) {
		for (const [name, framework] of Object.entries(baseline.frameworks ?? {})) {
			if (name === 'markless' || !isObject(framework?.results)) continue;
			const peerValues = cpuBenchmarks
				.map((key) => readNumber(framework.results[key]))
				.filter((value) => value !== undefined);
			const peerGeo = geometricMean(peerValues);
			if (peerGeo !== undefined) ratios[name] = currentGeo / peerGeo;
		}
	}

	return {
		ok: failures.length === 0,
		failures,
		warnings,
		ratios,
		currentCpuGeomean: currentGeo,
		baselineCpuGeomean: baselineGeo,
	};
}

function isCompressedSizeBenchmark(key) {
	return key.includes('gzip') || (key.includes('compressed') && !key.includes('uncompressed'));
}

function parseArgs(argv) {
	const args = { command: argv[2] ?? 'compare' };
	for (let index = 3; index < argv.length; index++) {
		const value = argv[index];
		if (value === '--') continue;
		if (value === '--baseline') args.baseline = argv[++index];
		else if (value === '--baseline-results') args.baselineResults = argv[++index];
		else if (value === '--results') args.results = argv[++index];
		else if (value === '--framework') args.framework = argv[++index];
		else if (value === '--help' || value === '-h') args.help = true;
		else throw new Error(`Unknown argument: ${value}`);
	}
	return args;
}

async function pathExists(path) {
	if (!path) return false;
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function resolveResultsPath(args) {
	if (args.results) return args.results;
	for (const path of DEFAULT_RESULTS_PATHS) {
		if (await pathExists(path)) return path;
	}

	throw new Error(
		[
			'Missing JS Framework Benchmark results.',
			'Run Markless JSFB benchmarks first, then pass --results <file-or-dir> or set MARKLESS_JSFB_RESULTS.',
			'CI should prepare the JSFB checkout, run keyed/markless, and then run pnpm test with MARKLESS_JSFB_RESULTS pointing at the fresh results directory.',
		].join('\n'),
	);
}

async function resolveBaselineResultsPath(args) {
	if (args.baselineResults) return args.baselineResults;
	for (const path of DEFAULT_BASELINE_RESULTS_PATHS) {
		if (await pathExists(path)) return path;
	}
	return undefined;
}

function hasExplicitResultsPath(args) {
	return Boolean(
		args.results ||
		process.env.MARKLESS_JSFB_RESULTS ||
		process.env.JSFB_RESULTS_DIR ||
		process.env.JSFB_ROOT,
	);
}

function printUsage() {
	console.log(`Usage:
  node scripts/benchmarks/jsfb-baseline.mjs compare [--results <file-or-dir>] [--baseline <file>] [--baseline-results <file-or-dir>] [--framework markless-keyed]

The results input can be either:
  - a JS Framework Benchmark result directory containing <framework>_<benchmark>.json files
  - a normalized JSON file with a top-level "results" object

Without --results, the guard checks MARKLESS_JSFB_RESULTS, JSFB_RESULTS_DIR,
JSFB_ROOT/webdriver-ts/results, then ../js-framework-benchmark/webdriver-ts/results.

With --baseline-results or MARKLESS_JSFB_BASELINE_RESULTS, Markless is compared
against fresh same-machine baseline results instead of the committed absolute
Markless numbers.
`);
}

async function main() {
	const args = parseArgs(process.argv);
	if (args.help) {
		printUsage();
		return;
	}
	if (args.command !== 'compare') {
		throw new Error(`Unknown command: ${args.command}`);
	}

	let baseline = await readJson(resolve(args.baseline ?? DEFAULT_BASELINE_PATH));
	const baselineResultsPath = await resolveBaselineResultsPath(args);
	const framework = args.framework ?? DEFAULT_FRAMEWORK;
	if (baselineResultsPath) {
		console.log(`Using Markless baseline results: ${baselineResultsPath}`);
		const marklessBaselineResults = await readBenchmarkResults(baselineResultsPath, {
			framework,
		});
		baseline = withMarklessBaselineResults(baseline, marklessBaselineResults);
	}

	const resultsPath = await resolveResultsPath(args);
	console.log(`Using JSFB results: ${resultsPath}`);
	const rawCurrentResults = await readBenchmarkResults(resultsPath, {
		framework,
	});
	const selectedResults = selectCurrentResultsForGuard({
		baseline,
		currentResults: rawCurrentResults,
		explicitResultsPath: hasExplicitResultsPath(args),
		framework,
		resultsPath,
	});
	if (selectedResults.warning) console.warn(`warn: ${selectedResults.warning}`);
	const currentResults = selectedResults.currentResults;
	const result = compareBenchmarkResults(baseline, currentResults);

	console.log(
		`Markless CPU geomean: ${result.currentCpuGeomean?.toFixed(2) ?? 'n/a'} (baseline ${result.baselineCpuGeomean?.toFixed(2) ?? 'n/a'})`,
	);
	if (baselineResultsPath) {
		console.log(
			'Peer ratios skipped because this run uses fresh same-machine Markless baseline results.',
		);
	} else {
		for (const [name, ratio] of Object.entries(result.ratios)) {
			const direction = ratio <= 1 ? 'faster than' : 'slower than';
			const delta = Math.abs(1 - ratio) * 100;
			console.log(
				`Markless is ${delta.toFixed(1)}% ${direction} ${name} on fixed baseline CPU geomean.`,
			);
		}
	}
	for (const warning of result.warnings) console.warn(`warn: ${warning}`);
	for (const failure of result.failures) console.error(`fail: ${failure}`);
	if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
