// The bags jar wired into three holes on the shop page: the button's number, the number in its title, and its click.
import { bezier, createScene, ellipse, LID, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { outline, pathOf } from '../ink/ink.ts';
import { add3 } from '../kit/lathe.ts';

export const WIDTH = 680;
export const HEIGHT = 430;

const BUTTON = { u0: 1.3, v0: 10.5, u1: 9.4, v1: 12.9 };
export const TEXT_HOLE = { u0: 1.8, v0: 10.85, u1: 3.4, v1: 12.55 };
const FLAG = { u0: 6.4, v0: 7.9, u1: 14.6, v1: 9.6 };
export const TITLE_HOLE = { u0: 12.5, v0: 8.05, u1: 14.1, v1: 9.45 };
const SOCKET: P = [5.4, 12.9];

const CLIPS = {
	text: { rear: [-0.2, 9.3] as P, tip: [1.95, 10.95] as P },
	title: { rear: [17.4, 7.0] as P, tip: [14.25, 8.25] as P },
};

const scene = createScene({ width: WIDTH, height: HEIGHT, jar: true, extra: [], target: [7, -2.2, 0.8] });
const { proj, onSheet, sheetMatrix, cord, alongSheet, crocodile, jarPoint, radiusAt } = scene;

function pageArt() {
	const b = scene.pageButton(BUTTON, 4100);
	const flag = onSheet([...roundRect(FLAG.u0, FLAG.v0, FLAG.u1, FLAG.v1, 0.25), [FLAG.u0 + 1.6, FLAG.v1], [FLAG.u0 + 1.1, FLAG.v1 + 0.7], [FLAG.u0 + 1.0, FLAG.v1]], 0.03);
	const textHole = scene.hole(TEXT_HOLE.u0, TEXT_HOLE.v0, TEXT_HOLE.u1, TEXT_HOLE.v1, 4120);
	const titleHole = scene.hole(TITLE_HOLE.u0, TITLE_HOLE.v0, TITLE_HOLE.u1, TITLE_HOLE.v1, 4140);
	const socket = onSheet(ellipse(SOCKET[0], SOCKET[1] + 0.05, 0.42, 0.3, 16), 0.14);
	return {
		...scene.shopArt(),
		button: b,
		bagsMatrix: sheetMatrix(TEXT_HOLE.u1 + 0.35, BUTTON.v1 - 0.75),
		textHole,
		textMatrix: sheetMatrix((TEXT_HOLE.u0 + TEXT_HOLE.u1) / 2, TEXT_HOLE.v1 - 0.4),
		textSpot: scene.spot((TEXT_HOLE.u0 + TEXT_HOLE.u1) / 2, (TEXT_HOLE.v0 + TEXT_HOLE.v1) / 2, 0.75, 0.75, 4150),
		flag: { paper: pathOf(flag, true), ink: outline(flag, { w: 0.9, seed: 4160 }) },
		flagMatrix: sheetMatrix(FLAG.u0 + 0.4, FLAG.v1 - 0.45),
		titleHole,
		titleMatrix: sheetMatrix((TITLE_HOLE.u0 + TITLE_HOLE.u1) / 2, TITLE_HOLE.v1 - 0.35),
		titleSpot: scene.spot((TITLE_HOLE.u0 + TITLE_HOLE.u1) / 2, (TITLE_HOLE.v0 + TITLE_HOLE.v1) / 2, 0.7, 0.62, 4170),
		socket: { paper: pathOf(socket, true), ink: outline(socket, { w: 0.9, seed: 4180 }) },
	};
}

function wires() {
	const r = 0.22;
	const lidOut = jarPoint(-0.95, LID.z1, 0.95);
	const titleRear = CLIPS.title.rear;
	const backStart: P = [-2.4, -1];
	const landing = sheetAt(backStart[0], backStart[1], r - 0.02);
	const hang = bezier(lidOut, add3(lidOut, [0.4, -0.5, 3.4]), add3(landing, [-1.2, 0.7, 2]), landing, 46);
	const back = alongSheet([backStart, [-0.6, -1.5], [8, -1.6], [titleRear[0] - 1.2, -1.4], [titleRear[0] + 0.3, 0.6], [titleRear[0] + 0.4, 4.4], [titleRear[0], titleRear[1]]], r - 0.02);
	const title = cord([...hang, ...back.slice(1)], r, 4200);

	const lidSide = jarPoint(0.05, LID.z1, 1.05);
	const textRear = CLIPS.text.rear;
	const sideStart: P = [-0.5, 5.6];
	const sideLanding = sheetAt(sideStart[0], sideStart[1], r - 0.02);
	const drop = bezier(lidSide, add3(lidSide, [1.2, 0.2, 2.4]), add3(sideLanding, [-0.6, -0.6, 1.8]), sideLanding, 30);
	const side = alongSheet([sideStart, [-0.6, 7.4], [-0.7, 8.7], [textRear[0] - 0.4, textRear[1] - 0.2], textRear], r - 0.02);
	const text = cord([...drop, ...side.slice(1)], r, 4300);

	const t = 0.13;
	const socket = jarPoint(0.55, 0.75, radiusAt(0.75) + 0.05);
	const run = alongSheet([[SOCKET[0], SOCKET[1] + 0.1], [4.6, 14.1], [1.4, 14.5], [-1.4, 13.6], [-2.6, 11.8], [-3.7, 9.4]], t - 0.02);
	const foot = run.at(-1)!;
	const rise = bezier(foot, add3(foot, [-0.2, -0.6, 0.3]), add3(socket, [0.6, 0.6, 0]), socket, 18);
	const click = cord([...run, ...rise.slice(1)], t, 4400);

	return {
		title,
		text,
		click,
		clips: { text: crocodile(CLIPS.text.rear, CLIPS.text.tip, 4500), title: crocodile(CLIPS.title.rear, CLIPS.title.tip, 4520) },
		tags: {
			text: scene.tag(sheetAt(-0.55, 7.2, 0.3), [0.4, 1, 0], 4600),
			title: scene.tag(sheetAt(17.9, 3.4, 0.3), [0.5, 1, 0], 4620),
			click: scene.tag(sheetAt(-1.1, 14.0, 0.2), [0.3, 1, 0], 4640),
		},
		hang: proj(hang[Math.floor(hang.length * 0.3)]!),
	};
}

/** The whole scene, frozen into values.art.ts. */
export function drawing() {
	const wiring = wires();
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: pageArt(),
		jar: scene.jarArt(),
		jarTag: scene.jarTag(),
		beans: scene.beans(12),
		wires: wiring,
		note: scene.note(wiring.hang, 4700),
	};
}
