// A video player in ink: the screen with its scene, a play button and a timeline knob along the bottom, one status card for each case, and a note field under the frame.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, resample, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 330;
/** The screen alone, for a figure without the note field. */
export const SCREEN_HEIGHT = 268;

export const SCREEN = { x: 70, y: 16, w: 540, h: 234 };
export const BAR = { y: 222, x0: 150, x1: 582 };
export const BUTTON = { x: 108, y: 222, r: 17 };
export const KNOB_R = 9;
export const CARD = { x: 262, y: 90, w: 156, h: 56 };
export const FIELD = { x: 70, y: 270, w: 540, h: 44 };

function screenArt() {
	const { x, y, w, h } = SCREEN;
	const frame = jitter(resample(roundRect(x, y, x + w, y + h, 10), 9, true), 7101, 1);
	const shadow = jitter(resample(roundRect(x + 8, y + 10, x + w + 8, y + h + 10, 10), 10, true), 7102, 1.2);
	const horizonY = y + 150;
	const horizon = line([[x + 16, horizonY], [x + w - 16, horizonY + 1]], { w: 0.8, seed: 7110, over: 0.4 });
	const hillA: P[] = resample([[x + 16, horizonY], [x + 80, horizonY - 26], [x + 160, horizonY - 48], [x + 250, horizonY - 30], [x + 320, horizonY]], 8);
	const hillB: P[] = resample([[x + 230, horizonY], [x + 330, horizonY - 24], [x + 420, horizonY - 38], [x + 500, horizonY - 14], [x + w - 16, horizonY]], 8);
	const sun = ellipse(x + 430, y + 62, 26, 26, 28);
	const rays = Array.from({ length: 7 }, (_, i) => {
		const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.9;
		const from: P = [x + 430 + Math.cos(a) * 34, y + 62 + Math.sin(a) * 34];
		const to: P = [x + 430 + Math.cos(a) * 46, y + 62 + Math.sin(a) * 46];
		return line([from, to], { w: 0.9, seed: 7120 + i, over: 0.2 });
	}).join('');
	const groundShade: P[] = [[x + 16, horizonY + 2], [x + 200, horizonY + 2], [x + 150, y + h - 40], [x + 16, y + h - 40]];
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.8, 7103, { cluster: 4, skip: 0.3 }),
		paper: pathOf(frame, true),
		ink: outline(frame, { w: 2, heavy: 1.5, seed: 7104 }),
		scene:
			horizon +
			outline(hillA, { w: 1, seed: 7111 }, false) +
			outline(hillB, { w: 1, seed: 7112 }, false) +
			outline(sun, { w: 1.1, seed: 7113 }) +
			rays,
		sceneHatch: hatch(groundShade, 1.15, 3.4, 7114, { cluster: 3, skip: 0.4 }) + hatch(hillB, 0.9, 3, 7115, { cluster: 2, skip: 0.5 }),
	};
}

function barArt() {
	const { y, x0, x1 } = BAR;
	const b = BUTTON;
	const face = jitter(ellipse(b.x, b.y, b.r, b.r, 30), 7201, 0.6);
	const play: P[] = [[b.x - 5, b.y - 8], [b.x - 5, b.y + 8], [b.x + 9, b.y]];
	const pauseL = roundRect(b.x - 7, b.y - 8, b.x - 2, b.y + 8, 1, 2);
	const pauseR = roundRect(b.x + 2, b.y - 8, b.x + 7, b.y + 8, 1, 2);
	const knob = jitter(ellipse(x0, y, KNOB_R, KNOB_R, 24), 7210, 0.5);
	const played: P[] = [[x0, y - 3], [x0 + 1, y - 3], [x0 + 1, y + 3], [x0, y + 3]];
	return {
		track: line([[x0, y], [x1, y + 1]], { w: 1.6, heavy: 0.8, seed: 7202, over: 0.5 }),
		ticks: [0.25, 0.5, 0.75].map((t, i) => line([[x0 + (x1 - x0) * t, y - 5], [x0 + (x1 - x0) * t, y + 5]], { w: 0.7, seed: 7220 + i, over: 0.2 })).join(''),
		button: {
			face: pathOf(face, true),
			ink: outline(face, { w: 1.6, heavy: 1.1, seed: 7203 }),
			play: pathOf(play, true) + outline(play, { w: 1, seed: 7204 }),
			pause: pathOf(pauseL, true) + pathOf(pauseR, true) + outline(pauseL, { w: 0.9, seed: 7205 }) + outline(pauseR, { w: 0.9, seed: 7206 }),
			wash: wash(ellipse(b.x, b.y, b.r + 2, b.r + 2, 24), 7207, 2, 3),
		},
		knob: { face: pathOf(knob, true), ink: outline(knob, { w: 1.4, heavy: 1, seed: 7211 }), shade: hatch(knob.filter(([px, py]) => px + py > x0 + y), 0.9, 1.5, 7212, { cluster: 2 }) },
		played: pathOf(played, true),
		length: x1 - x0,
	};
}

