// A sheet of paper drawn as a web page, a jar of beans holding the count, and the wires between them, inked in perspective.
import { eyeOf, fitProjection, iso, perspectiveProjection, type Point3, type Projection } from '../kit/iso-kit.ts';
import { add3, cross3, dot3, lerp3, mul3, sub3, unit3 } from '../kit/lathe.ts';
import { SLOTS } from './model.ts';
import { clipTo, hatch, hull, lengthOf, line, outline, type P, pathOf, pool, r1, resample, seeded, stroke, wash } from './ink.ts';

export const WIDTH = 680;
export const HEIGHT = 430;
const TAU = Math.PI * 2;
const LIGHT = unit3([-0.5, -0.45, 0.78]);

const SHEET_W = 23;
const SHEET_H = 14.8;
const SHEET_O: Point3 = [-1.6, -8.8, 0];
const TURN = 0;
const SU: Point3 = [Math.cos(TURN), Math.sin(TURN), 0];
const SV: Point3 = [-Math.sin(TURN), Math.cos(TURN), 0];
const FOLD = 1.74;
const CURL_R = 3.4;
const FOLD_K = Math.hypot(1 / SHEET_W, 1 / SHEET_H);
const FOLD_N: P = [1 / SHEET_W / FOLD_K, 1 / SHEET_H / FOLD_K];

const JAR: P = [-5.6, -2.2];
const JS = 0.86;
const JAR_PROFILE: P[] = ([
	[0, 2.5],
	[0.12, 2.82],
	[0.45, 3.04],
	[1, 3.12],
	[5.9, 3.12],
	[6.6, 3.02],
	[7.2, 2.74],
	[7.65, 2.42],
	[8.5, 2.36],
] as P[]).map(([z, r]) => [z * JS, r * JS] as P);
const LID = { z0: 8.3 * JS, z1: 9.55 * JS, r: 2.62 * JS };

/** Where the cart line starts on the page, in centimetres from the sheet's top-left corner. */
export const ROW = { u: 1.4, v: 9.75 };
const NOW_U = ROW.u + SLOTS[1] / 10;
/** The cart badge's centre and radius on the page header. */
export const BADGE = { u: 19.5, v: 3.95, r: 0.62 };
const BUTTON = { u0: 1.3, v0: 10.6, u1: 9, v1: 12.9 };
/** Where the branch to the cart line leaves the main wire, in page centimetres along the desk behind the sheet. */
const BRANCH_U = 15.75;

const sheetLocal = (u: number, v: number): Point3 => {
	const e = (u / SHEET_W + v / SHEET_H - FOLD) / FOLD_K;
	if (e <= 0) return [u, v, 0];
	const th = e / CURL_R;
	const back = e - CURL_R * Math.sin(th);
	return [u - FOLD_N[0] * back, v - FOLD_N[1] * back, CURL_R * (1 - Math.cos(th))];
};

export const sheetAt = (u: number, v: number, lift = 0): Point3 => {
	const [a, b, z] = sheetLocal(u, v);
	return [SHEET_O[0] + SU[0] * a + SV[0] * b, SHEET_O[1] + SU[1] * a + SV[1] * b, z + 0.02 + lift];
};

const VIEW = { azimuth: 94, elevation: 60, distance: 84, target: [7, -2.2, 0.8] as Point3 };
const eyeAt = ({ azimuth, elevation, distance, target }: typeof VIEW): Point3 => {
	const a = (azimuth * Math.PI) / 180;
	const e = (elevation * Math.PI) / 180;
	return [target[0] + Math.cos(a) * Math.cos(e) * distance, target[1] + Math.sin(a) * Math.cos(e) * distance, target[2] + Math.sin(e) * distance];
};
const CAMERA = perspectiveProjection({ eye: eyeAt(VIEW), target: VIEW.target });

function boundsPoints(): Point3[] {
	const pts: Point3[] = [sheetAt(0, -2.6), sheetAt(SHEET_W, -2.6), sheetAt(0, SHEET_H + 0.5), sheetAt(SHEET_W + 0.9, SHEET_H + 0.4), sheetAt(SHEET_W + 0.9, 4)];
	for (let k = 0; k < 24; k++) {
		const a = (k * TAU) / 24;
		const ring = (r: number, z: number): Point3 => [JAR[0] + Math.cos(a) * r, JAR[1] + Math.sin(a) * r, z];
		pts.push(ring(JAR_PROFILE[4]![1], 0), ring(LID.r, LID.z1));
	}
	return pts;
}

