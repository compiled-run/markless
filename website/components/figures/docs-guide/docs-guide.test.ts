import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as galley from './galley.ts';
import * as composing_stick from './composing-stick.ts';

const figures = { 'galley': galley, 'composing-stick': composing_stick };

describe('docs-guide figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'docs-guide.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}
});
