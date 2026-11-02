// The site navbar's card drawings and the theme toggle's sun and moon, drawn with the figures' ink pen.
import { ellipse, roundRect } from '../../figures/ink/desk.ts';
import { hatch, hull, line, outline, type P, resample, seeded, stroke, wash } from '../../figures/ink/ink.ts';

/** One drawing's layers: a loose yellow wash, clustered hatching and the inked lines. */
export interface Drawing {
	readonly width: number;
	readonly height: number;
	readonly wash: string;
	readonly hatch: string;
	readonly ink: string;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const move = (pts: P[], dx: number, dy: number): P[] => pts.map(([x, y]) => [x + dx, y + dy]);
const turn = (pts: P[], deg: number, [cx, cy]: P): P[] => {
	const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
	return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};
const quad = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 24): P[] =>
	Array.from({ length: n + 1 }, (_, k) => {
		const a = rad(from + ((to - from) * k) / n);
		return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P;
	});

/** A hand-ruled line: resampled and nudged so it is never quite straight. */
function wander(points: P[], seed: number, amount = 0.8, step = 14): P[] {
	const rnd = seeded(seed);
	return resample(points, step).map(([x, y], k, all) => (k === 0 || k === all.length - 1 ? [x, y] : [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]));
}

class Sheet {
	#wash = '';
	#hatch = '';
	#ink = '';
	#seed: number;
	readonly width: number;
	readonly height: number;

	constructor(width: number, height: number, seed: number) {
		this.width = width;
		this.height = height;
		this.#seed = seed * 1000;
	}

	#next() {
		return ++this.#seed;
	}

	shape(points: P[], w = 1.8, heavy = 1.2) {
		this.#ink += outline(points, { w, heavy, seed: this.#next() });
	}

	line(points: P[], w = 1.4, wobble = 0.5) {
		this.#ink += line(points, { w, wobble, seed: this.#next() });
	}

	dot(at: P, r: number) {
		this.#ink += stroke([[at[0] - r * 0.4, at[1]], [at[0] + r * 0.4, at[1] + 0.2]], { w: r * 1.6, seed: this.#next(), over: 0, wobble: 0.1 });
	}

	tone(poly: P[], angle: number, gap = 2.6, skip = 0.3) {
		this.#hatch += hatch(poly, rad(angle), gap, this.#next(), { cluster: 5, skip, trim: 0.5 });
	}

	/** The darkest pocket: two passes at different angles, never a solid fill. */
	shade(poly: P[], angle: number, gap = 1.7) {
		this.tone(poly, angle, gap, 0.15);
		this.tone(poly, angle + 62, gap * 1.2, 0.3);
	}

	/** A shadow cast down and right onto the surface below: only the band the shape uncovers, never the shape itself. */
	cast(poly: P[], dx = 7, dy = 6, gap = 2.4) {
		const ring = hull(poly);
		const n = ring.length;
		const faces = ring.map((p, k) => {
			const q = ring[(k + 1) % n]!;
			return (q[1] - p[1]) * dx - (q[0] - p[0]) * dy > 0;
		});
		const first = faces.findIndex((lit, k) => lit && !faces[(k - 1 + n) % n]);
		if (first < 0) return;
		const chain: P[] = [ring[first]!];
		for (let k = first; faces[k % n]; k++) chain.push(ring[(k + 1) % n]!);
		this.tone([...chain, ...move(chain, dx, dy).reverse()], -28, gap, 0.35);
	}

	wash(poly: P[], grow = 2, rough = 3) {
		this.#wash += wash(poly, this.#next(), grow, rough);
	}

	done(): Drawing {
		return { width: this.width, height: this.height, wash: this.#wash, hatch: this.#hatch, ink: this.#ink };
	}
}

/** Start here: a fingerpost by a path, its top board pointing the way in. */
function start(): Drawing {
	const s = new Sheet(276, 280, 1);
	const post = quad(128, 58, 140, 196);
	s.shape(post, 2);
	s.tone(quad(134, 60, 140, 194), 80, 2.2);
	const board = (y: number, dir: 1 | -1, len: number, deg: number): P[] => {
		const tip = 134 + dir * len;
		const back = 134 - dir * 26;
		return turn([[back, y], [tip - dir * 16, y], [tip, y + 13], [tip - dir * 16, y + 26], [back, y + 26]], deg, [134, y + 13]);
	};
	const top = board(64, 1, 96, -3);
	const lower = board(104, -1, 82, 4);
	s.wash(top, 2.5, 3.5);
	s.cast(top, 4, 5, 2.6);
	s.shape(top, 2.1);
	s.shape(lower, 1.9);
	s.tone(move(lower.slice(2), 0, 0), 20, 2.8);
	for (const [x, y] of [[124, 77], [205, 72], [102, 118], [158, 119]] as P[]) s.dot([x, y], 1.6);
	s.line(wander([[40, 205], [236, 200]], 3, 1.2), 1.6);
	s.line(wander([[62, 214], [120, 212]], 4, 1), 1);
	s.line(wander([[176, 213], [222, 211]], 5, 1), 1);
	s.cast(quad(126, 196, 142, 200), 34, 7, 2);
	for (const x of [70, 96, 188, 214]) for (let k = 0; k < 4; k++) s.line([[x + k * 3, 204], [x + k * 3 + (k - 1.5) * 2.4, 192 - (k % 2) * 5]], 0.9, 0.2);
	return s.done();
}

