// A terminal drawn on a sheet of paper lying on the desk, and below it an open folder where the files the starter writes land as small paper slips.
import { centreOf, createCamera, ellipse, jitter, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, pool, r1, resample, seeded, stroke, wash } from '../ink/ink.ts';
import { pencil, plane, type Plane } from '../ink/plane.ts';
import { MOST_FILES, NOTE_LINES, PER, ROWS } from './model.ts';

export const WIDTH = 640;
export const HEIGHT = 560;

/** The terminal sheet's corner on the desk; its width fits the longest hint line, its height the eleven rows. */
const SHEET_O: P = [2.2, 0];
const SHEET_W = 19.4;
const BAR = 1.5;
/** Row pitch on the terminal, in world units, the first row's baseline, and where a row's mark and text start. */
const PITCH = 1;
const FIRST = BAR + 1.1;
const SHEET_H = FIRST + PITCH * (ROWS - 1) + 0.7;
const MARK = 1;
/** The cursor wash and focus mark span the longest option label; shorter labels scale them down. */
const LABEL = { u0: MARK + 1.2, u1: MARK + 1.5 + 6.5 };
/** Local text units per world unit: matrices map one text pixel to this many world units. */
const TEXT = 0.05;
const FOLD = 1.9;
const CURL_R = 2.6;
const FOLD_K = Math.hypot(1 / SHEET_W, 1 / SHEET_H);
const FOLD_N: P = [1 / SHEET_W / FOLD_K, 1 / SHEET_H / FOLD_K];

/** Two columns sized to their longest file name: shared files on the left, the starter's own on the right. */
const COLS = [
	{ u: 0.4, w: 8.4 },
	{ u: 9.1, w: 9.8 },
];
const SLIP = { step: 0.86, top: 0.7, bottom: 8.4, dog: 0.62 };
const FOLDER = { u: 0, v: SHEET_H + 2.6, w: COLS[1]!.u + COLS[1]!.w + 0.4, h: SLIP.bottom + 0.4, tab: { u0: 0.5, u1: 8.4, h: 1.3 } };

const sheetLocal = (u: number, v: number): Point3 => {
	const e = (u / SHEET_W + v / SHEET_H - FOLD) / FOLD_K;
	if (e <= 0) return [u, v, 0];
	const th = e / CURL_R;
	const back = e - CURL_R * Math.sin(th);
	return [u - FOLD_N[0] * back, v - FOLD_N[1] * back, CURL_R * (1 - Math.cos(th))];
};
const sheetAt = (u: number, v: number, lift = 0): Point3 => {
	const [a, b, z] = sheetLocal(u, v);
	return [a + SHEET_O[0], b + SHEET_O[1], z + 0.02 + lift];
};

const { proj, projAll } = createCamera({
	width: WIDTH,
	height: HEIGHT,
	view: { azimuth: 90, elevation: 62, distance: 80, target: [12, 13.6, 0] },
	bounds: [[FOLDER.u - 5.2, -0.4, 0], [SHEET_O[0] + SHEET_W + 1.4, -0.4, 0], [FOLDER.u - 5.2, FOLDER.v + FOLDER.h + 1.2, 0], [FOLDER.w + 5.2, FOLDER.v + FOLDER.h + 1.2, 0], [FOLDER.w + 5.2, FOLDER.v - 1.4, 0]],
	pad: 4,
});
const onSheet = (pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sheetAt(u, v, lift)));
const sheetMatrix = (u: number, v: number) => matrixOf(proj(sheetAt(u, v)), proj(sheetAt(u + TEXT, v)), proj(sheetAt(u, v + TEXT)));
const folder: Plane = plane(proj, [FOLDER.u, FOLDER.v, 0.06], [1, 0, 0], [0, 1, 0]);

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

function band(pts: Point3[], dx: number, dy: number): P[] {
	const a = projAll(pts);
	const b = projAll(pts.map((p) => [p[0] + dx, p[1] + dy, 0] as Point3));
	return [...a, ...b.reverse()];
}

