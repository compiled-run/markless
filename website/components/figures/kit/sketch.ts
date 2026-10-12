// The pen-and-ink look: fineliner outlines, hatched shadows and pencil construction, seeded so every render draws the same.
type Pt = [number, number];

/** The wash a part is laid with: bare paper, a grey metal wash, or the figure's one marker accent. */
export type Hue = 'paper' | 'steel' | 'accent';

/** Ink hatching, darkest first: stroke spacing and width in screen units, ink strength, how far strokes reach across a face, and whether it cross-hatches. Shade 3 is the lit side and stays bare paper. */
export const DENSITIES = [
	{ gap: 2, width: 0.72, alpha: 0.95, reach: 1, cross: true },
	{ gap: 2.2, width: 0.66, alpha: 0.92, reach: 1, cross: false },
	{ gap: 3.2, width: 0.58, alpha: 0.85, reach: 0.55, cross: false },
	{ gap: 0, width: 0, alpha: 0, reach: 0, cross: false },
] as const;

const densityOf = (density: number) => DENSITIES[Math.max(0, Math.min(DENSITIES.length - 1, density))]!;

/** Inline style for a hatch path, so markup written at runtime matches the server render. */
export const hatchStyle = (density: number) => {
	const { width, alpha } = densityOf(density);
	return `fill:none;stroke:var(--anatomy-hatch);stroke-opacity:${alpha};stroke-width:${width};stroke-linecap:round`;
};

/** Inline custom properties that wash a part, its top a shade lighter, in one hue. */
export const hueVars = (hue: Hue) => `--wash:var(--anatomy-wash-${hue});--wash-top:var(--anatomy-wash-top-${hue})`;

const tenth = (value: number) => Math.round(value * 10) / 10;

const hashOf = (text: string) => {
	let h = 2166136261;
	for (let index = 0; index < text.length; index++) h = Math.imul(h ^ text.charCodeAt(index), 16777619);
	return h >>> 0;
};

const seeded = (seed: number) => {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
};

function subpaths(d: string): { points: Pt[]; closed: boolean }[] {
	const out: { points: Pt[]; closed: boolean }[] = [];
	for (const [, command, args] of d.matchAll(/([MLZz])([^MLZz]*)/g)) {
		if (command === 'M') out.push({ points: [], closed: false });
		const current = out.at(-1);
		if (!current) continue;
		if (command === 'Z' || command === 'z') {
			current.closed = true;
			continue;
		}
		const numbers = args!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
		for (let index = 0; index + 1 < numbers.length; index += 2) current.points.push([numbers[index]!, numbers[index + 1]!]);
	}
	return out;
}

const turnAt = (a: Pt, b: Pt, c: Pt) => {
	const u = Math.atan2(b[1] - a[1], b[0] - a[0]);
	const v = Math.atan2(c[1] - b[1], c[0] - b[0]);
	let turn = Math.abs(v - u);
	if (turn > Math.PI) turn = Math.PI * 2 - turn;
	return turn;
};

/** Splits a polyline at its sharp corners, so each run is drawn as its own stroke. */
function runsOf(points: Pt[], closed: boolean): Pt[][] {
	const ring = closed ? [...points, points[0]!] : points;
	const runs: Pt[][] = [];
	let run: Pt[] = [ring[0]!];
	for (let index = 1; index < ring.length; index++) {
		run.push(ring[index]!);
		const next = ring[index + 1] ?? (closed ? ring[1] : undefined);
		if (next && index < ring.length - 1 && turnAt(ring[index - 1]!, ring[index]!, next) > 0.75) {
			runs.push(run);
			run = [ring[index]!];
		}
	}
	if (run.length > 1) runs.push(run);
	return runs;
}

