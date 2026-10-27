// The bags jar wired into an @for list and an @if flap: one row per bag, and a "Free shipping!" flap that opens at three bags.
import { bezier, createScene, ellipse, LID, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { hatch, line, outline, pathOf } from '../ink/ink.ts';
import { add3 } from '../kit/lathe.ts';
import { ROW_NAMES } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 430;

const ROW_V = [5.3, 6.7, 8.1, 9.5];
const ROW_U = 2.2;
const FLAP = { u0: 11.2, v0: 4.6, u1: 20.4, v1: 7.4 };
const BUTTON = { u0: 1.3, v0: 11.3, u1: 9.4, v1: 13.3 };
const SOCKET: P = [5.4, 13.3];

const CLIPS = {
	rows: { rear: [-0.4, 3.9] as P, tip: [1.6, 5.0] as P },
	flap: { rear: [22.2, 3.0] as P, tip: [20.0, 4.75] as P },
};

const scene = createScene({ width: WIDTH, height: HEIGHT, jar: true, extra: [], target: [7, -2.2, 0.8] });
const { proj, onSheet, sheetMatrix, cord, alongSheet, crocodile, jarPoint, radiusAt } = scene;

function pageArt() {
	const shop = scene.shopArt();
	const flap = onSheet(roundRect(FLAP.u0, FLAP.v0, FLAP.u1, FLAP.v1, 0.3), 0.04);
	const fold = onSheet([[FLAP.u0, FLAP.v0], [FLAP.u1, FLAP.v0], [FLAP.u1, FLAP.v0 + 0.55], [FLAP.u0, FLAP.v0 + 0.55]], 0.08);
	const b = scene.pageButton(BUTTON, 6100);
	const socket = onSheet(ellipse(SOCKET[0], SOCKET[1] + 0.05, 0.42, 0.3, 16), 0.14);
	return {
		bar: shop.bar,
		headingMatrix: sheetMatrix(1.4, 3.6),
		rows: ROW_NAMES.map((name, i) => ({
			key: i,
			name,
			matrix: sheetMatrix(ROW_U + 0.6, ROW_V[i]!),
			bullet: outline(onSheet(ellipse(ROW_U, ROW_V[i]! - 0.32, 0.14, 0.14, 12)), { w: 0.9, seed: 6000 + i }),
			rule: line(onSheet([[ROW_U - 0.4, ROW_V[i]! + 0.45], [9.6, ROW_V[i]! + 0.45]]), { w: 0.4, seed: 6010 + i, over: 0 }),
		})),
		flap: {
			paper: pathOf(flap, true),
			ink: outline(flap, { w: 1.2, heavy: 0.8, seed: 6020 }),
			spot: scene.spot((FLAP.u0 + FLAP.u1) / 2, (FLAP.v0 + FLAP.v1) / 2 + 0.1, 3.8, 1, 6030),
			matrix: sheetMatrix((FLAP.u0 + FLAP.u1) / 2, FLAP.v1 - 0.95),
			back: hatch(flap, 0.9, 1.8, 6040, { cluster: 4, skip: 0.15, trim: 0.3 }) + hatch(flap, -0.6, 2.6, 6041, { cluster: 3, skip: 0.4, trim: 0.4 }),
			fold: pathOf(fold, true),
			foldInk: outline(fold, { w: 1, seed: 6050 }),
		},
		button: b,
		buttonMatrix: sheetMatrix((BUTTON.u0 + BUTTON.u1) / 2, (BUTTON.v0 + BUTTON.v1) / 2 + 0.32),
		socket: { paper: pathOf(socket, true), ink: outline(socket, { w: 0.9, seed: 6060 }) },
	};
}

function wires() {
	const r = 0.22;
	const lidOut = jarPoint(-0.95, LID.z1, 0.95);
	const flapRear = CLIPS.flap.rear;
	const backStart: P = [-2.4, -1];
	const landing = sheetAt(backStart[0], backStart[1], r - 0.02);
	const hang = bezier(lidOut, add3(lidOut, [0.4, -0.5, 3.4]), add3(landing, [-1.2, 0.7, 2]), landing, 46);
	const back = alongSheet([backStart, [-0.6, -1.5], [10, -1.6], [flapRear[0] - 0.4, -1.3], [flapRear[0] + 0.5, 0.4], [flapRear[0] + 0.3, 2.2], flapRear], r - 0.02);
	const toFlap = cord([...hang, ...back.slice(1)], r, 6200);

	const lidSide = jarPoint(0.05, LID.z1, 1.05);
	const rowsRear = CLIPS.rows.rear;
	const sideStart: P = [-0.9, 3.2];
	const sideLanding = sheetAt(sideStart[0], sideStart[1], r - 0.02);
	const drop = bezier(lidSide, add3(lidSide, [1.2, 0.2, 2.4]), add3(sideLanding, [-0.6, -0.3, 1.8]), sideLanding, 30);
	const side = alongSheet([sideStart, [rowsRear[0] - 0.5, rowsRear[1] - 0.2], rowsRear], r - 0.02);
	const toRows = cord([...drop, ...side.slice(1)], r, 6300);

	const t = 0.13;
	const socket = jarPoint(0.55, 0.75, radiusAt(0.75) + 0.05);
	const run = alongSheet([[SOCKET[0], SOCKET[1] + 0.1], [4.6, 14.3], [1.4, 14.6], [-1.4, 13.6], [-2.6, 11.8], [-3.7, 9.4]], t - 0.02);
	const foot = run.at(-1)!;
	const rise = bezier(foot, add3(foot, [-0.2, -0.6, 0.3]), add3(socket, [0.6, 0.6, 0]), socket, 18);
	const click = cord([...run, ...rise.slice(1)], t, 6400);

	return {
		toFlap,
		toRows,
		click,
		clips: { rows: crocodile(CLIPS.rows.rear, CLIPS.rows.tip, 6500), flap: crocodile(CLIPS.flap.rear, CLIPS.flap.tip, 6520) },
		tags: {
			rows: scene.tag(sheetAt(-0.95, 2.4, 0.3), [0.4, 1, 0], 6600),
			flap: scene.tag(sheetAt(22.6, 1.0, 0.3), [0.5, 1, 0], 6620),
		},
		hang: proj(hang[Math.floor(hang.length * 0.3)]!),
	};
}

/** The whole scene, frozen into blocks.art.ts. */
export function drawing() {
	const wiring = wires();
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: pageArt(),
		jar: scene.jarArt(),
		jarTag: scene.jarTag(),
		beans: scene.beans(6),
		wires: wiring,
		note: scene.note(wiring.hang, 6700),
	};
}
