// Contract for a merge group skipping lanes a pull request passed: the key it looks up is computed from the
// merge group's own checkout, so a lane whose inputs changed on main since the pull request ran runs again.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { parse } from 'yaml';

type Step = {
	readonly id?: string;
	readonly name?: string;
	readonly uses?: string;
	readonly if?: string;
	readonly run?: string;
	readonly with?: Record<string, unknown>;
	readonly env?: Record<string, string>;
};
type Job = { readonly if?: string; readonly outputs?: Record<string, string>; readonly steps: readonly Step[] };

const workflow = parse(
	readFileSync(fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)), 'utf8'),
) as { readonly jobs: Record<string, Job> };
const lanes = workflow.jobs.lanes!;
const reuse = lanes.steps.find((step) => step.id === 'reuse')!;
const reusable = Object.keys(reuse.env!)
	.filter((key) => key.startsWith('KEY_'))
	.map((key) => key.slice('KEY_'.length).toLowerCase());

const REPO_ID = 1285731977;
const FORK_ID = 42;
const scratch = mkdtempSync(join(tmpdir(), 'lane-reuse-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// Runs the reuse step's script against a stand-in `gh` that answers the artifacts API from `artifacts`, with jq
// applying the step's own filter, and returns the step outputs it wrote.
function runReuse(
	keys: Record<string, string>,
	artifacts: Record<string, number[]>,
	apiDown = false,
): Record<string, string> {
	const dir = mkdtempSync(join(scratch, 'run-'));
	const fixture = join(dir, 'artifacts.json');
	writeFileSync(fixture, JSON.stringify(artifacts));
	const gh = join(dir, 'gh');
	writeFileSync(
		gh,
		[
			'#!/usr/bin/env bash',
			...(apiDown ? ['echo "HTTP 502" >&2; exit 1'] : []),
			'url="$2"; filter="$4"',
			'name="${url#*name=}"; name="${name%%&*}"',
			`node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]]??[];console.log(JSON.stringify({artifacts:a.map(id=>({expired:false,workflow_run:{head_repository_id:id}}))}))' "${fixture}" "$name" | jq "$filter"`,
		].join('\n'),
	);
	chmodSync(gh, 0o755);
	const output = join(dir, 'output');
	writeFileSync(output, '');
	const env: Record<string, string> = {
		PATH: `${dir}:${process.env.PATH}`,
		GITHUB_OUTPUT: output,
		GITHUB_REPOSITORY: 'compiled-run/markless',
		REPO_ID: String(REPO_ID),
		WORKFLOW_HASH: 'wf1',
	};
	for (const lane of reusable) env[`KEY_${lane.toUpperCase()}`] = keys[lane] ?? '';
	const result = spawnSync('bash', ['-e', '-c', reuse.run!], { env, encoding: 'utf8' });
	expect(result.status, result.stderr).toBe(0);
	return Object.fromEntries(
		readFileSync(output, 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((line) => line.split('=') as [string, string]),
	);
}

describe('a merge group reuses a lane only on the inputs the pull request passed', () => {
	test('runs only for merge groups, and on the checkout of the event, the merged tree', () => {
		expect(reuse.if).toBe("github.event_name == 'merge_group'");
		const checkout = lanes.steps.find((step) => step.uses?.startsWith('actions/checkout@'))!;
		expect(checkout.with?.ref).toBeUndefined();
		expect(checkout.with?.repository).toBeUndefined();
	});

	test('looks up the key each lane probe hashed on that checkout, and only for a probe that missed', () => {
		expect(reusable.length).toBeGreaterThan(0);
		for (const lane of reusable) {
			expect(reuse.env![`KEY_${lane.toUpperCase()}`]).toBe(
				`\${{ steps.${lane}.outputs.cache-hit != 'true' && steps.${lane}.outputs.cache-primary-key || '' }}`,
			);
			const probe = lanes.steps.find((step) => step.id === lane)!;
			expect(String(probe.with?.key)).toContain("hashFiles('ci-base-key.txt'");
			expect(lanes.outputs![`run_${lane}`]).toContain(`steps.reuse.outputs.${lane} != 'true'`);
		}
	});

	test('skips a lane whose key passed in a pull request run of this repository', () => {
		expect(runReuse({ unit: 'unit-k1' }, { 'lane-pass-unit-k1-wf1': [REPO_ID] })).toEqual({ unit: 'true' });
	});

	test('runs a lane when main changed one of its inputs after the pull request ran', () => {
		// The pull request passed `unit` on the tree whose key is k1; main then changed a file the unit key hashes,
		// so the merge group's probe computed k2 and nothing vouches for it.
		expect(runReuse({ unit: 'unit-k2' }, { 'lane-pass-unit-k1-wf1': [REPO_ID] })).toEqual({});
	});

	test('runs a lane a different workflow, or a fork, vouched for', () => {
		expect(runReuse({ unit: 'unit-k1' }, { 'lane-pass-unit-k1-wf0': [REPO_ID] })).toEqual({});
		expect(runReuse({ unit: 'unit-k1' }, { 'lane-pass-unit-k1-wf1': [FORK_ID] })).toEqual({});
	});

	test('runs a lane when the lookup itself fails', () => {
		const passed = { 'lane-pass-unit-k1-wf1': [REPO_ID] };
		expect(runReuse({ unit: 'unit-k1' }, passed, true)).toEqual({});
	});
});
