// A corkboard with one pinned postcard, a lane running to it from the post slot, two postcards on the lane, and a bin under the board.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';
import { BOARD_X, LANE } from './postcards-model.ts';

export const WIDTH = 680;
export const HEIGHT = 330;
export const CARD = { w: 150, h: 100 };
/** Where a card's top-left sits: on the lane, pinned on the board, and in the bin. */
export const PLACES = {
	laneY: 128,
	pinned: { x: BOARD_X, y: 66 },
	bin: { x: 556, y: 268 },
} as const;
const BOARD = { x: 474, y: 28, w: 196, h: 212 };
const BIN = { x: 548, y: 262, w: 86, h: 60 };

const pct = (n: number, of: number) => Math.round((n / of) * 1000) / 10 + '%';

/** One postcard: its edge, a stamp box in the corner, a postmark, the divider and two address lines, plus the VOID stamp it may get. */
function cardArt(seed: number) {
	const { w, h } = CARD;
	const edge = jitter(resample(roundRect(0, 0, w, h, 3), 6, true), seed, 0.9);
	const shadow = jitter(resample(roundRect(6, 8, w + 6, h + 8, 3), 7, true), seed + 1, 1);
	const stamp = jitter(resample(roundRect(w - 34, 8, w - 8, 36, 2), 4, true), seed + 2, 0.8);
	const mark = [0, 1, 2].map((i) => line([[w - 62, 14 + i * 7], [w - 40, 12 + i * 7]], { w: 0.6, seed: seed + 10 + i, over: 0 })).join('');
	const ring = outline(ellipse(w - 50, 22, 10, 10, 18), { w: 0.7, seed: seed + 3 });
	const divider = line([[w / 2 + 6, 44], [w / 2 + 6, h - 10]], { w: 0.7, seed: seed + 4, over: 0 });
	const lines = [0, 1].map((i) => line([[w / 2 + 16, 62 + i * 14], [w - 12, 63 + i * 14]], { w: 0.6, seed: seed + 20 + i, over: 0 })).join('');
	const voidRing = jitter(ellipse(w / 2, h / 2, 54, 24, 30), seed + 5, 1.4);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, seed + 6, { cluster: 4, skip: 0.3 }),
		paper: pathOf(edge, true),
		ink: outline(edge, { w: 1.5, heavy: 1.1, seed: seed + 7 }) + outline(stamp, { w: 0.9, seed: seed + 8 }) + ring + mark + divider + lines,
		stampHatch: hatch(stamp, 0.8, 2.2, seed + 9, { cluster: 2, skip: 0.4, trim: 0.4 }),
		voidRing: outline(voidRing, { w: 1.6, seed: seed + 30 }) + outline(jitter(ellipse(w / 2, h / 2, 50, 20, 30), seed + 31, 1.2), { w: 0.8, seed: seed + 32 }),
	};
}

function boardArt() {
	const { x, y, w, h } = BOARD;
	const frame = jitter(resample(roundRect(x, y, x + w, y + h, 6), 8, true), 8101, 1.2);
	const cork = jitter(resample(roundRect(x + 10, y + 10, x + w - 10, y + h - 10, 3), 8, true), 8102, 0.8);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 6), 9, true), 8103, 1.2);
	const grain = hatch(cork, 0.35, 5, 8104, { cluster: 1, skip: 0.6, trim: 0.7 }) + hatch(cork, -0.9, 7, 8105, { cluster: 1, skip: 0.7, trim: 0.8 });
	const pinHead = ellipse(BOARD_X + CARD.w / 2, PLACES.pinned.y + 2, 7, 7, 16);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.8, 8106, { cluster: 4, skip: 0.3 }),
		frame: pathOf(frame, true),
		frameHatch: hatch(frame, 0.5, 2.4, 8107, { cluster: 3, skip: 0.3, trim: 0.3 }),
		cork: pathOf(cork, true),
		corkWash: wash(cork, 8108, 1.5, 3),
		grain,
		ink: outline(frame, { w: 1.9, heavy: 1.5, seed: 8109 }) + outline(cork, { w: 1, seed: 8110 }),
		pin: { head: pathOf(pinHead, true), ink: outline(pinHead, { w: 1, seed: 8111 }) + line([[BOARD_X + CARD.w / 2 + 2, PLACES.pinned.y + 8], [BOARD_X + CARD.w / 2 + 5, PLACES.pinned.y + 22]], { w: 1.2, seed: 8112, over: 0 }) },
	};
}

function laneArt() {
	const y = PLACES.laneY + CARD.h + 6;
	const road = resample([[LANE.min - 10, y], [BOARD_X - 6, y + 1]], 12);
	const dashes = road.slice(0, -1).filter((_, i) => i % 2 === 0).map((p, i) => line([p, [p[0] + 7, p[1]]], { w: 1.3, seed: 8200 + i, over: 0 })).join('');
	const arrows = [LANE.min + 60, LANE.min + 180, LANE.min + 300].map((ax, i) => line([[ax - 6, y - 6], [ax, y], [ax - 6, y + 6]], { w: 1.3, seed: 8220 + i, over: 0 })).join('');
	const slot = jitter(resample(roundRect(14, PLACES.laneY - 6, 30, PLACES.laneY + CARD.h + 6, 4), 6, true), 8230, 0.8);
	return {
		ink: dashes + arrows + outline(slot, { w: 1.2, seed: 8231 }) + hatch(slot, 1.2, 2.4, 8232, { cluster: 2, skip: 0.3 }),
	};
}

function binArt() {
	const { x, y, w, h } = BIN;
	const body: P[] = [[x + 6, y], [x + w - 6, y], [x + w - 12, y + h], [x + 12, y + h]];
	const rim = ellipse(x + w / 2, y, w / 2 - 6, 5, 20);
	return {
		paper: pathOf(jitter(resample(body, 5, true), 8301, 0.8), true),
		hatch: hatch(body, 1.35, 4, 8302, { cluster: 1, skip: 0.2, trim: 0.2 }),
		ink: outline(jitter(resample(body, 5, true), 8301, 0.8), { w: 1.4, heavy: 1, seed: 8303 }) + outline(rim, { w: 1, seed: 8304 }),
	};
}

/** The whole figure, frozen into postcards.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		cards: { austin: cardArt(8400), boston: cardArt(8450), denver: cardArt(8500) },
		board: boardArt(),
		lane: laneArt(),
		bin: binArt(),
		card: { w: CARD.w, h: CARD.h, size: `width:${pct(CARD.w, WIDTH)};height:${pct(CARD.h, HEIGHT)}` },
		places: {
			laneTop: pct(PLACES.laneY, HEIGHT),
			pinned: { left: pct(PLACES.pinned.x, WIDTH), top: pct(PLACES.pinned.y, HEIGHT) },
			bin: { left: pct(PLACES.bin.x, WIDTH), top: pct(PLACES.bin.y, HEIGHT) },
		},
	};
}
