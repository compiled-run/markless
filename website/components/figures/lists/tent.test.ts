import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_W, describeOrder, FIRST, reverse, slotAt, swap, toggle } from './tent-model.ts';
import { drawing } from './tent.ts';

const tentArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/lists.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./tent-anatomy.tsrx', import.meta.url), 'utf8');

describe('three keyed name cards', () => {
	it('reverses, swaps and ticks by guest, not by slot', () => {
		expect(reverse(FIRST)).toEqual(['ada', 'linus', 'grace']);
		expect(swap(FIRST, 0, 2)).toEqual(['ada', 'linus', 'grace']);
		expect(toggle(['linus'], 'linus')).toEqual([]);
		expect(slotAt(tentArt.slots[2]! + 10, tentArt.slots, CARD_W)).toBe(2);
		expect(describeOrder(reverse(FIRST), ['grace'])).toBe('The cards now read Ada, Linus, Grace (ticked). Each tick moved with its card; the slots stayed put.');
	});

	it('keeps each tick on its own card; the slot numbers never move', () => {
		for (const id of ['grace', 'linus', 'ada']) expect(piece).toContain(`ticked.includes('${id}') ? 'tick on' : 'tick'`);
		const slots = piece.slice(piece.indexOf('class="slot"') - 10, piece.lastIndexOf('class="slot"') + 80);
		expect(slots).not.toMatch(/style=/);
		expect(piece).not.toMatch(/class="cord"|art\.wires/);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same cards every time', () => {
		expect(tentArt.cards).toHaveLength(3);
		expect(tentArt.cards[0]!.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(tentArt));
	});

	it('is on the Lists page under its own heading', () => {
		expect(page).toContain("import TentAnatomy from '../../components/figures/lists/tent-anatomy.tsrx';");
		expect(page.indexOf('## Reverse the cards')).toBeLessThan(page.indexOf('<TentAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by tent.test.ts from tent.ts. Run the figure tests with -u to refresh.
import type { drawing } from './tent.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(tentArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./tent.art.ts');
	});
});
