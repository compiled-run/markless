// The shop page developing in a darkroom tray: the whole print is sharp except the arrival date, which shows pencil words until it develops.
import { createScene, ellipse, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { hatch, hull, line, outline, pathOf, r1, seeded, stroke, wash } from '../ink/ink.ts';
import { ARRIVE_SLOT } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

export const ROW = { u: 1.4, v: 9.75 };
const RELOAD = { u: 12.6, v: 0.85, r: 0.5 };


const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [sheetAt(-2.2, -2.2), sheetAt(25.4, -2.2), sheetAt(25.4, 17.2), sheetAt(-2.2, 17.2)],
	target: [10, -1.6, 0.6],
});
const { proj, onSheet, sheetMatrix } = scene;

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

/** The developer tray the print lies in: a shallow enamel dish with a rolled rim, and the liquid's faint tint. */
function trayArt() {
	const at = (u: number, v: number, z: number) => proj([sheetAt(u, v)[0], sheetAt(u, v)[1], z]);
	const ring = (pad: number, z: number) => roundRect(-pad, -pad, 23 + pad, 14.8 + pad, 1.2).map(([u, v]) => at(u, v, z));
	const rimTop = ring(1.6, 0.9);
	const rimIn = ring(1.1, 0.9);
	const floor = ring(1.1, 0);
	const outerBase = ring(1.8, 0);
	const wall = hull([...rimTop, ...outerBase]);
	return {
		cast: wash(hull(outerBase.map(([x, y]) => [x + 8, y + 9] as P).concat(outerBase)), 2500, 1.5, 3),
		wall: pathOf(wall, true),
		wallHatch: hatch(wall, 1.1, 2.2, 2501, { cluster: 4, skip: 0.3, trim: 0.4 }),
		floor: pathOf(floor, true),
		liquid: wash(floor, 2502, 1, 3),
		rim: pathOf(rimTop, true),
		ink: outline(rimTop, { w: 1.6, heavy: 1.3, seed: 2503 }) + outline(rimIn, { w: 0.8, seed: 2504 }) + outline(outerBase, { w: 1.1, seed: 2505 }),
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
		tray: trayArt(),
		note: scene.note(proj(sheetAt(ROW.u + ARRIVE_SLOT / 10 + 0.6, ROW.v - 0.9, 0.2)), 2960),
	};
}
