// The terminal sheet from the create figure, now running the dev server, and below it a browser window drawn on a second sheet showing the starter page.
import { centreOf, createCamera, ellipse, type P, type Point3, roundRect, shadowOnDesk, matrixOf } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, pool, r1, resample, stroke, wash } from '../ink/ink.ts';
import { pencil } from '../ink/plane.ts';
import { SLOTS } from './model.ts';

export const WIDTH = 640;
export const HEIGHT = 520;

const BAR = 1.5;
const PITCH = 0.82;
const FIRST = BAR + 1.15;
/** Local text units per world unit: matrices map one text pixel to this many world units. */
const TEXT = 0.05;

interface SheetSpec {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly turn: number;
	readonly fold: number;
	readonly curl: number;
}

const TERM: SheetSpec = { x: 0, y: 0, w: 26, h: FIRST + PITCH * (SLOTS - 1) + 1.05, turn: 0, fold: 1.86, curl: 2.4 };
const PAGE: SheetSpec = { x: 0.7, y: TERM.h + 2.3, w: 17.2, h: 10, turn: -0.018, fold: 1.85, curl: 2.3 };

/** A sheet lying on the desk: page coordinates (u, v) to world, with its near right corner curling up past a diagonal fold. */
function sheet(s: SheetSpec) {
	const k = Math.hypot(1 / s.w, 1 / s.h);
	const n: P = [1 / s.w / k, 1 / s.h / k];
	const c = Math.cos(s.turn);
	const si = Math.sin(s.turn);
	const local = (u: number, v: number): Point3 => {
		const e = (u / s.w + v / s.h - s.fold) / k;
		if (e <= 0) return [u, v, 0];
		const th = e / s.curl;
		const back = e - s.curl * Math.sin(th);
		return [u - n[0] * back, v - n[1] * back, s.curl * (1 - Math.cos(th))];
	};
	const at = (u: number, v: number, lift = 0): Point3 => {
		const [a, b, z] = local(u, v);
		return [s.x + a * c - b * si, s.y + a * si + b * c, z + 0.02 + lift];
	};
	const band = (e0: number, e1: number): P[] => {
		const seg = (e: number): P[] => {
			const f = s.fold + e * k;
			const a: P = [s.w * (f - 1), s.h];
			const b: P = [s.w, s.h * (f - 1)];
			return Array.from({ length: 16 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 15, a[1] + ((b[1] - a[1]) * i) / 15]);
		};
		return [...seg(e0), ...seg(e1).reverse()];
	};
	return { s, k, at, band };
}

const term = sheet(TERM);
const page = sheet(PAGE);

const { proj, projAll } = createCamera({
	width: WIDTH,
	height: HEIGHT,
	view: { azimuth: 90, elevation: 62, distance: 96, target: [13, 13, 0] },
	bounds: [term.at(-0.3, -0.4), term.at(TERM.w + 0.3, -0.4), term.at(-0.3, TERM.h), [TERM.w + 0.6, TERM.h, 0], page.at(-0.3, PAGE.h + 1.2), [TERM.w + 0.4, PAGE.y + PAGE.h + 1.2, 0]],
	pad: 6,
});

type Sheet = ReturnType<typeof sheet>;
const onSheet = (sh: Sheet, pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sh.at(u, v, lift)));
const sheetMatrix = (sh: Sheet, u: number, v: number) => matrixOf(proj(sh.at(u, v)), proj(sh.at(u + TEXT, v)), proj(sh.at(u, v + TEXT)));

function edgeOf(w: number, h: number): P[] {
	const pts: P[] = [];
	const n = 60;
	for (let i = 0; i < n; i++) pts.push([(i / n) * w, 0]);
	for (let i = 0; i < n; i++) pts.push([w, (i / n) * h]);
	for (let i = 0; i < n; i++) pts.push([w - (i / n) * w, h]);
	for (let i = 0; i < n; i++) pts.push([0, h - (i / n) * h]);
	return pts;
}

function band3(pts: Point3[], dx: number, dy: number): P[] {
	const a = projAll(pts);
	const b = projAll(pts.map((p) => [p[0] + dx, p[1] + dy, 0] as Point3));
	return [...a, ...b.reverse()];
}

