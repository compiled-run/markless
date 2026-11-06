// Brief. Belief: the slow part arrives later in the same response, and the page never waits for it.
// Objects: the browser showing a recipe, its network panel (one request), the database with a speed dial.
// Action: reload. Change: title, photo and steps ink in at once; Reviews holds a pencil skeleton until the query ends, and the one bar ends with it.
// Prevents: "the page waits for the slowest query" and "the reviews are a second request". Surprise: clicking Reviews while it loads adds no request.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 440;

const BROWSER = { x0: 16, y0: 16, x1: 420, y1: 404 };
const PANEL = { x0: 444, y0: 16, x1: 664, y1: 186 };
const DB = { cx: 554, top: 250, rx: 74, ry: 17, bottom: 372 };
export const DIAL = { cx: 554, cy: 318, r: 24 };
const ROW = { y0: 64, y1: 90, track0: 540, track1: 650 };

const shadowOf = (x0: number, y0: number, x1: number, y1: number, seed: number) =>
	hatch([[x0 + 12, y1], [x1 + 10, y1], [x1 + 10, y0 + 12], [x1, y0 + 12], [x1, y1 - 2], [x0 + 12, y1 - 2]], -0.7, 2.6, seed, { cluster: 4, skip: 0.3, trim: 0.5 }) +
	hatch([[x0 + 12, y1], [x1 + 10, y1], [x1 + 10, y1 + 10], [x0 + 12, y1 + 10]], -0.6, 2.4, seed + 1, { cluster: 4, skip: 0.3, trim: 0.5 });

const scribble = (x0: number, y: number, w: number, seed: number, pen = 0.8): string => {
	const n = Math.max(6, Math.round(w / 8));
	return stroke(Array.from({ length: n }, (_, i): P => [x0 + (i / (n - 1)) * w, y + Math.sin(i * 1.7 + seed) * 1.4]), { w: pen, seed, over: 0 });
};

function star(cx: number, cy: number, r: number): P[] {
	return Array.from({ length: 10 }, (_, i): P => {
		const a = -Math.PI / 2 + (i * Math.PI) / 5;
		const k = i % 2 ? r * 0.45 : r;
		return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
	});
}

/** The browser: frame, toolbar with the pink reload arrow and the address pill. */
function browserArt() {
	const frame = roundRect(BROWSER.x0, BROWSER.y0, BROWSER.x1, BROWSER.y1, 12);
	const bar: P[] = [[BROWSER.x0, BROWSER.y0], [BROWSER.x1, BROWSER.y0], [BROWSER.x1, 52], [BROWSER.x0, 52]];
	const pill = roundRect(64, 25, 300, 43, 9);
	const reload = ellipse(40, 34, 11, 11, 24);
	const arc: P[] = Array.from({ length: 16 }, (_, i): P => {
		const a = -0.6 + (i / 15) * 4.6;
		return [40 + Math.cos(a) * 6, 34 + Math.sin(a) * 6];
	});
	const tip = arc.at(-1)!;
	const prev = arc.at(-4)!;
	const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
	const head = (s: number): P[] => [[tip[0] - Math.cos(ang + s) * 4, tip[1] - Math.sin(ang + s) * 4], tip];
	return {
		shadow: shadowOf(BROWSER.x0, BROWSER.y0, BROWSER.x1, BROWSER.y1, 700),
		paper: pathOf(frame, true),
		barTone: hatch(bar, 0.12, 2.6, 701, { cluster: 6, skip: 0.2 }),
		ink: outline(frame, { w: 2, heavy: 1.5, seed: 702 }) + line([[BROWSER.x0, 52], [BROWSER.x1, 52]], { w: 1, seed: 703 }) + outline(pill, { w: 0.9, seed: 704 }),
		pill: pathOf(pill, true),
		url: { x: 76, y: 38.5 },
		reload: { paper: pathOf(reload, true), wash: wash(reload, 705, 1.2, 2), ink: outline(reload, { w: 1.1, heavy: 0.8, seed: 706 }) + line(arc, { w: 1, seed: 707, over: 0 }) + stroke(head(0.6), { w: 1, seed: 708, over: 0.2 }) + stroke(head(-0.6), { w: 1, seed: 709, over: 0.2 }) },
	};
}

