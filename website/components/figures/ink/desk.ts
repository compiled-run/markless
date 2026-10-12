// The shared desk for ink figures: one light, a true-perspective camera fitted to the scene, and small geometry helpers.
import { eyeOf, fitProjection, iso, perspectiveProjection, type Point3, type Projection } from '../kit/iso-kit.ts';
import { add3, mul3, unit3 } from '../kit/lathe.ts';
import { type P, seeded } from './ink.ts';

export type { P, Point3 };
export const TAU = Math.PI * 2;
export const LIGHT = unit3([-0.5, -0.45, 0.78]);

export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, steps = 5): P[] {
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

export const ellipse = (cx: number, cy: number, rx: number, ry: number, steps = 40): P[] => Array.from({ length: steps }, (_, i) => [cx + Math.cos((i / steps) * TAU) * rx, cy + Math.sin((i / steps) * TAU) * ry]);
export const centreOf = (pts: P[]): P => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
export const jitter = (pts: P[], seed: number, amount: number): P[] => {
	const rnd = seeded(seed);
	return pts.map(([x, y]) => [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]);
};
export const shadowOnDesk = (p: Point3, floor = 0): Point3 => [p[0] - (LIGHT[0] / LIGHT[2]) * (p[2] - floor), p[1] - (LIGHT[1] / LIGHT[2]) * (p[2] - floor), floor];
export const bezier = (a: Point3, b: Point3, c: Point3, d: Point3, steps = 40): Point3[] =>
	Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		const s = 1 - t;
		return add3(add3(mul3(a, s * s * s), mul3(b, 3 * s * s * t)), add3(mul3(c, 3 * s * t * t), mul3(d, t * t * t)));
	});

/** An SVG matrix from three screen points: the origin, one local unit along x, one along y. */
export const matrixOf = (o: P, x: P, y: P, k = 1) => `matrix(${[(x[0] - o[0]) / k, (x[1] - o[1]) / k, (y[0] - o[0]) / k, (y[1] - o[1]) / k, o[0], o[1]].map((n) => Math.round(n * 1000) / 1000).join(' ')})`;

export interface CameraOptions {
	width: number;
	height: number;
	view: { azimuth: number; elevation: number; distance: number; target: Point3 };
	/** World points the camera must fit inside the view box. */
	bounds: Point3[];
	pad?: number;
}

/** A pinhole camera from an azimuth and elevation around a target, fitted so `bounds` fill the view box. */
export function createCamera({ width, height, view, bounds, pad = 4 }: CameraOptions) {
	const a = (view.azimuth * Math.PI) / 180;
	const e = (view.elevation * Math.PI) / 180;
	const eye: Point3 = [view.target[0] + Math.cos(a) * Math.cos(e) * view.distance, view.target[1] + Math.sin(a) * Math.cos(e) * view.distance, view.target[2] + Math.sin(e) * view.distance];
	const PROJECTION: Projection = fitProjection(bounds, width, height, { camera: perspectiveProjection({ eye, target: view.target }), pad });
	const proj = (p: Point3): P => iso(p, PROJECTION);
	return { PROJECTION, EYE: eyeOf(PROJECTION)!, proj, projAll: (pts: Point3[]): P[] => pts.map(proj) };
}