/** The terminal sheet: paper, curl, edge, its shadow on the desk, and a hatched title bar with three dots. */
function sheetArt() {
	const sil = onSheet(sheetEdge());
	const tipE = (2 - FOLD) / FOLD_K;
	const curlPts: Point3[] = [];
	for (let u = 0; u <= SHEET_W; u += 0.5) for (let v = 0; v <= SHEET_H; v += 0.5) if (u / SHEET_W + v / SHEET_H > FOLD) curlPts.push(sheetAt(u, v));
	curlPts.push(sheetAt(SHEET_W, SHEET_H));
	const curlShadow = hull([...curlPts.map((p) => proj(shadowOnDesk(p))), ...onSheet(curlBand(0, 0.01).slice(0, 16))]);
	const curlCore = hull([...curlPts.filter((p) => p[2] > 0.4).map((p) => proj(shadowOnDesk(p))), ...onSheet(curlBand(0.5, 0.51).slice(0, 16))]);
	const near = Array.from({ length: 14 }, (_, i) => sheetAt(-0.3 + (i / 13) * SHEET_W * (FOLD - 1) * 0.92, SHEET_H, -0.02));
	const right = Array.from({ length: 10 }, (_, i) => sheetAt(SHEET_W, (i / 9) * SHEET_H * (FOLD - 1) * 0.9, -0.02));
	const nearBand = band(near, 0.5, 1.2);
	const rightBand = band(right, 1.1, 0.5);
	const barPoly = onSheet([[0, 0], [SHEET_W, 0], [SHEET_W, BAR], [0, BAR]]);
	const dots = [0.75, 1.4, 2.05].map((x, i) => outline(onSheet(ellipse(x, BAR / 2, 0.22, 0.22, 18)), { w: 0.9, seed: 140 + i }));
	const guides = [
		[sheetAt(-2.4, 0), sheetAt(SHEET_W + 2.4, 0)],
		[sheetAt(0, -0.8), sheetAt(0, SHEET_H + 1.6)],
		[sheetAt(SHEET_W, -0.8), sheetAt(SHEET_W, 7)],
		[sheetAt(-1.6, SHEET_H), sheetAt(9, SHEET_H)],
		[sheetAt(MARK, FIRST - 0.6), sheetAt(MARK, FIRST + PITCH * (ROWS - 1) + 0.4)],
	].map(([a, b], i) => pencil(projAll([a!, b!]), 120 + i));
	return {
		paper: pathOf(sil, true),
		ink: outline(sil, { w: 2.2, heavy: 1.9, centre: centreOf(sil), seed: 101 }),
		desk: hatch(nearBand, -0.5, 2.4, 102, { cluster: 6, skip: 0.25, trim: 0.5 }) + hatch(rightBand, -0.6, 2.6, 103, { cluster: 5, skip: 0.3, trim: 0.5 }),
		deskWash: wash(nearBand, 104, 0.4, 1.4) + wash(rightBand, 105, 0.4, 1.4),
		curl: {
			shadow: wash(curlShadow, 110, 1.6, 2.5),
			hatch: hatch(curlShadow, -0.35, 2.1, 111, { cluster: 5 }) + hatch(curlCore, 0.7, 1.4, 112, { cluster: 3 }) + hatch(curlCore, -1.1, 1.6, 113),
			ink: [0.4, 0.6, 0.75].map((t, i) => line(onSheet(curlBand(tipE * t, tipE * t + 0.01).slice(0, 16)).slice(1, -1), { w: 0.55, seed: 114 + i, over: 1 })).join(''),
		},
		bar: { tone: hatch(barPoly, 0.12, 2.2, 130, { cluster: 6, skip: 0.2 }), ink: line(onSheet([[0, BAR], [SHEET_W, BAR]]), { w: 0.9, seed: 131 }) + dots.join('') },
		pencil: guides.join(''),
	};
}

