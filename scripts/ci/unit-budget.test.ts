import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { attribute, describePeak, processLabel } from './unit-budget.mjs';

const script = resolve(import.meta.dirname, 'unit-budget.mjs');
const scratch: string[] = [];

afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Shard = {
	shard: string;
	cpuS: number;
	peakRssMb: number;
	calibrationS?: number;
	cpuModel?: string;
	attempt?: number;
	exitCode?: number;
	platform?: string;
};

const measurementsDir = (shards: Shard[]) => {
	const dir = mkdtempSync(join(tmpdir(), 'unit-budget-test-'));
	scratch.push(dir);
	shards.forEach((shard, index) => {
		const folder = join(dir, `unit-budget-shard${index}`);
		mkdirSync(folder, { recursive: true });
		writeFileSync(
			join(folder, 'measurement.json'),
			JSON.stringify({
				version: 2,
				platform: 'linux-x64',
				cpuModel: 'test cpu',
				cpus: 4,
				sha: null,
				run: '42',
				command: [],
				exitCode: 0,
				wallS: 100,
				attempt: 1,
				calibrationS: 1,
				...shard,
			}),
		);
	});
	return dir;
};

const budgetFile = (budget: object) => {
	const dir = mkdtempSync(join(tmpdir(), 'unit-budget-file-'));
	scratch.push(dir);
	const path = join(dir, 'unit-budget.json');
	writeFileSync(path, JSON.stringify(budget));
	return path;
};

const anchored = {
	version: 1,
	platform: 'linux-x64',
	margin: { cpu: 0.05, rss: 0.1, samples: {} },
	anchors: {
		calibrationS: 1,
		cpuS: 300,
		peakRssMb: 2000,
		shards: { '1/2': { cpuS: 100, peakRssMb: 2000 }, '2/2': { cpuS: 200, peakRssMb: 1500 } },
		runs: ['41'],
		sha: null,
	},
	history: [],
};

