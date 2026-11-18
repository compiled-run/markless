// A split-flap board on the wall: a dark frame with two cells, each a flap split across the middle, and the screws that hold it up.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 230;
export const FRAME = { x: 50, y: 32, w: 580, h: 170 };
const BOXES = {
	city: { x: 76, y: 62, w: 300, h: 110 },
	temp: { x: 408, y: 62, w: 196, h: 110 },
} as const;
const pct = (n: number, of: number) => Math.round((n / of) * 1000) / 10 + '%';
/** Each cell's box in drawing units, plus the CSS that puts the HTML flaps exactly over it. */
export const CELLS = {
	city: { ...BOXES.city, place: `left:${pct(BOXES.city.x, WIDTH)};top:${pct(BOXES.city.y, HEIGHT)};width:${pct(BOXES.city.w, WIDTH)};height:${pct(BOXES.city.h, HEIGHT)}` },
	temp: { ...BOXES.temp, place: `left:${pct(BOXES.temp.x, WIDTH)};top:${pct(BOXES.temp.y, HEIGHT)};width:${pct(BOXES.temp.w, WIDTH)};height:${pct(BOXES.temp.h, HEIGHT)}` },
} as const;

/** One flap half: a plate with a slightly lighter lip at the split. */
function flapArt(w: number, h: number, seed: number) {
	const top = jitter(resample(roundRect(0, 0, w, h / 2 - 2, 5), 6, true), seed, 0.6);
	const bottom = jitter(resample(roundRect(0, h / 2 + 2, w, h, 5), 6, true), seed + 1, 0.6);
	return {
		top: pathOf(top, true),
		bottom: pathOf(bottom, true),
		topInk: outline(top, { w: 1.1, seed: seed + 2 }),
		bottomInk: outline(bottom, { w: 1.1, seed: seed + 3 }),
		topShade: hatch(top, 0.2, 3.2, seed + 4, { cluster: 3, skip: 0.45, trim: 0.4 }),
		bottomShade: hatch(bottom, 0.2, 2.6, seed + 5, { cluster: 4, skip: 0.3, trim: 0.3 }),
		split: line([[2, h / 2], [w - 2, h / 2 + 0.4]], { w: 0.9, seed: seed + 6, over: 0 }),
	};
}

function frameArt() {
	const { x, y, w, h } = FRAME;
	const plate = jitter(resample(roundRect(x, y, x + w, y + h, 10), 8, true), 7101, 1.2);
	const shadow = jitter(resample(roundRect(x + 10, y + 12, x + w + 10, y + h + 12, 10), 9, true), 7102, 1.2);
	const screws = [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]] as P[];
	const screwInk = screws.map((s, i) => outline(ellipse(s[0], s[1], 5, 5, 14), { w: 0.9, seed: 7110 + i }) + line([[s[0] - 3, s[1] - 2], [s[0] + 3, s[1] + 2]], { w: 0.9, seed: 7120 + i, over: 0 })).join('');
	const wells = Object.values(CELLS).map((c, i) => jitter(resample(roundRect(c.x - 6, c.y - 6, c.x + c.w + 6, c.y + c.h + 6, 8), 7, true), 7130 + i, 0.8));
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.8, 7103, { cluster: 4, skip: 0.3 }),
		plate: pathOf(plate, true),
		plateHatch: hatch(plate, 0.55, 3, 7104, { cluster: 5, skip: 0.35, trim: 0.3 }),
		ink: outline(plate, { w: 2, heavy: 1.6, seed: 7105 }) + screwInk,
		wells: wells.map((well) => pathOf(well, true)),
		wellInk: wells.map((well, i) => outline(well, { w: 1, seed: 7140 + i })),
	};
}

/** The whole figure, frozen into board.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		frame: frameArt(),
		cells: CELLS,
		flaps: { city: flapArt(CELLS.city.w, CELLS.city.h, 7200), temp: flapArt(CELLS.temp.w, CELLS.temp.h, 7250) },
	};
}
