import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as install from './install.ts';
import * as typecheck from './typecheck.ts';

const figures = { install, typecheck };

describe('dev setup figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'dev-setup.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('keeps each terminal row inside the sheet', () => {
		for (const row of [...install.COMMANDS, ...typecheck.OUTPUT]) expect(row.length).toBeLessThanOrEqual(56);
	});
});
