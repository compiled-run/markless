// An ID card on the desk wired to a small page: a name field and an age field, each with its own wire to the spot that shows it, and a birthday candle.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 330;
export const CARD = { x: 24, y: 50, w: 280, h: 180 };
export const FIELDS = {
	name: { x: 150, y: 86, w: 136, h: 40 },
	age: { x: 150, y: 146, w: 136, h: 40 },
} as const;
export const SHEET = { x: 440, y: 34, w: 216, h: 250 };
export const SPOTS = { name: { x: 466, y: 110 }, age: { x: 466, y: 178 } } as const;

function bezierPoints(a: P, b: P, c: P, d: P, steps = 36): P[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		const u = 1 - t;
		return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]] as P;
	});
}

function wireArt(from: P, to: P, sag: number, seed: number) {
	const pts = bezierPoints(from, [from[0] + 60, from[1] + sag], [to[0] - 60, to[1] + sag], to);
	return {
		ink: line(pts, { w: 1.8, heavy: 1.2, seed, over: 0 }),
		path: pathOf(pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as P)),
		plugs: outline(ellipse(from[0], from[1], 4, 4, 12), { w: 1.2, seed: seed + 1 }) + outline(ellipse(to[0], to[1], 4, 4, 12), { w: 1.2, seed: seed + 2 }),
	};
}

function cardArt() {
	const { x, y, w, h } = CARD;
	const card = jitter(resample(roundRect(x, y, x + w, y + h, 12), 6, true), 6101, 1);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 12), 8, true), 6102, 1.1);
	const photo = jitter(resample(roundRect(x + 18, y + 36, x + 108, y + 136, 6), 5, true), 6103, 0.8);
	const head = ellipse(x + 63, y + 72, 18, 21, 24);
	const shoulders: P[] = [[x + 26, y + 136], [x + 34, y + 110], [x + 63, y + 98], [x + 92, y + 110], [x + 100, y + 136]];
	const band = jitter(resample(roundRect(x, y, x + w, y + 26, 12), 6, true), 6104, 0.6).map(([px, py]) => [px, Math.min(py, y + 26)] as P);
	const fields = Object.values(FIELDS).map((f, i) => jitter(resample(roundRect(f.x, f.y, f.x + f.w, f.y + f.h, 5), 5, true), 6110 + i, 0.7));
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 6105, { cluster: 4, skip: 0.3 }),
		card: pathOf(card, true),
		band: pathOf(band, true),
		photo: pathOf(photo, true),
		photoHatch: hatch(photo, 0.6, 4, 6106, { cluster: 2, skip: 0.4 }),
		ink: outline(card, { w: 1.8, heavy: 1.4, seed: 6107 }) + outline(photo, { w: 1.1, seed: 6108 }) + outline(head, { w: 1.2, seed: 6109 }) + line(shoulders, { w: 1.2, seed: 6120, over: 0 }),
		fields: fields.map((f) => pathOf(f, true)),
		fieldInk: fields.map((f, i) => outline(f, { w: 1, seed: 6130 + i })),
		titleX: x + w / 2,
		titleY: y + 19,
	};
}

function candleArt() {
	const stick = jitter(resample(roundRect(150, 262, 166, 310, 3), 4, true), 6201, 0.5);
	const stripes = [0, 1, 2].map((i) => line([[150, 272 + i * 14], [166, 264 + i * 14]], { w: 1, seed: 6210 + i, over: 0 })).join('');
	const flame: P[] = [[158, 230], [166, 246], [163, 256], [158, 259], [153, 256], [150, 246]];
	return {
		stick: pathOf(stick, true),
		ink: outline(stick, { w: 1.3, seed: 6202 }) + stripes + line([[158, 262], [158, 256]], { w: 1.2, seed: 6203, over: 0 }),
		flame: pathOf(jitter(resample(flame, 3, true), 6204, 0.5), true),
		flameInk: outline(jitter(resample(flame, 3, true), 6204, 0.5), { w: 1, seed: 6205 }),
	};
}

function sheetArt() {
	const { x, y, w, h } = SHEET;
	const sheet = jitter(resample(roundRect(x, y, x + w, y + h, 4), 6, true), 6301, 1);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 4), 8, true), 6302, 1.1);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 6303, { cluster: 4, skip: 0.3 }),
		sheet: pathOf(sheet, true),
		edge: wash(sheet, 6304, 1, 2),
		ink: outline(sheet, { w: 1.6, heavy: 1.2, seed: 6305 }) + line([[x + 22, y + 214], [x + w - 30, y + 215]], { w: 1, seed: 6306, over: 0 }) + line([[x + 22, y + 230], [x + w - 70, y + 231]], { w: 1, seed: 6307, over: 0 }),
	};
}

/** The whole figure, frozen into idcard.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		card: cardArt(),
		candle: candleArt(),
		sheet: sheetArt(),
		wires: {
			name: wireArt([FIELDS.name.x + FIELDS.name.w, FIELDS.name.y + FIELDS.name.h / 2], [SPOTS.name.x - 12, SPOTS.name.y - 9], 30, 6401),
			age: wireArt([FIELDS.age.x + FIELDS.age.w, FIELDS.age.y + FIELDS.age.h / 2], [SPOTS.age.x - 12, SPOTS.age.y - 9], 40, 6411),
		},
		fields: FIELDS,
		spots: SPOTS,
	};
}
