// Brief (checklist passed). Belief: two components that call one shared() name show the same track, live.
// Objects: the page with the MiniPlayer in its header, the NowPlaying card. Action: press play (or scrub) on either.
// Change: both progress bars move together. Unchanged: each player's volume knob (widget scope, its own copy).
// Prevents: "each player keeps its own copy, so they drift apart". Surprise: turn one knob and only that one turns.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 440;

const PAGE = { x0: 24, y0: 14, x1: 656, y1: 424 };
const HEADER = { y1: 70 };
const MINI = { x0: 360, y0: 22, x1: 646, y1: 62 };
const CARD = { x0: 64, y0: 104, x1: 616, y1: 398 };

export const BARS = {
	mini: { x0: 412, x1: 560, y: 52 },
	big: { x0: 300, x1: 590, y: 246 },
} as const;
export const PLAY = { mini: { cx: 584, cy: 42, r: 12 }, big: { cx: 334, cy: 316, r: 26 } } as const;
export const KNOB = { mini: { cx: 624, cy: 42, r: 11 }, big: { cx: 556, cy: 316, r: 22 } } as const;

/** The page the players live on: a paper sheet, its header strip with a site mark, and its shadow. */
function pageArt() {
	const { x0, y0, x1, y1 } = PAGE;
	const sheet = roundRect(x0, y0, x1, y1, 8);
	const header: P[] = [[x0, y0], [x1, y0], [x1, HEADER.y1], [x0, HEADER.y1]];
	const shadow: P[] = [[x0 + 14, y1], [x1 + 10, y1], [x1 + 10, y0 + 14], [x1, y0 + 14], [x1, y1 - 1], [x0 + 14, y1 - 1]];
	const mark = ellipse(x0 + 32, (y0 + HEADER.y1) / 2, 11, 11, 18);
	const scribble = (x: number, w: number, seed: number) =>
		stroke(Array.from({ length: 10 }, (_, i): P => [x + (i / 9) * w, (y0 + HEADER.y1) / 2 + 1 + Math.sin(i * 1.9) * 1.3]), { w: 0.8, seed, over: 0 });
	return {
		shadow: hatch(shadow, -0.7, 2.6, 7000, { cluster: 5, skip: 0.3, trim: 0.5 }),
		sheet: pathOf(sheet, true),
		header: pathOf(header, true),
		headerTone: hatch(header, 1.2, 4.2, 7001, { cluster: 3, skip: 0.45, trim: 0.55 }),
		ink: outline(sheet, { w: 2, heavy: 1.5, seed: 7002 }) + line([[x0, HEADER.y1], [x1, HEADER.y1]], { w: 1.2, seed: 7003, over: 0.2 }),
		mark: outline(mark, { w: 1.3, heavy: 0.8, seed: 7004 }) + scribble(x0 + 52, 46, 7005) + scribble(x0 + 120, 34, 7006),
	};
}

/** An album sleeve: a low sun over three waves, in a square with a thin border. Scaled to fit the box. */
function coverArt(x0: number, y0: number, s: number, seed: number) {
	const at = (u: number, v: number): P => [x0 + u * s, y0 + v * s];
	const sq: P[] = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
	const sun: P[] = Array.from({ length: 19 }, (_, i) => {
		const a = Math.PI + (i / 18) * Math.PI;
		return at(0.5 + Math.cos(a) * 0.24, 0.6 + Math.sin(a) * 0.24);
	});
	const waves = [0.66, 0.76, 0.86].map((v, k) =>
		stroke(Array.from({ length: 14 }, (_, i): P => at(0.08 + (i / 13) * 0.84, v + Math.sin(i * 1.3 + k) * 0.018)), { w: s > 60 ? 1.3 : 0.7, seed: seed + 10 + k, over: 0 }),
	);
	const sky: P[] = [at(0, 0), at(1, 0), at(1, 0.6), at(0, 0.6)];
	return {
		paper: pathOf(sq, true),
		sky: hatch(sky, 0.25, s > 60 ? 4 : 2.6, seed, { cluster: 4, skip: 0.35, trim: 0.5 }),
		sun: pathOf(sun, true),
		ink: outline(sq, { w: s > 60 ? 1.8 : 1, heavy: s > 60 ? 1.2 : 0.6, seed: seed + 1 }) + line([...sun, sun[0]!], { w: s > 60 ? 1.4 : 0.8, seed: seed + 2, over: 0.2 }) + waves.join(''),
	};
}

/** A progress bar: a rounded groove, its yellow fill (scaled by CSS) and a round handle (moved by CSS). */
function barArt(who: 'mini' | 'big', seed: number) {
	const { x0, x1, y } = BARS[who];
	const h = who === 'mini' ? 3 : 5;
	const groove = roundRect(x0, y - h, x1, y + h, h);
	const r = who === 'mini' ? 4.5 : 8;
	const knob = ellipse(x0, y, r, r, 16);
	return {
		groove: pathOf(groove, true),
		grooveInk: outline(groove, { w: who === 'mini' ? 0.8 : 1.2, seed }),
		fill: pathOf(groove, true),
		handle: pathOf(knob, true),
		handleInk: outline(knob, { w: who === 'mini' ? 0.9 : 1.4, heavy: 0.8, seed: seed + 1 }),
		hit: pathOf(roundRect(x0 - 8, y - 14, x1 + 8, y + 14, 6), true),
		x0,
		width: x1 - x0,
	};
}

