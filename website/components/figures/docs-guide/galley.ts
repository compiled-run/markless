// A galley proof of the State page lying in its galley tray: the slug line at its head is the file's path, and the path is the page's address.
import { desk } from '../ink/sheets.ts';
import { pathOf } from '../ink/ink.ts';
import { slug } from './type.ts';

/** Column of character `c` in an 8px monospace row starting at `u`. */
const sc = (u: number, c: number) => u + c * 0.24;

export const SLUG = 'pages/concepts/state.mdx';
export const ADDRESS = '/concepts/state';

export function drawing() {
	const k = desk(680, [{ key: 'proof', x: 1.1, y: 0.8, w: 12.4, h: 12.2, turn: -0.012 }, { key: 'card', x: 14.4, y: 6.4, w: 7, h: 5, turn: 0.04, curl: false }], [[21.4, 0, 0]]);
	k.next();
	slug(k, 0, 0, 14.2, 13.4, 0.35, 3700, '', '', undefined, true);
	slug(k, 13.6, -0.1, 0.6, 13.6, 0.9, 3705, '', '', undefined, true);
	k.next();
	k.lay();
	k.row('proof', 0.8, 1.2, SLUG, 'mono small');
	k.raw.path(pathOf(k.raw.on('proof', [[0.6, 1.6], [11.8, 1.6]])), 'perforation');
	k.row('proof', 0.9, 3.4, 'State is a variable', 'big');
	k.row('proof', 0.9, 4.4, 'the page watches', 'big');
	[5.6, 6.6, 7.4, 8.2, 9.2, 10, 10.8].forEach((v, i) => k.raw.path(pathOf(k.raw.on('proof', [[0.9, v], [0.9 + [9.8, 6.2, 10.2, 8.4, 9.6, 10.1, 5.2][i]!, v]])), 'pen faint'));
	k.row('card', 0.6, 1.2, 'nav.ts', 'bold');
	k.row('card', 0.6, 2.3, "title: 'State'", 'mono small');
	k.row('card', 0.6, 3.0, "href: '" + ADDRESS + "'", 'mono small');
	k.next();
	k.ring('proof', 0.8, sc(0.8, SLUG.length), 1.2, 'draw', 300, 0.42);
	k.hand('proof', sc(0.8, SLUG.length) + 0.7, 1.25, '= ' + ADDRESS, 'show', 900);
	
	k.swipe('card', sc(0.6, 7), sc(0.6, 7 + ADDRESS.length), 3.0, 'show', 1500);
	k.hand('card', 0.6, 4.3, 'SIDEBAR, PAGER, HEAD', 'show', 1900);
	return k.build();
}
