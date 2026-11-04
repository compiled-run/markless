// A new app's tsconfig.json on a sheet: the three Markless lines ringed and numbered, and a slip below saying what each one does.
import { desk, type Run } from '../ink/sheets.ts';

const row = (i: number) => 2.6 + i * 0.78;
const CODE = 2.1;

const key = (k: string): Run => ({ t: '"' + k + '"', tint: 'num' });
const str = (s: string): Run => ({ t: '"' + s + '"', tint: 'str' });

export const LINES: Run[][] = [
	[{ t: '{' }],
	[{ t: '  ' }, key('tsrx'), { t: ': {' }],
	[{ t: '    ' }, key('compiler'), { t: ': ' }, str('@markless/typescript-plugin/volar')],
	[{ t: '  },' }],
	[{ t: '  ' }, key('compilerOptions'), { t: ': {' }],
	[{ t: '    ' }, key('jsx'), { t: ': ' }, str('preserve'), { t: ',' }],
	[{ t: '    ' }, key('plugins'), { t: ': [' }],
	[{ t: '      { ' }, key('name'), { t: ': ' }, str('@markless/typescript-plugin'), { t: ' },' }],
	[{ t: '      { ' }, key('name'), { t: ': ' }, str('@markless/router/typescript-plugin'), { t: ' }' }],
	[{ t: '    ]' }],
	[{ t: '  }' }],
	[{ t: '}' }],
];

/** The line each ring marks, the quoted value it rings, and what the slip says that line does. */
export const MARKS = [
	{ line: 2, value: '"@markless/typescript-plugin/volar"', says: 'READ .TSRX FILES THE MARKLESS WAY' },
	{ line: 7, value: '"@markless/typescript-plugin"', says: 'SUGGESTIONS, HINTS, ERRORS, .TSRX IMPORTS' },
	{ line: 8, value: '"@markless/router/typescript-plugin"', says: 'YOUR PAGE ADDRESSES INSIDE HREF' },
];

const textOf = (runs: Run[]) => runs.map((r) => r.t).join('');

export function drawing() {
	const fileH = row(LINES.length) + 0.1;
	const k = desk(680, [
		{ key: 'file', x: 0, y: 0, w: 21, h: fileH, bar: 'editor', title: 'tsconfig.json' },
		{ key: 'slip', x: 1.6, y: fileH + 1.8, w: 17.5, h: 4.2, turn: 0.012, curl: false },
	]);
	k.lay();
	LINES.forEach((runs, i) => {
		k.row('file', 0.8, row(i), String(i + 1), 'num');
		k.print('file', CODE, row(i), runs);
	});
	MARKS.forEach((mark, i) => {
		const at = 500 + i * 900;
		const text = textOf(LINES[mark.line]!);
		const from = text.indexOf(mark.value);
		k.ring('file', k.col(CODE, from), k.col(CODE, from + mark.value.length), row(mark.line), 'draw', at, 0.46);
		k.number('file', 19.9, row(mark.line), String(i + 1), 'draw', at + 250);
		k.number('slip', 1.1, 1.3 + i * 1.05, String(i + 1), 'draw', at + 400);
		k.hand('slip', 2, 1.3 + i * 1.05, mark.says, 'show', at + 500);
	});
	return k.build();
}
