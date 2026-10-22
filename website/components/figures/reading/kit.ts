// The desk the reading-tsrx figures share: a camera fitted to the layout's width, sheets lying on the desk, typed code, a shop page, ink cords with crocodile clips, and pencil notes.
import { add3, cross3, dot3, lerp3, mul3, sub3, unit3 } from '../kit/lathe.ts';
import { centreOf, createCamera, ellipse, LIGHT, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, lengthOf, line, outline, pathOf, pool, r1, resample, seeded, stroke, wash } from '../ink/ink.ts';
import { barbs, deskPlane, pencil } from '../ink/plane.ts';
import { CODE_FS, colsOf, NOTE_FS, type Tok } from './model.ts';

export { CODE_FS, NOTE_FS };

/** Local sheet units per world unit; every layout below is in local units, about one screen pixel each. */
export const L = 10;

export interface SheetSpec {
	/** The sheet's top-left corner on the desk, in local units. */
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly turn: number;
}

/** One painted path: `cls` names its paint and any motion group in the figure's CSS. */
export interface Ink {
	readonly key: number;
	readonly cls: string;
	readonly d: string;
	readonly style?: string;
}

/** One run of real type on the drawing, placed by an SVG matrix. */
export interface Type {
	readonly key: number;
	readonly cls: string;
	readonly text: string;
	readonly m: string;
	readonly anchor?: 'start' | 'middle' | 'end';
	readonly style?: string;
}

export const COL = CODE_FS * 0.6;
/** Measured advance of Shantell Sans 700 in ems, averaged over lowercase words. */
const NOTE_EM = 0.55;

/** A painter: collects ink and type in paint order for one layout. */
export function painter() {
	const ink: Ink[] = [];
	const type: Type[] = [];
	return {
		ink,
		type,
		add(cls: string, d: string, style?: string) {
			if (d) ink.push({ key: ink.length, cls, d, ...(style ? { style } : {}) });
		},
		text(cls: string, text: string, m: string, anchor?: Type['anchor'], style?: string) {
			type.push({ key: type.length, cls, text, m, ...(anchor ? { anchor } : {}), ...(style ? { style } : {}) });
		},
	};
}
export type Painter = ReturnType<typeof painter>;

/** A camera for `bounds` (world points), scaled so the scene spans `width` with `pad` either side; its height follows. */
export function camera(width: number, bounds: Point3[], elevation = 58, pad = 8) {
	const xs = bounds.map((p) => p[0]);
	const ys = bounds.map((p) => p[1]);
	const target: Point3 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0];
	const base = createCamera({ width: 1000, height: 1000, view: { azimuth: 93, elevation, distance: 90, target }, bounds, pad: 0 });
	const raw = bounds.map(base.proj);
	const x0 = Math.min(...raw.map((p) => p[0]));
	const x1 = Math.max(...raw.map((p) => p[0]));
	const y0 = Math.min(...raw.map((p) => p[1]));
	const y1 = Math.max(...raw.map((p) => p[1]));
	const k = (width - pad * 2) / (x1 - x0);
	const proj = (p: Point3): P => {
		const [x, y] = base.proj(p);
		return [(x - x0) * k + pad, (y - y0) * k + pad];
	};
	return { proj, eye: base.EYE, height: Math.ceil((y1 - y0) * k + pad * 2) };
}
export type Camera = ReturnType<typeof camera>;

/** A sheet lying on the desk, addressed in local units from its top-left corner. */
export function sheet(cam: Camera, spec: SheetSpec, lift = 0.04) {
	const c: P = [(spec.x + spec.w / 2) / L, (spec.y + spec.h / 2) / L];
	const plane = deskPlane(cam.proj, c, spec.w / L, spec.h / L, spec.turn, lift);
	const at = (x: number, y: number, up = 0): Point3 => plane.at(x / L, y / L, up);
	const S = (x: number, y: number, up = 0): P => cam.proj(at(x, y, up));
	const on = (pts: P[], up = 0): P[] => pts.map(([x, y]) => S(x, y, up));
	const m = (x: number, y: number, angle = 0, up = 0) => matrixOf(S(x, y, up), S(x + Math.cos(angle), y + Math.sin(angle), up), S(x - Math.sin(angle), y + Math.cos(angle), up));
	return { spec, at, S, on, m, lift };
}
export type Sheet = ReturnType<typeof sheet>;

