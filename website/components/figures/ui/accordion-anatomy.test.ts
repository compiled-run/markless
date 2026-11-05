import { describe, expect, it } from 'vitest';
import { drawing } from './accordion-anatomy.ts';

const drawn = drawing();

describe('accordion anatomy', () => {
	it('draws one layer per part, back to front, each named only by its part', () => {
		expect(drawn.layers.map((l) => l.part)).toEqual(['root', 'item', 'itemlabel', 'itemcontent', 'itemtrigger']);
		for (const layer of drawn.layers) expect(layer.texts.filter((t) => t.cls === 'name').map((t) => t.text)).toEqual(['accordion.' + layer.part]);
	});

	it('shows no words at rest beyond the demo question', () => {
		expect(drawn.layers.flatMap((l) => l.texts).filter((t) => t.cls !== 'name').map((t) => t.text)).toEqual(['Do you ship overseas?']);
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
