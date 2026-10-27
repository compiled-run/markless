// The cart page on the desk beside the card of instructions that builds it: the card's lines run top to bottom, the last one puts the button on the page, and the value lands in the button's hole.
import { createScene, type P, sheetAt } from '../ink/scene.ts';
import { add3 } from '../kit/lathe.ts';
import { bezier } from '../ink/desk.ts';
import { CARD_LINES } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 420;

const CARD = { u: -14.2, v: 4.9, w: 12.2, h: 5, turn: -0.05 };
const BUTTON = { u0: 1.3, v0: 10.4, u1: 8.6, v1: 12.8 };
export const HOLE = { u0: 1.85, v0: 10.75, u1: 3.45, v1: 12.45 };
const RELOAD = { u: 12.6, v: 0.85, r: 0.5 };
export const CLIP = { rear: [0.3, 8.6] as P, tip: [2.1, 10.55] as P };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	jar: false,
	extra: [sheetAt(CARD.u - 0.4, CARD.v - 0.6), sheetAt(CARD.u - 0.4, CARD.v + CARD.h + 0.8), sheetAt(CARD.u + 2, CARD.v + CARD.h + 1.2)],
	target: [4.5, -2.2, 0.6],
});
const { proj, sheetMatrix, cord, alongSheet, crocodile } = scene;

/** Where each line of the card sits, in card centimetres from its top-left corner. */
const LINE_Y = [2.5, 3.9];

function cardArt() {
	const c = scene.card(CARD, 3000);
	return {
		cast: c.cast,
		castHatch: c.castHatch,
		paper: c.paper,
		ink: c.ink,
		header: c.header,
		rules: c.rules,
		titleMatrix: c.matrix(0.45, 0.85),
		lines: CARD_LINES.map((text, i) => ({ key: i, text, matrix: c.matrix(1.1, LINE_Y[i]!), number: c.matrix(0.4, LINE_Y[i]!), tick: c.tick(CARD.w - 0.75, LINE_Y[i]! + 0.6, 1, 3020 + i) })),
		out: c.world(CARD.w - 0.15, LINE_Y[0]! - 0.3, 0.2),
		inlet: c.world(CARD.w * 0.62, 0.05, 0.12),
	};
}

function pageArt() {
	const b = scene.pageButton(BUTTON, 3100);
	const h = scene.hole(HOLE.u0, HOLE.v0, HOLE.u1, HOLE.v1, 3120);
	return {
		...scene.shopArt(),
		button: { paper: b.paper, side: b.side, ink: b.ink },
		bagsMatrix: sheetMatrix(HOLE.u1 + 0.35, BUTTON.v1 - 0.75),
		hole: h,
		valueMatrix: sheetMatrix((HOLE.u0 + HOLE.u1) / 2, HOLE.v1 - 0.4),
		spot: scene.spot((HOLE.u0 + HOLE.u1) / 2, (HOLE.v0 + HOLE.v1) / 2, 0.75, 0.75, 3130),
		reload: scene.reload(RELOAD.u, RELOAD.v, RELOAD.r, 3140),
	};
}

function wires(card: ReturnType<typeof cardArt>) {
	const r = 0.2;
	const rear = CLIP.rear;
	const desk = alongSheet([[CARD.u + CARD.w + 0.7, CARD.v + 1.7], [-1.4, 7.6], [-0.6, 8.4], [rear[0] - 0.45, rear[1] - 0.1], rear], r - 0.02);
	const start = card.out;
	const value = cord([...bezier(start, add3(start, [0.3, 0, 0.5]), add3(desk[0]!, [-0.2, 0, 0.4]), desk[0]!, 8), ...desk.slice(1)], r, 3200);
	const t = 0.12;
	const thinPath = alongSheet([[RELOAD.u - 0.3, RELOAD.v - 0.45], [11.4, -0.9], [4, -1.5], [-4.2, -0.6], [-6.6, 2.9]], t - 0.02);
	const end = card.inlet;
	const thin = cord([...thinPath, ...bezier(thinPath.at(-1)!, add3(thinPath.at(-1)!, [0, 0.6, 0]), add3(end, [0, -0.5, 0.3]), end, 10).slice(1)], t, 3250);
	return { value, thin, clip: crocodile(CLIP.rear, CLIP.tip, 3300) };
}

/** The whole scene, frozen into build.art.ts. */
export function drawing() {
	const card = cardArt();
	const wiring = wires(card);
	const tagAt = sheetAt(-1.25, 7.75, 0.25);
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: pageArt(),
		card: { cast: card.cast, castHatch: card.castHatch, paper: card.paper, ink: card.ink, header: card.header, rules: card.rules, titleMatrix: card.titleMatrix, lines: card.lines },
		wires: wiring,
		tag: scene.tag(tagAt, [0.2, 1, 0], 3400),
		note: scene.note(proj(sheetAt(-1.5, 7.9, 0.3)), 3500, [6, HEIGHT - 14]),
	};
}
