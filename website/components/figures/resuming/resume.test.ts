import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeResume, flip, MOVER, PIECES, RESUME_TOUR } from './model.ts';
import { drawing, squareCentre } from './board.ts';

const boardArt = drawing();

const page = readFileSync(new URL('../../../pages/how-it-works/resuming.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./resume-anatomy.tsrx', import.meta.url), 'utf8');

describe('chess by post', () => {
	it('sets up a legal-looking position with one piece on each square', () => {
		const squares = PIECES.map((p) => p.square);
		expect(new Set(squares).size).toBe(squares.length);
		expect(PIECES.filter((p) => p.kind === 'king')).toHaveLength(2);
		expect(squareCentre('a8')).toEqual([0.75, 0.75]);
		expect(squareCentre('h1')).toEqual([11.25, 11.25]);
	});

	it('moves exactly one piece and says the rest stayed put', () => {
		expect(boardArt.pieces.filter((p) => p.id === MOVER)).toHaveLength(1);
		expect(describeResume(true)).toContain('nobody replayed the game from move one');
		expect(describeResume(false)).toBe('The board arrived set up mid-game, with the score sheet beside it.');
		expect(flip('odd')).toBe('even');
		expect(RESUME_TOUR[0]).toBe('move');
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand"/g)).toHaveLength(1);
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/cord|crocodile|wire/);
	});

	it('inks every piece fully and draws the same scene every time', () => {
		expect(boardArt.pieces).toHaveLength(PIECES.length);
		for (const p of boardArt.pieces) expect(p.ink.length).toBeGreaterThan(200);
		expect(boardArt.board.dark.length).toBeGreaterThan(1000);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(boardArt));
	});

	it('opens the Resuming page, before its first section', () => {
		expect(page).toContain("import ResumeAnatomy from '../../components/figures/resuming/resume-anatomy.tsrx';");
		expect(page.indexOf('<Subtitle')).toBeLessThan(page.indexOf('<ResumeAnatomy />'));
		expect(page.indexOf('<ResumeAnatomy />')).toBeLessThan(page.indexOf('## '));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by resume.test.ts from board.ts. Run the figure test with -u to refresh.
import type { drawing } from './board.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(boardArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./board.art.ts');
	});
});
