// A ball of dough and one baking tin on the desk; the tin takes the shape of the host its label names, and the loaf takes the tin's shape.
import { createScene, type Crate, ellipse, type P, type Point3, sheetAt } from '../ink/scene.ts';
import { hatch, hull, line, outline, pathOf, r1, wash } from '../ink/ink.ts';
import type { Preset } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

const BALL = { u: 4.4, v: 8.6, r: 2.3 };
const TIN_AT = { u: 10.6, v: 6.4 };
const TIN_SHAPES: Record<Preset, { w: number; d: number; h: number; loaves: number; rise: number }> = {
	node: { w: 6.4, d: 3.2, h: 2.4, loaves: 1, rise: 2.0 },
	vercel: { w: 8.4, d: 3.2, h: 2.0, loaves: 2, rise: 1.4 },
	cloudflare: { w: 9.6, d: 3.6, h: 1.0, loaves: 4, rise: 1.0 },
};

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [sheetAt(TIN_AT.u + 10, TIN_AT.v, 4), sheetAt(BALL.u - BALL.r, BALL.v, 4.6)],
	target: [9.6, -1.6, 1.6],
	elevation: 40,
});
const { proj, projAll } = scene;

const at = (u: number, v: number, z: number): Point3 => sheetAt(u, v, z);

/** The dough: a soft ball resting on the desk, shaded on its far side. */
function ballArt() {
	const { u, v, r } = BALL;
	const pts: P[] = [];
	const zc = r * 0.72;
	for (let i = 0; i < 40; i++) {
		const a = (i / 40) * Math.PI * 2;
		for (let j = 0; j <= 10; j++) {
			const b = -Math.PI / 2 + (j / 10) * Math.PI;
			const z = zc + Math.sin(b) * r * 0.78;
			if (z < 0) continue;
			pts.push(proj(at(u + Math.cos(a) * Math.cos(b) * r, v + Math.sin(a) * Math.cos(b) * r * 0.85, z)));
		}
	}
	const body = hull(pts);
	const footing = projAll(ellipse(u, v, r, r * 0.8, 36).map(([a, b]) => at(a, b, 0)));
	const centre = proj(at(u, v, zc));
	const shade = body.filter((p) => p[0] > centre[0] - 4);
	return {
		cast: wash(hull([...footing, ...footing.map(([x, y]) => [x + 26, y + 8] as P)]), 5000, 1.5, 3),
		paper: pathOf(body, true),
		shade: hatch(hull([...shade, centre]), 0.9, 1.7, 5005, { cluster: 3, skip: 0.35, trim: 0.5 }),
		ink: outline(body, { w: 1.4, heavy: 1.1, seed: 5004 }),
		origin: `${r1(centre[0])}px ${r1(proj(at(u, v, 0))[1])}px`,
		top: proj(at(u, v, zc + r * 0.6)),
		place: (() => {
			const c = proj(at(u, v, zc));
			return `left:${r1((c[0] / WIDTH) * 100)}%;top:${r1((c[1] / HEIGHT) * 100)}%`;
		})(),
	};
}

/** One tin shape at the tin's place on the desk, with its label on the front and the loaves it bakes. */
function tinArt(preset: Preset, seed: number, from: P) {
	const shape = TIN_SHAPES[preset];
	const c: Crate = { u: TIN_AT.u, v: TIN_AT.v, w: shape.w, d: shape.d, h: shape.h };
	const box = scene.crate(c, seed);
	const top = (x: number, y: number, z: number) => box.point(x, y, z);
	const gap = 0.2;
	const span = (c.w - gap * (shape.loaves + 1)) / shape.loaves;
	const loaf = (x0: number, x1: number) => {
		const pts: P[] = [];
		for (let i = 0; i <= 14; i++) {
			const t = i / 14;
			const x = x0 + (x1 - x0) * t;
			const bump = Math.sin(Math.PI * t) ** 0.7 * shape.rise;
			pts.push(top(x, c.d - 0.25, c.h + bump), top(x, 0.25, c.h + bump * 0.9), top(x, c.d / 2, c.h + bump * 1.1));
		}
		pts.push(top(x0, 0.2, c.h), top(x1, c.d - 0.2, c.h));
		return hull(pts);
	};
	const loaves = Array.from({ length: shape.loaves }, (_, i) => loaf(gap + i * (span + gap), gap + i * (span + gap) + span));
	const dividers = Array.from({ length: shape.loaves - 1 }, (_, i) => {
		const x = gap / 2 + (i + 1) * (span + gap);
		return line([top(x, 0, c.h), top(x, c.d, c.h)], { w: 0.8, seed: seed + 30 + i, over: 0 });
	}).join('');
	const centre = top(c.w / 2, c.d / 2, c.h + shape.rise);
	const label = top(c.w / 2, c.d, c.h * 0.5);
	return {
		cast: box.cast.wash,
		paper: box.paper,
		shade: box.shade,
		ink: box.ink + dividers,
		loaf: loaves.map((p) => pathOf(p, true)).join(''),
		loafInk: loaves.map((p, i) => outline(p, { w: 1, heavy: 0.7, seed: seed + 40 + i })).join(''),
		loafShade: loaves.map((p, i) => hatch(p, 0.9, 1.7, seed + 50 + i, { cluster: 3, skip: 0.35, trim: 0.5 })).join(''),
		loafWash: loaves.map((p, i) => wash(p, seed + 60 + i, 1, 3)).join(''),
		labelMatrix: scene.sheetMatrix(TIN_AT.u + 0.3, TIN_AT.v + c.d + 1.6),
		hop: `--hop-x:${r1(centre[0] - from[0])}px;--hop-y:${r1(centre[1] - from[1])}px`,
		origin: `${r1(centre[0])}px ${r1(top(c.w / 2, c.d / 2, c.h)[1])}px`,
		place: `left:${r1((label[0] / WIDTH) * 100)}%;top:${r1((label[1] / HEIGHT) * 100)}%`,
	};
}

/** The whole scene, frozen into dough.art.ts. */
export function drawing() {
	const ball = ballArt();
	const lump = projAll(ellipse(BALL.u, BALL.v, 0.8, 0.6, 18).map(([a, b]) => at(a, b, BALL.r * 1.35)));
	return {
		width: WIDTH,
		height: HEIGHT,
		ball,
		lump: { paper: pathOf(lump, true), ink: outline(lump, { w: 0.9, seed: 5100 }) },
		tins: {
			node: tinArt('node', 5400, ball.top),
			vercel: tinArt('vercel', 5500, ball.top),
			cloudflare: tinArt('cloudflare', 5600, ball.top),
		},
	};
}
