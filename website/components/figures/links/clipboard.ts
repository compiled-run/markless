// Brief (checklist passed). Belief: a click keeps the page; only the middle and its address change.
// Objects: the board with its clip (the page that stays), the sheet (the swapped middle), the label on the clip (the address).
// Action: swap the sheet (press, drag it away, or arrow keys). Change: a new sheet under the clip, and the label re-inks. Unchanged: the clip.
// Prevents: "a click throws the page away and loads a new one". Surprise: pull the clip and it snaps back shut.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

const BOARD = { x0: 214, y0: 46, x1: 466, y1: 360 };
const SHEET = { x0: 234, y0: 74, x1: 446, y1: 340 };
const CLIP = { x0: 284, y0: 30, x1: 396, y1: 78 };
const LABEL = { x0: 300, y0: 48, x1: 380, y1: 68 };

/** The hardboard: rounded, its grain hatched, its edge inked heavier underneath, and its shadow on the desk. */
function boardArt() {
	const b = roundRect(BOARD.x0, BOARD.y0, BOARD.x1, BOARD.y1, 14);
	const shadow = roundRect(BOARD.x0 + 10, BOARD.y0 + 14, BOARD.x1 + 12, BOARD.y1 + 12, 16);
	return {
		shadow: hatch(shadow, -0.7, 2.8, 310, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(b, true),
		grain: hatch(b, 0.08, 7, 311, { cluster: 2, skip: 0.55, trim: 0.7 }),
		ink: outline(b, { w: 2.2, heavy: 1.6, seed: 312 }),
	};
}

/** The sheet on the board: paper, a heading rule and three lines of handwriting scribble. */
function sheetArt(seed: number) {
	const s: P[] = [[SHEET.x0, SHEET.y0], [SHEET.x1, SHEET.y0], [SHEET.x1, SHEET.y1], [SHEET.x0, SHEET.y1]];
	const scribble = (y: number, w: number, k: number): string => {
		const pts: P[] = Array.from({ length: 18 }, (_, i) => [SHEET.x0 + 26 + (i / 17) * w, y + Math.sin(i * 1.7 + k) * 1.6]);
		return stroke(pts, { w: 0.8, seed: seed + k, over: 0 });
	};
	return {
		paper: pathOf(s, true),
		ink: outline(s, { w: 1.3, heavy: 0.7, seed: seed + 1 }),
		lines: scribble(278, 150, 2) + scribble(296, 120, 3) + scribble(314, 136, 4),
		shade: hatch([[SHEET.x1 - 2, SHEET.y0 + 6], [SHEET.x1 + 5, SHEET.y0 + 8], [SHEET.x1 + 5, SHEET.y1 + 4], [SHEET.x1 - 2, SHEET.y1]], 1.5, 1.6, seed + 5, { cluster: 2, trim: 0.2 }),
		title: { x: SHEET.x0 + 26, y: 122 },
	};
}

/** A coffee bean, the shop sheet's picture. */
function beanArt() {
	const cx = 340;
	const cy = 196;
	const body = ellipse(cx, cy, 52, 36, 48);
	const crease: P[] = Array.from({ length: 13 }, (_, k) => [cx - 40 + (k / 12) * 80, cy + Math.sin((k / 12) * Math.PI * 1.6) * 6]);
	return {
		fill: pathOf(body, true),
		shade: hatch(body.filter(([, y]) => y > cy - 4), 0.9, 2.2, 330, { cluster: 4, skip: 0.2, trim: 0.4 }),
		ink: outline(body, { w: 1.7, heavy: 1.1, seed: 331 }) + stroke(crease, { w: 1.5, seed: 332, over: 0.3 }),
	};
}

/** A cup on its saucer, the about sheet's picture. */
function cupArt() {
	const cx = 332;
	const top = 168;
	const body: P[] = [[cx - 40, top], [cx + 40, top], [cx + 31, top + 60], [cx - 31, top + 60]];
	const rim = ellipse(cx, top, 40, 8, 36);
	const handle: P[] = Array.from({ length: 11 }, (_, k) => {
		const a = -Math.PI / 2 + (k / 10) * Math.PI;
		return [cx + 36 + Math.cos(a) * 16, top + 26 + Math.sin(a) * 14];
	});
	const saucer = ellipse(cx, top + 63, 64, 10, 40);
	const steam = [-14, 8].map((dx, k) => stroke([[cx + dx, top - 12], [cx + dx - 6, top - 22], [cx + dx + 4, top - 32], [cx + dx - 2, top - 42]], { w: 1.1, seed: 340 + k, over: 0 }));
	return {
		fill: pathOf(saucer, true) + pathOf(body, true),
		shade: hatch([[cx + 12, top + 4], [cx + 40, top], [cx + 31, top + 60], [cx + 10, top + 60]], 1.25, 2.1, 341, { cluster: 4, skip: 0.2, trim: 0.4 }),
		ink: outline(saucer, { w: 1.3, heavy: 0.8, seed: 342 }) + outline(body, { w: 1.7, heavy: 1.1, seed: 343 }) + outline(rim, { w: 0.9, seed: 344 }) + line(handle, { w: 1.5, seed: 345, over: 0.2 }) + steam.join(''),
	};
}

/** The clip: a steel plate with its lever loop and two rivets, and the strip of tape on it that carries the address. */
function clipArt() {
	const plate = roundRect(CLIP.x0, CLIP.y0, CLIP.x1, CLIP.y1, 8);
	const lever: P[] = Array.from({ length: 17 }, (_, k) => {
		const a = Math.PI + (k / 16) * Math.PI;
		return [340 + Math.cos(a) * 34, CLIP.y0 + 4 + Math.sin(a) * 20];
	});
	const rivets = [CLIP.x0 + 12, CLIP.x1 - 12].map((x, k) => outline(ellipse(x, CLIP.y1 - 10, 3.4, 3.4, 14), { w: 0.9, seed: 360 + k })).join('');
	const label = roundRect(LABEL.x0, LABEL.y0, LABEL.x1, LABEL.y1, 3);
	return {
		paper: pathOf(plate, true),
		shine: hatch(plate, 0.05, 3.2, 361, { cluster: 3, skip: 0.4, trim: 0.5 }),
		ink: outline(plate, { w: 1.8, heavy: 1.3, seed: 362 }) + line(lever, { w: 2, seed: 363, over: 0.2 }) + rivets,
		label: pathOf(label, true),
		labelInk: outline(label, { w: 0.8, seed: 364 }),
		labelWash: wash(label, 365, 1.4, 2.5),
		text: { x: (LABEL.x0 + LABEL.x1) / 2, y: LABEL.y1 - 5 },
		shadow: hatch(roundRect(CLIP.x0 + 6, CLIP.y1 - 4, CLIP.x1 + 6, CLIP.y1 + 6, 4), -0.6, 1.6, 366, { cluster: 3, trim: 0.3 }),
	};
}

/** The whole figure, frozen into clipboard.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		board: boardArt(),
		sheet: sheetArt(320),
		bean: beanArt(),
		cup: cupArt(),
		clip: clipArt(),
	};
}
