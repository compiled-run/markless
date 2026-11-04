import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as folders from './folders.ts';
import * as pipeline from './pipeline.ts';

const figures = { pipeline, folders };

describe('repo tour figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'repo-tour.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('names every package folder on the desk', () => {
		const texts = pipeline.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		for (const p of [...pipeline.COMPILE, ...pipeline.RENDER]) expect(texts).toContain(p.path);
	});
});
