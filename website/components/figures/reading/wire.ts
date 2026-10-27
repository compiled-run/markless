// The shop page with the `bags` jar and the `total` box: one wire from the jar to each spot that shows the count, and one through the box to the total.
import { bezier, createScene, type Crate, LID, type P, type Point3, sheetAt } from '../ink/scene.ts';
import { add3 } from '../kit/lathe.ts';
import { hatch, outline, pathOf, r1, wash } from '../ink/ink.ts';
import { SLOTS, TOTAL_SLOTS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 450;

/** Where the cart line and the total line start on the page, in centimetres from the sheet's top-left corner. */
export const ROW = { u: 1.4, v: 9.75 };
export const TOTAL_ROW = { u: 11.2, v: 11.7 };
export const BADGE = { u: 19.5, v: 3.95, r: 0.62 };
const BUTTON = { u0: 1.3, v0: 10.6, u1: 9, v1: 12.9 };
const BRANCH_U = 15.75;
const BOX_SPLICE_U = 19.2;
const BOX: Crate = { u: 24.3, v: 0.2, w: 4.4, d: 3.4, h: 2.6 };

export const CLIPS = {
	badge: { rear: [22.7, 3.95] as P, tip: [20.25, 3.95] as P },
	line: { rear: [15.2, 6.5] as P, tip: [12.9, 8.2] as P },
	total: { rear: [22.4, 8.2] as P, tip: [20.4, 10.2] as P },
};

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	jar: true,
	extra: [
		[BOX.u + BOX.w - 1.6 + 0.6, BOX.v - 8.8, 0],
		[BOX.u + BOX.w - 1.6 + 0.6, BOX.v + BOX.d - 8.8, 0],
		[BOX.u + BOX.w - 1.6, BOX.v - 8.8, BOX.h + 2.4],
		[BOX.u + BOX.w + 2.6, BOX.v + BOX.d - 8.8, 0],
		[-9.4, -2.2, 0],
	],
	target: [8.4, -2.2, 0.8],
});
const { proj, projAll, sheetMatrix, cord, alongSheet, crocodile, jarPoint, radiusAt } = scene;

function pageArt() {
	const icon = scene.cartIcon(BADGE);
	const nowU = ROW.u + SLOTS[1] / 10;
	const totalU = TOTAL_ROW.u + TOTAL_SLOTS[1] / 10;
	return {
		...scene.shopArt(),
		cart: icon.ink,
		badge: icon.badge,
		rowMatrix: sheetMatrix(ROW.u, ROW.v),
		totalMatrix: sheetMatrix(TOTAL_ROW.u, TOTAL_ROW.v),
		spot: scene.spot(nowU + 0.63, ROW.v - 0.62, 0.9, 0.85, 480),
		totalSpot: scene.spot(totalU + 1.55, TOTAL_ROW.v - 0.62, 1.85, 0.85, 485),
		button: scene.pageButton(BUTTON, 490),
	};
}

/** The `total` box: bags in at the back, dollars out of the front, a receipt in the slot on top showing the latest total. */
function boxArt() {
	const box = scene.crate(BOX, 1800);
	const { w, d, h } = BOX;
	const slot = box.poly([
		[0.9, d * 0.42, h],
		[w - 0.9, d * 0.42, h],
		[w - 0.9, d * 0.58, h],
		[0.9, d * 0.58, h],
	]);
	const slip = box.poly([
		[1.05, d * 0.5, h],
		[w - 1.05, d * 0.5, h],
		[w - 1.05, d * 0.5, h + 1.5],
		[1.05, d * 0.5, h + 1.5],
	]);
	const window = box.poly([
		[0.5, d, h * 0.72],
		[w - 0.5, d, h * 0.72],
		[w - 0.5, d, h * 0.28],
		[0.5, d, h * 0.28],
	]);
	const slipMatrix = (fu: number, fz: number) => {
		const o = box.point(fu, d * 0.5, fz);
		const x = box.point(fu + 0.1, d * 0.5, fz);
		const y = box.point(fu, d * 0.5, fz - 0.1);
		return `matrix(${[x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1], o[0], o[1]].map((n) => Math.round(n * 1000) / 1000).join(' ')})`;
	};
	const knot = box.world(w - 0.02, d - 0.02, h * 0.8);
	return {
		cast: box.cast,
		paper: box.paper,
		wash: wash(box.poly([[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]]), 1830, 0.8, 2),
		shade: box.shade,
		ink: box.ink + outline(window, { w: 0.8, seed: 1831 }),
		pencil: box.pencil,
		window: pathOf(window, true),
		windowMatrix: box.frontMatrix(w / 2, h * 0.38),
		slot: pathOf(slot, true),
		slotInk: outline(slot, { w: 1, seed: 1832 }),
		slip: { paper: pathOf(slip, true), ink: outline(slip, { w: 0.8, seed: 1833 }), matrix: slipMatrix(w / 2, h + 0.55), hatch: hatch(slip, 1.2, 2.6, 1834, { cluster: 2, skip: 0.4, trim: 0.5 }) },
		rise: (() => {
			const a = box.point(w / 2, d * 0.5, h);
			const b = box.point(w / 2, d * 0.5, h + 0.45);
			return `--rise-x:${r1(b[0] - a[0])}px;--rise-y:${r1(b[1] - a[1])}px`;
		})(),
		tag: scene.tag(knot, [0.55, 1, 0], 1840),
	};
}

