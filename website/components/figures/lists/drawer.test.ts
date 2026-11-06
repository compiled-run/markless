import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARDS, describeFilter, placeOf, shownOf } from './drawer-model.ts';
import { drawing } from './drawer.ts';

const drawerArt = drawing();
const piece = readFileSync(new URL('./drawer-anatomy.tsrx', import.meta.url), 'utf8');

describe('a card drawer filtered by its label', () => {
	it('keeps matching cards in their order and sinks the rest', () => {
		expect(shownOf('em').map((card) => card.id)).toEqual(['emma', 'middlemarch']);
		expect(shownOf('').length).toBe(CARDS.length);
		expect(placeOf('em', 'emma')).toBe('transform: translate(0px, 0px)');
		expect(placeOf('em', 'middlemarch')).toBe('transform: translate(5px, -30px)');
		expect(placeOf('em', 'dune')).toBe('transform: translate(0px, 150px)');
		expect(describeFilter('zz')).toContain('@empty');
	});

	it('filters through a real text box, with a live sentence', () => {
		expect(piece).toContain('class="label"');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws six cards and the drawer front, the same every time', () => {
		expect(drawerArt.cards).toHaveLength(6);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(drawerArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by drawer.test.ts from drawer.ts. Run the figure tests with -u to refresh.
import type { drawing } from './drawer.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(drawerArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./drawer.art.ts');
	});
});
