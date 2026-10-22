// Draws each showcase card in the hand of the ink logos: one ink, tapered fineliner outlines, diagonal hatching for tone.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hatch, hull, line, outline, type P, pathOf, resample } from '../components/figures/ink/ink.ts';
import { angleOf, CAST_LAYERS, DESK_LAYERS, HATCH, PILES, pileCounts, pileHeight, SHEET, SHEET_OVER, SHEET_UNDER, SKETCH_DIR, sketchFile, VIEW } from '../components/docs/showcase/sketch.ts';
import type { ShowcaseApp } from '../components/docs/showcase/types.ts';

const seedOf = (text: string) => [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261) % 100000;

const turn = (centre: P, degrees: number) => {
	const a = (degrees * Math.PI) / 180;
	const c = Math.cos(a);
	const s = Math.sin(a);
	return ([x, y]: P): P => [centre[0] + (x - centre[0]) * c - (y - centre[1]) * s, centre[1] + (x - centre[0]) * s + (y - centre[1]) * c];
};

const box = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const strokes = (d: string) => `<path fill="none" d="${d}"/>`;
const shapes = (d: string) => `<path stroke="none" d="${d}"/>`;

const pen = { heavy: 0.5, wobble: 0.5, over: 1.2 };

function sheet(seed: number, angle: number) {
	const centre: P = [SHEET.cx, SHEET.cy];
	const at = turn(centre, angle);
	const m = SHEET.margin;
	const corners = box(SHEET.cx - SHEET.w / 2 - m, SHEET.cy - SHEET.h / 2 - m, SHEET.cx + SHEET.w / 2 + m, SHEET.cy + SHEET.h / 2 + m).map(at);
	const print = box(SHEET.cx - SHEET.w / 2, SHEET.cy - SHEET.h / 2, SHEET.cx + SHEET.w / 2, SHEET.cy + SHEET.h / 2).map(at);
	const cast = hull([...corners, ...corners.map(([x, y]) => [x + 6, y + 7] as P)]);
	return {
		shade: pathOf(cast, true),
		hatch: hatch(cast, HATCH, 2.6, seed + 2, { cluster: 4, skip: 0.1, trim: 0.25 }),
		paper: pathOf(corners, true),
		texture: hatch(print, HATCH, 3.4, seed + 3, { cluster: 6, skip: 0.15, trim: 0.3 }),
		ink: outline(resample(corners, 4, true), { ...pen, w: 1.5, centre, seed: seed + 4 }) + outline(resample(print, 4, true), { ...pen, w: 0.6, wobble: 0.3, seed: seed + 5 }),
	};
}

function pile(x: number, height: number, seed: number) {
	const { base, w, dx, dy } = PILES;
	const top = base - height;
	const front = box(x, top, x + w, base);
	const lid: P[] = [[x, top], [x + w, top], [x + w + dx, top + dy], [x + dx, top + dy]];
	const side: P[] = [[x + w, top], [x + w + dx, top + dy], [x + w + dx, base + dy], [x + w, base]];
	const cast: P[] = [[x + w, base], [x + w + dx, base + dy], [x + w + dx + 9, base + dy + 4], [x + w + 7, base + 5], [x + 5, base + 5], [x, base]];
	const leaves: string[] = [];
	for (let y = base - 2.6, k = 0; y > top + 1.4; y -= 2.6 + (k % 3) * 0.35, k++)
		leaves.push(line([[x + 1 + (k % 2), y], [x + w - 1 - ((k + 1) % 2), y + ((k % 3) - 1) * 0.3]], { w: 0.35, wobble: 0.2, over: 0.4, seed: seed + 20 + k }));
	return {
		shadow: hatch(cast, HATCH, 2.2, seed + 3, { cluster: 4, skip: 0.1 }),
		paper: pathOf(front, true) + pathOf(lid, true) + pathOf(side, true),
		tone: pathOf(side, true),
		hatch: hatch(side, HATCH, 1.8, seed + 1, { cluster: 4, trim: 0.1 }),
		ink:
			outline(resample([[x, base], [x, top], [x + dx, top + dy], [x + w + dx, top + dy], [x + w + dx, base + dy], [x + w, base]], 3, true), { ...pen, w: 1.2, centre: [x + w / 2, top + height / 2], seed: seed + 4 }) +
			line([[x, top], [x + w, top], [x + w + dx, top + dy]], { ...pen, w: 0.7, seed: seed + 5 }) +
			line([[x + w, top], [x + w, base]], { ...pen, w: 0.7, seed: seed + 6 }) +
			leaves.join(''),
		front,
	};
}

