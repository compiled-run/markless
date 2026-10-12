// A printed journal page on a desk with one spot cut clean out of it, tagged #app, and the like button lying beside it as a paper piece the exact shape of the hole.
import { centreOf, createCamera, ellipse, jitter, LIGHT, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, lengthOf, line, outline, pathOf, pool, r1, resample, seeded, stroke, wash } from '../ink/ink.ts';
import { deskPlane, type Plane, plane } from '../ink/plane.ts';
import { SLOTS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 380;
const FOOT = 34;

const SHEET_W = 24;
const SHEET_H = 15.4;
const SHEET_O: Point3 = [-1.6, -8.8, 0];
const FOLD = 1.78;
const CURL_R = 3.4;
const FOLD_K = Math.hypot(1 / SHEET_W, 1 / SHEET_H);
const FOLD_N: P = [1 / SHEET_W / FOLD_K, 1 / SHEET_H / FOLD_K];

/** The piece, and the hole cut for it, in units. */
export const PIECE = { w: 8.9, h: 2.8 };
/** The hole's top-left corner on the sheet, in units from the sheet's top-left corner. */
export const HOLE = { u: 12.9, v: 8.7 };
/** The piece lying on the desk left of the sheet: its centre in sheet units, and its turn. */
const REST = { u: -5.4, v: 9.4, turn: -0.16, lift: 0.12 };
/** The like button inside the piece, in tenths of a unit from the piece's top-left. */
export const LAYOUT = { baseline: 18.6, pill: { x0: 4, y0: 5, x1: 70, y1: 24 } } as const;

const sheetLocal = (u: number, v: number): Point3 => {
	const e = (u / SHEET_W + v / SHEET_H - FOLD) / FOLD_K;
	if (e <= 0) return [u, v, 0];
	const th = e / CURL_R;
	const back = e - CURL_R * Math.sin(th);
	return [u - FOLD_N[0] * back, v - FOLD_N[1] * back, CURL_R * (1 - Math.cos(th))];
};
const sheetAt = (u: number, v: number, lift = 0): Point3 => {
	const [a, b, z] = sheetLocal(u, v);
	return [SHEET_O[0] + a, SHEET_O[1] + b, z + 0.02 + lift];
};
const deskAt = (u: number, v: number, z = 0): Point3 => [SHEET_O[0] + u, SHEET_O[1] + v, z];
/** Where a page line running right from `u` has to stop short of the curl. */
const flatUntil = (v: number) => SHEET_W * (FOLD - v / SHEET_H) - 0.6;

const { proj, projAll } = createCamera({
	width: WIDTH,
	height: HEIGHT - FOOT,
	view: { azimuth: 94, elevation: 60, distance: 84, target: [5.4, -1.6, 0.6] },
	bounds: [
		sheetAt(0, -0.6),
		sheetAt(SHEET_W, -0.6),
		sheetAt(0, SHEET_H + 0.5),
		sheetAt(SHEET_W + 0.9, SHEET_H + 0.4),
		sheetAt(SHEET_W + 0.9, 4),
		deskAt(REST.u - PIECE.w / 2 - 0.6, REST.v - 1.6),
		deskAt(REST.u - PIECE.w / 2 - 0.4, REST.v + 2.8),
	],
	pad: 2,
});
const onSheet = (pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sheetAt(u, v, lift)));
const sheetMatrix = (u: number, v: number) => matrixOf(proj(sheetAt(u, v)), proj(sheetAt(u + 0.1, v)), proj(sheetAt(u, v + 0.1)));
const CAST: P = (() => {
	const a = proj([0, 0, 0]);
	const b = proj([-LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2], 0]);
	return [b[0] - a[0], b[1] - a[1]];
})();

/** The hole's corners, wound the other way round from the sheet's edge so an even-odd fill cuts it out. */
const holeRing = (inset = 0): P[] => {
	const { u, v } = HOLE;
	const e = inset;
	return [[u + e, v + e], [u + e, v + PIECE.h - e], [u + PIECE.w - e, v + PIECE.h - e], [u + PIECE.w - e, v + e]];
};
/** The hole's page as a plane: piece units in, the spot on the sheet out. */
const inHole: Plane = plane(proj, sheetAt(HOLE.u, HOLE.v), [1, 0, 0], [0, 1, 0]);
const onDesk: Plane = deskPlane(proj, [SHEET_O[0] + REST.u, SHEET_O[1] + REST.v], PIECE.w, PIECE.h, REST.turn, REST.lift);

