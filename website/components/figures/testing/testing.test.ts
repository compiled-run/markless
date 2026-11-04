import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as clickTest from './click-test.ts';
import * as twoWays from './two-ways.ts';

const figures = { 'click-test': clickTest, 'two-ways': twoWays };

describe('testing figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'testing.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('strikes Count 0 and inks Count 1 on the button', () => {
		const texts = clickTest.drawing().layers.flatMap((l) => l.texts);
		expect(texts.find((t) => t.text === '0' && t.cls.includes('big'))?.cls).toContain('gone');
		expect(texts.find((t) => t.text === '1' && t.cls.includes('big'))?.cls).toContain('show');
	});
});
