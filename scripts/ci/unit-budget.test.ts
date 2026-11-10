import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const script = resolve(import.meta.dirname, 'unit-budget.mjs');
const scratch: string[] = [];

afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Shard = {
	shard: string;
	cpuS: number;
	peakRssMb: number;
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
				version: 1,
				platform: 'linux-x64',
				cpuModel: 'test cpu',
				cpus: 4,
				sha: null,
				run: '42',
				command: [],
				exitCode: 0,
				wallS: 100,
				attempt: 1,
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
		expect(result.output).toContain('total CPU: 309 CPU-s against an anchor of 300 CPU-s (+3%');
		expect(result.status).toBe(0);
	});

	test('fails over budget when the summed CPU leaves the band upward', () => {
		const result = check(anchored, [
			{ shard: '1/2', cpuS: 120, peakRssMb: 2000 },
			{ shard: '2/2', cpuS: 200, peakRssMb: 1500 },
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain('over budget: total CPU 320 CPU-s');
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
		expect(result.output).toContain('stale anchor: total CPU 270 CPU-s');
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