/** The recipe page: title, a photo of the cake, and its steps. These arrive at once. */
function pageArt() {
	const photo = roundRect(40, 100, 196, 212, 6);
	const plate = ellipse(118, 186, 58, 11, 32);
	const cake: P[] = [[78, 148], [158, 148], [156, 182], [80, 182]];
	const top = ellipse(118, 148, 40, 8, 28);
	const lemon = ellipse(132, 138, 9, 6, 18);
	const steps = [118, 142, 166, 190].map((y, k) => outline(ellipse(222, y, 3, 3, 10), { w: 0.8, seed: 760 + k }) + scribble(232, y + 1, [150, 128, 160, 96][k]!, 770 + k)).join('');
	return {
		title: { x: 40, y: 86 },
		photo: pathOf(photo, true),
		photoTone: hatch(photo, 0.9, 4, 750, { cluster: 3, skip: 0.45, trim: 0.5 }),
		photoInk: outline(photo, { w: 1.2, heavy: 0.8, seed: 751 }),
		cake: pathOf(cake, true) + pathOf(top, true),
		cakeWash: wash(cake, 752, 1, 2),
		cakeInk: outline(plate, { w: 1, seed: 753 }) + outline(cake, { w: 1.3, heavy: 0.9, seed: 754 }) + outline(top, { w: 1, seed: 755 }) + outline(lemon, { w: 0.9, seed: 756 }) + line([[132, 132], [132, 144]], { w: 0.6, seed: 757 }),
		cakeShade: hatch([[134, 150], [158, 148], [156, 182], [136, 182]], 1.2, 2.2, 758, { cluster: 3, trim: 0.3 }),
		lemon: pathOf(lemon, true),
		steps,
	};
}

/** The Reviews section: its heading and rule, the pencil skeleton, and the reviews that replace it. */
function reviewsArt() {
	const area = roundRect(32, 250, 404, 392, 8);
	const bars = [272, 290, 330, 348].map((y, k) => roundRect(56, y - 5, 56 + [300, 220, 280, 180][k]!, y + 5, 5));
	const stars = [266, 324].map((y, r) => Array.from({ length: 5 }, (_, i) => outline(star(62 + i * 14, y, 5.2), { w: 0.7, seed: 820 + r * 10 + i })).join('')).join('');
	const starFill = [266, 324].map((y) => Array.from({ length: 5 }, (_, i) => pathOf(star(62 + i * 14, y, 5.2), true)).join('')).join('');
	return {
		heading: { x: 40, y: 240 },
		rule: line([[40, 246], [404, 246]], { w: 0.8, seed: 800, over: 0.2 }),
		area: pathOf(area, true),
		skeleton: bars.map((b) => pathOf(b, true)).join(''),
		skeletonInk: bars.map((b, k) => outline(b, { w: 0.6, seed: 801 + k })).join(''),
		skeletonHatch: bars.map((b, k) => hatch(b, 0.9, 3, 805 + k, { cluster: 3, skip: 0.3, trim: 0.4 })).join(''),
		starFill,
		stars,
		lines: scribble(56, 286, 300, 830, 0.9) + scribble(56, 300, 210, 831, 0.9) + scribble(56, 344, 270, 832, 0.9) + scribble(56, 358, 160, 833, 0.9),
		focus: pathOf(roundRect(30, 222, 408, 396, 8), true),
		tip: { x: 40, y: 432 },
	};
}

/** The network panel: header strip, the one request row with its growing bar, and empty rows below it. */
function panelArt() {
	const frame = roundRect(PANEL.x0, PANEL.y0, PANEL.x1, PANEL.y1, 10);
	const head: P[] = [[PANEL.x0, PANEL.y0], [PANEL.x1, PANEL.y0], [PANEL.x1, 46], [PANEL.x0, 46]];
	const row = roundRect(PANEL.x0 + 6, ROW.y0, PANEL.x1 - 6, ROW.y1, 4);
	const doc: P[] = [[454, 70], [464, 70], [468, 74], [468, 86], [454, 86]];
	const bar = roundRect(ROW.track0, 71, ROW.track1, 83, 4);
	const empty = [112, 140, 168].map((y, k) => line([[PANEL.x0 + 14, y], [PANEL.x1 - 14, y]], { w: 0.5, seed: 860 + k, over: 0 })).join('');
	const cols = line([[530, 50], [530, PANEL.y1 - 6]], { w: 0.5, seed: 865, over: 0 });
	return {
		shadow: shadowOf(PANEL.x0, PANEL.y0, PANEL.x1, PANEL.y1, 850),
		paper: pathOf(frame, true),
		headTone: hatch(head, 0.1, 2.6, 851, { cluster: 6, skip: 0.2 }),
		ink: outline(frame, { w: 1.8, heavy: 1.3, seed: 852 }) + line([[PANEL.x0, 46], [PANEL.x1, 46]], { w: 0.9, seed: 853 }) + outline(doc, { w: 0.8, seed: 854 }) + cols,
		dots: [458, 468, 478].map((x, k) => outline(ellipse(x + PANEL.x0 - 444, 31, 3, 3, 10), { w: 0.7, seed: 856 + k })).join(''),
		row: pathOf(row, true),
		rowWash: wash(row, 857, 1.4, 2.5),
		empty,
		bar: pathOf(bar, true),
		barInk: outline(bar, { w: 0.9, seed: 858 }),
		label: { x: 474, y: 81.5 },
		title: { x: PANEL.x0 + 52, y: 35 },
	};
}

