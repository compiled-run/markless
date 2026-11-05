import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOKMARK_TOUR, describeReload, flip, KEPT, PLAIN, START, turn } from './model.ts';
import { drawing } from './bookmark.ts';

const bookmarkArt = drawing();

const page = readFileSync(new URL('../../../pages/build/storage.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./bookmark-anatomy.tsrx', import.meta.url), 'utf8');

describe('two notebooks, one ribbon', () => {
	it('reopens storage at its page and state at page 1, unless the ribbon is out', () => {
		expect(describeReload(START, 1, true)).toBe(`Reloaded. The ${KEPT} notebook kept its ribbon and opened at page ${START}. The ${PLAIN} notebook opened at page 1.`);
		expect(describeReload(1, 1, false)).toContain('Both notebooks opened at page 1');
		expect(turn(7, 1)).toBe(8);
		expect(turn(1, -1)).toBe(1);
		expect(turn(99, 1)).toBe(99);
		expect(BOOKMARK_TOUR[0]).toBe('reload');
		expect(flip('odd')).toBe('even');
	});

	it('the reload resets state, and resets storage only without its ribbon', () => {
		expect(piece).toContain('plain = 1;');
		expect(piece).toContain('if (!keep) kept = 1;');
	});

	it('every object is a toy: focusable, pressable, and the ribbon drags', () => {
		expect(piece.match(/class="toy /g)).toHaveLength(4);
		expect(piece.match(/tabindex="0"/g)).toHaveLength(4);
		expect(piece).toContain('setPointerCapture(event.pointerId)');
		expect(piece).toContain("event.key === 'ArrowRight'");
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
		expect(piece).toContain('if (calm()) settle();');
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/@for|@if/);
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(bookmarkArt.ribbon.ink.length).toBeGreaterThan(200);
		expect(bookmarkArt.reload.ink.length).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(bookmarkArt));
	});

	it('is on the Storage page under its own heading', () => {
		expect(page).toContain("import BookmarkAnatomy from '../../components/figures/bookmark/bookmark-anatomy.tsrx';");
		expect(page.indexOf('## A reload keeps your place')).toBeLessThan(page.indexOf('<BookmarkAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by bookmark.test.ts from bookmark.ts. Refresh with the figure test's -u flag.
import type { drawing } from './bookmark.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(bookmarkArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./bookmark.art.ts');
	});
});