/** One row slot on the terminal: where its text sits, the pink wash behind it when it is the highlighted option, and the ink underline and pointer that mark keyboard focus. */
function rowsArt() {
	return Array.from({ length: ROWS }, (_, i) => {
		const v = FIRST + i * PITCH;
		const strip = onSheet(roundRect(LABEL.u0, v - 0.66, LABEL.u1, v + 0.24, 0.3, 3));
		const left = proj(sheetAt(LABEL.u0, v));
		const under = onSheet([[LABEL.u0 + 0.1, v + 0.36], [(LABEL.u0 + LABEL.u1) / 2, v + 0.42], [LABEL.u1 + 0.2, v + 0.33]]);
		const tip: P = [MARK - 0.3, v - 0.25];
		const pointer = [onSheet([[tip[0] - 0.7, tip[1] - 0.4], tip]), onSheet([[tip[0] - 0.7, tip[1] + 0.4], tip])];
		return {
			key: i,
			matrix: sheetMatrix(MARK, v),
			origin: `transform-origin:${r1(left[0])}px ${r1(left[1])}px`,
			wash: wash(strip, 200 + i, 0.8, 1.8),
			pool: wash(pool(strip, strip[0]!, 0.55), 220 + i, 0.4, 1.2),
			underline: stroke(resample(under, 2), { w: 2, heavy: 1.2, seed: 240 + i, over: 1, wobble: 0.35 }),
			pointer: pointer.map((pts, k) => stroke(pts, { w: 1.7, seed: 260 + i * 2 + k, over: 0.4 })).join(''),
		};
	});
}

/** The folder lying open below the sheet: kraft back cover with a tab, its thickness, its shadow, and pencil guides for the slips. */
function folderArt() {
	const { w, h, tab } = FOLDER;
	const rnd = seeded(300);
	const edge: P[] = [[0, 0], [tab.u0, 0], [tab.u0 + 0.5, -tab.h], [tab.u1 - 0.5, -tab.h], [tab.u1, 0], [w, 0], [w, h], [0, h]];
	const outlinePts = folder.on(resample(edge, 0.5, true).map(([x, y]) => [x + (rnd() - 0.5) * 0.04, y + (rnd() - 0.5) * 0.04] as P));
	const thick = [...folder.on([[0, h], [w, h]], 0), ...folder.on([[w, h], [0, h]], -0.06)];
	const corners: Point3[] = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => folder.at(x!, y!));
	const shadow = hull([...corners.map((p) => proj(shadowOnDesk(p))), ...projAll(corners.map((p) => [p[0], p[1], 0] as Point3))]);
	const near = band(Array.from({ length: 12 }, (_, i) => [FOLDER.u + (i / 11) * w, FOLDER.v + h, 0] as Point3), 0.4, 1.3);
	const shade = folder.on([[w - 3.2, 0.2], [w - 0.1, 0.2], [w - 0.1, h - 0.1], [w - 1.6, h - 0.1]]);
	const guides = COLS.flatMap((c) => [c.u, c.u + c.w]).map((u, i) => pencil(projAll([folder.at(u, 0.2), folder.at(u, h - 0.2)]), 320 + i)).join('') + pencil(projAll([folder.at(0.2, SLIP.top), folder.at(w - 0.2, SLIP.top)]), 330);
	const cover = coverArt();
	return {
		shadow: { wash: wash(shadow, 301, 1.2, 3), hatch: hatch(shadow, -0.45, 2.6, 302, { cluster: 5, skip: 0.25, trim: 0.4 }) },
		desk: hatch(near, -0.55, 2.5, 303, { cluster: 6, skip: 0.3, trim: 0.5 }),
		paper: pathOf(outlinePts, true),
		tone: hatch(shade, 1.1, 2.6, 304, { cluster: 4, skip: 0.35, trim: 0.4 }),
		thick: hatch(thick, 0.05, 0.9, 305, { cluster: 1, trim: 0 }),
		ink: outline(outlinePts, { w: 1.8, heavy: 1.6, centre: centreOf(outlinePts), seed: 306 }),
		crease: line(folder.on([[0.4, 0.5], [w - 0.4, 0.5]]), { w: 0.5, seed: 307, over: 0.4 }),
		tabMatrix: folder.matrix(tab.u0 + 0.75, -0.36, TEXT),
		pencil: guides,
		cover,
	};
}

