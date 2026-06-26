import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

const workflowPath = join(process.cwd(), '.github/workflows/ci.yml');

describe('CI benchmark workflow', () => {
	test('prepares the Arcade JSFB fixture from the revision being validated', async () => {
		const workflow = await readFile(workflowPath, 'utf8');
		const find = (marker: string, start = 0) => {
			const index = workflow.indexOf(marker, start);
			expect(index, marker).toBeGreaterThanOrEqual(0);
			return index;
		};

		expect(workflow.match(/pnpm bench:jsfb:prepare/g) ?? []).toHaveLength(2);

		const baselineInstall = find('- name: Install baseline Arcade benchmark fixture');
		const baselinePrepare = find('run: pnpm bench:jsfb:prepare -- --jsfb-root "$JSFB_ROOT"', baselineInstall);
		expect(find('working-directory: ${{ env.ARCADE_BASE_REPO_ROOT }}', baselineInstall)).toBeLessThan(baselinePrepare);
		expect(baselinePrepare).toBeLessThan(find('- name: Validate baseline Arcade benchmark fixture'));

		const currentInstall = find(
			'- name: Install current Arcade benchmark fixture',
			find('- name: Run baseline Arcade JS Framework Benchmark'),
		);
		const currentPrepare = find('run: pnpm bench:jsfb:prepare -- --jsfb-root "$JSFB_ROOT"', currentInstall);
		expect(currentPrepare).toBeLessThan(find('- name: Validate current Arcade benchmark fixture'));
	});
});