/** The paper itself: fill, a heavy edge, its shadow hatched onto the desk, a little tooth and pencil layout lines. */
export function paperOf(p: Painter, s: Sheet, cam: Camera, seed: number) {
	const { w, h } = s.spec;
	const edge = s.on(roundRect(0, 0, w, h, 1.6, 2));
	const square: P[] = [[0, 0], [w, 0], [w, h], [0, h]];
	const [, tr, br, bl] = s.on(square);
	const cast = (z: number) => square.map(([x, y]) => cam.proj(shadowOnDesk(s.at(x, y, z))));
	const shade = (z: number) => {
		const [, tr2, br2, bl2] = cast(z);
		return [tr!, tr2!, br2!, bl2!, bl!, br!];
	};
	p.add('shadow-wash', wash(shade(0.9), seed, 0.4, 1.5));
	p.add('hatch deep faint', hatch(shade(1.7), -0.5, 3.1, seed + 1, { cluster: 5, skip: 0.3, trim: 0.5 }));
	p.add('hatch deep light', hatch(shade(0.9), 0.55, 2.1, seed + 2, { cluster: 4, skip: 0.18, trim: 0.35 }));
	p.add('hatch deep', hatch(shade(0.32), -1.15, 1.35, seed + 3, { cluster: 3, skip: 0.08 }) + hatch(shade(0.32), 0.2, 1.5, seed + 4, { cluster: 3, skip: 0.12 }));
	p.add('sheet', pathOf(edge, true));
	p.add('hatch faint', hatch(s.on([[w * 0.55, h * 0.9], [w, h * 0.72], [w, h], [w * 0.45, h]]), 0.62, 4.6, seed + 5, { cluster: 4, skip: 0.62, trim: 0.6 }));
	p.add('ink', outline(edge, { w: 2, heavy: 1.8, centre: centreOf(edge), seed: seed + 6 }));
	p.add('pencil', [pencil(s.on([[-18, 0], [w + 18, 0]]), seed + 7), pencil(s.on([[w, -14], [w, h + 14]]), seed + 8), pencil(s.on([[-14, h], [w + 14, h]]), seed + 9)].join(''));
}

/** Where each typed code token sits, so notes, rings and clips can find it. */
export interface Typeset {
	/** Screen-free local spot of a token: its line, the column it starts at and its width in columns. */
	find(text: string, row?: number): { row: number; col: number; cols: number };
	x(col: number): number;
	base(row: number): number;
}

/** Monospaced code typed on a sheet, coloured like the site's highlighter, starting at `x0` with the first baseline at `y0`. */
export function codeOf(p: Painter, s: Sheet, lines: readonly (readonly Tok[])[], x0: number, y0: number, pitch: number, cls = ''): Typeset {
	const x = (col: number) => x0 + col * COL;
	const base = (row: number) => y0 + row * pitch;
	lines.forEach((row, r) => {
		let col = 0;
		for (const [text, tone] of row) {
			const lead = text.length - text.trimStart().length;
			if (text.trim()) p.text(`tok ${tone}${cls ? ' ' + cls : ''}`, text.trim(), s.m(x(col + lead), base(r)));
			col += colsOf(text);
		}
	});
	return {
		x,
		base,
		find(text, only) {
			for (const [r, row] of lines.entries()) {
				if (only !== undefined && r !== only) continue;
				const whole = row.map(([t]) => t).join('');
				const i = whole.indexOf(text);
				if (i >= 0) return { row: r, col: colsOf(whole.slice(0, i)), cols: colsOf(text) };
			}
			throw new Error(`"${text}" is not in the code`);
		},
	};
}

/** The browser bar drawn across the top of a page sheet: tone, three dots and the address pill. */
export function browserBar(p: Painter, s: Sheet, address: string, seed: number, cls = 'ink') {
	const { w } = s.spec;
	const barH = 18;
	p.add('hatch light', hatch(s.on([[2, 2], [w - 2, 2], [w - 2, barH], [2, barH]]), 0.4, 2.2, seed, { cluster: 4, skip: 0.35, trim: 0.4 }));
	p.add(cls, line(s.on([[0, barH], [w, barH]]), { w: 0.9, seed: seed + 1, over: 0.5 }));
	for (let i = 0; i < 3; i++) p.add(cls, outline(s.on(ellipse(9 + i * 8, barH / 2, 2.2, 2.2, 14)), { w: 0.6, seed: seed + 2 + i }));
	const pill = s.on(roundRect(36, 4.5, Math.min(w - 10, 36 + address.length * 5.4 + 16), barH - 4.5, 4, 3));
	p.add('sheet', pathOf(pill, true));
	p.add(cls, outline(pill, { w: 0.6, seed: seed + 6 }));
	p.text('url', address, s.m(44, barH - 6.4));
}

