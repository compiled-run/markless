// A sheet, a sticky note on it, and a waste bin: close the note and it goes in the bin; open again and a fresh blank note is built.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 300;

export const SHEET = { x: 30, y: 24, w: 400, h: 250 };
export const NOTE = { x: 120, y: 70, w: 190, h: 150 };
export const BIN = { x: 500, y: 100, w: 130, h: 170 };

function sheetArt() {
	const { x, y, w, h } = SHEET;
	const shape = jitter(resample(roundRect(x, y, x + w, y + h, 4), 8, true), 9301, 1.1);
	const shadow = jitter(resample(roundRect(x + 8, y + 10, x + w + 8, y + h + 10, 4), 10, true), 9302, 1.2);
	const rules = [0.62, 0.74, 0.86].map((t, i) => line([[x + 24, y + h * t], [x + w - 24, y + h * t + 1]], { w: 0.5, seed: 9310 + i, over: 0.3 })).join('');
	return { shadow: pathOf(shadow, true), paper: pathOf(shape, true), ink: outline(shape, { w: 1.8, heavy: 1.4, seed: 9303 }) + rules };
}

function noteArt() {
	const { x, y, w, h } = NOTE;
	const shape: P[] = jitter(resample([[x, y], [x + w, y + 2], [x + w - 2, y + h - 26], [x + w - 28, y + h], [x + 2, y + h - 1]], 6, true), 9401, 0.9);
	const curl: P[] = [[x + w - 2, y + h - 26], [x + w - 22, y + h - 20], [x + w - 28, y + h]];
	const close = ellipse(x + w - 16, y + 16, 9, 9, 16);
	return {
		paper: pathOf(shape, true),
		wash: wash(shape, 9402, 2, 3),
		ink: outline(shape, { w: 1.5, heavy: 1.1, seed: 9403 }) + outline(curl, { w: 0.9, seed: 9404 }, false),
		curl: hatch(curl, 0.8, 2, 9405, { cluster: 2 }),
		close: outline(close, { w: 1, seed: 9406 }) + line([[x + w - 21, y + 11], [x + w - 11, y + 21]], { w: 1.1, seed: 9407, over: 0 }) + line([[x + w - 11, y + 11], [x + w - 21, y + 21]], { w: 1.1, seed: 9408, over: 0 }),
		closeX: x + w - 16,
		closeY: y + 16,
		textX: x + 16,
		textY: y + 70,
	};
}

function binArt() {
	const { x, y, w, h } = BIN;
	const rim = ellipse(x + w / 2, y, w / 2, 14, 32);
	const body: P[] = [[x, y], [x + 14, y + h], [x + w - 14, y + h], [x + w, y]];
	const slats = [0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88].map((t, i) => line([[x + w * t, y + 12], [x + 14 + (w - 28) * t, y + h - 4]], { w: 0.55, seed: 9510 + i, over: 0.2 })).join('');
	const bands = [0.18, 0.92].map((t, i) => line(resample([[x + 14 * t, y + h * t], [x + w / 2, y + h * t + 10], [x + w - 14 * t, y + h * t]], 4), { w: 1.1, seed: 9550 + i, over: 0.3 })).join('');
	const inside = ellipse(x + w / 2, y + 2, w / 2 - 8, 9, 28);
	const shadow = jitter(resample(ellipse(x + w / 2 + 18, y + h + 4, w / 2 + 10, 12, 28), 6, true), 9560, 1);
	const shadeSide: P[] = [[x + w * 0.62, y + 8], [x + w, y], [x + w - 14, y + h], [x + w * 0.58, y + h]];
	const ball = (cx: number, cy: number, seed: number) => {
		const b = jitter(resample(ellipse(cx, cy, 24, 19, 16), 3, true), seed, 3);
		const creases = [[[cx - 14, cy - 4], [cx - 2, cy + 6], [cx + 12, cy - 3]], [[cx - 6, cy - 14], [cx + 2, cy - 2], [cx + 14, cy + 10]], [[cx - 16, cy + 8], [cx - 4, cy + 12]]] as P[][];
		return {
			paper: pathOf(b, true),
			ink: outline(b, { w: 1.2, heavy: 0.9, seed: seed + 1 }) + creases.map((c, i) => line(c, { w: 0.55, seed: seed + 2 + i, over: 0 })).join(''),
			shade: hatch(b.filter(([px, py]) => px + py > cx + cy), 0.9, 1.6, seed + 6, { cluster: 2 }),
		};
	};
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 9561, { cluster: 4, skip: 0.3 }),
		body: pathOf(body, true),
		shade: hatch(shadeSide, 1.25, 1.8, 9501, { cluster: 3, skip: 0.15 }) + hatch(shadeSide, -0.3, 2.8, 9505, { cluster: 2, skip: 0.4 }),
		inside: pathOf(inside, true),
		insideHatch: hatch(inside, 0.2, 1.3, 9506, { cluster: 4 }) + hatch(inside, -0.9, 1.8, 9507, { cluster: 3 }),
		ink: outline(body, { w: 1.7, heavy: 1.3, seed: 9502 }, true) + outline(rim, { w: 1.6, heavy: 1.1, seed: 9503 }) + slats + bands,
		mouth: pathOf(rim, true),
		balls: [ball(x + 46, y - 6, 9520), ball(x + 86, y - 10, 9530), ball(x + 64, y - 26, 9540)],
	};
}

/** The whole figure, frozen into note.art.ts. */
export function drawing() {
	return { width: WIDTH, height: HEIGHT, sheet: sheetArt(), note: noteArt(), bin: binArt() };
}
