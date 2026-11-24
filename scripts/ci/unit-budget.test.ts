import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { holdsSlotForFile } from './in-worker-builds.ts';
import {
	attribute,
	describePeak,
	processLabel,
	readSlots,
	recordSample,
	SLOT_HELD_SHARE,
	SLOT_HOLDER_FAIL_MB,
	SLOT_HOLDER_STALE_MB,
	suiteKey,
} from './unit-budget.mjs';

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
	run?: string;
	attempt?: number;
	exitCode?: number;
	platform?: string;
	fileMs?: Record<string, number>;
	fileUnslottedPeaksMb?: Record<string, number>;
	filePeaksMb?: Record<string, number>;
	wallS?: number;
	wholeFileSlotS?: number;
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

const correction = (models: { factors?: object; calibrationS?: object; elasticity?: object }) => ({
	factors: models.factors ?? {},
	calibrationS: models.calibrationS ?? {},
	elasticity: models.elasticity ?? {},
});

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

	test('a suite lighter than the band warns and does not fail: the change did not make it so', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 80, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 190, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(0);
		expect(result.output).toContain(
			"::warning::lighter: total CPU at the anchors' speed 270 CPU-s",
		);
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
			anchors: { ...anchored.anchors, models: correction(models) },
			margin: { ...anchored.margin, models: correction(models) },
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

	test("a calibration swing counts only as far as its model's suite follows it", () => {
		const models = {
			factors: { 'test cpu': 1 },
			calibrationS: { 'test cpu': 1 },
			elasticity: { 'test cpu': 0.5 },
		};
		const budget = {
			...anchored,
			models,
			anchors: { ...anchored.anchors, models: correction(models) },
			margin: { ...anchored.margin, models: correction(models) },
		};
		// Calibration 0.6561 reads 34% fast, but the suite ran 19% faster: dividing by it whole reads +7.8%.
		const result = check(budget, [
			{ shard: '1/2', cpuS: 81, calibrationS: 0.6561, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
		]);
		expect(result.output).toContain("total CPU at the anchors' speed: 300 CPU-s");
		expect(result.output).toContain('counted as 0.81');
		expect(result.status).toBe(0);
	});

	test('a shard on a CPU model with no factor gets the band measured without factors, and a warning', () => {
		const models = { unknownMargin: 0.2, factors: { 'test cpu': 1 } };
		const budget = {
			...anchored,
			models,
			anchors: { ...anchored.anchors, models: correction(models) },
			margin: { ...anchored.margin, models: correction(models) },
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
			'stale anchor: the CPU-model correction changed after the anchors were accepted',
		);
		expect(result.output).toContain(
			'stale margin: the CPU-model correction changed after the margin was derived',
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

const mainDir = (runs: Shard[][]) => {
	const dir = mkdtempSync(join(tmpdir(), 'unit-budget-main-'));
	scratch.push(dir);
	runs.forEach((shards, order) => {
		const id = String(100 + order);
		shards.forEach((shard, index) => {
			const folder = join(
				dir,
				`${String(order).padStart(2, '0')}-${id}`,
				`unit-budget-shard${index}`,
			);
			mkdirSync(folder, { recursive: true });
			writeFileSync(
				join(folder, 'measurement.json'),
				JSON.stringify({
					version: 2,
					platform: 'linux-x64',
					cpuModel: 'test cpu',
					cpus: 4,
					sha: null,
					run: id,
					command: [],
					exitCode: 0,
					wallS: 100,
					attempt: 1,
					calibrationS: 1,
					...shard,
				}),
			);
		});
	});
	return dir;
};

// Ten landed runs of main, each with these two shards.
const mainAt = (one: number, two: number, rss = 2000, runs = 10) =>
	mainDir(
		Array.from({ length: runs }, () => [
			{ shard: '1/2', cpuS: one, peakRssMb: rss },
			{ shard: '2/2', cpuS: two, peakRssMb: 1500 },
		]),
	);

const checkAgainstMain = (budget: object, shards: Shard[], main: string) =>
	run(
		'check',
		'--budget',
		budgetFile(budget),
		'--measurements',
		measurementsDir(shards),
		'--main',
		main,
	);

describe("check against main's last landed runs", () => {
	test("a run more than the margin above main's median fails, though inside the anchor's band", () => {
		const result = checkAgainstMain(
			anchored,
			[
				{ shard: '1/2', cpuS: 95, peakRssMb: 2000 },
				{ shard: '2/2', cpuS: 195, peakRssMb: 1500 },
			],
			mainAt(90, 180),
		);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"over budget: total CPU at the anchors' speed 290 CPU-s against main's median of 270 CPU-s (+7.4%",
		);
		expect(result.output).toContain('more than the margin above main');
	});

	test("memory is held to main's median the same way", () => {
		const result = checkAgainstMain(
			anchored,
			[
				{ shard: '1/2', cpuS: 100, peakRssMb: 2000 },
				{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
			],
			mainAt(100, 200, 1800),
		);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"over budget: largest shard peak RSS 2000 MB against main's median of 1800 MB (+11.1%",
		);
	});

	test('the committed anchor plus the margin stays a ceiling, however far main has moved', () => {
		const result = checkAgainstMain(
			anchored,
			[
				{ shard: '1/2', cpuS: 107, peakRssMb: 2000 },
				{ shard: '2/2', cpuS: 213, peakRssMb: 1500 },
			],
			mainAt(110, 220),
		);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"over budget: total CPU at the anchors' speed 320 CPU-s against main's median of 330 CPU-s (-3%",
		);
		expect(result.output).toContain('ceiling 315 CPU-s');
		expect(result.output).toContain('over the ceiling no run may pass');
	});

	test("a run inside main's band passes, and one under it only warns", () => {
		const inside = checkAgainstMain(
			anchored,
			[
				{ shard: '1/2', cpuS: 92, peakRssMb: 1900 },
				{ shard: '2/2', cpuS: 184, peakRssMb: 1500 },
			],
			mainAt(90, 180, 1900),
		);
		expect(inside.status).toBe(0);
		const under = checkAgainstMain(
			anchored,
			[
				{ shard: '1/2', cpuS: 80, peakRssMb: 1600 },
				{ shard: '2/2', cpuS: 160, peakRssMb: 1500 },
			],
			mainAt(100, 200),
		);
		expect(under.status).toBe(0);
		expect(under.output).toContain(
			"::warning::lighter: total CPU at the anchors' speed 240 CPU-s",
		);
		expect(under.output).toContain('::warning::lighter: largest shard peak RSS 1600 MB');
	});

	test('warns when main has moved more than half the margin from the committed anchor', () => {
		const result = checkAgainstMain(
			anchored,
			[
				{ shard: '1/2', cpuS: 103, peakRssMb: 2000 },
				{ shard: '2/2', cpuS: 206, peakRssMb: 1500 },
			],
			mainAt(103, 206),
		);
		expect(result.status).toBe(0);
		expect(result.output).toContain(
			"::warning::main moved: total CPU at the anchors' speed on main's last 10 landed runs is 309 CPU-s, +3% from the committed anchor of 300 CPU-s, more than half the ±5% margin",
		);
		expect(result.output).toContain('accept --from 100 101 102 103 104 105 106 107 108 109');
		expect(result.output).not.toContain('main moved: largest shard peak RSS');
	});

	test('with fewer than 10 usable landed runs the run is held to the committed anchors alone', () => {
		const main = mainDir([
			...Array.from({ length: 9 }, () => [
				{ shard: '1/2', cpuS: 90, peakRssMb: 2000 },
				{ shard: '2/2', cpuS: 180, peakRssMb: 1500 },
			]),
			[
				{ shard: '1/2', cpuS: 90, peakRssMb: 2000, exitCode: 1 },
				{ shard: '2/2', cpuS: 180, peakRssMb: 1500 },
			],
		]);
		const result = checkAgainstMain(
			anchored,
			[
				{ shard: '1/2', cpuS: 95, peakRssMb: 2000 },
				{ shard: '2/2', cpuS: 195, peakRssMb: 1500 },
			],
			main,
		);
		expect(result.status).toBe(0);
		expect(result.output).toContain(
			"main's last landed runs gave 9 of 10 usable unit budget measurements",
		);
		expect(result.output).toContain(
			"total CPU at the anchors' speed: 290 CPU-s against an anchor of 300 CPU-s",
		);
	});

	test('drift reports main against the anchors and warns past half the margin', () => {
		const quiet = run('drift', '--budget', budgetFile(anchored), '--main', mainAt(101, 201));
		expect(quiet.status).toBe(0);
		expect(quiet.output).not.toContain('::warning::');
		const moved = run(
			'drift',
			'--budget',
			budgetFile(anchored),
			'--main',
			mainAt(100, 200, 2150),
		);
		expect(moved.status).toBe(0);
		expect(moved.output).toContain(
			"::warning::main moved: largest shard peak RSS on main's last 10 landed runs is 2150 MB, +7.5% from the committed anchor of 2000 MB",
		);
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
		expect(budget.anchors.models).toEqual(correction(budget.models));
		expect(budget.margin.models).toEqual(correction(budget.models));
	});

	test("fits how far each model's suite follows a calibration swing", () => {
		// 12 runs; on model A the suite moves by the square root of the calibration's swing, on B by all of it.
		const swings = [0.8, 1.25, 0.9, 1.1, 1, 0.85, 1.2, 0.95, 1.05, 1.15, 0.88, 1.12];
		const swung = swings.map((k, index) => {
			const k2 = swings[(index + 5) % swings.length];
			const at = (
				shard: string,
				cpuModel: string,
				work: number,
				swing: number,
				elastic: number,
			) => ({
				...sample(shard, cpuModel, work * swing ** elastic),
				calibrationS: (cpuModel === 'B' ? 1.2 : 1) * swing,
				run: String(100 + index),
			});
			return [
				at('1/2', 'A', 100, k, 0.5),
				at('2/2', 'B', 242, k2, 1),
				at('1/2', 'B', 121, k2, 1),
				at('2/2', 'A', 200, k, 0.5),
			];
		});
		const path = budgetFile(anchored);
		const args = swung.flatMap((shards) => ['--from', measurementsDir(shards)]);
		expect(run('models', '--budget', path, ...args, '--reason', 'swings').status).toBe(0);
		const { models } = JSON.parse(readFileSync(path, 'utf8'));
		expect(models.elasticity.A).toBeCloseTo(0.5, 1);
		expect(models.elasticity.B).toBeCloseTo(1, 1);
		expect(models.calibrationS).toEqual({ A: 1.025, B: 1.23 });
	});

	test('a model with too few samples gets no factor, and one model alone fits nothing', () => {
		const path = budgetFile(anchored);
		const few = runs.slice(0, 2).flatMap((shards) => ['--from', measurementsDir(shards)]);
		const result = run('models', '--budget', path, ...few, '--reason', 'too few');
		expect(result.status).toBe(2);
		expect(result.output).toContain('at least two CPU models with 5 samples each');
	});
});

describe("the suite's own test files as the yardstick", () => {
	const files = Array.from({ length: 25 }, (_, index) => `test/file-${index}.test.ts`);
	const timed = (ms: number, slower: Record<string, number> = {}) =>
		Object.fromEntries(files.map((file) => [file, slower[file] ?? ms]));
	const models = {
		factors: { 'test cpu': 1 },
		calibrationS: { 'test cpu': 1 },
		elasticity: { 'test cpu': 1 },
	};
	const suite = {
		minimumMs: 100,
		pace: { 'test cpu': 1 },
		samples: { 'test cpu': 10 },
		files: timed(1000),
	};
	const budget = {
		...anchored,
		models,
		suite,
		margin: { ...anchored.margin, models: correction(models) },
		anchors: {
			...anchored.anchors,
			models: correction(models),
			suite: suiteKey({ suite }),
			shards: {
				'1/2': { cpuS: 100, peakRssMb: 2000, suite: 100, typical: 100 },
				'2/2': { cpuS: 200, peakRssMb: 1500, suite: 200, typical: 200 },
			},
		},
	};

	test('a shard whose calibration misreads its host counts by its own test files', () => {
		// The same work on a host whose calibration read 15% fast: by calibration alone, +5.9%.
		const shards = (fileMs?: Record<string, number>) => [
			{ shard: '1/2', cpuS: 100, calibrationS: 0.85, peakRssMb: 2000, fileMs },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500, fileMs },
		];
		const byCalibration = check(budget, shards());
		expect(byCalibration.status).toBe(1);
		expect(byCalibration.output).toContain('a shard has no file timings');
		const byFiles = check(budget, shards(timed(1000)));
		expect(byFiles.output).toContain("total CPU at the anchors' speed: 300 CPU-s");
		expect(byFiles.status).toBe(0);
	});

	test('a slow host whose calibration saw it stays on budget', () => {
		const result = check(budget, [
			{ shard: '1/2', cpuS: 120, calibrationS: 1.2, peakRssMb: 2000, fileMs: timed(1200) },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500, fileMs: timed(1000) },
		]);
		expect(result.output).toContain("total CPU at the anchors' speed: 300 CPU-s");
		expect(result.status).toBe(0);
	});

	test('a change that slows every test file alike is over budget', () => {
		const result = check(budget, [
			{ shard: '1/2', cpuS: 112, peakRssMb: 2000, fileMs: timed(1120) },
			{ shard: '2/2', cpuS: 224, peakRssMb: 1500, fileMs: timed(1120) },
		]);
		expect(result.output).toContain('every test file at once: +12%');
		expect(result.status).toBe(1);
		expect(result.output).toContain("over budget: total CPU at the anchors' speed 336 CPU-s");
	});

	test('a few slower files are over budget', () => {
		const slower = { [files[0]]: 5000, [files[1]]: 5000, [files[2]]: 5000 };
		const result = check(budget, [
			{ shard: '1/2', cpuS: 136, peakRssMb: 2000, fileMs: timed(1000, slower) },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500, fileMs: timed(1000) },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain("over budget: total CPU at the anchors' speed 336 CPU-s");
	});

	test('anchors accepted with another suite reference are stale', () => {
		const result = check({ ...budget, suite: { ...suite, pace: { 'test cpu': 1.1 } } }, [
			{ shard: '1/2', cpuS: 100, peakRssMb: 2000, fileMs: timed(1000) },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500, fileMs: timed(1000) },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			'stale anchor: the suite reference changed after the anchors were accepted',
		);
	});

	test("suite fits each file's reference and each model's CPU-s per unit of pace; accept anchors each reading", () => {
		// Model B spends 1.5 times A's CPU-s on a shard while its files run 1.2 times slower: 1.25 times the CPU-s per unit of pace.
		const runs = Array.from({ length: 6 }, (_, index) => [
			{
				shard: '1/2',
				cpuModel: 'A',
				cpuS: 100,
				peakRssMb: 1000,
				run: String(10 + index),
				fileMs: { ...timed(1000), 'test/rare.test.ts': 500, 'test/quick.test.ts': 50 },
			},
			{
				shard: '2/2',
				cpuModel: 'B',
				cpuS: 300,
				peakRssMb: 1000,
				run: String(10 + index),
				fileMs: timed(1200),
			},
			{
				shard: '1/2',
				cpuModel: 'B',
				cpuS: 150,
				peakRssMb: 1000,
				run: String(10 + index),
				fileMs: timed(1200),
			},
			{
				shard: '2/2',
				cpuModel: 'A',
				cpuS: 200,
				peakRssMb: 1000,
				run: String(10 + index),
				fileMs: timed(1000),
			},
		]);
		runs[0][0].fileMs = { ...runs[0][0].fileMs, 'test/new.test.ts': 800 };
		const path = budgetFile(anchored);
		const args = runs.flatMap((shards) => ['--from', measurementsDir(shards)]);
		expect(run('suite', '--budget', path, ...args).output).toContain('suite needs --reason');
		expect(run('suite', '--budget', path, ...args, '--reason', 'two models').status).toBe(0);
		const fitted = JSON.parse(readFileSync(path, 'utf8'));
		expect(Object.keys(fitted.suite.files)).toEqual([...files, 'test/rare.test.ts'].sort());
		expect(fitted.suite.files[files[0]]).toBe(1100);
		expect(fitted.suite.pace.B / fitted.suite.pace.A).toBeCloseTo(1.25, 2);
		expect(fitted.history.at(-1)).toMatchObject({ change: 'suite', reason: 'two models' });
		expect(run('accept', '--budget', path, ...args, '--reason', 'anchors').status).toBe(0);
		const { anchors } = JSON.parse(readFileSync(path, 'utf8'));
		expect(anchors.suite).toBe(suiteKey(fitted));
		expect(anchors.shards['1/2'].suite).toBeGreaterThan(0);
		expect(anchors.shards['2/2'].suite).toBeGreaterThan(0);
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
			{
				file: expect.stringContaining('no test file'),
				mb: 300,
				parts: { 'node vitest.mjs': 300 },
			},
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
		expect(
			processLabel(['/usr/bin/node', '/repo/test/support/fixture-build-child.ts', '{}']),
		).toBe('node fixture-build-child.ts');
	});
});

describe('memory held outside the build slot', () => {
	const big = 'packages/a/test/big.test.ts';
	const heavyFile = (slotHolders: { test: string }[]) => {
		const dir = mkdtempSync(join(tmpdir(), 'unit-budget-heavy-'));
		scratch.push(dir);
		const path = join(dir, 'heavy-tests.json');
		writeFileSync(
			path,
			JSON.stringify({ inWorkerBuilds: { tests: [] }, slotHolders: { tests: slotHolders } }),
		);
		return path;
	};
	const changedFile = (files: string[]) => {
		const dir = mkdtempSync(join(tmpdir(), 'unit-budget-changed-'));
		scratch.push(dir);
		const path = join(dir, 'changed.txt');
		writeFileSync(path, files.join('\n'));
		return path;
	};
	const checkWith = (
		shard1: Partial<Shard>,
		{ holders = [], changed }: { holders?: { test: string }[]; changed?: string[] } = {},
	) =>
		run(
			'check',
			'--budget',
			budgetFile(anchored),
			'--measurements',
			measurementsDir([
				{ shard: '1/2', cpuS: 100, peakRssMb: 2000, ...shard1 },
				{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
			]),
			'--heavy',
			heavyFile(holders),
			...(changed ? ['--changed', changedFile(changed)] : []),
		);
	const over = { fileUnslottedPeaksMb: { [big]: SLOT_HOLDER_FAIL_MB + 1 } };

	test('fails for a file the change touches when it is over the line, naming it and both ways out', () => {
		const result = checkWith(over, { changed: [big] });
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			`::error::${big} held ${SLOT_HOLDER_FAIL_MB + 1} MB outside the build slot (shard 1/2, run 42)`,
		);
		expect(result.output).toContain('list it under "slotHolders"');
		expect(result.output).toContain('or make it keep less outside the slot');
	});

	test('only reports a file the change did not touch, however far over', () => {
		const result = checkWith(over, { changed: ['packages/other/src/x.ts'] });
		expect(result.status).toBe(0);
		expect(result.output).toContain(`::warning::${big} held ${SLOT_HOLDER_FAIL_MB + 1} MB`);
		expect(result.output).toContain('files over the 1024 MB slot line without holding the slot: 1');
	});

	test('fails nothing without a changed-file set', () => {
		expect(checkWith(over).status).toBe(0);
	});

	test('a touched file between the line and the noise margin is reported, not failed', () => {
		const result = checkWith(
			{ fileUnslottedPeaksMb: { [big]: SLOT_HOLDER_FAIL_MB } },
			{ changed: [big] },
		);
		expect(result.status).toBe(0);
		expect(result.output).toContain(`::warning::${big} held ${SLOT_HOLDER_FAIL_MB} MB`);
	});

	test('a listed file passes', () => {
		expect(checkWith(over, { holders: [{ test: big }], changed: [big] }).status).toBe(0);
	});

	test('a listed file far under the line is stale: reported, and failed when touched', () => {
		const light = { fileMs: { [big]: 1000 }, filePeaksMb: { [big]: SLOT_HOLDER_STALE_MB - 1 } };
		const untouched = checkWith(light, { holders: [{ test: big }], changed: [] });
		expect(untouched.status).toBe(0);
		expect(untouched.output).toContain(`::warning::stale: ${big} is listed under "slotHolders"`);
		expect(checkWith(light, { holders: [{ test: big }], changed: [big] }).status).toBe(1);
	});

	test('reports the share of a shard under whole-file holds, and fails a list change past the ceiling', () => {
		const serial = { wallS: 100, wholeFileSlotS: 100 * SLOT_HELD_SHARE + 1 };
		const result = checkWith(serial, { changed: [] });
		expect(result.status).toBe(0);
		expect(result.output).toContain('shard 1/2 ran 51 s of its 100 s under a whole-file slot hold (51%, ceiling 50%)');
		expect(checkWith(serial, { changed: ['scripts/ci/heavy-tests.json'] }).status).toBe(1);
	});

	test('reads which files hold a slot and whether one is held for a whole file', () => {
		const dir = mkdtempSync(join(tmpdir(), 'unit-budget-slots-'));
		scratch.push(dir);
		mkdirSync(join(dir, '0'));
		writeFileSync(join(dir, '0', 'pid'), '20');
		writeFileSync(join(dir, '0', 'held'), 'file');
		mkdirSync(join(dir, '1'));
		const fileOf = new Map([
			[10, 'packages/a/test/a.test.ts'],
			[20, 'packages/b/test/b.test.ts'],
		]);
		const reading = readSlots(dir, fileOf);
		expect([...reading.holding]).toEqual(['packages/b/test/b.test.ts']);
		expect(reading.wholeFile).toBe(true);
		expect(readSlots(join(dir, 'missing'), fileOf)).toEqual({ holding: new Set(), wholeFile: false });
	});

	test('a file that held a slot at either read of a sample is not charged with memory outside it', () => {
		const state = { filePeaks: new Map(), unslottedPeaks: new Map(), wholeFileHeldSamples: 0 };
		const groups = [
			{ file: 'packages/a/test/build.test.ts', mb: 1500, parts: {} },
			{ file: 'packages/b/test/sweep.test.ts', mb: 1200, parts: {} },
			{ file: '(no test file: vitest main process, pnpm, the wrapper)', mb: 900, parts: {} },
		];
		const none = { holding: new Set<string>(), wholeFile: false };
		recordSample(state, groups, { holding: new Set(['packages/a/test/build.test.ts']), wholeFile: false }, none);
		recordSample(state, groups, none, { holding: new Set(), wholeFile: true });
		expect(state.filePeaks.get('packages/a/test/build.test.ts')).toBe(1500);
		expect([...state.unslottedPeaks]).toEqual([
			['packages/b/test/sweep.test.ts', 1200],
			['packages/a/test/build.test.ts', 1500],
		]);
		expect(state.wholeFileHeldSamples).toBe(1);
	});

	test('the setup file holds the slot for files under inWorkerBuilds and slotHolders', () => {
		const manifest = {
			inWorkerBuilds: { scope: [], tests: [{ test: 'a.test.ts', why: '' }] },
			slotHolders: { why: '', tests: [{ test: 'b.test.ts', peakMb: 2000, run: '1', why: '' }] },
		};
		expect(holdsSlotForFile(manifest, 'a.test.ts')).toBe(true);
		expect(holdsSlotForFile(manifest, 'b.test.ts')).toBe(true);
		expect(holdsSlotForFile(manifest, 'c.test.ts')).toBe(false);
	});
});
