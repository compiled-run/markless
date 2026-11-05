import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COAT, COAT_TOUR, describeHand, describeStand, fetched, flip, HANDLE } from './model.ts';
import { drawing } from './coat-check.ts';

const coatArt = drawing();

const page = readFileSync(new URL('../../../pages/build/elements.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./coat-anatomy.tsrx', import.meta.url), 'utf8');

describe('the ticket and the coat', () => {
	it('hands back the coat when it is on the stand, and undefined when it is not', () => {
		expect(HANDLE).toBe('field');
		expect(COAT).toBe('<input>');
		expect(fetched(true)).toBe('<input>');
		expect(fetched(false)).toBe('undefined');
		expect(describeHand(true)).toContain('the real <input>');
		expect(describeHand(false)).toContain('came back undefined');
		expect(describeStand(false)).toContain('still exists');
		expect(COAT_TOUR[0]).toBe('hand');
		expect(flip('odd')).toBe('even');
	});

	it('draws two objects, and keeps the words to code names and values', () => {
		expect(piece.match(/role="button"/g)).toHaveLength(2);
		const svg = piece.slice(piece.indexOf('<svg'), piece.indexOf('</svg>'));
		const words = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim()).filter(Boolean);
		expect(words).toEqual(['7', '{HANDLE}', '{value}', '{COAT}', 'undefined']);
	});

	it('is a toy: hover, press, keys and a drag, and the empty-hook surprise', () => {
		expect(piece).toContain('.ticket:hover');
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'ArrowRight'");
		expect(piece).toContain('onClick={toggleCoat}');
		expect(piece).toContain('--sway');
	});

	it('uses no wires, cords or parcels, and no arms or rows', () => {
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile/i);
		expect(piece).not.toMatch(/@for|@if/);
	});

	it('has no motion under reduced motion, a tour that stops on touch, Escape and a live region', () => {
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(coatArt.ticket.ink.length).toBeGreaterThan(300);
		expect(coatArt.coat.ink.length).toBeGreaterThan(300);
		expect(coatArt.stand.plankInk.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(coatArt));
	});

	it('is on the Elements page under its own heading', () => {
		expect(page).toContain("import CoatAnatomy from '../../components/figures/coat-check/coat-anatomy.tsrx';");
		expect(page.indexOf('## A handle is a ticket')).toBeLessThan(page.indexOf('<CoatAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by coat-check.test.ts from coat-check.ts. Refresh with the figure test's -u flag.
import type { drawing } from './coat-check.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(coatArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./coat-check.art.ts');
	});
});
