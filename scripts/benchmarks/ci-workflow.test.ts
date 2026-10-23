import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

const workflowPath = join(process.cwd(), '.github/workflows/ci.yml');

describe('CI benchmark workflow', () => {
	test('uses one current Markless JSFB fixture for baseline and current revisions', async () => {
		const workflow = await readFile(workflowPath, 'utf8');
		const find = (marker: string, start = 0) => {
			const index = workflow.indexOf(marker, start);
			expect(index, marker).toBeGreaterThanOrEqual(0);
			return index;
		};

		expect(workflow.match(/pnpm bench:jsfb:prepare/g) ?? []).toHaveLength(1);

		const fixtureInstall = find('- name: Install Markless benchmark fixture');
		const fixturePrepare = find(
			'run: pnpm bench:jsfb:prepare -- --jsfb-root "$JSFB_ROOT"',
			fixtureInstall,
		);
		const pairedRun = find('- name: Run interleaved baseline/current benchmark pairs');
		expect(fixturePrepare).toBeLessThan(pairedRun);
		// The shared fixture is rebuilt per side from that side's revision root,
		// and baseline/current pairs run back-to-back per benchmark so the guard
		// compares results from the same runner-speed window.
		find('MARKLESS_REPO_ROOT="$repo_root" node --input-type=module', pairedRun);
		find('run_side baseline "$bench" "$MARKLESS_BASE_REPO_ROOT"', pairedRun);
		find('run_side current "$bench" "$MARKLESS_REPO_ROOT"', pairedRun);
		expect(workflow).not.toContain('- name: Install baseline Markless benchmark fixture');
		expect(workflow).not.toContain('- name: Install current Markless benchmark fixture');
	});

	test('timing is skipped, and the guard passes, only when every shard built an app byte-identical to the baseline', async () => {
		const workflow = parse(await readFile(workflowPath, 'utf8')) as {
			jobs: Record<
				string,
				{
					steps: Array<{
						name?: string;
						id?: string;
						if?: string;
						run?: string;
						with?: Record<string, string>;
					}>;
				}
			>;
		};
		const { benchmark, 'benchmark-guard': guard } = workflow.jobs;
		const names = benchmark!.steps.map((step) => step.name);
		const compare = benchmark!.steps.find((step) => step.id === 'bundle')!;
		expect(names.indexOf(compare.name)).toBeGreaterThan(
			names.indexOf('Install Markless benchmark fixture'),
		);
		expect(compare.run).toContain('digest "$MARKLESS_BASE_REPO_ROOT"');
		expect(compare.run).toContain('digest "$MARKLESS_REPO_ROOT"');
		expect(compare.run).toContain('jsfb-bundle-digest.mjs" compare');
		for (const timed of [
			'Start JS Framework Benchmark server',
			'Run interleaved baseline/current benchmark pairs',
		]) {
			const step = benchmark!.steps.find((candidate) => candidate.name === timed)!;
			expect(step.if).toBe("steps.bundle.outputs.identical != 'true'");
			expect(names.indexOf(timed)).toBeGreaterThan(names.indexOf(compare.name));
		}
		expect(
			benchmark!.steps.find((step) => step.name === 'Upload JSFB shard results')!.with!.path,
		).toContain('/markless-jsfb/bundle-*.txt');
		const verdict = guard!.steps.find((step) => step.id === 'bundle')!;
		expect(verdict.run).toContain("grep -q 'identical=false'");
		expect(verdict.run).toContain('exit 1');
		expect(
			guard!.steps.find((step) => step.name === 'Compare benchmark results against baseline')!
				.if,
		).toBe("steps.bundle.outputs.identical != 'true'");
	});

	test('a push to main benchmarks against the last main commit whose CI passed, the same base the skip decision used', async () => {
		const workflow = parse(await readFile(workflowPath, 'utf8')) as {
			jobs: Record<
				string,
				{
					outputs?: Record<string, string>;
					permissions?: Record<string, string>;
					steps: Array<{ name?: string; run?: string; env?: Record<string, string> }>;
				}
			>;
		};
		const { changes, benchmark } = workflow.jobs;
		const filter = changes!.steps.find(
			(step) => step.name === 'Decide whether benchmarks can be affected',
		)!.run!;
		expect(filter).toContain(
			'actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1',
		);
		expect(filter).toContain('git merge-base --is-ancestor "$base" HEAD');
		expect(filter).toContain('echo "base=$base" >> "$GITHUB_OUTPUT"');
		expect(changes!.outputs!.base).toBe('${{ steps.filter.outputs.base }}');
		expect(changes!.permissions).toEqual({ contents: 'read', actions: 'read' });
		const baseline = benchmark!.steps.find(
			(step) => step.name === 'Resolve benchmark baseline revision',
		)!;
		expect(baseline.env).toEqual({ BASE: '${{ needs.changes.outputs.base }}' });
		expect(baseline.run).toBe('echo "MARKLESS_BASE_SHA=$BASE" >> "$GITHUB_ENV"');
	});

	test('a merge-queue run benchmarks against the main commit the queued change goes on top of', async () => {
		const workflow = parse(await readFile(workflowPath, 'utf8')) as {
			on: Record<string, unknown>;
			jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>;
		};
		expect(Object.keys(workflow.on)).toContain('merge_group');
		const filter = workflow.jobs.changes!.steps.find(
			(step) => step.name === 'Decide whether benchmarks can be affected',
		)!.run!;
		expect(filter).toMatch(
			/"\$GITHUB_EVENT_NAME" = "merge_group" \]; then\n\s+base="\$\{\{ github\.event\.merge_group\.base_sha \}\}"/,
		);
	});
});
