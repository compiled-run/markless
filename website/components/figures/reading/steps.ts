// A card of four instructions beside the shop page: each line runs in turn, the first three leave a value on the desk, and the last puts one section on the page.
import { createScene, roundRect, sheetAt } from '../ink/scene.ts';
import { hatch, outline, pathOf } from '../ink/ink.ts';
import { add3 } from '../kit/lathe.ts';
import { bezier } from '../ink/desk.ts';
import { STEP_CHIPS, STEP_LINES } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

const CARD = { u: -15.2, v: 2.2, w: 13.2, h: 7.2, turn: -0.04 };
const LINE_Y = [2.5, 3.9, 5.3, 6.7];
const SECTION = { u0: 1.4, v0: 9.2, u1: 14.6, v1: 13.4 };
const RELOAD = { u: 12.6, v: 0.85, r: 0.5 };
const CHIPS = [
	{ u: -15.4, v: 11.2, turn: 0.06 },
	{ u: -11, v: 11.5, turn: -0.05 },
	{ u: -6.6, v: 11.3, turn: 0.04 },
];

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	jar: false,
	extra: [sheetAt(CARD.u - 0.4, CARD.v - 0.6), sheetAt(-16, 14.6), sheetAt(-3, 14.6)],
	target: [3, -2.2, 0.6],
});
const { proj, onSheet, sheetMatrix, cord, alongSheet } = scene;

function cardArt() {
	const c = scene.card(CARD, 5000);
	return {
		cast: c.cast,
		castHatch: c.castHatch,
		paper: c.paper,
		ink: c.ink,
		header: c.header,
		rules: c.rules,
		titleMatrix: c.matrix(0.45, 0.85),
		lines: STEP_LINES.map((text, i) => ({ key: i, text, matrix: c.matrix(1.1, LINE_Y[i]!), number: c.matrix(0.4, LINE_Y[i]!), tick: c.tick(CARD.w - 1.7, LINE_Y[i]! + 0.6, 1, 5020 + i) })),
		out: c.world(CARD.w - 0.15, LINE_Y[3]! - 0.3, 0.2),
		inlet: c.world(CARD.w * 0.7, 0.05, 0.12),
	};
}

function chipsArt() {
	return CHIPS.map((at, i) => {
		const c = scene.card({ u: at.u, v: at.v, w: 3.8, h: 2.1, turn: at.turn }, 5100 + i * 20);
		return { key: i, cast: c.cast, paper: c.paper, ink: c.ink, name: c.matrix(0.35, 0.85), value: c.matrix(0.35, 1.75), label: STEP_CHIPS[i]! };
	});
}

function pageArt() {
	const box = onSheet(roundRect(SECTION.u0, SECTION.v0, SECTION.u1, SECTION.v1, 0.3), 0.02);
	return {
		...scene.shopArt(),
		section: { paper: pathOf(box, true), ink: outline(box, { w: 1.1, heavy: 0.6, seed: 5200 }), tone: hatch(onSheet([[SECTION.u0, SECTION.v1 - 0.25], [SECTION.u1, SECTION.v1 - 0.25], [SECTION.u1, SECTION.v1], [SECTION.u0, SECTION.v1]]), 0.2, 1.6, 5201, { cluster: 3, skip: 0.2 }) },
		firstMatrix: sheetMatrix(SECTION.u0 + 0.6, SECTION.v0 + 1.5),
		secondMatrix: sheetMatrix(SECTION.u0 + 0.6, SECTION.v0 + 3.1),
		spot: scene.spot(SECTION.u0 + 6.2, SECTION.v0 + 2.6, 2.6, 0.8, 5210),
		reload: scene.reload(RELOAD.u, RELOAD.v, RELOAD.r, 5220),
	};
}

function wires(card: ReturnType<typeof cardArt>) {
	const r = 0.2;
	const start = card.out;
	const desk = alongSheet([[CARD.u + CARD.w + 0.6, CARD.v + 6.4], [-1.2, 9.8], [0.2, 10.6], [SECTION.u0 + 0.35, SECTION.v0 + 1.2]], r - 0.02);
	const toPage = cord([...bezier(start, add3(start, [0.3, 0, 0.5]), add3(desk[0]!, [-0.2, 0, 0.4]), desk[0]!, 8), ...desk.slice(1)], r, 5300);
	const t = 0.12;
	const thinPath = alongSheet([[RELOAD.u - 0.3, RELOAD.v - 0.45], [11.4, -0.9], [4, -1.5], [-4.4, -1.4]], t - 0.02);
	const end = card.inlet;
	const thin = cord([...thinPath, ...bezier(thinPath.at(-1)!, add3(thinPath.at(-1)!, [-0.3, 0.4, 0]), add3(end, [0, -0.5, 0.3]), end, 10).slice(1)], t, 5350);
	return { toPage, thin };
}

/** The whole scene, frozen into steps.art.ts. */
export function drawing() {
	const card = cardArt();
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: pageArt(),
		card: { cast: card.cast, castHatch: card.castHatch, paper: card.paper, ink: card.ink, header: card.header, rules: card.rules, titleMatrix: card.titleMatrix, lines: card.lines },
		chips: chipsArt(),
		wires: wires(card),
		note: scene.note(proj(sheetAt(-1.0, 9.9, 0.3)), 5500, [6, HEIGHT - 14]),
	};
}

