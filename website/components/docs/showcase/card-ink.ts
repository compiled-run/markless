// The showcase cards' pen-and-ink parts, drawn once on the server: each SVG is stretched to its box, so sizes are the box's usual shape.
import { hatch, outline, type P, wash } from '../../figures/ink/ink.ts';

export const FRAME = { width: 300, height: 400 };
export const FRAME_WIDE = { width: 360, height: 150 };
export const BAR = { width: 240, height: 14 };
export const STAMP = { width: 120, height: 56 };

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): P[] {
	const corners: P[] = [
		[x1 - r, y0 + r],
		[x1 - r, y1 - r],
		[x0 + r, y1 - r],
		[x0 + r, y0 + r],
	];
	return corners.flatMap(([cx, cy], at) => Array.from({ length: 6 }, (_, i): P => {
		const a = ((at - 1) / 2 + i / 10) * Math.PI;
		return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
	}));
}

const seedOf = (text: string) => [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);

function frame(size: { width: number; height: number }, seed: number) {
	const { width: w, height: h } = size;
	return {
		ink: outline(roundRect(2.5, 2.5, w - 2.5, h - 2.5, 13), { w: 1.7, heavy: 0.6, wobble: 0.9, seed }),
		wash: wash(roundRect(6, 6, w - 4, h - 4, 14), seed + 1, 1.5, 3),
	};
}

/** The progress bar: a pen outline for every page, a watercolour wash and a little hatching over the share moved. */
function bar(share: number, seed: number) {
	const { width: w, height: h } = BAR;
	const end = 2.5 + Math.max(0, Math.min(1, share)) * (w - 5);
	const filled = roundRect(2.5, 3, end, h - 3, Math.min(4, (end - 2.5) / 2));
	return {
		ink: outline(roundRect(1.5, 2, w - 1.5, h - 2, 5), { w: 1.1, wobble: 0.5, seed }),
		fill: share > 0 ? wash(filled, seed + 2, 0.4, 0.9) : '',
		hatch: share > 0 ? hatch(filled, 1.05, 2.6, seed + 3, { cluster: 3, trim: 0.1 }) : '',
	};
}

function stamp(seed: number) {
	const { width: w, height: h } = STAMP;
	return {
		ink: outline(roundRect(3, 3, w - 3, h - 3, 7), { w: 2.6, wobble: 1, seed }) + outline(roundRect(8, 8, w - 8, h - 8, 4), { w: 1.2, wobble: 0.8, seed: seed + 5 }),
	};
}

export interface CardInk {
	readonly frame: { readonly ink: string; readonly wash: string };
	readonly frameWide: { readonly ink: string; readonly wash: string };
	readonly bar: { readonly ink: string; readonly fill: string; readonly hatch: string };
	readonly stamp: { readonly ink: string } | null;
}

/** Every ink part of one card, the same each time for the same slug. */
export function cardInk(slug: string, share: number, done: boolean): CardInk {
	const seed = seedOf(slug) % 100000;
	return {
		frame: frame(FRAME, seed),
		frameWide: frame(FRAME_WIDE, seed + 11),
		bar: bar(share, seed + 23),
		stamp: done ? stamp(seed + 37) : null,
	};
}
