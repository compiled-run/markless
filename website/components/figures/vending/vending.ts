// A vending machine standing on the desk: a name plate, a GET button, a POST button and a tray.
import { createScene, type Crate, ellipse, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { hatch, outline, pathOf, r1, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

const MACHINE: Crate = { u: 6, v: 1.2, w: 11, d: 3.4, h: 12 };
const BUTTONS = { get: 3.3, post: 7.7, z: 6.6, r: 1.15 };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [sheetAt(MACHINE.u, MACHINE.v, MACHINE.h + 0.6), sheetAt(MACHINE.u + MACHINE.w, MACHINE.v, MACHINE.h + 0.6)],
	target: [9.8, -5.0, 4.2],
	elevation: 30,
});
const { proj } = scene;

/** The whole scene, frozen into vending.art.ts. */
export function drawing() {
	const box = scene.crate(MACHINE, 4100);
	const { w, d, h } = MACHINE;
	const face = (pts: P[]) => box.poly(pts.map(([x, z]) => [x, d + 0.01, z] as [number, number, number]));
	const side = box.poly([[0, 0, 0], [0, d, 0], [0, d, h], [0, 0, h]]);
	const top = box.poly([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]]);
	const plate = face(roundRect(0.6, 9.1, 10.4, 11.1, 0.3));
	const tray = face([[1.0, 0.8], [7.8, 0.8], [7.8, 3.3], [1.0, 3.3]]);
	const cup = face(roundRect(8.5, 0.9, 10.4, 3.2, 0.3));
	const coin = face(ellipse(9.45, 1.75, 0.6, 0.6, 24));
	const coinFace = face(ellipse(9.45, 1.75, 0.4, 0.4, 18));
	const button = (x: number, seed: number) => {
		const disc = face(ellipse(x, BUTTONS.z, BUTTONS.r, BUTTONS.r, 30));
		const rimPts = face(ellipse(x, BUTTONS.z - 0.12, BUTTONS.r, BUTTONS.r, 30));
		const a = box.point(x, d + 0.01, BUTTONS.z);
		const b = box.point(x, d - 0.25, BUTTONS.z);
		return {
			rim: pathOf(rimPts, true),
			paper: pathOf(disc, true),
			wash: wash(disc, seed, 0.8, 2),
			ink: outline(disc, { w: 1.2, heavy: 0.9, seed: seed + 1 }),
			matrix: box.frontMatrix(x, BUTTONS.z - 0.3),
			sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 1)}px`,
			place: (() => {
				const c = proj(box.world(x, d, BUTTONS.z));
				return `left:${r1((c[0] / WIDTH) * 100)}%;top:${r1((c[1] / HEIGHT) * 100)}%`;
			})(),
		};
	};
	const card = face(roundRect(1.6, 1.1, 7.2, 2.95, 0.18));
	const a = box.point(4.4, d + 0.01, 2);
	const b = box.point(4.4, d + 0.01, 5.2);
	return {
		width: WIDTH,
		height: HEIGHT,
		machine: {
			cast: box.cast,
			paper: box.paper,
			shade: hatch(side, 1.2, 1.6, 4109, { cluster: 4, skip: 0.2, trim: 0.4 }) + hatch(top, 0.1, 3.4, 4099, { cluster: 3, skip: 0.5, trim: 0.6 }),
			ink: box.ink + outline(plate, { w: 0.9, seed: 4101 }) + outline(tray, { w: 1.1, heavy: 0.8, seed: 4102 }) + outline(cup, { w: 1, heavy: 0.7, seed: 4103 }),
			pencil: box.pencil,
			plate: pathOf(plate, true),
			plateMatrix: box.frontMatrix(1.1, 9.6),
			tray: pathOf(tray, true),
			trayHatch: hatch(tray, 0.15, 1.2, 4105, { cluster: 4, trim: 0.2 }) + hatch(tray, -0.9, 1.6, 4106, { cluster: 2, skip: 0.3 }),
			cup: pathOf(cup, true),
			cupHatch: hatch(cup, 0.2, 1.1, 4115, { cluster: 3, trim: 0.2 }),
		},
		get: button(BUTTONS.get, 4200),
		post: button(BUTTONS.post, 4220),
		coin: {
			paper: pathOf(coin, true),
			wash: wash(coin, 4130, 0.6, 1.5),
			ink: outline(coin, { w: 1, heavy: 0.8, seed: 4131 }) + outline(coinFace, { w: 0.6, seed: 4132 }),
			origin: (() => {
				const c = box.point(9.45, d + 0.01, 1.75);
				return `${r1(c[0])}px ${r1(c[1])}px`;
			})(),
		},
		card: {
			paper: pathOf(card, true),
			ink: outline(card, { w: 0.9, seed: 4107 }),
			wash: wash(card, 4108, 1, 2.5),
			matrix: box.frontMatrix(2.0, 1.7),
			drop: `--drop-x:${r1(b[0] - a[0])}px;--drop-y:${r1(b[1] - a[1])}px`,
		},
	};
}
