// Flat surfaces in the scene (a sheet, a screen, a lid) projected through the camera, plus pencil lines and arrow barbs.
import { add3, mul3 } from '../kit/lathe.ts';
import { jitter, matrixOf, type P, type Point3 } from './desk.ts';
import { normalAt, pathOf, resample, seeded } from './ink.ts';

export interface Plane {
	at(u: number, v: number, lift?: number): Point3;
	on(pts: P[], lift?: number): P[];
	/** An SVG matrix at (u, v) whose local unit is `unit` along the plane. */
	matrix(u: number, v: number, unit: number, lift?: number): string;
}

/** A flat surface from an origin and two world axes, seen through `proj`. `N` is the direction `lift` raises it. */
export function plane(proj: (p: Point3) => P, O: Point3, U: Point3, V: Point3, N: Point3 = [0, 0, 1]): Plane {
	const at = (u: number, v: number, lift = 0): Point3 => add3(add3(O, mul3(U, u)), add3(mul3(V, v), mul3(N, lift)));
	return {
		at,
		on: (pts, lift = 0) => pts.map(([u, v]) => proj(at(u, v, lift))),
		matrix: (u, v, unit, lift = 0) => matrixOf(proj(at(u, v, lift)), proj(at(u + unit, v, lift)), proj(at(u, v + unit, lift))),
	};
}

/** A rectangle lying on the desk, centred at `c`, turned by `turn` radians, raised to `z`. */
export function deskPlane(proj: (p: Point3) => P, c: P, w: number, h: number, turn: number, z = 0): Plane {
	const U: Point3 = [Math.cos(turn), Math.sin(turn), 0];
	const V: Point3 = [-Math.sin(turn), Math.cos(turn), 0];
	return plane(proj, [c[0] - U[0] * (w / 2) - V[0] * (h / 2), c[1] - U[1] * (w / 2) - V[1] * (h / 2), z], U, V);
}

/** A faint pencil line: two loose passes that overshoot their ends a little. */
export function pencil(points: P[], seed: number, closed = false, passes = 2): string {
	const rnd = seeded(seed);
	let d = '';
	for (let p = 0; p < passes; p++) {
		let pts = resample(points, 5, closed);
		if (closed) pts = [...pts, pts[0]!, pts[1] ?? pts[0]!];
		if (pts.length > 1) {
			const ext = (a: P, b: P, by: number): P => {
				const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
				return [a[0] + ((a[0] - b[0]) / l) * by, a[1] + ((a[1] - b[1]) / l) * by];
			};
			pts = [ext(pts[0]!, pts[1]!, 1 + rnd() * 2), ...pts, ext(pts.at(-1)!, pts.at(-2)!, 1 + rnd() * 2)];
		}
		const shift = (rnd() - 0.5) * 0.8;
		d += pathOf(jitter(pts.map((q, i, all) => {
			const [nx, ny] = normalAt(all, i);
			return [q[0] + nx * shift, q[1] + ny * shift] as P;
		}), seed * 3 + p, 0.6));
	}
	return d;
}

/** Two short barbs at the end of a screen path, pointing along its last stretch. */
export function barbs(path: P[], size: number, spread = 0.45): P[][] {
	const tip = path.at(-1)!;
	const back = path[Math.max(0, path.length - 4)]!;
	const a = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
	return [-spread, spread * 0.8].map((s) => [[tip[0] - Math.cos(a + s) * size, tip[1] - Math.sin(a + s) * size], [tip[0] + Math.cos(a) * 0.6, tip[1] + Math.sin(a) * 0.6]] as P[]);
}
