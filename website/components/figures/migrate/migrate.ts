// Two browser sheets on the desk, the old app and the new one, a front door wired to each page, and between the sheets the two versions of a page held side by side for the check.
import { add3, cross3, dot3, lerp3, mul3, sub3, unit3 } from '../kit/lathe.ts';
import { bezier, centreOf, createCamera, ellipse, LIGHT, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, pool, r1, resample, seeded, stroke, wash } from '../ink/ink.ts';
import { pencil } from '../ink/plane.ts';
import { type Kind, PAGES } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 468;

const BAR = 1.3;
/** World units per text pixel: a matrix maps one text pixel to this much of the sheet. */
const TEXT = 0.052;

interface SheetSpec {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly turn: number;
	readonly fold: number;
	readonly curl: number;
}

const OLD: SheetSpec = { x: 0, y: 0, w: 12.4, h: 9.3, turn: 0.012, fold: 1.87, curl: 1.9 };
const NEW: SheetSpec = { x: 21.7, y: 0.15, w: 12.4, h: 9.3, turn: -0.01, fold: 1.87, curl: 1.9 };
const DOOR: SheetSpec = { x: 10.25, y: 12.5, w: 13.6, h: 4.7, turn: 0.006, fold: 1.9, curl: 1.3 };

/** A sheet lying on the desk: page coordinates (u, v) to world, its near right corner curling up past a diagonal fold. */
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
type Sheet = ReturnType<typeof sheet>;

const oldSheet = sheet(OLD);
const newSheet = sheet(NEW);
const door = sheet(DOOR);

/** The two cards held up for the check, lying side by side between the sheets. */
const CARD = { w: 3.55, h: 6.2, y: 1.2, gap: 1.15, lift: 0.3, head: 1.05 };
const CARD_X = [17 - CARD.gap / 2 - CARD.w, 17 + CARD.gap / 2];

const BOXES = {
	old: { x: 0.5, y: -4.9, w: 4.4, d: 3.6, h: 3.1 },
	fresh: { x: 30.7, y: -2.0, w: 1.5, d: 1.05, h: 0.55 },
};

const { proj, projAll, EYE } = createCamera({
	width: WIDTH,
	height: HEIGHT,
	view: { azimuth: 90, elevation: 60, distance: 100, target: [17, 6, 0] },
	bounds: [oldSheet.at(-0.4, -0.5), newSheet.at(NEW.w + 0.4, -0.5), oldSheet.at(-0.4, OLD.h + 0.6), newSheet.at(NEW.w + 0.8, NEW.h + 0.6), door.at(-0.3, DOOR.h + 1.3), [BOXES.old.x, BOXES.old.y, BOXES.old.h], [17, -5.6, 0], [-0.6, 6, 0], [34.6, 6, 0]],
	pad: 4,
});

const CAST: P = (() => {
	const a = proj([0, 0, 0]);
	const b = proj([-LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2], 0]);
	return [b[0] - a[0], b[1] - a[1]];
})();

const onSheet = (sh: Sheet, pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sh.at(u, v, lift)));
const sheetMatrix = (sh: Sheet, u: number, v: number, lift = 0) => matrixOf(proj(sh.at(u, v, lift)), proj(sh.at(u + TEXT, v, lift)), proj(sh.at(u, v + TEXT, lift)));

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

