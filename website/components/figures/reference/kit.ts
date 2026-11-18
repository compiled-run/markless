// Shared pieces for the reference and repo-tour figures: one camera per figure, parts flattened to paths and texts, and small ink icons drawn on a sheet.
import { ellipse, roundRect } from '../ink/desk.ts';
import { line, outline, pathOf, stroke, wash } from '../ink/ink.ts';
import { desk, type DeskArt, type Item, type P, type Point3, type SheetSpec, type TextItem } from '../ink/sheets.ts';

export type { P };

/** One part of a drawing, built on the figure's camera, as a flat list of paths and texts. */
export interface Part {
	readonly paths: Item[];
	readonly texts: TextItem[];
}

export const flat = (art: DeskArt): Part => ({
	paths: art.layers.flatMap((l) => l.paths).map((p, key) => ({ ...p, key })),
	texts: art.layers.flatMap((l) => l.texts).map((t, key) => ({ ...t, key })),
});

/** A figure's camera: every part built through it shares the same projection. */
export function figure(sheets: readonly SheetSpec[], extra: Point3[] = [], elevation = 64) {
	const scene = () => desk(680, sheets, extra, { elevation });
	type Kit = ReturnType<typeof scene>;
	const part = (draw: (k: Kit) => void): Part => {
		const k = scene();
		draw(k);
		return flat(k.build());
	};
	const base = (draw: (k: Kit) => void) => {
		const k = scene();
		k.lay();
		draw(k);
		const art = k.build();
		return { view: art.view, part: flat(art) };
	};
	const geo = scene();
	/** A closed outline on a sheet as an SVG path, for hit areas. */
	const area = (key: string, pts: P[]) => pathOf(geo.raw.on(key, pts), true);
	return { scene, part, base, area, geo };
}

export type Kit = ReturnType<ReturnType<typeof figure>['scene']>;

const circle = (cu: number, cv: number, r: number): P[] => ellipse(cu, cv, r, r, 28);

/** A closed folder: tab and body. */
export function folder(k: Kit, key: string, u: number, v: number, seed: number, cls = 'sheet-ink') {
	const body: P[] = [[u - 0.32, v - 0.36], [u - 0.06, v - 0.36], [u + 0.02, v - 0.46], [u + 0.32, v - 0.46], [u + 0.36, v - 0.36], [u + 0.36, v + 0.12], [u - 0.32, v + 0.12]];
	k.raw.path(pathOf(k.raw.on(key, body), true), 'folder-fill');
	k.raw.path(outline(k.raw.on(key, body), { w: 0.8, seed }), cls);
}

/** A file: a page with a folded corner. */
export function file(k: Kit, key: string, u: number, v: number, seed: number) {
	const page: P[] = [[u - 0.26, v - 0.5], [u + 0.1, v - 0.5], [u + 0.28, v - 0.32], [u + 0.28, v + 0.14], [u - 0.26, v + 0.14]];
	k.raw.path(pathOf(k.raw.on(key, page), true), 'sheet-paper');
	k.raw.path(outline(k.raw.on(key, page), { w: 0.75, seed }) + line(k.raw.on(key, [[u + 0.1, v - 0.5], [u + 0.1, v - 0.32], [u + 0.28, v - 0.32]]), { w: 0.5, seed: seed + 1, over: 0 }), 'sheet-ink');
}

/** A small disclosure chevron, open (pointing down) or shut (pointing right). */
export function chevron(k: Kit, key: string, u: number, v: number, open: boolean, seed: number) {
	const pts: P[] = open ? [[u - 0.14, v - 0.3], [u, v - 0.12], [u + 0.14, v - 0.3]] : [[u - 0.06, v - 0.38], [u + 0.1, v - 0.2], [u - 0.06, v - 0.02]];
	k.raw.path(stroke(k.raw.on(key, pts), { w: 0.9, seed, over: 0 }), 'sheet-ink');
}

export function tick(k: Kit, key: string, cu: number, cv: number, seed: number) {
	const on = (pts: P[]) => k.raw.on(key, pts);
	k.raw.path(wash(on(circle(cu, cv, 0.38)), seed, 0.2, 0.8), 'ok-wash');
	k.raw.path(outline(on(circle(cu, cv, 0.38)), { w: 1, seed: seed + 1 }), 'ok-ink');
	k.raw.path(stroke(on([[cu - 0.18, cv], [cu - 0.04, cv + 0.15], [cu + 0.2, cv - 0.16]]), { w: 1.3, seed: seed + 2, over: 0.3 }), 'ok-ink');
}

export function cross(k: Kit, key: string, cu: number, cv: number, seed: number) {
	const on = (pts: P[]) => k.raw.on(key, pts);
	k.raw.path(wash(on(circle(cu, cv, 0.38)), seed, 0.2, 0.8), 'bad-wash');
	k.raw.path(outline(on(circle(cu, cv, 0.38)), { w: 1, seed: seed + 1 }), 'bad-ink');
	k.raw.path(stroke(on([[cu - 0.15, cv - 0.15], [cu + 0.15, cv + 0.15]]), { w: 1.3, seed: seed + 2, over: 0.2 }) + stroke(on([[cu + 0.15, cv - 0.15], [cu - 0.15, cv + 0.15]]), { w: 1.3, seed: seed + 3, over: 0.2 }), 'bad-ink');
}

/** A loose highlighter band behind one row of a sheet. */
export function band(k: Kit, key: string, u0: number, u1: number, v: number, seed: number, cls = 'hover-wash') {
	k.raw.path(wash(k.raw.on(key, roundRect(u0, v - 0.55, u1, v + 0.5, 0.3, 3)), seed, 0.3, 1), cls);
}

/** A pen line through a row, crossing it out. */
export function strikeOut(k: Kit, key: string, u0: number, u1: number, v: number, seed: number, cls = 'bad-pen-fill') {
	k.raw.path(stroke(k.raw.on(key, [[u0, v - 0.12], [u1, v - 0.22]]), { w: 1.3, seed, over: 0.3 }), cls);
}
