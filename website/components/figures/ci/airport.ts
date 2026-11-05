// Airport pieces for the CI figures: a boarding pass's stamp, a solid block standing on the desk (a scanner arch, a gate desk) and a paper plane.
import { centreOf, ellipse, matrixOf, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, outline, pathOf, wash } from '../ink/ink.ts';
import type { desk, P, Point3 } from '../ink/sheets.ts';

type Kit = ReturnType<typeof desk>;

/** A round ink stamp on a sheet, centred at (u, v): a double ring, inked at `at`, with its word written across it. */
export function stamp(k: Kit, key: string, u: number, v: number, word: string, at: number, r = 1.1) {
	const ring = (rr: number, seed: number) => outline(k.raw.on(key, ellipse(u, v, rr, rr * 0.92, 36), 0.02), { w: 1.1, seed });
	k.raw.path(ring(r, 1500 + Math.round(u * 10 + v)) + ring(r * 0.78, 1510 + Math.round(u * 10 + v)), 'stamp-ink show', k.raw.motion('show', at));
	k.raw.text(key, u - word.length * 0.15, v + 0.15, word, 'stamp-word', 'show', at);
}

/** A block standing on the desk: corner (x, y) in world units, size w by d, height h; its lit top, hatched sides and cast shadow. */
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
	if (label) {
		const o = c(w * 0.18, d * 0.55, h);
		k.raw.textWith(matrixOf(k.raw.proj(o), k.raw.proj([o[0] + 0.05, o[1], o[2]]), k.raw.proj([o[0], o[1] + 0.05, o[2]])), label, 'hand');
	}
}

/** A paper plane resting on the desk, nose toward +x, with its tail at (x, y). */
export function plane(k: Kit, x: number, y: number, len: number, seed: number) {
	const z = 0.6;
	const nose: Point3 = [x + len, y, 0.15];
	const tail: Point3 = [x, y, z];
	const wingL: Point3 = [x + len * 0.1, y - len * 0.42, z * 0.7];
	const wingR: Point3 = [x + len * 0.1, y + len * 0.42, z * 0.7];
	const keel: Point3 = [x + len * 0.15, y, 0.02];
	const P = k.raw.projAll;
	const left = P([nose, tail, wingL]);
	const right = P([nose, tail, wingR]);
	const fold = P([nose, tail, keel]);
	const cast = hull([nose, tail, wingL, wingR].map((p) => k.raw.proj(shadowOnDesk(p))));
	k.raw.path(wash(cast, seed, 1, 2), 'shadow-wash light');
	k.raw.path(hatch(cast, -0.5, 2.4, seed + 1, { cluster: 4, skip: 0.3 }), 'hatch deep light');
	k.raw.path(pathOf(fold, true), 'sheet-paper');
	k.raw.path(hatch(fold, 1, 1.8, seed + 2, { cluster: 3, trim: 0.3 }), 'sheet-hatch');
	k.raw.path(pathOf(left, true) + pathOf(right, true), 'sheet-paper');
	k.raw.path(hatch(right, 0.3, 2.6, seed + 3, { cluster: 3, skip: 0.3, trim: 0.4 }), 'sheet-hatch light');
	k.raw.path(outline(left, { w: 1.2, heavy: 0.8, seed: seed + 4 }) + outline(right, { w: 1.3, heavy: 1, seed: seed + 5 }) + outline(fold, { w: 0.9, seed: seed + 6 }), 'sheet-ink');
	const mid = k.raw.proj([x + len * 0.45, y + len * 0.16, z * 0.5]);
	return mid;
}

/** A rounded tray lying on a sheet: its rim and a hatched inside. */
export function tray(k: Kit, key: string, u: number, v: number, w: number, h: number, m: 'show' | '' = '', at?: number) {
	const rim = k.raw.on(key, roundRect(u, v, u + w, v + h, 0.3, 4), 0.06);
	const inner = k.raw.on(key, roundRect(u + 0.25, v + 0.25, u + w - 0.25, v + h - 0.25, 0.22, 4), 0.04);
	const style = m ? k.raw.motion(m, at) : '';
	k.raw.path(pathOf(rim, true), ('sheet-paper ' + m).trim(), style);
	k.raw.path(hatch(inner, 0.9, 2.6, 1600 + Math.round(u * 13), { cluster: 3, skip: 0.5, trim: 0.4 }), ('sheet-hatch light ' + m).trim(), style);
	k.raw.path(outline(rim, { w: 1, heavy: 0.8, seed: 1610 + Math.round(u * 7) }) + outline(inner, { w: 0.6, seed: 1620 + Math.round(u * 5) }), ('sheet-ink ' + m).trim(), style);
}
