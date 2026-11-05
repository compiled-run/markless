// Two paint dabs on a palette and the swatch mixed from them: loose ink blobs, a palette board with its thumb hole, and a hatched swatch card.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 300;
export const DABS = [
	{ cx: 120, cy: 150 },
	{ cx: 290, cy: 150 },
] as const;
export const SWATCH = { x: 450, y: 50, w: 200, h: 210 };

function paletteArt() {
	const board: P[] = jitter(resample([[30, 120], [70, 50], [190, 30], [330, 40], [395, 100], [390, 200], [330, 262], [190, 272], [70, 250], [26, 190]], 8, true), 9901, 1.4);
	const hole = ellipse(370, 210, 16, 12, 18);
	const shadow = board.map(([x, y]) => [x + 9, y + 11] as P);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.8, 9902, { cluster: 4, skip: 0.3 }),
		board: pathOf(board, true),
		grain: hatch(board, 0.08, 7, 9903, { cluster: 2, skip: 0.6, trim: 0.7 }),
		hole: pathOf(hole, true),
		ink: outline(board, { w: 1.9, heavy: 1.5, seed: 9904 }) + outline(hole, { w: 1.1, seed: 9905 }),
	};
}

function dabArt(cx: number, cy: number, seed: number) {
	const blob = jitter(resample(ellipse(cx, cy, 58, 50, 20), 6, true), seed, 5);
	const gloss: P[] = [[cx - 30, cy - 26], [cx - 10, cy - 36], [cx + 6, cy - 34]];
	return {
		blob: pathOf(blob, true),
		ink: outline(blob, { w: 1.5, heavy: 1.1, seed: seed + 1 }) + line(gloss, { w: 1, seed: seed + 2, over: 0 }),
		shade: hatch(blob.filter(([x, y]) => x + y > cx + cy + 10), 0.9, 2.4, seed + 3, { cluster: 3, skip: 0.2 }),
	};
}

function swatchArt() {
	const { x, y, w, h } = SWATCH;
	const card = jitter(resample(roundRect(x, y, x + w, y + h, 6), 6, true), 9951, 1);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 6), 8, true), 9952, 1.1);
	const patch = jitter(resample(roundRect(x + 18, y + 18, x + w - 18, y + h - 52, 4), 5, true), 9953, 1.6);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 9954, { cluster: 4, skip: 0.3 }),
		card: pathOf(card, true),
		patch: pathOf(patch, true),
		patchEdge: wash(patch, 9955, 1.2, 3),
		ink: outline(card, { w: 1.8, heavy: 1.4, seed: 9956 }) + outline(patch, { w: 1, seed: 9957 }),
		labelX: x + w / 2,
		labelY: y + h - 20,
	};
}

/** The whole figure, frozen into mixer.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		palette: paletteArt(),
		dabs: DABS.map((d, i) => ({ ...dabArt(d.cx, d.cy, 9920 + i * 10), cx: d.cx, cy: d.cy })),
		swatch: swatchArt(),
		plus: line([[192, 150], [222, 149]], { w: 3, seed: 9990, over: 0.3 }) + line([[207, 135], [208, 165]], { w: 3, seed: 9991, over: 0.3 }),
		equals: line([[408, 141], [436, 140]], { w: 3, seed: 9992, over: 0.3 }) + line([[408, 158], [436, 157]], { w: 3, seed: 9993, over: 0.3 }),
	};
}