/** One sheet on the desk: paper, edge, curl and its shadow, the shadow it casts, and a browser bar with three dots when `bar` is set. */
function paperArt(sh: Sheet, seed: number, bar: boolean) {
	const { w, h, fold } = sh.s;
	const sil = onSheet(sh, edgeOf(w, h));
	const tipE = (2 - fold) / sh.k;
	const curlPts: Point3[] = [];
	for (let u = 0; u <= w; u += 0.4) for (let v = 0; v <= h; v += 0.4) if (u / w + v / h > fold) curlPts.push(sh.at(u, v));
	curlPts.push(sh.at(w, h));
	const curlShadow = hull([...curlPts.map((p) => proj(shadowOnDesk(p))), ...onSheet(sh, sh.band(0, 0.01).slice(0, 16))]);
	const curlCore = hull([...curlPts.filter((p) => p[2] > 0.3).map((p) => proj(shadowOnDesk(p))), ...onSheet(sh, sh.band(0.4, 0.41).slice(0, 16))]);
	const near = Array.from({ length: 14 }, (_, i) => sh.at(-0.3 + (i / 13) * w * (fold - 1) * 0.92, h, -0.02));
	const right = Array.from({ length: 10 }, (_, i) => sh.at(w, (i / 9) * h * (fold - 1) * 0.9, -0.02));
	const nearBand = band3(near, 0.45, 1.1);
	const rightBand = band3(right, 1.1, 0.45);
	const barPoly = onSheet(sh, [[0, 0], [w, 0], [w, BAR], [0, BAR]]);
	const dots = [0.6, 1.15, 1.7].map((x, i) => outline(onSheet(sh, ellipse(x, BAR / 2, 0.19, 0.19, 16)), { w: 0.85, seed: seed + 40 + i }));
	return {
		paper: pathOf(sil, true),
		ink: outline(sil, { w: 2.1, heavy: 1.8, centre: centreOf(sil), seed: seed + 1 }),
		desk: hatch(nearBand, -0.5, 2.4, seed + 2, { cluster: 6, skip: 0.25, trim: 0.5 }) + hatch(rightBand, -0.6, 2.6, seed + 3, { cluster: 5, skip: 0.3, trim: 0.5 }),
		deskWash: wash(nearBand, seed + 4, 0.4, 1.4) + wash(rightBand, seed + 5, 0.4, 1.4),
		curl: {
			shadow: wash(curlShadow, seed + 10, 1.4, 2.2),
			hatch: hatch(curlShadow, -0.35, 2.1, seed + 11, { cluster: 5 }) + hatch(curlCore, 0.7, 1.4, seed + 12, { cluster: 3 }) + hatch(curlCore, -1.1, 1.6, seed + 13),
			ink: [0.4, 0.62, 0.8].map((t, i) => line(onSheet(sh, sh.band(tipE * t, tipE * t + 0.01).slice(0, 16)).slice(1, -1), { w: 0.5, seed: seed + 14 + i, over: 1 })).join(''),
		},
		bar: bar ? { tone: hatch(barPoly, 0.12, 2.2, seed + 30, { cluster: 6, skip: 0.2 }), ink: line(onSheet(sh, [[0, BAR], [w, BAR]]), { w: 0.85, seed: seed + 31 }) + dots.join('') } : { tone: '', ink: '' },
	};
}

/** Maps a page's own unit square onto the desk: (0,0) its top left, (1,1) its bottom right. */
type Place = (x: number, y: number) => P;

interface Mini {
	readonly ink: string;
	readonly tone: string;
	/** The part the agent's first version can leave out: only the account page's settings button. */
	readonly extra: string;
	readonly extraTone: string;
}

const lineAt = (place: Place, x0: number, x1: number, y: number, seed: number, w: number) => stroke([place(x0, y), place(x1, y)], { w, seed, over: 0.2, wobble: 0.2 });
const rectAt = (place: Place, x0: number, y0: number, x1: number, y1: number, r = 0.02) => roundRect(x0, y0, x1, y1, r, 3).map(([x, y]) => place(x, y));

/** Rows of a small page, for the check: top, middle and bottom. */
export const ROWS = [0.29, 0.56, 0.8] as const;

