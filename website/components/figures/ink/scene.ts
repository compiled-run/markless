// A page drawn on a sheet on the desk, with the boxes, tags, cords and clips the desk figures share.
import { eyeOf, fitProjection, iso, perspectiveProjection, type Point3, type Projection } from '../kit/iso-kit.ts';
import { add3, cross3, dot3, lerp3, mul3, sub3, unit3 } from '../kit/lathe.ts';
import { bezier, centreOf, ellipse, jitter, LIGHT, matrixOf, roundRect, shadowOnDesk, TAU } from './desk.ts';
import { hatch, hull, lengthOf, line, outline, type P, pathOf, pool, r1, resample, seeded, stroke, wash } from './ink.ts';

export type { P, Point3 };
export { bezier, centreOf, ellipse, roundRect, TAU };

export const SHEET_W = 23;
export const SHEET_H = 14.8;
const SHEET_O: Point3 = [-1.6, -8.8, 0];
const FOLD = 1.74;
const CURL_R = 3.4;
const FOLD_K = Math.hypot(1 / SHEET_W, 1 / SHEET_H);
const FOLD_N: P = [1 / SHEET_W / FOLD_K, 1 / SHEET_H / FOLD_K];

const sheetLocal = (u: number, v: number): Point3 => {
	const e = (u / SHEET_W + v / SHEET_H - FOLD) / FOLD_K;
	if (e <= 0) return [u, v, 0];
	const th = e / CURL_R;
	const back = e - CURL_R * Math.sin(th);
	return [u - FOLD_N[0] * back, v - FOLD_N[1] * back, CURL_R * (1 - Math.cos(th))];
};

export const sheetAt = (u: number, v: number, lift = 0): Point3 => {
	const [a, b, z] = sheetLocal(u, v);
	return [SHEET_O[0] + a, SHEET_O[1] + b, z + 0.02 + lift];
};

/** A box standing on the desk: its near-left-bottom corner in sheet centimetres, its size along u, v and up. */
export interface Crate {
	u: number;
	v: number;
	w: number;
	d: number;
	h: number;
}

export interface SceneConfig {
	width: number;
	height: number;
	/** Extra world points the camera must fit, such as a box on the desk. */
	extra: Point3[];
	target: Point3;
	/** Degrees above the desk the camera looks down from; higher is flatter and crisper. */
	elevation?: number;
	/** Degrees the camera swings around the desk; 90 squares the sheet to the viewer. */
	azimuth?: number;
}

