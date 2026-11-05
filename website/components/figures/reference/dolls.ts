// Nesting dolls on a shelf: the four packages you install stand in a row; core is opened, and the packages inside it stand out in a line, each smaller than the last. analyzer stays shut: it holds nothing.
import { centreOf, matrixOf } from '../ink/desk.ts';
import { hatch, hull, outline, pathOf, wash } from '../ink/ink.ts';
import { desk, type P, type Point3 } from '../ink/sheets.ts';

/** The four an app installs, by the template's package.json; `open` dolls are drawn split, with their inner dolls beside them. */
export const INSTALLED = ['core', 'router', 'typescript-plugin', 'analyzer'];

/** What opening core shows, outermost first: core needs bundler, bundler needs compiler and web, web needs runtime, and everything needs serializer. */
export const INSIDE = ['bundler', 'compiler', 'web', 'runtime', 'serializer'];

type Kit = ReturnType<typeof desk>;

/** A doll's half-width at height t (0 at its foot, 1 at its crown), as a share of its height. */
function profile(t: number) {
	if (t < 0.62) return 0.26 + 0.1 * Math.sin((t / 0.62) * Math.PI) - 0.06 * t;
	const h = (t - 0.62) / 0.38;
	return 0.2 * Math.sqrt(Math.max(0, 1 - (2 * h - 1) ** 2)) + (h < 0.15 ? 0.05 * (1 - h / 0.15) : 0);
}

/** One doll standing at (x, y) on the shelf, `h` tall, its face toward the viewer; `cut` lifts its top half off by that much, `label` is written on its belly, a `/` breaking it onto a second line. */
function doll(k: Kit, x: number, y: number, h: number, seed: number, label: string, cut = 0, washed = false) {
	const side = (sign: number, t0: number, t1: number, lift: number): Point3[] =>
		Array.from({ length: 24 }, (_, i) => {
			const t = t0 + ((t1 - t0) * i) / 23;
			return [x + sign * profile(t) * h, y, t * h + (t > 0.5 ? lift : 0)] as Point3;
		});
	const shape = (t0: number, t1: number, lift: number): P[] => k.raw.projAll([...side(1, t0, t1, lift), ...side(-1, t0, t1, lift).reverse()]);
	const parts = cut ? [shape(0, 0.5, 0), shape(0.5, 1, cut)] : [shape(0, 1, 0)];
	const cast = hull(k.raw.projAll([[x - 0.2 * h, y, 0], [x + 0.35 * h, y, 0], [x + 0.55 * h, y + 0.5 * h, 0], [x + 0.05 * h, y + 0.6 * h, 0]]));
	k.raw.path(wash(cast, seed, 0.8, 1.6), 'shadow-wash light');
	k.raw.path(hatch(cast, -0.5, 2.2, seed + 1, { cluster: 4, skip: 0.25 }), 'hatch deep light');
	parts.forEach((poly, i) => {
		const shade = poly.filter(([sx]) => sx > centreOf(poly)[0] + h * 0.6);
		k.raw.path(pathOf(poly, true), washed ? 'kraft' : 'sheet-paper');
		if (shade.length > 2) k.raw.path(hatch(hull(shade.concat([centreOf(poly)])), 1.2, 1.8, seed + 2 + i, { cluster: 3, skip: 0.2, trim: 0.3 }), 'sheet-hatch light');
		k.raw.path(outline(poly, { w: 1.3, heavy: 1.1, centre: centreOf(poly), seed: seed + 4 + i }), 'sheet-ink');
	});
	const face: Point3 = [x, y, 0.81 * h + cut];
	const ring = k.raw.projAll(Array.from({ length: 20 }, (_, i) => [x + Math.cos((i / 20) * Math.PI * 2) * 0.11 * h, y, face[2] + Math.sin((i / 20) * Math.PI * 2) * 0.1 * h] as Point3));
	k.raw.path(outline(ring, { w: 0.8, seed: seed + 8 }), 'sheet-ink');
	const band = k.raw.projAll([[x - profile(0.55) * h, y, 0.55 * h], [x + profile(0.55) * h, y, 0.55 * h]]);
	if (!cut) k.raw.path(outline(band, { w: 0.6, seed: seed + 9 }, false), 'sheet-ink');
	if (label) {
		const size = Math.min(1, h / 4.8);
		label.split('/').forEach((part, j, all) => {
			const o: Point3 = [x - part.length * 0.135 * size * 1.05, y, 0.3 * h - (j - (all.length - 1) / 2) * 0.5];
			k.raw.textWith(matrixOf(k.raw.proj(o), k.raw.proj([o[0] + 0.05 * size, y, o[2]]), k.raw.proj([o[0], y, o[2] - 0.05 * size])), part, 'mono');
		});
	}
}

/** Text standing upright on the screen, centred under a desk point. */
function upright(k: Kit, at: Point3, text: string, cls: string, delay: number) {
	const [sx, sy] = k.raw.proj(at);
	const w = text.length * (cls.startsWith('mono') ? 6 : 6.4);
	k.raw.textWith(`matrix(1 0 0 1 ${Math.round(sx - w / 2)} ${Math.round(sy)})`, text, cls, 'show', delay);
}

export function drawing() {
	const k = desk(
		680,
		[{ key: 'shelf', x: 0, y: 0, w: 21, h: 4, kraft: true, curl: false }],
		[
			[0, 1.2, 5.6],
			[21, 1.2, 5.6],
			[0, 9, 0],
			[1.7, 1.2, 7.4],
		],
		{ elevation: 22 },
	);
	k.lay();
	k.next();
	const y = 1.2;
	const big = 4.8;
	doll(k, 1.7, y, big, 2000, 'core', 2, true);
	doll(k, 10.4, y, big, 2020, 'router', 0, true);
	doll(k, 14.6, y, big * 0.95, 2040, 'typescript/-plugin', 0, true);
	doll(k, 18.8, y, big * 0.92, 2060, 'analyzer', 0, true);
	INSIDE.forEach((name, i) => {
		const x = 3.9 + i * 1.25;
		doll(k, x, y + 0.6, big * (0.6 - i * 0.085), 2100 + i * 20, '', 0);
		upright(k, [x, 5.6 + (i % 2) * 1.3, 0], name, 'mono desk-text', 900 + i * 250);
	});
	upright(k, [12.6, 6.2, 0], 'YOU INSTALL FOUR', 'hand desk-text', 400);
	upright(k, [18.8, 6.2, 0], 'NOTHING INSIDE', 'hand desk-text', 2300);
	return k.build();
}
