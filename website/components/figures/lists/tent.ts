// Three folded name cards standing in three numbered slots on a table edge: each card carries its name and its tick.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';
import { CARD_W } from './tent-model.ts';

export const WIDTH = 680;
export const HEIGHT = 300;
/** Left edge of each slot; a card standing in slot i is drawn at SLOT_X[i]. */
export const SLOT_X = [40, 255, 470] as const;
const CARD = { w: CARD_W, h: 120, y: 70 };

/** A tent card seen from the front: the face, the lit back fold above it, a tick box, and its shadow. */
function cardArt(seed: number) {
	const { w, h, y } = CARD;
	const face = jitter(resample([[0, y], [w, y + 2], [w - 4, y + h], [4, y + h - 1]], 6, true), seed, 0.9);
	const back = jitter(resample([[10, y - 26], [w - 8, y - 24], [w, y + 2], [0, y]], 6, true), seed + 1, 0.8);
	const shadow = jitter(resample([[-14, y + h - 4], [w + 16, y + h - 2], [w + 26, y + h + 16], [-22, y + h + 14]], 6, true), seed + 2, 1);
	const left = jitter(resample([[0, y - 10], [-16, y + 10], [-20, y + h + 8], [2, y + h]], 5, true), seed + 11, 0.8);
	const right = jitter(resample([[w, y + 2], [w + 18, y + 18], [w + 22, y + h + 12], [w - 2, y + h]], 5, true), seed + 12, 0.8);
	const box = roundRect(w - 54, y + h - 46, w - 22, y + h - 14, 4);
	const tick: P[] = [[w - 48, y + h - 30], [w - 40, y + h - 20], [w - 20, y + h - 52]];
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.35, 2.4, seed + 3, { cluster: 4, skip: 0.25 }),
		sides: pathOf(left, true) + pathOf(right, true),
		sideHatch: hatch(left, 1.3, 2, seed + 13, { cluster: 3, skip: 0.25 }) + hatch(right, 1.3, 2, seed + 14, { cluster: 3, skip: 0.25 }),
		back: pathOf(back, true),
		backHatch: hatch(back, 0.15, 2, seed + 4, { cluster: 5, skip: 0.2 }),
		face: pathOf(face, true),
		ink: outline(face, { w: 1.7, heavy: 1.3, seed: seed + 5 }) + outline(back, { w: 1.1, seed: seed + 6 }) + line([[14, y + 34], [w - 16, y + 36]], { w: 0.5, seed: seed + 7, over: 0.3 }),
		box: outline(box, { w: 1.1, seed: seed + 8 }),
		tick: line(tick, { w: 2.6, heavy: 0.6, seed: seed + 9, over: 0.4 }),
		tickWash: wash(roundRect(w - 60, y + h - 56, w - 14, y + h - 8, 6), seed + 10, 1.4, 2),
		nameX: 18,
		nameY: y + 78,
	};
}

/** The table edge and a pencilled slot number under each place. */
function tableArt() {
	const edge = line(resample([[10, CARD.y + CARD.h + 8], [WIDTH - 10, CARD.y + CARD.h + 10]], 8), { w: 1.6, heavy: 1, seed: 9700, over: 0.6 });
	const marks = SLOT_X.map((x, i) => line([[x + 30, CARD.y + CARD.h + 26], [x + CARD.w - 30, CARD.y + CARD.h + 27]], { w: 0.5, seed: 9710 + i, over: 0.2 })).join('');
	const pins = SLOT_X.map((x, i) => outline(ellipse(x + CARD.w / 2, CARD.y + CARD.h + 44, 13, 13, 18), { w: 0.8, seed: 9720 + i })).join('');
	return { edge, marks, pins, numberY: CARD.y + CARD.h + 50 };
}

/** The whole figure, frozen into tent.art.ts. */
export function drawing() {
	return { width: WIDTH, height: HEIGHT, cards: [cardArt(9800), cardArt(9850), cardArt(9900)], table: tableArt(), slots: [...SLOT_X] };
}
