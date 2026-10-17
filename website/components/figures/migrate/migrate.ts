// A terminal drawn on a sheet of paper on the desk, and below it the report the run writes: the routes and what serves each, and the old and new page side by side.
import { centreOf, createCamera, ellipse, jitter, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, pool, resample, stroke, wash } from '../ink/ink.ts';
import { pencil, plane, type Plane } from '../ink/plane.ts';
import { ROUTES, ROWS } from './model.ts';

export const WIDTH = 560;
export const HEIGHT = 610;

const SHEET_W = 23;
const BAR = 1.5;
const PITCH = 1;
const FIRST = BAR + 1.1;
const SHEET_H = FIRST + PITCH * (ROWS - 1) + 0.7;
const MARK = 0.9;
/** World units per text pixel. */
const TEXT = 0.05;
const FOLD = 1.9;
const CURL_R = 2.6;
const FOLD_K = Math.hypot(1 / SHEET_W, 1 / SHEET_H);
const FOLD_N: P = [1 / SHEET_W / FOLD_K, 1 / SHEET_H / FOLD_K];

const REPORT = { u: 0.3, v: SHEET_H + 1.7, w: 22.4, h: 11.4, turn: -0.008 };
const LIST = { head: 1.4, first: 3.1, step: 1.75, route: 0.8, served: 5.2, mark: 9.9 };
const THUMB = { w: 4.1, h: 5.4, v: 1.9, old: 12.7, new: 17.7 };

const sheetAt = (u: number, v: number, lift = 0): Point3 => {
	const e = (u / SHEET_W + v / SHEET_H - FOLD) / FOLD_K;
	if (e <= 0) return [u, v, 0.02 + lift];
	const th = e / CURL_R;
	const back = e - CURL_R * Math.sin(th);
	return [u - FOLD_N[0] * back, v - FOLD_N[1] * back, CURL_R * (1 - Math.cos(th)) + 0.02 + lift];
};

const { proj, projAll } = createCamera({
	width: WIDTH,
	height: HEIGHT,
	view: { azimuth: 90, elevation: 66, distance: 90, target: [11.5, 15, 0] },
	bounds: [[-1.2, -0.4, 0], [SHEET_W + 1.6, -0.4, 0], [-1.2, REPORT.v + REPORT.h + 1.4, 0], [SHEET_W + 1.6, REPORT.v + REPORT.h + 1.4, 0]],
	pad: 4,
});
const onSheet = (pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sheetAt(u, v, lift)));
const sheetMatrix = (u: number, v: number) => matrixOf(proj(sheetAt(u, v)), proj(sheetAt(u + TEXT, v)), proj(sheetAt(u, v + TEXT)));
const report: Plane = plane(proj, [REPORT.u, REPORT.v, 0.04], [Math.cos(REPORT.turn), Math.sin(REPORT.turn), 0], [-Math.sin(REPORT.turn), Math.cos(REPORT.turn), 0]);

