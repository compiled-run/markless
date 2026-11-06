// Brief (checklist passed). Belief: a child is placed once, and reads its props from the parent live.
// Objects (3): the sticker sheet = Avatar; the page = the parent; the page's name selector = name. Each placed sticker is one Avatar.
// Action and change: turn the selector; every placed sticker's name changes at once. Unchanged: the stickers stay where they were stuck.
// Prevents: "a new prop value places the child again". Surprise: write on a sticker and the ink beads off.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, r1, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 420;

export const SHEET = { x0: 28, y0: 46, x1: 248, y1: 356 };
export const PAGE = { x0: 300, y0: 34, x1: 652, y1: 370 };
export const DIAL_AT: P = [566, 300];
const DIAL_R = 30;
/** The selector's three stops, in degrees clockwise from straight up. */
export const STOPS = [-60, 0, 60] as const;
const HALF = { w: 44, h: 31 };
/** Where each sticker sits on the sheet, and where a press drops it on the page. */
export const HOMES: readonly P[] = [[88, 152], [190, 152], [88, 266], [190, 266]];
export const SPOTS: readonly P[] = [[374, 112], [484, 112], [374, 200], [484, 200]];

const shape = (dx = 0, dy = 0) => roundRect(-HALF.w + dx, -HALF.h + dy, HALF.w + dx, HALF.h + dy, 14);
const at = (pts: P[], [x, y]: P): P[] => pts.map(([a, b]) => [a + x, b + y]);

