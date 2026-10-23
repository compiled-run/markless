// Pen-and-ink primitives: tapered fineliner strokes, clustered hatching and loose watercolour washes, all seeded so a drawing is deterministic.
export type P = [number, number];

export const r1 = (v: number) => Math.round(v * 10) / 10;

export function seeded(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Smooth 1D noise in [-1, 1] along a parameter, built from a few random knots. */
export function noise1(rnd: () => number, knots = 9) {
	const values = Array.from({ length: knots + 1 }, () => rnd() * 2 - 1);
	return (u: number) => {
		const x = (((u % 1) + 1) % 1) * knots;
		const i = Math.floor(x);
		const f = x - i;
		const s = f * f * (3 - 2 * f);
		return values[i]! * (1 - s) + values[i + 1]! * s;
	};
}

export const pathOf = (points: P[], closed = false) =>
	points.length < 2 ? '' : 'M' + points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + (closed ? 'Z' : '');

export function resample(points: P[], step: number, closed = false): P[] {
	const ring = closed ? [...points, points[0]!] : points;
	const out: P[] = [ring[0]!];
	let carry = 0;
	for (let i = 1; i < ring.length; i++) {
		const a = ring[i - 1]!;
		const b = ring[i]!;
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		let at = step - carry;
		while (at <= len) {
			const t = at / len;
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
			at += step;
		}
		carry = len - (at - step);
	}
	if (!closed) out.push(ring.at(-1)!);
	return out;
}

export const lengthOf = (points: P[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]), 0);

export function normalAt(points: P[], i: number): P {
	const a = points[Math.max(0, i - 1)]!;
	const b = points[Math.min(points.length - 1, i + 1)]!;
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const l = Math.hypot(dx, dy) || 1;
	return [-dy / l, dx / l];
}

export interface Pen {
	/** Nib width in the middle of the stroke. */
	readonly w: number;
	/** Extra weight where the line faces down and right, the shadow side. */
	readonly heavy?: number;
	/** Shape centre: lines on the side away from it count as undersides. */
	readonly centre?: P;
	readonly wobble?: number;
	readonly over?: number;
	readonly seed: number;
}

/** One fineliner stroke as a filled, tapered polygon: thin at the ends, heavier on undersides, a little wobble and overshoot. */
export function stroke(points: P[], pen: Pen): string {
	if (points.length < 2 || lengthOf(points) < 0.8) return '';
	const rnd = seeded(pen.seed);
	let pts = resample(points, 1.6);
	const over = (pen.over ?? 2.2) * (0.4 + rnd());
	const [a0, a1] = [pts[0]!, pts[1]!];
	const [b0, b1] = [pts.at(-1)!, pts.at(-2)!];
	const ext = (p: P, q: P, by: number): P => {
		const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
		return [p[0] + ((p[0] - q[0]) / l) * by, p[1] + ((p[1] - q[1]) / l) * by];
	};
	pts = [ext(a0, a1, over * rnd()), ...pts, ext(b0, b1, over)];
	const wob = noise1(rnd, 5);
	const amp = pen.wobble ?? 0.7;
	const n = pts.length;
	const moved = pts.map((p, i) => {
		const [nx, ny] = normalAt(pts, i);
		const o = wob(i / n) * amp;
		return [p[0] + nx * o, p[1] + ny * o] as P;
	});
	const press = noise1(rnd, 4);
	const left: P[] = [];
	const right: P[] = [];
	for (let i = 0; i < n; i++) {
		const t = i / (n - 1);
		const [nx, ny] = normalAt(moved, i);
		let k = 1;
		if (pen.heavy) {
			const p = moved[i]!;
			let ox = nx;
			let oy = ny;
			if (pen.centre) {
				const s = (p[0] - pen.centre[0]) * nx + (p[1] - pen.centre[1]) * ny < 0 ? -1 : 1;
				ox *= s;
				oy *= s;
			}
			k += pen.heavy * Math.max(0, ox * 0.4 + oy * 0.92);
		}
		const taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.45);
		const w = (pen.w * (0.2 + 0.8 * taper) * k * (1 + press(t) * 0.38)) / 2;
		const p = moved[i]!;
		left.push([p[0] + nx * w, p[1] + ny * w]);
		right.push([p[0] - nx * w, p[1] - ny * w]);
	}
	return pathOf([...left, ...right.reverse()], true);
}

