// app.tsrx handed to TypeScript as a TSX copy; the error TypeScript finds in the copy comes back to line 4, column 7 of the file you wrote.
import { desk, type Run } from '../ink/sheets.ts';

const row = (i: number) => 2.7 + i * 0.85;
const CODE = 2.2;

export const LINES: Run[][] = [
	[{ t: 'import', tint: 'kw' }, { t: ' { Nav } ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'./nav.tsrx'", tint: 'str' }, { t: ';' }],
	[],
	[{ t: 'export function', tint: 'kw' }, { t: ' ' }, { t: 'App', tint: 'fn' }, { t: '() ' }, { t: '@{', tint: 'kw' }],
	[{ t: '  <' }, { t: 'Nav', tint: 'tag' }, { t: ' ' }, { t: 'label', tint: 'fn' }, { t: '={' }, { t: '42', tint: 'num' }, { t: '} />' }],
	[{ t: '}' }],
];

export const ERROR = ['app.tsrx(4,7): error TS2322: Type', "'number' is not assignable to type 'string'."];

/** Word lengths of scribbles standing for each line of the copy: the copy is only for the checker, so the drawing doesn't spell it out. */
const SCRIBBLES: number[][] = [[1.6, 0.9, 1.2, 0.8, 2.2], [], [1.8, 2.4, 1.6, 0.6], [0.5, 1.1, 0.9, 1.5, 1.3, 0.7], [0.4]];

export function drawing() {
	const srcH = row(LINES.length) + 0.1;
	const k = desk(680, [
		{ key: 'src', x: 0, y: 0, w: 17, h: srcH, bar: 'editor', title: 'app.tsrx' },
		{ key: 'copy', x: 5.2, y: srcH + 2.2, w: 15.8, h: row(5) + 0.3, turn: -0.02, bar: 'none', curl: false },
		{ key: 'msg', x: 0.6, y: srcH + row(5) + 4.6, w: 16, h: 3.9, turn: 0.012, bar: 'terminal' },
	]);
	k.lay();
	LINES.forEach((runs, i) => {
		k.row('src', 0.9, row(i), String(i + 1), 'num');
		if (runs.length) k.print('src', CODE, row(i), runs);
	});
	k.arrow(['src', 15, row(2) + 0.2], ['copy', 11.5, 0.6], 'draw', 300, -0.8, true);
	k.hand('copy', 1, 1.1, 'A TSX COPY, ONLY FOR THE CHECKER', 'show', 900);
	SCRIBBLES.forEach((words, i) => {
		let u = 1.4 + (i === 3 ? 0.8 : 0);
		words.forEach((len, w) => {
			k.strike('copy', u, u + len, row(i) + 0.15, 'draw', 1000 + i * 120 + w * 30);
			u += len + 0.45;
		});
	});
	k.ring('copy', 2.2, 9.2, row(3) + 0.1, 'draw', 1900, 0.5);
	k.hand('copy', 10.4, row(3), 'TS2322', 'show', 2200);
	const label = '  <Nav '.length;
	k.arrow(['copy', 2.2, row(3) - 0.1], ['src', k.col(CODE, label + 2), row(3) + 0.35], 'draw', 2600, 1.2, true);
	k.wavy('src', k.col(CODE, label), k.col(CODE, label + 5), row(3), 'draw', 3300);
	k.hand('src', k.col(CODE, 21.5), row(3), 'LINE 4, COLUMN 7', 'show', 3500);
	k.row('msg', 1, 2.45, ERROR[0]!, 'mono', 'show', 3800);
	k.row('msg', 1, 3.2, ERROR[1]!, 'mono', 'show', 3900);
	return k.build();
}
