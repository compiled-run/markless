import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD, CATALOGUE_TOUR, describeCatalogue, onCard, PARAM, SLIP } from './model.ts';
import { drawing } from './catalogue.ts';

const catalogueArt = drawing();

const page = readFileSync(new URL('../../../pages/router/pages.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./catalogue-anatomy.tsrx', import.meta.url), 'utf8');

describe('the slip and the card', () => {
	it('fills the card blank from the address, and empties it when the slip is off', () => {
		expect(CARD).toBe('blog/[slug]');
		expect(SLIP).toBe('/blog/' + PARAM);
		expect(describeCatalogue(true)).toContain('hello is pencilled into its blank');
		expect(describeCatalogue(false)).toContain('Only an address fills it');
		expect(CATALOGUE_TOUR).toEqual(['lift', 'drop', 'rest']);
	});

	it('knows when a dropped slip lands on the card', () => {
		const { box } = catalogueArt.card;
		expect(onCard(box, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)).toBe(true);
		expect(onCard(box, box.x1 + 10, box.y0)).toBe(false);
	});

	it('draws two objects and only code values as words', () => {
		expect(Object.keys(catalogueArt)).toEqual(['width', 'height', 'desk', 'card', 'slip', 'pencil']);
		expect(piece.match(/<text /g)).toHaveLength(3);
		expect(piece).toContain('{CARD}');
		expect(piece).toContain('{SLIP}');
		expect(piece).toContain('{PARAM}');
	});

	it('is a toy: hover, drag, keys and the rub-out surprise', () => {
		expect(piece).toContain('.slip:hover .lift');
		expect(piece).toContain('.card:hover .tilt');
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'ArrowDown'");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain("[data-placed='no'] .pencil-text");
	});

	it('uses no wires, cords, parcels or blocks, and keeps reduced motion and a live region', () => {
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile/i);
		expect(piece).not.toMatch(/@for|@if/);
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part and draws the same scene every time', () => {
		expect(catalogueArt.card.ink.length).toBeGreaterThan(300);
		expect(catalogueArt.slip.ink.length).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(catalogueArt));
	});

	it('is on the Pages page under its own heading', () => {
		expect(page).toContain("import CatalogueAnatomy from '../../components/figures/catalogue/catalogue-anatomy.tsrx';");
		expect(page.indexOf('## The file name is the address')).toBeLessThan(page.indexOf('<CatalogueAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by catalogue.test.ts from catalogue.ts. Refresh with the figure test's -u flag.
import type { drawing } from './catalogue.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(catalogueArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./catalogue.art.ts');
	});
});
