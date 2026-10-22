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
});
