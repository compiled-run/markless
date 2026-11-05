// A music page you build by dragging pieces onto it, beside an inspector that draws the graph those pieces make.
import { ellipse, flatKit, rect, roundRect } from '../how/flat-kit.ts';
import { SONGS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 450;

const PAGE = { x: 10, y: 30, w: 330, h: 300 };
/** Where each piece sits in the tray, and where it lands on the page. */
const SLOTS = {
	label: { tray: [112, 356], page: [126, 214] },
	cover: { tray: [24, 352], page: [30, 196] },
	heading: { tray: [112, 404], page: [30, 70] },
} as const;

export function drawing() {
	const k = flatKit('g');
	k.windowFrame(PAGE.x, PAGE.y, PAGE.w, PAGE.h, 'music.app', 8000);
	k.put('pencil', k.line([[30, 66], [180, 66], [180, 90], [30, 90], [30, 66]], { w: 0.5, seed: 8001, over: 0 }));
	const rows = SONGS.map((song, i) => {
		const y = 104 + i * 26;
		const dot = ellipse(40, y + 9, 6, 6, 16);
		k.put('ink faint', k.line([[30, y + 22], [320, y + 22]], { w: 0.4, seed: 8010 + i, over: 0 }));
		k.say('print', 54, y + 14, song);
		return { key: song, hit: k.pathOf(rect(28, y, 294, 24), true), dot: k.wash(dot, 8020 + i, 0.5, 1), dotInk: k.outline(dot, { w: 0.9, seed: 8030 + i }) };
	});
	k.card(roundRect(10, 340, 340, 440, 10, 5), 8040, { paper: 'kraft-fill', shadow: 4 });
	k.say('pencil-text', 224, 430, 'drag onto the page');

	const piece = (key: keyof typeof SLOTS, draw: (x: number, y: number) => void, w: number, h: number) => {
		const [x, y] = SLOTS[key].tray;
		const art = k.group(() => draw(x, y));
		return { key, ...art, hit: k.pathOf(rect(x - 3, y - 3, w + 6, h + 6), true), shift: [SLOTS[key].page[0] - x, SLOTS[key].page[1] - y] as [number, number], text: { x: x + 10, y: y + 17 } };
	};
	const label = piece('label', (x, y) => {
		const poly = roundRect(x, y, x + 196, y + 26, 6, 4);
		k.put('paper', k.pathOf(poly, true));
		k.put('ink', k.outline(poly, { w: 1, seed: 8100 }));
	}, 196, 26);
	const cover = piece('cover', (x, y) => {
		k.put('paper', k.pathOf(rect(x, y, 76, 76), true));
		k.put('ink', k.outline(rect(x, y, 76, 76), { w: 1.2, heavy: 1, seed: 8110 }));
	}, 76, 76);
	const heading = piece('heading', (x, y) => {
		k.say('print title big', x + 4, y + 18, 'My playlist');
	}, 150, 24);
	const pictures = SONGS.map((song, i) => ({ key: song, art: k.group(() => k.picture(SLOTS.cover.tray[0] + 4, SLOTS.cover.tray[1] + 4, 68, 68, i, 8200 + i * 20)) }));

	k.card(roundRect(360, 30, 670, 440, 8, 5), 8300, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(362, 32, 306, 24), 0.1, 2.4, 8301, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[360, 56], [670, 56]], { w: 0.9, seed: 8302 }));
	k.say('print title', 372, 49, 'State graph');
	const node = (cx: number, cy: number, w: number, seed: number) => {
		const poly = roundRect(cx - w / 2, cy - 16, cx + w / 2, cy + 16, 14, 6);
		return { poly: k.pathOf(poly, true), ink: k.outline(poly, { w: 1.3, heavy: 1, seed }), wash: k.wash(poly, seed + 1, 0.8, 1.6), x: cx - w / 2 + 12, y: cy + 5 };
	};
	const arrow = (a: [number, number], b: [number, number], seed: number) => {
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		const head = (s: number) => k.stroke([[b[0] - Math.cos(ang + s) * 10, b[1] - Math.sin(ang + s) * 10], b], { w: 1.4, seed: seed + (s > 0 ? 1 : 2), over: 0.3 });
		const pts: [number, number][] = [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
		return { d: k.line(pts, { w: 1.6, heavy: 0.6, seed, over: 0.2 }) + head(0.45) + head(-0.45), length: Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) + 20) };
	};
	const source = node(430, 220, 100, 8310);
	const readers = {
		list: { node: node(590, 110, 130, 8320), edge: arrow([480, 210], [524, 120], 8330) },
		label: { node: node(590, 190, 130, 8340), edge: arrow([480, 216], [524, 194], 8350) },
		cover: { node: node(590, 270, 130, 8360), edge: arrow([480, 228], [524, 264], 8370) },
	};
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		rows,
		pieces: { label, cover, heading },
		pictures,
		page: [PAGE.x, PAGE.y, PAGE.w, PAGE.h] as [number, number, number, number],
		source,
		readers,
		tally: { x: 372, y: 400 },
		headingNote: { x: 372, y: 350 },
	};
}