export const PROJECTION: Projection = fitProjection(boundsPoints(), WIDTH, HEIGHT - 30, { camera: CAMERA, pad: 2, headroom: 30 });
const EYE = eyeOf(PROJECTION)!;
/** Which way shadows fall on screen. */
const CAST: P = (() => {
	const a = iso([0, 0, 0], PROJECTION);
	const b = iso([-LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2], 0], PROJECTION);
	return [b[0] - a[0], b[1] - a[1]];
})();
const proj = (p: Point3): P => iso(p, PROJECTION);
const projAll = (pts: Point3[]): P[] => pts.map(proj);
const onSheet = (pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sheetAt(u, v, lift)));

/** The page as an SVG matrix at one point: local millimetres in, screen out. */
function sheetMatrix(u: number, v: number): string {
	const o = proj(sheetAt(u, v));
	const x = proj(sheetAt(u + 0.1, v));
	const y = proj(sheetAt(u, v + 0.1));
	return `matrix(${[x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1], o[0], o[1]].map((n) => Math.round(n * 1000) / 1000).join(' ')})`;
}

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, steps = 5): P[] {
	const pts: P[] = [];
	const corners: [number, number, number][] = [
		[x1 - r, y0 + r, -Math.PI / 2],
		[x1 - r, y1 - r, 0],
		[x0 + r, y1 - r, Math.PI / 2],
		[x0 + r, y0 + r, Math.PI],
	];
	for (const [cx, cy, a0] of corners) for (let i = 0; i <= steps; i++) pts.push([cx + Math.cos(a0 + (i / steps) * (Math.PI / 2)) * r, cy + Math.sin(a0 + (i / steps) * (Math.PI / 2)) * r]);
	return pts;
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, steps = 40): P[] => Array.from({ length: steps }, (_, i) => [cx + Math.cos((i / steps) * TAU) * rx, cy + Math.sin((i / steps) * TAU) * ry]);
const centreOf = (pts: P[]): P => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const shadowOnDesk = (p: Point3, floor = 0): Point3 => [p[0] - (LIGHT[0] / LIGHT[2]) * (p[2] - floor), p[1] - (LIGHT[1] / LIGHT[2]) * (p[2] - floor), floor];
const jitter = (pts: P[], seed: number, amount: number): P[] => {
	const rnd = seeded(seed);
	return pts.map(([x, y]) => [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]);
};

function sheetEdge(): P[] {
	const pts: P[] = [];
	const n = 70;
	for (let i = 0; i < n; i++) pts.push([(i / n) * SHEET_W, 0]);
	for (let i = 0; i < n; i++) pts.push([SHEET_W, (i / n) * SHEET_H]);
	for (let i = 0; i < n; i++) pts.push([SHEET_W - (i / n) * SHEET_W, SHEET_H]);
	for (let i = 0; i < n; i++) pts.push([0, SHEET_H - (i / n) * SHEET_H]);
	return pts;
}

/** A strip of the curl between two distances past the fold, as a local polygon. */
function curlBand(e0: number, e1: number): P[] {
	const seg = (e: number): P[] => {
		const c = FOLD + e * FOLD_K;
		const a: P = [SHEET_W * (c - 1), SHEET_H];
		const b: P = [SHEET_W, SHEET_H * (c - 1)];
		return Array.from({ length: 16 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 15, a[1] + ((b[1] - a[1]) * i) / 15]);
	};
	return [...seg(e0), ...seg(e1).reverse()];
}

