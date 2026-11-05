// The How it works desk: one camera, flat and upright paper cards, boxes, text placed in perspective, and the margin note, all returned as layered plain data.
import { add3, cross3, dot3, mul3, sub3 } from '../kit/lathe.ts';
import { centreOf, createCamera, ellipse, jitter, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, pool, r1, resample, stroke, wash } from '../ink/ink.ts';

export type { P, Point3 };
export { ellipse, roundRect };

/** One painted layer: a CSS class and its path. */
export type Layer = { readonly key: string; readonly cls: string; readonly d: string };
/** One run of text lying in the scene. */
export type Words = { readonly key: string; readonly cls: string; readonly matrix: string; readonly text: string };

export interface DeskOptions {
	readonly width: number;
	readonly height: number;
	readonly bounds: Point3[];
	readonly target: Point3;
	readonly elevation?: number;
	readonly azimuth?: number;
	readonly distance?: number;
	/** Room left at the top for the margin note. */
	readonly headroom?: number;
}

/** A flat surface in the scene: an origin and two world axes, one unit of `u` and `v` each. */
export interface Surface {
	at(u: number, v: number, lift?: number): Point3;
	on(pts: P[], lift?: number): P[];
	/** A text matrix whose local unit is `unit` world units along the surface. */
	matrix(u: number, v: number, unit?: number, lift?: number): string;
}

