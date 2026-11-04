// The test file and the browser it runs in: its click lands on the Count button, Count 0 becomes Count 1, and the test's last line gets a tick.
import { desk, type Run } from '../ink/sheets.ts';

const row = (i: number) => 2.7 + i * 0.85;
const CODE = 2.2;

/** counter.browser.ts from the page, with its long expect chain broken where a formatter breaks it. */
export const LINES: Run[][] = [
	[{ t: 'test', tint: 'fn' }, { t: '(' }, { t: "'a click counts'", tint: 'str' }, { t: ', ' }, { t: 'async', tint: 'kw' }, { t: ' () => {' }],
	[{ t: '  ' }, { t: 'await', tint: 'kw' }, { t: ' ' }, { t: 'render', tint: 'fn' }, { t: '(Counter);' }],
	[{ t: '  ' }, { t: 'const', tint: 'kw' }, { t: ' button = document.' }, { t: 'querySelector', tint: 'fn' }, { t: '(' }, { t: "'button'", tint: 'str' }, { t: ')!;' }],
	[{ t: '  button.' }, { t: 'click', tint: 'fn' }, { t: '();' }],
	[{ t: '  ' }, { t: 'await', tint: 'kw' }, { t: ' expect.' }, { t: 'poll', tint: 'fn' }, { t: '(() => button.textContent)' }],
	[{ t: '    .' }, { t: 'toBe', tint: 'fn' }, { t: '(' }, { t: "'Count 1'", tint: 'str' }, { t: ');' }],
	[{ t: '});' }],
];

const textOf = (runs: Run[]) => runs.map((r) => r.t).join('');

export function drawing() {
	const testH = row(LINES.length) + 0.1;
	const k = desk(680, [
		{ key: 'test', x: 0, y: 0, w: 20, h: testH, bar: 'editor', title: 'counter.browser.ts' },
		{ key: 'page', x: 3.4, y: testH + 2, w: 13, h: 6, turn: -0.015, bar: 'browser' },
	]);
	k.lay();
	LINES.forEach((runs, i) => {
		k.row('test', 0.9, row(i), String(i + 1), 'num');
		k.print('test', CODE, row(i), runs);
	});
	const click = textOf(LINES[3]!);
	k.ring('test', k.col(CODE, 2), k.col(CODE, click.length - 1), row(3), 'draw', 400, 0.48);
	k.button('page', 3.6, 2.6, 9.4, 4.6, 'Count', 1500);
	k.row('page', 6.25, 4.18, '0', 'big', 'gone', 1900);
	k.swipe('page', 6.1, 6.85, 4.15, 'show', 2000);
	k.row('page', 6.25, 4.18, '1', 'big', 'show', 2050);
	k.arrow(['test', k.col(CODE, click.length + 0.5), row(3) - 0.2], ['page', 9.7, 3.5], 'draw', 800, 0, true, [
		['test', 17.5, row(3) + 0.3],
		['page', 12.2, 1.9],
	]);
	const last = textOf(LINES[5]!);
	k.tick('test', k.col(CODE, last.length + 2.4), row(5), 'draw', 2800);
	k.hand('test', k.col(CODE, last.length + 4.2), row(5), 'PASSES', 'show', 3000);
	return k.build();
}
