// Two shirts on the desk, both labelled "card", each with its own sewn name tape, and one file's dye bath: the dye takes only on the shirt whose tape matches.
import { createScene, ellipse, type P, roundRect } from '../ink/scene.ts';
import { jitter } from '../ink/desk.ts';
import { deskPlane, pencil } from '../ink/plane.ts';
import { hatch, hull, line, outline, pathOf, pool, resample, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

const SHIRT_A = { c: [3.4, -1.6] as P, turn: -0.05 };
const SHIRT_B = { c: [15.4, -1.0] as P, turn: 0.06 };
const TUB = { c: [27.4, -1.8] as P, r: 5 };
const K = 1.45;
const SHIRT_W = 7.2 * K;
const SHIRT_H = 7.6 * K;

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[TUB.c[0] + TUB.r + 1, TUB.c[1] - TUB.r - 1, 0],
		[TUB.c[0] + TUB.r + 1, TUB.c[1] + TUB.r + 2.4, 0],
		[SHIRT_A.c[0] - SHIRT_W / 2 - 1, SHIRT_A.c[1] + SHIRT_H / 2 + 1, 0],
	],
	target: [15, -1.6, 0.4],
});
const { proj } = scene;

/** A T-shirt lying flat, in its own units: body, sleeves, a scooped neck. */
const SHIRT: P[] = ([
	[2.4, 0], [3.0, 0.7], [3.6, 0.95], [4.2, 0.7], [4.8, 0], [7.2, 1.3], [6.3, 3.0], [5.6, 2.6], [5.7, 7.6], [1.5, 7.6], [1.6, 2.6], [0.9, 3.0], [0, 1.3],
] as P[]).map(([u, v]) => [u * K, v * K] as P);
const at = (u: number, v: number): P => [u * K, v * K];

function shirtArt(spot: { c: P; turn: number }, seed: number) {
	const plane = deskPlane(proj, spot.c, SHIRT_W, SHIRT_H, spot.turn, 0.05);
	const body = plane.on(jitter(resample(SHIRT, 0.25, true), seed, 0.05));
	const shadow = hull([...body.map(([x, y]) => [x + 4, y + 5] as P), ...body]);
	const tag = plane.on(roundRect(...at(3.0, 1.05), ...at(4.2, 1.75), 0.06), 0.02);
	const tape = plane.on(roundRect(...at(2.2, 2.05), ...at(5.0, 2.75), 0.06), 0.02);
	const folds = line(plane.on([at(2.2, 4.4), at(3.4, 4.9), at(4.8, 4.5)]), { w: 0.5, seed: seed + 9, over: 0.2 }) + line(plane.on([at(1.9, 6.6), at(3.1, 6.9)]), { w: 0.45, seed: seed + 10, over: 0.2 });
	return {
		shadow: wash(shadow, seed + 1, 1.2, 3),
		shadowHatch: hatch(shadow, -0.5, 2.4, seed + 2, { cluster: 5, skip: 0.3 }),
		paper: pathOf(body, true),
		dye: wash(body, seed + 3, 0.8, 2.4),
		dyePool: wash(pool(body, body[8]!, 0.6), seed + 4, 0.5, 2),
		ink: outline(body, { w: 1.4, heavy: 1.2, seed: seed + 5 }) + folds,
		shade: hatch(plane.on([at(5.6, 2.6), at(5.7, 7.6), at(4.8, 7.6), at(4.9, 3.0)]), 1.1, 1.6, seed + 6, { cluster: 3, skip: 0.3 }),
		tag: { paper: pathOf(tag, true), ink: outline(tag, { w: 0.7, seed: seed + 7 }), matrix: plane.matrix(...at(3.15, 1.6), 0.1, 0.02) },
		tape: { paper: pathOf(tape, true), ink: outline(tape, { w: 0.7, seed: seed + 8 }) + line(plane.on([at(2.3, 2.12), at(4.9, 2.12)], 0.02), { w: 0.3, seed: seed + 11, over: 0 }), matrix: plane.matrix(...at(2.35, 2.6), 0.1, 0.02) },
	};
}

/** The dye bath: an enamel tub with its rim, the dye inside, and a label for the file whose rules it holds. */
function tubArt() {
	const plane = deskPlane(proj, TUB.c, TUB.r * 2, TUB.r * 2, 0, 0);
	const rimTop = deskPlane(proj, TUB.c, TUB.r * 2, TUB.r * 2, 0, 1.6).on(ellipse(TUB.r, TUB.r, TUB.r, TUB.r * 0.98, 48));
	const rimIn = deskPlane(proj, TUB.c, TUB.r * 2, TUB.r * 2, 0, 1.6).on(ellipse(TUB.r, TUB.r, TUB.r - 0.4, TUB.r * 0.98 - 0.4, 48));
	const dye = deskPlane(proj, TUB.c, TUB.r * 2, TUB.r * 2, 0, 1.1).on(ellipse(TUB.r, TUB.r, TUB.r - 0.5, TUB.r * 0.98 - 0.5, 40));
	const base = plane.on(ellipse(TUB.r, TUB.r, TUB.r - 0.2, TUB.r * 0.96, 48));
	const body = hull([...rimTop, ...base]);
	const shadow = hull([...base.map(([x, y]) => [x + 9, y + 10] as P), ...base]);
	const label = deskPlane(proj, [TUB.c[0], TUB.c[1] + TUB.r + 0.9], 8.4, 1.5, 0, 0.02);
	const labelPoly = label.on(roundRect(0, 0, 8.4, 1.5, 0.1));
	return {
		shadow: wash(shadow, 6100, 1.4, 3),
		shadowHatch: hatch(shadow, -0.5, 2.4, 6101, { cluster: 5, skip: 0.3 }),
		body: pathOf(body, true),
		bodyHatch: hatch(body, 1.15, 2, 6102, { cluster: 4, skip: 0.3, trim: 0.4 }),
		rim: pathOf(rimTop, true),
		dye: pathOf(dye, true),
		dyeWash: wash(dye, 6103, 0.6, 2),
		ink: outline(body, { w: 1.6, heavy: 1.3, seed: 6104 }) + outline(rimTop, { w: 1.2, seed: 6105 }) + outline(rimIn, { w: 0.7, seed: 6106 }),
		label: { paper: pathOf(labelPoly, true), ink: outline(labelPoly, { w: 0.8, seed: 6107 }), matrix: label.matrix(0.4, 1.05, 0.1, 0.02) },
		pencil: pencil(plane.on([[-1, TUB.r], [TUB.r * 2 + 1, TUB.r]]), 6108),
	};
}

/** The whole scene, frozen into laundry.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		shirts: [shirtArt(SHIRT_A, 6200), shirtArt(SHIRT_B, 6300)],
		tub: tubArt(),
		note: scene.note(proj([SHIRT_B.c[0], SHIRT_B.c[1] - 4.4, 0.1]), 6470),
	};
}
