import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD, describeOffice, dial, flip, OFFICE_TOUR, READER, WRITER } from './model.ts';
import { drawing } from './whiteboard.ts';

const officeArt = drawing();

const page = readFileSync(new URL('../../../pages/build/shared.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./whiteboard-anatomy.tsrx', import.meta.url), 'utf8');

describe('one board, two desks', () => {
	it('writes from one desk and the other reads the same board', () => {
		expect(describeOffice(2)).toBe(`${WRITER} wrote 2 on the ${BOARD} board. ${READER} reads the same board, so it sees 2 too.`);
		expect(describeOffice(0)).toBe('');
		expect(dial(9, 1)).toBe(0);
		expect(dial(0, -1)).toBe(9);
		expect(OFFICE_TOUR[0]).toBe('write');
		expect(flip('odd')).toBe('even');
	});

	it('draws one board and two desks, and only the board shows a number', () => {
		expect(officeArt.desks).toHaveLength(2);
		expect(piece.match(/class="number"/g)).toHaveLength(1);
		expect(piece).not.toMatch(/pen\b/);
	});

	it('every object is a toy: focusable, the desks show their sightline, the board turns like a dial', () => {
		expect(piece.match(/class="toy/g)).toHaveLength(3);
		expect(piece.match(/tabindex="0"/g)).toHaveLength(3);
		expect(piece).toContain('setPointerCapture(event.pointerId)');
		expect(piece).toContain('onPointerenter');
		expect(piece).toMatch(/\.toy:hover,\s*\.toy:focus-visible \{\s*transform: translateY\(-4px\);/);
	});

	it('keeps the words in the drawing to about five, with no margin note', () => {
		const svg = piece.slice(piece.indexOf('<svg'), piece.indexOf('</svg>'));
		expect(svg.match(/<text /g)!.length).toBeLessThanOrEqual(5);
		expect(piece).not.toMatch(/class="hand/);
	});

	it('uses no wires, cords, jars or parcels', () => {
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|jar/i);
	});

	it('keeps interactions under reduced motion, with a tour that stops on touch', () => {
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/@for|@if/);
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(officeArt.board.ink.length).toBeGreaterThan(300);
		expect(officeArt.desks[0].ink.length).toBeGreaterThan(200);
		expect(officeArt.desks[1].sight.length).toBeGreaterThan(50);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(officeArt));
	});

	it('is on the Shared page under its own heading', () => {
		expect(page).toContain("import WhiteboardAnatomy from '../../components/figures/whiteboard/whiteboard-anatomy.tsrx';");
		expect(page.indexOf('## One board, every desk reads it')).toBeLessThan(page.indexOf('<WhiteboardAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by whiteboard.test.ts from whiteboard.ts. Refresh with the figure test's -u flag.
import type { drawing } from './whiteboard.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(officeArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./whiteboard.art.ts');
	});
});