/** One sheet on the desk: paper, edge, curl and its shadow, the shadow it casts, and a hatched bar along the top with three dots. */
function paperArt(sh: Sheet, seed: number) {
	const { w, h, fold } = sh.s;
	const sil = onSheet(sh, edgeOf(w, h));
	const tipE = (2 - fold) / sh.k;
	const curlPts: Point3[] = [];
	for (let u = 0; u <= w; u += 0.5) for (let v = 0; v <= h; v += 0.5) if (u / w + v / h > fold) curlPts.push(sh.at(u, v));
	curlPts.push(sh.at(w, h));
	const curlShadow = hull([...curlPts.map((p) => proj(shadowOnDesk(p))), ...onSheet(sh, sh.band(0, 0.01).slice(0, 16))]);
	const curlCore = hull([...curlPts.filter((p) => p[2] > 0.4).map((p) => proj(shadowOnDesk(p))), ...onSheet(sh, sh.band(0.5, 0.51).slice(0, 16))]);
	const near = Array.from({ length: 14 }, (_, i) => sh.at(-0.3 + (i / 13) * w * (fold - 1) * 0.92, h, -0.02));
	const right = Array.from({ length: 10 }, (_, i) => sh.at(w, (i / 9) * h * (fold - 1) * 0.9, -0.02));
	const nearBand = band3(near, 0.5, 1.4);
	const rightBand = band3(right, 1.3, 0.5);
	const barPoly = onSheet(sh, [[0, 0], [w, 0], [w, BAR], [0, BAR]]);
	const dots = [0.75, 1.4, 2.05].map((x, i) => outline(onSheet(sh, ellipse(x, BAR / 2, 0.22, 0.22, 18)), { w: 0.9, seed: seed + 40 + i }));
	return {
		paper: pathOf(sil, true),
		ink: outline(sil, { w: 2.2, heavy: 1.9, centre: centreOf(sil), seed: seed + 1 }),
		desk: hatch(nearBand, -0.5, 2.4, seed + 2, { cluster: 6, skip: 0.25, trim: 0.5 }) + hatch(rightBand, -0.6, 2.6, seed + 3, { cluster: 5, skip: 0.3, trim: 0.5 }),
		deskWash: wash(nearBand, seed + 4, 0.4, 1.4) + wash(rightBand, seed + 5, 0.4, 1.4),
		curl: {
			shadow: wash(curlShadow, seed + 10, 1.6, 2.5),
			hatch: hatch(curlShadow, -0.35, 2.1, seed + 11, { cluster: 5 }) + hatch(curlCore, 0.7, 1.4, seed + 12, { cluster: 3 }) + hatch(curlCore, -1.1, 1.6, seed + 13),
			ink: [0.4, 0.6, 0.75].map((t, i) => line(onSheet(sh, sh.band(tipE * t, tipE * t + 0.01).slice(0, 16)).slice(1, -1), { w: 0.55, seed: seed + 14 + i, over: 1 })).join(''),
		},
		bar: { tone: hatch(barPoly, 0.12, 2.2, seed + 30, { cluster: 6, skip: 0.2 }), ink: line(onSheet(sh, [[0, BAR], [w, BAR]]), { w: 0.9, seed: seed + 31 }) + dots.join('') },
	};
}

const pct = (n: number, of: number) => `${r1((n / of) * 1000) / 10}%`;
/** The screen box of a polygon as CSS percentages of the figure, for the real button laid over the drawing. */
function boxOf(pts: P[]) {
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	return `left:${pct(x0, WIDTH)};top:${pct(y0, HEIGHT)};width:${pct(x1 - x0, WIDTH)};height:${pct(y1 - y0, HEIGHT)}`;
}

/** The terminal: its sheet, a text slot per row, the box a click focuses, and pencil guides. */
function terminalArt() {
	const guides = [
		[term.at(-2.4, 0), term.at(TERM.w + 2.4, 0)],
		[term.at(0, -0.8), term.at(0, TERM.h + 1.2)],
		[term.at(TERM.w, -0.8), term.at(TERM.w, 5)],
		[term.at(1.1, FIRST - 0.6), term.at(1.1, FIRST + PITCH * (SLOTS - 1) + 0.4)],
	].map(([a, b], i) => pencil(projAll([a!, b!]), 120 + i));
	return {
		...paperArt(term, 100),
		rows: Array.from({ length: SLOTS }, (_, i) => ({ key: i, matrix: sheetMatrix(term, 1.1, FIRST + i * PITCH) })),
		box: boxOf(onSheet(term, [[0, 0], [TERM.w, 0], [TERM.w, TERM.h], [0, TERM.h]])),
		pencil: guides.join(''),
	};
}

const PILL = { u0: 3.3, u1: 12.6, v0: 0.32, v1: 1.18 };
const HEAD = { u: 1.4, v: BAR + 2.75 };
const BUTTON = { u0: 1.4, u1: 7.7, v0: BAR + 4.05, v1: BAR + 6.05, mid: 4.75 };
/** The number's left edge on the button, and wash widths for one, two and three digits. */
const DIGIT = { u: 5.1, widths: [0.75, 1.35, 1.95] };