/** The backing sheet: liner paper with its printed grid, the label, the die-cut holes the stickers leave, a peel curl at one corner, and its shadow. */
function sheetArt() {
	const s = roundRect(SHEET.x0, SHEET.y0, SHEET.x1, SHEET.y1, 10);
	const shadow = roundRect(SHEET.x0 + 9, SHEET.y0 + 12, SHEET.x1 + 10, SHEET.y1 + 12, 12);
	const fold = 34;
	const curl: P[] = [[SHEET.x1 - fold, SHEET.y1], [SHEET.x1, SHEET.y1 - fold], [SHEET.x1 - fold * 0.82, SHEET.y1 - fold * 0.82]];
	const under: P[] = [[SHEET.x1 - fold, SHEET.y1], [SHEET.x1, SHEET.y1 - fold], [SHEET.x1, SHEET.y1]];
	const grid: string[] = [];
	for (let y = SHEET.y0 + 70; y < SHEET.y1 - 10; y += 18) grid.push(line([[SHEET.x0 + 10, y], [SHEET.x1 - 10, y]], { w: 0.35, seed: 600 + y, over: 0 }));
	return {
		shadow: hatch(shadow, -0.7, 2.6, 610, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(s, true),
		under: pathOf(under, true),
		grid: grid.join(''),
		ink: outline(s, { w: 2, heavy: 1.5, seed: 611 }),
		curl: pathOf(curl, true),
		curlShade: hatch(curl, 0.8, 1.6, 612, { cluster: 3, trim: 0.3 }),
		curlInk: outline(curl, { w: 1.1, heavy: 0.8, seed: 613 }),
		label: { x: (SHEET.x0 + SHEET.x1) / 2, y: SHEET.y0 + 44 },
		rule: line([[SHEET.x0 + 18, SHEET.y0 + 60], [SHEET.x1 - 18, SHEET.y0 + 60]], { w: 0.9, seed: 614, over: 0.3 }),
		holes: HOMES.map((h) => pathOf(at(shape(), h), true)),
	};
}

/** The page the stickers go on: paper, its bar and the shadow it casts. */
function pageArt() {
	const p: P[] = [[PAGE.x0, PAGE.y0], [PAGE.x1, PAGE.y0], [PAGE.x1, PAGE.y1], [PAGE.x0, PAGE.y1]];
	const bar: P[] = [[PAGE.x0, PAGE.y0], [PAGE.x1, PAGE.y0], [PAGE.x1, PAGE.y0 + 22], [PAGE.x0, PAGE.y0 + 22]];
	const shadow: P[] = [[PAGE.x0 + 12, PAGE.y1], [PAGE.x1 + 12, PAGE.y1], [PAGE.x1 + 12, PAGE.y0 + 14], [PAGE.x1, PAGE.y0 + 14], [PAGE.x1, PAGE.y1 - 1], [PAGE.x0 + 12, PAGE.y1 - 1], [PAGE.x0 + 12, PAGE.y1 + 12], [PAGE.x1 + 12, PAGE.y1 + 12]];
	const writing = (x: number, y: number, w: number, seed: number) => {
		const pts: P[] = Array.from({ length: 16 }, (_, i) => [x + (i / 15) * w, y + Math.sin(i * 1.9 + seed) * 1.5]);
		return stroke(pts, { w: 0.8, seed, over: 0 });
	};
	const scribbles = writing(PAGE.x0 + 18, PAGE.y0 + 46, 150, 630) + writing(PAGE.x0 + 18, PAGE.y0 + 60, 96, 631) + writing(PAGE.x0 + 18, PAGE.y1 - 70, 120, 632) + writing(PAGE.x0 + 18, PAGE.y1 - 54, 150, 633) + writing(PAGE.x0 + 18, PAGE.y1 - 38, 80, 634);
	const dots = [14, 26, 38].map((dx, k) => outline(ellipse(PAGE.x0 + dx, PAGE.y0 + 11, 3.4, 3.4, 14), { w: 0.8, seed: 620 + k })).join('');
	return {
		shadow: hatch(shadow, -0.7, 2.6, 625, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(p, true),
		bar: hatch(bar, 0.1, 2.4, 626, { cluster: 6, skip: 0.2 }),
		writing: scribbles,
		box: [PAGE.x0 + 8, PAGE.y0 + 26, PAGE.x1 - 8, PAGE.y1 - 8] as const,
		ink: outline(p, { w: 2, heavy: 1.5, seed: 627 }) + line([[PAGE.x0, PAGE.y0 + 22], [PAGE.x1, PAGE.y0 + 22]], { w: 0.9, seed: 628, over: 0 }) + dots,
	};
}

/** The name selector on the page: a knurled knob with a pointer and three stops, each stop's name inked beside it, and the word name under it. */
function dialArt() {
	const [cx, cy] = DIAL_AT;
	const knob = ellipse(cx, cy, DIAL_R, DIAL_R, 48);
	const cap = ellipse(cx, cy, DIAL_R * 0.62, DIAL_R * 0.62, 36);
	const knurl = Array.from({ length: 24 }, (_, k) => {
		const a = (k / 24) * Math.PI * 2;
		return stroke([[cx + Math.cos(a) * DIAL_R * 0.7, cy + Math.sin(a) * DIAL_R * 0.7], [cx + Math.cos(a) * DIAL_R * 0.95, cy + Math.sin(a) * DIAL_R * 0.95]], { w: 0.6, seed: 640 + k, over: 0 });
	}).join('');
	const stops = STOPS.map((deg) => ((deg - 90) * Math.PI) / 180);
	const ticks = stops.map((a, k) => stroke([[cx + Math.cos(a) * (DIAL_R + 5), cy + Math.sin(a) * (DIAL_R + 5)], [cx + Math.cos(a) * (DIAL_R + 12), cy + Math.sin(a) * (DIAL_R + 12)]], { w: 1.3, seed: 670 + k, over: 0 })).join('');
	const labels = stops.map((a) => ({ x: r1(cx + Math.cos(a) * (DIAL_R + 30)), y: r1(cy + Math.sin(a) * (DIAL_R + 30) + 5) }));
	const spots = labels.map((l, k) => wash(ellipse(l.x, l.y - 5, 24, 13, 28), 695 + k, 1.2, 3));
	const shade: P[] = knob.filter(([x, y]) => x + y > cx + cy - 8);
	const pointer = stroke([[cx, cy - DIAL_R * 0.15], [cx, cy - DIAL_R * 0.92]], { w: 2.4, seed: 690, over: 0 });
	const shadow = ellipse(cx + 7, cy + 9, DIAL_R, DIAL_R * 0.92, 40);
	return {
		shadow: hatch(shadow, -0.7, 2, 691, { cluster: 4, skip: 0.2, trim: 0.4 }),
		knob: pathOf(knob, true),
		cap: pathOf(cap, true),
		shade: hatch(shade.length > 3 ? shade : knob, 0.9, 2, 692, { cluster: 4, trim: 0.4 }),
		ink: outline(knob, { w: 1.8, heavy: 1.3, seed: 693 }) + outline(cap, { w: 0.9, seed: 694 }) + knurl,
		ticks,
		pointer,
		labels,
		spots,
		name: { x: cx, y: cy + DIAL_R + 26 },
	};
}

/** One sticker, drawn about its own centre so it can sit anywhere: die-cut card, a small avatar, the name, its gloss, the corner that curls up on hover, its shadow, and the ink that beads off it. */
function stickerArt(seed: number) {
	const s = shape();
	const head = ellipse(-25, -6, 10, 11, 24);
	const shoulders: P[] = Array.from({ length: 13 }, (_, k) => {
		const a = Math.PI + (k / 12) * Math.PI;
		return [-25 + Math.cos(a) * 18, 22 + Math.sin(a) * 15];
	});
	const ring = ellipse(-25, 1, 21, 22, 36);
	const gloss: P[] = [[-40, -27], [10, -27], [-4, -14], [-40, -14]];
	const curl: P[] = [[HALF.w - 18, HALF.h], [HALF.w, HALF.h - 18], [HALF.w - 15, HALF.h - 15]];
	const lifted: P[] = [[HALF.w - 18, HALF.h], [HALF.w, HALF.h - 18], [HALF.w, HALF.h]];
	const scribble: P[] = Array.from({ length: 15 }, (_, k): P => [-4 + k * 3.2, -16 + (k % 2 ? 14 : 0) + k * 1.1]);
	const drops = [[0, 10, 3.6], [11, 16, 3], [21, 12, 4], [31, 19, 2.8], [39, 11, 3.3]].map(([x, y, r], k) => ({ d: pathOf(ellipse(x!, y!, r!, r! * 1.15, 12), true), x: x!, delay: k * 60 }));
	return {
		shadow: hatch(at(shape(), [5, 7]), -0.7, 1.9, seed, { cluster: 3, skip: 0.2, trim: 0.3 }),
		paper: pathOf(s, true),
		ink: outline(s, { w: 1.6, heavy: 1.2, seed: seed + 1 }) + outline(ring, { w: 1, seed: seed + 2 }) + outline(head, { w: 1.1, seed: seed + 3 }) + line(shoulders, { w: 1.1, seed: seed + 9, over: 0 }),
		face: pathOf(ring, true),
		faceShade: hatch(ring.filter(([x]) => x > -22), 1.1, 2, seed + 11, { cluster: 3, skip: 0.3, trim: 0.4 }),
		die: pathOf(at(shape(), [0, 0]), true),
		gloss: hatch(gloss, 0.55, 3.2, seed + 4, { cluster: 2, skip: 0.3, trim: 0.5 }),
		curl: pathOf(curl, true),
		curlUnder: pathOf(lifted, true),
		curlInk: outline(curl, { w: 0.9, seed: seed + 5 }),
		number: { x: -1, y: 6 },
		empty: line([[2, 9], [36, 9]], { w: 0.9, seed: seed + 6, over: 0 }),
		spot: wash(ellipse(18, 1, 24, 13, 24), seed + 7, 1, 2.5),
		scribble: { d: stroke(scribble, { w: 2.6, seed: seed + 8, over: 0 }), line: pathOf(scribble), length: r1(scribble.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - scribble[i]![0], p[1] - scribble[i]![1]), 0)) },
		drops,
	};
}

/** The whole figure, frozen into stickers.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: sheetArt(),
		page: pageArt(),
		dial: dialArt(),
		sticker: stickerArt(700),
		caption: { x: (PAGE.x0 + PAGE.x1) / 2, y: 408 },
		homes: HOMES.map(([x, y]) => `translate(${x}px, ${y}px)`),
		spots: SPOTS.map(([x, y], k) => [r1(x - HOMES[k]![0]), r1(y - HOMES[k]![1])] as const),
	};
}
