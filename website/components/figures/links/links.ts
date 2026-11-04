// The shop page with the next-page parcel on the desk: a wire from the nav to the parcel, and one from the parcel to the page area.
import { bezier, createScene, type Crate, ellipse, type P, type Point3, roundRect, sheetAt } from '../ink/scene.ts';
import { add3 } from '../kit/lathe.ts';
import { hatch, line, outline, pathOf, r1 } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

const NAV = { shop: { u: 14.2, v: 3.15, w: 2.6 }, about: { u: 17.4, v: 3.15, w: 2.9 }, h: 1.1 };
const PARCEL: Crate = { u: 24.2, v: -2.6, w: 5.4, d: 4, h: 3 };
export const CLIP = { rear: [15.4, 8.4] as P, tip: [13.1, 7.2] as P };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[PARCEL.u + PARCEL.w - 1.6 + 0.6, PARCEL.v - 8.8, 0],
		[PARCEL.u + PARCEL.w - 1.6 + 0.6, PARCEL.v + PARCEL.d - 8.8, 0],
		[PARCEL.u + PARCEL.w - 1.6, PARCEL.v - 8.8, PARCEL.h + 2.4],
		[PARCEL.u + PARCEL.w + 1.6, PARCEL.v + PARCEL.d - 8.8, 0],
	],
	target: [11, -2.2, 0.6],
});
const { proj, onSheet, sheetMatrix, cord, alongSheet, crocodile } = scene;

/** One nav link: a paper tab raised off the page so it can sink, with its word's matrix. */
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

/** The page area: a pencilled bracket round the middle of the page, the only part a click swaps. */
function area() {
	const box = onSheet(roundRect(1.1, 4.4, 12.6, 9.4, 0.5));
	return { pencil: pathOf(box, true), hatch: hatch(onSheet([[1.1, 9.4], [12.6, 9.4], [12.6, 9.7], [1.1, 9.7]]), 0.2, 1.6, 2210, { cluster: 3, skip: 0.3 }) };
}

/** The parcel the next page's middle arrives in, taped shut, with its address label. */
function parcelArt() {
	const box = scene.crate(PARCEL, 2500);
	const { w, d, h } = PARCEL;
	const face = (pts: [number, number][]) => box.poly(pts.map(([x, z]) => [x, d, z] as [number, number, number]));
	const tapeTop = box.poly([[w / 2 - 0.35, 0, h], [w / 2 + 0.35, 0, h], [w / 2 + 0.35, d, h], [w / 2 - 0.35, d, h]]);
	const tapeFront = face([[w / 2 - 0.35, h], [w / 2 + 0.35, h], [w / 2 + 0.35, h * 0.62], [w / 2 - 0.35, h * 0.62]]);
	const label = face([[0.45, h * 0.86], [w / 2 - 0.6, h * 0.86], [w / 2 - 0.6, h * 0.14], [0.45, h * 0.14]]);
	const lines = [0.68, 0.52, 0.36].map((z, i) => line(face([[0.7, h * z], [w / 2 - 0.9 - i * 0.25, h * z]]), { w: 0.55, seed: 2510 + i, over: 0 })).join('');
	const knot = box.world(w - 0.02, d - 0.02, h * 0.8);
	return {
		cast: box.cast,
		paper: box.paper,
		shade: box.shade,
		ink: box.ink + outline(tapeTop, { w: 0.7, seed: 2522 }) + outline(tapeFront, { w: 0.7, seed: 2523 }),
		tape: pathOf(tapeTop, true) + pathOf(tapeFront, true),
		tapeHatch: hatch(tapeTop, 0.4, 1.8, 2524, { cluster: 2, skip: 0.4, trim: 0.5 }),
		label: pathOf(label, true),
		labelInk: outline(label, { w: 0.8, seed: 2525 }) + lines,
		pencil: box.pencil,
		tag: scene.tag(knot, [0.55, 1, 0], 2540),
	};
}

const THIN_PATH: P[] = [
	[NAV.about.u + NAV.about.w - 0.3, NAV.about.v + 0.2],
	[21.2, 1.4],
	[22.2, -0.8],
	[23.4, -1.2],
	[PARCEL.u + 0.1, PARCEL.v + 1.4],
];

function wires() {
	const r = 0.24;
	const t = 0.13;
	const thin = cord(alongSheet(THIN_PATH, t - 0.02), t, 2600);
	const outStart: Point3 = [PARCEL.u - 1.6 + 1.0, PARCEL.v + PARCEL.d - 8.8 + 0.05, 0.6];
	const rear = CLIP.rear;
	const desk = alongSheet([[PARCEL.u + 0.8, PARCEL.v + PARCEL.d + 1.0], [PARCEL.u - 0.4, 4.4], [23.4, 6.4], [20.2, 8.2], [17.8, 8.8], [rear[0] + 0.6, rear[1] + 0.1], [rear[0], rear[1]]], r - 0.02);
	const main = cord([...bezier(outStart, add3(outStart, [0, 0.6, 0]), add3(desk[0]!, [0, -0.3, 0.2]), desk[0]!, 8), ...desk.slice(1)], r, 2700);
	const socket = onSheet(ellipse(PARCEL.u + 0.1, PARCEL.v + 1.4, 0.3, 0.26, 14), 0.4);
	return {
		thin,
		main,
		socket: { paper: pathOf(socket, true), ink: outline(socket, { w: 0.8, seed: 2610 }) },
		clip: crocodile(CLIP.rear, CLIP.tip, 2800),
	};
}

/** The whole scene, frozen into links.art.ts. */
export function drawing() {
	const shop = scene.shopArt();
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			bar: shop.bar,
			shopMatrix: shop.shopMatrix,
			bag: shop.bag,
			productMatrix: shop.productMatrix,
			priceMatrix: shop.priceMatrix,
			aboutMatrices: [sheetMatrix(1.6, 6.0), sheetMatrix(1.6, 7.4), sheetMatrix(1.6, 8.5)],
			nav: { shop: tab(NAV.shop.u, NAV.shop.v, NAV.shop.w, 2300), about: tab(NAV.about.u, NAV.about.v, NAV.about.w, 2320) },
			area: area(),
			urlSpot: scene.spot(6.4, 0.86, 3.6, 0.55, 2900),
			areaSpot: scene.spot(6.6, 6.9, 5.6, 2.2, 2910),
		},
		parcel: parcelArt(),
		wires: wires(),
		note: scene.note(proj(sheetAt(5.8, 9.9, 0.2)), 2960, [2, 384]),
	};
}