function sheetEdge(): P[] {
	const pts: P[] = [];
	const n = 70;
	for (let i = 0; i < n; i++) pts.push([(i / n) * SHEET_W, 0]);
	for (let i = 0; i < n; i++) pts.push([SHEET_W, (i / n) * SHEET_H]);
	for (let i = 0; i < n; i++) pts.push([SHEET_W - (i / n) * SHEET_W, SHEET_H]);
	for (let i = 0; i < n; i++) pts.push([0, SHEET_H - (i / n) * SHEET_H]);
	return pts;
}

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
	const sil = onSheet(sheetEdge());
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
	const curlInk = [0.35, 0.5, 0.62, 0.72].map((t, i) => line(onSheet(curlBand(tipE * t, tipE * t + 0.01).slice(0, 16)).slice(1, -1), { w: 0.55, seed: 300 + i, over: 1 }));
	const { u, v } = HOLE;
	const guides = [
		[sheetAt(-2.2, 0), sheetAt(SHEET_W + 2.6, 0)],
		[sheetAt(0, -0.6), sheetAt(0, SHEET_H + 2.4)],
		[sheetAt(SHEET_W, -0.6), sheetAt(SHEET_W, 6)],
		[sheetAt(-1.6, SHEET_H), sheetAt(8, SHEET_H)],
		[sheetAt(u - 1.6, v), sheetAt(u + PIECE.w + 1.2, v)],
		[sheetAt(u, v - 1.4), sheetAt(u, v + PIECE.h + 1.5)],
		[sheetAt(u + PIECE.w, v - 0.9), sheetAt(u + PIECE.w, v + PIECE.h + 1)],
		[sheetAt(u - 0.9, v + PIECE.h), sheetAt(u + PIECE.w + 0.6, v + PIECE.h)],
	].map(([a, b], i) => pathOf(jitter(resample(projAll([a!, b!]), 9), 40 + i, 0.9)));
	return {
		paper: pathOf(sil, true) + pathOf(onSheet(holeRing()), true),
		ink: outline(sil, { w: 2.2, heavy: 1.9, centre, seed: 201 }),
		desk: deskTone(),
		curl: {
			shadow: wash(curlShadow, 210, 2, 3),
			hatch: hatch(curlShadow, -0.35, 2.1, 211, { cluster: 5 }) + hatch(curlCore, 0.7, 1.4, 212, { cluster: 3 }) + hatch(curlCore, -1.1, 1.6, 213) + hatch(pool(curlCore, centreOf(curlCore), 0.6), 0.1, 1.3, 214, { cluster: 2 }),
			ink: curlInk.join(''),
		},
		contact: hatch(contact(nearEdge, 1.2, 3.4), -0.7, 1.7, 220, { cluster: 1, trim: 0.1 }) + hatch(contact(rightEdge, 3.2, 1.6), -0.6, 1.9, 221, { cluster: 1, trim: 0.1 }),
		contactWash: wash(contact(nearEdge, 2, 5), 222, 0.5, 1.5) + wash(contact(rightEdge, 4, 2), 223, 0.5, 1.5),
		pencil: guides.join(''),
	};
}

function deskTone() {
	const band = (pts: Point3[], dx: number, dy: number): P[] => {
		const a = projAll(pts);
		const b = projAll(pts.map((p) => [p[0] + dx, p[1] + dy, 0] as Point3));
		return [...a, ...b.reverse()];
	};
	const near = Array.from({ length: 12 }, (_, i) => sheetAt(-0.4 + (i / 11) * SHEET_W * (FOLD - 1) * 0.9, SHEET_H, -0.02));
	const left = Array.from({ length: 10 }, (_, i) => sheetAt(0, 12 + (i / 9) * (SHEET_H - 12), -0.02));
	const nearBand = band(near, 0.4, 2.6);
	const leftBand = band(left, -1.8, 0.5);
	return (
		hatch(nearBand, -0.5, 2.4, 230, { cluster: 6, skip: 0.25, trim: 0.5 }) +
		hatch(nearBand.slice(0, nearBand.length / 2 + 4), 0.9, 3.4, 231, { cluster: 4, skip: 0.45, trim: 0.6 }) +
		hatch(leftBand, -0.55, 2.8, 232, { cluster: 5, skip: 0.35, trim: 0.55 })
	);
}

