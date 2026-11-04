import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as twoPieces from './two-pieces.ts';
import * as tsconfig from './tsconfig.ts';

const figures = { 'two-pieces': twoPieces, tsconfig };

describe('editor setup figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'editor-setup.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('rings every Markless line of tsconfig.json once', () => {
		const texts = tsconfig.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		for (const mark of tsconfig.MARKS) expect(texts).toContain(mark.says);
	});
});
