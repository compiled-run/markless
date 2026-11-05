// Airport pieces for the CI figures: a solid block standing on the desk, an upright panel (a screen, a departure board) and a paper plane.
import { centreOf, matrixOf, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, lengthOf, outline, pathOf, r1, resample, wash } from '../ink/ink.ts';
import type { desk, P, Point3 } from '../ink/sheets.ts';

type Kit = ReturnType<typeof desk>;
type Shown = 'show' | 'gone' | '';

const faceMatrix = (k: Kit, o: Point3, right: Point3, down: Point3) =>
	matrixOf(k.raw.proj(o), k.raw.proj([o[0] + right[0] * 0.05, o[1] + right[1] * 0.05, o[2] + right[2] * 0.05]), k.raw.proj([o[0] + down[0] * 0.05, o[1] + down[1] * 0.05, o[2] + down[2] * 0.05]));

/** A block standing on the desk: corner (x, y) in world units, size w by d, height h; its lit top, hatched sides, cast shadow and an optional word on top. */
export function block(k: Kit, x: number, y: number, w: number, d: number, h: number, seed: number, label = '') {
	const c = (dx: number, dy: number, z: number): Point3 => [x + dx, y + dy, z];
	const P = k.raw.projAll;
	const top = P([c(0, 0, h), c(w, 0, h), c(w, d, h), c(0, d, h)]);
	const front = P([c(0, d, 0), c(w, d, 0), c(w, d, h), c(0, d, h)]);
	const right = P([c(w, 0, 0), c(w, d, 0), c(w, d, h), c(w, 0, h)]);
	const castPts: P[] = [];
	for (const dx of [0, w]) for (const dy of [0, d]) for (const z of [0, h]) castPts.push(k.raw.proj(shadowOnDesk(c(dx, dy, z))));
	const cast = hull(castPts);
	const sil = hull([...top, ...front, ...right]);
	k.raw.path(wash(cast, seed, 1.4, 2.5), 'shadow-wash');
	k.raw.path(hatch(cast, -0.5, 2.4, seed + 1, { cluster: 5, skip: 0.2 }), 'hatch deep');
	k.raw.path(pathOf(sil, true), 'sheet-paper');
	k.raw.path(hatch(front, 0.2, 2.4, seed + 2, { cluster: 4, skip: 0.25, trim: 0.4 }) + hatch(right, 1.15, 1.5, seed + 3, { cluster: 4, skip: 0.2, trim: 0.3 }), 'sheet-hatch');
	k.raw.path(outline(sil, { w: 1.5, heavy: 1.3, centre: centreOf(sil), seed: seed + 4 }) + outline(top, { w: 0.8, seed: seed + 5 }) + outline(front, { w: 0.8, seed: seed + 6 }), 'sheet-ink');
	if (label) k.raw.textWith(faceMatrix(k, c(w * 0.2, d * 0.6, h), [1, 0, 0], [0, 1, 0]), label, 'hand');
}

/** An upright panel standing on the desk, its face toward the viewer: x, y its back-left foot, w wide, h tall, t thick. Text and ticks go on its face in panel units from the top left. */
export function upright(k: Kit, x: number, y: number, w: number, h: number, t: number, seed: number) {
	block(k, x, y, w, t, h, seed);
	const face = (u: number, v: number): Point3 => [x + u, y + t + 0.02, h - v];
	const P = k.raw.projAll;
	const inset = P([face(0.25, 0.25), face(w - 0.25, 0.25), face(w - 0.25, h - 0.25), face(0.25, h - 0.25)]);
	k.raw.path(pathOf(inset, true), 'sheet-paper');
	k.raw.path(outline(inset, { w: 0.8, seed: seed + 9 }), 'sheet-ink');
	return {
		text: (u: number, v: number, text: string, cls: string, at?: number) => k.raw.textWith(faceMatrix(k, face(u, v), [1, 0, 0], [0, 0, -1]), text, cls, at === undefined ? '' : 'show', at),
		tick: (u: number, v: number, at: number) => {
			const pts = resample(P([face(u - 0.2, v - 0.2), face(u, v), face(u + 0.32, v - 0.5)]), 2);
			k.raw.path(pathOf(pts), 'pen draw', k.raw.motion('draw', at, '--l:' + r1(lengthOf(pts) + 2)));
		},
	};
}

/** A paper plane, nose toward +x, with its tail at (x, y), raised `lift` off the desk and tipped up as it climbs. */
export function plane(k: Kit, x: number, y: number, len: number, seed: number, lift: number, m: Shown, at: number) {
	const z = 0.6 + lift;
	const climb = lift * 0.35;
	const nose: Point3 = [x + len, y - climb, 0.15 + lift * 1.25];
	const tail: Point3 = [x, y, z];
	const wingL: Point3 = [x + len * 0.1, y - len * 0.42, z * 0.85];
	const wingR: Point3 = [x + len * 0.1, y + len * 0.42, z * 0.85];
	const keel: Point3 = [x + len * 0.15, y, Math.max(0.02, lift - 0.3)];
	const P = k.raw.projAll;
	const left = P([nose, tail, wingL]);
	const right = P([nose, tail, wingR]);
	const fold = P([nose, tail, keel]);
	const cast = hull([nose, tail, wingL, wingR].map((p) => k.raw.proj(shadowOnDesk(p))));
	const st = m ? k.raw.motion(m, at) : '';
	const cls = (c: string) => (c + ' ' + m).trim();
	k.raw.path(wash(cast, seed, 1, 2), cls('shadow-wash light'), st);
	k.raw.path(hatch(cast, -0.5, 2.4, seed + 1, { cluster: 4, skip: 0.3 }), cls('hatch deep light'), st);
	k.raw.path(pathOf(fold, true), cls('sheet-paper'), st);
	k.raw.path(hatch(fold, 1, 1.8, seed + 2, { cluster: 3, trim: 0.3 }), cls('sheet-hatch'), st);
	k.raw.path(pathOf(left, true) + pathOf(right, true), cls('sheet-paper'), st);
	k.raw.path(hatch(right, 0.3, 2.6, seed + 3, { cluster: 3, skip: 0.3, trim: 0.4 }), cls('sheet-hatch light'), st);
	k.raw.path(outline(left, { w: 1.2, heavy: 0.8, seed: seed + 4 }) + outline(right, { w: 1.3, heavy: 1, seed: seed + 5 }) + outline(fold, { w: 0.9, seed: seed + 6 }), cls('sheet-ink'), st);
}
