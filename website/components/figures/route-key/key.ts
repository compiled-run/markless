// Brief (checklist passed). Belief: the build lets a link through only if its route exists.
// Objects: the door (the route pages/blog/[slug]), the right key, the typo key.
// Action: try a key in the lock (press, drag it there, or Enter). Change: the right key turns and the door opens. Unchanged: the lock.
// Prevents: "a typo in a link ships and shows a 404". Surprise: the typo key stops at the lock and slides back, as the build stops.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, r1, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

const DOOR = { x0: 110, y0: 26, x1: 300, y1: 360 };
export const LOCK: P = [272, 206];
const KEYS = { good: { y: 140, seed: 500 }, typo: { y: 268, seed: 540 } };
const TIP_X = 404;

/** The door: frame, leaf with two panels, handle and lock plate; and the leaf again, ajar, with the dark gap behind it. */
function doorArt() {
	const frame = roundRect(DOOR.x0 - 12, DOOR.y0 - 12, DOOR.x1 + 12, DOOR.y1, 4);
	const leaf: P[] = [[DOOR.x0, DOOR.y0], [DOOR.x1, DOOR.y0], [DOOR.x1, DOOR.y1], [DOOR.x0, DOOR.y1]];
	const panels = [roundRect(DOOR.x0 + 24, DOOR.y0 + 26, DOOR.x1 - 24, DOOR.y0 + 140, 6), roundRect(DOOR.x0 + 24, DOOR.y0 + 176, DOOR.x1 - 24, DOOR.y1 - 26, 6)];
	const plate = roundRect(LOCK[0] - 10, LOCK[1] - 34, LOCK[0] + 10, LOCK[1] + 22, 5);
	const knob = ellipse(LOCK[0], LOCK[1] - 20, 8, 8, 18);
	const hole: P[] = [[LOCK[0] - 3, LOCK[1] - 4], [LOCK[0] + 3, LOCK[1] - 4], [LOCK[0] + 4, LOCK[1] + 12], [LOCK[0] - 4, LOCK[1] + 12]];
	const ajar: P[] = [[DOOR.x0, DOOR.y0], [DOOR.x0 + 92, DOOR.y0 + 22], [DOOR.x0 + 92, DOOR.y1 - 14], [DOOR.x0, DOOR.y1]];
	const gap: P[] = [[DOOR.x0 + 92, DOOR.y0 + 4], [DOOR.x1, DOOR.y0], [DOOR.x1, DOOR.y1], [DOOR.x0 + 92, DOOR.y1 - 4]];
	return {
		frame: pathOf(frame, true) + pathOf([...leaf].reverse(), true),
		frameInk: outline(frame, { w: 2, heavy: 1.5, seed: 401 }),
		frameShade: hatch(frame, 1.3, 3, 402, { cluster: 3, skip: 0.4, trim: 0.5 }),
		closed: {
			paper: pathOf(leaf, true),
			ink: outline(leaf, { w: 1.8, heavy: 1.2, seed: 410 }) + panels.map((p, k) => outline(p, { w: 1, seed: 411 + k })).join(''),
			shade: panels.map((p, k) => hatch(p, 1.2, 3.4, 413 + k, { cluster: 3, skip: 0.4, trim: 0.5 })).join(''),
			plate: pathOf(plate, true),
			plateInk: outline(plate, { w: 1, seed: 420 }) + outline(knob, { w: 1.2, heavy: 0.8, seed: 421 }),
			hole: pathOf(hole, true),
		},
		open: {
			gap: pathOf(gap, true),
			gapHatch: hatch(gap, 1.2, 1.4, 430, { cluster: 3 }) + hatch(gap, -0.4, 1.8, 431, { cluster: 2 }),
			paper: pathOf(ajar, true),
			ink: outline(ajar, { w: 1.8, heavy: 1.2, seed: 432 }),
			wash: wash(gap, 433, 2, 4),
		},
	};
}

/** A key lying on the desk, tip to the left: the bow with its name on it, the shaft, and the bit, whose teeth follow its own pattern. */
function keyArt(y: number, seed: number, teeth: number[]) {
	const bow = ellipse(TIP_X + 196, y, 30, 26, 30);
	const eye = ellipse(TIP_X + 206, y, 7, 7, 14);
	const shaft: P[] = [[TIP_X + 2, y - 5], [TIP_X + 168, y - 5], [TIP_X + 168, y + 5], [TIP_X + 2, y + 5]];
	const bit: P[] = [[TIP_X + 6, y + 5], ...teeth.flatMap((d, k): P[] => [[TIP_X + 10 + k * 9, y + 5 + d], [TIP_X + 14 + k * 9, y + 5 + d]]), [TIP_X + 14 + teeth.length * 9, y + 5]];
	const shadow: P[] = [[TIP_X + 8, y + 8], [TIP_X + 226, y + 8], [TIP_X + 226, y + 34], [TIP_X + 8, y + 20]];
	return {
		shadow: hatch(shadow, -0.6, 2.4, seed, { cluster: 4, skip: 0.35, trim: 0.5 }),
		metal: pathOf(bow, true) + pathOf(shaft, true) + pathOf(bit, true),
		eye: pathOf(eye, true),
		ink: outline(bow, { w: 1.6, heavy: 1.1, seed: seed + 1 }) + outline(eye, { w: 0.9, seed: seed + 2 }) + outline(shaft, { w: 1.3, heavy: 0.8, seed: seed + 3 }) + line(bit, { w: 1.2, seed: seed + 4, over: 0 }),
		shine: hatch(bow, 0.9, 3, seed + 5, { cluster: 2, skip: 0.4, trim: 0.5 }),
		label: { x: TIP_X + 88, y: y - 14 },
		reach: `--to-x:${r1(LOCK[0] - TIP_X + 2)}px;--to-y:${r1(LOCK[1] + 4 - y)}px`,
		tip: [TIP_X, y] as P,
	};
}

/** The whole figure, frozen into key.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		lock: LOCK,
		door: doorArt(),
		good: keyArt(KEYS.good.y, KEYS.good.seed, [8, 14, 6, 12, 4]),
		typo: keyArt(KEYS.typo.y, KEYS.typo.seed, [12, 4, 14, 6, 10]),
	};
}