export function createDesk({ width, height, bounds, target, elevation = 50, azimuth = 94, distance = 76, headroom = 30 }: DeskOptions) {
	const camera = createCamera({ width, height: height - headroom, view: { azimuth, elevation, distance, target }, bounds, pad: 6 });
	const at = (p: Point3): P => {
		const [x, y] = camera.proj(p);
		return [x, y + headroom];
	};
	const atAll = (pts: Point3[]): P[] => pts.map(at);
	const layers: Layer[] = [];
	const words: Words[] = [];
	let n = 0;
	const put = (cls: string, d: string) => {
		if (d) layers.push({ key: 'l' + n++, cls, d });
	};
	const say = (cls: string, matrix: string, text: string) => words.push({ key: 'w' + n++, cls, matrix, text });

	const surface = (O: Point3, U: Point3, V: Point3, N: Point3 = [0, 0, 1]): Surface => {
		const point = (u: number, v: number, lift = 0): Point3 => add3(add3(O, mul3(U, u)), add3(mul3(V, v), mul3(N, lift)));
		return {
			at: point,
			on: (pts, lift = 0) => pts.map(([u, v]) => at(point(u, v, lift))),
			matrix: (u, v, unit = 0.1, lift = 0.02) => matrixOf(at(point(u, v, lift)), at(point(u + unit, v, lift)), at(point(u, v + unit, lift))),
		};
	};

	/** A rectangle lying on the desk at height `z`, its top-left corner at `o`, turned by `turn` radians. */
	const flat = (o: P, turn = 0, z = 0): Surface => surface([o[0], o[1], z], [Math.cos(turn), Math.sin(turn), 0], [-Math.sin(turn), Math.cos(turn), 0]);
	/** A card standing upright on the desk: `o` is its bottom-left corner, `u` runs along the desk, `v` runs up. */
	const upright = (o: Point3, turn = 0): Surface => {
		const s = surface(o, [Math.cos(turn), Math.sin(turn), 0], [0, 0, 1], [Math.sin(turn), -Math.cos(turn), 0]);
		return { ...s, matrix: (u, v, unit = 0.1, lift = 0.02) => matrixOf(at(s.at(u, v, lift)), at(s.at(u + unit, v, lift)), at(s.at(u, v - unit, lift))) };
	};

	/** Paper of `w` by `h` on a surface: its fill, ink edge, soft cast shadow and an optional hatched tone. */
	function card(s: Surface, w: number, h: number, seed: number, options: { readonly cast?: Point3; readonly tone?: number; readonly paper?: string; readonly r?: number; readonly weight?: number } = {}) {
		const poly = s.on(options.r ? roundRect(0, 0, w, h, options.r) : [[0, 0], [w, 0], [w, h], [0, h]]);
		if (options.cast) {
			const corners = [s.at(0, 0), s.at(w, 0), s.at(w, h), s.at(0, h)];
			const pts = [...corners.map(at), ...corners.map((p) => at(add3(shadowOnDesk(p, 0), options.cast!)))];
			put('shadow', wash(hull(pts), seed + 1, 1, 2));
		}
		put(options.paper ?? 'paper', pathOf(poly, true));
		if (options.tone !== undefined) put('hatch light', hatch(poly, options.tone, 1.9, seed + 2, { cluster: 4, skip: 0.3, trim: 0.4 }));
		put('ink', outline(poly, { w: options.weight ?? 1.2, heavy: 1, centre: centreOf(poly), seed: seed + 3 }));
		return poly;
	}

	/** A box standing on the desk from `o` with size `w` by `d` by `h`: visible faces filled, the side faces hatched. */
	function box(o: Point3, w: number, d: number, h: number, seed: number, paper = 'paper') {
		const c = (du: number, dv: number, dz: number): Point3 => [o[0] + du, o[1] + dv, o[2] + dz];
		const faces = [
			{ n: [0, 0, 1] as Point3, pts: [c(0, 0, h), c(w, 0, h), c(w, d, h), c(0, d, h)], angle: 0, gap: 0 },
			{ n: [0, 1, 0] as Point3, pts: [c(0, d, 0), c(w, d, 0), c(w, d, h), c(0, d, h)], angle: 0.2, gap: 2.2 },
			{ n: [1, 0, 0] as Point3, pts: [c(w, 0, 0), c(w, d, 0), c(w, d, h), c(w, 0, h)], angle: 1.15, gap: 1.4 },
			{ n: [-1, 0, 0] as Point3, pts: [c(0, 0, 0), c(0, d, 0), c(0, d, h), c(0, 0, h)], angle: 1.25, gap: 3 },
		];
		const eye = camera.EYE;
		const shown = faces.filter((f) => dot3(f.n, sub3(eye, centre3(f.pts))) > 0);
		const outlinePts = hull(shown.flatMap((f) => atAll(f.pts)));
		const castPts: P[] = [];
		for (const du of [0, w]) for (const dv of [0, d]) for (const dz of [0, h]) castPts.push(at(shadowOnDesk(c(du, dv, dz))));
		put('shadow', wash(hull(castPts), seed, 1.5, 3));
		put(paper, pathOf(outlinePts, true));
		for (const [i, f] of shown.entries()) if (f.gap > 0) put('hatch', hatch(atAll(f.pts), f.angle, f.gap, seed + 3 + i, { cluster: 4, skip: 0.25, trim: 0.4 }));
		put('ink', outline(outlinePts, { w: 1.5, heavy: 1.3, centre: centreOf(outlinePts), seed: seed + 6 }) + shown.map((f, i) => outline(atAll(f.pts), { w: 0.75, seed: seed + 7 + i })).join(''));
		return { top: surface(c(0, 0, h), [1, 0, 0], [0, 1, 0]), front: surface(c(0, d, 0), [1, 0, 0], [0, 0, 1], [0, 1, 0]), point: (du: number, dv: number, dz: number) => at(c(du, dv, dz)) };
	}

	/** A loose yellow wash over a spot, with its darker pool. Returned, not layered, so a figure can show it on cue. */
	function spot(poly: P[], seed: number) {
		return { wash: wash(poly, seed, 1.2, 3), pool: wash(pool(poly, centreOf(poly), 0.55), seed + 1, 0.5, 2) };
	}

	/** The one margin note, top left, and a loose hand-drawn arrow to `aim`. */
	function note(aim: P, seed: number, from: P = [96, 32]) {
		const pts: P[] = Array.from({ length: 16 }, (_, i) => {
			const t = i / 15;
			const c: P = [from[0] - 30, (from[1] + aim[1]) / 2];
			return [(1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * c[0] + t * t * (aim[0] - 3), (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * c[1] + t * t * (aim[1] - 6)];
		});
		const end = pts.at(-1)!;
		const prev = pts.at(-4)!;
		const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
		const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
		return { x: 4, y: 22, arrow: line(pts, { w: 1.3, seed, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: seed + 1, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: seed + 2, over: 0.5 }) };
	}

	/** Loose desk hatching in a band under the scene. */
	function deskTone(x0: number, x1: number, y0: number, y1: number, seed: number) {
		put('desk-hatch', hatch(atAll([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]), -0.5, 2.6, seed, { cluster: 5, skip: 0.35, trim: 0.5 }));
	}

	return { at, atAll, put, say, layers, words, surface, flat, upright, card, box, spot, note, deskTone, pencilLine: (pts: P[], seed: number) => pathOf(jitter(resample(pts, 6), seed, 0.7)) };
}

const centre3 = (pts: Point3[]): Point3 => mul3(pts.reduce((a, b) => add3(a, b), [0, 0, 0] as Point3), 1 / pts.length);

/** Ink helpers re-exported so each figure imports one module. */
export { centreOf, cross3, hatch, line, outline, pathOf, pool, r1, stroke, wash };
