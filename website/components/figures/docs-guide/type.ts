// Printer's pieces standing on the desk: a block of type (a slug) with its face lettered, and a wooden tray of compartments.
import { centreOf, matrixOf, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, outline, pathOf, wash } from '../ink/ink.ts';
import type { At, desk, Motion, P, Point3 } from '../ink/sheets.ts';

type Kit = ReturnType<typeof desk>;

/** A block at world corner (x, y), size w by d by h; its top face carries `label`. Fill is paper, or kraft for wood and metal. */
export function slug(k: Kit, x: number, y: number, w: number, d: number, h: number, seed: number, label = '', m: Motion = '', at?: At, wood = false, labelCls = 'mono') {
	const c = (dx: number, dy: number, z: number): Point3 => [x + dx, y + dy, z];
	const P = k.raw.projAll;
	const top = P([c(0, 0, h), c(w, 0, h), c(w, d, h), c(0, d, h)]);
	const front = P([c(0, d, 0), c(w, d, 0), c(w, d, h), c(0, d, h)]);
	const right = P([c(w, 0, 0), c(w, d, 0), c(w, d, h), c(w, 0, h)]);
	const sil = hull([...top, ...front, ...right]);
	const castPts: P[] = [];
	for (const dx of [0, w]) for (const dy of [0, d]) for (const z of [0, h]) castPts.push(k.raw.proj(shadowOnDesk(c(dx, dy, z))));
	const cast = hull(castPts);
	const style = k.raw.motion(m, at);
	const cls = (base: string) => (base + ' ' + m).trim();
	k.raw.path(wash(cast, seed, 0.8, 1.6), cls('shadow-wash light'), style);
	k.raw.path(pathOf(sil, true), cls(wood ? 'kraft' : 'sheet-paper'), style);
	k.raw.path(hatch(front, 0.2, 2.2, seed + 2, { cluster: 3, skip: 0.3, trim: 0.4 }) + hatch(right, 1.15, 1.4, seed + 3, { cluster: 3, skip: 0.2, trim: 0.3 }), cls('sheet-hatch'), style);
	k.raw.path(outline(sil, { w: 1.2, heavy: 1, centre: centreOf(sil), seed: seed + 4 }) + outline(top, { w: 0.6, seed: seed + 5 }), cls('sheet-ink'), style);
	if (label) {
		const o = c(0.3, d * 0.68, h);
		k.raw.textWith(matrixOf(k.raw.proj(o), k.raw.proj([o[0] + 0.05, o[1], o[2]]), k.raw.proj([o[0], o[1] + 0.05, o[2]])), label, labelCls, m === 'draw' ? 'show' : m, at);
	}
	return { top: (dx: number, dy: number): Point3 => c(dx, dy, h) };
}

/** A shallow wooden tray: a floor with raised rim walls, `cols` by `rows` compartments drawn as thin dividers. */
export function tray(k: Kit, x: number, y: number, w: number, d: number, cols: number, rows: number, seed: number) {
	slug(k, x, y, w, d, 0.35, seed, '', '', undefined, true);
	const P = k.raw.projAll;
	let lines = '';
	for (let i = 1; i < cols; i++) lines += pathOf(P([[x + (i * w) / cols, y + 0.2, 0.36], [x + (i * w) / cols, y + d - 0.2, 0.36]]));
	for (let j = 1; j < rows; j++) lines += pathOf(P([[x + 0.2, y + (j * d) / rows, 0.36], [x + w - 0.2, y + (j * d) / rows, 0.36]]));
	k.raw.path(lines, 'perforation');
	return (col: number, row: number): Point3 => [x + ((col + 0.5) * w) / cols, y + ((row + 0.5) * d) / rows, 0.36];
}
