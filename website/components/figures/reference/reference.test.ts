import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as dolls from './dolls.ts';

const figures = { 'dolls': dolls };

describe('reference figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'reference.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}
});
