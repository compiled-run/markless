import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as check_in from './check-in.ts';
import * as sort_steps from './sort-steps.ts';
import * as security_gate from './security-gate.ts';

const figures = { 'check-in': check_in, 'sort-steps': sort_steps, 'security-gate': security_gate };

describe('ci figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'ci.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}
});
