// A music page you build by dragging pieces onto it, beside an inspector that draws, left to right, the graph those pieces make: states, computed values, readers.
import { ellipse, flatKit, rect, roundRect } from '../how/flat-kit.ts';
import { EDGES, NODES, type NodeKey, type PieceKey, SONGS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 470;

const PAGE = { x: 10, y: 30, w: 322, h: 300 };
/** Where each piece sits in the tray, where it lands on the page, and its size. */
const SLOTS: Record<PieceKey, { tray: [number, number]; page: [number, number]; w: number; h: number }> = {
	heading: { tray: [216, 400], page: [28, 62], w: 112, h: 24 },
	header: { tray: [22, 356], page: [28, 90], w: 196, h: 28 },
	heart: { tray: [232, 356], page: [282, 90], w: 36, h: 28 },
	cover: { tray: [22, 392], page: [28, 128], w: 64, h: 64 },
	knob: { tray: [96, 400], page: [28, 272], w: 112, h: 40 },
};
const COLUMN_X = [392, 500, 614];
const COLUMN_W = [76, 80, 104];
const ROW_Y: Record<NodeKey, number> = { playing: 172, liked: 332, volume: 404, cover: 92, title: 212, isLiked: 282, img: 92, rowClass: 152, h2: 212, heartClass: 282, volumeText: 404 };

export function drawing() {
	const k = flatKit('g');
	k.windowFrame(PAGE.x, PAGE.y, PAGE.w, PAGE.h, 'music.app', 8000);
	k.put('pencil', k.line([[28, 62], [140, 62], [140, 86], [28, 86], [28, 62]], { w: 0.5, seed: 8001, over: 0 }));
	k.put('pencil', k.line([[28, 90], [224, 90], [224, 118], [28, 118], [28, 90]], { w: 0.5, seed: 8002, over: 0 }));
	k.put('pencil', k.line([[28, 128], [92, 128], [92, 192], [28, 192], [28, 128]], { w: 0.5, seed: 8003, over: 0 }));
	k.put('pencil', k.line([[282, 90], [318, 90], [318, 118], [282, 118], [282, 90]], { w: 0.5, seed: 8005, over: 0 }));
	k.put('pencil', k.line([[28, 272], [140, 272], [140, 312], [28, 312], [28, 272]], { w: 0.5, seed: 8004, over: 0 }));
	const rows = SONGS.map((song, i) => {
		const y = 128 + i * 28;
		const dot = ellipse(116, y + 11, 6, 6, 16);
		k.put('ink faint', k.line([[104, y + 25], [322, y + 25]], { w: 0.4, seed: 8010 + i, over: 0 }));
		k.say('print', 130, y + 16, song);
		return { key: song, hit: k.pathOf(rect(102, y, 222, 26), true), dot: k.wash(dot, 8020 + i, 0.5, 1), dotInk: k.outline(dot, { w: 0.9, seed: 8030 + i }) };
	});
	k.card(roundRect(10, 344, 332, 458, 10, 5), 8040, { paper: 'kraft-fill', shadow: 4 });
	k.say('pencil-text', 216, 448, 'drag onto the page');

	const piece = (key: PieceKey, draw: (x: number, y: number) => void) => {
		const slot = SLOTS[key];
		const [x, y] = slot.tray;
		const art = k.group(() => draw(x, y));
		return { key, ...art, box: [x, y, slot.w, slot.h] as [number, number, number, number], hit: k.pathOf(rect(x - 3, y - 3, slot.w + 6, slot.h + 6), true), shift: [slot.page[0] - x, slot.page[1] - y] as [number, number], text: { x: x + 8, y: y + slot.h / 2 + 5 } };
	};
	const framed = (key: PieceKey, seed: number) => (x: number, y: number) => {
		const poly = roundRect(x, y, x + SLOTS[key].w, y + SLOTS[key].h, 6, 4);
		k.put('paper', k.pathOf(poly, true));
		k.put('ink', k.outline(poly, { w: 1, seed }));
	};
	const header = piece('header', framed('header', 8100));
	const heart = piece('heart', framed('heart', 8105));
	const cover = piece('cover', (x, y) => {
		k.put('paper', k.pathOf(rect(x, y, 64, 64), true));
		k.put('ink', k.outline(rect(x, y, 64, 64), { w: 1.2, heavy: 1, seed: 8110 }));
	});
	const knob = piece('knob', (x, y) => {
		framed('knob', 8115)(x, y);
		const dial = ellipse(x + 20, y + 20, 12, 12, 24);
		k.put('paper', k.pathOf(dial, true));
		k.put('ink', k.outline(dial, { w: 1.1, seed: 8116 }));
	});
	const heading = piece('heading', (x, y) => {
		k.say('print title big', x + 4, y + 18, 'My playlist');
	});
	const pictures = SONGS.map((song, i) => ({ key: song, art: k.group(() => k.picture(SLOTS.cover.tray[0] + 4, SLOTS.cover.tray[1] + 4, 56, 56, i, 8200 + i * 20)) }));

	k.card(roundRect(344, 30, 672, 458, 8, 5), 8300, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(346, 32, 324, 24), 0.1, 2.4, 8301, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[344, 56], [672, 56]], { w: 0.9, seed: 8302 }));
	k.say('print title', 356, 49, 'State graph');
	k.say('pencil-text', 362, 74, 'state');
	k.say('pencil-text', 476, 74, 'computed');
	k.say('pencil-text', 590, 74, 'reads it');

	const nodes = (Object.keys(NODES) as NodeKey[]).map((key, i) => {
		const { column, label } = NODES[key];
		const cx = COLUMN_X[column]!;
		const w = COLUMN_W[column]!;
		const cy = ROW_Y[key];
		const poly = roundRect(cx - w / 2, cy - 14, cx + w / 2, cy + 14, 12, 6);
		const roots = column === 0 ? [key] : [...new Set(EDGES.filter((edge) => edge.to === key).flatMap((edge) => edge.roots))];
		return { key, label, column, roots: roots.join(' '), poly: k.pathOf(poly, true), ink: k.outline(poly, { w: 1.2, heavy: 1, seed: 8400 + i * 3 }), wash: k.wash(poly, 8401 + i * 3, 0.8, 1.6), x: cx - w / 2 + 9, y: cy + 4 };
	});
	const edges = EDGES.map((edge) => {
		const a = NODES[edge.from].column;
		const b = NODES[edge.to].column;
		const x1 = COLUMN_X[a]! + COLUMN_W[a]! / 2;
		const y1 = ROW_Y[edge.from];
		const x2 = COLUMN_X[b]! - COLUMN_W[b]! / 2 - 4;
		const y2 = ROW_Y[edge.to];
		const dx = (x2 - x1) / 2;
		const d = `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
		const head = `M${x2 - 7} ${y2 - 4}L${x2} ${y2}L${x2 - 7} ${y2 + 4}`;
		return { key: edge.key, to: edge.to, roots: edge.roots.join(' '), d, head, length: Math.round(Math.hypot(x2 - x1, y2 - y1) * 1.15 + 12) };
	});
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		rows,
		pieces: { header, heart, cover, knob, heading },
		pictures,
		page: [PAGE.x, PAGE.y, PAGE.w, PAGE.h] as [number, number, number, number],
		nodes,
		edges,
		tally: { x: 356, y: 446 },
		headingNote: { x: 468, y: 352 },
	};
}
