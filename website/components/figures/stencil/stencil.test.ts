import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHILD, describePaint, flip, nextPaint, PAINTS, PROP, REFUSE, STENCIL_TOUR } from './model.ts';
import { drawing } from './stencil.ts';

const stencilArt = drawing();

const page = readFileSync(new URL('../../../pages/build/components.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./stencil-anatomy.tsrx', import.meta.url), 'utf8');

describe('the stencil and the paint', () => {
	it('cycles the paint and says the stencil was not cut again', () => {
		expect(PAINTS).toEqual(['yellow', 'sky', 'mint']);
		expect(nextPaint('yellow')).toBe('sky');
		expect(nextPaint('mint')).toBe('yellow');
		expect(nextPaint('yellow', -1)).toBe('mint');
		expect(describePaint('sky')).toBe(`bags is now sky. The letters show it at once, and ${CHILD} is the same card.`);
		expect(REFUSE).toContain('was cut once');
		expect(PROP).toBe('bags');
		expect(STENCIL_TOUR[0]).toBe('paint');
		expect(flip('odd')).toBe('even');
	});

	it('draws two objects, and the card reads no state', () => {
		const start = piece.indexOf('class="obj card once"');
		const card = piece.slice(start, piece.indexOf('</g>', start));
		expect(card).toContain('{CHILD}');
		expect(card).not.toMatch(/paint|beat/);
		expect(Object.keys(stencilArt)).toEqual(['width', 'height', 'pencil', 'card', 'pot']);
	});

	it('keeps the words in the drawing to a handful, with no margin note', () => {
		const svg = piece.slice(piece.indexOf('<svg'), piece.indexOf('</svg>'));
		const words = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim()).filter(Boolean);
		expect(words).toEqual(['{CHILD}', "{'{bags}'}", '{PROP}', '{label}']);
	});

	it('uses no wires, cords or parcels, and no arms or rows', () => {
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile/i);
		expect(piece).not.toMatch(/@for|@if/);
	});

	it('is a toy: each object takes hover, press, keys and a drag, and the card refuses to change', () => {
		expect(piece.match(/role="button"/g)).toHaveLength(2);
		expect(piece.match(/tabindex="0"/g)).toHaveLength(2);
		expect(piece).toContain('.obj:hover');
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain("event.key === 'ArrowDown'");
		expect(piece).toContain('onClick={refuse}');
	});

	it('has no motion under reduced motion, a tour that stops on touch, Escape and a live region', () => {
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(stencilArt.card.ink.length).toBeGreaterThan(300);
		expect(stencilArt.pot.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(stencilArt));
	});

	it('is on the Components page under its own heading', () => {
		expect(page).toContain("import StencilAnatomy from '../../components/figures/stencil/stencil-anatomy.tsrx';");
		expect(page.indexOf('## A child is cut once')).toBeLessThan(page.indexOf('<StencilAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by stencil.test.ts from stencil.ts. Refresh with the figure test's -u flag.
import type { drawing } from './stencil.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(stencilArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./stencil.art.ts');
	});
});