/** A pink action button lying on the page, raised a little so its side shows; returns the group's sink offset. */
export function buttonOf(p: Painter, s: Sheet, x0: number, y0: number, x1: number, y1: number, seed: number, cls: string) {
	const face = s.on(roundRect(x0, y0, x1, y1, 3, 3), 0.05);
	const base = s.on(roundRect(x0, y0 + 2.4, x1, y1 + 2.4, 3, 3));
	const side = hull([...face.slice(Math.floor(face.length / 4), Math.floor((face.length * 3) / 4) + 1), ...base]);
	p.add(`hatch ${cls}`, hatch(side, 1.1, 1.2, seed, { cluster: 3, skip: 0.1 }));
	p.add(`sheet ${cls}`, pathOf(face, true));
	p.add(`wash pink ${cls}`, wash(face, seed + 1, 1, 2.4));
	p.add(`wash pink pool ${cls}`, wash(pool(face, face[Math.floor(face.length / 2)]!, 0.5), seed + 2, 0.4, 1.4));
	p.add(`ink ${cls}`, outline(face, { w: 1.1, heavy: 1.1, centre: centreOf(face), seed: seed + 3 }));
	const [a, b] = [s.S(x0, y0), s.S(x0, y0 + 2.4)];
	return `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1])}px`;
}

/** A loose yellow wash over a spot on a sheet, with its darker pool and a faint edge. */
export function spotOf(p: Painter, s: Sheet, x0: number, y0: number, x1: number, y1: number, seed: number, cls = '') {
	const poly = s.on(ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 3, (y1 - y0) / 2 + 2, 28));
	const extra = cls ? ' ' + cls : '';
	p.add('wash yellow' + extra, wash(poly, seed, 1.2, 2.6));
	p.add('wash yellow pool' + extra, wash(pool(poly, poly[6]!, 0.55), seed + 1, 0.5, 1.8));
	p.add('wash-edge' + extra, wash(poly, seed + 2, 0.4, 2.4));
}

/** A pencil line drawn as a plain centre path. */
export function scribble(pts: P[], seed: number, jit = 0.9) {
	const rnd = seeded(seed);
	const screen = resample(pts, 1.2).map(([x, y], i) => [x + Math.sin(i * 0.31 + rnd() * 6) * jit * 0.4, y + Math.cos(i * 0.23) * jit * 0.3] as P);
	return { d: pathOf(screen), length: r1(lengthOf(screen) + 2) };
}

/** A hand-drawn arrow through screen points, with two barbs at its end. */
export function arrowAt(pts: P[], seed: number, size = 5.5) {
	const curve = resample(smooth(pts), 1.5);
	const head = barbs(curve, size, 0.5).map((b) => pathOf(b)).join('');
	return scribble(curve, seed, 0.6).d + head;
}

/** A hand-drawn arrow through local sheet points. */
export const arrowOn = (s: Sheet, pts: P[], seed: number) => arrowAt(s.on(pts), seed);

/** Two loose loops round a run of code on a sheet, not quite closing. */
export function ringOn(s: Sheet, x0: number, x1: number, baseline: number, seed: number, tall = 10) {
	const cx = (x0 + x1) / 2;
	const cy = baseline - CODE_FS * 0.32;
	const rx = (x1 - x0) / 2 + 5;
	const pts: P[] = [];
	for (let i = 0; i <= 70; i++) {
		const a = -2.6 + (i / 70) * Math.PI * 2.2;
		const grow = 1 + (i / 70) * 0.07;
		pts.push([cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * tall * grow]);
	}
	return scribble(s.on(pts), seed).d;
}

/** A hand-lettered note on a sheet, one entry per line, left-aligned at `x` with the first baseline at `y`. */
export function noteOn(p: Painter, s: Sheet, lines: readonly string[], x: number, y: number, cls = 'note', angle = -0.03, size = NOTE_FS) {
	lines.forEach((text, i) => p.text(cls, text, s.m(x - Math.sin(angle) * i * (size + 2), y + i * (size + 2), angle)));
	return { x0: x, x1: x + Math.max(...lines.map((l) => l.length)) * NOTE_EM * size, y0: y - size, y1: y + (lines.length - 1) * (size + 2) + 3 };
}

/** Catmull-Rom through local points, ten steps per span. */
export function smooth(pts: P[]): P[] {
	if (pts.length < 3) return pts;
	const out: P[] = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)]!;
		const p1 = pts[i]!;
		const p2 = pts[i + 1]!;
		const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
		for (let k = 0; k < 10; k++) {
			const t = k / 10;
			const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
			out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
		}
	}
	out.push(pts.at(-1)!);
	return out;
}

