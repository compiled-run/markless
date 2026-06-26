import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

const workflowPath = join(process.cwd(), '.github/workflows/ci.yml');

describe('CI benchmark workflow', () => {
	test('uses one current Arcade JSFB fixture for baseline and current revisions', async () => {
		const workflow = await readFile(workflowPath, 'utf8');
		const find = (marker: string, start = 0) => {
			const index = workflow.indexOf(marker, start);
			expect(index, marker).toBeGreaterThanOrEqual(0);
			return index;
		};

		expect(workflow.match(/pnpm bench:jsfb:prepare/g) ?? []).toHaveLength(1);

		const fixtureInstall = find('- name: Install Arcade benchmark fixture');
		const fixturePrepare = find(
			'run: pnpm bench:jsfb:prepare -- --jsfb-root "$JSFB_ROOT"',
			fixtureInstall,
		);
		expect(fixturePrepare).toBeLessThan(find('- name: Validate baseline Arcade benchmark fixture'));
		expect(fixturePrepare).toBeLessThan(
			find('- name: Validate current Arcade benchmark fixture'),
		);
		expect(workflow).not.toContain('- name: Install baseline Arcade benchmark fixture');
		expect(workflow).not.toContain('- name: Install current Arcade benchmark fixture');
	});
});