/** A small drawing of one page of the shop: a hero, three prices, a profile with its settings button, or a list of posts. */
function mini(kind: Kind, place: Place, seed: number, pen: number): Mini {
	const ink: string[] = [];
	let tone = '';
	let extra = '';
	let extraTone = '';
	const box = (x0: number, y0: number, x1: number, y1: number, s: number, shade = false) => {
		const pts = rectAt(place, x0, y0, x1, y1);
		ink.push(outline(pts, { w: pen, seed: s }));
		if (shade) tone += hatch(pts, 0.9, 1.25, s + 1, { cluster: 4, skip: 0.15, trim: 0.25 });
	};
	const text = (x0: number, x1: number, y: number, s: number) => ink.push(lineAt(place, x0, x1, y, s, pen * 0.9));
	ink.push(lineAt(place, 0.08, 0.92, 0.1, seed, pen * 0.7));
	if (kind === 'home') {
		box(0.1, 0.17, 0.9, 0.42, seed + 1, true);
		text(0.1, 0.84, 0.52, seed + 3);
		text(0.1, 0.62, 0.6, seed + 4);
		box(0.1, 0.73, 0.52, 0.87, seed + 5);
	} else if (kind === 'pricing') {
		for (let c = 0; c < 3; c++) {
			const x0 = 0.08 + c * 0.29;
			box(x0, 0.17, x0 + 0.25, 0.42, seed + 10 + c * 3);
			text(x0 + 0.05, x0 + 0.2, 0.26, seed + 11 + c * 3);
			text(x0 + 0.05, x0 + 0.15, 0.34, seed + 12 + c * 3);
		}
		text(0.1, 0.86, 0.52, seed + 20);
		text(0.1, 0.56, 0.6, seed + 21);
		box(0.28, 0.73, 0.72, 0.87, seed + 22);
	} else if (kind === 'account') {
		const face = ellipse(0.22, 0.29, 0.1, 0.1 * 0.62, 20).map(([x, y]) => place(x, y));
		ink.push(outline(face, { w: pen, seed: seed + 30 }));
		tone += hatch(face, 0.9, 1.25, seed + 31, { cluster: 3, trim: 0.2 });
		text(0.4, 0.86, 0.25, seed + 32);
		text(0.4, 0.7, 0.33, seed + 33);
		text(0.1, 0.84, 0.52, seed + 34);
		text(0.1, 0.66, 0.6, seed + 35);
		const button = rectAt(place, 0.1, 0.73, 0.62, 0.87);
		const gear = ellipse(0.2, 0.8, 0.045, 0.045 * 0.62, 14).map(([x, y]) => place(x, y));
		const teeth = Array.from({ length: 6 }, (_, k) => {
			const a = (k / 6) * Math.PI * 2;
			return stroke([place(0.2 + Math.cos(a) * 0.05, 0.8 + Math.sin(a) * 0.031), place(0.2 + Math.cos(a) * 0.075, 0.8 + Math.sin(a) * 0.046)], { w: pen * 0.9, seed: seed + 40 + k, over: 0, wobble: 0.05 });
		}).join('');
		extra = outline(button, { w: pen * 1.1, heavy: 0.6, seed: seed + 36 }) + outline(gear, { w: pen * 0.8, seed: seed + 37 }) + teeth + lineAt(place, 0.3, 0.54, 0.8, seed + 38, pen * 0.9);
		extraTone = hatch(button, 1.1, 1.5, seed + 39, { cluster: 3, skip: 0.3, trim: 0.3 });
	} else {
		for (let r = 0; r < 3; r++) {
			const y = 0.17 + r * 0.27;
			box(0.1, y, 0.3, y + 0.19, seed + 50 + r * 3, true);
			text(0.38, 0.88, y + 0.05, seed + 52 + r * 3);
			text(0.38, 0.7, y + 0.13, seed + 53 + r * 3);
		}
	}
	return { ink: ink.join(''), tone, extra, extraTone };
}

const TILE = { v0: 3.35, v1: 8.0, w: 2.6, pitch: 3.0, u0: 0.35 };
const tileU = (i: number) => TILE.u0 + i * TILE.pitch;
const tilePlace = (sh: Sheet, i: number, lift = 0): Place => (x, y) => proj(sh.at(tileU(i) + x * TILE.w, TILE.v0 + y * (TILE.v1 - TILE.v0), lift));
const tileRect = (sh: Sheet, i: number, lift = 0) => onSheet(sh, roundRect(tileU(i), TILE.v0, tileU(i) + TILE.w, TILE.v1, 0.12, 3), lift);

/** The browser sheet of one app: paper, bar, URL pill with the shop's address, the app's name, and where the pages sit. */
function appSheet(sh: Sheet, seed: number) {
	const pill = onSheet(sh, roundRect(2.4, 0.26, 8.4, 1.04, 0.38, 4));
	const guides = [
		[sh.at(-1.4, 0), sh.at(sh.s.w + 1.4, 0)],
		[sh.at(0, -0.8), sh.at(0, sh.s.h + 1)],
		[sh.at(sh.s.w, -0.8), sh.at(sh.s.w, 4)],
		[sh.at(-0.6, TILE.v0), sh.at(sh.s.w + 0.6, TILE.v0)],
	].map(([a, b], i) => pencil(projAll([a!, b!]), seed + 60 + i));
	return {
		...paperArt(sh, seed, true),
		pill: { paper: pathOf(pill, true), ink: outline(pill, { w: 0.85, seed: seed + 50 }), matrix: sheetMatrix(sh, 2.85, 0.86) },
		title: sheetMatrix(sh, 0.6, BAR + 1.25),
		slots: PAGES.map((_, i) => pencil(tileRect(sh, i), seed + 70 + i, true, 1)).join(''),
		pencil: guides.join(''),
	};
}

