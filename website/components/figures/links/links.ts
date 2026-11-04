// The shop drawn as a magazine on the desk: the cover and masthead stay, the centre spread slides out and a new one slides in, and the spine label changes once it is in.
import { createScene, ellipse, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { matrixOf } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, r1, stroke } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

const SPINE = 1.1;
const NAV = { shop: { u: 14.4, v: 1.0, w: 2.6 }, about: { u: 17.6, v: 1.0, w: 2.9 }, h: 1.1 };
const SPREAD = { u0: 1.6, u1: 20.4, v0: 4.6, v1: 13.3, fold: 11.0 };
const LIFT = 0.14;
/** How far a spread travels as it is pulled out or slid in, in sheet centimetres. */
const TRAVEL = 9;

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [sheetAt(SPREAD.u1 + TRAVEL * 0.4, SPREAD.v0), sheetAt(SPREAD.u1 + TRAVEL * 0.4, SPREAD.v1)],
	target: [9.6, -1.8, 0.4],
});
const { proj, onSheet, sheetMatrix } = scene;

/** One nav link on the cover: a paper tab raised off the page so it can sink, with its word's matrix. */
function tab(u: number, v: number, w: number, seed: number) {
	const h = NAV.h;
	const face = onSheet(roundRect(u, v, u + w, v + h, 0.35), 0.1);
	const side = onSheet(roundRect(u + 0.07, v + 0.1, u + w + 0.07, v + h + 0.1, 0.35));
	const a = proj(sheetAt(u, v, 0.1));
	const b = proj(sheetAt(u + 0.06, v + 0.08, 0));
	return {
		side: pathOf(side, true),
		paper: pathOf(face, true),
		wash: scene.spot(u + w / 2, v + h / 2, w / 2, h / 2, seed).wash,
		ink: outline(face, { w: 1, heavy: 0.7, seed: seed + 3 }),
		matrix: sheetMatrix(u + w / 2, v + h * 0.72),
		sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`,
	};
}

/** The bound edge on the left: a hatched spine with its label running up it. */
function spineArt() {
	const band = onSheet([[0, 0], [SPINE, 0], [SPINE, 14.8], [0, 14.8]], 0.01);
	const label = onSheet(roundRect(0.18, 3.4, SPINE - 0.18, 12.6, 0.25), 0.03);
	const at = (u: number, v: number) => proj(sheetAt(u, v, 0.03));
	return {
		paper: pathOf(band, true),
		tone: hatch(band, 1.4, 1.6, 3010, { cluster: 4, skip: 0.2, trim: 0.4 }),
		ink: line(onSheet([[SPINE, 0], [SPINE, 14.8]]), { w: 1.1, seed: 3011, over: 0.3 }),
		label: pathOf(label, true),
		labelInk: outline(label, { w: 0.8, seed: 3012 }),
		labelMatrix: matrixOf(at(0.74, 12.1), at(0.74, 12.0), at(0.84, 12.1)),
		spot: scene.spot(SPINE / 2, 8, 0.5, 4.6, 3020),
	};
}

/** The masthead's rule under the shop name, and its issue line. */
function mastheadArt() {
	return {
		rule: line(onSheet([[2.2, 3.0], [21.8, 3.0]]), { w: 1.2, seed: 3030, over: 0.4 }) + line(onSheet([[2.2, 3.2], [21.8, 3.2]]), { w: 0.6, seed: 3031, over: 0.2 }),
		shopMatrix: sheetMatrix(2.2, 2.4),
		issueMatrix: sheetMatrix(2.3, 4.0),
	};
}

/** A centre spread: two facing pages on a loose insert, its fold, its pull tab and its shadow on the cover. */
function spreadArt(seed: number) {
	const { u0, u1, v0, v1, fold } = SPREAD;
	const sheet = onSheet([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], LIFT);
	const tabPoly = onSheet(roundRect(u1 - 0.1, 7.6, u1 + 1.1, 9.4, 0.3), LIFT);
	const shadow = onSheet([[u0 + 0.3, v1], [u1 + 0.25, v1], [u1 + 0.25, v0 + 0.3], [u1, v0 + 0.3], [u1, v1 - 0.05], [u0 + 0.3, v1 - 0.05]], 0.01);
	const foldLine = onSheet([[fold, v0 + 0.15], [fold, v1 - 0.15]], LIFT);
	const gutter = onSheet([[fold - 0.5, v0], [fold, v0], [fold, v1], [fold - 0.5, v1]], LIFT);
	return {
		shadow: hatch(shadow, -0.7, 1.2, seed, { cluster: 2, trim: 0.1 }),
		paper: pathOf(sheet, true),
		ink: outline(sheet, { w: 1.3, heavy: 1, seed: seed + 1 }) + line(foldLine, { w: 0.8, seed: seed + 2, over: 0 }),
		gutter: hatch(gutter, 1.5, 1.4, seed + 3, { cluster: 3, skip: 0.3, trim: 0.5 }),
		tab: pathOf(tabPoly, true),
		tabInk: outline(tabPoly, { w: 0.9, seed: seed + 4 }),
		spot: scene.spot((u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) / 2 - 0.4, (v1 - v0) / 2 - 0.4, seed + 10),
	};
}

/** A small coffee cup for the About spread, drawn on the page. */
function cupArt() {
	const body = onSheet([[13.2, 6.2], [15.6, 6.2], [15.3, 8.6], [13.5, 8.6]], LIFT);
	const handle = onSheet(Array.from({ length: 9 }, (_, i) => {
		const a = -Math.PI / 2 + (i / 8) * Math.PI;
		return [15.5 + Math.cos(a) * 0.55, 7.1 + Math.sin(a) * 0.55] as P;
	}), LIFT);
	const saucer = onSheet(ellipse(14.4, 8.75, 1.7, 0.3, 24), LIFT);
	const steam = [12.9, 14.4].map((u, i) =>
		stroke(onSheet([[u + 0.6, 5.9], [u + 0.3, 5.4], [u + 0.7, 4.9], [u + 0.4, 4.5]], LIFT), { w: 0.7, seed: 3060 + i, over: 0 }),
	);
	return {
		paper: pathOf(body, true),
		ink: outline(body, { w: 1, heavy: 0.8, seed: 3061 }) + line(handle, { w: 0.9, seed: 3062, over: 0 }) + outline(saucer, { w: 0.8, seed: 3063 }) + steam.join(''),
		shade: hatch(onSheet([[14.8, 6.3], [15.6, 6.2], [15.3, 8.6], [14.7, 8.6]], LIFT), 1.2, 1.3, 3064, { cluster: 3, trim: 0.3 }),
	};
}

/** The screen offset a spread travels, so CSS can slide it out and in along the desk. */
function travel() {
	const c = sheetAt((SPREAD.u0 + SPREAD.u1) / 2, (SPREAD.v0 + SPREAD.v1) / 2, LIFT);
	const a = proj(c);
	const b = proj([c[0] + TRAVEL, c[1] - 1.6, c[2] + 0.6]);
	return `--away-x:${r1(b[0] - a[0])}px;--away-y:${r1(b[1] - a[1])}px`;
}

/** The whole scene, frozen into links.art.ts. */
export function drawing() {
	const shop = scene.shopArt();
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		spine: spineArt(),
		masthead: mastheadArt(),
		nav: { shop: tab(NAV.shop.u, NAV.shop.v, NAV.shop.w, 2300), about: tab(NAV.about.u, NAV.about.v, NAV.about.w, 2320) },
		spread: spreadArt(3100),
		home: {
			bag: shop.bag,
			productMatrix: sheetMatrix(4.6, 6.1),
			priceMatrix: sheetMatrix(4.6, 7.5),
			rightMatrices: [sheetMatrix(11.7, 6.3), sheetMatrix(11.7, 7.4), sheetMatrix(11.7, 8.5)],
		},
		about: {
			titleMatrix: sheetMatrix(2.6, 6.4),
			lineMatrices: [sheetMatrix(2.6, 7.7), sheetMatrix(2.6, 8.8), sheetMatrix(2.6, 9.9)],
			cup: cupArt(),
			captionMatrix: sheetMatrix(12.6, 10.4),
		},
		travel: travel(),
		note: scene.note(proj(sheetAt(5.4, 0.9, 0.2)), 2960),
	};
}
