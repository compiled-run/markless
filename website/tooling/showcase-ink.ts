// Draws the showcase cards' ink as SVG mask files; each file is stretched to its box, so sizes are the box's usual shape.
import { hatch, outline, type P, wash } from '../components/figures/ink/ink.ts';
import { BAR, FRAME, FRAME_WIDE, INK_DIR, inkFilesOf, movedShare, STAMP, STAMP_FILE, VARIANTS } from '../components/docs/showcase/ink-files.ts';
import type { ShowcaseApp } from '../components/docs/showcase/types.ts';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Size = { readonly width: number; readonly height: number };

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): P[] {
	const corners: P[] = [
		[x1 - r, y0 + r],
		[x1 - r, y1 - r],
		[x0 + r, y1 - r],
		[x0 + r, y0 + r],
	];
	return corners.flatMap(([cx, cy], at) =>
		Array.from({ length: 6 }, (_, i): P => {
			const a = ((at - 1) / 2 + i / 10) * Math.PI;
			return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
		}),
	);
}

const seedOf = (text: string) => [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261) % 100000;

const svg = (size: Size, body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" preserveAspectRatio="none">${body}</svg>\n`;
const filled = (d: string) => `<path d="${d}"/>`;
const hatched = (d: string) => `<path fill="none" stroke="#000" stroke-width="0.6" stroke-linecap="round" d="${d}"/>`;

const frameInk = (size: Size, seed: number) => outline(roundRect(2.5, 2.5, size.width - 2.5, size.height - 2.5, 13), { w: 1.7, heavy: 0.6, wobble: 0.9, seed });
const frameWash = (size: Size, seed: number) => wash(roundRect(6, 6, size.width - 4, size.height - 4, 14), seed, 1.5, 3);

function barShare(share: number) {
	const end = 2.5 + Math.max(0, Math.min(1, share)) * (BAR.width - 5);
	return roundRect(2.5, 3, end, BAR.height - 3, Math.min(4, (end - 2.5) / 2));
}

const fileName = (path: string) => path.slice(INK_DIR.length);

/** Every ink file the showcase grid uses, by file name in `public/showcase/ink/`, the same each run. */
export function showcaseInk(apps: readonly ShowcaseApp[]): Map<string, string> {
	const files = new Map<string, string>();
	const shared = inkFilesOf(apps);
	for (let v = 0; v < Math.min(VARIANTS, apps.length); v++) {
		const card = shared[v]!;
		const seed = 101 + v * 7919;
		files.set(fileName(card.frame), svg(FRAME, filled(frameInk(FRAME, seed))));
		files.set(fileName(card.frameWide), svg(FRAME_WIDE, filled(frameInk(FRAME_WIDE, seed + 11))));
		files.set(fileName(card.wash), svg(FRAME, filled(frameWash(FRAME, seed + 1))));
		files.set(fileName(card.washWide), svg(FRAME_WIDE, filled(frameWash(FRAME_WIDE, seed + 12))));
		files.set(fileName(card.bar), svg(BAR, filled(outline(roundRect(1.5, 2, BAR.width - 1.5, BAR.height - 2, 5), { w: 1.1, wobble: 0.5, seed: seed + 23 }))));
	}
	apps.forEach((app, at) => {
		const card = shared[at]!;
		const seed = seedOf(app.slug);
		if (card.barFill) files.set(fileName(card.barFill), svg(BAR, filled(wash(barShare(movedShare(app)), seed + 2, 0.4, 0.9))));
		if (card.barHatch) files.set(fileName(card.barHatch), svg(BAR, hatched(hatch(barShare(movedShare(app)), 1.05, 2.6, seed + 3, { cluster: 3, trim: 0.1 }))));
	});
	files.set(
		fileName(STAMP_FILE),
		svg(STAMP, filled(outline(roundRect(3, 3, STAMP.width - 3, STAMP.height - 3, 7), { w: 2.6, wobble: 1, seed: 37 }) + outline(roundRect(8, 8, STAMP.width - 8, STAMP.height - 8, 4), { w: 1.2, wobble: 0.8, seed: 42 }))),
	);
	return files;
}

/** Replaces the files in `dir` with the ink `apps` need. */
export async function writeShowcaseInk(dir: string, apps: readonly ShowcaseApp[]): Promise<number> {
	const files = showcaseInk(apps);
	await mkdir(dir, { recursive: true });
	for (const name of await readdir(dir)) if (!files.has(name)) await rm(resolve(dir, name));
	for (const [name, text] of files) await writeFile(resolve(dir, name), text);
	return files.size;
}
