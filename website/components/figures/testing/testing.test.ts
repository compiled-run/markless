import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as marionette from './marionette.ts';

const figures = { marionette };

describe('testing figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'testing.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('presses both pages to Count 1, one per way in', () => {
		const texts = marionette.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		expect(texts.filter((t) => t === '1')).toHaveLength(2);
		for (const way of marionette.WAYS) expect(texts).toContain(way.call);
	});
});