function sheetArt() {
	const edge = sheetEdge();
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
	const centre = centreOf(sil);
	const curlHatch = [0.35, 0.5, 0.62, 0.72].map((t, i) => {
		const band = curlBand(tipE * t, tipE * t + 0.01).slice(0, 16);
		return line(onSheet(band).slice(1, -1), { w: 0.55, seed: 300 + i, over: 1 });
	});
	const pencilGuides = [
		[sheetAt(-2.2, 0), sheetAt(SHEET_W + 2.6, 0)],
		[sheetAt(0, -1.8), sheetAt(0, SHEET_H + 2.4)],
		[sheetAt(SHEET_W, -2), sheetAt(SHEET_W, 6)],
		[sheetAt(-1.6, SHEET_H), sheetAt(8, SHEET_H)],
	].map(([a, b], i) => pathOf(jitter(resample(projAll([a!, b!]), 9), 40 + i, 0.9)));
	return {
		paper: pathOf(sil, true),
		ink: outline(sil, { w: 2.2, heavy: 1.9, centre, seed: 201 }),
		desk: deskTone(),
		curl: { shadow: wash(curlShadow, 210, 2, 3), hatch: hatch(curlShadow, -0.35, 2.1, 211, { cluster: 5 }) + hatch(curlCore, 0.7, 1.4, 212, { cluster: 3 }) + hatch(curlCore, -1.1, 1.6, 213) + hatch(pool(curlCore, centreOf(curlCore), 0.6), 0.1, 1.3, 214, { cluster: 2 }), ink: curlHatch.join('') },
		contact: hatch(contact(nearEdge, 1.2, 3.4), -0.7, 1.7, 220, { cluster: 1, trim: 0.1 }) + hatch(contact(rightEdge, 3.2, 1.6), -0.6, 1.9, 221, { cluster: 1, trim: 0.1 }),
		contactWash: wash(contact(nearEdge, 2, 5), 222, 0.5, 1.5) + wash(contact(rightEdge, 4, 2), 223, 0.5, 1.5),
		pencil: pencilGuides.join(''),
	};
}

/** Loose desk hatching: a band along the sheet's near edge and a patch spreading from the jar's shadow, in clusters. */
function deskTone() {
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
		hatch(nearBand, -0.5, 2.4, 230, { cluster: 6, skip: 0.25, trim: 0.5 }) +
		hatch(nearBand.slice(0, nearBand.length / 2 + 4), 0.9, 3.4, 231, { cluster: 4, skip: 0.45, trim: 0.6 }) +
		hatch(leftBand, -0.55, 2.8, 232, { cluster: 5, skip: 0.35, trim: 0.55 })
	);
}

