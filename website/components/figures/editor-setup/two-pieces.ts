// A .tsrx file in an editor: first plain, then coloured by the TSRX extension; then the Markless plugin's red line under onClik and its @ suggestions.
import { roundRect } from '../ink/desk.ts';
import { outline, pathOf } from '../ink/ink.ts';
import { desk, type Run } from '../ink/sheets.ts';

const row = (i: number) => 2.7 + i * 0.85;
const CODE = 2.2;

/** The file, one array of coloured runs per line. */
export const LINES: Run[][] = [
	[{ t: 'import', tint: 'kw' }, { t: ' { state } ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'@markless/core'", tint: 'str' }, { t: ';' }],
	[],
	[{ t: 'export default function', tint: 'kw' }, { t: ' ' }, { t: 'Counter', tint: 'fn' }, { t: '() ' }, { t: '@{', tint: 'kw' }],
	[{ t: '  ' }, { t: 'let', tint: 'kw' }, { t: ' count = ' }, { t: 'state', tint: 'fn' }, { t: '(' }, { t: '0', tint: 'num' }, { t: ');' }],
	[{ t: '  <' }, { t: 'button', tint: 'tag' }, { t: ' ' }, { t: 'onClik', tint: 'fn' }, { t: '={() => count++}>Count {count}</' }, { t: 'button', tint: 'tag' }, { t: '>' }],
];

export const SUGGESTED = ['@if', '@for', '@try'];

const textOf = (runs: Run[]) => runs.map((r) => r.t).join('');

export function drawing() {
	const k = desk(680, [{ key: 'ed', x: 0, y: 0, w: 21, h: row(9) + 0.1, bar: 'editor', title: 'counter.tsrx' }]);
	k.lay();
	LINES.forEach((runs, i) => k.row('ed', 0.9, row(i), String(i + 1), 'num'));
	k.row('ed', 0.9, row(5), '6', 'num');
	k.row('ed', 0.9, row(6), '7', 'num');
	k.row('ed', CODE, row(6), '}');
	LINES.forEach((runs, i) => {
		if (!runs.length) return;
		k.row('ed', CODE, row(i), textOf(runs), 'dim', 'gone', 700);
		k.print('ed', CODE, row(i), runs, 'show', 800);
	});
	k.hand('ed', 9.5, row(1), 'COLOURS: THE EXTENSION', 'show', 1100);

	const clik = textOf(LINES[4]!).indexOf('onClik');
	k.wavy('ed', k.col(CODE, clik), k.col(CODE, clik + 6), row(4), 'draw', 2000);
	k.hand('ed', 8.2, row(5) + 0.05, 'RED LINE: THE PLUGIN', 'show', 2300);

	k.print('ed', CODE, row(5), [{ t: '  ' }, { t: '@', tint: 'kw' }], 'show', 3000);
	k.next();
	const u0 = k.col(CODE, 2.4);
	const top = row(5) + 0.35;
	const box = k.raw.on('ed', roundRect(u0, top, u0 + 3.6, top + SUGGESTED.length * 0.72 + 0.3, 0.15, 3), 0.08);
	k.raw.path(pathOf(box, true), 'sheet-paper show', k.raw.motion('show', 3300));
	k.raw.path(outline(box, { w: 1, heavy: 0.8, seed: 1500 }), 'sheet-ink show', k.raw.motion('show', 3300));
	SUGGESTED.forEach((s, i) => k.print('ed', u0 + 0.4, top + 0.75 + i * 0.72, [{ t: s, tint: 'kw' }], 'show', 3350 + i * 80));
	k.hand('ed', u0 + 4.4, top + 1.75, 'SUGGESTIONS: THE PLUGIN', 'show', 3700);
	return k.build();
}