/** A cubic arc of world points from `a` to `b`, leaving along `da` and arriving along `db`, raised `rise` world units at its middle. */
export function arc(a: Point3, da: P, b: Point3, db: P, reach: number, rise: number, steps = 48): Point3[] {
	const c1: Point3 = [a[0] + da[0] * reach, a[1] + da[1] * reach, a[2] + rise];
	const c2: Point3 = [b[0] - db[0] * reach, b[1] - db[1] * reach, b[2] + rise];
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		const u = 1 - t;
		return add3(add3(mul3(a, u * u * u), mul3(c1, 3 * u * u * t)), add3(mul3(c2, 3 * u * t * t), mul3(b, t * t * t)));
	});
}

/** An ink cord through world points: paper fill, a thin lit edge and a heavy shade edge, twist ticks, tone, and its shadow on the desk. */
export function cord(cam: Camera, points: Point3[], radius: number, seed: number) {
	const pts: Point3[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i]!;
		const b = points[i + 1]!;
		const n = Math.max(1, Math.ceil(Math.hypot(...sub3(b, a)) / 0.15));
		for (let k = 0; k < n; k++) pts.push(lerp3(a, b, k / n));
	}
	pts.push(points.at(-1)!);
	const left: P[] = [];
	const right: P[] = [];
	const inner: P[] = [];
	let ticks = '';
	let travelled = 0;
	let nextTick = 0.5;
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i]!;
		if (i) travelled += Math.hypot(...sub3(p, pts[i - 1]!));
		const t = unit3(sub3(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!));
		const n = unit3(cross3(t, sub3(cam.eye, p)));
		const l = cam.proj(add3(p, mul3(n, radius)));
		const r = cam.proj(sub3(p, mul3(n, radius)));
		left.push(l);
		right.push(r);
		const side = dot3(n, LIGHT) > 0 ? -1 : 1;
		inner.push(cam.proj(add3(p, mul3(n, side * radius * 0.62))));
		if (travelled >= nextTick && i > 2 && i < pts.length - 3) {
			nextTick += 1.1 + ((i * 37) % 7) * 0.12;
			const c = cam.proj(p);
			const bulge = cam.proj(add3(p, mul3(t, radius * 0.9)));
			const m: P = [bulge[0] * 2 - c[0], bulge[1] * 2 - c[1]];
			const arcPts: P[] = Array.from({ length: 7 }, (_, k) => {
				const s = (k / 6) * 0.75 + (i % 2) * 0.1;
				return [(1 - s) * (1 - s) * l[0] + 2 * s * (1 - s) * m[0] + s * s * r[0], (1 - s) * (1 - s) * l[1] + 2 * s * (1 - s) * m[1] + s * s * r[1]];
			});
			ticks += stroke(arcPts, { w: 0.42, seed: seed + 20 + i, over: 0, wobble: 0.1 });
		}
	}
	const rnd = seeded(seed + 40);
	let tone = '';
	for (let i = 0; i < inner.length; i += 12) if (rnd() < 0.85) tone += stroke(inner.slice(i, i + 10), { w: 0.5, seed: seed + 41 + i, over: 0.3, wobble: 0.15 });
	const shadow = resample(pts.map((p) => cam.proj(shadowOnDesk(p))), 1.5);
	const centre = pts.map(cam.proj);
	return {
		paper: pathOf([...left, ...[...right].reverse()], true),
		tone,
		ink: line(left, { w: 0.8, seed, over: 1 }) + line(right, { w: 1.4, seed: seed + 1, over: 1 }) + ticks,
		shadow: stroke(shadow, { w: Math.max(2.2, radius * 9), seed: seed + 2, wobble: 0.4, over: 0 }),
		centre: pathOf(centre),
		length: r1(lengthOf(centre)),
	};
}

/** Paints a cord: shadow first, then the tube; `cls` joins every part to a motion group. */
export function paintCord(p: Painter, c: ReturnType<typeof cord>, cls = '') {
	const extra = cls ? ' ' + cls : '';
	p.add('shadow-ink' + extra, c.shadow);
	p.add('cord' + extra, c.paper);
	p.add('ink' + extra, c.tone);
	p.add('ink' + extra, c.ink);
}

