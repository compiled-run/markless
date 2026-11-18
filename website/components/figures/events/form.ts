// A browser window holding a sign-up form, with its reload arrow, and a switch for event.preventDefault() beside it.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 320;
const WIN = { x: 24, y: 20, w: 470, h: 280 };
export const FIELD = { x: 52, y: 112, w: 270, h: 42 };
export const BUTTON = { x: 338, y: 112, w: 120, h: 42 };
export const SWITCH = { x: 540, y: 130, w: 110, h: 50 };
export const RELOAD = { cx: 98, cy: 44 };

function windowArt() {
	const { x, y, w, h } = WIN;
	const frame = jitter(resample(roundRect(x, y, x + w, y + h, 10), 6, true), 4101, 1);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 10), 8, true), 4102, 1.1);
	const bar = jitter(resample(roundRect(x, y, x + w, y + 46, 10), 6, true), 4103, 0.6).map(([px, py]) => [px, Math.min(py, y + 46)] as P);
	const address = jitter(resample(roundRect(x + 104, y + 12, x + w - 18, y + 36, 12), 5, true), 4104, 0.6);
	const dots = [0, 1, 2].map((i) => outline(ellipse(x + 18 + i * 14, y + 24, 4, 4, 10), { w: 1, seed: 4110 + i })).join('');
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.6, 4105, { cluster: 4, skip: 0.3 }),
		frame: pathOf(frame, true),
		bar: pathOf(bar, true),
		address: pathOf(address, true),
		ink: outline(frame, { w: 1.8, heavy: 1.4, seed: 4106 }) + line([[x + 2, y + 46], [x + w - 2, y + 47]], { w: 1.2, seed: 4107, over: 0 }) + outline(address, { w: 1, seed: 4108 }) + dots,
		addressX: x + 120,
		addressY: y + 30,
	};
}

function reloadArt() {
	const { cx, cy } = RELOAD;
	const arc: P[] = Array.from({ length: 22 }, (_, i) => {
		const a = -Math.PI * 0.35 + (i / 21) * Math.PI * 1.6;
		return [cx + Math.cos(a) * 10, cy + Math.sin(a) * 10] as P;
	});
	const end = arc[arc.length - 1]!;
	return {
		ink: line(arc, { w: 1.8, seed: 4201, over: 0 }) + line([[end[0] - 7, end[1] - 1], end, [end[0] + 1, end[1] - 8]], { w: 1.6, seed: 4202, over: 0 }),
		cx,
		cy,
	};
}

function formArt() {
	const field = jitter(resample(roundRect(FIELD.x, FIELD.y, FIELD.x + FIELD.w, FIELD.y + FIELD.h, 6), 5, true), 4301, 0.7);
	const button = jitter(resample(roundRect(BUTTON.x, BUTTON.y, BUTTON.x + BUTTON.w, BUTTON.y + BUTTON.h, 8), 5, true), 4302, 0.7);
	return {
		field: pathOf(field, true),
		fieldInk: outline(field, { w: 1.2, seed: 4303 }),
		button: pathOf(button, true),
		buttonInk: outline(button, { w: 1.5, heavy: 1.1, seed: 4304 }),
		buttonShade: hatch(button, 0.9, 3, 4305, { cluster: 2, skip: 0.4 }),
		listRule: line([[52, 196], [458, 197]], { w: 0.9, seed: 4306, over: 0 }),
	};
}

function switchArt() {
	const { x, y, w, h } = SWITCH;
	const track = jitter(resample(roundRect(x, y, x + w, y + h, h / 2), 5, true), 4401, 0.7);
	return {
		track: pathOf(track, true),
		ink: outline(track, { w: 1.6, heavy: 1.2, seed: 4402 }),
		knob: pathOf(ellipse(0, 0, h / 2 - 7, h / 2 - 7, 24), true),
		knobInk: outline(ellipse(0, 0, h / 2 - 7, h / 2 - 7, 24), { w: 1.3, seed: 4403 }),
		offX: x + h / 2,
		onX: x + w - h / 2,
		cy: y + h / 2,
		labelX: x + w / 2,
	};
}

/** The whole figure, frozen into form.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		window: windowArt(),
		reload: reloadArt(),
		form: formArt(),
		toggle: switchArt(),
		edge: wash(jitter(resample(roundRect(WIN.x, WIN.y + 46, WIN.x + WIN.w, WIN.y + WIN.h, 10), 6, true), 4501, 0.5), 4502, 1, 2),
		field: FIELD,
		button: BUTTON,
		switchBox: SWITCH,
	};
}
