// A galley proof of the State page lying in its galley tray, marked up by the proofreader: the slug line at its head is the file's path, and the path is the page's address; the nav.ts card beside it names the same address.
import { desk } from '../ink/sheets.ts';
import { pathOf } from '../ink/ink.ts';
import { slug } from './type.ts';

/** Column of character `c` in an 8px monospace row starting at `u`. */
const sc = (u: number, c: number) => u + c * 0.24;

export const SLUG = 'pages/concepts/state.mdx';
export const ADDRESS = '/concepts/state';

/** The opening of the State page as the proof prints it. */
const BODY = [
	'Say you work at Beanshop, a coffee brand.',
	'Customers press Add to cart on your shop',
	'page, and the page needs to keep track of',
	'how many bags they have added.',
];

export function drawing() {
	const k = desk(680, [{ key: 'proof', x: 1.1, y: 0.8, w: 12.4, h: 13.6, turn: -0.012 }, { key: 'card', x: 14.6, y: 7.8, w: 6.8, h: 5, turn: 0.04, curl: false }], [[21.6, 0, 0]]);
	k.next();
	slug(k, 0, 0, 14.2, 14.8, 0.35, 3700, '', '', undefined, true);
	slug(k, 13.6, -0.1, 0.6, 15, 0.9, 3705, '', '', undefined, true);
	slug(k, 0, -0.1, 14.2, 0.6, 0.9, 3706, '', '', undefined, true);
	for (let i = 0; i < 4; i++) slug(k, 15.2 + (i % 2) * 1.5, 0.6 + Math.floor(i / 2) * 2.4, 1.2, 1.8, 0.9, 3720 + i * 7, ['S', 'p', '#', '→'][i]!, '', undefined, false, 'big');
	k.next();
	k.lay();
	k.row('proof', 0.8, 1.2, SLUG, 'mono small');
	k.row('proof', 8.6, 1.2, 'GALLEY 1', 'dim small');
	k.raw.path(pathOf(k.raw.on('proof', [[0.6, 1.6], [11.8, 1.6]])), 'perforation');
	k.row('proof', 0.9, 3.2, 'State is a variable', 'big');
	k.row('proof', 0.9, 4.2, 'the page watches', 'big');
	k.row('proof', 0.9, 5.1, '4 min · Assumes: reading-tsrx', 'dim small');
	BODY.forEach((text, i) => k.row('proof', 0.9, 6.2 + i * 0.62, text, 'mono small'));
	const box = k.raw.on('proof', [[0.9, 8.9], [6.2, 8.9], [6.2, 10.5], [0.9, 10.5]]);
	k.raw.path(pathOf([...box, box[0]!]), 'pen faint');
	k.row('proof', 1.2, 9.55, 'let cart = 0;', 'mono small');
	k.row('proof', 1.2, 10.15, 'cart++;', 'mono small');
	k.row('proof', 0.9, 11.7, 'Follow the wire', 'bold');
	[12.4, 13].forEach((v, i) => k.raw.path(pathOf(k.raw.on('proof', [[0.9, v], [0.9 + [10.2, 7.4][i]!, v]])), 'pen faint'));
	k.row('card', 0.6, 1.2, 'nav.ts', 'bold');
	k.row('card', 0.6, 2.3, "title: 'State'", 'mono small');
	k.row('card', 0.6, 3.0, "href: '" + ADDRESS + "'", 'mono small');
	k.next();
	k.ring('proof', 0.8, sc(0.8, SLUG.length), 1.2, 'draw', 300, 0.42);
	k.hand('proof', 0.9, 2.15, '= ' + ADDRESS, 'show', 900);
	k.tick('proof', 11.6, 3.2, 'draw', 1300);
	k.tick('proof', 11.6, 5.1, 'draw', 1500);
	k.bracket('proof', 0.45, 6.2, 8.06, 'draw', 1700);
	k.tick('proof', 11.6, 11.7, 'draw', 1900);
	k.swipe('card', sc(0.6, 7), sc(0.6, 7 + ADDRESS.length), 3.0, 'show', 2300);
	k.hand('card', 0.6, 4.3, 'SIDEBAR, PAGER, HEAD', 'show', 2600);
	return k.build();
}
