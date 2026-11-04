// A warning's wavy line on a printed file, silenced by the markless-allow comment written above it, with its reason ringed.
import { desk } from '../ink/sheets.ts';

const row = (i: number) => 2.7 + i * 0.82;

export const COMMENT = ['// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX:', 'a fixed list, its order never changes'];
export const LOOP = '@for (const record of records; index slot; key slot) {';

export function drawing() {
	const k = desk(680, [{ key: 'file', x: 0, y: 0, w: 21, h: row(7) + 0.3, bar: 'editor', title: 'records.tsrx' }]);
	k.lay();
	const g = 0.9;
	const c = 2.1;
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
		if (n !== null) k.row('file', g, row(i), String(n), 'num');
		if (text && i !== 3) k.row('file', k.col(c, indent * 2), row(i), text);
	});
	const at = k.col(c, 2);
	k.print('file', at, row(3), [{ t: '@for', tint: 'kw' }, { t: LOOP.slice(4) }]);
	k.wavy('file', k.col(at, 31), k.col(at, 52), row(3), 'gone', 2600);
	k.next();
	k.row('file', at, row(1), COMMENT[0]!, 'dim', 'show', 600);
	k.row('file', k.col(at, 3), row(2), COMMENT[1]!, 'dim', 'show', 1300);
	k.swipe('file', k.col(at, 18), k.col(at, COMMENT[0]!.length - 1), row(1), 'show', 900);
	k.ring('file', k.col(at, 3), k.col(at, 3 + COMMENT[1]!.length), row(2), 'draw', 1800, 0.48);
	k.hand('file', k.col(at, 44), row(2), 'THE REASON', 'show', 2100);
	return k.build();
}
