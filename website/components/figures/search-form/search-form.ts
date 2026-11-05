// Brief (checklist passed). Belief: a handle is a name for the real input; a handler uses it to reach that element.
// Objects: the search input (the element), the Focus search button (the handler), the pencilled field line between them (the handle).
// Action: press the button. Change: the cursor blinks in the input and it gets its focus ring. Unchanged: the button and the line.
// Prevents: "a handle is a copy of the element" and "the element is always there". Surprise: take the input off the page and press again: the line dangles to undefined, nothing is focused.
import { roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, r1, resample, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 320;

/** The drawn boxes in drawing units, shared with the markup that lays the real controls over them. */
export const CARD = { x0: 70, y0: 46, x1: 610, y1: 282 };
export const INPUT = { x0: 118, y0: 146, x1: 392, y1: 198 };
export const BUTTON = { x0: 414, y0: 146, x1: 576, y1: 198 };
export const TOGGLE = { x: 118, y: 236, r: 11 };

const box = (r: { x0: number; y0: number; x1: number; y1: number }, k: number) => roundRect(r.x0, r.y0, r.x1, r.y1, k);
const pct = (v: number, of: number) => r1((v / of) * 1000) / 10;

/** The paper card the form is drawn on, with its cast shadow on the desk. */
function cardArt() {
	const c = box(CARD, 10);
	const shadow = roundRect(CARD.x0 + 10, CARD.y0 + 12, CARD.x1 + 12, CARD.y1 + 12, 12);
	return {
		shadow: hatch(shadow, -0.7, 2.8, 610, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(c, true),
		ink: outline(c, { w: 2, heavy: 1.5, seed: 611 }),
		rule: line(resample([[CARD.x0 + 40, 104], [CARD.x0 + 180, 104]], 6), { w: 0.9, seed: 612, over: 0.3 }),
	};
}

/** The text input: an inked field box with a magnifier, its focus ring, and the ghost of where it stood once it's gone. */
function inputArt() {
	const b = box(INPUT, 8);
	const ring = roundRect(INPUT.x0 - 6, INPUT.y0 - 6, INPUT.x1 + 6, INPUT.y1 + 6, 12);
	const lens: P[] = Array.from({ length: 20 }, (_, i) => {
		const a = (i / 19) * Math.PI * 2;
		return [INPUT.x1 - 30 + Math.cos(a) * 9, INPUT.y0 + 22 + Math.sin(a) * 9];
	});
	return {
		paper: pathOf(b, true),
		ink: outline(b, { w: 1.6, heavy: 1.1, seed: 620 }),
		inset: hatch([[INPUT.x0 + 2, INPUT.y0 + 2], [INPUT.x1 - 2, INPUT.y0 + 2], [INPUT.x1 - 2, INPUT.y0 + 8], [INPUT.x0 + 2, INPUT.y0 + 8]], 0.05, 2.2, 621, { cluster: 3, trim: 0.3 }),
		lens: outline(lens, { w: 1.2, seed: 622 }) + stroke([[INPUT.x1 - 23, INPUT.y0 + 29], [INPUT.x1 - 15, INPUT.y0 + 37]], { w: 1.6, seed: 623, over: 0 }),
		ring: outline(ring, { w: 1.4, seed: 624 }),
		ringWash: wash(ring, 625, 1.6, 3),
		ghost: pathOf(b, true),
	};
}

/** The button: a raised tab with a hatched side so it stands off the card and can sink. */
function buttonArt() {
	const face = box(BUTTON, 9);
	const side = roundRect(BUTTON.x0 + 3, BUTTON.y0 + 5, BUTTON.x1 + 3, BUTTON.y1 + 5, 9);
	return {
		side: pathOf(side, true),
		sideHatch: hatch(side, 1.2, 1.8, 630, { cluster: 3, trim: 0.2 }),
		paper: pathOf(face, true),
		wash: wash(face, 631, 1.2, 2.5),
		ink: outline(face, { w: 1.6, heavy: 1.2, seed: 632 }),
	};
}

/** A soft dotted pencil path through points, as dash marks. */
function dotted(points: P[], seed: number) {
	const pts = resample(points, 9);
	let d = '';
	for (let i = 0; i + 1 < pts.length; i += 2) d += stroke([pts[i]!, pts[i + 1]!], { w: 1.4, seed: seed + i, over: 0 });
	return d;
}

/** The pencilled handle: from the button's handler up and over to the input, or, once the input is gone, curling off into the air. */
function lineArt() {
	const from: P = [(BUTTON.x0 + BUTTON.x1) / 2, BUTTON.y0 - 6];
	const bend = (a: P, b: P, c: P, n: number): P[] => Array.from({ length: n + 1 }, (_, i) => {
		const t = i / n;
		return [(1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * b[1] + t * t * c[1]];
	});
	const to: P = [290, INPUT.y0 - 6];
	const whole = bend(from, [390, 52], to, 30);
	const tip = whole.at(-1)!;
	const before = whole.at(-4)!;
	const ang = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
	const head = (s: number): P[] => [[tip[0] - Math.cos(ang + s) * 10, tip[1] - Math.sin(ang + s) * 10], tip];
	const loose = bend(from, [430, 60], [360, 92], 18);
	const curl: P[] = Array.from({ length: 9 }, (_, i) => {
		const a = Math.PI * 0.2 + (i / 8) * Math.PI * 1.4;
		return [352 + Math.cos(a) * 9, 96 + Math.sin(a) * 7];
	});
	return {
		whole: dotted(whole, 640) + stroke(head(0.5), { w: 1.4, seed: 641, over: 0 }) + stroke(head(-0.5), { w: 1.4, seed: 642, over: 0 }),
		loose: dotted(loose, 660) + stroke(curl, { w: 1.1, seed: 661, over: 0 }),
		label: { x: 392, y: 88 },
		looseLabel: { x: 488, y: 102 },
		gone: { x: 338, y: 101 },
	};
}

/** The small switch that takes the input off the page and puts it back. */
function toggleArt() {
	const t = TOGGLE;
	const track = roundRect(t.x - 4, t.y - t.r, t.x + 40, t.y + t.r, t.r);
	const knob: P[] = Array.from({ length: 18 }, (_, i) => {
		const a = (i / 18) * Math.PI * 2;
		return [t.x + 7 + Math.cos(a) * (t.r - 3), t.y + Math.sin(a) * (t.r - 3)];
	});
	return {
		track: pathOf(track, true),
		trackInk: outline(track, { w: 1.2, seed: 670 }),
		knob: pathOf(knob, true),
		knobInk: outline(knob, { w: 1.1, seed: 671 }),
		slide: 26,
	};
}

/** Where each real control sits over the drawing, as percentages of the figure box. */
function overlay() {
	const place = (r: { x0: number; y0: number; x1: number; y1: number }) =>
		`left:${pct(r.x0, WIDTH)}%;top:${pct(r.y0, HEIGHT)}%;width:${pct(r.x1 - r.x0, WIDTH)}%;height:${pct(r.y1 - r.y0, HEIGHT)}%`;
	return {
		input: place(INPUT),
		button: place(BUTTON),
		toggle: place({ x0: TOGGLE.x - 8, y0: TOGGLE.y - 16, x1: TOGGLE.x + 46, y1: TOGGLE.y + 16 }),
	};
}

/** The whole figure, frozen into search-form.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		card: cardArt(),
		input: inputArt(),
		button: buttonArt(),
		line: lineArt(),
		toggle: toggleArt(),
		overlay: overlay(),
		buttonText: { x: (BUTTON.x0 + BUTTON.x1) / 2, y: (BUTTON.y0 + BUTTON.y1) / 2 + 6 },
	};
}