/** The database: an inked cylinder with its bands, and the speed dial on its front with a snail at the slow end. */
function databaseArt() {
	const { cx, top, rx, ry, bottom } = DB;
	const lid = ellipse(cx, top, rx, ry, 44);
	const body: P[] = [[cx - rx, top], ...Array.from({ length: 23 }, (_, i): P => {
		const a = Math.PI - (i / 22) * Math.PI;
		return [cx + Math.cos(a) * rx, bottom + Math.sin(a) * ry];
	}), [cx + rx, top]];
	const band = (y: number, seed: number) => line(Array.from({ length: 23 }, (_, i): P => {
		const a = Math.PI - (i / 22) * Math.PI;
		return [cx + Math.cos(a) * rx, y + Math.sin(a) * ry];
	}), { w: 0.9, seed, over: 0 });
	const shade: P[] = [[cx + 50, top + 12], [cx + rx, top], [cx + rx, bottom], [cx + 54, bottom + ry - 3]];
	const face = ellipse(DIAL.cx, DIAL.cy, DIAL.r, DIAL.r, 32);
	const ticks = Array.from({ length: 7 }, (_, i) => {
		const a = ((-135 + i * 45 - 90) * Math.PI) / 180;
		return line([[DIAL.cx + Math.cos(a) * (DIAL.r + 3), DIAL.cy + Math.sin(a) * (DIAL.r + 3)], [DIAL.cx + Math.cos(a) * (DIAL.r + 8), DIAL.cy + Math.sin(a) * (DIAL.r + 8)]], { w: 0.8, seed: 900 + i, over: 0 });
	}).join('');
	const snail: P[] = Array.from({ length: 22 }, (_, i): P => {
		const a = (i / 21) * Math.PI * 3.4;
		const r = 1 + (i / 21) * 7;
		return [DIAL.cx + 34 + Math.cos(a) * r, DIAL.cy + 30 + Math.sin(a) * r];
	});
	const zoom = [0, 5, 10].map((d, k) => line([[DIAL.cx - 54, DIAL.cy + 20 + d], [DIAL.cx - 40, DIAL.cy + 20 + d]], { w: 0.8, seed: 910 + k, over: 0 })).join('');
	const castBase = ellipse(cx + 16, bottom + 10, rx + 6, ry + 4, 32);
	return {
		shadow: hatch(castBase, -0.6, 2.4, 880, { cluster: 4, skip: 0.3, trim: 0.5 }),
		paper: pathOf(body, true) + pathOf(lid, true),
		lid: pathOf(lid, true),
		shade: hatch(shade, 1.35, 2.2, 881, { cluster: 4, skip: 0.2, trim: 0.4 }),
		ink: outline(lid, { w: 1.6, heavy: 1, seed: 882 }) + line([[cx - rx, top], [cx - rx, bottom]], { w: 1.6, seed: 884, over: 0.2 }) + line([[cx + rx, top], [cx + rx, bottom]], { w: 2.2, seed: 885, over: 0.2 }) + band(bottom, 886) + band(top + 34, 887),
		face: pathOf(face, true),
		faceInk: outline(face, { w: 1.3, heavy: 0.9, seed: 890 }) + ticks + stroke(snail, { w: 0.8, seed: 891, over: 0 }) + zoom,
		pointer: stroke([[DIAL.cx, DIAL.cy + 3], [DIAL.cx, DIAL.cy - DIAL.r + 5]], { w: 2.2, seed: 892, over: 0 }) + outline(ellipse(DIAL.cx, DIAL.cy, 4, 4, 12), { w: 1, seed: 893 }),
	};
}

/** The whole figure, frozen into stream.art.ts. */
export function drawing() {
	return { width: WIDTH, height: HEIGHT, dial: DIAL, browser: browserArt(), page: pageArt(), reviews: reviewsArt(), panel: panelArt(), db: databaseArt() };
}