export function createScene({ width, height, extra, target, elevation = 60, azimuth = 94 }: SceneConfig) {
	const view = { azimuth, elevation, distance: 84, target };
	const a0 = (view.azimuth * Math.PI) / 180;
	const e0 = (view.elevation * Math.PI) / 180;
	const camera = perspectiveProjection({
		eye: [target[0] + Math.cos(a0) * Math.cos(e0) * view.distance, target[1] + Math.sin(a0) * Math.cos(e0) * view.distance, target[2] + Math.sin(e0) * view.distance],
		target,
	});
	const bounds: Point3[] = [sheetAt(0, -2.6), sheetAt(SHEET_W, -2.6), sheetAt(0, SHEET_H + 0.5), sheetAt(SHEET_W + 0.9, SHEET_H + 0.4), sheetAt(SHEET_W + 0.9, 4), ...extra];
	const PROJECTION: Projection = fitProjection(bounds, width, height - 30, { camera, pad: 2, headroom: 30 });
	const EYE = eyeOf(PROJECTION)!;
	const proj = (p: Point3): P => iso(p, PROJECTION);
	const projAll = (pts: Point3[]): P[] => pts.map(proj);
	const onSheet = (pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sheetAt(u, v, lift)));
	const CAST: P = (() => {
		const a = proj([0, 0, 0]);
		const b = proj([-LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2], 0]);
		return [b[0] - a[0], b[1] - a[1]];
	})();
	/** The page as an SVG matrix at one point: local millimetres in, screen out. */
	const sheetMatrix = (u: number, v: number) => matrixOf(proj(sheetAt(u, v)), proj(sheetAt(u + 0.1, v)), proj(sheetAt(u, v + 0.1)));

	function curlBand(e0: number, e1: number): P[] {
		const seg = (e: number): P[] => {
			const c = FOLD + e * FOLD_K;
			const a: P = [SHEET_W * (c - 1), SHEET_H];
			const b: P = [SHEET_W, SHEET_H * (c - 1)];
			return Array.from({ length: 16 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 15, a[1] + ((b[1] - a[1]) * i) / 15]);
		};
		return [...seg(e0), ...seg(e1).reverse()];
	}

	function deskTone(seed: number) {
		const band = (pts: Point3[], dx: number, dy: number): P[] => {
			const a = projAll(pts);
			const b = projAll(pts.map((p) => [p[0] + dx, p[1] + dy, 0] as Point3));
			return [...a, ...b.reverse()];
		};
		const near = Array.from({ length: 12 }, (_, i) => sheetAt(-0.4 + (i / 11) * SHEET_W * (FOLD - 1) * 0.9, SHEET_H, -0.02));
		const left = Array.from({ length: 10 }, (_, i) => sheetAt(0, 10 + (i / 9) * (SHEET_H - 10), -0.02));
		const nearBand = band(near, 0.4, 2.6);
		const leftBand = band(left, -1.8, 0.5);
		return (
			hatch(nearBand, -0.5, 2.4, seed, { cluster: 6, skip: 0.25, trim: 0.5 }) +
			hatch(nearBand.slice(0, nearBand.length / 2 + 4), 0.9, 3.4, seed + 1, { cluster: 4, skip: 0.45, trim: 0.6 }) +
			hatch(leftBand, -0.55, 2.8, seed + 2, { cluster: 5, skip: 0.35, trim: 0.55 })
		);
	}

	function sheetArt() {
		const n = 70;
		const edge: P[] = [];
		for (let i = 0; i < n; i++) edge.push([(i / n) * SHEET_W, 0]);
		for (let i = 0; i < n; i++) edge.push([SHEET_W, (i / n) * SHEET_H]);
		for (let i = 0; i < n; i++) edge.push([SHEET_W - (i / n) * SHEET_W, SHEET_H]);
		for (let i = 0; i < n; i++) edge.push([0, SHEET_H - (i / n) * SHEET_H]);
		const sil = onSheet(edge);
		const tipE = (2 - FOLD) / FOLD_K;
		const curlPts: Point3[] = [];
		for (let u = 0; u <= SHEET_W; u += 0.5) for (let v = 0; v <= SHEET_H; v += 0.5) if (u / SHEET_W + v / SHEET_H > FOLD) curlPts.push(sheetAt(u, v));
		curlPts.push(sheetAt(SHEET_W, SHEET_H));
		const curlShadow = hull([...curlPts.map((p) => proj(shadowOnDesk(p))), ...onSheet(curlBand(0, 0.01).slice(0, 16))]);
		const curlCore = hull([...curlPts.filter((p) => p[2] > 0.5).map((p) => proj(shadowOnDesk(p))), ...onSheet(curlBand(0.6, 0.61).slice(0, 16))]);
		const nearEdge = onSheet(Array.from({ length: 40 }, (_, i) => [(i / 39) * SHEET_W * (FOLD - 1), SHEET_H] as P));
		const rightEdge = onSheet(Array.from({ length: 30 }, (_, i) => [SHEET_W, (i / 29) * SHEET_H * (FOLD - 1)] as P));
		const contact = (pts: P[], dx: number, dy: number): P[] => [...pts, ...pts.map(([x, y]) => [x + dx, y + dy] as P).reverse()];
		const curlHatch = [0.35, 0.5, 0.62, 0.72].map((t, i) => line(onSheet(curlBand(tipE * t, tipE * t + 0.01).slice(0, 16)).slice(1, -1), { w: 0.55, seed: 300 + i, over: 1 }));
		const pencilGuides = [
			[sheetAt(-2.2, 0), sheetAt(SHEET_W + 2.6, 0)],
			[sheetAt(0, -1.8), sheetAt(0, SHEET_H + 2.4)],
			[sheetAt(SHEET_W, -2), sheetAt(SHEET_W, 6)],
			[sheetAt(-1.6, SHEET_H), sheetAt(8, SHEET_H)],
		].map(([a, b], i) => pathOf(jitter(resample(projAll([a!, b!]), 9), 40 + i, 0.9)));
		return {
			paper: pathOf(sil, true),
			ink: outline(sil, { w: 2.2, heavy: 1.9, centre: centreOf(sil), seed: 201 }),
			desk: deskTone(230),
			curl: {
				shadow: wash(curlShadow, 210, 2, 3),
				hatch: hatch(curlShadow, -0.35, 2.1, 211, { cluster: 5 }) + hatch(curlCore, 0.7, 1.4, 212, { cluster: 3 }) + hatch(curlCore, -1.1, 1.6, 213) + hatch(pool(curlCore, centreOf(curlCore), 0.6), 0.1, 1.3, 214, { cluster: 2 }),
				ink: curlHatch.join(''),
			},
			contact: hatch(contact(nearEdge, 1.2, 3.4), -0.7, 1.7, 220, { cluster: 1, trim: 0.1 }) + hatch(contact(rightEdge, 3.2, 1.6), -0.6, 1.9, 221, { cluster: 1, trim: 0.1 }),
			contactWash: wash(contact(nearEdge, 2, 5), 222, 0.5, 1.5) + wash(contact(rightEdge, 4, 2), 223, 0.5, 1.5),
			pencil: pencilGuides.join(''),
		};
	}

	/** The browser bar, the shop name and the coffee bag with its product line and price: the parts of the page no wire reaches. */
	function shopArt() {
		const bar = 1.7;
		const barPoly = onSheet([[0, 0], [SHEET_W, 0], [SHEET_W, bar], [0, bar]]);
		const dots = [0.75, 1.4, 2.05].map((u, i) => outline(onSheet(ellipse(u, 0.85, 0.22, 0.22, 18)), { w: 0.9, seed: 400 + i }));
		const url = onSheet(roundRect(3, 0.42, 11.6, 1.3, 0.4));
		const bagPoly: P[] = [[1.95, 5.0], [4.1, 5.0], [4.3, 8.05], [1.75, 8.05]];
		const crimp: P[] = Array.from({ length: 11 }, (_, i) => [1.95 + (i / 10) * 2.15, 4.72 + (i % 2) * 0.28]);
		const bag = onSheet(bagPoly);
		const bagLabel = onSheet(roundRect(2.2, 5.95, 3.85, 7.35, 0.2));
		const bean = onSheet(ellipse(3.02, 6.65, 0.38, 0.27, 18));
		const bagShade = onSheet([[3.55, 5.05], [4.1, 5.0], [4.3, 8.05], [3.7, 8.05]]);
		return {
			bar: { tone: hatch(barPoly, 0.12, 2.3, 410, { cluster: 6, skip: 0.2 }), rule: line(onSheet([[0, bar], [SHEET_W, bar]]), { w: 0.9, seed: 411 }), dots: dots.join(''), url: outline(url, { w: 0.85, seed: 412 }), urlMatrix: sheetMatrix(3.45, 1.12) },
			shopMatrix: sheetMatrix(1.4, 3.6),
			bag: {
				paper: pathOf(bag, true),
				wash: wash(bag, 430, 0.6, 2),
				shade: hatch(bagShade, 1.1, 1.5, 431, { cluster: 3, trim: 0.2 }),
				ink: outline(bag, { w: 1.2, heavy: 1, centre: centreOf(bag), seed: 432 }) + line(onSheet(crimp), { w: 0.8, seed: 433, over: 0 }) + line(onSheet([[1.93, 5.4], [4.13, 5.4]]), { w: 0.6, seed: 434, over: 0.2 }),
				label: pathOf(bagLabel, true),
				labelInk: outline(bagLabel, { w: 0.7, seed: 435 }) + outline(bean, { w: 0.8, seed: 436 }) + line(onSheet([[2.72, 6.58], [2.9, 6.7], [3.15, 6.6], [3.32, 6.72]]), { w: 0.6, seed: 437, over: 0 }),
				bean: pathOf(bean, true),
			},
			productMatrix: sheetMatrix(5, 6),
			priceMatrix: sheetMatrix(5, 7.6),
		};
	}

	/** A loose yellow wash over a live number on the page, with its darker pool and edge. */
	function spot(u: number, v: number, rx: number, ry: number, seed: number) {
		const poly = onSheet(ellipse(u, v, rx, ry, 30));
		return { wash: wash(poly, seed, 1.2, 4), pool: wash(pool(poly, centreOf(poly), 0.55), seed + 1, 0.5, 2.5), edge: wash(poly, seed + 2, 0.4, 3.5) };
	}

	/** A paper tag on a string, hung from `knot` and turned to face the viewer, with a matrix for its word. */
	function tag(knot: Point3, out: Point3, seed: number, loop = '') {
		const side = unit3(cross3(out, [0, 0, 1]));
		const tilt = unit3(add3(mul3(side, Math.cos(0.32)), [0, 0, -Math.sin(0.32)]));
		const down = unit3(add3(cross3(out, tilt), mul3(out, 0.15)));
		const o = add3(add3(knot, mul3(out, 0.6)), mul3(down, -1.6));
		const corner = (x: number, y: number): Point3 => add3(add3(o, mul3(tilt, x)), mul3(down, -y));
		const shape: P[] = [[0, 0], [2.6, 0], [3.2, 0.7], [2.6, 1.4], [0, 1.4]];
		const poly = projAll(shape.map(([x, y]) => corner(x, -y)));
		const hole = projAll(ellipse(2.62, -0.7, 0.16, 0.16, 14).map(([x, y]) => corner(x, y)));
		const holeC = proj(corner(2.62, -0.7));
		const knotP = proj(knot);
		const stringPts = resample([knotP, [(knotP[0] + holeC[0]) / 2 + 2, (knotP[1] + holeC[1]) / 2 + 4], holeC], 2);
		return {
			paper: pathOf(poly, true),
			shade: hatch(poly, 1.2, 2.2, seed, { cluster: 3, skip: 0.3, trim: 0.5 }),
			ink: outline(poly, { w: 1.2, heavy: 1, seed: seed + 1 }) + outline(hole, { w: 0.7, seed: seed + 2 }),
			string: loop + line(stringPts, { w: 0.8, seed: seed + 4, over: 1 }),
			matrix: matrixOf(proj(corner(0.3, -1.02)), proj(corner(0.4, -1.02)), proj(corner(0.3, -1.12))),
		};
	}

	/** An inked tube along world points: paper fill, lit and shade edges, twist ticks, and its hatched shadow on the desk. */
	function cord(points: Point3[], radius: number, seed: number) {
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
		const mid: P[] = [];
		const lows: P[][] = [[]];
		let ticks = '';
		let travelled = 0;
		let nextTick = 0.5;
		for (let i = 0; i < pts.length; i++) {
			const p = pts[i]!;
			if (i) travelled += Math.hypot(...sub3(p, pts[i - 1]!));
			const t = unit3(sub3(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!));
			const n = unit3(cross3(t, sub3(EYE, p)));
			const l = proj(add3(p, mul3(n, radius)));
			const r = proj(sub3(p, mul3(n, radius)));
			left.push(l);
			right.push(r);
			const side = dot3(n, LIGHT) > 0 ? -1 : 1;
			inner.push(proj(add3(p, mul3(n, side * radius * 0.62))));
			mid.push(proj(add3(p, mul3(n, side * radius * 0.3))));
			if (travelled >= nextTick && i > 2 && i < pts.length - 3) {
				nextTick += 1.1 + ((i * 37) % 7) * 0.12;
				const bulge = proj(add3(p, mul3(t, radius * 0.9)));
				const c = proj(p);
				const m: P = [bulge[0] * 2 - c[0], bulge[1] * 2 - c[1]];
				const arc: P[] = Array.from({ length: 7 }, (_, k) => {
					const s = (k / 6) * 0.75 + (i % 2) * 0.1;
					return [(1 - s) * (1 - s) * l[0] + 2 * s * (1 - s) * m[0] + s * s * r[0], (1 - s) * (1 - s) * l[1] + 2 * s * (1 - s) * m[1] + s * s * r[1]];
				});
				ticks += stroke(arc, { w: 0.42, seed: seed + 20 + i, over: 0, wobble: 0.1 });
			}
			if (p[2] < radius + 0.5) lows.at(-1)!.push(proj(shadowOnDesk(p, p[2] > 0.6 ? 0 : p[2] - radius)));
			else if (lows.at(-1)!.length) lows.push([]);
		}
		const broken = (run: P[], every: number, keep: number, s: number) => {
			const rnd = seeded(s);
			let d = '';
			for (let i = 0; i < run.length; i += every) d += rnd() < keep ? stroke(run.slice(i, i + every - 2), { w: radius > 0.15 ? 0.55 : 0.4, seed: s + i, over: 0.3, wobble: 0.15 }) : '';
			return d;
		};
		const centre = projAll(pts);
		const w = Math.max(3, radius * 14);
		let shadow = '';
		let shadowHatch = '';
		lows.filter((run) => run.length > 3).forEach((run, k) => {
			const sh = resample(run, 1.5);
			const nearSide: P[] = [];
			const far: P[] = [];
			sh.forEach((p, i) => {
				const a = sh[Math.max(0, i - 1)]!;
				const b = sh[Math.min(sh.length - 1, i + 1)]!;
				const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
				const nx = -(b[1] - a[1]) / l;
				const ny = (b[0] - a[0]) / l;
				const away = nx * CAST[0] + ny * CAST[1] > 0 ? 1 : -1;
				nearSide.push([p[0] - nx * away * w * 0.1, p[1] - ny * away * w * 0.1]);
				far.push([p[0] + nx * away * w, p[1] + ny * away * w]);
			});
			const under = [...nearSide, ...far.reverse()];
			shadow += stroke(sh, { w: Math.max(2.4, radius * 9), seed: seed + 2 + k, wobble: 0.4, over: 0 });
			shadowHatch += hatch(under, -0.6, 1.3, seed + 3 + k, { cluster: 3, skip: 0.15 }) + hatch(under, 0.5, 1.6, seed + 30 + k, { cluster: 2, skip: 0.3 });
		});
		return {
			paper: pathOf([...left, ...[...right].reverse()], true),
			tone: broken(inner, 14, 0.85, seed + 40) + broken(mid, 9, 0.45, seed + 60),
			ink: line(left, { w: 0.9, seed, over: 1 }) + line(right, { w: 1.5, seed: seed + 1, over: 1 }) + ticks,
			shadow,
			shadowHatch,
			centre: pathOf(centre),
			length: r1(lengthOf(centre)),
		};
	}

	/** A smooth path through sheet points, lying on the sheet or the desk beside it. */
	function alongSheet(pts: P[], lift: number): Point3[] {
		const out: Point3[] = [];
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[Math.max(0, i - 1)]!;
			const p1 = pts[i]!;
			const p2 = pts[i + 1]!;
			const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
			for (let k = 0; k < 10; k++) {
				const t = k / 10;
				const t2 = t * t;
				const t3 = t2 * t;
				const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
				out.push(sheetAt(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), lift));
			}
		}
		const last = pts.at(-1)!;
		out.push(sheetAt(last[0], last[1], lift));
		return out;
	}

	/** A small crocodile clip lying on the page, jaws open, from its boot at `rear` to the jaw tips at `tip`. */
	function crocodile(rear: P, tip: P, seed: number) {
		const L = Math.hypot(tip[0] - rear[0], tip[1] - rear[1]);
		const ax: P = [(tip[0] - rear[0]) / L, (tip[1] - rear[1]) / L];
		const nx: P = [-ax[1], ax[0]];
		const W = 0.62;
		const at = (s: number, t: number): P => [rear[0] + ax[0] * s * L + nx[0] * t * W, rear[1] + ax[1] * s * L + nx[1] * t * W];
		const on = (pts: [number, number][], lift: number) => onSheet(pts.map(([s, t]) => at(s, t)), lift);
		const boot = on([[0, -0.5], [0.34, -0.62], [0.36, 0.62], [0, 0.5]], 0.3);
		const gap = (s: number) => 0.06 + Math.max(0, s - 0.55) * 0.75;
		const jaw = (side: number): [number, number][] => {
			const outer: [number, number][] = [[0.34, side * 0.5], [0.42, side * 0.95], [0.52, side * 0.98], [0.58, side * 0.62], [1, side * 0.42]];
			const teeth: [number, number][] = [];
			for (let k = 0; k <= 10; k++) {
				const s = 1 - k * 0.04;
				teeth.push([s, side * (gap(s) + (k % 2 ? 0 : 0.12))]);
			}
			return [...outer, ...teeth, [0.55, side * gap(0.55)], [0.34, side * 0.06]];
		};
		const upper = on(jaw(1), 0.34);
		const lower = on(jaw(-1), 0.3);
		const pivot = onSheet(ellipse(...at(0.5, 0), 0.07, 0.07, 12), 0.36);
		const grip = (s: number) => on([[s, -0.55], [s + 0.01, 0.55]], 0.32);
		const whole = hull([...boot, ...upper, ...lower]);
		const cast = onSheet([at(0.04, -0.6), at(1, -0.5), at(1.03, -0.9), at(0.08, -1)].map(([u, v]) => [u + 0.06, v + 0.12] as P), 0);
		return {
			cast: wash(cast, seed + 7, 0.4, 0.8),
			paper: pathOf(upper, true) + pathOf(lower, true),
			boot: pathOf(boot, true),
			wash: wash(hull([...upper, ...lower]), seed, 0.1, 0.6),
			side: hatch(lower, 1.2, 1, seed + 9, { cluster: 1, trim: 0.1 }),
			bootTone: hatch(boot, 0.4, 0.8, seed + 1, { cluster: 1, trim: 0 }),
			ink:
				outline(boot, { w: 1, heavy: 0.6, centre: centreOf(whole), seed: seed + 2 }) +
				outline(upper, { w: 0.9, heavy: 0.5, centre: centreOf(whole), seed: seed + 3 }) +
				outline(lower, { w: 1, heavy: 0.7, centre: centreOf(whole), seed: seed + 4 }) +
				outline(pivot, { w: 0.7, seed: seed + 8 }) +
				[0.1, 0.18, 0.26].map((s, i) => stroke(grip(s), { w: 0.5, seed: seed + 10 + i, over: 0 })).join(''),
		};
	}

	/** A box standing on the desk beside the sheet: its visible faces, hatched by how much light they get, and its cast shadow. */
	function crate(c: Crate, seed: number) {
		const corner = (du: number, dv: number, z: number): Point3 => sheetAt(c.u + du, c.v + dv, z - 0.02);
		const { w, d, h } = c;
		const faces: { n: Point3; at: Point3; pts: Point3[]; angle: number; gap: number }[] = [
			{ n: [0, 0, 1], at: corner(w / 2, d / 2, h), pts: [corner(0, 0, h), corner(w, 0, h), corner(w, d, h), corner(0, d, h)], angle: 0, gap: 0 },
			{ n: [0, 1, 0], at: corner(w / 2, d, h / 2), pts: [corner(0, d, 0), corner(w, d, 0), corner(w, d, h), corner(0, d, h)], angle: 0.2, gap: 2.4 },
			{ n: [1, 0, 0], at: corner(w, d / 2, h / 2), pts: [corner(w, 0, 0), corner(w, d, 0), corner(w, d, h), corner(w, 0, h)], angle: 1.15, gap: 1.4 },
			{ n: [-1, 0, 0], at: corner(0, d / 2, h / 2), pts: [corner(0, 0, 0), corner(0, d, 0), corner(0, d, h), corner(0, 0, h)], angle: 1.25, gap: 3.2 },
		];
		const shown = faces.filter((f) => dot3(f.n, sub3(EYE, f.at)) > 0);
		const silhouette = hull(shown.flatMap((f) => projAll(f.pts)));
		const centre = centreOf(silhouette);
		const castPts: P[] = [];
		for (const du of [0, w]) for (const dv of [0, d]) for (const z of [0, h]) castPts.push(proj(shadowOnDesk(corner(du, dv, z))));
		const cast = hull(castPts);
		const frontMatrix = (fu: number, fz: number) => matrixOf(proj(corner(fu, d, fz)), proj(corner(fu + 0.1, d, fz)), proj(corner(fu, d, fz - 0.1)));
		return {
			cast: { wash: wash(cast, seed, 1.5, 3), hatch: hatch(cast, -0.5, 2.6, seed + 1, { cluster: 5, skip: 0.2 }) + hatch(pool(cast, centreOf(cast), 0.6), 0.6, 1.5, seed + 2, { cluster: 3 }) },
			paper: pathOf(silhouette, true),
			shade: shown.filter((f) => f.gap > 0).map((f, i) => hatch(projAll(f.pts), f.angle, f.gap, seed + 3 + i, { cluster: 4, skip: 0.25, trim: 0.4 })).join(''),
			ink: outline(silhouette, { w: 1.6, heavy: 1.4, centre, seed: seed + 6 }) + shown.map((f, i) => outline(projAll(f.pts), { w: 0.8, seed: seed + 7 + i })).join(''),
			pencil: pathOf(jitter(resample([proj(corner(-1, d, 0)), proj(corner(w + 1.2, d, 0))], 6), seed + 10, 0.7)) + pathOf(jitter(resample([proj(corner(0, d, -0.8)), proj(corner(0, d, h + 1.4))], 6), seed + 11, 0.7)),
			frontMatrix,
			point: (du: number, dv: number, z: number) => proj(corner(du, dv, z)),
			world: corner,
			poly: (pts: [number, number, number][]) => projAll(pts.map(([u, v, z]) => corner(u, v, z))),
		};
	}

	/** The margin note in the top left corner and its loose arrow to `aim`. */
	function note(aim: P, seed: number, label: P = [2, 18]) {
		const below = label[1] > aim[1];
		const from: P = [Math.max(label[0] + 40, Math.min(aim[0] - 60, label[0] + 200)), below ? label[1] - 16 : label[1] + 8];
		const dy = below ? -1 : 1;
		const arrow = resample([from, [from[0] + 8, from[1] + 22 * dy], [aim[0] - 22, aim[1] - 26 * dy], [aim[0] - 5, aim[1] - 6 * dy]], 3);
		const smooth = arrow.map((p, i, all) => (i === 0 || i === all.length - 1 ? p : ([(all[i - 1]![0] + p[0] + all[i + 1]![0]) / 3, (all[i - 1]![1] + p[1] + all[i + 1]![1]) / 3] as P)));
		const end = smooth.at(-1)!;
		const prev = smooth.at(-4)!;
		const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
		const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
		return {
			x: r1(label[0]),
			y: r1(label[1]),
			arrow: line(smooth, { w: 1.3, seed, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: seed + 1, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: seed + 2, over: 0.5 }),
		};
	}

	return { proj, projAll, onSheet, sheetMatrix, sheetArt, shopArt, spot, cord, alongSheet, crocodile, crate, tag, note };
}