/** One printed line of article text, as words: short inked runs with gaps, stopping at `end`. */
function textLine(u0: number, u1: number, v: number, seed: number) {
	const rnd = seeded(seed);
	let d = '';
	let u = u0;
	const end = Math.min(u1, flatUntil(v));
	while (u < end - 0.5) {
		const word = 0.6 + rnd() * 1.6;
		const stop = Math.min(end, u + word);
		const sag = (rnd() - 0.5) * 0.05;
		d += stroke(onSheet([[u, v], [(u + stop) / 2, v + sag], [stop, v]]), { w: 1.15, seed: seed * 7 + Math.round(u * 10), over: 0, wobble: 0.15 });
		u = stop + 0.32 + rnd() * 0.15;
	}
	return d;
}

/** The printed journal: browser bar, masthead, headline, byline, a photo and two columns of text. Nothing here ever moves. */
function pageArt() {
	const bar = 1.7;
	const barPoly = onSheet([[0, 0], [SHEET_W, 0], [SHEET_W, bar], [0, bar]]);
	const dots = [0.75, 1.4, 2.05].map((x, i) => outline(onSheet(ellipse(x, 0.85, 0.22, 0.22, 18)), { w: 0.9, seed: 400 + i }));
	const url = onSheet(roundRect(3, 0.42, 13.2, 1.3, 0.4));
	const photo = { u0: 1.4, v0: 7.2, u1: 11.2, v1: 10.9 };
	const photoPoly = onSheet([[photo.u0, photo.v0], [photo.u1, photo.v0], [photo.u1, photo.v1], [photo.u0, photo.v1]]);
	const cup = onSheet([[5.0, 8.7], [5.3, 10.15], [7.3, 10.15], [7.6, 8.7]]);
	const rim = onSheet(ellipse(6.3, 8.7, 1.3, 0.28, 24));
	const saucer = onSheet(ellipse(6.3, 10.2, 2.2, 0.36, 28));
	const handle = onSheet(ellipse(7.85, 9.3, 0.42, 0.38, 16).slice(12).concat(ellipse(7.85, 9.3, 0.42, 0.38, 16).slice(0, 5)));
	const steam = [5.7, 6.3, 6.9].map((x, i) => line(onSheet([[x, 8.2], [x + 0.18, 7.95], [x - 0.12, 7.7], [x + 0.1, 7.45]]), { w: 0.7, seed: 450 + i, over: 0 }));
	const lit = hull([...saucer, ...cup, ...rim]);
	const tone = hatch(photoPoly, 0.85, 1.9, 440, { cluster: 5, skip: 0.15, trim: 0.15 }) + hatch(onSheet([[photo.u0, 9.4], [photo.u1, 9.4], [photo.u1, photo.v1], [photo.u0, photo.v1]]), -0.6, 1.6, 441, { cluster: 4, skip: 0.2 });
	const column = (u0: number, u1: number, vs: number[], seed: number) => vs.map((v, i) => textLine(u0, i === vs.length - 1 ? u0 + (u1 - u0) * 0.55 : u1, v, seed + i)).join('');
	const { u, v } = HOLE;
	return {
		bar: { tone: hatch(barPoly, 0.12, 2.3, 410, { cluster: 6, skip: 0.2 }), rule: line(onSheet([[0, bar], [SHEET_W, bar]]), { w: 0.9, seed: 411 }), dots: dots.join(''), url: outline(url, { w: 0.85, seed: 412 }), urlMatrix: sheetMatrix(3.45, 1.12) },
		mastMatrix: sheetMatrix(1.4, 3.2),
		mastRule: line(onSheet([[1.4, 3.75], [22.6, 3.75]]), { w: 0.8, seed: 420, over: 0.4 }) + line(onSheet([[1.4, 3.92], [22.6, 3.92]]), { w: 0.5, seed: 421, over: 0.2 }),
		titleMatrix: sheetMatrix(1.4, 5.25),
		bylineMatrix: sheetMatrix(1.45, 6.25),
		photo: {
			lit: pathOf(lit, true),
			tone,
			ink: outline(photoPoly, { w: 1.1, heavy: 0.9, centre: centreOf(photoPoly), seed: 442 }) + outline(cup, { w: 1, heavy: 0.8, centre: centreOf(cup), seed: 443 }) + outline(rim, { w: 0.8, seed: 444 }) + outline(saucer, { w: 0.9, heavy: 0.7, centre: centreOf(saucer), seed: 445 }) + line(handle, { w: 0.9, seed: 446, over: 0 }) + steam.join(''),
		},
		text:
			column(1.4, 11.2, [11.65, 12.4, 13.15, 13.9, 14.65], 460) +
			column(12.9, 22.6, [7.35, 8.05], 480) +
			column(u, 22.6, [v + PIECE.h + 0.75, v + PIECE.h + 1.5, v + PIECE.h + 2.25, v + PIECE.h + 3.0], 490),
	};
}