/** A round play button: a raised disc with a triangle (play) and two bars (pause), each shown by CSS. */
function playArt(who: 'mini' | 'big', seed: number) {
	const { cx, cy, r } = PLAY[who];
	const disc = ellipse(cx, cy, r, r, 28);
	const side = ellipse(cx + r * 0.08, cy + r * 0.12, r, r, 28);
	const k = r / 12;
	const tri: P[] = [[cx - 3.5 * k, cy - 5.5 * k], [cx + 6 * k, cy], [cx - 3.5 * k, cy + 5.5 * k]];
	const bars = [roundRect(cx - 5 * k, cy - 5.5 * k, cx - 1.6 * k, cy + 5.5 * k, k), roundRect(cx + 1.6 * k, cy - 5.5 * k, cx + 5 * k, cy + 5.5 * k, k)];
	return {
		side: pathOf(side, true),
		disc: pathOf(disc, true),
		wash: wash(disc, seed, 1, 2),
		ink: outline(disc, { w: who === 'mini' ? 1.1 : 1.8, heavy: 1, seed: seed + 1 }),
		play: pathOf(tri, true),
		pause: bars.map((b) => pathOf(b, true)).join(''),
	};
}

/** A volume knob: knurled rim, a scale of ticks from -135 to 135 degrees, and a pointer the CSS rotates. */
function knobArt(who: 'mini' | 'big', seed: number) {
	const { cx, cy, r } = KNOB[who];
	const body = ellipse(cx, cy, r, r, 30);
	const shadow = ellipse(cx + r * 0.25, cy + r * 0.3, r, r, 30);
	const ticks = Array.from({ length: 7 }, (_, i) => {
		const a = ((-135 + i * 45 - 90) * Math.PI) / 180;
		return stroke([[cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3)], [cx + Math.cos(a) * (r + (who === 'mini' ? 5.5 : 8)), cy + Math.sin(a) * (r + (who === 'mini' ? 5.5 : 8))]], { w: 0.7, seed: seed + 10 + i, over: 0 });
	}).join('');
	const knurl = Array.from({ length: 16 }, (_, i) => {
		const a = (i / 16) * Math.PI * 2;
		return stroke([[cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82], [cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.98]], { w: 0.5, seed: seed + 30 + i, over: 0 });
	}).join('');
	return {
		shadow: hatch(shadow, -0.6, who === 'mini' ? 1.4 : 2, seed, { cluster: 3, trim: 0.3 }),
		body: pathOf(body, true),
		ink: outline(body, { w: who === 'mini' ? 1 : 1.6, heavy: 1, seed: seed + 1 }) + knurl,
		shade: hatch(ellipse(cx + r * 0.25, cy + r * 0.25, r * 0.7, r * 0.7, 20), 1.1, who === 'mini' ? 1.4 : 2, seed + 2, { cluster: 3, trim: 0.3 }),
		ticks,
		pointer: stroke([[cx, cy - r * 0.15], [cx, cy - r * 0.78]], { w: who === 'mini' ? 1.3 : 2.2, seed: seed + 3, over: 0 }),
		origin: `${cx}px ${cy}px`,
	};
}

/** The NowPlaying card: a raised paper card with its own cast shadow. */
function cardArt() {
	const { x0, y0, x1, y1 } = CARD;
	const card = roundRect(x0, y0, x1, y1, 12);
	const shadow = roundRect(x0 + 10, y0 + 12, x1 + 10, y1 + 10, 14);
	return {
		shadow: hatch(shadow, -0.7, 2.4, 7100, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(card, true),
		ink: outline(card, { w: 1.8, heavy: 1.4, seed: 7101 }),
	};
}

/** The whole figure, frozen into player.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		page: pageArt(),
		mini: {
			box: pathOf(roundRect(MINI.x0, MINI.y0, MINI.x1, MINI.y1, 8), true),
			boxInk: outline(roundRect(MINI.x0, MINI.y0, MINI.x1, MINI.y1, 8), { w: 1.1, seed: 7200 }),
			cover: coverArt(368, 27, 30, 7210),
			title: { x: 412, y: 40 },
			bar: barArt('mini', 7220),
			play: playArt('mini', 7230),
			knob: knobArt('mini', 7240),
		},
		big: {
			card: cardArt(),
			cover: coverArt(90, 130, 176, 7310),
			title: { x: 300, y: 182 },
			bar: barArt('big', 7320),
			play: playArt('big', 7330),
			knob: knobArt('big', 7340),
		},
	};
}
