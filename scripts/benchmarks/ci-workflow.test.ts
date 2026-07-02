import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

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
});