/** An empty spot where a pile would stand: a dotted footprint. */
const footprint = (x: number, seed: number) =>
	line([[x, PILES.base], [x + PILES.w, PILES.base], [x + PILES.w + PILES.dx, PILES.base + PILES.dy]], { w: 0.5, wobble: 0.3, over: 0.5, seed });

/** One card's sketch as an SVG file of named layers, drawn by the card with `<use>`. */
export function showcaseSketch(app: ShowcaseApp, at: number): string {
	const seed = seedOf(app.slug);
	const s = sheet(seed, angleOf(at));
	const counts = pileCounts(app);
	const total = counts ? counts.old + counts.moved : 0;
	const old = counts && counts.old > 0 ? pile(PILES.old, pileHeight(counts.old, total), seed + 40) : null;
	const moved = counts && counts.moved > 0 ? pile(PILES.moved, pileHeight(counts.moved, total), seed + 60) : null;
	const ground = line([[PILES.old - 8, PILES.base + 0.5], [PILES.moved + PILES.w + PILES.dx + 8, PILES.base + 0.5]], { w: 0.5, wobble: 0.4, over: 2, seed: seed + 80 });
	const layers: Record<(typeof DESK_LAYERS)[number] | (typeof CAST_LAYERS)[number] | typeof SHEET_UNDER | (typeof SHEET_OVER)[number], string> = {
		ground: shapes(ground + (old ? '' : footprint(PILES.old, seed + 81)) + (moved ? '' : footprint(PILES.moved, seed + 82))),
		'pile-shadow': strokes((old?.shadow ?? '') + (moved?.shadow ?? '')),
		'pile-paper': shapes((old?.paper ?? '') + (moved?.paper ?? '')),
		'pile-tone': shapes((old?.tone ?? '') + (moved?.tone ?? '')),
		'pile-wash': shapes(moved ? pathOf(moved.front, true) : ''),
		'pile-hatch': strokes((old?.hatch ?? '') + (moved?.hatch ?? '')),
		'pile-ink': shapes((old?.ink ?? '') + (moved?.ink ?? '')),
		'sheet-shade': shapes(s.shade),
		'sheet-hatch': strokes(s.hatch),
		'sheet-paper': shapes(s.paper),
		'sheet-texture': strokes(s.texture),
		'sheet-ink': shapes(s.ink),
	};
	const groups = Object.entries(layers).map(([id, body]) => `<g id="${id}">${body}</g>`).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.width} ${VIEW.height}"><defs>${groups}</defs></svg>\n`;
}

/** Every sketch file, by file name in `public/showcase/sketch/`, the same each run. */
export function showcaseSketches(apps: readonly ShowcaseApp[]): Map<string, string> {
	return new Map(apps.map((app, at) => [sketchFile(app.slug).slice(SKETCH_DIR.length), showcaseSketch(app, at)]));
}

/** Replaces the files in `dir` with the sketches `apps` need. */
export async function writeShowcaseSketches(dir: string, apps: readonly ShowcaseApp[]): Promise<number> {
	const files = showcaseSketches(apps);
	await mkdir(dir, { recursive: true });
	for (const name of await readdir(dir)) if (!files.has(name)) await rm(resolve(dir, name));
	for (const [name, text] of files) await writeFile(resolve(dir, name), text);
	return files.size;
}
