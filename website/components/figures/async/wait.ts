// The shop page with the `arrives` parcel on the desk: one wire from the parcel to the arrival spot, which holds pencil words until the date comes back.
import { bezier, createScene, type Crate, ellipse, type P, type Point3, sheetAt } from '../ink/scene.ts';
import { add3 } from '../kit/lathe.ts';
import { hatch, line, outline, pathOf, r1, seeded, stroke, wash } from '../ink/ink.ts';
import { ARRIVE_SLOT } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

export const ROW = { u: 1.4, v: 9.75 };
const RELOAD = { u: 12.6, v: 0.85, r: 0.5 };
const PARCEL: Crate = { u: 24.2, v: -2.6, w: 5.4, d: 4, h: 3 };

export const CLIP = { rear: [17.2, 7.3] as P, tip: [14.6, 8.85] as P };

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

/** The reload button in the browser bar: a pink round button with a circular arrow, raised off the page so it can sink. */
function reloadArt() {
	const { u, v, r } = RELOAD;
	const disc = onSheet(ellipse(u, v, r, r, 30), 0.1);
	const side = onSheet(ellipse(u + 0.08, v + 0.1, r, r, 30));
	const arc = onSheet(
		Array.from({ length: 18 }, (_, i) => {
			const a = -0.9 + (i / 17) * 4.9;
			return [u + Math.cos(a) * r * 0.55, v + Math.sin(a) * r * 0.55] as P;
		}),
		0.12,
	);
	const tip = arc.at(-1)!;
	const before = arc.at(-4)!;
	const ang = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
	const head = (s: number): P[] => [[tip[0] - Math.cos(ang + s) * 3.2, tip[1] - Math.sin(ang + s) * 3.2], tip];
	const a = proj(sheetAt(u, v, 0.1));
	const b = proj(sheetAt(u + 0.06, v + 0.08, 0));
	return {
		side: pathOf(side, true),
		paper: pathOf(disc, true),
		wash: wash(disc, 2400, 0.8, 1.6),
		ink: outline(disc, { w: 1.1, heavy: 0.8, seed: 2401 }) + line(arc, { w: 0.9, seed: 2402, over: 0 }) + stroke(head(0.5), { w: 0.9, seed: 2403, over: 0.3 }) + stroke(head(-0.5), { w: 0.9, seed: 2404, over: 0.3 }),
		sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`,
	};
}

/** The `arrives` parcel: taped shut, a shipping label on its front, and a stamp where the date lands. */
function parcelArt() {
	const box = scene.crate(PARCEL, 2500);
	const { w, d, h } = PARCEL;
	const face = (pts: [number, number][]) => box.poly(pts.map(([x, z]) => [x, d, z] as [number, number, number]));
	const tapeTop = box.poly([[w / 2 - 0.35, 0, h], [w / 2 + 0.35, 0, h], [w / 2 + 0.35, d, h], [w / 2 - 0.35, d, h]]);
	const tapeFront = face([[w / 2 - 0.35, h], [w / 2 + 0.35, h], [w / 2 + 0.35, h * 0.62], [w / 2 - 0.35, h * 0.62]]);
	const label = face([[0.45, h * 0.86], [w / 2 - 0.6, h * 0.86], [w / 2 - 0.6, h * 0.14], [0.45, h * 0.14]]);
	const lines = [0.68, 0.52, 0.36].map((z, i) => line(face([[0.7, h * z], [w / 2 - 0.9 - i * 0.25, h * z]]), { w: 0.55, seed: 2510 + i, over: 0 })).join('');
	const stampAt: [number, number] = [w * 0.74, h * 0.45];
	const ring = (rx: number, ry: number, n: number) => face(ellipse(stampAt[0], stampAt[1], rx, ry, n));
	const stamp = ring(0.66, 0.6, 26);
	const knot = box.world(w - 0.02, d - 0.02, h * 0.8);
	return {
		cast: box.cast,
		paper: box.paper,
		kraft: wash(face([[0, 0], [w, 0], [w, h], [0, h]]), 2520, 0.8, 2) + wash(box.poly([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]]), 2521, 0.6, 2),
		shade: box.shade,
		ink: box.ink + outline(tapeTop, { w: 0.7, seed: 2522 }) + outline(tapeFront, { w: 0.7, seed: 2523 }),
		tape: pathOf(tapeTop, true) + pathOf(tapeFront, true),
		tapeHatch: hatch(tapeTop, 0.4, 1.8, 2524, { cluster: 2, skip: 0.4, trim: 0.5 }),
		label: pathOf(label, true),
		labelInk: outline(label, { w: 0.8, seed: 2525 }) + lines,
		stamp: {
			paper: pathOf(stamp, true),
			wash: wash(stamp, 2530, 0.8, 1.8),
			ink: outline(stamp, { w: 1, heavy: 0.6, seed: 2531 }) + outline(ring(0.52, 0.47, 22), { w: 0.5, seed: 2532 }),
			matrix: box.frontMatrix(stampAt[0], stampAt[1] - 0.14),
		},
		pencil: box.pencil,
		tag: scene.tag(knot, [0.55, 1, 0], 2540),
	};
}

/** A loose pen line through the pencil placeholder, in the text's own millimetres. */
function scratch(x0: number, x1: number, seed: number) {
	const rnd = seeded(seed);
	const pts: P[] = [
		[x0 - 2, -3 + rnd()],
		[(x0 + x1) / 2, -4.6 + rnd()],
		[x1 + 2, -6.2 + rnd()],
	];
	const length = Math.hypot(pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1]) + Math.hypot(pts[2]![0] - pts[1]![0], pts[2]![1] - pts[1]![1]) + 1;
	return { d: `M${r1(pts[0]![0])} ${r1(pts[0]![1])}Q${r1(pts[1]![0])} ${r1(pts[1]![1])} ${r1(pts[2]![0])} ${r1(pts[2]![1])}`, length: r1(length) };
}

const THIN_PATH: P[] = [
	[RELOAD.u + 0.45, RELOAD.v - 0.2],
	[RELOAD.u + 1.4, -0.6],
	[16, -1.4],
	[20.5, -1.9],
	[23.2, -1.1],
	[PARCEL.u + 0.1, PARCEL.v + 1.4],
];

function wires() {
	const r = 0.24;
	const t = 0.13;
	const thin = cord(alongSheet(THIN_PATH, t - 0.02), t, 2600);
	const outStart: Point3 = [PARCEL.u - 1.6 + 1.0, PARCEL.v + PARCEL.d - 8.8 + 0.05, 0.6];
	const rear = CLIP.rear;
	const desk = alongSheet([[PARCEL.u + 0.8, PARCEL.v + PARCEL.d + 1.0], [PARCEL.u - 0.4, 4.4], [23.6, 5.9], [20.4, 6.9], [rear[0] + 0.6, rear[1] - 0.1], [rear[0], rear[1]]], r - 0.02);
	const main = cord([...bezier(outStart, add3(outStart, [0, 0.6, 0]), add3(desk[0]!, [0, -0.3, 0.2]), desk[0]!, 8), ...desk.slice(1)], r, 2700);
	const socket = onSheet(ellipse(PARCEL.u + 0.1, PARCEL.v + 1.4, 0.3, 0.26, 14), 0.4);
	return {
		thin,
		main,
		socket: { paper: pathOf(socket, true), ink: outline(socket, { w: 0.8, seed: 2610 }) },
		clip: crocodile(CLIP.rear, CLIP.tip, 2800),
	};
}

/** The whole scene, frozen into wait.art.ts. */
export function drawing() {
	const slotU = ROW.u + ARRIVE_SLOT / 10;
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			...scene.shopArt(),
			rowMatrix: sheetMatrix(ROW.u, ROW.v),
			roastMatrix: sheetMatrix(ROW.u, 11.7),
			returnsMatrix: sheetMatrix(ROW.u, 13.1),
			spot: scene.spot(slotU + 3.1, ROW.v - 0.62, 3.6, 0.9, 2900),
			reload: reloadArt(),
		},
		scratch: scratch(ARRIVE_SLOT, ARRIVE_SLOT + 52, 2950),
		parcel: parcelArt(),
		wires: wires(),
		note: scene.note(proj(sheetAt(17.5, -1.55, 0.2)), 2960),
	};
}
