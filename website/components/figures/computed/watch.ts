// A sports watch lying on the desk: strap out to both sides, a chunky case, and a screen with three readouts (km, min, pace).
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 300;
export const CASE = { x: 180, y: 28, w: 320, h: 244 };
export const SCREEN = { x: 214, y: 62, w: 252, h: 176 };
export const ROWS = {
	km: { y: 104, top: 70 },
	minutes: { y: 150, top: 118 },
	pace: { y: 214, top: 172 },
} as const;
export const RULE_Y = 168;

function strapArt(x0: number, x1: number, seed: number, holes: boolean) {
	const band = jitter(resample(roundRect(x0, 96, x1, 204, 16), 7, true), seed, 1.2);
	const shadow = band.map(([x, y]) => [x + 8, y + 10] as P);
	const stitch = holes
		? [0, 1, 2, 3].map((i) => outline(ellipse(x0 + 34 + i * 30, 150, 6, 5, 12), { w: 1, seed: seed + 10 + i })).join('')
		: outline(jitter(resample(roundRect(x1 - 70, 84, x1 - 40, 216, 6), 6, true), seed + 20, 0.8), { w: 1.6, heavy: 1.2, seed: seed + 21 });
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.8, seed + 2, { cluster: 4, skip: 0.3 }),
		band: pathOf(band, true),
		grain: hatch(band, 0, 6, seed + 3, { cluster: 2, skip: 0.6, trim: 0.7 }),
		ink: outline(band, { w: 1.7, heavy: 1.3, seed: seed + 4 }) + stitch,
	};
}

function caseArt() {
	const { x, y, w, h } = CASE;
	const body = jitter(resample(roundRect(x, y, x + w, y + h, 52), 6, true), 7101, 1.2);
	const shadow = jitter(resample(roundRect(x + 10, y + 12, x + w + 10, y + h + 12, 52), 8, true), 7102, 1.3);
	const bezel = jitter(resample(roundRect(x + 16, y + 16, x + w - 16, y + h - 16, 40), 6, true), 7103, 1);
	const s = SCREEN;
	const screen = jitter(resample(roundRect(s.x, s.y, s.x + s.w, s.y + s.h, 20), 5, true), 7104, 0.8);
	const buttons = [CASE.x + 70, CASE.x + w - 70].map((bx, i) =>
		outline(jitter(resample(roundRect(bx - 16, y - 12, bx + 16, y + 2, 4), 4, true), 7110 + i, 0.6), { w: 1.4, seed: 7120 + i }),
	);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 7105, { cluster: 4, skip: 0.3 }),
		body: pathOf(body, true),
		shade: hatch(body.filter(([px, py]) => px + py > x + w + y + 20), 0.9, 2.6, 7106, { cluster: 3, skip: 0.25 }),
		bezel: pathOf(bezel, true),
		screen: pathOf(screen, true),
		screenEdge: wash(screen, 7107, 1, 2),
		ink: outline(body, { w: 2, heavy: 1.6, seed: 7108 }) + outline(bezel, { w: 1.2, seed: 7109 }) + outline(screen, { w: 1.4, seed: 7111 }) + buttons.join(''),
		rule: line([[s.x + 18, RULE_Y], [s.x + s.w - 18, RULE_Y + 1]], { w: 1.4, seed: 7130, over: 0.2 }),
	};
}

/** The whole figure, frozen into watch.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		straps: [strapArt(22, 210, 7001, true), strapArt(470, 658, 7051, false)],
		case: caseArt(),
		labelX: SCREEN.x + 28,
		valueX: SCREEN.x + SCREEN.w - 26,
		rows: ROWS,
	};
}
