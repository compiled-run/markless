import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legal, nearestSquare, noteOf, PIECES, placeOf, serverMove, sheetLines, START, stepped } from './model.ts';
import { drawing, squareCentre } from './board.ts';

const boardArt = drawing();

const page = readFileSync(new URL('../../../pages/how-it-works/resuming.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./resume-anatomy.tsrx', import.meta.url), 'utf8');

describe('the chess toy', () => {
	it('keeps the board to three pieces, each on its own square', () => {
		expect(new Set(PIECES.map((p) => p.square)).size).toBe(3);
		expect(squareCentre('a8')).toEqual([0.75, 0.75]);
		expect(Object.keys(boardArt.squares)).toHaveLength(64);
	});

	it("plays the server's next move with the knight, and only the knight", () => {
		expect(serverMove(START)).toBe('g5');
		expect(serverMove({ ...START, wn: 'g5' })).not.toBe('');
		expect(noteOf('wn', 'g5')).toBe('Ng5');
		expect(noteOf('wp', 'e5')).toBe('e5');
	});

	it('plays legal moves and refuses illegal ones, so a dropped piece slides back', () => {
		expect(legal(START, 'wn', 'g5')).toBe(true);
		expect(legal(START, 'wn', 'f4')).toBe(false);
		expect(legal(START, 'wp', 'e5')).toBe(true);
		expect(legal(START, 'wp', 'e6')).toBe(false);
		expect(legal(START, 'bk', 'h8')).toBe(true);
		expect(legal(START, 'bk', 'g6')).toBe(false);
		expect(legal(START, 'wn', 'e4')).toBe(false);
		expect(stepped('h8', 'ArrowRight')).toBe('');
	});

	it('finds the square under a dropped piece and writes newest moves first', () => {
		const [x, y] = boardArt.squares.g5!;
		expect(nearestSquare(boardArt.squares, x + 2, y - 1)).toBe('g5');
		expect(placeOf(boardArt.squares, 'wn', 'f3', 0, 0)).toBe('transform:translate(0px,0px)');
		expect(sheetLines(['Ng5', 'Kh8'], 3)).toEqual(['2. Kh8', '1. Ng5', '']);
	});

	it('answers hover, drag and keys, keeps one margin note, and draws the same scene every time', () => {
		expect(piece).toContain('onPointerenter');
		expect(piece).toContain('onPointerdown');
		expect(piece).toContain("event.key === 'ArrowUp'");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece.match(/class="hand"/g)).toHaveLength(1);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(boardArt));
	});

	it('opens the Resuming page, before its first section', () => {
		expect(page).toContain("import ResumeAnatomy from '../../components/figures/resuming/resume-anatomy.tsrx';");
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