/** A closed outline inked in two to four runs, with pen lifts, overshoot past the joins and the odd retraced stretch. */
export function outline(points: P[], pen: Pen, closed = true): string {
	const rnd = seeded(pen.seed * 7 + 3);
	const pts = resample(points, 1.5, closed);
	const n = pts.length;
	if (n < 3) return '';
	const centre: P = pen.centre ?? [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
	const runs = closed ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
	const start = Math.floor(rnd() * n);
	const cuts = Array.from({ length: runs + 1 }, (_, i) => Math.round((i / runs) * n + (i > 0 && i < runs ? (rnd() - 0.5) * (n / runs) * 0.5 : 0)));
	let d = '';
	for (let r = 0; r < runs; r++) {
		const gap = Math.floor(rnd() * 3);
		const from = cuts[r]! + (r === 0 ? 0 : gap);
		const to = cuts[r + 1]!;
		const run: P[] = [];
		for (let i = from; i <= to && i - from < n; i++) run.push(closed ? pts[(start + i) % n]! : pts[Math.min(i, n - 1)]!);
		d += stroke(run, { ...pen, centre, seed: pen.seed * 31 + r });
		if (rnd() < 0.35 && run.length > 12) {
			const a = Math.floor(run.length * (0.15 + rnd() * 0.3));
			const b = Math.min(run.length - 1, a + Math.floor(run.length * (0.25 + rnd() * 0.3)));
			const shift = (rnd() - 0.3) * 1.6;
			const part = run.slice(a, b).map((p, i, all) => {
				const [nx, ny] = normalAt(all, i);
				return [p[0] + nx * shift, p[1] + ny * shift] as P;
			});
			d += stroke(part, { w: pen.w * 0.45, seed: pen.seed * 13 + r, over: 1 });
		}
	}
	return d;
}

/** A pen line along a polyline, split by an occasional lift. */
export function line(points: P[], pen: Pen): string {
	return outline(points, pen, false);
}

export interface HatchOptions {
	/** How much of each stroke may be cut from its ends, so strokes start and stop unevenly. */
	readonly trim?: number;
	/** Strokes come in clusters of a few, each cluster at its own slight tilt, with a wider gap between clusters. */
	readonly cluster?: number;
	/** Bow of each stroke: a flick rather than a ruled line. */
	readonly bow?: number;
	/** Chance a stroke is dropped, so the tone breaks up. */
	readonly skip?: number;
}

/** Hatching clipped to a polygon: strokes in clusters, each a slight flick, spacing and length uneven. */
export function hatch(poly: P[], angle: number, gap: number, seed: number, options: HatchOptions | number = {}): string {
	if (poly.length < 3) return '';
	const { trim = 0.18, cluster = 4, bow = 0.9, skip = 0.06 } = typeof options === 'number' ? { trim: options } : options;
	const rnd = seeded(seed);
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const rot = ([x, y]: P): P => [x * c + y * s, -x * s + y * c];
	const back = ([x, y]: P): P => [x * c - y * s, x * s + y * c];
	const rp = poly.map(rot);
	const ys = rp.map((p) => p[1]);
	const top = Math.min(...ys);
	const bottom = Math.max(...ys);
	const segs: string[] = [];
	let left = 0;
	let tilt = 0;
	for (let y = top + gap * rnd(); y < bottom; ) {
		if (left <= 0) {
			left = cluster > 1 ? 2 + Math.floor(rnd() * cluster) : 1e9;
			tilt = (rnd() - 0.5) * 0.22;
			y += cluster > 1 ? gap * rnd() * 0.9 : 0;
		}
		left--;
		const xs: number[] = [];
		for (let i = 0; i < rp.length; i++) {
			const a = rp[i]!;
			const b = rp[(i + 1) % rp.length]!;
			if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
		}
		xs.sort((p, q) => p - q);
		for (let i = 0; i + 1 < xs.length; i += 2) {
			const len = xs[i + 1]! - xs[i]!;
			if (len < 1.2 || rnd() < skip) continue;
			const x0 = xs[i]! + len * trim * rnd() * rnd();
			const x1 = xs[i + 1]! - len * trim * rnd();
			if (x1 - x0 < 1) continue;
			const lean = tilt * (x1 - x0) * 0.5 + (rnd() - 0.5) * 0.6;
			const a = back([x0, y - lean]);
			const b = back([x1, y + lean]);
			const flick = (rnd() - 0.3) * bow;
			const m = back([(x0 + x1) / 2, y + flick]);
			segs.push(`M${r1(a[0])} ${r1(a[1])}Q${r1(m[0])} ${r1(m[1])} ${r1(b[0])} ${r1(b[1])}`);
		}
		y += gap * (0.7 + rnd() * 0.6);
	}
	return segs.join('');
}

/** A loose watercolour or marker blob over a shape: lumpy edge, spilling a little past the lines. */
export function wash(poly: P[], seed: number, grow = 2.5, rough = 3): string {
	const rnd = seeded(seed);
	const pts = resample(poly, 5, true);
	const n = pts.length;
	if (n < 3) return '';
	const lump = noise1(rnd, 7);
	const cx = pts.reduce((s, p) => s + p[0], 0) / n;
	const cy = pts.reduce((s, p) => s + p[1], 0) / n;
	const shifted = pts.map((p, i) => {
		const dx = p[0] - cx;
		const dy = p[1] - cy;
		const l = Math.hypot(dx, dy) || 1;
		const o = grow + lump(i / n) * rough;
		return [p[0] + (dx / l) * o + 1.6, p[1] + (dy / l) * o - 1.2] as P;
	});
	let d = '';
	for (let i = 0; i < n; i++) {
		const p = shifted[i]!;
		const q = shifted[(i + 1) % n]!;
		const m: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
		d += i === 0 ? `M${r1(m[0])} ${r1(m[1])}` : `Q${r1(p[0])} ${r1(p[1])} ${r1(m[0])} ${r1(m[1])}`;
	}
	const p0 = shifted[0]!;
	const m0: P = [(p0[0] + shifted[1]![0]) / 2, (p0[1] + shifted[1]![1]) / 2];
	return d + `Q${r1(p0[0])} ${r1(p0[1])} ${r1(m0[0])} ${r1(m0[1])}Z`;
}

/** Shrinks a polygon toward one point: the darker pool a wash leaves on its shadow side. */
export const pool = (poly: P[], toward: P, keep: number): P[] => poly.map(([x, y]) => [toward[0] + (x - toward[0]) * keep, toward[1] + (y - toward[1]) * keep]);

export function hull(points: P[]): P[] {
	const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	// Points collinear in exact maths come out a last bit apart on arm64 and x64 (measured under 1e-13 relative, nothing up to 1e-5), so they count as collinear.
	const turnsLeft = (o: P, a: P, b: P) => {
		const ax = a[0] - o[0];
		const ay = a[1] - o[1];
		const bx = b[0] - o[0];
		const by = b[1] - o[1];
		return ax * by - ay * bx > 1e-9 * Math.hypot(ax, ay) * Math.hypot(bx, by);
	};
	const lower: P[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && !turnsLeft(lower.at(-2)!, lower.at(-1)!, p)) lower.pop();
		lower.push(p);
	}
	const upper: P[] = [];
	for (const p of pts.reverse()) {
		while (upper.length >= 2 && !turnsLeft(upper.at(-2)!, upper.at(-1)!, p)) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Keeps the part of a polygon inside a convex clip polygon. */
export function clipTo(subject: P[], clip: P[]): P[] {
	let out = subject;
	const area = clip.reduce((s, p, i) => s + p[0] * clip[(i + 1) % clip.length]![1] - clip[(i + 1) % clip.length]![0] * p[1], 0);
	const sign = area > 0 ? 1 : -1;
	for (let i = 0; i < clip.length; i++) {
		const a = clip[i]!;
		const b = clip[(i + 1) % clip.length]!;
		const inside = (p: P) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
		const cut = (p: P, q: P): P => {
			const a1 = b[1] - a[1];
			const b1 = a[0] - b[0];
			const c1 = a1 * a[0] + b1 * a[1];
			const a2 = q[1] - p[1];
			const b2 = p[0] - q[0];
			const c2 = a2 * p[0] + b2 * p[1];
			const det = a1 * b2 - a2 * b1 || 1e-9;
			return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
		};
		const input = out;
		out = [];
		for (let j = 0; j < input.length; j++) {
			const p = input[j]!;
			const q = input[(j + 1) % input.length]!;
			if (inside(q)) {
				if (!inside(p)) out.push(cut(p, q));
				out.push(q);
			} else if (inside(p)) out.push(cut(p, q));
		}
		if (!out.length) break;
	}
	return out;
}

