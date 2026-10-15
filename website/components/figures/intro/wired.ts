// A Beanshop takeaway cup on a desk: the barista's name, the sleeve's shot boxes holding the count, and a printed lid sticker that follows it.
import { add3, dot3, mul3, sub3 } from '../kit/lathe.ts';
import { centreOf, createCamera, ellipse, LIGHT, matrixOf, type P, type Point3, roundRect, shadowOnDesk, TAU } from '../ink/desk.ts';
import { hatch, hull, lengthOf, line, outline, pathOf, pool, r1, resample, seeded, wash } from '../ink/ink.ts';
import { CAP, SLOTS, STICKER } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 520;

const CUP: P = [0, 0];
const BASE_R = 2.55;
const TOP_R = 3.5;
const BODY_H = 9.4;
const RIM = { z0: BODY_H - 0.05, z1: BODY_H + 0.32, r: TOP_R + 0.14 };
const LID = { z0: BODY_H + 0.22, z1: BODY_H + 0.78, r: TOP_R + 0.2, top: TOP_R - 0.12 };
const SLEEVE = { z0: 1.5, z1: 4.85 };
/** How much of the cup's height its cast shadow uses, so the shadow stays inside the frame. */
const SHADOW = 0.5;

const radiusAt = (z: number) => BASE_R + ((TOP_R - BASE_R) * Math.max(0, Math.min(z, BODY_H))) / BODY_H - (z < 0.18 ? (0.18 - z) * 0.35 : 0);
const cupPoint = (a: number, z: number, r = radiusAt(z)): Point3 => [CUP[0] + Math.cos(a) * r, CUP[1] + Math.sin(a) * r, z];

const STEAM_TOP = LID.z1 + 3.6;

const { EYE, proj, projAll } = createCamera({
	width: WIDTH,
	height: HEIGHT,
	view: { azimuth: 96, elevation: 38, distance: 62, target: [CUP[0], CUP[1], BODY_H * 0.55] },
	bounds: [
		...Array.from({ length: 24 }, (_, k) => (k * TAU) / 24).flatMap((a) => [cupPoint(a, 0, BASE_R), cupPoint(a, LID.z1 + 0.25, LID.r), shadowOnDesk(cupPoint(a, BODY_H * SHADOW, TOP_R))]),
		[CUP[0], CUP[1] - 1.2, STEAM_TOP],
	],
	pad: 6,
});

const FRONT = (() => {
	const axis = proj([CUP[0], CUP[1], BODY_H * 0.7])[0];
	let best = Math.PI / 2;
	for (let a = 0; a < Math.PI; a += 0.002) if (Math.abs(proj(cupPoint(a, BODY_H * 0.7))[0] - axis) < Math.abs(proj(cupPoint(best, BODY_H * 0.7))[0] - axis)) best = a;
	return best;
})();
const facing = (a: number, z: number) => dot3([Math.cos(a), Math.sin(a), 0], sub3(EYE, cupPoint(a, z))) > 0;
const litness = (a: number) => dot3([Math.cos(a), Math.sin(a), 0.1], LIGHT);

/** A point on the cup's surface: `s` along the wall from the front (positive to screen right), `z` up. */
const onCup = (s: number, z: number, lift = 0.03): Point3 => {
	const r = radiusAt(z) + lift;
	return cupPoint(FRONT - s / r, z, r);
};
const cupPath = (pts: P[], lift?: number) => projAll(pts.map(([s, z]) => onCup(s, z, lift)));
/** Local tenths of a unit along the wall, laid onto the cup at one point, so real text bends with it. */
const cupMatrix = (s: number, z: number, tall = 1, lift?: number) => matrixOf(proj(onCup(s, z, lift)), proj(onCup(s + 0.1, z, lift)), proj(onCup(s, z - 0.1 * tall, lift)));

function ringArcs(z: number, r: number, steps = 120) {
	const front: P[] = [];
	const back: P[] = [];
	let start = 0;
	while (facing((start / steps) * TAU, z) && start < steps) start++;
	while (!facing((start / steps) * TAU, z) && start < steps * 2) start++;
	for (let i = 0; i < steps; i++) {
		const a = ((start + i) / steps) * TAU;
		(facing(a, z) ? front : back).push(proj(cupPoint(a, z, r)));
	}
	return { front, back, all: Array.from({ length: steps }, (_, i) => proj(cupPoint((i / steps) * TAU, z, r))) };
}