/** The cut: the desk seen through the hole, the sheet's own shadow along its upper and left edges, and the cut edge inked. */
function holeArt() {
	const ring = onSheet(holeRing());
	const { u, v } = HOLE;
	const floor = projAll([deskAt(u, v), deskAt(u + PIECE.w, v), deskAt(u + PIECE.w, v + PIECE.h), deskAt(u, v + PIECE.h)]);
	const shade = projAll([deskAt(u, v), deskAt(u + PIECE.w, v), deskAt(u + PIECE.w - 0.2, v + 0.28), deskAt(u + 0.3, v + 0.28), deskAt(u + 0.3, v + PIECE.h - 0.2), deskAt(u, v + PIECE.h)]);
	const wall = onSheet([[u + 0.02, v + 0.02], [u + PIECE.w - 0.04, v + 0.02], [u + PIECE.w - 0.04, v + 0.11], [u + 0.02, v + 0.11]]);
	const rnd = seeded(560);
	const corners = [0, 1, 2, 3].map((i) => {
		const a = ring[i]!;
		const b = ring[(i + 1) % 4]!;
		const reach = 2 + rnd() * 2.5;
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
		return stroke([[a[0] - ((b[0] - a[0]) / l) * reach, a[1] - ((b[1] - a[1]) / l) * reach], [a[0], a[1]]], { w: 0.5, seed: 561 + i, over: 0 });
	});
	return {
		desk: hatch(floor, -0.5, 4.2, 540, { cluster: 4, skip: 0.45, trim: 0.55 }),
		shade: pathOf(shade, true),
		shadeHatch: hatch(shade, -0.75, 1.2, 543, { cluster: 2, trim: 0.1 }) + hatch(shade, 0.6, 1.5, 544, { cluster: 2, skip: 0.2 }),
		wall: hatch(wall, 0.05, 0.9, 545, { cluster: 1, trim: 0 }),
		ink: outline(ring, { w: 1.5, heavy: 1.7, centre: centreOf(ring), seed: 550, over: 1.4 }) + corners.join(''),
	};
}

/** The like button as a paper piece, laid out in tenths of a unit and placed by a plane: once lying on the desk, once flush in the hole. */
function pieceArt(at: Plane, seed: number, lift: number) {
	const k = 0.1;
	const on = (pts: P[], l = 0) => at.on(pts.map(([x, y]) => [x * k, y * k] as P), l);
	const edge = at.on(jitter(resample([[0, 0], [PIECE.w, 0], [PIECE.w, PIECE.h], [0, PIECE.h]], 0.45, true), seed, 0.035));
	const { x0, y0, x1, y1 } = LAYOUT.pill;
	const pill = on(roundRect(x0, y0, x1, y1, 9.5, 6), 0.04);
	const side = on([[x1 - 2, y0 + 8], [x1 + 1.4, y0 + 9], [x1 + 1.4, y1 + 1.6], [x0 + 8, y1 + 1.6], [x0 + 8, y1]]);
	const spot = on(ellipse(SLOTS.now + 7, LAYOUT.baseline - 4.6, 9, 7, 30));
	const sinkFrom = at.on([[3.8, 1.5]], 0.04)[0]!;
	const sinkTo = at.on([[3.88, 1.6]], 0)[0]!;
	const thick = lift > 0 ? at.on([[0, PIECE.h], [PIECE.w, PIECE.h]], 0).concat(at.on([[PIECE.w, PIECE.h], [0, PIECE.h]], -lift)) : [];
	return {
		paper: pathOf(edge, true),
		thick: thick.length ? hatch(thick, 0.1, 0.8, seed + 20, { cluster: 1, trim: 0 }) + outline(thick, { w: 0.6, seed: seed + 21 }) : '',
		ink: outline(edge, { w: 1.4, heavy: 1.5, centre: centreOf(edge), seed: seed + 1 }),
		pill: {
			paper: pathOf(pill, true),
			wash: wash(pill, seed + 2, 1.3, 3),
			pool: wash(pool(pill, pill[10]!, 0.5), seed + 3, 0.5, 2),
			side: hatch(side, 0.95, 1.3, seed + 4, { cluster: 1 }),
			ink: outline(pill, { w: 1.3, heavy: 1.2, centre: centreOf(pill), seed: seed + 5 }),
			sink: `--sink-x:${r1(sinkTo[0] - sinkFrom[0])}px;--sink-y:${r1(sinkTo[1] - sinkFrom[1] + 0.8)}px`,
		},
		rowMatrix: at.matrix(0, LAYOUT.baseline * k, k),
		spot: { wash: wash(spot, seed + 10, 1.2, 3.5), pool: wash(pool(spot, centreOf(spot), 0.55), seed + 11, 0.5, 2.5), edge: wash(spot, seed + 12, 0.4, 3) },
	};
}

