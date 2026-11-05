// A warning waived by a signed permit: the slip names the code and its reason, is clipped to records.tsrx, and its comment lands in the file as the wavy line goes.
import { pathOf, stroke } from '../ink/ink.ts';
import { desk, type P } from '../ink/sheets.ts';
import { clip } from './props.ts';

const row = (i: number) => 2.7 + i * 0.82;

export const CODE = 'MARKLESS_REPEAT_KEY_IS_INDEX';
export const REASON = 'a fixed list, its order never changes';
export const LOOP = '@for (const record of records; index slot; key slot) {';

export function drawing() {
	const fileH = row(7) + 0.3;
	const k = desk(680, [
		{ key: 'file', x: 0, y: 0, w: 21, h: fileH, bar: 'editor', title: 'records.tsrx', curl: false },
		{ key: 'permit', x: 7.4, y: fileH - 1.2, w: 12.6, h: 6, turn: -0.04 },
	]);
	k.lay();
	const c = 2.1;
	const at = k.col(c, 2);
	const lines: [string, number, number | null][] = [
		['<section>', 0, 1],
		['', 1, 2],
		['', 1, null],
		[LOOP, 1, 3],
		['<p>{record.label}</p>', 2, 4],
		['}', 1, 5],
		['</section>', 0, 6],
	];
	lines.forEach(([text, indent, n], i) => {
		if (n !== null) k.row('file', 0.9, row(i), String(n), 'num');
		if (text && i !== 3) k.row('file', k.col(c, indent * 2), row(i), text);
	});
	k.print('file', at, row(3), [{ t: '@for', tint: 'kw' }, { t: LOOP.slice(4) }]);
	k.wavy('file', k.col(at, 31), k.col(at, 52), row(3), 'gone', 3000);
	k.next();
	k.row('file', at, row(1), '// markless-allow ' + CODE + ':', 'dim', 'show', 2500);
	k.row('file', k.col(at, 3), row(2), REASON, 'dim', 'show', 2600);
	k.swipe('file', k.col(at, 0), k.col(at, 18 + CODE.length + 1), row(1), 'show', 2700);

	k.row('permit', 0.8, 1.7, 'PERMIT', 'big');
	k.row('permit', 5, 1.7, 'for one warning, on purpose', 'mono small');
	k.row('permit', 0.8, 2.8, 'code', 'hand');
	k.row('permit', 3.3, 2.8, CODE, 'mono small', 'show', 400);
	k.raw.path(pathOf(k.raw.on('permit', [[3.2, 3.05], [12.1, 3.05]])), 'perforation');
	k.row('permit', 0.8, 3.9, 'reason', 'hand');
	k.row('permit', 3.3, 3.9, REASON, 'mono small', 'show', 900);
	k.raw.path(pathOf(k.raw.on('permit', [[3.2, 4.15], [12.1, 4.15]])), 'perforation');
	k.ring('permit', 3.2, 3.3 + REASON.length * 0.24, 3.9, 'draw', 1400, 0.5);
	k.hand('permit', 0.8, 5.3, 'NO REASON, NO PERMIT', 'show', 1700);
	const sig: P[] = [[8.4, 5.4], [8.9, 4.8], [9.2, 5.3], [9.6, 4.9], [9.9, 5.4], [10.5, 5.0], [11.2, 5.2], [11.7, 4.9]];
	k.raw.path(stroke(k.raw.on('permit', sig), { w: 1.2, seed: 1901, wobble: 0.5 }), 'sheet-ink show', k.raw.motion('show', 2000));
	k.next();
	clip(k, 'permit', 2.2, 0.9, 1910);
	return k.build();
}
