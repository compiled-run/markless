import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as glasses from './glasses.ts';
import * as tsconfig from './tsconfig.ts';

const figures = { glasses, tsconfig };

describe('editor setup figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'editor-setup.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('colours only what the extension lens covers, and shows the plugin marks under the other', () => {
		const texts = glasses.drawing().layers.flatMap((l) => l.texts);
		expect(texts.some((t) => t.cls.includes('tint-'))).toBe(true);
		for (const s of glasses.SUGGESTED) expect(texts.map((t) => t.text)).toContain(s);
		const paths = glasses.drawing().layers.flatMap((l) => l.paths);
		expect(paths.filter((p) => p.cls.includes('squiggle'))).toHaveLength(1);
	});

	it('rings every Markless line of tsconfig.json once', () => {
		const texts = tsconfig.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		for (const mark of tsconfig.MARKS) expect(texts).toContain(mark.says);
	});
});