/** The piece on the desk, its shadow, and how far it travels on screen to land in the hole. */
function restArt() {
	const piece = pieceArt(onDesk, 600, REST.lift);
	const corners = [onDesk.at(0, 0), onDesk.at(PIECE.w, 0), onDesk.at(PIECE.w, PIECE.h), onDesk.at(0, PIECE.h)];
	const shadow = hull(corners.map((p) => proj(shadowOnDesk(p))).concat(projAll(corners.map((p) => [p[0], p[1], 0] as Point3))));
	const foot = hull([...onDesk.on([[0, PIECE.h], [PIECE.w, PIECE.h]], -REST.lift), ...onDesk.on([[0, PIECE.h], [PIECE.w, PIECE.h]], -REST.lift).map(([x, y]) => [x + CAST[0] * 0.4, y + CAST[1] * 0.4] as P)]);
	const from = proj(onDesk.at(PIECE.w / 2, PIECE.h / 2));
	const to = proj(inHole.at(PIECE.w / 2, PIECE.h / 2));
	const axisFrom = [proj(onDesk.at(0, PIECE.h / 2)), proj(onDesk.at(PIECE.w, PIECE.h / 2))] as const;
	const axisTo = [proj(inHole.at(0, PIECE.h / 2)), proj(inHole.at(PIECE.w, PIECE.h / 2))] as const;
	const angle = (a: readonly [P, P]) => Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]);
	const span = (a: readonly [P, P]) => Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]);
	const pencilLines = [
		[deskAt(REST.u - PIECE.w / 2 - 1.2, REST.v + PIECE.h / 2 + 0.6), deskAt(REST.u + PIECE.w / 2 + 0.6, REST.v + PIECE.h / 2 - 0.9)],
		[deskAt(REST.u - PIECE.w / 2 + 0.2, REST.v - PIECE.h / 2 - 0.9), deskAt(REST.u - PIECE.w / 2 - 0.4, REST.v + PIECE.h / 2 + 1)],
	].map(([a, b], i) => pathOf(jitter(resample(projAll([a!, b!]), 8), 660 + i, 0.8)));
	return {
		piece,
		shadow: { wash: wash(shadow, 610, 1.2, 3), hatch: hatch(shadow, -0.45, 2.4, 611, { cluster: 5, skip: 0.2 }) + hatch(shadow, 0.6, 2.2, 612, { cluster: 3, skip: 0.35 }), foot: hatch(foot, -0.5, 1.3, 613, { cluster: 2, trim: 0.2 }) },
		travel: `transform-origin:${r1(from[0])}px ${r1(from[1])}px;--dx:${r1(to[0] - from[0])}px;--dy:${r1(to[1] - from[1])}px;--turn:${Math.round(((angle(axisTo) - angle(axisFrom)) * 180) / Math.PI * 10) / 10}deg;--scale:${Math.round((span(axisTo) / span(axisFrom)) * 1000) / 1000}`,
		pencil: pencilLines.join(''),
	};
}