const lengthOf = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const draw = (points: Pt[]) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${tenth(x)} ${tenth(y)}`).join('');

interface InkHand {
	wobble: number;
	overshoot: number;
	/** Chance that a long stroke lifts off the paper once part-way along. */
	lift: number;
}

/** One run drawn by hand: a slow wobble along its length, both ends carried past the corner, and now and then a short lift of the pen. */
function inkRun(run: Pt[], next: () => number, { wobble, overshoot, lift }: InkHand): string {
	const dense: Pt[] = [run[0]!];
	for (let index = 1; index < run.length; index++) {
		const a = run[index - 1]!;
		const b = run[index]!;
		const pieces = Math.max(1, Math.ceil(lengthOf(a, b) / 4));
		for (let piece = 1; piece <= pieces; piece++) dense.push([a[0] + ((b[0] - a[0]) * piece) / pieces, a[1] + ((b[1] - a[1]) * piece) / pieces]);
	}
	const total = dense.reduce((sum, point, index) => (index ? sum + lengthOf(dense[index - 1]!, point) : 0), 0);
	if (total < 0.5) return '';
	const knots = Math.max(2, Math.ceil(total / 18) + 1);
	const kx = Array.from({ length: knots }, () => (next() - 0.5) * 2 * wobble);
	const ky = Array.from({ length: knots }, () => (next() - 0.5) * 2 * wobble);
	const noise = (k: number[], share: number) => {
		const at = share * (knots - 1);
		const index = Math.min(knots - 2, Math.floor(at));
		const t = (1 - Math.cos((at - index) * Math.PI)) / 2;
		return k[index]! * (1 - t) + k[index + 1]! * t;
	};
	let walked = 0;
	const drawn = dense.map((point, index) => {
		if (index) walked += lengthOf(dense[index - 1]!, point);
		const share = walked / total;
		return [point[0] + noise(kx, share), point[1] + noise(ky, share)] as Pt;
	});
	const stretch = (from: Pt, toward: Pt, by: number): Pt => {
		const span = lengthOf(from, toward) || 1;
		return [from[0] + ((from[0] - toward[0]) / span) * by, from[1] + ((from[1] - toward[1]) / span) * by];
	};
	drawn[0] = stretch(drawn[0]!, drawn[1]!, Math.min(overshoot * (0.4 + next()), total * 0.3));
	drawn[drawn.length - 1] = stretch(drawn[drawn.length - 1]!, drawn[drawn.length - 2]!, Math.min(overshoot * (0.3 + next()), total * 0.3));
	if (total > 36 && drawn.length > 8 && next() < lift) {
		const cut = Math.floor(drawn.length * (0.3 + next() * 0.4));
		return draw(drawn.slice(0, cut)) + draw(drawn.slice(cut + 1));
	}
	return draw(drawn);
}

function inkWith(d: string, hand: InkHand, salt: number): string {
	if (!d) return '';
	const next = seeded(hashOf(d) + salt * 7919);
	return subpaths(d)
		.filter((sub) => sub.points.length > 1)
		.flatMap((sub) => runsOf(sub.points, sub.closed).map((run) => inkRun(run, next, hand)))
		.join('');
}

/** How `Line` inks its path: a gentle wobble, shorter overshoot on an end that stops in the air. */
export const lineInk = (d: string, free = false) => inkWith(d, { wobble: 0.4, overshoot: free ? 0.3 : 1.2, lift: 0.25 }, 0);

/** A kit path (M, L and Z only) redrawn by hand in fineliner. Seeded by the path itself, so the same path always inks the same way. */
export function inkOf(d: string, { wobble = 0.55, overshoot = 2.2, lift = 0.45, salt = 0 }: { wobble?: number; overshoot?: number; lift?: number; salt?: number } = {}): string {
	return inkWith(d, { wobble, overshoot, lift }, salt);
}

/** The loose pink pencil a sketch starts from: the same path, wandering more and running well past its corners. */
export const pencilOf = (d: string) => inkWith(d, { wobble: 1.3, overshoot: 7, lift: 0 }, 3);

/** Edges whose outside faces down sit in shadow: undersides and contact edges. */
const SHADOW: Pt = [0.1, 0.99];

/** The stretches of a silhouette on its shadow side, where the pen presses harder: under ledges and on contact edges. */
export function shadowEdgeOf(d: string): string {
	if (!d) return '';
	const out: string[] = [];
	const all = subpaths(d);
	const every = all.flatMap((sub) => sub.points);
	const cx = every.reduce((sum, [x]) => sum + x, 0) / (every.length || 1);
	const cy = every.reduce((sum, [, y]) => sum + y, 0) / (every.length || 1);
	for (const { points, closed } of all) {
		if (points.length < 2) continue;
		let run: Pt[] = [];
		const flush = () => {
			if (run.length > 1) out.push(draw(run));
			run = [];
		};
		for (let index = 0; index < (closed ? points.length : points.length - 1); index++) {
			const a = points[index]!;
			const b = points[(index + 1) % points.length]!;
			const span = lengthOf(a, b) || 1;
			let nx = (b[1] - a[1]) / span;
			let ny = -(b[0] - a[0]) / span;
			if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) {
				nx = -nx;
				ny = -ny;
			}
			if (nx * SHADOW[0] + ny * SHADOW[1] > 0.3) {
				if (!run.length) run.push(a);
				run.push(b);
			} else flush();
		}
		flush();
	}
	return inkWith(out.join(''), { wobble: 0.5, overshoot: 0.8, lift: 0.2 }, 5);
}

/** Little motion ticks, the marks a hand draws round something that just moved: `count` short strokes fanned between two angles. */
export function ticksOf([cx, cy]: Pt, radius: number, from: number, to: number, count = 3, length = 6): string {
	return Array.from({ length: count }, (_, index) => {
		const a = ((from + ((to - from) * index) / Math.max(1, count - 1)) * Math.PI) / 180;
		const inner: Pt = [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
		const outer: Pt = [cx + (radius + length) * Math.cos(a), cy + (radius + length) * Math.sin(a)];
		return `M${tenth(inner[0])} ${tenth(inner[1])}L${tenth(outer[0])} ${tenth(outer[1])}`;
	}).join('');
}

const CROSS_TURN = (72 * Math.PI) / 180;

/** The direction of a face's longest edge, so strokes run with the surface: down a side, along a shaft, round a drum. */
function grainOf(points: Pt[]): number {
	let best = 0;
	let angle = 0;
	for (let index = 0; index < points.length; index++) {
		const a = points[index]!;
		const b = points[(index + 1) % points.length]!;
		const span = lengthOf(a, b);
		if (span > best) {
			best = span;
			angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
		}
	}
	return angle;
}

/** Parallel strokes across every polygon of a path, each polygon hatched along its own grain, turned by `turn`. */
function strokesAt(d: string, turn: number, gap: number, reach: number, next: () => number): string[] {
	const out: string[] = [];
	for (const { points } of subpaths(d)) {
		if (points.length < 3) continue;
		const angle = grainOf(points) + turn;
		const along: Pt = [Math.cos(angle), -Math.sin(angle)];
		const across: Pt = [-along[1], along[0]];
		const offsets = points.map(([x, y]) => x * across[0] + y * across[1]);
		const low = Math.min(...offsets);
		const high = Math.max(...offsets);
		for (let c = Math.ceil(low / gap) * gap; c < high; c += gap) {
			const hits: number[] = [];
			for (let index = 0; index < points.length; index++) {
				const a = points[index]!;
				const b = points[(index + 1) % points.length]!;
				const ca = offsets[index]!;
				const cb = offsets[(index + 1) % points.length]!;
				if ((ca <= c && cb > c) || (cb <= c && ca > c)) {
					const t = (c - ca) / (cb - ca);
					hits.push((a[0] + (b[0] - a[0]) * t) * along[0] + (a[1] + (b[1] - a[1]) * t) * along[1]);
				}
			}
			hits.sort((p, q) => p - q);
			for (let index = 0; index + 1 < hits.length; index += 2) {
				const from = hits[index]! - 0.3 - next() * 0.6;
				const full = hits[index + 1]! + 0.3 + next() * 0.6;
				const to = reach >= 1 ? full : Math.min(full, from + (full - from) * reach * (0.55 + next() * 0.9));
				if (to - from < 0.8) continue;
				const lean = (next() - 0.5) * 0.45;
				const at = (s: number, shift: number): Pt => [along[0] * s + across[0] * (c + shift), along[1] * s + across[1] * (c + shift)];
				const [x0, y0] = at(from, -lean);
				const [x1, y1] = at(to, lean);
				out.push(`M${tenth(x0)} ${tenth(y0)}L${tenth(x1)} ${tenth(y1)}`);
			}
		}
	}
	return out;
}

/** Ink hatching over the polygons of a kit path: dense parallel strokes in shadow, cross-hatched in the darkest pockets, short strokes fading into the light, nothing on the lit side. */
export function hatchOf(d: string, density: number): string {
	if (!d) return '';
	const { gap, reach, cross } = densityOf(density);
	if (!gap) return '';
	const next = seeded(hashOf(d) + density);
	const strokes = strokesAt(d, 0, gap, reach, next);
	if (cross) strokes.push(...strokesAt(d, CROSS_TURN, gap * 1.35, 1, next));
	return strokes.join('');
}