function wires() {
	const r = 0.24;
	const back = -1.5;
	const rear = CLIPS.badge.rear;
	const lidOut = jarPoint(-0.95, LID.z1, 0.95);
	const deskStart: P = [-2.4, back + 0.5];
	const landing = sheetAt(deskStart[0], deskStart[1], r - 0.02);
	const hang = bezier(lidOut, add3(lidOut, [0.4, -0.5, 3.4]), add3(landing, [-1.2, 0.7, 2]), landing, 46);
	const onDesk = alongSheet([deskStart, [-0.6, back], [6, back - 0.15], [13, back + 0.05], [rear[0] - 1.6, back], [rear[0] - 0.2, -0.5], [rear[0] + 0.15, 1.2], [rear[0] + 0.35, 3], [rear[0] + 0.1, rear[1]]], r - 0.02);
	const mainPts = [...hang, ...onDesk.slice(1)];
	const main = cord(mainPts, r, 1000);
	const offsetU = (p: Point3) => p[0] + 1.6;
	const splitAt = (u: number) => mainPts.findIndex((p) => offsetU(p) >= u && p[2] < 1);

	const rb = 0.19;
	const lineRear = CLIPS.line.rear;
	const branchPts = alongSheet([[BRANCH_U, back + 0.1], [BRANCH_U + 0.05, 0.6], [BRANCH_U + 0.05, 3.6], [BRANCH_U - 0.05, 5.4], [lineRear[0], lineRear[1]]], rb - 0.02);
	const branch = cord(branchPts, rb, 1400);
	const toLine = projAll([...mainPts.slice(0, splitAt(BRANCH_U) + 1), ...branchPts]);

	const inPts = alongSheet([[BOX_SPLICE_U, back + 0.05], [BOX_SPLICE_U + 0.4, back - 1.2], [22.5, back - 1.9], [24.6, back - 1.2], [BOX.u + 1.2, BOX.v + 0.5]], rb - 0.02);
	const intoBox = cord(inPts, rb, 1450);
	const toBox = projAll([...mainPts.slice(0, splitAt(BOX_SPLICE_U) + 1), ...inPts]);

	const outStart: Point3 = [BOX.u - 1.6 + 1.0, BOX.v + BOX.d - 8.8 + 0.05, 0.55];
	const totalRear = CLIPS.total.rear;
	const outDesk = alongSheet([[BOX.u + 0.7, BOX.v + BOX.d + 0.9], [BOX.u - 0.6, 6.4], [23.4, 7.5], [totalRear[0] + 0.2, totalRear[1] - 0.15], [totalRear[0], totalRear[1]]], r - 0.02);
	const fromBox = cord([...bezier(outStart, add3(outStart, [0, 0.6, 0]), add3(outDesk[0]!, [0, -0.3, 0.2]), outDesk[0]!, 8), ...outDesk.slice(1)], r, 1500);

	const t = 0.13;
	const socket = jarPoint(0.55, 0.75, radiusAt(0.75) + 0.05);
	const run = alongSheet([[1.3, 11.9], [0.4, 12.4], [-0.7, 12.6], [-1.7, 12.1], [-2.2, 10.9]], t - 0.02);
	const foot = run.at(-1)!;
	const rise = bezier(foot, add3(foot, [-0.2, -0.4, 0.3]), add3(socket, [0.6, 0.5, 0]), socket, 16);
	const thin = cord([...run, ...rise.slice(1)], t, 1100);

	const centred = (pts: P[]) => ({ d: pathOf(pts), length: r1(pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0)) });
	return {
		main,
		branch,
		intoBox,
		fromBox,
		thin,
		splices: [scene.splice([BRANCH_U, back + 0.05], r + 0.02, 1420), scene.splice([BOX_SPLICE_U, back + 0.05], r + 0.02, 1430)],
		toLine: centred(toLine),
		toBox: centred(toBox),
		clips: { badge: crocodile(CLIPS.badge.rear, CLIPS.badge.tip, 1200), line: crocodile(CLIPS.line.rear, CLIPS.line.tip, 1220), total: crocodile(CLIPS.total.rear, CLIPS.total.tip, 1240) },
		hang: proj(hang[Math.floor(hang.length * 0.3)]!),
	};
}

/** The whole scene, frozen into wire.art.ts. */
export function drawing() {
	const wiring = wires();
	const beans = scene.beans(30);
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: pageArt(),
		strikes: { line: scene.strike(SLOTS[0], 0.7, 500), badge: scene.strike(0, 0.55, 501), total: scene.strike(TOTAL_SLOTS[0], 0.7, 502) },
		jar: scene.jarArt(),
		tag: scene.jarTag(),
		beans,
		box: boxArt(),
		wires: wiring,
		note: scene.note(wiring.hang, 1300),
	};
}
