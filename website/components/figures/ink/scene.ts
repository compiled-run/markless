// A shop page drawn on a sheet on the desk, with the jar, boxes, cords and clips the wired figures share.
import { eyeOf, fitProjection, iso, perspectiveProjection, type Point3, type Projection } from '../kit/iso-kit.ts';
import { add3, cross3, dot3, lerp3, mul3, sub3, unit3 } from '../kit/lathe.ts';
import { bezier, centreOf, ellipse, jitter, LIGHT, matrixOf, roundRect, shadowOnDesk, TAU } from './desk.ts';
import { clipTo, hatch, hull, lengthOf, line, outline, type P, pathOf, pool, r1, resample, seeded, stroke, wash } from './ink.ts';

export type { P, Point3 };
export { bezier, centreOf, ellipse, roundRect, TAU };

export const SHEET_W = 23;
export const SHEET_H = 14.8;
const SHEET_O: Point3 = [-1.6, -8.8, 0];
const FOLD = 1.74;
const CURL_R = 3.4;
const FOLD_K = Math.hypot(1 / SHEET_W, 1 / SHEET_H);
const FOLD_N: P = [1 / SHEET_W / FOLD_K, 1 / SHEET_H / FOLD_K];

export const JAR: P = [-5.6, -2.2];
const JS = 0.86;
const JAR_PROFILE: P[] = (
	[
		[0, 2.5],
		[0.12, 2.82],
		[0.45, 3.04],
		[1, 3.12],
		[5.9, 3.12],
		[6.6, 3.02],
		[7.2, 2.74],
		[7.65, 2.42],
		[8.5, 2.36],
	] as P[]
).map(([z, r]) => [z * JS, r * JS] as P);
export const LID = { z0: 8.3 * JS, z1: 9.55 * JS, r: 2.62 * JS };

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
	/** Draw the bean jar on the left of the sheet. */
	jar: boolean;
	/** Extra world points the camera must fit, such as a box on the desk. */
	extra: Point3[];
	target: Point3;
}

