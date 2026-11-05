import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeSeats, FIRST, flip, nextOrder, seatOf, SEATS_TOUR, SORTED } from './seats-model.ts';
import { drawing } from './seats.ts';

const seatsArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/lists.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./seats-anatomy.tsrx', import.meta.url), 'utf8');

describe('the place cards', () => {
	it('moves every guest to a new seat and names the new order', () => {
		expect(nextOrder(FIRST)).toEqual(SORTED);
		expect(nextOrder(SORTED)).toEqual(FIRST);
		expect(seatOf(SORTED, 'ada')).toBe(0);
		expect(describeSeats(SORTED, true)).toBe('The rows moved into a new order: Ada, Grace, Linus. Each card took its own tick with it, and no row was built again.');
		expect(SEATS_TOUR[0]).toBe('sort');
		expect(flip('odd')).toBe('even');
	});

	it('draws each card once and moves it with its tick; the seat numbers never move', () => {
		expect(piece.match(/<g class="seat" style=/g)).toHaveLength(3);
		const numbers = piece.slice(piece.indexOf('class="seat-number"') - 10, piece.lastIndexOf('class="seat-number"') + 80);
		expect(numbers).not.toMatch(/style=/);
		expect(piece).not.toMatch(/class="cord"|art\.wires/);
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(seatsArt.cards).toHaveLength(3);
		expect(seatsArt.cards[0]!.ink.length).toBeGreaterThan(200);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(seatsArt));
	});

	it('is on the Lists page under its own heading', () => {
		expect(page).toContain("import SeatsAnatomy from '../../components/figures/lists/seats-anatomy.tsrx';");
		expect(page.indexOf('## Watch the cards change seats')).toBeLessThan(page.indexOf('<SeatsAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by seats.test.ts from seats.ts. Run the figure tests with -u to refresh.
import type { drawing } from './seats.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(seatsArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./seats.art.ts');
	});
});
