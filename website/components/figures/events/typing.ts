// The shop page with a name field and the `name` box on the desk: a key press sends the browser's input event down the handler's wire into the box, and the preview follows.
import { bezier, createScene, type Crate, ellipse, type P, type Point3, roundRect, sheetAt } from '../ink/scene.ts';
import { add3 } from '../kit/lathe.ts';
import { hatch, outline, pathOf, r1, seeded, wash } from '../ink/ink.ts';
import { PREVIEW_NEW, PREVIEW_OLD } from './typing-model.ts';

export const WIDTH = 680;
export const HEIGHT = 420;

export const LABEL_ROW = { u: 1.4, v: 9.2 };
export const PREVIEW_ROW = { u: 1.4, v: 13.2 };
const FIELD = { u0: 1.4, v0: 9.7, u1: 9.8, v1: 11.1 };
const NAME_BOX: Crate = { u: 24.6, v: -0.6, w: 4.6, d: 3.6, h: 3 };

export const PREVIEW_CLIP = { rear: [17.4, 13.8] as P, tip: [14.4, 12.95] as P };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[NAME_BOX.u + NAME_BOX.w - 1.6 + 0.6, NAME_BOX.v - 8.8, 0],
		[NAME_BOX.u + NAME_BOX.w - 1.6, NAME_BOX.v - 8.8, NAME_BOX.h + 2.4],
		[NAME_BOX.u + NAME_BOX.w - 1.6 + 1, NAME_BOX.v + NAME_BOX.d - 8.8 + 3, 0],
	],
	target: [11.6, -1.6, 0.6],
});
const { proj, onSheet, sheetMatrix, cord, alongSheet, crocodile } = scene;

/** The text field on the page: an inked box with a caret, its text placed by a matrix. */
function fieldArt() {
	const { u0, v0, u1, v1 } = FIELD;
	const box = onSheet(roundRect(u0, v0, u1, v1, 0.2));
	const inset = onSheet([[u0 + 0.12, v0 + 0.12], [u1 - 0.12, v0 + 0.12], [u1 - 0.12, v0 + 0.34], [u0 + 0.12, v0 + 0.34]]);
	return {
		paper: pathOf(box, true),
		ink: outline(box, { w: 1.1, heavy: 0.9, seed: 4010 }),
		inset: hatch(inset, 0.05, 1.6, 4011, { cluster: 6, skip: 0.2 }),
		wash: wash(box, 4012, 0.6, 1.6),
		matrix: sheetMatrix(u0 + 0.4, v0 + 1.0),
	};
}

/** The `name` box: a kraft box with what it holds written on its front label. */
function nameArt() {
	const box = scene.crate(NAME_BOX, 4100);
	const { w, d, h } = NAME_BOX;
	const face = (pts: [number, number][]) => box.poly(pts.map(([x, z]) => [x, d, z] as [number, number, number]));
	const label = face([[0.4, h * 0.8], [w - 0.4, h * 0.8], [w - 0.4, h * 0.22], [0.4, h * 0.22]]);
	return {
		cast: box.cast,
		paper: box.paper,
		kraft: wash(face([[0, 0], [w, 0], [w, h], [0, h]]), 4120, 0.8, 2) + wash(box.poly([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]]), 4121, 0.6, 2),
		shade: box.shade,
		ink: box.ink,
		label: pathOf(label, true),
		labelInk: outline(label, { w: 0.8, seed: 4125 }),
		valueMatrix: box.frontMatrix(w / 2, h * 0.38),
		pencil: box.pencil,
		tag: scene.tag(box.world(w - 0.02, d - 0.02, h * 0.82), [0.55, 1, 0], 4140),
	};
}

/** A loose pen line through the old preview, in the text's own units. */
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

function wires() {
	const r = 0.24;
	const t = 0.16;
	const handlerPath: P[] = [
		[FIELD.u1 + 0.05, (FIELD.v0 + FIELD.v1) / 2],
		[12.6, 9.6],
		[17.8, 7.2],
		[21.8, 4.2],
		[23.6, 2.2],
		[NAME_BOX.u + 0.1, NAME_BOX.v + 1.6],
	];
	const handler = cord(alongSheet(handlerPath, t - 0.02), t, 4300);
	const socket = onSheet(ellipse(NAME_BOX.u + 0.1, NAME_BOX.v + 1.6, 0.3, 0.26, 14), 0.4);
	const start: Point3 = sheetAt(NAME_BOX.u + 1, NAME_BOX.v + NAME_BOX.d + 0.05, 0.6);
	const rear = PREVIEW_CLIP.rear;
	const desk = alongSheet([[NAME_BOX.u + 0.8, NAME_BOX.v + NAME_BOX.d + 1.2], [23.8, 7.4], [21.6, 11.2], [rear[0] + 0.7, rear[1] + 0.1], rear], r - 0.02);
	const out = cord([...bezier(start, add3(start, [0, 0.6, 0]), add3(desk[0]!, [0, -0.3, 0.2]), desk[0]!, 8), ...desk.slice(1)], r, 4400);
	const slipAt = sheetAt(14.6, 8.6, 0.3);
	return {
		handler,
		out,
		socket: { paper: pathOf(socket, true), ink: outline(socket, { w: 0.8, seed: 4410 }) },
		clip: crocodile(PREVIEW_CLIP.rear, PREVIEW_CLIP.tip, 4500),
		slip: scene.tag(slipAt, [0.4, 1, 0], 4600),
	};
}

/** The whole scene, frozen into typing.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			...scene.shopArt(),
			labelMatrix: sheetMatrix(LABEL_ROW.u, LABEL_ROW.v),
			previewMatrix: sheetMatrix(PREVIEW_ROW.u, PREVIEW_ROW.v),
			spot: scene.spot(PREVIEW_ROW.u + PREVIEW_NEW / 10 + 1.4, PREVIEW_ROW.v - 0.62, 2.2, 0.9, 4900),
			field: fieldArt(),
		},
		strike: scratch(PREVIEW_OLD, PREVIEW_OLD + 20, 4950),
		name: nameArt(),
		wires: wires(),
		note: scene.note(proj(sheetAt(20.6, 5.2, 0.3)), 4970),
	};
}