/** The front cover lying shut over the empty folder, its far corner turned up so it reads as a cover that is about to open. */
function coverArt() {
	const { w, h } = FOLDER;
	const at = plane(proj, folder.at(0.06, 0.72, 0.04), [1, 0, 0], [0, 1, 0]);
	const ch = h - 0.66;
	const c = 1.7;
	const edge: P[] = [[0, 0], [w - c, 0], [w, c], [w, ch], [0, ch]];
	const sil = at.on(jitter(resample(edge, 0.5, true), 340, 0.03));
	const flap = at.on(jitter(resample([[w - c, 0], [w, c], [w - c - 0.12, c + 0.1]], 0.4, true), 345, 0.02));
	const under = at.on([[w - c, 0], [w + 0.05, -0.05], [w, c]]);
	const hinge = proj(at.at(w / 2, ch));
	return {
		origin: `transform-origin:${r1(hinge[0])}px ${r1(hinge[1])}px`,
		paper: pathOf(sil, true),
		flap: pathOf(flap, true),
		gap: hatch(under, -0.9, 1.5, 346, { cluster: 3 }) + hatch(under, 0.4, 1.9, 347, { cluster: 3 }),
		tone: hatch(at.on([[w - 3.4, c + 0.3], [w - 0.15, c + 0.3], [w - 0.15, ch - 0.15], [w - 1.8, ch - 0.15]]), 1.05, 2.4, 341, { cluster: 4, skip: 0.3, trim: 0.4 }) + hatch(at.on([[0.2, ch - 0.9], [w - 0.2, ch - 0.9], [w - 0.2, ch - 0.15], [0.2, ch - 0.15]]), -0.2, 2.8, 342, { cluster: 5, skip: 0.45, trim: 0.5 }),
		ink: outline(sil, { w: 1.7, heavy: 1.6, centre: centreOf(sil), seed: 343 }) + outline(flap, { w: 1, heavy: 0.8, centre: centreOf(flap), seed: 344 }),
	};
}

/** Where a slot's sheet lies: its column, and its depth in the cascade. */
const slotAt = (slot: number) => ({ col: COLS[Math.floor(slot / PER)]!, depth: slot % PER });

/** One paper sheet per slot, laid down by hand a hair crooked; every sheet reaches the folder's foot so no kraft shows below the pile. */
function slipsArt() {
	return Array.from({ length: MOST_FILES }, (_, i) => {
		const rnd = seeded(400 + i * 17);
		const { col, depth } = slotAt(i);
		const top = SLIP.top + depth * SLIP.step + (rnd() - 0.5) * 0.05;
		const h = SLIP.bottom + (rnd() - 0.5) * 0.08 - top;
		const turn = (rnd() - 0.5) * 0.016;
		const u = col.u + (rnd() - 0.5) * 0.12;
		return { key: i, ...pileSheet(i, col.w, u, top, h, turn, rnd) };
	});
}

/** One sheet of the pile: paper, outline, dog-ear, ruled lines, the name's pink spot, and where its name and note are written. */
function pileSheet(i: number, sw: number, u: number, top: number, h: number, turn: number, rnd: () => number) {
	const U: Point3 = [Math.cos(turn), Math.sin(turn), 0];
	const V: Point3 = [-Math.sin(turn), Math.cos(turn), 0];
	const at = plane(proj, folder.at(u, top, 0.05 + i * 0.004), U, V);
	const dog = SLIP.dog;
	const edge: P[] = [[0, 0], [sw - dog, 0], [sw, dog], [sw, h], [0, h]];
	const sil = at.on(jitter(resample(edge, 0.35, true), 410 + i, 0.03));
	const fold = at.on([[sw - dog, 0], [sw - dog, dog], [sw, dog]]);
	const cast = hull([...at.on(edge), ...at.on(edge).map(([x, y]) => [x + 2.2, y + 2.6] as P)]);
	const spot = at.on(roundRect(0.12, 0.06, sw - 0.75, 0.76, 0.3, 3));
	const centre = proj(at.at(sw / 2, 0.4));
	const ys = Array.from({ length: 6 }, (_, k) => 1.12 + k * 0.36).filter((y) => y < h - 0.3);
	const lines = ys.map((y, k) => stroke(at.on([[0.4 + (k % 3 === 1 ? 0.5 : 0), y], [0.9 + rnd() * (sw - 2.6), y]]), { w: 0.55, seed: 450 + i * 7 + k, over: 0, wobble: 0.1 }));
	return {
		origin: `transform-origin:${r1(centre[0])}px ${r1(centre[1])}px`,
		cast: wash(cast, 430 + i, 0.3, 0.9),
		paper: pathOf(sil, true),
		ink: outline(sil, { w: 1.05, heavy: 1.1, centre: centreOf(sil), seed: 440 + i }) + line(fold, { w: 0.7, seed: 460 + i, over: 0.3 }),
		fold: pathOf(fold, true),
		rules: lines.join(''),
		wash: wash(spot, 470 + i, 1, 2.4),
		pool: wash(pool(spot, spot[0]!, 0.55), 490 + i, 0.4, 1.4),
		nameMatrix: at.matrix(0.32, 0.56, TEXT),
	};
}

