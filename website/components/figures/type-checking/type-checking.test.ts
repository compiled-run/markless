import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as tracing from './tracing.ts';
import * as whereItRuns from './where-it-runs.ts';

const figures = { tracing, 'where-it-runs': whereItRuns };

describe('type checking figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'type-checking.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('marks the copy in red and lands the mark on line 4, column 7 of the file', () => {
		const art = tracing.drawing();
		const texts = art.layers.flatMap((l) => l.texts.map((t) => t.text));
		expect(texts).toContain('TS2322');
		expect(texts).toContain('LINE 4, COLUMN 7');
		expect(art.layers.flatMap((l) => l.paths).filter((p) => p.cls.includes('squiggle')).length).toBe(3);
	});
});