function pageArt() {
	const bar = 1.7;
	const barPoly = onSheet([[0, 0], [SHEET_W, 0], [SHEET_W, bar], [0, bar]]);
	const dots = [0.75, 1.4, 2.05].map((u, i) => outline(onSheet(ellipse(u, 0.85, 0.22, 0.22, 18)), { w: 0.9, seed: 400 + i }));
	const url = onSheet(roundRect(3, 0.42, 11.6, 1.3, 0.4));
	const { u0, v0, u1, v1 } = BUTTON;
	const buttonPoly = onSheet(roundRect(u0, v0, u1, v1, 0.4), 0.12);
	const buttonSide = onSheet([[u1, v0 + 0.3], [u1, v1], [u0 + 0.3, v1], [u0 + 0.3, v1 + 0.2], [u1 + 0.2, v1 + 0.2], [u1 + 0.2, v0 + 0.3]]);
	const nowSpot = onSheet(ellipse(NOW_U + 0.63, ROW.v - 0.62, 0.9, 0.85, 30));
	const badge = onSheet(ellipse(BADGE.u, BADGE.v, BADGE.r, BADGE.r * 0.95, 30));
	const basket = onSheet([[17.45, 4.3], [19.35, 4.3], [19.05, 5.4], [17.75, 5.4]]);
	const cart =
		line(onSheet([[16.8, 3.85], [17.25, 3.85], [17.45, 4.3]]), { w: 1.1, seed: 420, over: 0.3 }) +
		outline(basket, { w: 1.1, heavy: 0.8, centre: centreOf(basket), seed: 421 }) +
		line(onSheet([[17.6, 4.85], [19.2, 4.85]]), { w: 0.6, seed: 422, over: 0 }) +
		line(onSheet([[18.05, 4.32], [18.2, 5.38]]), { w: 0.6, seed: 427, over: 0 }) +
		line(onSheet([[18.7, 4.32], [18.6, 5.38]]), { w: 0.6, seed: 428, over: 0 }) +
		line(onSheet([[17.75, 5.4], [17.6, 5.75], [19.15, 5.75]]), { w: 1, seed: 429, over: 0.3 }) +
		[17.85, 18.95].map((u, i) => outline(onSheet(ellipse(u, 6.02, 0.19, 0.19, 14)), { w: 1, seed: 423 + i })).join('');
	const bagPoly: P[] = [[1.95, 5.0], [4.1, 5.0], [4.3, 8.05], [1.75, 8.05]];
	const crimp: P[] = Array.from({ length: 11 }, (_, i) => [1.95 + (i / 10) * 2.15, 4.72 + (i % 2) * 0.28]);
	const bag = onSheet(bagPoly);
	const bagLabel = onSheet(roundRect(2.2, 5.95, 3.85, 7.35, 0.2));
	const bean = onSheet(ellipse(3.02, 6.65, 0.38, 0.27, 18));
	const bagShade = onSheet([[3.55, 5.05], [4.1, 5.0], [4.3, 8.05], [3.7, 8.05]]);
	return {
		bar: { tone: hatch(barPoly, 0.12, 2.3, 410, { cluster: 6, skip: 0.2 }), rule: line(onSheet([[0, bar], [SHEET_W, bar]]), { w: 0.9, seed: 411 }), dots: dots.join(''), url: outline(url, { w: 0.85, seed: 412 }), urlMatrix: sheetMatrix(3.45, 1.12) },
		shopMatrix: sheetMatrix(1.4, 3.6),
		cart,
		badge: { paper: pathOf(badge, true), wash: wash(badge, 425, 0.6, 2), ink: outline(badge, { w: 1, heavy: 0.6, centre: centreOf(badge), seed: 426 }), matrix: sheetMatrix(BADGE.u, BADGE.v + 0.29), oldMatrix: sheetMatrix(17.95, 3.75) },
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
		rowMatrix: sheetMatrix(ROW.u, ROW.v),
		spot: { wash: wash(nowSpot, 480, 1.2, 4), pool: wash(pool(nowSpot, centreOf(nowSpot), 0.55), 481, 0.5, 2.5), edge: wash(nowSpot, 482, 0.4, 3.5) },
		button: {
			paper: pathOf(buttonPoly, true),
			wash: wash(buttonPoly, 490, 1.5, 3.5),
			pool: wash(pool(buttonPoly, buttonPoly[8]!, 0.5), 491, 0.6, 2),
			side: hatch(buttonSide, 0.95, 1.4, 492, { cluster: 1 }) + outline(buttonSide, { w: 0.8, seed: 493 }),
			ink: outline(buttonPoly, { w: 1.5, heavy: 1.3, centre: centreOf(buttonPoly), seed: 494 }),
			matrix: sheetMatrix((u0 + u1) / 2, (v0 + v1) / 2 + 0.32),
			sink: (() => {
				const a = proj(sheetAt(4, v0 + 1, 0.12));
				const b = proj(sheetAt(4.08, v0 + 1.1, 0));
				return `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`;
			})(),
		},
	};
}

