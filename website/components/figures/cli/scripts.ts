// Two scripts typed on a terminal: dev serves the starter page in a browser at localhost:3000, build writes the app and its server into .output/.
import { desk } from '../ink/sheets.ts';

const FIRST = 2.6;
const PITCH = 0.85;
const L = 1.7;
const v = (row: number) => FIRST + row * PITCH;

export function drawing() {
	const termH = v(1) + 1;
	const top = termH + 2.4;
	const k = desk(680, [
		{ key: 'term', x: 0, y: 0, w: 21, h: termH, bar: 'terminal' },
		{ key: 'page', x: 0.2, y: top, w: 12.2, h: 7.4, turn: -0.012, bar: 'browser', title: 'localhost:3000' },
		{ key: 'out', x: 13.6, y: top + 0.6, w: 7.4, h: 6.4, turn: 0.02, folder: '.output/' },
		{ key: 'slip', x: 14.3, y: top + 2.2, w: 6, h: 1.7, turn: -0.04, curl: false },
	]);
	k.lay();
	k.row('term', 1, v(0), '$', 'dim');
	k.row('term', L, v(0), 'npm run dev', 'bold');
	k.row('term', 1, v(1), '$', 'dim');
	k.row('term', L, v(1), 'npm run build', 'bold');
	k.hand('term', k.col(L, 16), v(0), 'STARTS THE DEV SERVER', 'show', 200);
	k.hand('term', k.col(L, 16), v(1), 'BUILDS THE APP AND ITS SERVER', 'show', 1600);
	k.arrow(['term', 0.7, v(0) - 0.15], ['page', 3.2, 0.1], 'draw', 400, 0, true, [['term', -0.8, v(1) + 0.2], ['term', 0.6, termH + 1.1]]);
	k.print('page', 1.2, 3.6, [{ t: 'Markless Router', c: 'big' }], 'show', 1100);
	k.button('page', 1.2, 4.6, 5.6, 6.1, 'Count 0', 1200);
	k.arrow(['term', k.col(L, 9), v(1) + 0.4], ['out', 2.2, -1.25], 'draw', 1800, 0.4, true);
	k.row('slip', 0.6, 1.1, 'server/index.mjs', 'mono', 'show', 2500);
	k.hand('out', 0.8, 4.8, 'NODE RUNS THIS', 'show', 2700);
	return k.build();
}
