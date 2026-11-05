import { describe, expect, it } from 'vitest';
import { drawing } from './accordion-anatomy.ts';

const drawn = drawing();

describe('accordion anatomy', () => {
	it('keeps to two objects, and its words are only the demo value and aria-labelledby', () => {
		const words = drawn.texts.flatMap((t) => t.text.split(/\s+/));
		expect(words.length).toBeLessThanOrEqual(5);
		expect(drawn.texts.map((t) => t.text)).toEqual(['Do you ship overseas?', 'aria-labelledby']);
		expect(drawn.shapes.filter((s) => s.cls.split(' ')[0] === 'box')).toHaveLength(2);
	});

	it('draws the same every time', () => {
		expect(drawing()).toEqual(drawn);
	});

	it('matches the frozen art (run with -u after changing accordion-anatomy.ts)', async () => {
		const module = `// Written by accordion-anatomy.test.ts from accordion-anatomy.ts. Refresh with -u.
import type { drawing } from './accordion-anatomy.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(drawn, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./accordion-anatomy.art.ts');
	});
});
