// Two notebooks on the desk, one with a ribbon: shut both and open them again, and only the ribboned one opens at the reader's page.
import { createScene, type Crate, ellipse, type P, sheetAt } from '../ink/scene.ts';
import { hatch, line, outline, pathOf, r1, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 340;

const BOOKS: Crate[] = [
	{ u: 1.2, v: 2.4, w: 9.4, d: 9.4, h: 0.45 },
	{ u: 12.6, v: 2.4, w: 9.4, d: 9.4, h: 0.45 },
];
const TOP = 0.47;

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [sheetAt(6.4, -1.4, 0), sheetAt(11.6, -0.6, 0)],
	target: [9.6, -1.8, 0.4],
});
const { proj, onSheet, sheetMatrix } = scene;

/** One notebook lying open: its block, two pages with a gutter, a few written lines, and the cover it shuts with. */
function book(i: number) {
	const b = BOOKS[i]!;
	const seed = 5000 + i * 200;
	const block = scene.crate(b, seed);
	const mid = b.u + b.w / 2;
	const page = (u0: number, u1: number): P[] => {
		const pts: P[] = [];
		for (let k = 0; k <= 12; k++) pts.push([u0 + ((u1 - u0) * k) / 12, b.v - Math.sin((k / 12) * Math.PI) * 0.12]);
		pts.push([u1, b.v + b.d]);
		for (let k = 12; k >= 0; k--) pts.push([u0 + ((u1 - u0) * k) / 12, b.v + b.d - Math.sin((k / 12) * Math.PI) * 0.12]);
		return onSheet(pts, TOP);
	};
	const left = page(b.u + 0.15, mid);
	const right = page(mid, b.u + b.w - 0.15);
	const gutter = onSheet([[mid - 0.45, b.v], [mid, b.v], [mid, b.v + b.d], [mid - 0.45, b.v + b.d]], TOP);
	const writing = [2.2, 3.4, 4.6, 5.8, 7.0].flatMap((dv, k) => [
		line(onSheet([[b.u + 0.9, b.v + dv], [mid - 0.9 - (k % 2) * 1.1, b.v + dv]], TOP), { w: 0.45, seed: seed + 20 + k, over: 0 }),
		line(onSheet([[mid + 0.7, b.v + dv], [b.u + b.w - 1 - ((k + 1) % 2) * 1.4, b.v + dv]], TOP), { w: 0.45, seed: seed + 40 + k, over: 0 }),
	]).join('');
	const cover = onSheet([[b.u - 0.1, b.v - 0.1], [b.u + b.w + 0.1, b.v - 0.1], [b.u + b.w + 0.1, b.v + b.d + 0.1], [b.u - 0.1, b.v + b.d + 0.1]], TOP + 0.3);
	return {
		cast: block.cast,
		block: block.paper,
		blockShade: block.shade,
		blockInk: block.ink,
		pages: pathOf(left, true) + pathOf(right, true),
		pagesInk: outline(left, { w: 0.9, seed: seed + 1 }) + outline(right, { w: 0.9, seed: seed + 2 }) + line(onSheet([[mid, b.v + 0.1], [mid, b.v + b.d - 0.1]], TOP), { w: 1.1, seed: seed + 3, over: 0 }),
		gutter: hatch(gutter, 1.5, 1.2, seed + 4, { cluster: 3, skip: 0.3, trim: 0.4 }),
		writing,
		cover: pathOf(cover, true),
		coverTone: hatch(cover, 0.9, 2.4, seed + 5, { cluster: 5, skip: 0.3, trim: 0.5 }),
		coverInk: outline(cover, { w: 1.5, heavy: 1.2, seed: seed + 6 }),
		numberMatrix: sheetMatrix(b.u + b.w - 1.3, b.v + b.d - 0.7),
		spot: scene.spot(b.u + b.w - 1.05, b.v + b.d - 1.05, 0.9, 0.75, seed + 10),
		labelMatrix: sheetMatrix(b.u + 0.2, b.v + b.d + 1.6),
	};
}

/** The ribbon: from the spine of the first notebook, over its top edge, down across its right page, with a forked tail. */
function ribbon() {
	const b = BOOKS[0]!;
	const u = b.u + b.w / 2 + 0.55;
	const w = 0.8;
	const tail = b.v + b.d - 2.2;
	const onPage: P[] = [[u, b.v], [u + w, b.v], [u + w, tail], [u + w / 2, tail - 0.45], [u, tail]];
	const over: P[] = [[u, b.v - 1.6], [u + w, b.v - 1.5], [u + w, b.v], [u, b.v]];
	const page = onSheet(onPage, TOP + 0.04);
	const hang = onSheet(over, 0.05);
	return {
		paper: pathOf(page, true) + pathOf(hang, true),
		tone: hatch(page, 1.5, 1.1, 5600, { cluster: 3, skip: 0.2, trim: 0.3 }) + hatch(hang, 1.5, 1.1, 5601, { cluster: 3, skip: 0.2, trim: 0.3 }),
		ink: outline(page, { w: 1, heavy: 0.8, seed: 5602 }) + outline(hang, { w: 1, heavy: 0.8, seed: 5603 }) + stroke(onSheet([[u - 0.05, b.v], [u + w + 0.05, b.v]], TOP + 0.06), { w: 0.9, seed: 5604, over: 0.2 }),
	};
}

/** The reload button on the desk: a pink round button with a circular arrow, raised so it can sink. */
function reloadArt() {
	const u = 11.6;
	const v = 0.4;
	const r = 0.75;
	const disc = onSheet(ellipse(u, v, r, r, 30), 0.15);
	const side = onSheet(ellipse(u + 0.08, v + 0.12, r, r, 30));
	const arc = onSheet(
		Array.from({ length: 18 }, (_, i) => {
			const a = -0.9 + (i / 17) * 4.9;
			return [u + Math.cos(a) * r * 0.55, v + Math.sin(a) * r * 0.55] as P;
		}),
		0.17,
	);
	const tip = arc.at(-1)!;
	const before = arc.at(-4)!;
	const ang = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
	const head = (k: number): P[] => [[tip[0] - Math.cos(ang + k) * 4.4, tip[1] - Math.sin(ang + k) * 4.4], tip];
	const a = proj(sheetAt(u, v, 0.15));
	const b = proj(sheetAt(u + 0.06, v + 0.1, 0));
	return {
		side: pathOf(side, true),
		paper: pathOf(disc, true),
		wash: wash(disc, 5700, 0.8, 1.6),
		ink: outline(disc, { w: 1.1, heavy: 0.8, seed: 5701 }) + line(arc, { w: 1, seed: 5702, over: 0 }) + stroke(head(0.5), { w: 1, seed: 5703, over: 0.3 }) + stroke(head(-0.5), { w: 1, seed: 5704, over: 0.3 }),
		sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`,
	};
}

/** How far the ribbon travels when it is pulled out of the notebook, as a screen offset. */
function pull() {
	const b = BOOKS[0]!;
	const u = b.u + b.w / 2 + 0.95;
	const from = proj(sheetAt(u, b.v + 3, TOP));
	const to = proj(sheetAt(u - 2.4, b.v - 0.6, 0.05));
	return `--pull-x:${r1(to[0] - from[0])}px;--pull-y:${r1(to[1] - from[1])}px`;
}

/** The whole scene, frozen into bookmark.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		books: [book(0), book(1)] as const,
		ribbon: ribbon(),
		reload: reloadArt(),
		pull: pull(),
	};
}
