import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as home_run from './home-run.ts';
import * as sort_steps from './sort-steps.ts';
import * as merge_queue from './merge-queue.ts';

const figures = { 'home-run': home_run, 'sort-steps': sort_steps, 'merge-queue': merge_queue };

describe('ci figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'ci.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('ticks the four fast jobs and the three required checks', () => {
		expect(home_run.SUMMARY.filter((row) => row.includes('passed'))).toHaveLength(4);
		expect(merge_queue.REQUIRED).toEqual(['test', 'typecheck', 'agent-files']);
	});
});
