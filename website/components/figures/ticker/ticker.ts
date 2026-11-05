// Brief (passes the figure-research checklist: 2 objects, each maps to code, words are only code values).
// Believe: a slow part arrives later on the same response; the browser never asks twice.
// Objects: the machine is the server answering one request; the tape is that one response. The machine never moves.
// Action and change: press print; the tape grows: "Orders" and a pencilled "Loading…", then the same tape carries on with "3 orders".
// Prevents: "the page waits for all the data" and "the data comes in a second request".
import { createScene, type Crate, ellipse, type P } from '../ink/scene.ts';
import { matrixOf } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, r1, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

const MACHINE: Crate = { u: 15.5, v: 4.2, w: 7.5, d: 7.2, h: 3.8 };
const SLOT_U = MACHINE.u;
const TAPE = { u0: -3, v0: 6.6, v1: 9.4 };
/** Where the first part ends and the slow part begins, along the tape. */
const SPLIT = 8.3;
/** How much tape sits inside the machine, ready to come out. */
const INSIDE = 19;

const desk = (u: number, v: number, lift = 0.02): [number, number, number] => [u - 1.6, v - 8.8, lift];

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [desk(MACHINE.u + MACHINE.w + 0.5, MACHINE.v, MACHINE.h + 1), desk(MACHINE.u + MACHINE.w + 0.5, MACHINE.v + MACHINE.d + 1, 0), desk(TAPE.u0 - 1, TAPE.v1 + 1, 0), desk(TAPE.u0 - 1, TAPE.v0 - 1, 0)],
	target: [10, -0.8, 0.8],
	elevation: 56,
});
const { proj } = scene;
const flat = (pts: P[], lift = 0.02): P[] => pts.map(([u, v]) => proj(desk(u, v, lift)));
const at = (u: number, v: number) => matrixOf(proj(desk(u, v)), proj(desk(u + 0.1, v)), proj(desk(u, v + 0.1)));

/** The machine: a box with its slot on the front and the pink print button on top. */
function machineArt() {
	const box = scene.crate(MACHINE, 6000);
	const { w, d, h } = MACHINE;
	const slot = box.poly([[0, TAPE.v0 - MACHINE.v - 0.3, 0.42], [0, TAPE.v1 - MACHINE.v + 0.3, 0.42], [0, TAPE.v1 - MACHINE.v + 0.3, 0.12], [0, TAPE.v0 - MACHINE.v - 0.3, 0.12]]);
	const top = (x: number, y: number) => box.world(x, y, h);
	const button = ellipse(w * 0.6, d * 0.45, 0.95, 0.8, 28).map(([x, y]) => proj(top(x, y)));
	const buttonSide = ellipse(w * 0.6, d * 0.45, 0.95, 0.8, 28).map(([x, y]) => proj(box.world(x, y, h - 0.25)));
	const grille = [0.7, 0.8, 0.9].map((f, i) => line([proj(top(1, d * f)), proj(top(w * 0.55, d * f))], { w: 0.6, seed: 6010 + i, over: 0 })).join('');
	const a = proj(box.world(w * 0.6, d * 0.45, h));
	const b = proj(box.world(w * 0.6, d * 0.45, h - 0.25));
	return {
		cast: box.cast,
		paper: box.paper,
		shade: box.shade,
		ink: box.ink + grille,
		pencil: box.pencil,
		slot: pathOf(slot, true),
		slotInk: outline(slot, { w: 1, seed: 6020 }),
		button: { side: pathOf(buttonSide, true), paper: pathOf(button, true), wash: wash(button, 6030, 0.4, 1.2), ink: outline(button, { w: 1.1, heavy: 0.8, seed: 6031 }), sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1])}px` },
	};
}

/** The tape lying on the desk out of the machine's side, read left to right in the order it was printed. */
function tapeArt() {
	const { u0, v0, v1 } = TAPE;
	const strip = (ua: number, ub: number) => flat([[ua, v0], [ub, v0], [ub, v1], [ua, v1]]);
	const whole = flat([[u0, v0], [SLOT_U + INSIDE, v0], [SLOT_U + INSIDE, v1], [u0, v1], [u0 + 0.25, (v0 + v1) / 2]]);
	const shadow = flat([[u0 + 0.3, v1], [SLOT_U, v1], [SLOT_U, v1 + 0.3], [u0 + 0.3, v1 + 0.3]], 0);
	const seam = flat(Array.from({ length: 10 }, (_, i) => [SPLIT + (i % 2 ? 0.12 : -0.12), v0 + (i / 9) * (v1 - v0)] as P));
	const shift = (du: number) => {
		const a = proj(desk((u0 + SLOT_U) / 2, (v0 + v1) / 2));
		const b = proj(desk((u0 + SLOT_U) / 2 + du, (v0 + v1) / 2));
		return [r1(b[0] - a[0]), r1(b[1] - a[1])];
	};
	const [hx, hy] = shift(SLOT_U - u0 + 0.4);
	const [fx, fy] = shift(SLOT_U - SPLIT);
	const [px, py] = shift(-0.7);
	const opening = flat([[-14, v0 - 4], [SLOT_U, v0 - 4], [SLOT_U, v1 + 4], [-14, v1 + 4]], 0);
	const base = v1 - 0.95;
	return {
		paper: pathOf(whole, true),
		ink: outline(whole, { w: 1.1, heavy: 0.8, seed: 6100 }),
		tone: hatch(strip(u0, SLOT_U + INSIDE), 1.45, 3.2, 6101, { cluster: 3, skip: 0.6, trim: 0.7 }),
		shadow: hatch(shadow, -0.6, 1.2, 6102, { cluster: 2, trim: 0.1 }),
		seam: line(seam, { w: 0.5, seed: 6103, over: 0 }),
		headingMatrix: at(u0 + 0.7, base),
		pendingMatrix: at(u0 + 5.8, base),
		arrivedMatrix: at(SPLIT + 0.9, base),
		spot: wash(flat([[SPLIT + 0.6, v0 + 0.3], [SPLIT + 5.6, v0 + 0.3], [SPLIT + 5.6, v1 - 0.3], [SPLIT + 0.6, v1 - 0.3]]), 6110, 0.8, 2.4),
		moves: `--hide-x:${hx}px;--hide-y:${hy}px;--first-x:${fx}px;--first-y:${fy}px;--pull-x:${px}px;--pull-y:${py}px`,
		clip: `clip-path: polygon(${opening.map(([x, y]) => `${r1(x)}px ${r1(y)}px`).join(', ')}) view-box`,
	};
}

/** The whole scene, frozen into ticker.art.ts. */
export function drawing() {
	const under = flat([[TAPE.u0, MACHINE.v + MACHINE.d + 1.2], [SLOT_U + 8, MACHINE.v + MACHINE.d + 1.2], [SLOT_U + 8, MACHINE.v + MACHINE.d + 2.8], [TAPE.u0, MACHINE.v + MACHINE.d + 2.8]], 0);
	return {
		width: WIDTH,
		height: HEIGHT,
		desk: hatch(under, -0.5, 2.6, 6200, { cluster: 5, skip: 0.35, trim: 0.55 }),
		machine: machineArt(),
		tape: tapeArt(),
	};
}