/** The browser window: sheet, URL pill, the starter's heading and Count button, the washes, and its pencil guides. */
function browserArt() {
	const pill = onSheet(page, roundRect(PILL.u0, PILL.v0, PILL.u1, PILL.v1, 0.42, 4));
	const button = roundRect(BUTTON.u0, BUTTON.v0, BUTTON.u1, BUTTON.v1, 0.4, 4);
	const buttonPts = onSheet(page, button, 0.05);
	const side = [...onSheet(page, [[BUTTON.u0 + 0.2, BUTTON.v1], [BUTTON.u1, BUTTON.v1], [BUTTON.u1, BUTTON.v0 + 0.25]], 0.05), ...onSheet(page, [[BUTTON.u1 + 0.16, BUTTON.v0 + 0.4], [BUTTON.u1 + 0.16, BUTTON.v1 + 0.16], [BUTTON.u0 + 0.35, BUTTON.v1 + 0.16]])];
	const fill = onSheet(page, roundRect(BUTTON.u0 + 0.25, BUTTON.v0 + 0.25, BUTTON.u1 - 0.2, BUTTON.v1 - 0.2, 0.3, 3), 0.05);
	const washes = DIGIT.widths.map((dw, i) => {
		const blob = onSheet(page, roundRect(DIGIT.u - 0.18, BUTTON.v0 + 0.45, DIGIT.u + dw, BUTTON.v1 - 0.45, 0.35, 3), 0.05);
		return { key: i, wash: wash(blob, 300 + i, 0.6, 1.5), pool: wash(pool(blob, blob[0]!, 0.55), 310 + i, 0.3, 1) };
	});
	const guides = [
		[page.at(-1.8, 0), page.at(PAGE.w + 1.6, 0)],
		[page.at(0, -0.8), page.at(0, PAGE.h + 1.2)],
		[page.at(HEAD.u, BAR + 0.9), page.at(HEAD.u, PAGE.h - 1.5)],
		[page.at(HEAD.u - 0.6, HEAD.v), page.at(11.5, HEAD.v)],
		[page.at(PAGE.w, -0.8), page.at(PAGE.w, 5.5)],
	].map(([a, b], i) => pencil(projAll([a!, b!]), 340 + i));
	return {
		...paperArt(page, 500),
		pill: { paper: pathOf(pill, true), ink: outline(pill, { w: 0.9, seed: 520 }), matrix: sheetMatrix(page, PILL.u0 + 0.55, PILL.v1 - 0.24) },
		nav: line(onSheet(page, [[3.05, 0.48], [2.75, 0.75], [3.05, 1.02]]), { w: 0.8, seed: 521, over: 0.3 }),
		head: sheetMatrix(page, HEAD.u, HEAD.v),
		button: {
			paper: pathOf(buttonPts, true),
			side: hatch(hull(side), 1.05, 1.1, 522, { cluster: 3, trim: 0.15 }),
			ink: outline(buttonPts, { w: 1.4, heavy: 1.4, centre: centreOf(buttonPts), seed: 523 }),
			wash: wash(fill, 524, 0.4, 1.4),
			pool: wash(pool(fill, fill[1]!, 0.5), 525, 0.3, 1),
			label: sheetMatrix(page, BUTTON.mid, BUTTON.v1 - 0.6),
			count: sheetMatrix(page, DIGIT.u, BUTTON.v1 - 0.6),
			box: boxOf(buttonPts),
		},
		washes,
		pencil: guides.join(''),
	};
}

/** The margin note right of the browser sheet, and its loose arrow left onto the page it names. */
function noteArt() {
	const aim = proj(page.at(BUTTON.u1 + 1.6, (HEAD.v + BUTTON.v0) / 2 + 0.2));
	const label: P = [WIDTH - 6, proj([PAGE.x + PAGE.w, PAGE.y + 3.4, 0])[1]];
	const from: P = [label[0] - 120, label[1] + 30];
	const arrow = resample([from, [from[0] - 8, from[1] + 22], [aim[0] + 40, aim[1] + 10], [aim[0] + 3, aim[1]]], 3);
	const smooth = arrow.map((p, i, all) => (i === 0 || i === all.length - 1 ? p : ([(all[i - 1]![0] + p[0] + all[i + 1]![0]) / 3, (all[i - 1]![1] + p[1] + all[i + 1]![1]) / 3] as P)));
	const end = smooth.at(-1)!;
	const prev = smooth.at(-4)!;
	const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
	const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
	return {
		at: { x: r1(label[0]), y: r1(label[1]) },
		file: { x: r1(label[0]), y: r1(label[1] + 18) },
		arrow: line(smooth, { w: 1.3, seed: 600, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: 601, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: 602, over: 0.5 }),
	};
}

/** The whole scene, frozen into dev-server.art.ts. */
export function drawing() {
	return { width: WIDTH, height: HEIGHT, terminal: terminalArt(), browser: browserArt(), note: noteArt() };
}