/** A tile of one page on a sheet: its paper, its frame, and the page drawn small. */
function tileArt(sh: Sheet, i: number, kind: Kind, seed: number) {
	const rect = tileRect(sh, i);
	const m = mini(kind, tilePlace(sh, i), seed + 10, 0.6);
	return { paper: pathOf(rect, true), frame: outline(rect, { w: 0.85, heavy: 0.6, seed }), ...m };
}

/** A tube lying on the desk from `points`, with its lit and shaded edges, twist ticks and the shadow it casts. */
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
	const lows: P[] = [];
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
		inner.push(proj(add3(p, mul3(n, side * radius * 0.6))));
		if (travelled >= nextTick && i > 2 && i < pts.length - 3) {
			nextTick += 1.2 + ((i * 37) % 7) * 0.12;
			const bulge = proj(add3(p, mul3(t, radius * 0.9)));
			const c = proj(p);
			const m: P = [bulge[0] * 2 - c[0], bulge[1] * 2 - c[1]];
			const arc: P[] = Array.from({ length: 7 }, (_, k) => {
				const s = (k / 6) * 0.75 + (i % 2) * 0.1;
				return [(1 - s) * (1 - s) * l[0] + 2 * s * (1 - s) * m[0] + s * s * r[0], (1 - s) * (1 - s) * l[1] + 2 * s * (1 - s) * m[1] + s * s * r[1]];
			});
			ticks += stroke(arc, { w: 0.4, seed: seed + 20 + i, over: 0, wobble: 0.1 });
		}
		lows.push(proj(shadowOnDesk(p, Math.min(0.02, p[2] - radius))));
	}
	const rnd = seeded(seed + 40);
	let tone = '';
	for (let i = 0; i < inner.length; i += 12) tone += rnd() < 0.8 ? stroke(inner.slice(i, i + 10), { w: 0.5, seed: seed + 41 + i, over: 0.3, wobble: 0.15 }) : '';
	const w = Math.max(3, radius * 14);
	const sh = resample(lows, 1.5);
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
		far.push([p[0] + nx * away * w * 0.7, p[1] + ny * away * w * 0.7]);
	});
	const under = [...near, ...far.reverse()];
	const centre = projAll(pts);
	return {
		paper: pathOf([...left, ...[...right].reverse()], true),
		ink: line(left, { w: 0.85, seed, over: 1 }) + line(right, { w: 1.4, seed: seed + 1, over: 1 }) + ticks + tone,
		shadow: stroke(sh, { w: Math.max(2.2, radius * 9), seed: seed + 2, wobble: 0.4, over: 0 }) + hatch(under, -0.6, 1.4, seed + 3, { cluster: 3, skip: 0.2 }),
		centre: pathOf(centre),
		length: r1(lengthOf2(centre)),
	};
}

