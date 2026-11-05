// The glossary as a thumb-indexed dictionary lying open on its cover: four tabs named after the page's sections, and each word with one numbered sense.
import { roundRect } from '../ink/desk.ts';
import { hatch, outline, pathOf } from '../ink/ink.ts';
import { desk } from '../ink/sheets.ts';

/** The page's four sections, top to bottom, as the tabs read. */
export const TABS = ['Writing', 'Renders', 'How it works', 'Tooling'];

/** The spread open at How it works, each sense cut from the page's own table. */
export const LEFT = [
	{ word: 'compiler', sense: ['The build step that reads', '.tsrx files.'] },
	{ word: 'symbol', sense: ['One piece of code that', 'the compiler split out.'] },
	{ word: 'chunk', sense: ['A file that holds symbols.'] },
];
export const RIGHT = [
	{ word: 'packing', sense: ['The production build step', 'that groups symbols into', 'fewer chunks.'] },
	{ word: 'payload', sense: ['In server output, the data', 'next to the HTML.'] },
	{ word: 'resume', sense: ['The browser carries on', 'from server HTML and', 'its payload.'] },
];

const W = 8.6;
const H = 12;
const TAB_W = 3.2;

export function drawing() {
	const k = desk(680, [
		{ key: 'cover', x: -0.5, y: -0.4, w: W * 2 + 1.6 + TAB_W, h: H + 0.8, kraft: true, curl: false },
		{ key: 'left', x: 0, y: 0, w: W, h: H, curl: false },
		{ key: 'right', x: W + 0.6, y: 0, w: W, h: H, curl: false },
	]);
	k.lay();
	k.next();
	const tabTop = (i: number) => 0.6 + i * 2.7;
	TABS.forEach((name, i) => {
		const v0 = tabTop(i);
		const shape = k.raw.on('right', roundRect(W - 0.3, v0, W + TAB_W, v0 + 2.3, 0.45, 4), 0.01);
		const open = i === 2;
		k.raw.path(pathOf(shape, true), 'sheet-paper');
		if (!open) k.raw.path(hatch(shape, 1.1, 2, 2310 + i, { cluster: 3, skip: 0.3, trim: 0.3 }), 'sheet-hatch light');
		k.raw.path(outline(shape, { w: 1, heavy: 0.8, seed: 2320 + i }), 'sheet-ink');
		k.row('right', W + 0.25, v0 + 1.35, name, 'hand', 'show', 300 + i * 250);
	});
	k.next();
	k.raw.path(pathOf(k.raw.on('right', roundRect(0, 0, W, H, 0.05, 1)), true), 'sheet-paper');
	k.raw.path(outline(k.raw.on('right', roundRect(0, 0, W, H, 0.05, 1)), { w: 1.6, heavy: 1.4, seed: 2335 }), 'sheet-ink');
	k.swipe('right', W + 0.2, W + 0.25 + 'How it works'.length * 0.26, tabTop(2) + 1.35, 'show', 1400);
	k.raw.path(hatch(k.raw.on('left', [[W - 0.6, 0], [W, 0], [W, H], [W - 0.6, H]]), 1.4, 1.2, 2340, { cluster: 3 }), 'sheet-hatch light');
	k.raw.path(hatch(k.raw.on('right', [[0, 0], [0.5, 0], [0.5, H], [0, H]]), 1.4, 1.2, 2341, { cluster: 3 }), 'sheet-hatch light');
	const entries = (key: string, list: typeof LEFT, delay: number) => {
		let v = 2.7;
		list.forEach(({ word, sense }, i) => {
			const at = delay + i * 350;
			k.row(key, 1, v, word, 'bold');
			k.row(key, 1.7 + word.length * 0.3, v, '1.', 'mono', 'show', at);
			k.ring(key, 1.6 + word.length * 0.3, 2.2 + word.length * 0.3, v, 'draw', at + 100, 0.4);
			sense.forEach((line, j) => k.row(key, 1.4, v + 0.75 + j * 0.62, line, 'mono small'));
			v += 1.45 + sense.length * 0.62;
		});
	};
	k.row('left', 1, 1.4, 'compiler – chunk', 'dim small');
	k.row('right', 1, 1.4, 'packing – resume', 'dim small');
	entries('left', LEFT, 1800);
	entries('right', RIGHT, 2900);
	k.hand('left', 1, H - 1.2, 'ONE SENSE EACH', 'show', 4100);
	return k.build();
}
