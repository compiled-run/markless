// The build's error printed on a terminal sheet, wrapped as a terminal wraps it, numbered line by line, with its location wired to the line of list.tsrx it names.
import { desk, type Motion } from '../ink/sheets.ts';

const PITCH = 0.78;
const FIRST = 2.6;
const L = 1.7;
const v = (row: number) => FIRST + row * PITCH;

/** The build output as a 46-column terminal wraps it; `n` is the error line a row belongs to, and `…` marks where the drawing cuts a line short. */
export const OUTPUT: { text: string; n: number; bold?: boolean }[] = [
	{ text: 'MARKLESS_COMPILE_BLOCKED: pages/list.tsrx has', n: 0, bold: true },
	{ text: '1 compiler error(s).', n: 0, bold: true },
	{ text: '', n: 0 },
	{ text: 'MARKLESS_REPEAT_KEY_REQUIRED: @for (const item', n: 1, bold: true },
	{ text: 'of items) … (pages/list.tsrx:8:4)', n: 1, bold: true },
	{ text: 'A keyed loop item keeps its state, events, …', n: 2 },
	{ text: 'Add a stable domain key such as `@for (const', n: 3 },
	{ text: 'item of items; key item.id)`, or …', n: 3 },
	{ text: 'https://markless.dev/errors/MARKLESS_REPEAT_', n: 4 },
	{ text: 'KEY_REQUIRED', n: 4 },
];

export const NOTES = ['WHAT, WHERE', 'WHY', 'THE FIX', 'READ MORE'];

export const FILE = ['<ul>', '  @for (const item of items) {', '    <li>{item}</li>', '  }', '</ul>'];

export function drawing() {
	const termH = v(OUTPUT.length + 1) + 0.2;
	const k = desk(680, [
		{ key: 'term', x: 0, y: 0, w: 21, h: termH, bar: 'terminal' },
		{ key: 'file', x: 2.4, y: termH + 2.2, w: 15.5, h: 6.4, turn: -0.015, bar: 'editor', title: 'list.tsrx' },
	]);
	k.lay();
	k.row('term', 1, FIRST, '$', 'dim');
	k.row('term', L, FIRST, 'npm run build', 'mono');
	OUTPUT.forEach((line, i) => {
		if (line.text) k.row('term', L, v(i + 1), line.text, line.bold ? 'bold' : 'mono', 'show', 150 + i * 50);
	});
	NOTES.forEach((note, i) => {
		const at = 900 + i * 650;
		const first = OUTPUT.findIndex((line) => line.n === i + 1);
		k.number('term', 0.85, v(first + 1), String(i + 1), 'draw', at);
		k.hand('term', 16.3, v(first + 1), note, 'show', at + 200);
	});
	const locRow = 5;
	const loc = 'of items) … '.length;
	k.ring('term', k.col(L, loc), k.col(L, OUTPUT[locRow - 1]!.text.length), v(locRow), 'draw', 3500, 0.5);

	const fileRow = (i: number) => 2.7 + i * 0.85;
	const gutter = 0.9;
	const code = 2.2;
	FILE.forEach((text, i) => {
		k.row('file', gutter, fileRow(i), String(7 + i), 'num');
		if (i !== 1) k.row('file', code, fileRow(i), text, 'mono');
	});
	k.next();
	const before: Motion = 'gone';
	k.print('file', code, fileRow(1), [{ t: '  ' }, { t: '@for', tint: 'kw' }, { t: ' (const item of items) {' }], before, 5600);
	k.print('file', code, fileRow(1), [{ t: '  ' }, { t: '@for', tint: 'kw' }, { t: ' (const item of items' }, { t: '; key item', c: 'bold' }, { t: ') {' }], 'show', 5850);
	k.swipe('file', k.col(code, 27), k.col(code, 37), fileRow(1), 'show', 6000);
	const locEnd = k.col(L, OUTPUT[locRow - 1]!.text.length) + 0.3;
	k.arrow(['term', locEnd, v(locRow) - 0.2], ['file', k.col(code, 41.5), fileRow(1) - 0.25], 'draw', 4000, 0, true, [
		['term', 15.4, v(locRow) - 0.3],
		['term', 21.8, v(locRow) + 3.5],
		['file', 17, fileRow(0) - 1.6],
	]);
	k.strike('file', k.col(code, 2), k.col(code, 28), fileRow(1) + 0.42, 'flash', 4700, 5700);
	return k.build();
}