const lengthOf2 = (pts: P[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

/** A small crocodile clip lying on a sheet, from its boot at `rear` to the jaw tips at `tip`, in that sheet's coordinates. */
function crocodile(sh: Sheet, rear: P, tip: P, seed: number) {
	const L = Math.hypot(tip[0] - rear[0], tip[1] - rear[1]);
	const ax: P = [(tip[0] - rear[0]) / L, (tip[1] - rear[1]) / L];
	const nx: P = [-ax[1], ax[0]];
	const W = 0.5;
	const at = (s: number, t: number): P => [rear[0] + ax[0] * s * L + nx[0] * t * W, rear[1] + ax[1] * s * L + nx[1] * t * W];
	const on = (pts: [number, number][], lift: number) => onSheet(sh, pts.map(([s, t]) => at(s, t)), lift);
	const boot = on([[0, -0.5], [0.34, -0.62], [0.36, 0.62], [0, 0.5]], 0.26);
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
	const upper = on(jaw(1), 0.3);
	const lower = on(jaw(-1), 0.26);
	const whole = hull([...boot, ...upper, ...lower]);
	const cast = onSheet(sh, [at(0.04, -0.6), at(1, -0.5), at(1.03, -0.9), at(0.08, -1)].map(([u, v]) => [u + 0.08, v + 0.12] as P), 0);
	return {
		cast: wash(cast, seed + 7, 0.3, 0.7),
		paper: pathOf(upper, true) + pathOf(lower, true),
		boot: pathOf(boot, true),
		wash: wash(hull([...upper, ...lower]), seed, 0.1, 0.5),
		side: hatch(lower, 1.2, 1, seed + 9, { cluster: 1, trim: 0.1 }),
		ink:
			outline(boot, { w: 0.9, heavy: 0.6, centre: centreOf(whole), seed: seed + 2 }) +
			outline(upper, { w: 0.8, heavy: 0.5, centre: centreOf(whole), seed: seed + 3 }) +
			outline(lower, { w: 0.9, heavy: 0.7, centre: centreOf(whole), seed: seed + 4 }),
	};
}

const SOCKET_U = (i: number) => 1.75 + i * 3.37;
const R = 0.2;

/** One page's wire from its socket on the front door to the clip on its tile, on the old sheet or the new one. */
function wire(i: number, sh: Sheet, seed: number) {
	const tipV = TILE.v1 - 0.35;
	const rearV = sh.s.h - 0.25;
	const u = tileU(i) + TILE.w / 2;
	const clip = crocodile(sh, [u + 0.05, rearV], [u, tipV], seed + 100);
	const end = sh.at(u + 0.05, rearV, R - 0.02);
	const plug = door.at(SOCKET_U(i), 0.15, R);
	const sag = 1.4 + (sh === oldSheet ? i : 3 - i) * 0.32;
	const pts = bezier(plug, add3(plug, [0, -sag - 0.4, 0]), [end[0], end[1] + sag, R], end, 48);
	const run = cord(pts.map((p) => [p[0], p[1], Math.max(p[2], R)] as Point3), R, seed);
	return { ...run, clip };
}

/** The front door: a card on the desk with the shop's address, a socket and a label for each page, and the button that moves the next one. */
function doorArt() {
	const sockets = PAGES.map((page, i) => {
		const u = SOCKET_U(i);
		const block = onSheet(door, roundRect(u - 0.42, -0.05, u + 0.42, 0.62, 0.1, 2), 0.12);
		const halfW = 0.28 + page.path.length * 0.2;
		const spot = onSheet(door, roundRect(u - halfW, 1.95, u + halfW, 2.95, 0.4, 3));
		return {
			key: i,
			paper: pathOf(block, true),
			ink: outline(block, { w: 0.9, heavy: 0.8, centre: centreOf(block), seed: 900 + i * 7 }) + stroke(onSheet(door, [[u - 0.15, 0.3], [u + 0.15, 0.3]], 0.13), { w: 1.4, seed: 901 + i * 7, over: 0 }),
			tone: hatch(block, 1.1, 1.2, 902 + i * 7, { cluster: 2, trim: 0.1 }),
			label: sheetMatrix(door, u, 2.72),
			wash: wash(spot, 903 + i * 7, 0.4, 1.4),
			pool: wash(pool(spot, spot[0]!, 0.55), 904 + i * 7, 0.2, 0.9),
		};
	});
	const doorway = onSheet(door, [[0.5, 1.45], [0.5, 0.5], [0.6, 0.3], [0.85, 0.2], [1.1, 0.3], [1.2, 0.5], [1.2, 1.45]]);
	const leaf = onSheet(door, [[0.62, 1.42], [0.62, 0.52], [0.72, 0.36], [0.85, 0.31], [0.98, 0.36], [1.08, 0.52], [1.08, 1.42]]);
	const BTN = { u0: 4.1, u1: 9.5, v0: 3.2, v1: 4.3 };
	const button = roundRect(BTN.u0, BTN.v0, BTN.u1, BTN.v1, 0.35, 4);
	const buttonPts = onSheet(door, button, 0.05);
	const side = [...onSheet(door, [[BTN.u0 + 0.2, BTN.v1], [BTN.u1, BTN.v1], [BTN.u1, BTN.v0 + 0.25]], 0.05), ...onSheet(door, [[BTN.u1 + 0.14, BTN.v0 + 0.35], [BTN.u1 + 0.14, BTN.v1 + 0.14], [BTN.u0 + 0.3, BTN.v1 + 0.14]])];
	const fill = onSheet(door, roundRect(BTN.u0 + 0.22, BTN.v0 + 0.2, BTN.u1 - 0.2, BTN.v1 - 0.18, 0.28, 3), 0.05);
	const centre = proj(door.at((BTN.u0 + BTN.u1) / 2, (BTN.v0 + BTN.v1) / 2));
	const sunk = proj(door.at((BTN.u0 + BTN.u1) / 2 + 0.06, (BTN.v0 + BTN.v1) / 2 + 0.1, -0.12));
	const guides = [
		[door.at(-1.2, 0), door.at(DOOR.w + 1.2, 0)],
		[door.at(0, -0.6), door.at(0, DOOR.h + 0.9)],
		[door.at(-0.4, 1.65), door.at(DOOR.w + 0.4, 1.65)],
	].map(([a, b], i) => pencil(projAll([a!, b!]), 960 + i));
	return {
		...paperArt(door, 800, false),
		title: sheetMatrix(door, 1.6, 1.25),
		doorway: line(doorway, { w: 1.2, seed: 940, over: 0.3 }) + line(leaf, { w: 0.6, seed: 943, over: 0.2 }) + line(onSheet(door, [[0.35, 1.47], [1.35, 1.47]]), { w: 1, seed: 944, over: 0.4 }) + outline(onSheet(door, ellipse(0.98, 0.95, 0.06, 0.06, 8)), { w: 0.8, seed: 941 }),
		doorTone: hatch(leaf, 1.2, 1.3, 945, { cluster: 3, trim: 0.2 }),
		rule: line(onSheet(door, [[0.45, 1.65], [DOOR.w - 0.45, 1.65]]), { w: 0.55, seed: 942, over: 0.4 }),
		sockets,
		button: {
			paper: pathOf(buttonPts, true),
			side: hatch(hull(side), 1.05, 1.1, 950, { cluster: 3, trim: 0.15 }),
			ink: outline(buttonPts, { w: 1.3, heavy: 1.3, centre: centreOf(buttonPts), seed: 951 }),
			wash: wash(fill, 952, 0.4, 1.4),
			pool: wash(pool(fill, fill[1]!, 0.5), 953, 0.3, 1),
			label: sheetMatrix(door, (BTN.u0 + BTN.u1) / 2, BTN.v1 - 0.33, 0.05),
			sink: `--sink-x:${r1(sunk[0] - centre[0])}px;--sink-y:${r1(sunk[1] - centre[1])}px`,
		},
		pencil: guides.join(''),
	};
}

/** The two cards held side by side for the check: their paper, edges and shadows, the address line on each, and where the ticks go. */
function cardFrame(k: number) {
	const x0 = CARD_X[k]!;
	const at = (u: number, v: number, lift = CARD.lift): Point3 => [x0 + u, CARD.y + v + (k ? 0.08 : -0.04), lift + (k ? 0.04 : 0)];
	const rect = projAll(roundRect(0, 0, CARD.w, CARD.h, 0.15, 3).map(([u, v]) => at(u, v)));
	const cast = hull([...projAll(roundRect(0, 0, CARD.w, CARD.h, 0.15, 3).map(([u, v]) => shadowOnDesk(at(u, v)))), ...rect.slice(0, 2)]);
	const place: Place = (x, y) => proj(at(0.12 + x * (CARD.w - 0.24), CARD.head + y * (CARD.h - CARD.head - 0.15)));
	return {
		key: k,
		at,
		place,
		paper: pathOf(rect, true),
		cast: wash(cast, 1000 + k, 0.3, 0.9),
		castHatch: hatch(cast, -0.55, 1.6, 1002 + k, { cluster: 4, skip: 0.2, trim: 0.3 }),
		ink: outline(rect, { w: 1.2, heavy: 1.2, centre: centreOf(rect), seed: 1004 + k }) + line(projAll([at(0.15, CARD.head - 0.25), at(CARD.w - 0.15, CARD.head - 0.25)]), { w: 0.5, seed: 1006 + k, over: 0.2 }),
		label: matrixOf(proj(at(CARD.w / 2, CARD.head - 0.45)), proj(at(CARD.w / 2 + TEXT, CARD.head - 0.45)), proj(at(CARD.w / 2, CARD.head - 0.45 + TEXT))),
	};
}

/** A pen tick and a pen cross for each row of the check, drawn between the two cards. */
function marks(seed: number) {
	const a = cardFrame(0);
	const b = cardFrame(1);
	return ROWS.map((y, row) => {
		const l = a.place(1, y);
		const r = b.place(0, y);
		const c: P = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
		const rnd = seeded(seed + row);
		const s = 6.5;
		const tick: P[] = resample([[c[0] - s * 0.55, c[1] - s * 0.05 + rnd()], [c[0] - s * 0.15, c[1] + s * 0.45], [c[0] + s * 0.25, c[1] - s * 0.3], [c[0] + s * 0.6, c[1] - s * (0.85 + rnd() * 0.15)]], 1);
		const x = s * 1.25;
		const cross = [
			[[c[0] - x * 0.45, c[1] - x * 0.5], [c[0] + x * 0.45, c[1] + x * 0.45]],
			[[c[0] + x * 0.45, c[1] - x * 0.5], [c[0] - x * 0.4, c[1] + x * 0.5]],
		] as P[][];
		return {
			key: row,
			tick: { d: pathOf(tick), length: r1(lengthOf2(tick) + 1) },
			cross: cross.map((seg, k) => stroke(seg, { w: 2.2, seed: seed + 10 + row * 2 + k, over: 0.6 })).join(''),
		};
	});
}

/** Everything about one page: its tile on each sheet, its wire to each, its two cards' drawings and the ring around a part the check found missing. */
function pageArt(i: number) {
	const page = PAGES[i]!;
	const a = cardFrame(0);
	const b = cardFrame(1);
	const ring = ellipse(0, 0, 1, 1, 24).map(([x, y]) => b.place(0.36 + x * 0.34, 0.8 + y * 0.14));
	return {
		key: i,
		rank: page.rank,
		late: page.miss ? 'yes' : 'no',
		oldTile: tileArt(oldSheet, i, page.kind, 1100 + i * 40),
		newTile: tileArt(newSheet, i, page.kind, 1300 + i * 40),
		oldWire: wire(i, oldSheet, 1500 + i * 30),
		newWire: wire(i, newSheet, 1700 + i * 30),
		oldCard: mini(page.kind, a.place, 1900 + i * 40, 0.75),
		newCard: mini(page.kind, b.place, 2100 + i * 40, 0.75),
		ring: page.miss ? pencil(ring, 2300 + i, true, 2) : '',
	};
}

/** A cardboard box on the desk with tape over the top and its shadow; `heavy` hatches it darker. */
function parcel(spec: { x: number; y: number; w: number; d: number; h: number }, seed: number, heavy: boolean) {
	const { x, y, w, d, h } = spec;
	const c: Point3[] = [[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]];
	const top = c.map((p) => [p[0], p[1], h] as Point3);
	const faces: { pts: Point3[]; n: Point3 }[] = [
		{ pts: top, n: [0, 0, 1] },
		{ pts: [c[3]!, c[2]!, top[2]!, top[3]!], n: [0, 1, 0] },
		{ pts: [c[1]!, c[2]!, top[2]!, top[1]!], n: [1, 0, 0] },
		{ pts: [c[0]!, c[3]!, top[3]!, top[0]!], n: [-1, 0, 0] },
	];
	const mid: Point3 = [x + w / 2, y + d / 2, h / 2];
	const seen = faces.filter((f) => dot3(f.n, sub3(EYE, mid)) > 0);
	const shadow = hull([...c, ...top].map((p) => proj(shadowOnDesk(p))));
	const all = hull(projAll([...c, ...top]));
	const tape = (u0: number, u1: number, v0: number, v1: number) => projAll([[x + u0, y + v0, h], [x + u1, y + v0, h], [x + u1, y + v1, h], [x + u0, y + v1, h]]);
	const tapeW = Math.min(w, d) * 0.16;
	const tapes = [tape(w / 2 - tapeW / 2, w / 2 + tapeW / 2, 0, d), tape(0, w, d / 2 - tapeW / 2, d / 2 + tapeW / 2)];
	const front = projAll([c[3]!, c[2]!, top[2]!, top[3]!]);
	const frontTape = projAll([[x + w / 2 - tapeW / 2, y + d, h], [x + w / 2 + tapeW / 2, y + d, h], [x + w / 2 + tapeW / 2, y + d, h * 0.55], [x + w / 2 - tapeW / 2, y + d, h * 0.62]]);
	let tone = '';
	seen.forEach((f, k) => {
		const lit = dot3(f.n, LIGHT);
		if (lit > 0.7) return;
		const poly = projAll(f.pts);
		tone += hatch(poly, f.n[0] ? 1.35 : 0.25, heavy ? 1.5 : 1.9, seed + 10 + k, { cluster: 4, skip: 0.15, trim: 0.2 });
		if (heavy && lit < 0.2) tone += hatch(poly, -0.5, 1.9, seed + 20 + k, { cluster: 3, skip: 0.3, trim: 0.3 });
	});
	return {
		shadow: wash(shadow, seed, 1, 1.6),
		shadowHatch: hatch(shadow, -0.4, heavy ? 1.3 : 1.8, seed + 1, { cluster: 5 }) + (heavy ? hatch(shadow, 0.8, 1.6, seed + 2, { cluster: 3 }) : ''),
		paper: seen.map((f) => pathOf(projAll(f.pts), true)).join(''),
		tape: tapes.map((t) => pathOf(t, true)).join('') + pathOf(frontTape, true),
		tone,
		ink:
			seen.map((f, k) => outline(projAll(f.pts), { w: heavy ? 1.5 : 1.1, heavy: 1.2, centre: centreOf(all), seed: seed + 30 + k })).join('') +
			[...tapes, frontTape].map((t, k) => outline(t, { w: 0.55, seed: seed + 40 + k })).join(''),
		front: centreOf(front),
		knot: proj([x + w / 2, y + d, h * 0.55]),
	};
}

/** A paper tag lying on the desk tied to a box, with the words on it. */
function tagArt(at: Point3, knot: P, seed: number) {
	const T = { w: 3.3, h: 1.05 };
	const turn = -0.05;
	const c = Math.cos(turn);
	const s = Math.sin(turn);
	const pt = (u: number, v: number): Point3 => [at[0] + u * c - v * s, at[1] + u * s + v * c, 0.03];
	const shape: P[] = [[0.35, 0], [T.w, 0], [T.w, T.h], [0.35, T.h], [0, T.h / 2]];
	const poly = projAll(shape.map(([u, v]) => pt(u, v)));
	const hole = projAll(ellipse(0.38, T.h / 2, 0.11, 0.11, 12).map(([u, v]) => pt(u, v)));
	const holeC = proj(pt(0.38, T.h / 2));
	const string = resample([knot, [(knot[0] + holeC[0]) / 2 - 3, (knot[1] + holeC[1]) / 2 + 6], holeC], 2);
	return {
		paper: pathOf(poly, true),
		cast: wash(poly.map(([px, py]) => [px + 1.2, py + 1.4] as P), seed, 0.2, 0.6),
		ink: outline(poly, { w: 1, heavy: 0.8, seed: seed + 1 }) + outline(hole, { w: 0.6, seed: seed + 2 }),
		string: line(string, { w: 0.7, seed: seed + 3, over: 0.4 }),
		matrix: matrixOf(proj(pt(0.75, T.h * 0.72)), proj(pt(0.75 + TEXT, T.h * 0.72)), proj(pt(0.75, T.h * 0.72 + TEXT))),
	};
}

function parcels() {
	const heavy = parcel(BOXES.old, 2500, true);
	const light = parcel(BOXES.fresh, 2600, false);
	return {
		old: { ...heavy, tag: tagArt([BOXES.old.x + BOXES.old.w + 0.5, -1.65, 0], heavy.knot, 2550) },
		fresh: { ...light, tag: tagArt([BOXES.fresh.x - 3.9, -1.75, 0], light.knot, 2650) },
	};
}

/** The margin note above the cards, and its loose arrow down to the marks between them. */
function noteArt() {
	const a = cardFrame(0);
	const b = cardFrame(1);
	const aim = (() => {
		const l = a.place(1, 0);
		const r = b.place(0, 0);
		return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2 - 4] as P;
	})();
	const label: P = [r1(WIDTH / 2), r1(proj([17, -4.5, 0])[1])];
	const from: P = [label[0] + 26, label[1] + 9];
	const arrow = resample([from, [from[0] + 14, from[1] + 20], [aim[0] + 14, aim[1] - 18], aim], 3);
	const smooth = arrow.map((p, i, all) => (i === 0 || i === all.length - 1 ? p : ([(all[i - 1]![0] + p[0] + all[i + 1]![0]) / 3, (all[i - 1]![1] + p[1] + all[i + 1]![1]) / 3] as P)));
	const end = smooth.at(-1)!;
	const prev = smooth.at(-4)!;
	const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
	const head = (sp: number): P[] => [[end[0] - Math.cos(ang + sp) * 8, end[1] - Math.sin(ang + sp) * 8], end];
	return {
		at: { x: label[0], y: label[1] },
		arrow: line(smooth, { w: 1.2, seed: 2700, over: 1 }) + stroke(head(0.45), { w: 1.2, seed: 2701, over: 0.5 }) + stroke(head(-0.45), { w: 1.2, seed: 2702, over: 0.5 }),
	};
}

/** The whole scene, frozen into migrate.art.ts. */
export function drawing() {
	const cards = [0, 1].map((k) => {
		const { at: _at, place: _place, ...rest } = cardFrame(k);
		return rest;
	});
	return {
		width: WIDTH,
		height: HEIGHT,
		old: appSheet(oldSheet, 100),
		fresh: appSheet(newSheet, 300),
		door: doorArt(),
		cards,
		marks: marks(2400),
		pages: PAGES.map((_, i) => pageArt(i)),
		parcels: parcels(),
		note: noteArt(),
	};
}
