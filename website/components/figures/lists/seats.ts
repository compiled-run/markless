// The tasting list on the shop page: each guest's place card carries its name and its tick, and a reorder walks the cards to new seats.
import { createScene, roundRect, sheetAt } from '../ink/scene.ts';
import { jitter } from '../ink/desk.ts';
import { pencil } from '../ink/plane.ts';
import { hatch, line, outline, pathOf, r1, resample, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

/** Row baselines down the page, one per seat. */
export const SEATS = [7.6, 9.9, 12.2] as const;
const CARD = { u0: 1.6, u1: 14.2, h: 1.9 };
const BUTTON = { u0: 15.6, v0: 6.6, u1: 21.8, v1: 7.9 };

const scene = createScene({ width: WIDTH, height: HEIGHT, extra: [], target: [10.4, -2.4, 0.4] });
const { proj, onSheet, sheetMatrix } = scene;

/** A folded place card lying in seat `seat`: its face, the fold's shading, the tick box and its tick. */
function cardArt(seed: number) {
	const v = SEATS[0];
	const top = v - CARD.h + 0.35;
	const face = onSheet(jitter(resample(roundRect(CARD.u0, top, CARD.u1, v + 0.35, 0.18), 0.3, true), seed, 0.025), 0.05);
	const fold = onSheet([[CARD.u0 + 0.1, top + 0.32], [CARD.u1 - 0.1, top + 0.32]], 0.05);
	const shade = onSheet([[CARD.u0, top], [CARD.u1, top], [CARD.u1, top + 0.32], [CARD.u0, top + 0.32]], 0.05);
	const box = onSheet(roundRect(8.8, v - 0.95, 9.7, v - 0.05, 0.08), 0.06);
	const tick = onSheet([[8.95, v - 0.55], [9.2, v - 0.2], [9.9, v - 1.2]], 0.07);
	return {
		paper: pathOf(face, true),
		ink: outline(face, { w: 1.1, heavy: 0.8, seed: seed + 1 }) + line(fold, { w: 0.5, seed: seed + 2, over: 0 }),
		shade: hatch(shade, 0.1, 1.5, seed + 3, { cluster: 4, skip: 0.2 }),
		box: outline(box, { w: 0.8, seed: seed + 4 }),
		tick: line(tick, { w: 1.4, seed: seed + 5, over: 0.3 }),
		tickWash: wash(onSheet(roundRect(8.6, v - 1.2, 10, v + 0.1, 0.2)), seed + 6, 0.6, 1.4),
		nameMatrix: sheetMatrix(CARD.u0 + 0.6, v),
		coffeeMatrix: sheetMatrix(10.1, v),
	};
}

/** How far a card sitting in seat 0 moves on screen to reach each seat. */
const shifts = SEATS.map((v) => {
	const a = proj(sheetAt(7, SEATS[0]));
	const b = proj(sheetAt(7, v));
	return `--to-x:${r1(b[0] - a[0])}px;--to-y:${r1(b[1] - a[1])}px`;
});

function buttonArt() {
	const { u0, v0, u1, v1 } = BUTTON;
	const face = onSheet(roundRect(u0, v0, u1, v1, 0.35), 0.12);
	const side = onSheet(roundRect(u0 + 0.08, v0 + 0.12, u1 + 0.08, v1 + 0.12, 0.35));
	const a = proj(sheetAt(u0, v0, 0.12));
	const b = proj(sheetAt(u0 + 0.06, v0 + 0.1, 0));
	return {
		side: pathOf(side, true),
		sideHatch: hatch(side, 0.9, 1.4, 6010, { cluster: 1 }),
		paper: pathOf(face, true),
		wash: wash(face, 6011, 0.8, 1.6),
		ink: outline(face, { w: 1.1, heavy: 0.8, seed: 6012 }),
		matrix: sheetMatrix(u0 + 0.6, v0 + 0.92),
		sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`,
	};
}

/** The whole scene, frozen into seats.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			...scene.shopArt(),
			headMatrix: sheetMatrix(1.4, 5.2),
			seatNumbers: SEATS.map((v) => sheetMatrix(0.5, v)),
			seatPencil: SEATS.map((v, i) => pencil(onSheet([[0.3, v + 0.5], [15, v + 0.5]]), 6100 + i)).join(''),
			button: buttonArt(),
		},
		cards: [cardArt(6200), cardArt(6300), cardArt(6400)],
		shifts,
		note: scene.note(proj(sheetAt(14.4, SEATS[2] - 0.4, 0.1)), 6470, [300, HEIGHT - 10]),
	};
}
