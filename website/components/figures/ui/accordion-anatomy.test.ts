import { describe, expect, it } from 'vitest';
import { drawing } from './accordion-anatomy.ts';

const drawn = drawing();

describe('accordion anatomy', () => {
	it('labels each part once in the wide drawing', () => {
		const words = drawn.wide.texts.map((t) => t.text);
		for (const part of ['root', 'item', 'itemlabel', 'itemtrigger', 'itemcontent']) expect(words.filter((w) => w === 'accordion.' + part)).toHaveLength(1);
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
