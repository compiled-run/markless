import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as citation from './citation.ts';
import * as permit from './permit.ts';

const figures = { 'citation': citation, 'permit': permit };

describe('diagnostics figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'diagnostics.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}
});
