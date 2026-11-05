// One keyboard key, the event card it drops, and the open hand that is your handler.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 280;

const KEY = { x: 40, y: 70, w: 150, h: 140 };
const HAND = { x: 430, y: 150 };
/** Where the event card rests in the hand, and where it starts under the key. */
export const CARD = { w: 150, h: 78, restX: 448, restY: 104, fromX: 44, fromY: 150 };

function keyArt() {
	const { x, y, w, h } = KEY;
	const base = jitter(resample(roundRect(x, y + 14, x + w, y + h + 14, 18), 6, true), 9001, 1);
	const cap = jitter(resample(roundRect(x + 12, y, x + w - 12, y + h - 18, 14), 6, true), 9002, 0.9);
	const dish = ellipse(x + w / 2, y + (h - 18) / 2, 44, 36, 28);
	return {
		base: pathOf(base, true),
		baseHatch: hatch(base.slice(base.length / 2), 1.1, 2.4, 9003, { cluster: 3, skip: 0.2 }),
		cap: pathOf(cap, true),
		ink: outline(base, { w: 1.8, heavy: 1.4, seed: 9004 }) + outline(cap, { w: 1.6, heavy: 1.2, seed: 9005 }) + outline(dish, { w: 0.6, seed: 9006 }),
		letterX: x + w / 2,
		letterY: y + (h - 18) / 2 + 22,
	};
}

function cardArt() {
	const { w, h } = CARD;
	const shape = jitter(resample(roundRect(0, 0, w, h, 8), 6, true), 9101, 0.8);
	return {
		paper: pathOf(shape, true),
		wash: wash(shape, 9102, 2, 3),
		ink: outline(shape, { w: 1.4, heavy: 1, seed: 9103 }) + line([[12, 26], [w - 14, 27]], { w: 0.5, seed: 9104, over: 0.3 }),
	};
}

/** An open hand, palm up, drawn as one loose outline with four finger tips and a thumb. */
function handArt() {
	const { x, y } = HAND;
	const palm: P[] = [
		[x, y + 40], [x + 16, y + 6], [x + 40, y - 2], [x + 62, y - 30], [x + 74, y - 28], [x + 70, y - 4],
		[x + 92, y - 6], [x + 196, y - 4], [x + 210, y + 4], [x + 200, y + 14], [x + 160, y + 16], [x + 214, y + 22], [x + 222, y + 32],
		[x + 210, y + 40], [x + 160, y + 38], [x + 206, y + 48], [x + 210, y + 58], [x + 196, y + 64], [x + 150, y + 58],
		[x + 186, y + 72], [x + 182, y + 82], [x + 140, y + 78], [x + 90, y + 84], [x + 40, y + 78], [x + 6, y + 64],
	];
	const outlinePts = jitter(resample(palm, 5, true), 9201, 0.8);
	const crease = line([[x + 40, y + 46], [x + 90, y + 40], [x + 130, y + 46]], { w: 0.6, seed: 9202, over: 0.3 });
	return {
		paper: pathOf(outlinePts, true),
		ink: outline(outlinePts, { w: 1.6, heavy: 1.2, seed: 9203 }) + crease,
		shade: hatch(outlinePts.filter((_, i) => i > outlinePts.length * 0.55), 0.9, 2.2, 9204, { cluster: 3, skip: 0.25 }),
	};
}

/** The whole figure, frozen into keycard.art.ts. */
export function drawing() {
	return { width: WIDTH, height: HEIGHT, key: keyArt(), card: cardArt(), hand: handArt() };
}