function rectEdge(w: number, h: number, n = 60): P[] {
	const pts: P[] = [];
	for (let i = 0; i < n; i++) pts.push([(i / n) * w, 0]);
	for (let i = 0; i < n; i++) pts.push([w, (i / n) * h]);
	for (let i = 0; i < n; i++) pts.push([w - (i / n) * w, h]);
	for (let i = 0; i < n; i++) pts.push([0, h - (i / n) * h]);
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
	const sil = onSheet(rectEdge(SHEET_W, SHEET_H, 70));
	const tipE = (2 - FOLD) / FOLD_K;
	const curlPts: Point3[] = [];
	for (let u = 0; u <= SHEET_W; u += 0.5) for (let v = 0; v <= SHEET_H; v += 0.5) if (u / SHEET_W + v / SHEET_H > FOLD) curlPts.push(sheetAt(u, v));
	curlPts.push(sheetAt(SHEET_W, SHEET_H));
	const curlShadow = hull([...curlPts.map((p) => proj(shadowOnDesk(p))), ...onSheet(curlBand(0, 0.01).slice(0, 16))]);
	const curlCore = hull([...curlPts.filter((p) => p[2] > 0.4).map((p) => proj(shadowOnDesk(p))), ...onSheet(curlBand(0.5, 0.51).slice(0, 16))]);
	const near = Array.from({ length: 14 }, (_, i) => sheetAt(-0.3 + (i / 13) * SHEET_W * (FOLD - 1) * 0.92, SHEET_H, -0.04));
	const right = Array.from({ length: 10 }, (_, i) => sheetAt(SHEET_W, (i / 9) * SHEET_H * (FOLD - 1) * 0.9, -0.04));
	const nearBand = band(near, 0.4, 0.9);
	const rightBand = band(right, 1, 0.4);
	const barPoly = onSheet([[0, 0], [SHEET_W, 0], [SHEET_W, BAR], [0, BAR]]);
	const dots = [0.75, 1.4, 2.05].map((x, i) => outline(onSheet(ellipse(x, BAR / 2, 0.22, 0.22, 18)), { w: 0.9, seed: 140 + i }));
	const guides = [
		[sheetAt(-2, 0), sheetAt(SHEET_W + 2, 0)],
		[sheetAt(0, -0.8), sheetAt(0, SHEET_H + 1.2)],
		[sheetAt(SHEET_W, -0.8), sheetAt(SHEET_W, 7)],
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

/** One row slot on the terminal: where its text sits, and the pointer that marks keyboard focus on the line being typed. */
function rowsArt() {
	return Array.from({ length: ROWS }, (_, i) => {
		const v = FIRST + i * PITCH;
		const tip: P = [MARK - 0.3, v - 0.25];
		const pointer = [onSheet([[tip[0] - 0.6, tip[1] - 0.35], tip]), onSheet([[tip[0] - 0.6, tip[1] + 0.35], tip])];
		return { key: i, matrix: sheetMatrix(MARK, v), pointer: pointer.map((pts, k) => stroke(pts, { w: 1.6, seed: 260 + i * 2 + k, over: 0.4 })).join('') };
	});
}

/** A hand-drawn tick or cross, centred on (u, v) of the report. */
const tick = (u: number, v: number, seed: number) => stroke(report.on([[u - 0.35, v - 0.05], [u - 0.08, v + 0.28], [u + 0.45, v - 0.5]]), { w: 2, heavy: 1, seed, over: 0.6, wobble: 0.3 });
const cross = (u: number, v: number, seed: number) => stroke(report.on([[u - 0.32, v - 0.4], [u + 0.32, v + 0.25]]), { w: 2, seed, over: 0.5 }) + stroke(report.on([[u + 0.3, v - 0.42], [u - 0.3, v + 0.27]]), { w: 2, seed: seed + 1, over: 0.5 });

/** A loose hand-drawn loop round a spot: a little more than once round, wider on the second pass. */
const ring = (cx: number, cy: number, rx: number, ry: number): P[] => Array.from({ length: 48 }, (_, i) => {
	const a = -2.2 + (i / 47) * Math.PI * 2.25;
	const grow = 1 + (i / 47) * 0.1;
	return [cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow];
});

/** A small page, as the report's screenshot shows it after Settings is clicked: header, avatar, name, the pink Settings button with the pointer on it, and the settings panel it opens. */
function thumbArt(u0: number, seed: number) {
	const { w, h, v: v0 } = THUMB;
	const at = (pts: P[]) => report.on(pts.map(([x, y]) => [u0 + x, v0 + y] as P));
	const frame = at(jitter(resample(rectEdge(w, h, 20), 0.3, true), seed, 0.02));
	const button = at(roundRect(0.35, 2.2, 2.55, 2.8, 0.15, 3));
	const panel = at(roundRect(0.4, 3.15, w - 0.4, h - 0.4, 0.2, 3));
	const toggles = [3.75, 4.45].map((y, k) => {
		const pill = at(roundRect(2.6, y - 0.18, 3.35, y + 0.18, 0.18, 3));
		return stroke(at([[0.75, y], [2.1 - k * 0.4, y]]), { w: 0.9, seed: seed + 30 + k, over: 0 }) + outline(pill, { w: 0.8, seed: seed + 40 + k }) + outline(at(ellipse(3.15 - k * 0.35, y, 0.11, 0.11, 10)), { w: 1, seed: seed + 50 + k });
	});
	const cursor = at([[2.3, 2.5], [2.3, 3.25], [2.47, 3.07], [2.63, 3.35], [2.75, 3.29], [2.6, 3.02], [2.85, 2.99]]);
	return {
		cast: wash(hull([...frame, ...frame.map(([x, y]) => [x + 1.6, y + 2] as P)]), seed + 1, 0.3, 0.9),
		paper: pathOf(frame, true),
		ink: outline(frame, { w: 1.2, heavy: 1, centre: centreOf(frame), seed: seed + 2 }) + line(at([[0, 0.6], [w, 0.6]]), { w: 0.7, seed: seed + 3 }) + outline(at(ellipse(0.85, 1.4, 0.38, 0.38, 16)), { w: 0.9, seed: seed + 4 }) + stroke(at([[1.5, 1.2], [3.4, 1.2]]), { w: 1.1, seed: seed + 5, over: 0 }) + stroke(at([[1.5, 1.65], [2.8, 1.65]]), { w: 0.7, seed: seed + 6, over: 0 }),
		bar: hatch(at([[0, 0], [w, 0], [w, 0.6], [0, 0.6]]), 0.1, 1.6, seed + 7, { cluster: 4, skip: 0.2 }),
		button: { wash: wash(button, seed + 8, 0.6, 1.2), ink: outline(button, { w: 0.9, seed: seed + 9 }), matrix: report.matrix(u0 + 0.55, v0 + 2.64, TEXT) },
		cursor: pathOf(cursor, true),
		cursorInk: outline(cursor, { w: 0.7, seed: seed + 10 }),
		panel: { paper: pathOf(panel, true), tone: hatch(panel, 0.9, 1.9, seed + 11, { cluster: 3, skip: 0.3 }), ink: outline(panel, { w: 1, heavy: 0.9, centre: centreOf(panel), seed: seed + 12 }) + toggles.join('') },
		gap: pencil(panel, seed + 13, true, 1),
		ring: stroke(at(ring(w / 2, (3.15 + h - 0.4) / 2, w / 2 + 0.2, (h - 3.55) / 2 + 0.4)), { w: 1.7, heavy: 0.6, seed: seed + 14, over: 0.8, wobble: 0.4 }),
		label: report.matrix(u0, v0 - 0.45, TEXT),
	};
}

/** The report lying under the terminal: paper and shadow, the route list with a wash for the route Markless serves, the two screenshots, and where the JavaScript line sits. */
function reportArt() {
	const { w, h } = REPORT;
	const sil = report.on(jitter(resample(rectEdge(w, h, 1), 0.5, true), 500, 0.03));
	const corners: Point3[] = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => report.at(x!, y!));
	const shadow = hull([...corners.map((p) => proj(shadowOnDesk([p[0], p[1], 0.35]))), ...projAll(corners.map((p) => [p[0], p[1], 0] as Point3))]);
	const near = band(Array.from({ length: 12 }, (_, i) => report.at((i / 11) * w, h, -0.04)), 0.4, 0.9);
	const routes = ROUTES.map((_, i) => {
		const v = LIST.first + i * LIST.step;
		const spot = report.on(roundRect(LIST.served - 0.3, v - 0.82, LIST.served + 3.9, v + 0.32, 0.3, 3));
		return {
			key: i,
			route: report.matrix(LIST.route, v, TEXT),
			served: report.matrix(LIST.served, v, TEXT),
			wash: wash(spot, 520 + i, 1, 2.2),
			pool: wash(pool(spot, spot[0]!, 0.55), 530 + i, 0.4, 1.2),
			rule: pencil(report.on([[LIST.route - 0.2, v + 0.6], [LIST.mark + 0.8, v + 0.6]]), 540 + i),
		};
	});
	const account = LIST.first + 2 * LIST.step;
	const js = report.on(roundRect(THUMB.old - 0.3, h - 1.55, THUMB.old + 7.9, h - 0.35, 0.3, 3));
	return {
		shadow: { wash: wash(shadow, 501, 1.2, 3), hatch: hatch(shadow, -0.45, 2.6, 502, { cluster: 5, skip: 0.25, trim: 0.4 }) },
		desk: hatch(near, -0.55, 2.5, 503, { cluster: 6, skip: 0.3, trim: 0.5 }),
		paper: pathOf(sil, true),
		ink: outline(sil, { w: 1.8, heavy: 1.6, centre: centreOf(sil), seed: 504 }),
		pencil: pencil(report.on([[THUMB.old - 0.6, 0.4], [THUMB.old - 0.6, h - 0.4]]), 505) + pencil(report.on([[0.5, LIST.head + 0.45], [LIST.mark + 0.8, LIST.head + 0.45]]), 506),
		head: { route: report.matrix(LIST.route, LIST.head, TEXT), served: report.matrix(LIST.served, LIST.head, TEXT) },
		routes,
		tick: tick(LIST.mark, account - 0.3, 550),
		cross: cross(LIST.mark, account - 0.3, 552),
		live: report.matrix(LIST.mark - 0.15, account, TEXT),
		old: thumbArt(THUMB.old, 600),
		fresh: thumbArt(THUMB.new, 700),
		caption: report.matrix(THUMB.old, THUMB.v + THUMB.h + 0.95, TEXT),
		js: { label: report.matrix(THUMB.old, h - 1.95, TEXT), wash: wash(js, 560, 1, 2.2), pool: wash(pool(js, js[0]!, 0.55), 561, 0.4, 1.2) },
		jsAt: report.matrix(THUMB.old, h - 0.65, TEXT),
	};
}

/** The whole scene, frozen into migrate.art.ts. */
export function drawing() {
	return { width: WIDTH, height: HEIGHT, sheet: sheetArt(), rows: rowsArt(), report: reportArt() };
}