export function createScene({ width, height, jar: withJar, extra, target }: SceneConfig) {
	const view = { azimuth: 94, elevation: 60, distance: 84, target };
	const a0 = (view.azimuth * Math.PI) / 180;
	const e0 = (view.elevation * Math.PI) / 180;
	const camera = perspectiveProjection({
		eye: [target[0] + Math.cos(a0) * Math.cos(e0) * view.distance, target[1] + Math.sin(a0) * Math.cos(e0) * view.distance, target[2] + Math.sin(e0) * view.distance],
		target,
	});
	const bounds: Point3[] = [sheetAt(0, -2.6), sheetAt(SHEET_W, -2.6), sheetAt(0, SHEET_H + 0.5), sheetAt(SHEET_W + 0.9, SHEET_H + 0.4), sheetAt(SHEET_W + 0.9, 4), ...extra];
	if (withJar)
		for (let k = 0; k < 24; k++) {
			const a = (k * TAU) / 24;
			const ring = (r: number, z: number): Point3 => [JAR[0] + Math.cos(a) * r, JAR[1] + Math.sin(a) * r, z];
			bounds.push(ring(JAR_PROFILE[4]![1], 0), ring(LID.r, LID.z1));
		}
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

	/** A cart icon at the top right of the page, with its round badge. */
	function cartIcon(badge: { u: number; v: number; r: number }) {
		const basket = onSheet([[17.45, 4.3], [19.35, 4.3], [19.05, 5.4], [17.75, 5.4]]);
		const disc = onSheet(ellipse(badge.u, badge.v, badge.r, badge.r * 0.95, 30));
		return {
			ink:
				line(onSheet([[16.8, 3.85], [17.25, 3.85], [17.45, 4.3]]), { w: 1.1, seed: 420, over: 0.3 }) +
				outline(basket, { w: 1.1, heavy: 0.8, centre: centreOf(basket), seed: 421 }) +
				line(onSheet([[17.6, 4.85], [19.2, 4.85]]), { w: 0.6, seed: 422, over: 0 }) +
				line(onSheet([[18.05, 4.32], [18.2, 5.38]]), { w: 0.6, seed: 427, over: 0 }) +
				line(onSheet([[18.7, 4.32], [18.6, 5.38]]), { w: 0.6, seed: 428, over: 0 }) +
				line(onSheet([[17.75, 5.4], [17.6, 5.75], [19.15, 5.75]]), { w: 1, seed: 429, over: 0.3 }) +
				[17.85, 18.95].map((u, i) => outline(onSheet(ellipse(u, 6.02, 0.19, 0.19, 14)), { w: 1, seed: 423 + i })).join(''),
			badge: { paper: pathOf(disc, true), wash: wash(disc, 425, 0.6, 2), ink: outline(disc, { w: 1, heavy: 0.6, centre: centreOf(disc), seed: 426 }), matrix: sheetMatrix(badge.u, badge.v + 0.29), oldMatrix: sheetMatrix(badge.u - 1.55, badge.v - 0.2) },
		};
	}

	/** A raised pink button lying on the page, with the offset it sinks by when pressed. */
	function pageButton(b: { u0: number; v0: number; u1: number; v1: number }, seed: number) {
		const { u0, v0, u1, v1 } = b;
		const poly = onSheet(roundRect(u0, v0, u1, v1, Math.min(0.4, (v1 - v0) / 2.2)), 0.12);
		const side = onSheet([[u1, v0 + 0.3], [u1, v1], [u0 + 0.3, v1], [u0 + 0.3, v1 + 0.2], [u1 + 0.2, v1 + 0.2], [u1 + 0.2, v0 + 0.3]]);
		const a = proj(sheetAt((u0 + u1) / 2, v0 + 0.5, 0.12));
		const s = proj(sheetAt((u0 + u1) / 2 + 0.08, v0 + 0.6, 0));
		return {
			paper: pathOf(poly, true),
			wash: wash(poly, seed, 1.5, 3.5),
			pool: wash(pool(poly, poly[Math.min(8, poly.length - 1)]!, 0.5), seed + 1, 0.6, 2),
			side: hatch(side, 0.95, 1.4, seed + 2, { cluster: 1 }) + outline(side, { w: 0.8, seed: seed + 3 }),
			ink: outline(poly, { w: 1.5, heavy: 1.3, centre: centreOf(poly), seed: seed + 4 }),
			matrix: sheetMatrix((u0 + u1) / 2, (v0 + v1) / 2 + 0.32),
			sink: `--sink-x:${r1(s[0] - a[0])}px;--sink-y:${r1(s[1] - a[1] + 0.8)}px`,
		};
	}

	/** A loose yellow wash over a live number on the page, with its darker pool and edge. */
	function spot(u: number, v: number, rx: number, ry: number, seed: number) {
		const poly = onSheet(ellipse(u, v, rx, ry, 30));
		return { wash: wash(poly, seed, 1.2, 4), pool: wash(pool(poly, centreOf(poly), 0.55), seed + 1, 0.5, 2.5), edge: wash(poly, seed + 2, 0.4, 3.5) };
	}

	/** One pen stroke that crosses out a number, in the text's own millimetres, with its length for the draw-on. */
	function strike(x: number, k: number, seed: number) {
		const rnd = seeded(seed);
		const pts: P[] = [
			[x - 1.6 * k, (-1.6 + rnd()) * k],
			[x + 5 * k, (-3.4 + rnd() * 0.6) * k],
			[x + 12.4 * k, (-6.4 + rnd()) * k],
		];
		return { d: `M${r1(pts[0]![0])} ${r1(pts[0]![1])}Q${r1(pts[1]![0])} ${r1(pts[1]![1])} ${r1(pts[2]![0])} ${r1(pts[2]![1])}`, length: r1(lengthOf(pts) + 1) };
	}

	const radiusAt = (z: number) => {
		for (let i = 1; i < JAR_PROFILE.length; i++) {
			const [z0, r0] = JAR_PROFILE[i - 1]!;
			const [z1, rv] = JAR_PROFILE[i]!;
			if (z <= z1) {
				const t = (z - z0) / (z1 - z0 || 1);
				return r0 + (rv - r0) * t * t * (3 - 2 * t);
			}
		}
		return JAR_PROFILE.at(-1)![1];
	};
	const jarPoint = (a: number, z: number, r = radiusAt(z)): Point3 => [JAR[0] + Math.cos(a) * r, JAR[1] + Math.sin(a) * r, z];
	const facing = (a: number, z: number) => dot3([Math.cos(a), Math.sin(a), 0], sub3(EYE, jarPoint(a, z))) > 0;
	const litness = (a: number) => dot3([Math.cos(a), Math.sin(a), 0.1], LIGHT);

	function ringArcs(z: number, r: number, steps = 120) {
		const front: P[] = [];
		const back: P[] = [];
		let start = 0;
		while (facing((start / steps) * TAU, z) && start < steps) start++;
		while (!facing((start / steps) * TAU, z) && start < steps * 2) start++;
		for (let i = 0; i <= steps; i++) {
			const a = ((start + i) / steps) * TAU;
			(facing(a, z) ? front : back).push(proj(jarPoint(a, z, r)));
		}
		return { front, back, all: Array.from({ length: steps }, (_, i) => proj(jarPoint((i / steps) * TAU, z, r))) };
	}

	function contours(z0: number, z1: number, r: (z: number) => number, count = 50) {
		const left: P[] = [];
		const right: P[] = [];
		for (let i = 0; i <= count; i++) {
			const z = z0 + ((z1 - z0) * i) / count;
			const ring = Array.from({ length: 180 }, (_, k) => proj(jarPoint((k / 180) * TAU, z, r(z))));
			left.push(ring.reduce((m, p) => (p[0] < m[0] ? p : m)));
			right.push(ring.reduce((m, p) => (p[0] > m[0] ? p : m)));
		}
		return { left, right };
	}

	function formStrokes(z0: number, z1: number, r: (z: number) => number, below: number, gap: number, seed: number, reach = 0.8): string {
		const rnd = seeded(seed);
		let d = '';
		let left = 0;
		let tilt = 0;
		for (let a = rnd() * gap; a < TAU; ) {
			if (left <= 0) {
				left = 2 + Math.floor(rnd() * 4);
				tilt = (rnd() - 0.5) * 0.05;
				a += gap * rnd();
			}
			left--;
			const lim = below + (rnd() - 0.5) * 0.12;
			if (litness(a) < lim && facing(a, (z0 + z1) / 2)) {
				const top = z1 - (z1 - z0) * rnd() * rnd() * 0.5;
				const bottom = z0 + (z1 - z0) * (1 - reach) * rnd();
				d += pathOf(projAll(Array.from({ length: 12 }, (_, i) => {
					const z = bottom + ((top - bottom) * i) / 11;
					return jarPoint(a + tilt * i, z, r(z) + 0.01);
				})));
			}
			a += gap * (0.6 + rnd() * 0.7);
		}
		return d;
	}

	function ringStrokes(z0: number, z1: number, r: (z: number) => number, below: number, gap: number, seed: number): string {
		const rnd = seeded(seed);
		let d = '';
		for (let z = z0 + gap * rnd(); z < z1; z += gap * (0.7 + rnd() * 0.6)) {
			let run: P[] = [];
			const lim = below + (rnd() - 0.5) * 0.1;
			const flush = () => {
				if (run.length > 2) d += pathOf(run.slice(Math.floor(rnd() * 3), run.length - Math.floor(rnd() * 3)));
				run = [];
			};
			for (let i = 0; i <= 160; i++) {
				const a = (i / 160) * TAU;
				if (facing(a, z) && litness(a) < lim) run.push(proj(jarPoint(a, z, r(z) + 0.01)));
				else flush();
			}
			flush();
		}
		return d;
	}

	function jarArt() {
		const body = contours(0, LID.z0 + 0.1, radiusAt);
		const lidR = (z: number) => LID.r - (z > LID.z1 - 0.18 ? (z - (LID.z1 - 0.18)) * 1.2 : 0);
		const lid = contours(LID.z0, LID.z1, lidR, 16);
		const base = ringArcs(0.02, radiusAt(0.02) + 0.05);
		const belly = ringArcs(0.5, radiusAt(0.5));
		const shoulder = ringArcs(6.9 * JS, radiusAt(6.9 * JS));
		const neck = ringArcs(LID.z0 - 0.35, radiusAt(LID.z0 - 0.35));
		const lidBottom = ringArcs(LID.z0, LID.r);
		const lidTop = ringArcs(LID.z1, LID.r - 0.2);
		const lidRim = ringArcs(LID.z1 - 0.18, LID.r);
		const silhouette = hull([...body.left, ...body.right, ...lid.left, ...lid.right, ...base.all, ...lidTop.all]);
		const centre = centreOf(silhouette);
		const shadowPts: P[] = [];
		for (let z = 0; z <= LID.z1; z += 0.5) for (let k = 0; k < 48; k++) shadowPts.push(proj(shadowOnDesk(jarPoint((k / 48) * TAU, z, z > LID.z0 ? LID.r : radiusAt(z)))));
		const shadow = hull(shadowPts);
		const lidShadow = hull(Array.from({ length: 96 }, (_, k) => proj(shadowOnDesk(jarPoint((k / 48) * TAU, k < 48 ? LID.z0 : LID.z1, LID.r)))));
		const footRing = Array.from({ length: 64 }, (_, k) => proj(jarPoint((k / 64) * TAU, 0, JAR_PROFILE[4]![1] + 0.04)));
		const reach = sub3(proj(shadowOnDesk(jarPoint(0, 1.6))) as unknown as Point3, proj(jarPoint(0, 1.6, radiusAt(1.6))) as unknown as Point3) as unknown as P;
		const foot = hull([...footRing, ...footRing.map((p) => [p[0] + reach[0] * 0.35, p[1] + reach[1] * 0.35] as P)]);
		const knurl: string[] = [];
		for (let k = 0; k < 64; k++) {
			const a = (k / 64) * TAU;
			if (facing(a, LID.z0 + 0.5)) knurl.push(pathOf(projAll([jarPoint(a, LID.z0 + 0.12, LID.r + 0.01), jarPoint(a, LID.z1 - 0.26, LID.r + 0.01)])));
		}
		const glints = [
			[2.75, 1.4, 5.6],
			[2.95, 2.1, 4.4],
			[2.6, 6.9, 7.4],
		].map(([a, z0, z1], i) => {
			const lo = z0! * JS;
			const hi = z1! * JS;
			return line(projAll(Array.from({ length: 10 }, (_, k) => jarPoint(a!, lo + ((hi - lo) * k) / 9, radiusAt(lo + ((hi - lo) * k) / 9) + 0.02))), { w: 0.6, seed: 600 + i, over: 0.6 });
		});
		const near: P[] = [];
		for (let z = 0; z <= 3.2; z += 0.4) for (let k = 0; k < 48; k++) near.push(proj(shadowOnDesk(jarPoint((k / 48) * TAU, z))));
		const core = hull(near);
		return {
			shadow: {
				wash: wash(shadow, 610, 2, 5),
				lidWash: wash(lidShadow, 611, 1.5, 3),
				hatch: hatch(shadow, -0.45, 3.2, 612, { cluster: 5, skip: 0.15 }) + hatch(lidShadow, 0.5, 1.7, 613, { cluster: 3 }) + hatch(lidShadow, -0.6, 2.1, 614),
				foot: hatch(foot, -0.5, 1.5, 615, { cluster: 2, trim: 0.3 }),
				core: hatch(core, 0.55, 1.5, 616, { cluster: 4, skip: 0.1 }) + hatch(core, -1.2, 1.5, 617, { cluster: 3, skip: 0.2 }),
			},
			backInk: line(base.back, { w: 0.7, seed: 620, over: 0.5 }) + line(shoulder.back, { w: 0.5, seed: 621, over: 0.5 }) + line(neck.back, { w: 0.6, seed: 622, over: 0.5 }),
			glass: {
				paper: pathOf(silhouette, true),
				tone: formStrokes(0.3, 5.6, radiusAt, 0.05, 0.11, 630, 0.9) + formStrokes(0.15, 1.8, radiusAt, -0.2, 0.08, 631),
				ink:
					line(body.left, { w: 1.5, seed: 632, over: 2.5 }) +
					line(body.right, { w: 2.4, heavy: 1, centre, seed: 633, over: 2.5 }) +
					line(base.front, { w: 2.2, heavy: 1.4, centre, seed: 634, over: 3 }) +
					line(belly.front, { w: 0.7, seed: 635, over: 2 }) +
					line(shoulder.front, { w: 0.8, seed: 636, over: 2 }) +
					line(neck.front, { w: 1.1, seed: 637, over: 2 }),
				glints: glints.join(''),
			},
			lid: {
				paper: pathOf(hull([...lid.left, ...lid.right, ...lidTop.all, ...lidBottom.front]), true),
				wash: wash(hull([...lid.right.slice(2), ...lidBottom.front.slice(Math.floor(lidBottom.front.length / 2))]), 640, 1, 2),
				hatch: formStrokes(LID.z0 + 0.05, LID.z1 - 0.2, lidR, 0.32, 0.07, 641, 1) + formStrokes(LID.z0 + 0.05, LID.z1 - 0.2, lidR, -0.05, 0.05, 642, 1),
				cross: ringStrokes(LID.z0 + 0.08, LID.z1 - 0.25, lidR, 0.02, 0.16, 643),
				knurl: knurl.join(''),
				ink: outline(lidTop.all, { w: 1.3, seed: 644 }) + line(lidRim.front, { w: 0.8, seed: 645 }) + line(lidBottom.front, { w: 2.2, heavy: 1.2, centre, seed: 646, over: 2 }) + line(lid.left, { w: 1.4, seed: 647 }) + line(lid.right, { w: 2.2, seed: 648 }),
			},
			pencil: [pathOf(jitter(resample([proj([JAR[0], JAR[1], 10]), proj([JAR[0], JAR[1], -1.4])], 8), 650, 0.8)), pathOf(jitter(base.all, 651, 0.6), true), pathOf(jitter(ringArcs(LID.z1, LID.r + 0.4).all, 652, 0.7), true)].join(''),
		};
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

	function jarTag() {
		const a = 1.85;
		const knot = jarPoint(a, 7.75 * JS, radiusAt(7.75 * JS) + 0.05);
		const loop = line(ringArcs(7.75 * JS, radiusAt(7.75 * JS) + 0.06).front, { w: 0.8, seed: 703 });
		return tag(knot, unit3([Math.cos(a), Math.sin(a), 0]), 700, loop);
	}

	const BEAN = [0.64, 0.46, 0.34] as const;

	/** Beans settled in a pile on the jar's floor, the first ones toward the front, each with the distance it falls from the lid. */
	function beans(count: number) {
		const rnd = seeded(800);
		const placed: Point3[] = [];
		const toward = unit3([EYE[0] - JAR[0], EYE[1] - JAR[1], 0]);
		for (let i = 0; i < count; i++) {
			let best: Point3 | undefined;
			let bestScore = Infinity;
			for (let t = 0; t < 40; t++) {
				const a = rnd() * TAU;
				const r = Math.sqrt(rnd()) * 2.05;
				const x = JAR[0] + Math.cos(a) * r;
				const y = JAR[1] + Math.sin(a) * r;
				let z = BEAN[2] + 0.04;
				for (const q of placed) {
					const d = Math.hypot(q[0] - x, q[1] - y);
					if (d < 1.2) z = Math.max(z, q[2] + Math.sqrt(1.2 * 1.2 - d * d) * 0.7);
				}
				const score = z * 3 - ((x - JAR[0]) * toward[0] + (y - JAR[1]) * toward[1]) * 0.9 + rnd() * 0.3;
				if (score < bestScore) {
					bestScore = score;
					best = [x, y, z];
				}
			}
			placed.push(best!);
		}
		return placed.map((c, i) => {
			const r = seeded(900 + i);
			const yaw = r() * TAU;
			const ax: Point3 = unit3([Math.cos(yaw), Math.sin(yaw), (r() - 0.5) * 0.4]);
			const ay = unit3(cross3(unit3([(r() - 0.5) * 0.7, (r() - 0.5) * 0.7, 1]), ax));
			const az = unit3(cross3(ax, ay));
			const at = (u: number, v: number, w: number): Point3 => add3(add3(add3(c, mul3(ax, u)), mul3(ay, v)), mul3(az, w));
			const surf: P[] = [];
			const dark: P[] = [];
			for (let k = 0; k < 18; k++)
				for (let j = 0; j < 9; j++) {
					const th = (k / 18) * TAU;
					const ph = (j / 8) * Math.PI - Math.PI / 2;
					const q = proj(at(Math.cos(ph) * Math.cos(th) * BEAN[0], Math.cos(ph) * Math.sin(th) * BEAN[1], Math.sin(ph) * BEAN[2]));
					surf.push(q);
					const n = unit3(add3(add3(mul3(ax, (Math.cos(ph) * Math.cos(th)) / BEAN[0]), mul3(ay, (Math.cos(ph) * Math.sin(th)) / BEAN[1])), mul3(az, Math.sin(ph) / BEAN[2])));
					if (dot3(n, LIGHT) < 0.25) dark.push(q);
				}
			const sil = hull(surf);
			const crease = (off: number) =>
				projAll(Array.from({ length: 11 }, (_, k) => {
					const u = -BEAN[0] * 0.78 + (BEAN[0] * 1.56 * k) / 10;
					return at(u, Math.sin((u / (BEAN[0] * 0.78)) * Math.PI) * 0.07 + off, BEAN[2] * Math.sqrt(Math.max(0, 1 - (u / BEAN[0]) ** 2)) * 0.97);
				}));
			const shade = dark.length > 2 ? clipTo(hull(dark), sil) : [];
			const top = proj(at(0, 0, 0));
			const lifted = proj(add3(c, [0, 0, LID.z0 - 0.4 - c[2]]));
			return {
				key: i,
				fill: pathOf(sil, true),
				ink: outline(sil, { w: 0.9, heavy: 0.9, seed: 950 + i, over: 0.6 }) + stroke(crease(0), { w: 1, seed: 990 + i, over: 0.2, wobble: 0.15 }) + stroke(crease(0.06), { w: 0.45, seed: 1020 + i, over: 0, wobble: 0.1 }),
				hatch: hatch(shade, 0.8 + (i % 3) * 0.3, 1.1, 1050 + i, { cluster: 1, trim: 0.1, bow: 0.3 }),
				drop: r1(lifted[1] - top[1]),
			};
		});
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

	/** A small knot where a branch leaves a wire. */
	function splice(at: P, lift: number, seed: number) {
		const knot = onSheet(ellipse(at[0], at[1], 0.42, 0.34, 18), lift);
		return { paper: pathOf(knot, true), ink: outline(knot, { w: 1, heavy: 0.6, centre: centreOf(knot), seed }) + hatch(knot, 0.9, 1, seed + 1, { cluster: 1, trim: 0 }) };
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

	/** An index card lying on the desk, in sheet centimetres: its corner at (u, v), turned by `turn` radians. */
	function card(c: { u: number; v: number; w: number; h: number; turn: number }, seed: number) {
		const cu = Math.cos(c.turn);
		const su = Math.sin(c.turn);
		const at = (x: number, y: number): P => [c.u + x * cu - y * su, c.v + x * su + y * cu];
		const lift = 0.04;
		const world = (x: number, y: number, z = lift) => {
			const [u, v] = at(x, y);
			return sheetAt(u, v, z);
		};
		const pt = (x: number, y: number) => proj(world(x, y));
		const n = 24;
		const edge: P[] = [];
		for (let i = 0; i < n; i++) edge.push(pt((i / n) * c.w, 0));
		for (let i = 0; i < n; i++) edge.push(pt(c.w, (i / n) * c.h));
		for (let i = 0; i < n; i++) edge.push(pt(c.w - (i / n) * c.w, c.h));
		for (let i = 0; i < n; i++) edge.push(pt(0, c.h - (i / n) * c.h));
		const castPts = [world(0, 0, 0.3), world(c.w, 0, 0.3), world(c.w, c.h, 0.3), world(0, c.h, 0.3)].map((p) => proj(shadowOnDesk(p)));
		const cast = hull([...castPts, ...edge]);
		const rule = (y: number, i: number) => line([pt(0.25, y), pt(c.w - 0.25, y)], { w: 0.45, seed: seed + 10 + i, over: 0 });
		const ruled: string[] = [];
		for (let y = 2.7, i = 0; y < c.h - 0.3; y += 1.4, i++) ruled.push(rule(y, i));
		return {
			cast: wash(cast, seed, 0.8, 2),
			castHatch: hatch(cast, -0.5, 2.2, seed + 1, { cluster: 4, skip: 0.3, trim: 0.4 }),
			paper: pathOf(edge, true),
			ink: outline(edge, { w: 1.4, heavy: 1.1, centre: centreOf(edge), seed: seed + 2 }),
			header: line([pt(0.2, 1.25), pt(c.w - 0.2, 1.25)], { w: 0.8, seed: seed + 3, over: 0.2 }),
			rules: ruled.join(''),
			/** An SVG matrix at a point on the card whose local unit is a millimetre. */
			matrix: (x: number, y: number) => matrixOf(pt(x, y), pt(x + 0.1, y), pt(x, y + 0.1)),
			point: pt,
			world,
			/** A quick pen tick at (x, y) on the card, with its length for the draw-on. */
			tick: (x: number, y: number, k: number, s: number) => {
				const pts = [pt(x, y - 0.1 * k), pt(x + 0.18 * k, y + 0.12 * k), pt(x + 0.55 * k, y - 0.35 * k)];
				return { d: pathOf(pts), length: r1(lengthOf(pts) + 1), ink: stroke(pts, { w: 1.6, seed: s, over: 0.2 }) };
			},
		};
	}

	/** A round button in the browser bar with a circular arrow, raised off the page so it can sink. */
	function reload(u: number, v: number, r: number, seed: number) {
		const disc = onSheet(ellipse(u, v, r, r, 30), 0.1);
		const side = onSheet(ellipse(u + 0.08, v + 0.1, r, r, 30));
		const arc = onSheet(
			Array.from({ length: 18 }, (_, i) => {
				const a = -0.9 + (i / 17) * 4.9;
				return [u + Math.cos(a) * r * 0.55, v + Math.sin(a) * r * 0.55] as P;
			}),
			0.12,
		);
		const tip = arc.at(-1)!;
		const before = arc.at(-4)!;
		const ang = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
		const head = (sg: number): P[] => [[tip[0] - Math.cos(ang + sg) * 3.2, tip[1] - Math.sin(ang + sg) * 3.2], tip];
		const a = proj(sheetAt(u, v, 0.1));
		const b = proj(sheetAt(u + 0.06, v + 0.08, 0));
		return {
			side: pathOf(side, true),
			paper: pathOf(disc, true),
			wash: wash(disc, seed, 0.8, 1.6),
			ink: outline(disc, { w: 1.1, heavy: 0.8, seed: seed + 1 }) + line(arc, { w: 0.9, seed: seed + 2, over: 0 }) + stroke(head(0.5), { w: 0.9, seed: seed + 3, over: 0.3 }) + stroke(head(-0.5), { w: 0.9, seed: seed + 4, over: 0.3 }),
			sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`,
		};
	}

	/** A dashed pencil pocket on the page: the hole a value lands in. */
	function hole(u0: number, v0: number, u1: number, v1: number, seed: number) {
		const box = onSheet(roundRect(u0, v0, u1, v1, 0.18), 0.02);
		let dashes = '';
		const pts = resample([...box, box[0]!], 2.2);
		for (let i = 0; i + 1 < pts.length; i += 2) dashes += stroke([pts[i]!, pts[i + 1]!], { w: 0.9, seed: seed + i, over: 0, wobble: 0.1 });
		return { paper: pathOf(box, true), dashes };
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

	return { proj, projAll, onSheet, sheetMatrix, sheetArt, shopArt, cartIcon, pageButton, spot, strike, jarArt, jarTag, jarPoint, radiusAt, beans, cord, alongSheet, crocodile, splice, crate, card, reload, hole, tag, note };
}