function contours(z0: number, z1: number, r: (z: number) => number, count = 40) {
	const left: P[] = [];
	const right: P[] = [];
	for (let i = 0; i <= count; i++) {
		const z = z0 + ((z1 - z0) * i) / count;
		const ring = Array.from({ length: 180 }, (_, k) => proj(cupPoint((k / 180) * TAU, z, r(z))));
		left.push(ring.reduce((m, p) => (p[0] < m[0] ? p : m)));
		right.push(ring.reduce((m, p) => (p[0] > m[0] ? p : m)));
	}
	return { left, right };
}

/** Strokes running up the wall on the side away from the light, in clusters. */
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
				return cupPoint(a + tilt * i, z, r(z) + 0.01);
			})));
		}
		a += gap * (0.6 + rnd() * 0.7);
	}
	return d;
}

/** Strokes around the wall in the darkest part, following the rings. */
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
			if (facing(a, z) && litness(a) < lim) run.push(proj(cupPoint(a, z, r(z) + 0.01)));
			else flush();
		}
		flush();
	}
	return d;
}

/** The front band of the wall between two heights, as a screen polygon. */
const band = (z0: number, z1: number, grow = 0) => {
	const top = ringArcs(z1, radiusAt(z1) + grow).front;
	const bottom = ringArcs(z0, radiusAt(z0) + grow).front;
	return [...top, ...bottom.reverse()];
};

/** Measured advances of Shantell Sans, in ems, for the letters written on the cup. */
const ADVANCE: Record<string, number> = { M: 1.03, a: 0.68, r: 0.54, c: 0.53, u: 0.64, s: 0.53, k: 0.65, l: 0.35, e: 0.6, S: 0.6, H: 0.74, O: 0.76, T: 0.64 };
const widthOf = (word: string, size: number) => [...word].reduce((w, ch) => w + (ADVANCE[ch] ?? 0.6) * size, 0);

/** A word written round the wall one letter at a time, each letter with its own matrix, a little uphill and uneven like a quick hand. */
function cupWord(word: string, s0: number, z: number, size: number, seed: number, slope = 0, wobble = 0, tall = 1) {
	const rnd = seeded(seed);
	let s = s0;
	return [...word].map((ch, key) => {
		const adv = (ADVANCE[ch] ?? 0.6) * size;
		const at = s + adv / 2;
		const m = cupMatrix(s, z + (at - s0) * slope + (rnd() - 0.5) * wobble, tall);
		s += adv;
		return { key, ch, m };
	});
}

