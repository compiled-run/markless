import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_X, clampLane, describeCard, describeRace, lands, START, travelMs } from './postcards-model.ts';
import { drawing, NAME_RIGHT, POSTMARK_LEFT } from './postcards.ts';

const raceArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/async.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./postcards-anatomy.tsrx', import.meta.url), 'utf8');

describe('the postcard race', () => {
	it('pins a card only when nothing sent after it has landed', () => {
		expect(lands('boston', -1)).toBe(true);
		expect(lands('denver', 1)).toBe(true);
		expect(lands('boston', 2)).toBe(false);
		expect(lands('denver', 0)).toBe(true);
	});

	it('starts Denver nearer the board, and prices each card by its distance', () => {
		expect(START.denver).toBeGreaterThan(START.boston);
		expect(travelMs(START.denver)).toBeLessThan(travelMs(START.boston));
		expect(travelMs(BOARD_X)).toBe(0);
		expect(clampLane(-50)).toBe(36);
		expect(clampLane(900)).toBe(420);
		expect(describeCard('boston', START.boston)).toBe('Boston: sent first, 2.4 s away');
		expect(describeRace('denver', ['boston', 'austin'])).toBe("Denver is on the board. Boston and Austin were dropped: only the latest request's answer is shown.");
	});

	it('lets the reader drag, use the keyboard and press Post both, and speaks the result', () => {
		expect(piece).toContain('onPointerDown');
		expect(piece).toContain("event.key === 'ArrowRight' ? 30 : -30");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('Post both');
		expect(piece).toContain('if (lands(');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
		expect(piece).toContain('class="caption"');
	});

	it('draws the same scene every time, with the postmark clear of the city name and a labelled post slot', () => {
		expect(Object.keys(raceArt.cards)).toEqual(['austin', 'boston', 'denver']);
		expect(POSTMARK_LEFT).toBeGreaterThan(NAME_RIGHT + 10);
		expect(piece).toContain('post slot');
		expect(raceArt.lane.slot.plate.length).toBeGreaterThan(50);
		expect(raceArt.board.cork.length).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(raceArt));
	});

	it('is on the Async page under the old-answer section', () => {
		expect(page).toContain("import PostcardsAnatomy from '../../components/figures/async/postcards-anatomy.tsrx';");
		expect(page.indexOf('## The old answer stays until the new one is ready')).toBeLessThan(page.indexOf('<PostcardsAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by postcards.test.ts from postcards.ts. Run the figure tests with -u to refresh.
import type { drawing } from './postcards.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(raceArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./postcards.art.ts');
	});
});