/** A small crocodile clip lying on a sheet, from its boot at `rear` to the open jaw tips at `tip`, in local units. */
export function clipOn(p: Painter, s: Sheet, rear: P, tip: P, seed: number, cls = '') {
	const extra = cls ? ' ' + cls : '';
	const len = Math.hypot(tip[0] - rear[0], tip[1] - rear[1]);
	const ax: P = [(tip[0] - rear[0]) / len, (tip[1] - rear[1]) / len];
	const nx: P = [-ax[1], ax[0]];
	const W = 5.2;
	const at = (u: number, v: number): P => [rear[0] + ax[0] * u * len + nx[0] * v * W, rear[1] + ax[1] * u * len + nx[1] * v * W];
	const on = (pts: [number, number][], up: number) => s.on(pts.map(([u, v]) => at(u, v)), up);
	const boot = on([[0, -0.5], [0.34, -0.62], [0.36, 0.62], [0, 0.5]], 0.3);
	const gap = (u: number) => 0.06 + Math.max(0, u - 0.55) * 0.75;
	const jaw = (side: number): [number, number][] => {
		const outer: [number, number][] = [[0.34, side * 0.5], [0.42, side * 0.95], [0.52, side * 0.98], [0.58, side * 0.62], [1, side * 0.42]];
		const teeth: [number, number][] = [];
		for (let k = 0; k <= 10; k++) {
			const u = 1 - k * 0.04;
			teeth.push([u, side * (gap(u) + (k % 2 ? 0 : 0.12))]);
		}
		return [...outer, ...teeth, [0.55, side * gap(0.55)], [0.34, side * 0.06]];
	};
	const upper = on(jaw(1), 0.34);
	const lower = on(jaw(-1), 0.3);
	const whole = hull([...boot, ...upper, ...lower]);
	const cast = s.on([at(0.04, -0.6), at(1, -0.5), at(1.03, -0.9), at(0.08, -1)].map(([u, v]) => [u + 0.6, v + 1.2] as P));
	p.add('shadow-wash' + extra, wash(cast, seed + 7, 0.4, 0.8));
	p.add('boot' + extra, pathOf(boot, true));
	p.add('hatch' + extra, hatch(boot, 0.4, 0.8, seed + 1, { cluster: 1, trim: 0 }));
	p.add('brass' + extra, pathOf(upper, true) + pathOf(lower, true));
	p.add('wash brass-wash' + extra, wash(hull([...upper, ...lower]), seed, 0.1, 0.6));
	p.add('hatch' + extra, hatch(lower, 1.2, 1, seed + 9, { cluster: 1, trim: 0.1 }));
	p.add(
		'ink' + extra,
		outline(boot, { w: 1, heavy: 0.6, centre: centreOf(whole), seed: seed + 2 }) +
			outline(upper, { w: 0.9, heavy: 0.5, centre: centreOf(whole), seed: seed + 3 }) +
			outline(lower, { w: 1, heavy: 0.7, centre: centreOf(whole), seed: seed + 4 }),
	);
	return s.at(rear[0] - ax[0] * 1.5, rear[1] - ax[1] * 1.5, 0.3);
}

/** A pen strike through a number on a sheet, as a centre path with its length for the draw-on. */
export function strikeOn(s: Sheet, x0: number, x1: number, baseline: number, size: number, seed: number) {
	const rnd = seeded(seed);
	const pts: P[] = Array.from({ length: 10 }, (_, i) => {
		const t = i / 9;
		return [x0 - 1.5 + t * (x1 - x0 + 3), baseline - size * 0.28 + (t - 0.5) * size * 0.35 + (rnd() - 0.5) * 0.6] as P;
	});
	const screen = s.on(pts, 0.02);
	return { d: pathOf(screen), length: r1(lengthOf(screen) + 2) };
}

/** World direction of a local sheet direction. */
export function along(s: Sheet, dx: number, dy: number): P {
	const o = s.at(0, 0);
	const q = s.at(dx * L, dy * L);
	const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
	return [(q[0] - o[0]) / l, (q[1] - o[1]) / l];
}

/** The world point at local (x, y) on a sheet's spec, before any camera exists. */
export function deskAt(spec: SheetSpec, x: number, y: number): Point3 {
	const u = (x - spec.w / 2) / L;
	const v = (y - spec.h / 2) / L;
	const cx = (spec.x + spec.w / 2) / L;
	const cy = (spec.y + spec.h / 2) / L;
	return [cx + Math.cos(spec.turn) * u - Math.sin(spec.turn) * v, cy + Math.sin(spec.turn) * u + Math.cos(spec.turn) * v, 0];
}

/** The world corners of a sheet, for fitting the camera. */
export const cornersOf = (spec: SheetSpec): Point3[] => [deskAt(spec, 0, 0), deskAt(spec, spec.w, 0), deskAt(spec, spec.w, spec.h), deskAt(spec, 0, spec.h)];

export { centreOf, ellipse, hatch, line, outline, pathOf, r1, roundRect, stroke, wash };
export type { P, Point3 };
