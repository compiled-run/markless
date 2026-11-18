// A glass thermometer with its °C scale, a paper tag for the °F reading, and a sign hanging from a hook.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';
import { mercuryTop, RANGE, TUBE } from './thermometer-model.ts';

export const WIDTH = 680;
export const HEIGHT = 300;
const CX = 130;
const BULB = { cx: CX, cy: 258, r: 26 };

function thermometerArt() {
	const tube = jitter(resample(roundRect(CX - 15, TUBE.top - 22, CX + 15, BULB.cy - 10, 15), 5, true), 8101, 0.6);
	const bulb = jitter(resample(ellipse(BULB.cx, BULB.cy, BULB.r, BULB.r, 30), 5, true), 8102, 0.6);
	const tubeShadow = tube.map(([x, y]) => [x + 8, y + 9] as P);
	const bulbShadow = bulb.map(([x, y]) => [x + 8, y + 9] as P);
	const ticks: string[] = [];
	const labels: { y: number; text: string }[] = [];
	for (let c = RANGE.min; c <= RANGE.max; c += 5) {
		const y = mercuryTop(c);
		const long = c % 10 === 0;
		ticks.push(line([[CX - 22 - (long ? 12 : 6), y], [CX - 22, y]], { w: 1.2, seed: 8110 + c + 20, over: 0 }));
		if (long) labels.push({ y: y + 6, text: String(c) });
	}
	return {
		shadow: pathOf(tubeShadow, true) + pathOf(bulbShadow, true),
		shadowHatch: hatch(tubeShadow, -0.4, 2.6, 8104, { cluster: 4, skip: 0.3 }) + hatch(bulbShadow, -0.4, 2.6, 8108, { cluster: 4, skip: 0.3 }),
		glass: pathOf(tube, true) + pathOf(bulb, true),
		ink: outline(tube, { w: 1.6, heavy: 1.2, seed: 8105 }) + outline(bulb, { w: 1.6, heavy: 1.2, seed: 8106 }),
		gleam: line([[CX - 7, TUBE.top - 8], [CX - 7, TUBE.bottom - 20]], { w: 1.2, seed: 8107, over: 0 }),
		bulbFill: pathOf(ellipse(BULB.cx, BULB.cy, BULB.r - 6, BULB.r - 6, 24), true),
		ticks: ticks.join(''),
		labels,
		labelX: CX - 40,
		columnX: CX - 6,
		columnW: 12,
		columnBottom: BULB.cy - 10,
	};
}

function tagArt() {
	const card = jitter(resample(roundRect(240, 98, 420, 188, 8), 6, true), 8201, 1);
	const shadow = jitter(resample(roundRect(249, 108, 429, 198, 8), 8, true), 8202, 1.1);
	const hole = ellipse(260, 143, 6, 6, 14);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 8203, { cluster: 4, skip: 0.3 }),
		card: pathOf(card, true),
		edge: wash(card, 8204, 1, 2),
		ink: outline(card, { w: 1.6, heavy: 1.2, seed: 8205 }) + outline(hole, { w: 1, seed: 8206 }),
		string: line([[160, 150], [200, 158], [254, 143]], { w: 1.1, seed: 8207, over: 0 }),
		textX: 340,
		textY: 158,
	};
}

function signArt() {
	const board = jitter(resample(roundRect(460, 116, 660, 206, 6), 6, true), 8301, 1.2);
	const shadow = jitter(resample(roundRect(469, 126, 669, 216, 6), 8, true), 8302, 1.2);
	const hook = line([[548, 30], [560, 22], [572, 30], [572, 46], [560, 54]], { w: 2.4, seed: 8303, over: 0 });
	const nail = outline(ellipse(560, 22, 5, 5, 12), { w: 1.2, seed: 8304 });
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 8305, { cluster: 4, skip: 0.3 }),
		board: pathOf(board, true),
		grain: hatch(board, 0.05, 7, 8306, { cluster: 2, skip: 0.6, trim: 0.7 }),
		ink: outline(board, { w: 1.8, heavy: 1.4, seed: 8307 }),
		strings: line([[480, 120], [560, 50], [640, 120]], { w: 1.2, seed: 8308, over: 0 }),
		hook: hook + nail,
		pivotX: 560,
		pivotY: 50,
		textX: 560,
		textY: 172,
	};
}

/** The whole figure, frozen into thermometer.art.ts. */
export function drawing() {
	return { width: WIDTH, height: HEIGHT, thermometer: thermometerArt(), tag: tagArt(), sign: signArt() };
}