/** Core concepts: the State figure's jar of beans, its lid on, a wire leading out. */
function concepts(): Drawing {
	const s = new Sheet(276, 280, 2);
	const body = roundRect(88, 70, 188, 206, 18);
	const lid = roundRect(96, 50, 180, 70, 5);
	s.cast(body, 10, 7, 2.3);
	s.shape(body, 2.3, 1.6);
	s.shape(lid, 2);
	for (let x = 102; x < 178; x += 7) s.line([[x, 53], [x + 0.4, 67]], 0.7, 0.1);
	s.shade(quad(166, 78, 184, 200), 74, 1.8);
	s.line(arc(138, 92, 46, 6, 200, 340, 18), 1);
	const beans: P[] = [[110, 182], [130, 188], [152, 184], [172, 180], [118, 166], [142, 168], [164, 162], [106, 150], [130, 150], [154, 146], [120, 134], [144, 130]];
	s.wash(roundRect(96, 124, 182, 200, 12), 2, 3);
	beans.forEach((at, k) => {
		const bean = turn(ellipse(at[0], at[1], 9, 6, 20), k * 37, at);
		s.shape(bean, 1.3, 0.8);
		s.line(turn([[at[0] - 5, at[1] + 0.5], [at[0], at[1] - 0.8], [at[0] + 5, at[1] + 0.5]], k * 37, at), 0.8, 0.1);
	});
	s.line(wander([[186, 120], [214, 112], [232, 92], [238, 64], [252, 40]], 7, 2, 10), 1.8, 0.9);
	s.line(wander([[189, 125], [217, 118], [236, 98], [243, 68], [257, 44]], 8, 2, 10), 0.8, 0.6);
	return s.done();
}

/** Building an app: wooden blocks stacked into something, one block still in hand's reach. */
function build(): Drawing {
	const s = new Sheet(276, 280, 3);
	const blocks: [number, number, number, number, number][] = [
		[54, 158, 112, 214, -1],
		[118, 162, 176, 214, 1.5],
		[182, 170, 230, 214, -1],
		[82, 104, 140, 156, 2],
		[146, 110, 202, 160, -2],
		[110, 54, 168, 104, 1],
	];
	blocks.forEach(([x0, y0, x1, y1, deg], k) => {
		const face = turn(roundRect(x0, y0, x1, y1, 3, 3), deg, [(x0 + x1) / 2, (y0 + y1) / 2]);
		if (k === 5) s.wash(face, 3, 4);
		s.cast(face, 6, 4, 2.6);
		s.shape(face, k < 3 ? 2.3 : 2);
		const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
		if (k % 2 === 0) s.shape(turn(ellipse(cx, cy, 12, 12, 24), deg, [cx, cy]), 1.2, 0.6);
		else s.shape(turn([[cx - 12, cy + 10], [cx, cy - 12], [cx + 12, cy + 10]], deg, [cx, cy]), 1.2, 0.6);
		s.tone(turn(quad(x1 - 10, y0 + 4, x1 - 2, y1 - 3), deg, [cx, cy]), 78, 2);
	});
	s.line(wander([[30, 216], [250, 216]], 9, 1.2), 1.7);
	s.shade(quad(40, 216, 244, 224), -18, 2);
	return s.done();
}

