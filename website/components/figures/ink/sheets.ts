// Flat sheets on the desk (a terminal, an editor, a browser, a slip, a folder) with printed rows and the pen marks a reader would add, frozen into one list of layers for DeskFigure.
import { centreOf, createCamera, ellipse, jitter, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from './desk.ts';
import { hatch, hull, lengthOf, line, outline, pathOf, pool, r1, resample, stroke, wash } from './ink.ts';
import { pencil } from './plane.ts';

export type { P, Point3 };

/** World units per text pixel, so a 10px row is half a world unit tall. */
const TEXT = 0.05;
const BAR = 1.5;
/** Character advance of the monospace face, as a share of its size. */
const MONO = 0.6;

export type Bar = 'terminal' | 'editor' | 'browser' | 'none';

export interface SheetSpec {
	readonly key: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly turn?: number;
	readonly bar?: Bar;
	/** The editor tab's file name or the browser's address. */
	readonly title?: string;
	readonly kraft?: boolean;
	/** Draw a folder's tab with this label instead of a curl. */
	readonly folder?: string;
	readonly curl?: boolean;
}

/** One printed run: its text and its class (`mono`, `dim`, `bold`, `ui`, `big`, `hand`, `num`), plus an optional code colour. */
export interface Run {
	readonly t: string;
	readonly c?: string;
	readonly tint?: 'kw' | 'fn' | 'str' | 'tag' | 'attr' | 'num' | 'err';
}

export interface Item {
	readonly key: number;
	readonly d: string;
	readonly cls: string;
	readonly style: string;
}

export interface TextItem {
	readonly key: number;
	readonly text: string;
	readonly cls: string;
	readonly style: string;
	readonly matrix: string;
}

export interface Layer {
	readonly key: number;
	readonly paths: Item[];
	readonly texts: TextItem[];
}

export interface DeskArt {
	readonly width: number;
	readonly height: number;
	/** The SVG viewBox. */
	readonly view: string;
	readonly layers: Layer[];
}

const SIZES: Record<string, number> = { mono: 10, dim: 10, bold: 10, num: 9, ui: 11, big: 15, hand: 10, small: 8 };

function sheetOf(s: SheetSpec) {
	const fold = s.curl === false || s.folder ? 9 : 1.86;
	const curl = 2.4;
	const k = Math.hypot(1 / s.w, 1 / s.h);
	const n: P = [1 / s.w / k, 1 / s.h / k];
	const c = Math.cos(s.turn ?? 0);
	const si = Math.sin(s.turn ?? 0);
	const local = (u: number, v: number): Point3 => {
		const e = (u / s.w + v / s.h - fold) / k;
		if (e <= 0) return [u, v, 0];
		const th = e / curl;
		const back = e - curl * Math.sin(th);
		return [u - n[0] * back, v - n[1] * back, curl * (1 - Math.cos(th))];
	};
	const at = (u: number, v: number, lift = 0): Point3 => {
		const [a, b, z] = local(u, v);
		return [s.x + a * c - b * si, s.y + a * si + b * c, z + 0.02 + lift];
	};
	const band = (e0: number, e1: number): P[] => {
		const seg = (e: number): P[] => {
			const f = fold + e * k;
			const a: P = [s.w * (f - 1), s.h];
			const b: P = [s.w, s.h * (f - 1)];
			return Array.from({ length: 16 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 15, a[1] + ((b[1] - a[1]) * i) / 15]);
		};
		return [...seg(e0), ...seg(e1).reverse()];
	};
	return { s, k, fold, curled: fold < 2, at, band };
}

export type Sheet = ReturnType<typeof sheetOf>;

function edgeOf(w: number, h: number): P[] {
	const pts: P[] = [];
	const n = 50;
	for (let i = 0; i < n; i++) pts.push([(i / n) * w, 0]);
	for (let i = 0; i < n; i++) pts.push([w, (i / n) * h]);
	for (let i = 0; i < n; i++) pts.push([w - (i / n) * w, h]);
	for (let i = 0; i < n; i++) pts.push([0, h - (i / n) * h]);
	return pts;
}

/** Where a pen mark starts in the press: its delay in ms. Leave it out for a mark that is always there. */
export type At = number | undefined;

/** Pen marks are drawn on, text and washes fade in, `gone` marks fade out: each at its own delay after a press. */
export type Motion = 'draw' | 'show' | 'gone' | 'sink' | 'pulse' | 'flash' | 'away' | '';

/**
 * A desk scene: give it every sheet first, so the camera can fit them; then print rows and add marks.
 * `extra` holds world points that must stay in view, such as a note written beside a sheet.
 */
export function desk(width: number, specs: readonly SheetSpec[], extra: Point3[] = [], view: { elevation?: number; azimuth?: number } = {}) {
	const sheets = new Map(specs.map((s) => [s.key, sheetOf(s)]));
	const bounds: Point3[] = [...extra];
	for (const sh of sheets.values()) {
		const { w, h } = sh.s;
		bounds.push(sh.at(-0.4, -0.6), sh.at(w + 0.6, -0.4), sh.at(-0.4, h + 0.9), sh.at(w + 0.9, h + 0.6), [sh.at(w, h)[0] + 1, sh.at(w, h)[1] + 1.2, 0]);
		if (sh.s.folder) bounds.push(sh.at(0, -1.6));
	}
	const cx = bounds.reduce((a, p) => a + p[0], 0) / bounds.length;
	const cy = bounds.reduce((a, p) => a + p[1], 0) / bounds.length;
	const cam = { azimuth: view.azimuth ?? 90, elevation: view.elevation ?? 64, distance: 110, target: [cx, cy, 0] as Point3 };
	const probe = createCamera({ width, height: width * 3, view: cam, bounds, pad: 6 });
	const ys = bounds.map((p) => probe.proj(p)[1]);
	const height = Math.ceil(Math.max(...ys) - Math.min(...ys) + 14);
	const { proj, projAll } = createCamera({ width, height, view: cam, bounds, pad: 6 });

	const layers: { paths: Omit<Item, 'key'>[]; texts: Omit<TextItem, 'key'>[] }[] = [];
	let layer = { paths: [] as Omit<Item, 'key'>[], texts: [] as Omit<TextItem, 'key'>[] };
	layers.push(layer);
	const next = () => {
		layer = { paths: [], texts: [] };
		layers.push(layer);
	};
	const motion = (m: Motion, at: At, extraStyle = '', until?: number) => {
		const parts = [extraStyle];
		if (m && at !== undefined) parts.push('--at:' + Math.round(at) + 'ms');
		if ((m === 'flash' || m === 'away') && at !== undefined) parts.push('--for:' + Math.round((until ?? at + 1000) - at) + 'ms');
		return parts.filter(Boolean).join(';');
	};
	const path = (d: string, cls: string, style = '') => {
		if (d) layer.paths.push({ d, cls, style });
	};
	const get = (key: string) => {
		const sh = sheets.get(key);
		if (!sh) throw new Error('no sheet ' + key);
		return sh;
	};
	const on = (sh: Sheet, pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(sh.at(u, v, lift)));
	const matrixAt = (sh: Sheet, u: number, v: number) => matrixOf(proj(sh.at(u, v)), proj(sh.at(u + TEXT, v)), proj(sh.at(u, v + TEXT)));

	/** Every sheet's paper, edge, curl, cast shadow and bar, in the order given; a sheet given later lies on top. */
	function lay(seed = 100) {
		let s = seed;
		for (const sh of sheets.values()) {
			s += 50;
			const { w, h, bar = 'none', title, kraft, folder } = sh.s;
			const sil = on(sh, edgeOf(w, h));
			const near = Array.from({ length: 14 }, (_, i) => sh.at(-0.3 + (i / 13) * w * (sh.curled ? (sh.fold - 1) * 0.92 : 1), h, -0.02));
			const right = Array.from({ length: 10 }, (_, i) => sh.at(w, (i / 9) * h * (sh.curled ? (sh.fold - 1) * 0.9 : 1), -0.02));
			const band3 = (pts: Point3[], dx: number, dy: number): P[] => [...projAll(pts), ...projAll(pts.map((p) => [p[0] + dx, p[1] + dy, 0] as Point3)).reverse()];
			const nearBand = band3(near, 0.4, 1.1);
			const rightBand = band3(right, 1.0, 0.4);
			path(pencil(projAll([sh.at(-1.6, 0), sh.at(w + 1.4, 0)]), s + 1) + pencil(projAll([sh.at(0, -0.8), sh.at(0, h + 1)]), s + 2), 'pencil');
			path(wash(nearBand, s + 4, 0.4, 1.4) + wash(rightBand, s + 5, 0.4, 1.4), 'shadow-wash light');
			path(hatch(nearBand, -0.5, 2.4, s + 6, { cluster: 6, skip: 0.25, trim: 0.5 }) + hatch(rightBand, -0.6, 2.6, s + 7, { cluster: 5, skip: 0.3, trim: 0.5 }), 'hatch deep');
			if (sh.curled) {
				const curlPts: Point3[] = [];
				for (let u = 0; u <= w; u += 0.5) for (let v = 0; v <= h; v += 0.5) if (u / w + v / h > sh.fold) curlPts.push(sh.at(u, v));
				curlPts.push(sh.at(w, h));
				const shadow = hull([...curlPts.map((p) => proj(shadowOnDesk(p))), ...on(sh, sh.band(0, 0.01).slice(0, 16))]);
				const core = hull([...curlPts.filter((p) => p[2] > 0.4).map((p) => proj(shadowOnDesk(p))), ...on(sh, sh.band(0.5, 0.51).slice(0, 16))]);
				path(wash(shadow, s + 10, 1.6, 2.5), 'shadow-wash');
				path(hatch(shadow, -0.35, 2.1, s + 11, { cluster: 5 }) + hatch(core, 0.7, 1.4, s + 12, { cluster: 3 }) + hatch(core, -1.1, 1.6, s + 13), 'hatch deep');
			}
			if (folder) {
				const tab = on(sh, [[0.4, 0.02], [0.9, -1.2], [0.9 + folder.length * 0.34 + 0.6, -1.2], [1.4 + folder.length * 0.34 + 0.8, 0.02]]);
				path(pathOf(tab, true), 'kraft');
				path(hatch(tab, 1.1, 2.2, s + 14, { cluster: 3, skip: 0.3 }), 'hatch light');
				path(outline(tab, { w: 1.2, heavy: 0.8, seed: s + 15 }), 'sheet-ink');
				layer.texts.push({ text: folder, cls: 'mono small', style: '', matrix: matrixAt(sh, 1.15, -0.32) });
			}
			path(pathOf(sil, true), kraft || folder ? 'kraft' : 'sheet-paper');
			if (kraft || folder) path(wash(sil, s + 16, 0.4, 1.2), 'kraft-wash');
			if (sh.curled) {
				const tipE = (2 - sh.fold) / sh.k;
				path([0.4, 0.6, 0.75].map((t, i) => line(on(sh, sh.band(tipE * t, tipE * t + 0.01).slice(0, 16)).slice(1, -1), { w: 0.55, seed: s + 17 + i, over: 1 })).join(''), 'sheet-ink');
			}
			path(outline(sil, { w: 2, heavy: 1.8, centre: centreOf(sil), seed: s + 20 }), 'sheet-ink');
			if (bar !== 'none') {
				const barPoly = on(sh, [[0, 0], [w, 0], [w, BAR], [0, BAR]]);
				const dots = [0.75, 1.4, 2.05].map((x, i) => outline(on(sh, ellipse(x, BAR / 2, 0.22, 0.22, 18)), { w: 0.9, seed: s + 30 + i }));
				path(hatch(barPoly, 0.12, 2.2, s + 33, { cluster: 6, skip: 0.2 }), 'sheet-hatch light');
				path(line(on(sh, [[0, BAR], [w, BAR]]), { w: 0.9, seed: s + 34 }) + dots.join(''), 'sheet-ink');
				if (title && bar !== 'terminal') {
					const len = title.length * 0.33 + 1.1;
					const u0 = bar === 'browser' ? 3.3 : 3;
					const pill = on(sh, bar === 'browser' ? roundRect(u0, 0.3, u0 + Math.max(len, 7), 1.2, 0.42, 4) : [[u0, BAR], [u0, 0.25], [u0 + len, 0.25], [u0 + len, BAR]]);
					path(pathOf(pill, true), 'sheet-paper');
					path(bar === 'browser' ? outline(pill, { w: 0.9, seed: s + 35 }) : line(pill, { w: 0.9, seed: s + 35 }), 'sheet-ink');
					layer.texts.push({ text: title, cls: 'mono small', style: '', matrix: matrixAt(sh, u0 + 0.5, 1.02) });
				}
			}
		}
		next();
	}

	/** Prints runs left to right from (u, v), in sheet units; returns the column positions so marks can land on characters. */
	function print(key: string, u: number, v: number, runs: readonly Run[], m: Motion = '', at?: At) {
		const sh = get(key);
		let col = 0;
		const starts: number[] = [];
		for (const run of runs) {
			const cls = run.c ?? 'mono';
			const size = SIZES[cls.split(' ')[0]!] ?? 10;
			const uu = u + col * 10 * MONO * TEXT;
			starts.push(uu);
			if (run.t.trim()) layer.texts.push({ text: run.t, cls: [cls, run.tint ? 'tint-' + run.tint : '', m].filter(Boolean).join(' '), style: motion(m, at), matrix: matrixAt(sh, uu, v) });
			col += run.t.length * (cls.startsWith('mono') || cls.startsWith('dim') || cls.startsWith('bold') || cls.startsWith('num') ? size / 10 : (size / 10) * 0.92);
		}
		return { u, v, col: (c: number) => u + c * 10 * MONO * TEXT, end: u + col * 10 * MONO * TEXT };
	}

	/** A plain monospace row; the shorthand most rows use. */
	const row = (key: string, u: number, v: number, text: string, c = 'mono', m: Motion = '', at?: At) => print(key, u, v, [{ t: text, c }], m, at);

	/** The column, in sheet units, of character `c` in a monospace row starting at `u`. */
	const col = (u: number, c: number) => u + c * 10 * MONO * TEXT;

	/** A loose highlighter pass over a span of a row: yellow marks what changes. */
	function swipe(key: string, u0: number, u1: number, v: number, m: Motion = '', at?: At, tone = 'yellow') {
		const sh = get(key);
		const blob = on(sh, roundRect(u0 - 0.12, v - 0.42, u1 + 0.12, v + 0.12, 0.22, 3));
		path(wash(blob, 700 + Math.round(u0 * 31 + v * 17), 0.5, 1.4) + wash(pool(blob, blob[0]!, 0.55), 720 + Math.round(u0 * 7 + v * 13), 0.3, 1), 'swipe ' + tone + ' ' + m, motion(m, at));
	}

	const penPath = (pts: P[], cls: string, m: Motion, at: At, seed: number, amount = 0.6, until?: number) => {
		const j = jitter(resample(pts, 3), seed, amount);
		const len = r1(lengthOf(j) + 4);
		path(pathOf(j), cls + ' ' + m, motion(m, at, '--l:' + len, until));
		return len;
	};

	/** A wavy pen line under a span, the way an editor marks a mistake. */
	function wavy(key: string, u0: number, u1: number, v: number, m: Motion = '', at?: At) {
		const sh = get(key);
		const pts: P[] = [];
		for (let u = u0; u <= u1 + 0.001; u += 0.06) pts.push(proj(sh.at(u, v + 0.16 + Math.sin(((u - u0) / 0.32) * Math.PI) * 0.07)));
		penPath(pts, 'pen squiggle', m, at, 800 + Math.round(u0 * 10), 0.15);
	}

	/** A pen ring around a span. */
	function ring(key: string, u0: number, u1: number, v: number, m: Motion = '', at?: At, h = 0.62) {
		const sh = get(key);
		const cx = (u0 + u1) / 2;
		const rx = (u1 - u0) / 2 + 0.3;
		const pts: P[] = Array.from({ length: 44 }, (_, i) => {
			const a = -2.2 + (i / 40) * Math.PI * 2.15;
			return proj(sh.at(cx + Math.cos(a) * rx, v - 0.22 + Math.sin(a) * h * (1 + i * 0.003)));
		});
		penPath(pts, 'pen', m, at, 820 + Math.round(u0 * 13 + v));
	}

	/** A straight pen stroke through a span, crossing it out. */
	function strike(key: string, u0: number, u1: number, v: number, m: Motion = '', at?: At, until?: number) {
		const sh = get(key);
		penPath([proj(sh.at(u0 - 0.15, v - 0.15)), proj(sh.at(u1 + 0.15, v - 0.3))], 'pen', m, at, 840 + Math.round(u0 * 9), 0.6, until);
	}

	/** A pen bracket down the left of rows v0 to v1. */
	function bracket(key: string, u: number, v0: number, v1: number, m: Motion = '', at?: At) {
		const sh = get(key);
		penPath(on(sh, [[u + 0.3, v0 - 0.5], [u, v0 - 0.45], [u, v1 + 0.1], [u + 0.3, v1 + 0.15]]), 'pen', m, at, 860 + Math.round(v0 * 11));
	}

	/** A hand tick or cross at (u, v). */
	function tick(key: string, u: number, v: number, m: Motion = '', at?: At, cross = false) {
		const sh = get(key);
		if (cross) {
			penPath(on(sh, [[u - 0.3, v - 0.6], [u + 0.3, v + 0.05]]), 'pen', m, at, 880 + Math.round(u * 7 + v));
			penPath(on(sh, [[u + 0.3, v - 0.62], [u - 0.28, v + 0.04]]), 'pen', m, at === undefined ? at : at + 160, 890 + Math.round(u * 7 + v));
		} else penPath(on(sh, [[u - 0.32, v - 0.25], [u - 0.08, v + 0.05], [u + 0.42, v - 0.7]]), 'pen', m, at, 880 + Math.round(u * 7 + v));
	}

	/** A small numbered pen circle at (u, v), like the rings beside a textbook column. */
	function number(key: string, u: number, v: number, n: string, m: Motion = '', at?: At) {
		const sh = get(key);
		const pts: P[] = Array.from({ length: 30 }, (_, i) => {
			const a = -1.6 + (i / 26) * Math.PI * 2;
			return proj(sh.at(u + Math.cos(a) * 0.46, v - 0.26 + Math.sin(a) * 0.46));
		});
		penPath(pts, 'pen', m, at, 900 + Math.round(u * 5 + v * 3));
		layer.texts.push({ text: n, cls: ['hand num-ring', m === 'draw' ? 'show' : m].filter(Boolean).join(' '), style: motion(m === 'draw' ? 'show' : m, at), matrix: matrixAt(sh, u - 0.16, v + 0.02) });
	}

	/** A pen arrow between two sheet points, curving by `bend` (sideways), or passing through `via` points. Points may be on different sheets. */
	function arrow(from: [string, number, number], to: [string, number, number], m: Motion = '', at?: At, bend = 0, pulse = false, via: [string, number, number][] = []) {
		const a = get(from[0]).at(from[1], from[2], 0.05);
		const b = get(to[0]).at(to[1], to[2], 0.05);
		let pts3: Point3[];
		if (via.length) {
			const knots = [a, ...via.map(([key, u, v]) => get(key).at(u, v, 0.3)), b];
			pts3 = [];
			for (let i = 0; i < knots.length - 1; i++) {
				const p0 = knots[Math.max(0, i - 1)]!;
				const p1 = knots[i]!;
				const p2 = knots[i + 1]!;
				const p3 = knots[Math.min(knots.length - 1, i + 2)]!;
				for (let s = 0; s < 14; s++) {
					const t = s / 14;
					const t2 = t * t;
					const t3 = t2 * t;
					const f = (q: number) => 0.5 * (2 * p1[q]! + (-p0[q]! + p2[q]!) * t + (2 * p0[q]! - 5 * p1[q]! + 4 * p2[q]! - p3[q]!) * t2 + (-p0[q]! + 3 * p1[q]! - 3 * p2[q]! + p3[q]!) * t3);
					pts3.push([f(0), f(1), f(2)]);
				}
			}
			pts3.push(b);
		} else {
			const mid: Point3 = [(a[0] + b[0]) / 2 + bend * -(b[1] - a[1]) * 0.15, (a[1] + b[1]) / 2 + bend * (b[0] - a[0]) * 0.15, 0.3];
			pts3 = Array.from({ length: 30 }, (_, i) => {
				const t = i / 29;
				const s = 1 - t;
				return [s * s * a[0] + 2 * s * t * mid[0] + t * t * b[0], s * s * a[1] + 2 * s * t * mid[1] + t * t * b[1], s * s * a[2] + 2 * s * t * mid[2] + t * t * b[2]];
			});
		}
		const pts = projAll(pts3);
		const tip = pts.at(-1)!;
		const back = pts.at(-4)!;
		const ang = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
		const head = (sp: number): P[] => [[tip[0] - Math.cos(ang + sp) * 8, tip[1] - Math.sin(ang + sp) * 8], tip];
		const seed = 940 + Math.round(a[0] * 3 + b[1] * 5);
		let len = 0;
		for (const cls of ['pen halo', 'pen']) {
			len = penPath(pts, cls, m, at, seed);
			const t2 = at === undefined ? at : at + len * 1.6;
			penPath(head(0.5), cls, m, t2, seed + 10);
			penPath(head(-0.5), cls, m, t2, seed + 20);
		}
		if (pulse && at !== undefined) path(pathOf(pts), 'pulse', '--at:' + Math.round(at) + 'ms;--l:' + r1(lengthOf(pts)));
	}

	/** A pink button printed on a sheet, raised a little off the paper; it sinks at `at`. */
	function button(key: string, u0: number, v0: number, u1: number, v1: number, label: string, at?: At) {
		const sh = get(key);
		const face = on(sh, roundRect(u0, v0, u1, v1, 0.35, 4), 0.05);
		const side = [...on(sh, [[u0 + 0.2, v1], [u1, v1], [u1, v0 + 0.25]], 0.05), ...on(sh, [[u1 + 0.14, v0 + 0.35], [u1 + 0.14, v1 + 0.14], [u0 + 0.3, v1 + 0.14]])];
		const st = motion('sink', at);
		path(hatch(hull(side), 1.05, 1.1, 980 + Math.round(u0 * 3), { cluster: 3, trim: 0.15 }), 'hatch', '');
		path(pathOf(face, true), 'sheet-paper sink', st);
		path(wash(on(sh, roundRect(u0 + 0.2, v0 + 0.2, u1 - 0.2, v1 - 0.2, 0.3, 3), 0.05), 985 + Math.round(u0), 0.4, 1.4), 'pink-wash sink', st);
		path(outline(face, { w: 1.3, heavy: 1.3, centre: centreOf(face), seed: 990 + Math.round(u0 * 7) }), 'sheet-ink sink', st);
		layer.texts.push({ text: label, cls: 'ui bold-ui', style: '', matrix: matrixAt(sh, u0 + 0.45, v1 - 0.42) });
	}

	/** A hand-drawn rectangle on a sheet: a box round a block, a slot, a station. */
	function box(key: string, u0: number, v0: number, u1: number, v1: number, m: Motion = '', at?: At, cls = 'pen') {
		const sh = get(key);
		penPath([...on(sh, roundRect(u0, v0, u1, v1, 0.25, 3)), proj(sh.at(u0 + 0.4, v0))], cls, m, at, 1000 + Math.round(u0 * 11 + v0 * 7));
	}

	/** Handwritten words on a sheet, in the margin-note face. */
	function hand(key: string, u: number, v: number, text: string, m: Motion = '', at?: At, c = 'hand') {
		const sh = get(key);
		layer.texts.push({ text, cls: [c, m === 'draw' ? 'show' : m].filter(Boolean).join(' '), style: motion(m === 'draw' ? 'show' : m, at), matrix: matrixAt(sh, u, v) });
	}

	/** A moving dot along the straight line between two sheet points, for a value travelling. */
	function pulse(from: [string, number, number], to: [string, number, number], at: number) {
		const pts = projAll([get(from[0]).at(from[1], from[2], 0.1), get(to[0]).at(to[1], to[2], 0.1)]);
		path(pathOf(resample(pts, 3)), 'pulse', '--at:' + at + 'ms;--l:' + r1(lengthOf(pts)));
	}

	/** The one margin note: capitals in the top-left corner, with a loose arrow to a sheet point. */
	function note(text: string, aim: [string, number, number], seed = 1200) {
		const end = proj(get(aim[0]).at(aim[1], aim[2]));
		const label: P = [6, 16];
		const from: P = [Math.min(label[0] + text.length * 6.4 + 10, end[0] - 30), label[1] + 6];
		const pts = resample([from, [from[0] + 14, from[1] + 12], [end[0] - 16, end[1] - 20], [end[0] - 3, end[1] - 4]], 3);
		const smooth = pts.map((p, i, all) => (i === 0 || i === all.length - 1 ? p : ([(all[i - 1]![0] + p[0] + all[i + 1]![0]) / 3, (all[i - 1]![1] + p[1] + all[i + 1]![1]) / 3] as P)));
		const tip = smooth.at(-1)!;
		const prev = smooth.at(-4)!;
		const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
		const head = (sp: number): P[] => [[tip[0] - Math.cos(ang + sp) * 8, tip[1] - Math.sin(ang + sp) * 8], tip];
		path(line(smooth, { w: 1.2, seed, over: 1 }) + stroke(head(0.45), { w: 1.2, seed: seed + 1, over: 0.5 }) + stroke(head(-0.45), { w: 1.2, seed: seed + 2, over: 0.5 }), 'desk-ink');
		layer.texts.push({ text, cls: 'margin-note', style: '', matrix: `matrix(1 0 0 1 ${label[0]} ${label[1]})` });
	}

	function build(): DeskArt {
		return {
			width,
			height,
			view: '0 0 ' + width + ' ' + height,
			layers: layers.filter((l) => l.paths.length || l.texts.length).map((l, i) => ({ key: i, paths: l.paths.map((p, k) => ({ key: k, ...p })), texts: l.texts.map((t, k) => ({ key: k, ...t })) })),
		};
	}

	/** Raw access for a figure's own shapes: add a path with its classes and motion style, or a text at a sheet point. */
	const raw = {
		path,
		text: (key: string, u: number, v: number, text: string, cls: string, m: Motion = '', at?: At) => layer.texts.push({ text, cls: [cls, m].filter(Boolean).join(' '), style: motion(m, at), matrix: matrixAt(get(key), u, v) }),
		/** A text placed with a matrix the figure built itself, such as on the top face of a block. */
		textWith: (matrix: string, text: string, cls: string, m: Motion = '', at?: At) => layer.texts.push({ text, cls: [cls, m].filter(Boolean).join(' '), style: motion(m, at), matrix }),
		/** Motion style for a mark shown only between `at` and `until` ('flash'), or hidden only then ('away'). */
		span: (m: 'flash' | 'away', at: number, until: number) => motion(m, at, '', until),
		motion,
		on: (key: string, pts: P[], lift = 0) => on(get(key), pts, lift),
		at: (key: string, u: number, v: number, lift = 0) => get(key).at(u, v, lift),
		proj,
		projAll,
		matrixAt: (key: string, u: number, v: number) => matrixAt(get(key), u, v),
	};

	return { lay, next, print, row, col, swipe, wavy, ring, strike, bracket, tick, number, arrow, button, box, hand, pulse, note, build, raw };
}