const run = (...args: string[]) => {
	const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
	return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const check = (budget: object, shards: Shard[]) =>
	run('check', '--budget', budgetFile(budget), '--measurements', measurementsDir(shards));

describe('check', () => {
	test('passes inside the noise band', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 104, peakRssMb: 2150 },
			{ shard: '2/2', cpuS: 205, peakRssMb: 1400 },
		]);
		expect(result.output).toContain(
			"total CPU at the anchors' speed: 309 CPU-s against an anchor of 300 CPU-s (+3%",
		);
		expect(result.status).toBe(0);
	});

	test('fails over budget when the summed CPU leaves the band upward', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 120, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain("over budget: total CPU at the anchors' speed 320 CPU-s");
		expect(result.output).toContain('accept --from 42 --reason');
	});

	test('fails over budget on memory alone', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 100, peakRssMb: 2300 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain('over budget: largest shard peak RSS 2300 MB');
	});

	test('fails loudly when the suite got lighter than the band: the anchor is stale', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 80, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 190, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain("stale anchor: total CPU at the anchors' speed 270 CPU-s");
	});

	test('fails when the shards differ from the anchored ones', () => {
		const result = check(anchored, [
			{ shard: '1/3', cpuS: 100, peakRssMb: 2000 },
			{ shard: '2/3', cpuS: 100, peakRssMb: 1500 },
			{ shard: '3/3', cpuS: 100, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			'stale anchor: the anchors cover shards [1/2, 2/2] but this run measured [1/3, 2/3, 3/3]',
		);
	});

	test('scales each shard by its runner speed: a slower CPU model spends more CPU-seconds on the same work', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 150, calibrationS: 1.5, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
		]);
		expect(result.output).toContain("total CPU at the anchors' speed: 300 CPU-s");
		expect(result.status).toBe(0);
	});

	test('divides by the CPU model factor: a model the calibration rates too fast reads at its true work', () => {
		const models = { factors: { 'fast at calibration': 1.2 } };
		const budget = {
			...anchored,
			models,
			anchors: { ...anchored.anchors, models: models.factors },
			margin: { ...anchored.margin, models: models.factors },
		};
		const result = check(budget, [
			{ shard: '1/2', cpuS: 120, cpuModel: 'fast at calibration', peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
		]);
		expect(result.output).toContain("total CPU at the anchors' speed: 300 CPU-s");
		expect(result.output).toContain('model factor 1.2');
		expect(result.output).toContain('no factor recorded for this CPU model');
		expect(result.status).toBe(0);
	});

	test('a shard on a CPU model with no factor gets the band measured without factors, and a warning', () => {
		const models = { unknownMargin: 0.2, factors: { 'test cpu': 1 } };
		const budget = {
			...anchored,
			models,
			anchors: { ...anchored.anchors, models: models.factors },
			margin: { ...anchored.margin, models: models.factors },
		};
		const shards = (cpuModel: string) => [
			{ shard: '1/2', cpuS: 100, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 230, cpuModel, peakRssMb: 1500 },
		];
		// +10% overall: outside the 5% band, inside 1/3 * 5% + 2/3 * 20% = 15%.
		const known = check(budget, shards('test cpu'));
		expect(known.status).toBe(1);
		expect(known.output).toContain('noise margin ±5%');
		const unknown = check(budget, shards('new runner cpu'));
		expect(unknown.status).toBe(0);
		expect(unknown.output).toContain('noise margin ±15%');
		expect(unknown.output).toContain(
			'::warning::shard 2/2 ran on new runner cpu, a CPU model with no factor',
		);
		expect(unknown.output).toContain('unit-budget.mjs models --from');
	});

	test('fails when the CPU model factors changed after the anchors and the margin', () => {
		const result = check({ ...anchored, models: { factors: { 'test cpu': 1.1 } } }, [
			{ shard: '1/2', cpuS: 110, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 220, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			'stale anchor: the CPU-model factors changed after the anchors were accepted',
		);
		expect(result.output).toContain(
			'stale margin: the CPU-model factors changed after the margin was derived',
		);
	});

	test('reads the latest attempt of a rerun shard', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 150, peakRssMb: 2000, attempt: 1 },
			{ shard: '1/2', cpuS: 101, peakRssMb: 2000, attempt: 2 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(0);
	});

	test('refuses a failed shard, a Mac measurement, and a budget with no anchors', () => {
		expect(
			check(anchored, [
				{ shard: '1/2', cpuS: 100, peakRssMb: 2000, exitCode: 1 },
				{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
			]).output,
		).toContain('exited 1; only a green run measures the suite');
		expect(
			check(anchored, [
				{ shard: '1/2', cpuS: 100, peakRssMb: 2000, platform: 'darwin-arm64' },
				{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
			]).output,
		).toContain('was measured on darwin-arm64; the anchors are linux-x64 from CI');
		const empty = check({ ...anchored, anchors: null, margin: null }, [
			{ shard: '1/2', cpuS: 100, peakRssMb: 2000 },
		]);
		expect(empty.status).toBe(1);
		expect(empty.output).toContain('no anchors');
	});
});

describe('accept and margin', () => {
	const runs = [
		[
			{ shard: '1/2', cpuS: 100, peakRssMb: 1000 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1800 },
		],
		[
			{ shard: '1/2', cpuS: 110, peakRssMb: 1100 },
			{ shard: '2/2', cpuS: 190, peakRssMb: 2000 },
		],
		[
			{ shard: '1/2', cpuS: 104, peakRssMb: 1050 },
			{ shard: '2/2', cpuS: 196, peakRssMb: 1900 },
		],
	];

	test('accept needs a reason', () => {
		const path = budgetFile({ ...anchored, anchors: null });
		const result = run('accept', '--budget', path, '--from', measurementsDir(runs[0]));
		expect(result.status).toBe(2);
		expect(result.output).toContain('accept needs --reason');
	});

	test('accept anchors each shard at its median across runs and records the reason', () => {
		const path = budgetFile({ ...anchored, anchors: null });
		const args = runs.flatMap((shards) => ['--from', measurementsDir(shards)]);
		expect(run('accept', '--budget', path, ...args, '--reason', 'first anchors').status).toBe(
			0,
		);
		const budget = JSON.parse(readFileSync(path, 'utf8'));
		expect(budget.anchors.shards).toEqual({
			'1/2': { cpuS: 104, peakRssMb: 1050 },
			'2/2': { cpuS: 196, peakRssMb: 1900 },
		});
		expect(budget.anchors.cpuS).toBe(300);
		expect(budget.anchors.peakRssMb).toBe(1900);
		expect(budget.history.at(-1)).toMatchObject({
			change: 'anchors',
			from: null,
			to: { cpuS: 300, peakRssMb: 1900 },
			reason: 'first anchors',
		});
	});

	test('accept anchors at the median runner speed of the samples', () => {
		const path = budgetFile({ ...anchored, anchors: null });
		const fast = runs[0].map((shard) => ({
			...shard,
			cpuS: shard.cpuS / 2,
			calibrationS: 0.5,
		}));
		const args = [fast, runs[1], runs[2]].flatMap((shards) => [
			'--from',
			measurementsDir(shards),
		]);
		expect(run('accept', '--budget', path, ...args, '--reason', 'mixed runners').status).toBe(
			0,
		);
		const budget = JSON.parse(readFileSync(path, 'utf8'));
		expect(budget.anchors.calibrationS).toBe(1);
		expect(budget.anchors.cpuS).toBe(300);
	});

	test('margin is the largest deviation of a shard sample from its median, and needs three samples a shard', () => {
		const path = budgetFile({ ...anchored, margin: null });
		const two = runs.slice(0, 2).flatMap((shards) => ['--from', measurementsDir(shards)]);
		const short = run('margin', '--budget', path, ...two, '--reason', 'too few');
		expect(short.status).toBe(2);
		expect(short.output).toContain('a margin needs at least 3 per shard');
		const all = runs.flatMap((shards) => ['--from', measurementsDir(shards)]);
		expect(run('margin', '--budget', path, ...all, '--reason', 'three reruns').status).toBe(0);
		const budget = JSON.parse(readFileSync(path, 'utf8'));
		// 1/2 CPU: 110 against a median of 104 is +5.77%; RSS: 1000 against 1050 is -4.76%.
		expect(budget.margin.cpu).toBe(0.058);
		expect(budget.margin.rss).toBe(0.053);
	});
});

describe('models', () => {
	const sample = (shard: string, cpuModel: string, cpuS: number): Shard => ({
		shard,
		cpuModel,
		cpuS,
		peakRssMb: 1000,
	});
	// Model B spends 21% more CPU-s per calibration second than model A on the same shards.
	const runs = Array.from({ length: 5 }, (_, index) => [
		sample('1/2', 'A', 100 + index),
		sample('2/2', 'B', 242 + index),
		sample('1/2', 'B', 121 + index),
		sample('2/2', 'A', 200 + index),
	]);

	test('fits each model factor from its samples against the shard medians', () => {
		const path = budgetFile(anchored);
		const args = runs.flatMap((shards) => ['--from', measurementsDir(shards)]);
		const result = run('models', '--budget', path, ...args, '--reason', 'two models');
		expect(result.status).toBe(0);
		const budget = JSON.parse(readFileSync(path, 'utf8'));
		expect(budget.models.factors.B / budget.models.factors.A).toBeCloseTo(1.21, 2);
		expect(budget.models.factors.A * budget.models.factors.B).toBeCloseTo(1, 2);
		expect(budget.models.samples).toEqual({ A: 10, B: 10 });
		expect(budget.history.at(-1)).toMatchObject({ change: 'models', reason: 'two models' });
	});

	test('accept and margin record the factors they were computed with', () => {
		const path = budgetFile(anchored);
		const args = runs.flatMap((shards) => ['--from', measurementsDir(shards)]);
		expect(run('models', '--budget', path, ...args, '--reason', 'two models').status).toBe(0);
		expect(run('accept', '--budget', path, ...args, '--reason', 'anchors').status).toBe(0);
		expect(run('margin', '--budget', path, ...args, '--reason', 'margin').status).toBe(0);
		const budget = JSON.parse(readFileSync(path, 'utf8'));
		expect(budget.anchors.models).toEqual(budget.models.factors);
		expect(budget.margin.models).toEqual(budget.models.factors);
	});

	test('a model with too few samples gets no factor, and one model alone fits nothing', () => {
		const path = budgetFile(anchored);
		const few = runs
			.slice(0, 2)
			.flatMap((shards) => ['--from', measurementsDir(shards)]);
		const result = run('models', '--budget', path, ...few, '--reason', 'too few');
		expect(result.status).toBe(2);
		expect(result.output).toContain('at least two CPU models with 5 samples each');
	});
});

test('measure without an output file runs the command and keeps its exit code', () => {
	const result = spawnSync(
		process.execPath,
		[script, 'measure', '--', process.execPath, '-e', 'process.exit(3)'],
		{
			encoding: 'utf8',
			env: { ...process.env, MARKLESS_UNIT_BUDGET_OUT: '' },
		},
	);
	expect(result.status).toBe(3);
});

describe('peak attribution', () => {
	const MB = 2 ** 20;
	// 1: vitest main; 10 and 20: workers; 11: a Chromium under worker 10, 12 its renderer; 21: a build child of worker 20.
	const procs = [
		{ pid: 1, ppid: 0, rss: 300 * MB },
		{ pid: 10, ppid: 1, rss: 400 * MB },
		{ pid: 11, ppid: 10, rss: 500 * MB },
		{ pid: 12, ppid: 11, rss: 250 * MB },
		{ pid: 20, ppid: 1, rss: 200 * MB },
		{ pid: 21, ppid: 20, rss: 600 * MB },
	];
	const fileOf = new Map([
		[10, 'packages/a/test/browser.test.ts'],
		[20, 'packages/b/test/build.test.ts'],
	]);
	const kinds = new Map([
		[1, 'node vitest.mjs'],
		[10, 'node forks.js'],
		[11, 'chrome'],
		[12, 'chrome'],
		[20, 'node forks.js'],
		[21, 'node fixture-build-child.ts'],
	]);

	test('a test file owns every process under its worker, largest file first', () => {
		const groups = attribute(procs, fileOf, ({ pid }) => kinds.get(pid) ?? '?');
		expect(groups).toEqual([
			{
				file: 'packages/a/test/browser.test.ts',
				mb: 1150,
				parts: { chrome: 750, 'node forks.js': 400 },
			},
			{
				file: 'packages/b/test/build.test.ts',
				mb: 800,
				parts: { 'node fixture-build-child.ts': 600, 'node forks.js': 200 },
			},
			{ file: expect.stringContaining('no test file'), mb: 300, parts: { 'node vitest.mjs': 300 } },
		]);
	});

	test('the report lists the files alive at the peak', () => {
		const groups = attribute(procs, fileOf);
		const text = describePeak({ shard: '1/3', peakRssMb: 2250, atPeak: { atS: 12.5, groups } });
		expect(text.split('\n')).toEqual([
			'  shard 1/3 at its peak (2250 MB, 12.5 s in):',
			'    1150 MB  packages/a/test/browser.test.ts  (process 1150)',
			'    800 MB  packages/b/test/build.test.ts  (process 800)',
			expect.stringMatching(/^ {4}300 MB {2}\(no test file/),
		]);
		expect(describePeak({ shard: '2/3', peakRssMb: 1 })).toContain('no per-file attribution');
	});

	test('a process is named by its program, or for node by the script it runs', () => {
		expect(
			processLabel([
				'/opt/ms-playwright/chromium_headless_shell-1/chrome-headless-shell --type=renderer --no-sandbox',
			]),
		).toBe('chrome-headless-shell');
		expect(
			processLabel([
				'/usr/bin/node',
				'--require',
				'/repo/node_modules/vitest/suppress-warnings.cjs',
				'--conditions',
				'node',
				'/repo/node_modules/vitest/dist/workers/forks.js',
			]),
		).toBe('node forks.js');
		expect(processLabel(['/usr/bin/node', '/repo/test/support/fixture-build-child.ts', '{}'])).toBe(
			'node fixture-build-child.ts',
		);
	});
});