/** Router: a folded street map with a dashed route and a pin where it ends. */
function router(): Drawing {
	const s = new Sheet(276, 128, 4);
	const folds = [120, 162, 204, 246];
	const tops = [20, 26, 20, 26];
	const bottoms = [96, 90, 96, 90];
	const sheet: P[] = [...folds.map((x, k) => [x, tops[k]!] as P), ...folds.map((x, k) => [x, bottoms[k]!] as P).reverse()];
	s.cast(sheet, 6, 6, 2.6);
	s.shape(sheet, 2);
	for (let k = 1; k < folds.length - 1; k++) s.line([[folds[k]!, tops[k]! + 1], [folds[k]!, bottoms[k]! - 1]], 1.1, 0.2);
	s.tone(quad(162, 28, 204, 88), 70, 2.8);
	s.line(wander([[124, 52], [244, 46]], 11, 0.8), 0.9);
	s.line(wander([[140, 24], [150, 92]], 12, 0.8), 0.9);
	s.line(wander([[214, 24], [222, 92]], 13, 0.8), 0.9);
	const route: P[] = resample([[130, 82], [158, 74], [176, 60], [196, 64], [214, 50], [226, 40]], 7);
	for (let k = 0; k + 1 < route.length; k += 2) s.line([route[k]!, route[k + 1]!], 1.5, 0.2);
	const pin: P[] = [...arc(228, 26, 9, 9, 150, 390, 18), [228, 44]];
	s.wash(pin, 2, 2.5);
	s.shape(pin, 1.9);
	s.shape(ellipse(228, 26, 3.2, 3.2, 12), 1.1, 0.4);
	return s.done();
}

/** UI components: a sheet of controls, a switch, a ticked box and a button, laid out like a parts card. */
function ui(): Drawing {
	const s = new Sheet(276, 128, 5);
	const card = roundRect(118, 14, 254, 100, 8);
	s.cast(card, 6, 6, 2.6);
	s.shape(card, 2);
	const track = roundRect(132, 28, 170, 46, 9, 6);
	s.wash(track, 1.5, 2);
	s.shape(track, 1.6);
	s.shape(ellipse(161, 37, 6.5, 6.5, 18), 1.6);
	s.shade(ellipse(161, 37, 5.2, 5.2, 14), 30, 1.4);
	s.line(wander([[182, 37], [236, 37]], 21, 0.6), 1);
	const box = roundRect(132, 58, 150, 76, 3, 3);
	s.shape(box, 1.6);
	s.line([[135, 66], [141, 72], [152, 54]], 2, 0.2);
	s.line(wander([[160, 67], [214, 67]], 22, 0.6), 1);
	const button = roundRect(200, 76, 244, 94, 6, 4);
	s.cast(button, 3, 3, 1.8);
	s.shape(button, 1.6);
	s.line([[210, 85], [234, 85]], 1.2, 0.2);
	return s.done();
}

/** How it works: two gears meshing, the small one driving the large. */
function how(): Drawing {
	const s = new Sheet(276, 280, 6);
	const gear = (cx: number, cy: number, r: number, teeth: number, phase: number): P[] => {
		const pts: P[] = [];
		const n = teeth * 8;
		for (let k = 0; k < n; k++) {
			const a = (k / n) * Math.PI * 2 + rad(phase);
			const t = ((k % 8) + 8) % 8;
			const out = t >= 1 && t <= 3 ? r + r * 0.16 : r;
			pts.push([cx + out * Math.cos(a), cy + out * Math.sin(a)]);
		}
		return pts;
	};
	const big = gear(116, 128, 62, 12, 0);
	const small = gear(204, 74, 34, 8, 11);
	s.cast(big, 9, 7, 2.4);
	s.cast(small, 7, 6, 2.4);
	s.wash(small, 2.5, 3);
	s.shape(big, 2.3, 1.5);
	s.shape(small, 2.1, 1.3);
	for (const [cx, cy, r] of [[116, 128, 18], [204, 74, 10]] as [number, number, number][]) {
		s.shape(ellipse(cx, cy, r, r, 28), 1.6);
		s.shade(ellipse(cx + 1, cy + 1, r * 0.6, r * 0.6, 16), 40, 1.5);
	}
	for (let k = 0; k < 5; k++) {
		const a = rad(30 + k * 72);
		s.line([[116 + 24 * Math.cos(a), 128 + 24 * Math.sin(a)], [116 + 46 * Math.cos(a), 128 + 46 * Math.sin(a)]], 1.6, 0.3);
	}
	s.tone(arc(116, 128, 54, 54, -20, 100, 16).concat(arc(116, 128, 36, 36, 100, -20, 12)), 60, 2.4);
	s.line(arc(116, 128, 76, 76, 150, 196, 12), 1.1, 0.4);
	s.line([[44, 160], [38, 170], [50, 168]], 1.1, 0.2);
	return s.done();
}

