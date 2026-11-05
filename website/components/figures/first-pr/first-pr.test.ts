import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as board from './board.ts';

describe('first pull request figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(board.drawing())).toBe(JSON.stringify(board.drawing()));
	});

	it('is frozen', async () => {
		await expect(frozen('board.ts', 'first-pr.test.ts', board.drawing())).toMatchFileSnapshot('./board.art.ts');
	});

	it('numbers the six steps and names the three required checks', () => {
		const texts = board.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		expect(texts.filter((t) => /^[1-6]$/.test(t))).toEqual(['1', '2', '3', '4', '5', '6']);
		for (const check of board.REQUIRED) expect(texts).toContain(check);
	});
});
