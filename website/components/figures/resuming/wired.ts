// The shop page as the server sent it, lying beside its envelope: the wires from the envelope's view record are inked before anything runs.
import { bezier, createScene, type Crate, ellipse, type P, type Point3, roundRect, sheetAt } from '../ink/scene.ts';
import { add3 } from '../kit/lathe.ts';
import { centreOf } from '../ink/desk.ts';
import { hatch, lengthOf, line, outline, pathOf, pool, r1, seeded, wash } from '../ink/ink.ts';
import { SLOTS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 420;

export const ROW = { u: 1.4, v: 12.7 };
const NOW_U = ROW.u + SLOTS[1] / 10;
const BUTTON = { u0: 1.3, v0: 8.95, u1: 8.6, v1: 10.95 };
const ENVELOPE: Crate = { u: 24.4, v: -1.4, w: 5.8, d: 4.2, h: 0.7 };
export const CLIP = { rear: [15.2, 10.6] as P, tip: [12.5, 11.85] as P };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[ENVELOPE.u + ENVELOPE.w - 1.6 + 0.6, ENVELOPE.v - 8.8, 0],
		[ENVELOPE.u + ENVELOPE.w - 1.6 + 0.6, ENVELOPE.v + ENVELOPE.d - 8.8, 0],
		[ENVELOPE.u + ENVELOPE.w - 1.6, ENVELOPE.v - 8.8, ENVELOPE.h + 3],
		[ENVELOPE.u + ENVELOPE.w + 1.6, ENVELOPE.v + ENVELOPE.d - 8.8, 0],
	],
	target: [11, -2.2, 0.6],
});
const { proj, onSheet, sheetMatrix, cord, alongSheet, crocodile } = scene;

/** The pink Add to cart button, raised off the page so it can sink. */
function buttonArt() {
	const { u0, v0, u1, v1 } = BUTTON;
	const face = onSheet(roundRect(u0, v0, u1, v1, 0.4), 0.12);
	const side = onSheet([[u1, v0 + 0.3], [u1, v1], [u0 + 0.3, v1], [u0 + 0.3, v1 + 0.2], [u1 + 0.2, v1 + 0.2], [u1 + 0.2, v0 + 0.3]]);
	const a = proj(sheetAt(4, v0 + 1, 0.12));
	const b = proj(sheetAt(4.08, v0 + 1.1, 0));
	return {
		paper: pathOf(face, true),
		wash: wash(face, 490, 1.5, 3.5),
		pool: wash(pool(face, face[8]!, 0.5), 491, 0.6, 2),
		side: hatch(side, 0.95, 1.4, 492, { cluster: 1 }) + outline(side, { w: 0.8, seed: 493 }),
		ink: outline(face, { w: 1.5, heavy: 1.3, centre: centreOf(face), seed: 494 }),
		matrix: sheetMatrix((u0 + u1) / 2, (v0 + v1) / 2 + 0.32),
		sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`,
	};
}

/** The server's envelope: a flat paper parcel with its flap folds, a record card sticking out, and a tag naming the record. */
function envelopeArt() {
	const box = scene.crate(ENVELOPE, 2500);
	const { w, d, h } = ENVELOPE;
	const top = (pts: P[]) => box.poly(pts.map(([x, y]) => [x, y, h] as [number, number, number]));
	const flap = line(top([[0.1, 0.1], [w / 2, d * 0.58], [w - 0.1, 0.1]]), { w: 0.8, seed: 2510, over: 0 });
	const folds = line(top([[0.1, d - 0.1], [w * 0.38, d * 0.62]]), { w: 0.55, seed: 2511, over: 0 }) + line(top([[w - 0.1, d - 0.1], [w * 0.62, d * 0.62]]), { w: 0.55, seed: 2512, over: 0 });
	const card = box.poly([[w * 0.2, -1.5, h + 0.02], [w * 0.8, -1.5, h + 0.02], [w * 0.8, 0.9, h + 0.02], [w * 0.2, 0.9, h + 0.02]]);
	const cardLines = [-1.05, -0.65, -0.25].map((y, i) => line(box.poly([[w * 0.28, y, h + 0.03], [w * (0.72 - i * 0.08), y, h + 0.03]]), { w: 0.5, seed: 2520 + i, over: 0 })).join('');
	const knot = box.world(w - 0.02, d - 0.02, h * 0.8);
	return {
		cast: box.cast,
		paper: box.paper,
		tone: wash(top([[0, 0], [w, 0], [w, d], [0, d]]), 2530, 0.6, 2),
		shade: box.shade,
		ink: box.ink + flap + folds,
		card: { paper: pathOf(card, true), ink: outline(card, { w: 0.8, seed: 2531 }) + cardLines },
		pencil: box.pencil,
		tag: scene.tag(knot, [0.55, 1, 0], 2540),
	};
}

/** The pen stroke that crosses out the previous count on the cart line, in the text's own millimetres. */
function strike() {
	const rnd = seeded(2950);
	const x = SLOTS[0];
	const pts: P[] = [
		[x - 1.1, -1.1 + rnd() * 0.7],
		[x + 3.5, -2.4 + rnd() * 0.4],
		[x + 8.7, -4.5 + rnd() * 0.7],
	];
	return { d: `M${r1(pts[0]![0])} ${r1(pts[0]![1])}Q${r1(pts[1]![0])} ${r1(pts[1]![1])} ${r1(pts[2]![0])} ${r1(pts[2]![1])}`, length: r1(lengthOf(pts) + 1) };
}

const THIN_PATH: P[] = [
	[BUTTON.u1 + 0.25, BUTTON.v0 + 0.9],
	[11.2, 9.2],
	[17.5, 6.1],
	[21.6, 2.4],
	[23.4, 0.2],
	[ENVELOPE.u + 0.2, ENVELOPE.v + 1.2],
];

function wires() {
	const r = 0.24;
	const t = 0.13;
	const thin = cord(alongSheet(THIN_PATH, t - 0.02), t, 2600);
	const outStart: Point3 = [ENVELOPE.u - 1.6 + 1.2, ENVELOPE.v + ENVELOPE.d - 8.8 + 0.05, 0.4];
	const rear = CLIP.rear;
	const desk = alongSheet([[ENVELOPE.u + 1.2, ENVELOPE.v + ENVELOPE.d + 1.0], [ENVELOPE.u - 0.2, 6.2], [23.6, 8.6], [20.4, 10.0], [rear[0] + 0.6, rear[1] - 0.1], [rear[0], rear[1]]], r - 0.02);
	const main = cord([...bezier(outStart, add3(outStart, [0, 0.6, 0]), add3(desk[0]!, [0, -0.3, 0.2]), desk[0]!, 8), ...desk.slice(1)], r, 2700);
	const socket = onSheet(ellipse(ENVELOPE.u + 0.2, ENVELOPE.v + 1.2, 0.3, 0.26, 14), 0.4);
	return {
		thin,
		main,
		socket: { paper: pathOf(socket, true), ink: outline(socket, { w: 0.8, seed: 2610 }) },
		clip: crocodile(CLIP.rear, CLIP.tip, 2800),
	};
}

/** The whole scene, frozen into wired.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			...scene.shopArt(),
			rowMatrix: sheetMatrix(ROW.u, ROW.v),
			spot: scene.spot(NOW_U + 0.63, ROW.v - 0.62, 0.9, 0.85, 2900),
			button: buttonArt(),
		},
		strike: strike(),
		envelope: envelopeArt(),
		wires: wires(),
		note: scene.note(proj(sheetAt(21.6, 1.6, 0.2)), 2960),
	};
}
