// The create command typed on a terminal sheet, each part of it underlined and named in pen.
import { desk } from '../ink/sheets.ts';

const FIRST = 2.6;
const PITCH = 0.8;
const L = 1.7;
const v = (row: number) => FIRST + row * PITCH;

export const LINES = ['npm create markless@latest my-app \\', '    -- --yes --starter app --no-git'];

/** Each part of the command: its row, first and last column, the note under it, and the row the note sits on. */
export const PARTS = [
	{ row: 1, from: 27, to: 34, note: 'SKIPS GIT INIT', at: 3 },
	{ row: 1, from: 13, to: 25, note: 'THE APP STARTER', at: 4 },
	{ row: 1, from: 7, to: 11, note: 'DEFAULTS, NO QUESTIONS', at: 5 },
	{ row: 1, from: 4, to: 5, note: 'NPM PASSES THE REST ON', at: 6 },
];

export function drawing() {
	const k = desk(680, [{ key: 'term', x: 0, y: 0, w: 18.6, h: v(6) + 0.7, bar: 'terminal' }]);
	k.lay();
	k.row('term', 1, v(0), '$', 'dim');
	k.row('term', L, v(0), LINES[0]!, 'bold', 'show', 100);
	k.row('term', L, v(1), LINES[1]!, 'bold', 'show', 300);
	k.ring('term', k.col(L, 27), k.col(L, 33), v(0), 'draw', 700, 0.48);
	k.hand('term', k.col(L, 37), v(0), 'THE FOLDER', 'show', 900);
	PARTS.forEach((part, i) => {
		const at = 1300 + i * 600;
		const u0 = k.col(L, part.from);
		const u1 = k.col(L, part.to + 1);
		k.strike('term', u0, u1, v(part.row) + 0.38, 'draw', at);
		k.arrow(['term', u0 + 0.15, v(part.at) - 0.55], ['term', u0 + 0.15, v(part.row) + 0.4], 'draw', at + 200);
		k.hand('term', u0, v(part.at), part.note, 'show', at + 300);
	});
	return k.build();
}
