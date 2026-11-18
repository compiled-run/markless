// A cassette J-card track list wired line by line to a page, with a pen to add a track and an eraser to take the last one off.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';
import { ROW_H, SLOTS } from './jcard-model.ts';

export const WIDTH = 680;
export const HEIGHT = 340;
const TOP = 82;
const CARD = { x: 24, y: 24, w: 290, h: 250 };
const SHEET = { x: 438, y: 24, w: 220, h: 250 };

function bezierPoints(a: P, b: P, c: P, d: P, steps = 30): P[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		const u = 1 - t;
		return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]] as P;
	});
}

function cardArt() {
	const { x, y, w, h } = CARD;
	const card = jitter(resample(roundRect(x, y, x + w, y + h, 4), 6, true), 5101, 1);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 4), 8, true), 5102, 1.1);
	const spine: P[] = [[x + 34, y + 2], [x + 34, y + h - 2]];
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 5103, { cluster: 4, skip: 0.3 }),
		card: pathOf(card, true),
		spineFill: pathOf(jitter(resample(roundRect(x, y, x + 34, y + h, 4), 6, true), 5104, 0.6), true),
		ink: outline(card, { w: 1.7, heavy: 1.3, seed: 5105 }) + line(spine, { w: 1.2, seed: 5106, over: 0 }),
		rules: Array.from({ length: SLOTS }, (_, i) => line([[x + 50, TOP + i * ROW_H + 8], [x + w - 16, TOP + i * ROW_H + 9]], { w: 0.8, seed: 5110 + i, over: 0 })).join(''),
		spineX: x + 22,
		spineY: y + h / 2,
		titleX: x + 50,
		titleY: y + 32,
	};
}

function sheetArt() {
	const { x, y, w, h } = SHEET;
	const sheet = jitter(resample(roundRect(x, y, x + w, y + h, 4), 6, true), 5201, 1);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 4), 8, true), 5202, 1.1);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 5203, { cluster: 4, skip: 0.3 }),
		sheet: pathOf(sheet, true),
		ink: outline(sheet, { w: 1.6, heavy: 1.2, seed: 5204 }),
		titleX: x + 20,
		titleY: y + 32,
	};
}

function wireArt(i: number) {
	const y = TOP + i * ROW_H - 6;
	const from: P = [CARD.x + CARD.w - 6, y];
	const to: P = [SHEET.x + 14, y];
	const pts = bezierPoints(from, [from[0] + 50, y + 18], [to[0] - 50, y + 18], to);
	return {
		ink: line(pts, { w: 1.5, heavy: 1, seed: 5300 + i * 3, over: 0 }) + outline(ellipse(from[0], from[1], 3.5, 3.5, 10), { w: 1, seed: 5301 + i * 3 }) + outline(ellipse(to[0], to[1], 3.5, 3.5, 10), { w: 1, seed: 5302 + i * 3 }),
		path: pathOf(pts.map(([px, py]) => [Math.round(px * 10) / 10, Math.round(py * 10) / 10] as P)),
	};
}

function penArt() {
	const body: P[] = [[96, 318], [176, 290], [182, 302], [102, 330]];
	const tip: P[] = [[96, 318], [84, 328], [102, 330]];
	return {
		body: pathOf(jitter(resample(body, 4, true), 5401, 0.5), true),
		ink: outline(jitter(resample(body, 4, true), 5401, 0.5), { w: 1.3, seed: 5402 }) + outline(tip, { w: 1.1, seed: 5403 }),
	};
}

function eraserArt() {
	const block = jitter(resample(roundRect(252, 296, 310, 326, 5), 4, true), 5501, 0.6);
	return {
		block: pathOf(block, true),
		ink: outline(block, { w: 1.3, seed: 5502 }) + line([[270, 297], [266, 325]], { w: 1, seed: 5503, over: 0 }),
	};
}

/** The whole figure, frozen into jcard.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		card: cardArt(),
		sheet: sheetArt(),
		wires: Array.from({ length: SLOTS }, (_, i) => wireArt(i)),
		rows: Array.from({ length: SLOTS }, (_, i) => ({ y: TOP + i * ROW_H, cardX: CARD.x + 50, pageX: SHEET.x + 24 })),
		pen: penArt(),
		eraser: eraserArt(),
	};
}