function cupArt() {
	const body = contours(0, BODY_H, radiusAt);
	const rimR = (z: number) => RIM.r - Math.abs(z - (RIM.z0 + RIM.z1) / 2) * 0.3;
	const rim = contours(RIM.z0, RIM.z1, rimR, 8);
	const lidR = (z: number) => LID.r - (z > LID.z1 - 0.16 ? (z - (LID.z1 - 0.16)) * 1.4 : 0);
	const lid = contours(LID.z0, LID.z1, lidR, 12);
	const base = ringArcs(0.02, radiusAt(0.02) + 0.04);
	const foot = ringArcs(0.2, radiusAt(0.2));
	const sleeveTop = ringArcs(SLEEVE.z1, radiusAt(SLEEVE.z1) + 0.08);
	const sleeveBottom = ringArcs(SLEEVE.z0, radiusAt(SLEEVE.z0) + 0.08);
	const rimBottom = ringArcs(RIM.z0, radiusAt(RIM.z0) + 0.04);
	const lidBottom = ringArcs(LID.z0 + 0.06, LID.r);
	const lidRim = ringArcs(LID.z1 - 0.16, LID.r);
	const lidTop = ringArcs(LID.z1, LID.r - 0.22);
	const dome = ringArcs(LID.z1 + 0.12, LID.top - 0.35);
	const silhouette = hull([...body.left, ...body.right, ...rim.left, ...rim.right, ...lid.left, ...lid.right, ...base.all, ...lidTop.all]);
	const centre = centreOf(silhouette);

	const shadowPts: P[] = [];
	for (let z = 0; z <= LID.z1; z += 0.5) for (let k = 0; k < 48; k++) shadowPts.push(proj(shadowOnDesk(cupPoint((k / 48) * TAU, z * SHADOW, z > RIM.z0 ? LID.r : radiusAt(z)))));
	const shadow = hull(shadowPts);
	const near: P[] = [];
	for (let z = 0; z <= 3; z += 0.4) for (let k = 0; k < 48; k++) near.push(proj(shadowOnDesk(cupPoint((k / 48) * TAU, z))));
	const core = hull(near);
	const footRing = Array.from({ length: 64 }, (_, k) => proj(cupPoint((k / 64) * TAU, 0, BASE_R + 0.04)));
	const reach = sub3(proj(shadowOnDesk(cupPoint(0, 1.6))), proj(cupPoint(0, 1.6))) as unknown as P;
	const footShade = hull([...footRing, ...footRing.map((p) => [p[0] + reach[0] * 0.3, p[1] + reach[1] * 0.3] as P)]);

	const sleeve = band(SLEEVE.z0, SLEEVE.z1, 0.08);
	const sleeveR = (z: number) => radiusAt(z) + 0.09;
	const under = band(SLEEVE.z0 - 0.32, SLEEVE.z0, 0);

	const sip = (() => {
		const a = FRONT + Math.PI - 0.55;
		const c = cupPoint(a, LID.z1 + 0.14, LID.top - 0.62);
		const t: Point3 = [-Math.sin(a), Math.cos(a), 0];
		const n: Point3 = [Math.cos(a), Math.sin(a), 0];
		return projAll(Array.from({ length: 24 }, (_, k) => {
			const th = (k / 24) * TAU;
			return add3(add3(c, mul3(t, Math.cos(th) * 0.62)), mul3(n, Math.sin(th) * 0.16));
		}));
	})();


	return {
		shadow: {
			wash: wash(shadow, 610, 2, 5),
			hatch: hatch(shadow, -0.45, 3.2, 612, { cluster: 5, skip: 0.15 }),
			core: hatch(core, 0.55, 1.5, 616, { cluster: 4, skip: 0.1 }) + hatch(core, -1.2, 1.5, 617, { cluster: 3, skip: 0.2 }),
			foot: hatch(footShade, -0.5, 1.5, 615, { cluster: 2, trim: 0.3 }),
		},
		backInk: line(base.back, { w: 0.6, seed: 620, over: 0.5 }),
		body: {
			paper: pathOf(silhouette, true),
			tone: formStrokes(0.3, BODY_H - 0.3, radiusAt, -0.26, 0.1, 630, 0.95) + formStrokes(0.15, SLEEVE.z0, radiusAt, -0.18, 0.07, 631),
			cross: ringStrokes(0.25, SLEEVE.z0 - 0.4, radiusAt, -0.22, 0.2, 632) + ringStrokes(SLEEVE.z1 + 0.3, BODY_H - 0.4, radiusAt, -0.42, 0.24, 633),
			under: hatch(under, 0.15, 1.2, 634, { cluster: 3, trim: 0.2 }),
			ink:
				line(body.left, { w: 1.5, seed: 635, over: 2.5 }) +
				line(body.right, { w: 2.4, heavy: 1, centre, seed: 636, over: 2.5 }) +
				line(base.front, { w: 2.2, heavy: 1.4, centre, seed: 637, over: 3 }) +
				line(foot.front, { w: 0.6, seed: 638, over: 1.5 }) +
				line(rimBottom.front, { w: 0.9, seed: 639, over: 1.5 }),
			seam: line(cupPath([[-1.55, 0.25], [-1.62, BODY_H - 0.1]]), { w: 0.55, seed: 640, over: 0.4 }),
		},
		sleeve: {
			paper: pathOf(sleeve, true),
			tone: formStrokes(SLEEVE.z0 + 0.05, SLEEVE.z1 - 0.05, sleeveR, 0.12, 0.08, 650, 1) + ringStrokes(SLEEVE.z0 + 0.1, SLEEVE.z1 - 0.1, sleeveR, -0.15, 0.16, 651),
			ink: line(sleeveTop.front, { w: 1.4, heavy: 0.6, centre, seed: 652, over: 1.5 }) + line(sleeveBottom.front, { w: 1.7, heavy: 1, centre, seed: 653, over: 1.5 }),
		},
		rim: {
			paper: pathOf(hull([...rim.left, ...rim.right, ...ringArcs(RIM.z1, RIM.r - 0.05).front, ...ringArcs(RIM.z0, RIM.r - 0.05).front]), true),
			ink: line(rim.left, { w: 1.2, seed: 660 }) + line(rim.right, { w: 2, seed: 661 }),
		},
		lid: {
			paper: pathOf(hull([...lid.left, ...lid.right, ...lidTop.all, ...lidBottom.front]), true),
			hatch: formStrokes(LID.z0 + 0.08, LID.z1 - 0.18, lidR, 0.3, 0.06, 671, 1) + ringStrokes(LID.z0 + 0.1, LID.z1 - 0.2, lidR, 0, 0.13, 672),
			sip: pathOf(sip, true),
			ink:
				outline(lidTop.all, { w: 1.2, seed: 673 }) +
				line(dome.front, { w: 0.7, seed: 674, over: 1 }) +
				line(dome.back, { w: 0.5, seed: 675, over: 1 }) +
				line(lidRim.front, { w: 0.8, seed: 676 }) +
				line(lidBottom.front, { w: 2.2, heavy: 1.2, centre, seed: 677, over: 2 }) +
				line(lid.left, { w: 1.3, seed: 678 }) +
				line(lid.right, { w: 2.1, seed: 679 }) +
				outline(sip, { w: 0.9, seed: 680 }),
		},
	};
}

