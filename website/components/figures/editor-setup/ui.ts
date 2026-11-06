// Shared pieces for the tooling figures: separately drawn parts on one desk, code rows with a gutter, hover tooltips, red squiggles, toggles and screen hit boxes.
import { ellipse, roundRect } from '../ink/desk.ts';
import { outline, pathOf, r1, resample, stroke, wash } from '../ink/ink.ts';
import type { DeskArt, P, Run, desk } from '../ink/sheets.ts';

export type Kit = ReturnType<typeof desk>;

/** Monospace advance and row pitch, in sheet units, for 10px code. */
export const ADV = 0.3;
export const PITCH = 0.8;

/** One separately drawn part of a scene, on the same desk and camera as every other part. */
export const part = (scene: () => Kit, draw: (k: Kit) => void): DeskArt => {
	const k = scene();
	draw(k);
	return k.build();
};

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** The screen box of a sheet rectangle. */
export function boxOf(k: Kit, key: string, u0: number, v0: number, u1: number, v1: number): Box {
	const a = k.raw.proj(k.raw.at(key, u0, v0));
	const b = k.raw.proj(k.raw.at(key, u1, v1));
	return { x: r1(Math.min(a[0], b[0])), y: r1(Math.min(a[1], b[1])), w: r1(Math.abs(b[0] - a[0])), h: r1(Math.abs(b[1] - a[1])) };
}

/** Code rows from `v0`, each with its line number in a gutter left of `u`. */
export function code(k: Kit, key: string, u: number, v0: number, rows: readonly (Run[] | null)[], first = 1) {
	rows.forEach((runs, i) => {
		k.row(key, u - 1.1, v0 + i * PITCH, String(first + i).padStart(2, ' '), 'num');
		if (runs && runs.length) k.print(key, u, v0 + i * PITCH, runs);
	});
}

/** A red wavy line under columns c0 to c1 of a code row. */
export function squiggle(k: Kit, key: string, u: number, c0: number, c1: number, v: number, seed: number) {
	const pts: P[] = [];
	for (let c = c0; c <= c1 + 0.001; c += 0.2) pts.push(k.raw.proj(k.raw.at(key, u + c * ADV, v + 0.17 + Math.sin(((c - c0) / 1.05) * Math.PI) * 0.07, 0.02)));
	k.raw.path(stroke(resample(pts, 1.5), { w: 1.1, seed, over: 0, wobble: 0.15 }), 'squiggle');
}

/** A hover tooltip box on a sheet with its top left at (u, v): paper, an inked edge, and rows of small text. */
export function tooltip(k: Kit, key: string, u: number, v: number, rows: readonly Run[][], seed: number, width?: number) {
	const w = width ?? Math.max(...rows.map((r) => r.reduce((n, run) => n + run.t.length, 0))) * ADV + 0.7;
	const h = rows.length * 0.75 + 0.45;
	const box = k.raw.on(key, roundRect(u, v, u + w, v + h, 0.12, 3), 0.1);
	const shade = k.raw.on(key, roundRect(u + 0.12, v + 0.14, u + w + 0.12, v + h + 0.14, 0.12, 3), 0.02);
	k.raw.path(pathOf(shade, true), 'shadow-wash light');
	k.raw.path(pathOf(box, true), 'sheet-paper');
	k.raw.path(outline(box, { w: 0.9, heavy: 0.7, seed }), 'sheet-ink');
	rows.forEach((runs, i) => k.print(key, u + 0.35, v + 0.8 + i * 0.75, runs));
}

/** A slide switch on a sheet at (u, v): its track, and two knobs, one per position; the figure shows the right knob. */
export function toggle(k: Kit, key: string, u: number, v: number, seed: number) {
	const track = k.raw.on(key, roundRect(u, v - 0.45, u + 1.5, v + 0.15, 0.3, 4), 0.02);
	k.raw.path(pathOf(track, true), 'track');
	k.raw.path(outline(track, { w: 0.9, seed }), 'sheet-ink');
	const knob = (cu: number, cls: string, s: number) => {
		const pts = k.raw.on(key, ellipse(cu, v - 0.15, 0.26, 0.26, 18), 0.05);
		k.raw.path(pathOf(pts, true), 'sheet-paper ' + cls);
		k.raw.path(outline(pts, { w: 0.9, heavy: 0.6, seed: s }), 'sheet-ink ' + cls);
	};
	knob(u + 1.18, 'knob-on', seed + 1);
	knob(u + 0.32, 'knob-off', seed + 2);
}

/** A loose yellow highlighter band over a sheet rectangle. */
export function band(k: Kit, key: string, u0: number, v0: number, u1: number, v1: number, seed: number) {
	k.raw.path(wash(k.raw.on(key, roundRect(u0, v0, u1, v1, 0.2, 3), 0.01), seed, 0.5, 1.4), 'band');
}