/** Contributing: a pencil laid across a notebook page that already carries a tick. */
function contributing(): Drawing {
	const s = new Sheet(276, 280, 7);
	const page = turn(roundRect(56, 42, 212, 210, 4, 3), -4, [134, 126]);
	s.cast(page, 8, 7, 2.4);
	s.shape(page, 2.1);
	for (let k = 0; k < 7; k++) s.line(turn(wander([[74, 74 + k * 18], [196, 74 + k * 18]], 30 + k, 0.6), -4, [134, 126]), 0.7, 0.2);
	s.line(turn([[66, 50], [66, 202]], -4, [134, 126]), 1, 0.2);
	for (let k = 0; k < 5; k++) s.shape(turn(ellipse(62, 66 + k * 32, 3.5, 3.5, 12), -4, [134, 126]), 1, 0.3);
	s.line(turn([[84, 104], [96, 116], [120, 86]], -4, [134, 126]), 2.6, 0.4);
	const pencil = turn([[60, 214], [196, 214], [222, 222], [196, 230], [60, 230]], -28, [140, 222]);
	const lead = turn([[214, 219.5], [222, 222], [214, 224.5]], -28, [140, 222]);
	const band = turn(quad(60, 214, 76, 230), -28, [140, 222]);
	s.wash(turn(quad(76, 214, 196, 230), -28, [140, 222]), 2, 2.5);
	s.cast(pencil, 6, 6, 2.2);
	s.shape(pencil, 1.9);
	s.shape(band, 1.4);
	s.shape(lead, 1.2);
	s.line(turn([[76, 222], [196, 222]], -28, [140, 222]), 0.8, 0.2);
	s.tone(turn(quad(76, 223, 196, 230), -28, [140, 222]), -28 + 90, 2);
	return s.done();
}

/** The sun the light theme's toggle shows: a disc and a ring of tapered rays. */
function sun(): Drawing {
	const s = new Sheet(48, 48, 8);
	const disc = ellipse(24, 24, 9, 9, 32);
	s.wash(disc, 1.5, 1.5);
	s.shape(disc, 1.9, 1.2);
	s.tone(arc(24, 24, 7, 7, -10, 120, 10).concat([[24, 24]]), 50, 1.5);
	for (let k = 0; k < 8; k++) {
		const a = rad(k * 45 + 8);
		const [r0, r1] = k % 2 ? [13, 18] : [13, 21];
		s.line([[24 + r0 * Math.cos(a), 24 + r0 * Math.sin(a)], [24 + r1 * Math.cos(a), 24 + r1 * Math.sin(a)]], 2, 0.2);
	}
	return s.done();
}

/** The part of one disc a second disc does not cover, traced as one ring. */
function crescent(o: P, r: number, i: P, ri: number): P[] {
	const run = (c: P, rr: number, keep: (p: P) => boolean): P[] => {
		const pts = Array.from({ length: 144 }, (_, k): P => [c[0] + rr * Math.cos((k / 144) * Math.PI * 2), c[1] + rr * Math.sin((k / 144) * Math.PI * 2)]);
		const from = pts.findIndex((p, k) => keep(p) && !keep(pts[(k + 143) % 144]!));
		const out: P[] = [];
		for (let k = from; keep(pts[k % 144]!) && out.length < 144; k++) out.push(pts[k % 144]!);
		return out;
	};
	const outer = run(o, r, (p) => Math.hypot(p[0] - i[0], p[1] - i[1]) > ri);
	const inner = run(i, ri, (p) => Math.hypot(p[0] - o[0], p[1] - o[1]) < r);
	return [...outer, ...inner.reverse()];
}

/** The moon the dark theme's toggle shows: a crescent hatched on its inner edge, and two stars. */
function moon(): Drawing {
	const s = new Sheet(48, 48, 9);
	const body = crescent([22, 26], 16, [31, 19], 13);
	s.wash(body, 1.2, 1.5);
	s.shape(body, 1.9, 1.2);
	s.tone(crescent([22, 26], 14, [29, 21], 13), 30, 1.6);
	for (const [x, y, r] of [[40, 9, 3.4], [43, 37, 2.4]] as [number, number, number][]) {
		s.line([[x - r, y], [x + r, y]], 1.2, 0.1);
		s.line([[x, y - r], [x, y + r]], 1.2, 0.1);
	}
	return s.done();
}

/** The seven cards' drawings, keyed by the symbol id the navbar links. */
export function decor() {
	return { start: start(), concepts: concepts(), build: build(), router: router(), ui: ui(), how: how(), contributing: contributing() };
}

export type DecorName = keyof ReturnType<typeof decor>;

/** The toggle's two drawings, frozen into a module so they render inline with no request. */
export function themeArt() {
	return { sun: sun(), moon: moon() };
}