/** A stroke on the cup's wall as a plain centre line, for marker work that draws itself on. */
const markerLine = (pts: P[], lift = 0.035) => {
	const screen = resample(cupPath(pts, lift), 1);
	return { d: pathOf(screen), length: r1(lengthOf(screen) + 1) };
};

/** The barista's hand: "Marcus" with a little doodle of him, a strike through, and "Markless" underneath, each piece timed for the write-on. */
function nameArt() {
	const big = 1.1;
	const small = 0.9;
	const tall = 1.12;
	const markless = widthOf('Markless', big);
	const marcus = widthOf('Marcus', small);
	const face = 0.48;
	const firstS = -(marcus + 0.5 + face * 2) / 2;
	const z1 = 7.6;
	const z2 = 5.85;
	const fc: P = [firstS + marcus + 0.42 + face, z1 + 0.38];
	const ring = (r: number, a0: number, a1: number, n: number): P[] => Array.from({ length: n }, (_, i) => {
		const a = a0 + ((a1 - a0) * i) / (n - 1);
		return [fc[0] + Math.cos(a) * r, fc[1] + Math.sin(a) * r];
	});
	const strikeZ = z1 + 0.3;
	const strike = markerLine(Array.from({ length: 9 }, (_, i) => [firstS - 0.22 + ((marcus + 0.4) * i) / 8, strikeZ + (i / 8) * 0.14 + Math.sin(i * 1.7) * 0.025] as P));
	const doodle = [
		ring(face, 0.5, TAU + 0.2, 28),
		[[fc[0] - 0.22, fc[1] + face * 0.88], [fc[0] - 0.08, fc[1] + face * 1.32], [fc[0] + 0.04, fc[1] + face * 1.05]] as P[],
		[[fc[0] + 0.02, fc[1] + face * 0.95], [fc[0] + 0.2, fc[1] + face * 1.38], [fc[0] + 0.3, fc[1] + face * 1.12]] as P[],
		ring(face * 0.5, Math.PI * 1.18, Math.PI * 1.82, 9).map(([s, z]) => [s, z - face * 0.12] as P),
		[[fc[0] - 0.22, fc[1] - 0.08], [fc[0] - 0.1, fc[1] - 0.02], [fc[0] - 0.01, fc[1] - 0.07]] as P[],
		[[fc[0] + 0.01, fc[1] - 0.07], [fc[0] + 0.1, fc[1] - 0.02], [fc[0] + 0.22, fc[1] - 0.08]] as P[],
	].map((pts, key) => ({ key, ...markerLine(pts), delay: 1000 + key * 110 }));
	const dot = (s: number, z: number, r: number) => pathOf(cupPath(ellipse(s, z, r, r * 1.15, 10), 0.035), true);
	const timed = (glyphs: ReturnType<typeof cupWord>, from: number, step: number) => glyphs.map((g, i) => ({ ...g, delay: from + i * step }));
	return {
		marcus: timed(cupWord('Marcus', firstS, z1, small, 740, 0.04, 0.05, tall), 150, 120),
		doodle,
		eyes: dot(fc[0] - 0.16, fc[1] + 0.13, 0.06) + dot(fc[0] + 0.16, fc[1] + 0.13, 0.06),
		strike: { ...strike, delay: 1800 },
		markless: timed(cupWord('Markless', -markless / 2, z2, big, 741, 0.05, 0.06, tall), 2250, 115),
	};
}

