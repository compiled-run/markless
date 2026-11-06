import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { after, legal, movesOf, nearestSquare, noteOf, PIECES, placeOf, type Position, reply, sheetLines, START, whiteToMove } from './model.ts';
import { drawing, squareCentre } from './board.ts';

const boardArt = drawing();

const page = readFileSync(new URL('../../../pages/how-it-works/resuming.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./resume-anatomy.tsrx', import.meta.url), 'utf8');
const sorted = (squares: string[]) => [...squares].sort();

describe('the move generator', () => {
	it('starts mid-game with ten pieces, each on its own square', () => {
		expect(PIECES).toHaveLength(10);
		expect(new Set(PIECES.map((p) => p.square)).size).toBe(10);
		expect(squareCentre('a8')).toEqual([0.75, 0.75]);
		expect(Object.keys(boardArt.squares)).toHaveLength(64);
		expect(Object.keys(boardArt.dots)).toHaveLength(64);
	});

	it('moves a knight in L shapes, onto empty squares or enemy pieces, never its own', () => {
		expect(sorted(movesOf(START, 'wn'))).toEqual(sorted(['d2', 'd4', 'e5', 'g5', 'h4', 'h2', 'e1']));
		expect(legal(START, 'wn', 'g1')).toBe(false);
		expect(legal(START, 'wn', 'e5')).toBe(true);
	});

	it('slides rooks and bishops until something blocks them, taking an enemy piece but not passing it', () => {
		expect(sorted(movesOf(START, 'wb'))).toEqual(sorted(['b5', 'a6', 'd5', 'e6', 'f7', 'b3', 'a2', 'd3', 'e2']));
		expect(sorted(movesOf(START, 'wr'))).toEqual(sorted(['e1', 'd1', 'c1', 'b1', 'a1', 'f2']));
		const open = after(START, 'wn', 'd4');
		expect(movesOf(open, 'wr')).toContain('f8');
		expect(movesOf(open, 'wr')).not.toContain('g8');
	});

	it('pushes pawns one square, two from home, and takes only diagonally', () => {
		expect(movesOf(START, 'wp')).toEqual([]);
		expect(sorted(movesOf({ wp: 'e2', bp: 'd3' }, 'wp'))).toEqual(sorted(['e3', 'e4', 'd3']));
		expect(movesOf({ wp: 'e2', bp: 'e3' }, 'wp')).toEqual([]);
		expect(sorted(movesOf({ bp: 'e7' }, 'bp'))).toEqual(sorted(['e6', 'e5']));
	});

	it('steps a king one square and never lets anything capture a king', () => {
		expect(sorted(movesOf(START, 'wk'))).toEqual(sorted(['f2', 'g2', 'h2', 'h1']));
		expect(movesOf({ wb: 'c4', bk: 'f7' } as Position, 'wb')).not.toContain('f7');
	});

	it('takes the captured piece off the board and writes the move the way a score sheet does', () => {
		const taken = after(START, 'wn', 'e5');
		expect(taken.bp).toBeUndefined();
		expect(taken.wn).toBe('e5');
		expect(noteOf(START, 'wn', 'e5')).toBe('Nxe5');
		expect(noteOf(START, 'wb', 'b5')).toBe('Bb5');
		expect(noteOf({ wp: 'e4', bp: 'd5' }, 'wp', 'd5')).toBe('exd5');
	});

	it('replies from whatever position it is given: the first capture, else a developing move', () => {
		expect(reply(START, true)).toEqual({ id: 'wn', to: 'e5' });
		const quiet: Position = { wk: 'g1', wn: 'b1', bk: 'g8', bn: 'b8' };
		const next = reply(quiet, true)!;
		expect(next.id).toBe('wn');
		expect(['c3', 'd2']).toContain(next.to);
		const played = after(START, 'wb', 'b5');
		expect(reply(played, false)).toEqual({ id: 'br', to: 'f3' });
		expect(reply(after(START, 'wn', 'e5'), false)).toEqual({ id: 'br', to: 'f1' });
		expect(whiteToMove(0)).toBe(true);
		expect(whiteToMove(1)).toBe(false);
	});
});

describe('the chess toy', () => {
	it('finds the square under a dropped piece and writes the newest move first, numbered from move 9', () => {
		const [x, y] = boardArt.squares.g5!;
		expect(nearestSquare(boardArt.squares, x + 2, y - 1)).toBe('g5');
		expect(placeOf(boardArt.squares, 'wn', 'f3', 0, 0)).toBe('transform:translate(0px,0px)');
		expect(sheetLines(['Nxe5', 'Nxe5', 'Bb5'], 4)).toEqual(['10. Bb5', '9… Nxe5', '9. Nxe5', '']);
	});

	it('answers hover, drag and keys, crosses out setting up again, and draws the same scene every time', () => {
		expect(piece).toContain('onPointerenter');
		expect(piece).toContain('onPointerdown');
		expect(piece).toContain("event.key === 'ArrowUp'");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('set up again from 1. e4?');
		expect(piece).toContain('Next move');
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(boardArt));
	});

	it('sits on the Resuming page under its heading', () => {
		expect(page).toContain("import ResumeAnatomy from '../../components/figures/resuming/resume-anatomy.tsrx';");
		expect(page.indexOf('## The page arrives mid-game')).toBeLessThan(page.indexOf('<ResumeAnatomy />'));
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
