import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as pegboard from './pegboard.ts';
import * as typecheck from './typecheck.ts';

const figures = { pegboard, typecheck };

describe('dev setup figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'dev-setup.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('hangs only scripts the root package.json has', () => {
		const { scripts } = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
		for (const name of pegboard.SCRIPTS) expect(Object.keys(scripts)).toContain(name);
	});

	it('keeps each terminal row inside the sheet', () => {
		for (const row of typecheck.OUTPUT) expect(row.length).toBeLessThanOrEqual(56);
	});
});
