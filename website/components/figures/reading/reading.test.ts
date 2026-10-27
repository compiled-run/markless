import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, describeWire, dollars, flip, START, TOUR, totalOf } from './model.ts';
import { drawing as wireDrawing } from './wire.ts';

const wireArt = wireDrawing();

const page = readFileSync(new URL('../../../pages/start/reading-tsrx.mdx', import.meta.url), 'utf8');
const wirePiece = readFileSync(new URL('./wire-anatomy.tsrx', import.meta.url), 'utf8');

const between = (text: string, from: string, to: string) => {
	const start = text.indexOf(from);
	return text.slice(start, text.indexOf(to, start + from.length));
};

describe('the bags jar and the total box', () => {
	it('starts with three bags, adds one per press and works the total out from the count', () => {
		expect(START).toBe(3);
		expect(add(3)).toBe(4);
		expect(add(99)).toBe(0);
		expect(totalOf(3)).toBe(42);
		expect(dollars(4)).toBe('$56');
		expect(flip('rest')).toBe('odd');
		expect(flip('odd')).toBe('even');
	});

	it('wires three spots: two straight from the jar and one through the box, each crossed out at most once', () => {
		expect(wirePiece.match(/class="digit now/g)).toHaveLength(3);
		expect(wirePiece.match(/class="crossed/g)).toHaveLength(3);
		expect(wirePiece.match(/class="pulse to-page"/g)).toHaveLength(2);
		expect(wirePiece.match(/class="pulse to-box"/g)).toHaveLength(1);
		expect(wirePiece.match(/class="pulse to-total"/g)).toHaveLength(1);
	});

	it('keeps each live number in the same text run as its label', () => {
		expect(between(wirePiece, 'transform={art.page.rowMatrix}', '</g>')).toContain('In your cart:');
		expect(between(wirePiece, 'transform={art.page.totalMatrix}', '</g>')).toContain('Total:');
	});

	it('never wires the shop name, product or price', () => {
		const once = between(wirePiece, 'class="once"', '</g>');
		expect(once).toContain('{SHOP}');
		expect(once).toContain('{PRICE}');
		expect(once).not.toMatch(/\bbags\b|newest|beat/);
	});

	it('speaks one plain sentence per change and tours two presses before a reset', () => {
		expect(describeWire(4, true)).toBe('Added a bag. The cart badge and the cart line now show 4, and the total shows $56.');
		expect(describeWire(3, false)).toBe('The cart badge and the cart line now show 3, and the total shows $42.');
		expect(TOUR.filter((beat) => beat === 'add')).toHaveLength(2);
		expect(TOUR.at(-1)).toBe('reset');
	});

	it('inks every part fully', () => {
		expect(wireArt.sheet.ink.length).toBeGreaterThan(500);
		expect(wireArt.jar.glass.ink.length).toBeGreaterThan(500);
		expect(wireArt.box.ink.length).toBeGreaterThan(300);
		expect(wireArt.wires.toBox.length).toBeGreaterThan(wireArt.wires.intoBox.length);
		expect(wireArt.wires.fromBox.length).toBeGreaterThan(30);
		expect(wireArt.beans.length).toBeGreaterThanOrEqual(20);
	});
});

describe('the figure', () => {
	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		const piece = wirePiece;
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain('WIRED BEFORE THE PAGE RAN');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('is on the reading page under its own heading', () => {
		expect(page).toContain("import WireAnatomy from '../../components/figures/reading/wire-anatomy.tsrx';");
		expect(page.indexOf('### Follow the wire')).toBeLessThan(page.indexOf('<WireAnatomy />'));
	});

	it('draws the same scene every time', () => {
		expect(JSON.stringify(wireDrawing())).toBe(JSON.stringify(wireArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by reading.test.ts from wire.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './wire.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(wireArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./wire.art.ts');
	});
});