/** The pen strokes that cross out a previous number: one for the cart line, one for the badge. */
function strikes() {
	const strike = (x: number, k: number, seed: number) => {
		const rnd = seeded(seed);
		const pts: P[] = [
			[x - 1.6 * k, (-1.6 + rnd()) * k],
			[x + 5 * k, (-3.4 + rnd() * 0.6) * k],
			[x + 12.4 * k, (-6.4 + rnd()) * k],
		];
		const d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}Q${r1(pts[1]![0])} ${r1(pts[1]![1])} ${r1(pts[2]![0])} ${r1(pts[2]![1])}`;
		return { d, length: r1(lengthOf(pts) + 1) };
	};
	return { line: strike(SLOTS[0], 0.7, 500), badge: strike(0, 0.55, 501) };
}

const radiusAt = (z: number) => {
	for (let i = 1; i < JAR_PROFILE.length; i++) {
		const [z0, r0] = JAR_PROFILE[i - 1]!;
		const [z1, r1v] = JAR_PROFILE[i]!;
		if (z <= z1) {
			const t = (z - z0) / (z1 - z0 || 1);
			const s = t * t * (3 - 2 * t);
			return r0 + (r1v - r0) * s;
		}
	}
	return JAR_PROFILE.at(-1)![1];
};

const jarPoint = (a: number, z: number, r = radiusAt(z)): Point3 => [JAR[0] + Math.cos(a) * r, JAR[1] + Math.sin(a) * r, z];
const facing = (a: number, z: number) => dot3([Math.cos(a), Math.sin(a), 0], sub3(EYE, jarPoint(a, z))) > 0;
const litness = (a: number) => dot3([Math.cos(a), Math.sin(a), 0.1], LIGHT);

/** Rings of a solid of revolution split into the arc facing us and the arc behind. */
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

/** Left and right contour of the jar's profile as seen from the camera. */
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

/** Strokes running up a turned surface on the side away from the light, in clusters. */
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
			const pts: Point3[] = Array.from({ length: 12 }, (_, i) => {
				const z = bottom + ((top - bottom) * i) / 11;
				return jarPoint(a + tilt * i, z, r(z) + 0.01);
			});
			d += pathOf(projAll(pts));
		}
		a += gap * (0.6 + rnd() * 0.7);
	}
	return d;
}

/** Strokes around the form in the darkest pocket, following the rings. */
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
	const reach = sub3(proj(shadowOnDesk(jarPoint(0, 1.6))), proj(jarPoint(0, 1.6, radiusAt(1.6)))) as unknown as P;
	const foot = hull([...footRing, ...footRing.map((p) => [p[0] + reach[0] * 0.35, p[1] + reach[1] * 0.35] as P)]);

	const knurl: string[] = [];
	for (let k = 0; k < 64; k++) {
		const a = (k / 64) * TAU;
		if (!facing(a, LID.z0 + 0.5)) continue;
		const pts = projAll([jarPoint(a, LID.z0 + 0.12, LID.r + 0.01), jarPoint(a, LID.z1 - 0.26, LID.r + 0.01)]);
		knurl.push(pathOf(pts));
	}

	const glints = [
		[2.75, 1.4, 5.6],
		[2.95, 2.1, 4.4],
		[2.6, 6.9, 7.4],
	].map(([a, z0, z1]) => [a!, z0! * JS, z1! * JS]).map(([a, z0, z1], i) => line(projAll(Array.from({ length: 10 }, (_, k) => jarPoint(a!, z0! + ((z1! - z0!) * k) / 9, radiusAt(z0! + ((z1! - z0!) * k) / 9) + 0.02))), { w: 0.6, seed: 600 + i, over: 0.6 }));

	const axisTop = proj([JAR[0], JAR[1], 10]);
	const axisBottom = proj([JAR[0], JAR[1], -1.4]);

	return {
		shadow: { wash: wash(shadow, 610, 2, 5), lidWash: wash(lidShadow, 611, 1.5, 3), hatch: hatch(shadow, -0.45, 3.2, 612, { cluster: 5, skip: 0.15 }) + hatch(lidShadow, 0.5, 1.7, 613, { cluster: 3 }) + hatch(lidShadow, -0.6, 2.1, 614), foot: hatch(foot, -0.5, 1.5, 615, { cluster: 2, trim: 0.3 }), core: (() => {
				const near: P[] = [];
				for (let z = 0; z <= 3.2; z += 0.4) for (let k = 0; k < 48; k++) near.push(proj(shadowOnDesk(jarPoint((k / 48) * TAU, z))));
				const core = hull(near);
				return hatch(core, 0.55, 1.5, 616, { cluster: 4, skip: 0.1 }) + hatch(core, -1.2, 1.5, 617, { cluster: 3, skip: 0.2 });
			})() },
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
			ink:
				outline(lidTop.all, { w: 1.3, seed: 644 }) +
				line(lidRim.front, { w: 0.8, seed: 645 }) +
				line(lidBottom.front, { w: 2.2, heavy: 1.2, centre, seed: 646, over: 2 }) +
				line(lid.left, { w: 1.4, seed: 647 }) +
				line(lid.right, { w: 2.2, seed: 648 }),
		},
		pencil: [pathOf(jitter(resample([axisTop, axisBottom], 8), 650, 0.8)), pathOf(jitter(base.all, 651, 0.6), true), pathOf(jitter(ringArcs(LID.z1, LID.r + 0.4).all, 652, 0.7), true)].join(''),
		lidTop: proj([JAR[0], JAR[1], LID.z1]),
		top: proj([JAR[0], JAR[1], 10]),
		left: body.left[Math.floor(body.left.length * 0.6)]!,
	};
}

/** A paper tag hung from the jar's neck on a string, with the word written on it. */
function tagArt() {
	const a = 1.85;
	const knot = jarPoint(a, 7.75 * JS, radiusAt(7.75 * JS) + 0.05);
	const out: Point3 = unit3([Math.cos(a), Math.sin(a), 0]);
	const side = unit3(cross3(out, [0, 0, 1]));
	const tilt = unit3(add3(mul3(side, Math.cos(0.32)), [0, 0, -Math.sin(0.32)]));
	const down = unit3(add3(cross3(out, tilt), mul3(out, 0.15)));
	const o = add3(add3(knot, mul3(out, 0.6)), mul3(down, -1.6));
	const corner = (x: number, y: number): Point3 => add3(add3(o, mul3(tilt, x)), mul3(down, -y));
	const shape: P[] = [[0, 0], [2.6, 0], [3.2, 0.7], [2.6, 1.4], [0, 1.4]];
	const poly = projAll(shape.map(([x, y]) => corner(x, -y)));
	const hole = projAll(ellipse(2.62, -0.7, 0.16, 0.16, 14).map(([x, y]) => corner(x, y)));
	const loop = ringArcs(7.75 * JS, radiusAt(7.75 * JS) + 0.06);
	const holeC = proj(corner(2.62, -0.7));
	const knotP = proj(knot);
	const stringPts = resample([knotP, [(knotP[0] + holeC[0]) / 2 + 2, (knotP[1] + holeC[1]) / 2 + 4], holeC], 2);
	const m = (() => {
		const p0 = proj(corner(0.3, -1.02));
		const px = proj(corner(0.4, -1.02));
		const py = proj(corner(0.3, -1.12));
		return `matrix(${[px[0] - p0[0], px[1] - p0[1], py[0] - p0[0], py[1] - p0[1], p0[0], p0[1]].map((n) => Math.round(n * 1000) / 1000).join(' ')})`;
	})();
	return {
		paper: pathOf(poly, true),
		shade: hatch(poly, 1.2, 2.2, 700, { cluster: 3, skip: 0.3, trim: 0.5 }),
		ink: outline(poly, { w: 1.2, heavy: 1, seed: 701 }) + outline(hole, { w: 0.7, seed: 702 }),
		string: line(loop.front, { w: 0.8, seed: 703 }) + line(stringPts, { w: 0.8, seed: 704, over: 1 }),
		matrix: m,
	};
}

const BEAN = [0.64, 0.46, 0.34] as const;

interface Bean {
	readonly key: number;
	readonly fill: string;
	readonly ink: string;
	readonly hatch: string;
	readonly drop: number;
}

/** Up to thirty beans settled in a pile on the jar's floor, the first ones toward the front so they show. */
function beans(count = 30): Bean[] {
	const rnd = seeded(800);
	const placed: Point3[] = [];
	const toward = unit3([EYE[0] - JAR[0], EYE[1] - JAR[1], 0]);
	const R = 2.05;
	for (let i = 0; i < count; i++) {
		let best: Point3 | undefined;
		let bestScore = Infinity;
		for (let t = 0; t < 40; t++) {
			const a = rnd() * TAU;
			const r = Math.sqrt(rnd()) * R;
			const x = JAR[0] + Math.cos(a) * r;
			const y = JAR[1] + Math.sin(a) * r;
			let z = BEAN[2] + 0.04;
			for (const q of placed) {
				const d = Math.hypot(q[0] - x, q[1] - y);
				if (d < 1.2) z = Math.max(z, q[2] + Math.sqrt(1.2 * 1.2 - d * d) * 0.7);
			}
			const front = (x - JAR[0]) * toward[0] + (y - JAR[1]) * toward[1];
			const score = z * 3 - front * 0.9 + rnd() * 0.3;
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
		const up = unit3([(r() - 0.5) * 0.7, (r() - 0.5) * 0.7, 1]);
		const ay = unit3(cross3(up, ax));
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
	const shadowLine: P[] = [];
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
		shadowLine.push(proj(shadowOnDesk(p, p[2] > 0.6 ? 0 : p[2] - radius)));
		if (p[2] < radius + 0.5) lows.at(-1)!.push(proj(shadowOnDesk(p, p[2] > 0.6 ? 0 : p[2] - radius)));
		else if (lows.at(-1)!.length) lows.push([]);
	}
	void shadowLine;
	const broken = (pts: P[], every: number, keep: number, seed2: number) => {
		const rnd = seeded(seed2);
		let d = '';
		for (let i = 0; i < pts.length; i += every) d += rnd() < keep ? stroke(pts.slice(i, i + every - 2), { w: radius > 0.15 ? 0.55 : 0.4, seed: seed2 + i, over: 0.3, wobble: 0.15 }) : '';
		return d;
	};
	const centre = projAll(pts);
	const w = Math.max(3, radius * 14);
	let shadow = '';
	let shadowHatch = '';
	lows.filter((run) => run.length > 3).forEach((run, k) => {
		const sh = resample(run, 1.5);
		const near: P[] = [];
		const far: P[] = [];
		sh.forEach((p, i) => {
			const a = sh[Math.max(0, i - 1)]!;
			const b = sh[Math.min(sh.length - 1, i + 1)]!;
			const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
			const nx = -(b[1] - a[1]) / l;
			const ny = (b[0] - a[0]) / l;
			const away = nx * CAST[0] + ny * CAST[1] > 0 ? 1 : -1;
			near.push([p[0] - nx * away * w * 0.1, p[1] - ny * away * w * 0.1]);
			far.push([p[0] + nx * away * w, p[1] + ny * away * w]);
		});
		const under = [...near, ...far.reverse()];
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

const bezier = (a: Point3, b: Point3, c: Point3, d: Point3, steps = 40): Point3[] =>
	Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		const s = 1 - t;
		return add3(add3(mul3(a, s * s * s), mul3(b, 3 * s * s * t)), add3(mul3(c, 3 * s * t * t), mul3(d, t * t * t)));
	});

/** A smooth path through local page points, lying on the sheet. */
const alongSheet = (pts: P[], lift: number): Point3[] => {
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
};

/** A small crocodile clip lying on its side on the page, jaws open so the teeth show, from its boot at `rear` to the jaw tips at `tip`. */
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

/** Where each clip bites: beside the cart badge at the main wire's end, and at the live number's corner at the branch's end. */
export const CLIPS = {
	badge: { rear: [22.7, 3.95] as P, tip: [20.25, 3.95] as P },
	line: { rear: [15.2, 6.5] as P, tip: [12.9, 8.2] as P },
};

function wires() {
	const r = 0.24;
	const rear = CLIPS.badge.rear;
	const lidOut = jarPoint(-0.95, LID.z1, 0.95);
	const back = -1.5;
	const deskStart: P = [-2.4, back + 0.5];
	const landing = sheetAt(deskStart[0], deskStart[1], r - 0.02);
	const hang = bezier(lidOut, add3(lidOut, [0.4, -0.5, 3.4]), add3(landing, [-1.2, 0.7, 2]), landing, 46);
	const onDesk = alongSheet([deskStart, [-0.6, back], [6, back - 0.15], [13, back + 0.05], [rear[0] - 1.6, back], [rear[0] - 0.2, -0.5], [rear[0] + 0.15, 1.2], [rear[0] + 0.35, 3], [rear[0] + 0.1, rear[1]]], r - 0.02);
	const mainPts = [...hang, ...onDesk.slice(1)];
	const main = cord(mainPts, r, 1000);

	const split = mainPts.findIndex((p) => p[0] - SHEET_O[0] >= BRANCH_U && p[2] < 1);
	const lineRear = CLIPS.line.rear;
	const rb = 0.19;
	const branchPts = alongSheet([[BRANCH_U, back + 0.1], [BRANCH_U + 0.05, 0.6], [BRANCH_U + 0.05, 3.6], [BRANCH_U - 0.05, 5.4], [lineRear[0], lineRear[1]]], rb - 0.02);
	const branch = cord(branchPts, rb, 1400);
	const knot = onSheet(ellipse(BRANCH_U, back + 0.05, 0.42, 0.34, 18), r + 0.02);

	const t = 0.13;
	const socket = jarPoint(0.55, 0.75, radiusAt(0.75) + 0.05);
	const deskLocal: P[] = [[1.3, 11.9], [0.4, 12.4], [-0.7, 12.6], [-1.7, 12.1], [-2.2, 10.9]];
	const run = alongSheet(deskLocal, t - 0.02);
	const foot = run.at(-1)!;
	const rise = bezier(foot, add3(foot, [-0.2, -0.4, 0.3]), add3(socket, [0.6, 0.5, 0]), socket, 16);
	const thin = cord([...run, ...rise.slice(1)], t, 1100);

	const toLine = projAll([...mainPts.slice(0, split + 1), ...branchPts]);
	return {
		main,
		branch,
		splice: { paper: pathOf(knot, true), ink: outline(knot, { w: 1, heavy: 0.6, centre: centreOf(knot), seed: 1420 }) + hatch(knot, 0.9, 1, 1421, { cluster: 1, trim: 0 }) },
		toLine: { d: pathOf(toLine), length: r1(lengthOf(toLine)) },
		thin,
		clips: { badge: crocodile(CLIPS.badge.rear, CLIPS.badge.tip, 1200), line: crocodile(CLIPS.line.rear, CLIPS.line.tip, 1220) },
		hang: proj(hang[Math.floor(hang.length * 0.3)]!),
	};
}

/** Where the loose clips rest on the desk behind the sheet, jaws pointing at the page but short of it. */
export const LOOSE_CLIPS = {
	badge: { rear: [17.5, -2.15] as P, tip: [19.25, -0.6] as P },
	line: { rear: [10.7, -1.95] as P, tip: [12.35, -0.5] as P },
};
const LOOSE_SPLICE: P = [7.6, -2.05];

/** The unplugged figure's two jar wires: the same hang off the lid, then slack on the desk, clips resting short of the page. */
function looseWires() {
	const r = 0.24;
	const lidOut = jarPoint(-0.95, LID.z1, 0.95);
	const deskStart: P = [-2.4, -1];
	const landing = sheetAt(deskStart[0], deskStart[1], r - 0.02);
	const hang = bezier(lidOut, add3(lidOut, [0.4, -0.5, 3.4]), add3(landing, [-1.2, 0.7, 2]), landing, 46);
	const rear = LOOSE_CLIPS.badge.rear;
	const onDesk = alongSheet([deskStart, [-0.6, -1.5], [2.6, -2.2], [5.2, -1.75], LOOSE_SPLICE, [10.2, -2.35], [12.8, -1.9], [14.6, -2.25], [rear[0] - 1.1, rear[1] - 0.2], [rear[0] + 0.07, rear[1] + 0.06]], r - 0.02);
	const main = cord([...hang, ...onDesk.slice(1)], r, 1500);

	const rb = 0.19;
	const lineRear = LOOSE_CLIPS.line.rear;
	const branch = cord(alongSheet([LOOSE_SPLICE, [8.4, -1.3], [9.3, -1.05], [10.0, -1.6], [lineRear[0] + 0.07, lineRear[1] + 0.06]], rb - 0.02), rb, 1600);
	const knot = onSheet(ellipse(LOOSE_SPLICE[0], LOOSE_SPLICE[1], 0.42, 0.34, 18), r + 0.02);
	return {
		main,
		branch,
		splice: { paper: pathOf(knot, true), ink: outline(knot, { w: 1, heavy: 0.6, centre: centreOf(knot), seed: 1620 }) + hatch(knot, 0.9, 1, 1621, { cluster: 1, trim: 0 }) },
		clips: { badge: crocodile(LOOSE_CLIPS.badge.rear, LOOSE_CLIPS.badge.tip, 1700), line: crocodile(LOOSE_CLIPS.line.rear, LOOSE_CLIPS.line.tip, 1720) },
	};
}

function notes(jar: ReturnType<typeof jarArt>, aim: P) {
	const label: P = [2, 18];
	const from: P = [Math.max(label[0] + 40, aim[0] - 60), label[1] + 8];
	const arrow = resample([from, [from[0] + 8, from[1] + 22], [aim[0] - 22, aim[1] - 26], [aim[0] - 5, aim[1] - 6]], 3);
	const smooth = arrow.map((p, i, all) => (i === 0 || i === all.length - 1 ? p : ([(all[i - 1]![0] + p[0] + all[i + 1]![0]) / 3, (all[i - 1]![1] + p[1] + all[i + 1]![1]) / 3] as P)));
	const end = smooth.at(-1)!;
	const prev = smooth.at(-4)!;
	const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
	const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
	void jar;
	return {
		wired: { x: r1(label[0]), y: r1(label[1]) },
		wiredArrow: line(smooth, { w: 1.3, seed: 1300, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: 1301, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: 1302, over: 0.5 }),
	};
}

/** The whole scene, frozen into wired.art.ts. */
export function drawing() {
	const jar = jarArt();
	const wiring = wires();
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: sheetArt(),
		page: pageArt(),
		strikes: strikes(),
		jar,
		tag: tagArt(),
		beans: beans(),
		wires: wiring,
		loose: looseWires(),
		notes: notes(jar, wiring.hang),
	};
}
