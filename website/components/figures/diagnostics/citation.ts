// The build's error as a citation tucked under a wiper on list.tsrx: four numbered boxes filled from the real error, then the fix written on line 8.
import { desk } from '../ink/sheets.ts';
import { barcode, wiper } from './props.ts';

/** The four boxes, filled from MARKLESS_REPEAT_KEY_REQUIRED as the build prints it; `…` marks text the ticket leaves out. */
export const FIELDS = [
	{ label: 'WHAT, WHERE', lines: ['MARKLESS_REPEAT_KEY_REQUIRED', 'pages/list.tsrx:8:4'] },
	{ label: 'WHY', lines: ['… rows have no identity to', 'update, reorder, or resume by'] },
	{ label: 'THE FIX', lines: ['@for (const item of items;', '      key item.id)'] },
	{ label: 'READ MORE', lines: ['markless.dev/errors/', 'MARKLESS_REPEAT_KEY_REQUIRED'] },
];

export const FILE = ['<ul>', ' @for (const item of items) {', '   <li>{item}</li>', ' }', '</ul>'];

export function drawing() {
	const k = desk(680, [
		{ key: 'code', x: 0, y: 0, w: 15.5, h: 7.6, bar: 'editor', title: 'list.tsrx', curl: false },
		{ key: 'ticket', x: 0.9, y: 6.3, w: 19.8, h: 8.5, turn: -0.02 },
	]);
	k.lay();
	const row = (i: number) => 2.6 + i * 0.85;
	const code = 1.9;
	FILE.forEach((text, i) => {
		k.row('code', 0.7, row(i), String(7 + i), 'num');
		if (i !== 1) k.row('code', code, row(i), text);
	});
	k.next();
	k.print('code', code, row(1), [{ t: ' ' }, { t: '@for', tint: 'kw' }, { t: ' (const item of items) {' }], 'gone', 4400);
	k.print('code', code, row(1), [{ t: ' ' }, { t: '@for', tint: 'kw' }, { t: ' (const item of items' }, { t: '; key item', c: 'bold' }, { t: ') {' }], 'show', 4600);
	k.swipe('code', k.col(code, 26), k.col(code, 36), row(1), 'show', 4800);
	k.strike('code', k.col(code, 1), k.col(code, 27), row(1) + 0.42, 'flash', 3200, 4500);

	k.row('ticket', 0.9, 2.6, 'COMPILE BLOCKED', 'hand');
	k.row('ticket', 7, 2.6, 'pages/list.tsrx · 1 error', 'mono small');
	barcode(k, 'ticket', 14, 19, 2.0, 2.7);
	FIELDS.forEach((field, i) => {
		const u = 0.6 + (i % 2) * 9.5;
		const top = 3.2 + Math.floor(i / 2) * 2.6;
		k.box('ticket', u, top, u + 9.1, top + 2.35, '', undefined, 'pen faint');
		k.number('ticket', u + 0.6, top + 0.8, String(i + 1), 'draw', 500 + i * 650);
		k.row('ticket', u + 1.3, top + 0.72, field.label, 'hand');
		field.lines.forEach((text, j) => k.row('ticket', u + 1.3, top + 1.42 + j * 0.6, text, 'mono small', 'show', 700 + i * 650 + j * 120));
	});
	k.next();
	wiper(k, 'code', -0.6, 8.3, 21.2, 6.6);
	return k.build();
}
