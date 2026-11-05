// Board-game pieces standing on the desk: a turned pawn and a die, drawn round a projected foot point.
import { centreOf, ellipse, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, outline, pathOf, wash } from '../ink/ink.ts';
import type { At, desk, Motion, P, Point3 } from '../ink/sheets.ts';

type Kit = ReturnType<typeof desk>;

/** Half-widths of a pawn's turned profile, foot to crown, in screen pixels. */
const PROFILE: [number, number][] = [
	[0, 13],
	[-3.5, 13],
	[-6, 8.5],
	[-7.5, 6.5],
	[-19, 4],
	[-21, 7],
	[-23, 3.7],
];
const HEAD = { y: -31, r: 8 };

/** A pawn whose foot stands at world point `foot`; `m` and `at` move it on and off its square. */
export function pawn(k: Kit, foot: Point3, seed: number, m: Motion = '', at?: At, until?: number) {
	const [x, y] = k.raw.proj(foot);
	const style = k.raw.motion(m, at, '', until);
	const cls = (base: string) => (base + ' ' + m).trim();
	const side = (s: number): P[] => PROFILE.map(([dy, w]) => [x + s * w, y + dy]);
	const head = ellipse(x, y + HEAD.y, HEAD.r, HEAD.r, 28);
	const body: P[] = [...side(-1), ...side(1).reverse()];
	const fall = k.raw.proj(shadowOnDesk([foot[0], foot[1], 1.5]));
	const cast = hull([...ellipse(x, y, 13, 4.8, 16), ...ellipse(fall[0], fall[1], 8, 4, 12)]);
	const shadeBody: P[] = [[x + 2, y], ...side(1), [x + 2, y - 23]];
	const shadeHead = ellipse(x + 2.2, y + HEAD.y + 0.8, HEAD.r * 0.7, HEAD.r * 0.85, 18);
	k.raw.path(wash(cast, seed, 0.6, 1.5), cls('shadow-wash'), style);
	k.raw.path(hatch(cast, -0.5, 1.8, seed + 1, { cluster: 3, skip: 0.2 }), cls('hatch deep'), style);
	k.raw.path(pathOf(body, true) + pathOf(head, true), cls('sheet-paper'), style);
	k.raw.path(hatch(shadeBody, 1.2, 1.6, seed + 2, { cluster: 3, trim: 0.2 }) + hatch(shadeHead, 0.9, 1.5, seed + 3, { cluster: 2, trim: 0.2 }), cls('sheet-hatch'), style);
	k.raw.path(outline(body, { w: 1.3, heavy: 1, centre: centreOf(body), seed: seed + 4 }) + outline(head, { w: 1.2, heavy: 0.9, centre: [x, y + HEAD.y], seed: seed + 5 }), cls('sheet-ink'), style);
}

/** A die resting on the desk, corner at (x, y), showing `pips` on its top face. */
export function die(k: Kit, x: number, y: number, s: number, pips: number, seed: number) {
	const c = (dx: number, dy: number, z: number): Point3 => [x + dx, y + dy, z];
	const P = k.raw.projAll;
	const top = P([c(0, 0, s), c(s, 0, s), c(s, s, s), c(0, s, s)]);
	const front = P([c(0, s, 0), c(s, s, 0), c(s, s, s), c(0, s, s)]);
	const right = P([c(s, 0, 0), c(s, s, 0), c(s, s, s), c(s, 0, s)]);
	const castPts: P[] = [];
	for (const dx of [0, s]) for (const dy of [0, s]) for (const z of [0, s]) castPts.push(k.raw.proj(shadowOnDesk(c(dx, dy, z))));
	const cast = hull(castPts);
	const sil = hull([...top, ...front, ...right]);
	k.raw.path(wash(cast, seed, 1, 2), 'shadow-wash');
	k.raw.path(hatch(cast, -0.5, 2, seed + 1, { cluster: 4, skip: 0.2 }), 'hatch deep');
	k.raw.path(pathOf(sil, true), 'sheet-paper');
	k.raw.path(hatch(front, 0.2, 2.6, seed + 2, { cluster: 3, skip: 0.3, trim: 0.4 }) + hatch(right, 1.15, 1.5, seed + 3, { cluster: 4, skip: 0.2, trim: 0.3 }), 'sheet-hatch');
	const spots: [number, number][] = pips === 5 ? [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]] : [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]];
	const dots = spots.map(([a, b]) => pathOf(P(ellipse(0, 0, s * 0.09, s * 0.09, 12).map(([ex, ey]) => c(a * s + ex, b * s + ey, s))), true)).join('');
	const frontDots = [0.3, 0.7].map((a) => pathOf(P(ellipse(0, 0, s * 0.08, s * 0.08, 12).map(([ex, ey]) => c(a * s + ex, s, s * 0.5 + ey))), true)).join('');
	k.raw.path(dots + frontDots, 'sheet-ink');
	k.raw.path(outline(sil, { w: 1.4, heavy: 1.2, centre: centreOf(sil), seed: seed + 4 }) + outline(top, { w: 0.8, seed: seed + 5 }) + outline(front, { w: 0.8, seed: seed + 6 }), 'sheet-ink');
}