/** One status card: the glyph on the left and room for the word on the right. */
function cardArt(glyph: 'loading' | 'playing' | 'paused' | 'ended', seed: number) {
	const { x, y, w, h } = CARD;
	const shape = jitter(resample(roundRect(x, y, x + w, y + h, 8), 7, true), seed, 0.9);
	const gx = x + 30;
	const gy = y + h / 2;
	let mark = '';
	if (glyph === 'playing') {
		const tri: P[] = [[gx - 8, gy - 11], [gx - 8, gy + 11], [gx + 12, gy]];
		mark = pathOf(tri, true) + outline(tri, { w: 1, seed: seed + 1 });
	} else if (glyph === 'paused') {
		const l = roundRect(gx - 10, gy - 11, gx - 3, gy + 11, 1, 2);
		const r = roundRect(gx + 3, gy - 11, gx + 10, gy + 11, 1, 2);
		mark = pathOf(l, true) + pathOf(r, true) + outline(l, { w: 0.9, seed: seed + 1 }) + outline(r, { w: 0.9, seed: seed + 2 });
	} else if (glyph === 'ended') {
		const arc: P[] = Array.from({ length: 22 }, (_, i) => {
			const a = -Math.PI * 0.35 + (i / 21) * Math.PI * 1.6;
			return [gx + Math.cos(a) * 11, gy + Math.sin(a) * 11];
		});
		const tip = arc[0]!;
		const head: P[] = [[tip[0] - 7, tip[1] - 1], [tip[0], tip[1]], [tip[0] + 1, tip[1] - 8]];
		mark = line(arc, { w: 2.2, heavy: 0.4, seed: seed + 1, over: 0 }) + line(head, { w: 2, seed: seed + 2, over: 0 });
	} else {
		mark = Array.from({ length: 8 }, (_, i) => {
			const a0 = (i / 8) * Math.PI * 2;
			const a1 = a0 + Math.PI * 0.14;
			return line([[gx + Math.cos(a0) * 11, gy + Math.sin(a0) * 11], [gx + Math.cos(a1) * 11, gy + Math.sin(a1) * 11]], { w: 2.2 - i * 0.2, seed: seed + 3 + i, over: 0 });
		}).join('');
	}
	return {
		paper: pathOf(shape, true),
		wash: wash(shape, seed + 20, 2, 3),
		ink: outline(shape, { w: 1.4, heavy: 1, seed: seed + 21 }),
		mark,
		textX: x + 54,
		textY: y + h / 2 + 8,
	};
}

function fieldArt() {
	const { x, y, w, h } = FIELD;
	const shape = jitter(resample(roundRect(x, y, x + w, y + h, 6), 9, true), 7301, 0.9);
	const shadow = jitter(resample(roundRect(x + 4, y + 5, x + w + 4, y + h + 5, 6), 10, true), 7302, 1);
	const pen: P[] = [[x + w - 34, y + h - 12], [x + w - 14, y + 12]];
	return {
		shadow: pathOf(shadow, true),
		paper: pathOf(shape, true),
		wash: wash(shape, 7303, 2, 3),
		ink: outline(shape, { w: 1.5, heavy: 1.1, seed: 7304 }) + line(pen, { w: 2.4, heavy: 0.4, seed: 7305, over: 0 }) + line([[x + w - 36, y + h - 8], [x + w - 31, y + h - 14]], { w: 1.2, seed: 7306, over: 0 }),
		x,
		y,
		w,
		h,
	};
}

/** The whole figure, frozen into player.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		screenHeight: SCREEN_HEIGHT,
		screen: screenArt(),
		bar: barArt(),
		cards: { loading: cardArt('loading', 7400), playing: cardArt('playing', 7450), paused: cardArt('paused', 7500), ended: cardArt('ended', 7550) },
		field: fieldArt(),
	};
}
