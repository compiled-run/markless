import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeLaundry, FILES, flip, LAUNDRY_TOUR } from './laundry-model.ts';
import { drawing } from './laundry.ts';

const laundryArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/styling.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./laundry-anatomy.tsrx', import.meta.url), 'utf8');

describe('the shirts and the dye bath', () => {
	it('dyes only the shirt whose tape matches the bath, and says so', () => {
		expect(FILES).toEqual(['paper-card.tsrx', 'chalk-card.tsrx']);
		expect(describeLaundry(false)).toBe('Two white shirts, both labelled card, each with its own name tape.');
		expect(LAUNDRY_TOUR[0]).toBe('dye');
		expect(flip('odd')).toBe('even');
	});

	it('has exactly one dyed layer, on the first shirt', () => {
		expect(piece.match(/class="dyed"/g)).toHaveLength(1);
		expect(piece.indexOf('class="dyed"')).toBeLessThan(piece.indexOf('art.shirts[1]'));
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
		expect(laundryArt.shirts).toHaveLength(2);
		expect(laundryArt.tub.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(laundryArt));
	});

	it('is on the Styling page under its own heading', () => {
		expect(page).toContain("import LaundryAnatomy from '../../components/figures/styling/laundry-anatomy.tsrx';");
		expect(page.indexOf('## Same label, different tape')).toBeLessThan(page.indexOf('<LaundryAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by laundry.test.ts from laundry.ts. Run the figure tests with -u to refresh.
import type { drawing } from './laundry.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(laundryArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./laundry.art.ts');
	});
});
