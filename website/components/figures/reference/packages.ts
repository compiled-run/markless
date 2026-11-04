// A new app's package.json on a sheet, its four Markless packages bracketed, and below it the folder of packages those four bring along.
import { desk, type SheetSpec } from '../ink/sheets.ts';

const FIRST = 2.6;
const PITCH = 0.8;
const L = 1.2;
const v = (row: number) => FIRST + row * PITCH;

/** The Markless lines of a new app's package.json, in the template's order; `…` stands for the lines left out. */
export const MANIFEST = ['"dependencies": {', '  "@markless/core": …,', '  "@markless/router": …,', '  …', '},', '"devDependencies": {', '  "@markless/analyzer": …,', '  "@markless/typescript-plugin": …,', '  …', '}'];

export const INSTALLED = [1, 2, 6, 7];

/** The packages the four depend on, that an app never imports itself. */
export const INNER = ['compiler', 'bundler', 'runtime', 'serializer', 'web'];

export function drawing() {
	const sheetH = v(MANIFEST.length - 1) + 0.9;
	const top = sheetH + 3.2;
	const slips: SheetSpec[] = INNER.map((name, i) => ({ key: name, x: 1.2 + (i % 3) * 6.4 + (i >= 3 ? 3.2 : 0), y: top + 2 + Math.floor(i / 3) * 2.3, w: 5.4, h: 1.6, turn: [-0.03, 0.02, -0.01, 0.025, -0.02][i]!, curl: false }));
	const k = desk(680, [{ key: 'json', x: 1.5, y: 0, w: 18, h: sheetH, turn: 0.01, bar: 'editor', title: 'package.json' }, { key: 'box', x: 0, y: top, w: 21, h: 6.6, folder: '@markless/' }, ...slips]);
	k.lay();
	MANIFEST.forEach((text, i) => k.row('json', L, v(i), text, INSTALLED.includes(i) ? 'bold' : 'mono'));
	INSTALLED.forEach((row, i) => k.swipe('json', k.col(L, 3), k.col(L, MANIFEST[row]!.indexOf(':') - 1), v(row), 'show', 300 + i * 250));
	k.bracket('json', 0.6, v(1), v(7), 'draw', 1400);
	k.hand('json', 12.6, v(3), 'YOU INSTALL THESE', 'show', 1500);
	k.arrow(['json', 0.4, v(4)], ['box', 2.2, -1.3], 'draw', 1900, 0, true, [['json', -1.2, v(8)]]);
	INNER.forEach((name, i) => k.row(name, 0.6, 1.05, name, 'mono', 'show', 2500 + i * 180));
	k.hand('box', 1.2, 1.2, 'THEY COME ALONG. YOU NEVER IMPORT THEM.', 'show', 3500);
	return k.build();
}
