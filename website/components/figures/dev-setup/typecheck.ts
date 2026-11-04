// pnpm run typecheck on a terminal sheet: each .tsrx error names its file, line and column, and the run ends with a count.
import { desk } from '../ink/sheets.ts';

/** The checker's output as a 50-column terminal wraps it. */
export const OUTPUT = [
	"broken.tsrx(4,1): error TS91001: Markless TSRX",
	"parse error: Unexpected token '}'",
	"app.tsrx(4,7): error TS2322: Type 'number' is not",
	"assignable to type 'string'.",
	'Found 1 Markless TSRX compile error.',
];

const PITCH = 0.82;
const FIRST = 2.6;
const L = 1.7;
const v = (i: number) => FIRST + i * PITCH;
/** Each output line's row on the sheet; the rows between the two errors hold the handwritten notes. */
const ROW = [1, 2, 4, 5, 7];

export function drawing() {
	const k = desk(680, [{ key: 'term', x: 0, y: 0, w: 21, h: v(8) + 0.2, bar: 'terminal' }]);
	k.lay();
	k.row('term', 1, v(0), '$', 'dim');
	k.row('term', L, v(0), 'pnpm run typecheck');
	OUTPUT.forEach((text, i) => k.row('term', L, v(ROW[i]!), text, i === 4 ? 'bold' : 'mono', 'show', 200 + i * 120));
	k.next();
	const span = (row: number, part: string) => {
		const from = OUTPUT[row]!.indexOf(part);
		return [k.col(L, from), k.col(L, from + part.length)] as const;
	};
	const marks = [
		{ row: 0, part: '(4,1)', note: 'WHERE', at: 1100 },
		{ row: 0, part: 'TS91001', note: "DOESN'T PARSE", at: 1800 },
		{ row: 2, part: '(4,7)', note: 'WHERE', at: 2600 },
		{ row: 2, part: 'TS2322', note: 'WRONG TYPE', at: 3300 },
	];
	marks.forEach((m) => {
		const [u0, u1] = span(m.row, m.part);
		k.ring('term', u0, u1, v(ROW[m.row]!), 'draw', m.at, 0.45);
		k.hand('term', u0, v(ROW[m.row]! + 2) - 0.12, '↑ ' + m.note, 'show', m.at + 250);
	});
	k.swipe('term', L, k.col(L, OUTPUT[4]!.length), v(7), 'show', 4100);
	return k.build();
}
