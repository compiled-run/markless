import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as copyCheck from './copy-check.ts';
import * as whereItRuns from './where-it-runs.ts';

const figures = { 'copy-check': copyCheck, 'where-it-runs': whereItRuns };

describe('type checking figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'type-checking.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('prints the error as the page quotes it', () => {
		expect(copyCheck.ERROR.join(' ')).toBe("app.tsrx(4,7): error TS2322: Type 'number' is not assignable to type 'string'.");
	});
});
