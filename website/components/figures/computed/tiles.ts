// Three paper tiles drawn flat in ink, mugs + coasters = total, with the plus and equals between them.
import { jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 260;
const TILE = { w: 150, h: 170, y: 50 };
/** Left edges of the three tiles. */
export const TILE_X = [24, 262, 500] as const;

function tileArt(x: number, seed: number) {
	const shape = jitter(resample(roundRect(x, TILE.y, x + TILE.w, TILE.y + TILE.h, 10), 6, true), seed, 1.1);
	const shadow = jitter(resample(roundRect(x + 7, TILE.y + 9, x + TILE.w + 7, TILE.y + TILE.h + 9, 10), 8, true), seed + 1, 1.2);
	const fold: P[] = [[x + 14, TILE.y + 44], [x + TILE.w - 14, TILE.y + 46]];
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.6, 3.2, seed + 2, { cluster: 4, skip: 0.3 }),
		paper: pathOf(shape, true),
		wash: wash(shape, seed + 3, 3, 4),
		ink: outline(shape, { w: 1.8, heavy: 1.4, centre: [x + TILE.w / 2, TILE.y + TILE.h / 2], seed: seed + 4 }) + line(fold, { w: 0.7, seed: seed + 5, over: 0.4 }),
		x,
		cx: x + TILE.w / 2,
	};
}

function signArt(cx: number, equals: boolean, seed: number) {
	const cy = TILE.y + TILE.h / 2;
	const strokes: P[][] = equals
		? [[[cx - 20, cy - 9], [cx + 20, cy - 10]], [[cx - 20, cy + 10], [cx + 20, cy + 9]]]
		: [[[cx - 21, cy], [cx + 21, cy - 1]], [[cx, cy - 21], [cx + 1, cy + 21]]];
	return strokes.map((s, i) => line(s, { w: 3, heavy: 1, seed: seed + i, over: 0.6 })).join('');
}

/** The whole figure, frozen into tiles.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		tiles: TILE_X.map((x, i) => tileArt(x, 8000 + i * 20)),
		plus: signArt((TILE_X[0] + TILE.w + TILE_X[1]) / 2, false, 8100),
		equals: signArt((TILE_X[1] + TILE.w + TILE_X[2]) / 2, true, 8110),
		nameY: TILE.y + 34,
		numberY: TILE.y + 128,
	};
}
