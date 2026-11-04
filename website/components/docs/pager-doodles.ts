// The coffee-shop doodles between the pager's two links, drawn with the figures' ink pen.
import { ellipse, roundRect } from '../figures/ink/desk.ts';
import { hatch, hull, line, outline, type P, resample, seeded, stroke, wash } from '../figures/ink/ink.ts';

/** One pass of a drawing, painted in order: `paper` knocks out what lies behind the next object. */
export interface Pass {
	readonly kind: 'paper' | 'yellow' | 'pink' | 'hatch' | 'ink';
	readonly d: string;
}

export interface Doodle {
	/** The drawing's bounds with a hair of margin, so each object fills its slot in the row. */
	readonly box: readonly [number, number, number, number];
	readonly passes: readonly Pass[];
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

function wander(points: P[], seed: number, amount = 0.6, step = 6): P[] {
	const rnd = seeded(seed);
	return resample(points, step).map(([x, y], k, all) => (k === 0 || k === all.length - 1 ? [x, y] : [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]));
}

class Sheet {
	#washed = false;
	#passes: Pass[] = [];
	#seed: number;

	constructor(seed: number) {
		this.#seed = seed * 1000;
	}

	#next() {
		return ++this.#seed;
	}

	#add(kind: Pass['kind'], d: string) {
		const last = this.#passes.at(-1);
		if (last?.kind === kind) this.#passes[this.#passes.length - 1] = { kind, d: last.d + d };
		else if (d) this.#passes.push({ kind, d });
	}

	/** Paper over everything drawn so far, so the object drawn next hides what is behind it. */
	cover(poly: P[]) {
		this.#add('paper', 'M' + poly.map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join('L') + 'Z');
	}

	shape(points: P[], w = 2, heavy = 1.2) {
		this.#add('ink', outline(points, { w, heavy, seed: this.#next() }));
	}

	line(points: P[], w = 1.4, wobble = 0.4) {
		this.#add('ink', line(points, { w, wobble, seed: this.#next() }));
	}

	dot(at: P, r: number) {
		this.#add('ink', stroke([[at[0] - r * 0.4, at[1]], [at[0] + r * 0.4, at[1] + 0.2]], { w: r * 1.6, seed: this.#next(), over: 0, wobble: 0.1 }));
	}

	tone(poly: P[], angle: number, gap = 2.2, skip = 0.25) {
		this.#add('hatch', hatch(poly, rad(angle), gap, this.#next(), { cluster: 4, skip, trim: 0.4 }));
	}

	/** The darkest pocket: two passes at different angles, never a solid fill. */
	shade(poly: P[], angle: number, gap = 1.6) {
		this.tone(poly, angle, gap, 0.12);
		this.tone(poly, angle + 62, gap * 1.2, 0.3);
	}

	/** A shadow cast down and right onto the table: only the band the shape uncovers. */
	cast(poly: P[], dx = 4, dy = 3, gap = 1.9) {
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
		this.tone([...chain, ...move(chain, dx, dy).reverse()], -28, gap, 0.3);
	}

	wash(poly: P[], tint: 'yellow' | 'pink', grow = 1.5, rough = 2) {
		if (this.#washed) throw new Error('one wash per doodle');
		this.#washed = true;
		this.#add(tint, wash(poly, this.#next(), grow, rough));
	}

	done(): Doodle {
		const nums = this.#passes.flatMap((pass) => pass.d.match(/-?\d+(\.\d+)?/g)!.map(Number));
		const xs = nums.filter((_, k) => k % 2 === 0);
		const ys = nums.filter((_, k) => k % 2 === 1);
		const [x0, y0] = [Math.floor(Math.min(...xs)) - 1, Math.floor(Math.min(...ys)) - 1];
		const box = [x0, y0, Math.ceil(Math.max(...xs)) + 1 - x0, Math.ceil(Math.max(...ys)) + 1 - y0] as const;
		return { box, passes: this.#passes };
	}
}

/** A till receipt lying on the table, its total marked with a highlighter. */
function receipt(): Doodle {
	const s = new Sheet(1);
	const c: P = [48, 30];
	const teeth: P[] = [];
	for (let k = 0; k <= 8; k++) teeth.push([84 - (k % 2) * 3, 16 + k * 3.5]);
	const slip = turn([[12, 16], ...teeth, [12, 44]], -9, c);
	s.cast(slip, 4, 4, 1.9);
	s.wash(turn(quad(56, 35.4, 77, 39.4), -9, c), 'yellow', 1.2, 1.6);
	s.shape(slip, 1.9, 1);
	s.tone(turn(quad(12, 17, 19, 43), -9, c), 80, 1.8);
	s.line(turn([[19, 17], [19.6, 43]], -9, c), 0.9, 0.2);
	s.line(turn(wander([[36, 21], [58, 21]], 7), -9, c), 1.3, 0.2);
	for (const [y, a, b, k] of [[26, 44, 66, 1], [30, 40, 67, 2]] as [number, number, number, number][]) {
		s.line(turn(wander([[24, y], [a, y]], 20 + k), -9, c), 0.9, 0.2);
		s.line(turn(wander([[b, y], [76, y]], 30 + k), -9, c), 0.9, 0.2);
	}
	for (let x = 24; x < 76; x += 4) s.line(turn([[x, 33.6], [x + 2, 33.6]], -9, c), 0.6, 0);
	s.line(turn(wander([[24, 37.4], [36, 37.4]], 41), -9, c), 1.3, 0.2);
	s.line(turn(wander([[58, 37.4], [76, 37.4]], 42), -9, c), 1.7, 0.3);
	for (let x = 30; x < 70; x += 2.6) s.line(turn([[x, 40.6], [x, 42.4]], -9, c), (x * 7) % 3 > 1 ? 0.9 : 0.5, 0);
	return s.done();
}

/** A mug of coffee, steam lifting off it. */
function mug(): Doodle {
	const s = new Sheet(2);
	const body: P[] = [...arc(30, 26, 16, 4.2, 180, 0, 16), [45, 50], ...arc(30, 50, 15, 4, 0, 180, 16)];
	const handle: P[] = [...arc(46, 37, 9, 8.5, -78, 78, 16), ...arc(46, 37, 4.6, 4.6, 70, -70, 12)];
	s.cast(body, 5, 3, 1.8);
	s.cast(handle, 4, 3, 1.8);
	s.wash(body, 'pink', 1.3, 1.8);
	s.shape(handle, 1.8, 1);
	s.shape(body, 2.1, 1.3);
	const coffee = ellipse(30, 26.8, 13.2, 2.8, 24);
	s.shape(coffee, 1.1, 0.4);
	s.shade(coffee, 8, 1.2);
	s.tone([...arc(30, 50, 15, 4, 0, 70, 8), ...arc(30, 26, 16, 4.2, 70, 0, 8).slice(0, 1), [45, 28], [38, 32], [37, 52]], 74, 1.9);
	s.line(wander([[25, 18], [22, 13], [26, 8], [23, 3]], 3, 0.8, 3), 1.2, 0.5);
	s.line(wander([[33, 18], [31, 14], [35, 10], [33, 6]], 4, 0.8, 3), 1, 0.5);
	return s.done();
}

/** Two roasted coffee beans, the front one hiding the back. */
function bean(): Doodle {
	const s = new Sheet(3);
	const drawBean = (cx: number, cy: number, rx: number, ry: number, deg: number, w: number) => {
		const at: P = [cx, cy];
		const shell = turn(ellipse(cx, cy, rx, ry, 30), deg, at);
		const crease = turn(
			Array.from({ length: 13 }, (_, k): P => {
				const t = k / 12;
				return [cx - rx * 0.78 + rx * 1.56 * t, cy + Math.sin(t * Math.PI * 2) * ry * 0.16];
			}),
			deg,
			at,
		);
		const lower = turn([...Array.from({ length: 13 }, (_, k): P => [cx - rx * 0.78 + rx * 1.56 * (k / 12), cy + Math.sin((k / 12) * Math.PI * 2) * ry * 0.16 + 1.2]), ...arc(cx, cy, rx * 0.86, ry * 0.86, 10, 170, 14)], deg, at);
		s.cast(shell, 4, 3, 1.8);
		s.cover(shell);
		s.shape(shell, w, 1.3);
		s.tone(lower, deg + 70, 1.8);
		s.tone(turn(arc(cx, cy, rx * 0.9, ry * 0.9, 200, 330, 10), deg, at), deg + 20, 2.4, 0.4);
		s.line(crease, w * 0.85, 0.2);
	};
	drawBean(24, 24, 13, 9.5, -28, 1.7);
	drawBean(36, 38, 17, 12.5, 24, 2.1);
	return s.done();
}

/** A sugar cube, a few loose grains beside it. */
function sugar(): Doodle {
	const s = new Sheet(4);
	const top: P[] = [[32, 12], [50, 20], [32, 28], [14, 20]];
	const left: P[] = [[14, 20], [32, 28], [32, 50], [14, 41]];
	const right: P[] = [[32, 28], [50, 20], [50, 41], [32, 50]];
	const cube = [...top, ...left, ...right];
	s.cast(cube, 5, 3, 1.8);
	s.wash(top, 'pink', 1.2, 1.6);
	s.shape([[14, 20], [32, 12], [50, 20], [50, 41], [32, 50], [14, 41]], 2, 1.3);
	s.line([[14.5, 20.3], [32, 28], [49.5, 20.3]], 1.3, 0.3);
	s.line([[32, 28.5], [32, 49.5]], 1.3, 0.3);
	s.tone(left, 64, 2.6, 0.45);
	s.shade(right, 112, 1.7);
	for (const [x, y, r] of [[27, 19, 0.7], [36, 17, 0.6], [33, 22, 0.6], [22, 31, 0.5], [25, 38, 0.6], [53, 52, 0.9], [57, 47, 0.7], [10, 50, 0.8]] as [number, number, number][]) s.dot([x, y], r);
	return s.done();
}

/** A teaspoon laid across the table. */
function spoon(): Doodle {
	const s = new Sheet(5);
	const c: P = [36, 32];
	const deg = -36;
	const bowl = turn(ellipse(52, 32, 13, 8.5, 30), deg, c);
	const handle = turn([[6, 30.6], [8, 29], [38, 30.4], [40, 31], [41, 32], [40, 33], [38, 33.6], [8, 35], [6, 33.4], [5, 32]], deg, c);
	s.cast([...bowl, ...handle], 4, 3, 1.7);
	s.shape(handle, 1.7, 1.2);
	s.cover(bowl);
	s.shape(bowl, 2, 1.3);
	s.shape(turn(ellipse(53, 32.6, 9.5, 5.6, 24), deg, c), 0.9, 0.3);
	s.tone(turn([...arc(53, 32.6, 9.5, 5.6, -40, 140, 12), [50, 31]], deg, c), deg + 80, 1.6);
	s.line(turn([[46, 28.6], [50, 27.8]], deg, c), 1.2, 0.1);
	s.line(turn([[12, 31.6], [34, 31.9]], deg, c), 0.7, 0.1);
	return s.done();
}

/** The part of one disc a second disc does not cover, traced as one ring. */
function crescent(o: P, r: number, i: P, ri: number): P[] {
	const run = (cc: P, rr: number, keep: (p: P) => boolean): P[] => {
		const pts = Array.from({ length: 144 }, (_, k): P => [cc[0] + rr * Math.cos((k / 144) * Math.PI * 2), cc[1] + rr * Math.sin((k / 144) * Math.PI * 2)]);
		const from = pts.findIndex((p, k) => keep(p) && !keep(pts[(k + 143) % 144]!));
		const out: P[] = [];
		for (let k = from; keep(pts[k % 144]!) && out.length < 144; k++) out.push(pts[k % 144]!);
		return out;
	};
	const outer = run(o, r, (p) => Math.hypot(p[0] - i[0], p[1] - i[1]) > ri);
	const inner = run(i, ri, (p) => Math.hypot(p[0] - o[0], p[1] - o[1]) < r);
	return [...outer, ...inner.reverse()];
}

/** A croissant: one rolled crescent, its layers marked by curved seams. */
function croissant(): Doodle {
	const s = new Sheet(6);
	const squash = (pts: P[]): P[] => pts.map(([x, y]) => [x, 44 + (y - 44) * 0.8]);
	const body = squash(crescent([32, 44], 25, [32, 62], 17));
	s.cast(body, 4, 3, 1.8);
	s.wash(body, 'yellow', 1.2, 1.8);
	s.shape(body, 2, 1.3);
	for (const deg of [214, 238, 258, 282, 302, 326]) {
		const outer: P = [32 + 25 * Math.cos(rad(deg)), 44 + 25 * Math.sin(rad(deg))];
		const inner: P = [32 + 17.6 * Math.cos(rad(deg)), 62 + 17.6 * Math.sin(rad(deg))];
		const bend: P = [(outer[0] + inner[0]) / 2 + (deg < 270 ? -2.4 : 2.4), (outer[1] + inner[1]) / 2];
		s.line(squash(resample([outer, bend, inner], 2)), 1.2, 0.3);
	}
	s.tone(squash([...arc(32, 62, 18.5, 18.5, 200, 340, 18), ...arc(32, 62, 23, 23, 330, 210, 14)]), 70, 1.7);
	return s.done();
}

/** A takeaway cup: lid, sleeve, the sleeve in front of the cup. */
function cup(): Doodle {
	const s = new Sheet(7);
	const body: P[] = [[19, 16], [45, 16], [41, 56], [23, 56]];
	const sleeve: P[] = [[19.2, 27], [44.8, 27], [43, 43], [21, 43]];
	s.cast(body, 5, 3, 1.8);
	s.shape(body, 1.9, 1.2);
	s.tone([[37, 17], [44.5, 17], [40.6, 55], [35, 55]], 80, 2.2);
	s.cover(sleeve);
	s.wash(sleeve, 'pink', 0.6, 1.2);
	s.shape(sleeve, 1.8, 1.1);
	s.shade([[37, 28], [44, 28], [42.4, 42], [36, 42]], 78, 1.7);
	s.line(wander([[25, 33], [37, 33]], 71, 0.5, 4), 0.8, 0.2);
	s.line(wander([[26, 37], [33, 37]], 72, 0.5, 4), 0.8, 0.2);
	const rim = roundRect(16, 12, 48, 17, 2, 3);
	const dome: P[] = [...arc(32, 12.5, 14, 4.6, 180, 360, 16)];
	s.cover([...dome, [48, 17], [16, 17]]);
	s.shape(dome, 1.7, 0.8);
	s.shape(rim, 1.8, 1.1);
	s.dot([38, 10.2], 1);
	return s.done();
}

/** A stovetop moka pot, its faceted waist and spout. */
function moka(): Doodle {
	const s = new Sheet(8);
	const lower: P[] = [[22, 36], [42, 36], [46, 58], [18, 58]];
	const upper: P[] = [[23, 34], [41, 34], [45, 14], [19, 14]];
	const lid: P[] = [...arc(32, 14, 13, 4, 180, 360, 14)];
	const handle: P[] = [[44, 16], [52, 17], [53, 20], [50, 36], [47, 36], [49, 21], [44, 20]];
	const spout: P[] = [[19, 14], [13, 11], [12, 13], [20, 19]];
	s.cast([...lower, ...upper], 4, 2.5, 1.9);
	s.shape(handle, 1.7, 1);
	s.tone(handle, 30, 2, 0.3);
	s.shape(spout, 1.5, 0.8);
	s.cover(upper);
	s.shape(upper, 1.9, 1.2);
	s.cover(lower);
	s.shape(lower, 2, 1.3);
	s.shape(roundRect(20, 33.5, 44, 37, 1, 2), 1.4, 0.6);
	for (const [top, bottom] of [[[28, 15], [29.4, 33]], [[36, 15], [34.6, 33]], [[29, 38], [27.4, 57]], [[35, 38], [36.6, 57]]] as [P, P][]) s.line([top, bottom], 0.8, 0.1);
	s.shade([[36.6, 15], [44.6, 15], [40.8, 33], [35, 33]], 74, 1.6);
	s.shade([[35.4, 38], [41.6, 38], [45.4, 57], [37, 57]], 106, 1.6);
	s.cover([...lid, [45, 14], [19, 14]]);
	s.shape(lid, 1.6, 0.8);
	s.shape(ellipse(32, 8.6, 2.4, 1.8, 12), 1.3, 0.4);
	return s.done();
}

/** The row in order, left to right: the name is the symbol id the pager links. */
export function doodles() {
	return { receipt: receipt(), mug: mug(), bean: bean(), sugar: sugar(), spoon: spoon(), croissant: croissant(), cup: cup(), moka: moka() };
}

export type DoodleName = keyof ReturnType<typeof doodles>;