/** The sleeve's printed row of shot boxes and, for each box, the barista's marker tick. */
function boxArt() {
	const size = 0.64;
	const gap = 0.22;
	const q = size / 0.56;
	const total = CAP * size + (CAP - 1) * gap;
	const z0 = SLEEVE.z0 + 0.55;
	const boxes = Array.from({ length: CAP }, (_, key) => {
		const s0 = -total / 2 + key * (size + gap);
		const sq = cupPath(roundRect(s0, z0, s0 + size, z0 + size, 0.05, 2), 0.1);
		const rnd = seeded(780 + key);
		const tick = resample(cupPath(([[0.08, 0.3 + rnd() * 0.06], [0.22 + rnd() * 0.04, 0.06], [0.48, 0.6], [0.74 + rnd() * 0.1, 0.92 + rnd() * 0.1]] as P[]).map(([s, z]) => [s0 + s * q, z0 + z * q] as P), 0.12), 1.2);
		return { key, d: pathOf(tick), length: r1(lengthOf(tick) + 1), ink: outline(sq, { w: 0.7, seed: 800 + key }) };
	});
	return {
		boxes,
		label: cupWord('SHOTS', -widthOf('SHOTS', 0.6) / 2, z0 + size + 0.62, 0.6, 790, 0, 0, 1.3),
		rule: line(cupPath([[-total / 2, z0 + size + 0.3], [total / 2, z0 + size + 0.3]], 0.1), { w: 0.45, seed: 795, over: 0 }),
	};
}

/** The printed sticker on the lid's top: its paper, its edge, where its text sits, and the yellow wash behind the shot count. */
function stickerArt() {
	const z = LID.z1 + 0.05;
	const ox = -STICKER.w / 20;
	const oy = -STICKER.h / 20 - 0.15;
	const at = (x: number, y: number): Point3 => {
		const k = 0.06;
		const u = ox + x / 10;
		const v = oy + y / 10;
		return [CUP[0] + u * Math.cos(k) - v * Math.sin(k), CUP[1] + u * Math.sin(k) + v * Math.cos(k), z];
	};
	const flat = (pts: P[]) => projAll(pts.map(([x, y]) => at(x, y)));
	const paper = flat(roundRect(0, 0, STICKER.w, STICKER.h, 1.2, 3));
	const spot = flat(ellipse(SLOTS[1] + 3, STICKER.shots - 2.6, 5.6, 4.6, 26));
	const strikeRnd = seeded(500);
	const x = SLOTS[0];
	const sp: P[] = [[x - 1, -1 + strikeRnd() * 0.6], [x + 2.5, -2.6 + strikeRnd() * 0.4], [x + 6.2, -4.4 + strikeRnd() * 0.6]];
	return {
		paper: pathOf(paper, true),
		cast: wash(paper.map(([px, py]) => [px + 1.2, py + 1.4] as P), 860, 0.3, 0.6),
		ink: outline(paper, { w: 0.7, seed: 861 }),
		rule: line(flat([[3, 11.4], [STICKER.w - 3, 11.4]]), { w: 0.4, seed: 862, over: 0 }),
		matrix: matrixOf(proj(at(0, 0)), proj(at(1, 0)), proj(at(0, 1))),
		spot: { wash: wash(spot, 870, 0.8, 2.5), pool: wash(pool(spot, centreOf(spot), 0.55), 871, 0.4, 1.8), edge: wash(spot, 872, 0.3, 2.2) },
		strike: { d: `M${r1(sp[0]![0])} ${r1(sp[0]![1])}Q${r1(sp[1]![0])} ${r1(sp[1]![1])} ${r1(sp[2]![0])} ${r1(sp[2]![1])}`, length: r1(lengthOf(sp) + 1) },
	};
}

/** Three wisps of steam curling up from the sip hole. */
function steamArt() {
	const base = cupPoint(FRONT + Math.PI - 0.55, LID.z1 + 0.3, LID.top - 0.62);
	return [-0.55, 0.05, 0.6].map((dx, key) => {
		const rnd = seeded(880 + key);
		const pts: Point3[] = Array.from({ length: 16 }, (_, i) => {
			const t = i / 15;
			return [base[0] + dx + Math.sin(t * 5.2 + key * 1.9) * 0.32 * (0.4 + t), base[1] + rnd() * 0.05, base[2] + 0.4 + t * (2.6 + key * 0.35)];
		});
		const screen = projAll(pts);
		return { key, d: line(screen, { w: 0.85, seed: 890 + key, over: 0.4 }) };
	});
}

/** The whole scene, frozen into wired.art.ts. */
export function drawing() {
	const cup = cupArt();
	return {
		width: WIDTH,
		height: HEIGHT,
		cup,
		name: nameArt(),
		shots: boxArt(),
		sticker: stickerArt(),
		steam: steamArt(),
	};
}