/** The pen stroke that crosses out the previous count, in the row's own tenths. */
function strike() {
	const rnd = seeded(500);
	const x = SLOTS.old;
	const pts: P[] = [
		[x - 1.4, -1.6 + rnd()],
		[x + 4.6, -3.2 + rnd() * 0.6],
		[x + 11, -5.6 + rnd()],
	];
	return { d: `M${r1(pts[0]![0])} ${r1(pts[0]![1])}Q${r1(pts[1]![0])} ${r1(pts[1]![1])} ${r1(pts[2]![0])} ${r1(pts[2]![1])}`, length: r1(lengthOf(pts) + 1) };
}

/** The paper tag tied to the hole's top-right corner, lying on the page above it, with the spot's id written on it. */
function tagArt() {
	const turn = 0.08;
	const o: P = [HOLE.u + PIECE.w - 4.6, HOLE.v - 2.0];
	const ax: P = [Math.cos(turn), Math.sin(turn)];
	const ay: P = [-Math.sin(turn), Math.cos(turn)];
	const at = (x: number, y: number): P => [o[0] + ax[0] * x + ay[0] * y, o[1] + ax[1] * x + ay[1] * y];
	const shape: P[] = [[0, 0], [2.7, 0], [3.3, 0.7], [2.7, 1.4], [0, 1.4]];
	const poly = onSheet(shape.map(([x, y]) => at(x, y)), 0.04);
	const hole = onSheet(ellipse(2.72, 0.7, 0.16, 0.16, 14).map(([x, y]) => at(x, y)), 0.05);
	const holeC = proj(sheetAt(...at(2.72, 0.7), 0.05));
	const knotUV: P = [HOLE.u + PIECE.w - 0.25, HOLE.v - 0.12];
	const knot = proj(sheetAt(knotUV[0], knotUV[1], 0.03));
	const string = resample([holeC, [(knot[0] + holeC[0]) / 2 + 6, (knot[1] + holeC[1]) / 2 - 2], knot], 2);
	const cast = onSheet(shape.map(([x, y]) => at(x + 0.08, y + 0.14)), 0);
	const tx = at(0.4, 0.98);
	const m = matrixOf(proj(sheetAt(tx[0], tx[1], 0.05)), proj(sheetAt(tx[0] + ax[0] * 0.1, tx[1] + ax[1] * 0.1, 0.05)), proj(sheetAt(tx[0] + ay[0] * 0.1, tx[1] + ay[1] * 0.1, 0.05)));
	return {
		cast: wash(cast, 700, 0.3, 0.8),
		paper: pathOf(poly, true),
		shade: hatch(poly, 1.2, 2.2, 701, { cluster: 3, skip: 0.3, trim: 0.5 }),
		ink: outline(poly, { w: 1.2, heavy: 1, seed: 702 }) + outline(hole, { w: 0.7, seed: 703 }),
		string: line(string, { w: 0.8, seed: 704, over: 0.6 }) + outline(onSheet(ellipse(knotUV[0], knotUV[1], 0.12, 0.1, 10), 0.04), { w: 0.8, seed: 705 }),
		matrix: m,
	};
}

/** The margin note under the desk, and its loose arrow up to the hole's lower edge. */
function noteArt() {
	const label: P = [WIDTH - 6, HEIGHT - 8];
	const aim = proj(sheetAt(HOLE.u + 3.4, HOLE.v + PIECE.h + 0.12));
	const from: P = [label[0] - 150, label[1] - 26];
	const arrow = resample([from, [(from[0] + aim[0]) / 2 + 16, (from[1] + aim[1]) / 2 + 6], [aim[0] + 3, aim[1] + 30], [aim[0], aim[1] + 3]], 3);
	const smooth = arrow.map((p, i, all) => (i === 0 || i === all.length - 1 ? p : ([(all[i - 1]![0] + p[0] + all[i + 1]![0]) / 3, (all[i - 1]![1] + p[1] + all[i + 1]![1]) / 3] as P)));
	const end = smooth.at(-1)!;
	const prev = smooth.at(-4)!;
	const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
	const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
	return {
		at: { x: r1(label[0]), y: r1(label[1]) },
		arrow: line(smooth, { w: 1.3, seed: 1300, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: 1301, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: 1302, over: 0.5 }),
	};
}

/** The whole scene, frozen into wired.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: sheetArt(),
		page: pageArt(),
		hole: holeArt(),
		placed: pieceArt(inHole, 800, 0),
		rest: restArt(),
		strike: strike(),
		tag: tagArt(),
		note: noteArt(),
	};
}