/** A loose hand-drawn arrow from a margin note onto a sheet's name. */
function arrowTo(from: P, aim: P, seed: number, via: P[] = [[from[0] - 10, from[1] - 26], [aim[0] + 30, aim[1] + 2]]) {
	const arrow = resample([from, ...via, [aim[0] + 3, aim[1]]], 3);
	const smooth = arrow.map((p, i, all) => (i === 0 || i === all.length - 1 ? p : ([(all[i - 1]![0] + p[0] + all[i + 1]![0]) / 3, (all[i - 1]![1] + p[1] + all[i + 1]![1]) / 3] as P)));
	const end = smooth.at(-1)!;
	const prev = smooth.at(-4)!;
	const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
	const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
	return line(smooth, { w: 1.3, seed, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: seed + 1, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: seed + 2, over: 0.5 });
}

/** Where an arrow lands on a slot's sheet: just past the right column's edge, or on the right end of a left-column sheet. */
function aimAt(slot: number): P {
	const { col, depth } = slotAt(slot);
	const v = SLIP.top + depth * SLIP.step + 0.42;
	return proj(folder.at(slot < PER ? col.u - 0.15 : col.u + col.w + 0.15, v, 0.1));
}

/** A file note's arrow, from the margin on the sheet's own side of the folder. */
function fileArrow(slot: number, from: P) {
	const aim = aimAt(slot);
	const out = slot < PER ? -1 : 1;
	return arrowTo(from, aim, 620 + slot * 3, [[from[0] - 10 * out, (from[1] + aim[1]) / 2], [aim[0] + 24 * out, aim[1] + 1]]);
}

/** The margin notes: by default ONE FILE IS YOUR PAGE right of the folder, and for a hovered sheet its name and what it is for, in the margin on that sheet's side, with an arrow onto it. */
function noteArt() {
	const base = proj(folder.at(FOLDER.w, SLIP.top + 3.6, 0));
	const label: P = [WIDTH - 4, base[1]];
	const right = r1(proj(folder.at(FOLDER.w, SLIP.top + 2.4, 0))[0] + 16);
	const left = r1(proj(folder.at(FOLDER.u, SLIP.top + 2.4, 0))[0] - 26);
	const top = r1(base[1] - 34);
	const lines = Array.from({ length: NOTE_LINES }, (_, k) => r1(top + 20 + k * 15));
	return {
		at: { x: r1(label[0]), y: r1(label[1]), y2: r1(label[1] + 18) },
		arrow: arrowTo([label[0] - 92, label[1] - 22], aimAt(PER), 600),
		file: { right, left, y: top, lines },
		arrows: Array.from({ length: MOST_FILES }, (_, slot) => fileArrow(slot, slot < PER ? [left + 12, top - 4] : [right - 6, top - 4])),
	};
}

/** The whole scene, frozen into create.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: sheetArt(),
		rows: rowsArt(),
		folder: folderArt(),
		slips: slipsArt(),
		note: noteArt(),
	};
}
