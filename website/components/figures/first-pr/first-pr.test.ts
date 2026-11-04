import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as steps from './steps.ts';

describe('first pull request figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(steps.drawing())).toBe(JSON.stringify(steps.drawing()));
	});

	it('is frozen', async () => {
		await expect(frozen('steps.ts', 'first-pr.test.ts', steps.drawing())).toMatchFileSnapshot('./steps.art.ts');
	});

	it('numbers the six steps and names the three required checks', () => {
		const texts = steps.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		expect(texts.filter((t) => /^[1-6]$/.test(t))).toEqual(['1', '2', '3', '4', '5', '6']);
		for (const check of steps.REQUIRED) expect(texts).toContain(check);
	});
});
