import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as statute_book from './statute-book.ts';
import * as stamp from './stamp.ts';

const figures = { 'statute-book': statute_book, 'stamp': stamp };

describe('specs-rules figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'specs-rules.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}
});
