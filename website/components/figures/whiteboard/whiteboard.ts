// One whiteboard and two desks facing it: one desk writes, and the board both desks read changes.
import { createScene, type Crate, roundRect, sheetAt } from '../ink/scene.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 340;

const BOARD = { u0: 5.6, v0: 1.0, u1: 17.4, v1: 6.0 };
const DESKS: Crate[] = [
	{ u: 2.0, v: 9.2, w: 7.0, d: 3.2, h: 1.2 },
	{ u: 14.0, v: 9.2, w: 7.0, d: 3.2, h: 1.2 },
];

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [sheetAt(0, -1, 0)],
	target: [9.6, -1.8, 0.4],
});
const { proj, onSheet, sheetMatrix } = scene;

/** The whiteboard lying on its easel tray: frame, white face, a little glare. */
function board() {
	const { u0, v0, u1, v1 } = BOARD;
	const frame = onSheet(roundRect(u0, v0, u1, v1, 0.3), 0.2);
	const face = onSheet(roundRect(u0 + 0.4, v0 + 0.4, u1 - 0.4, v1 - 0.4, 0.15), 0.22);
	const cast = onSheet([[u0 + 0.4, v1], [u1 + 0.5, v1], [u1 + 0.5, v0 + 0.5], [u1, v0 + 0.5], [u1, v1 - 0.05], [u0 + 0.4, v1 - 0.05]], 0.01);
	return {
		cast: hatch(cast, -0.6, 1.2, 6000, { cluster: 2, trim: 0.1 }),
		frame: pathOf(frame, true),
		frameTone: hatch(frame, 1.3, 1.4, 6001, { cluster: 3, skip: 0.3, trim: 0.4 }),
		face: pathOf(face, true),
		ink: outline(frame, { w: 1.6, heavy: 1.3, seed: 6002 }) + outline(face, { w: 0.8, seed: 6003 }),
		nameMatrix: sheetMatrix(u0 + 0.9, v0 + 1.5),
		numberMatrix: sheetMatrix((u0 + u1) / 2 - 0.5, v0 + 3.8),
		spot: scene.spot((u0 + u1) / 2, v0 + 3.1, 1.6, 1.2, 6020),
	};
}

/** One desk: a box on the floor, its top (pink on the desk that writes), its name, and a pencil sightline to the board. */
function desk(i: number) {
	const d = DESKS[i]!;
	const seed = 6100 + i * 50;
	const box = scene.crate(d, seed);
	const top = box.poly([[0, 0, d.h], [d.w, 0, d.h], [d.w, d.d, d.h], [0, d.d, d.h]]);
	const from = box.point(d.w / 2, 0.2, d.h);
	const to = proj(sheetAt((BOARD.u0 + BOARD.u1) / 2 + (i === 0 ? -1.6 : 1.6), BOARD.v1 + 0.1, 0.2));
	const sight = resample([from, [(from[0] + to[0]) / 2 + (i === 0 ? -6 : 6), (from[1] + to[1]) / 2], to], 3);
	return {
		cast: box.cast,
		paper: box.paper,
		shade: box.shade,
		ink: box.ink,
		top: pathOf(top, true),
		wash: wash(top, seed + 20, 0.6, 2),
		sight: line(sight, { w: 1.8, seed: seed + 30, over: 0 }),
		nameMatrix: sheetMatrix(d.u + 0.4, d.v + d.d + 1.6),
	};
}

/** The whole scene, frozen into whiteboard.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		board: board(),
		desks: [desk(0), desk(1)] as const,
	};
}
