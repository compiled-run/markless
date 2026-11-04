import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as allow from './allow.ts';
import * as readError from './read-error.ts';

const figures = { 'read-error': readError, allow };

describe('diagnostics figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'diagnostics.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('numbers the four lines of the error', () => {
		const texts = readError.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		expect(texts.filter((t) => /^[1-4]$/.test(t))).toEqual(['1', '2', '3', '4']);
		expect(texts).toContain('; key item');
	});
});
