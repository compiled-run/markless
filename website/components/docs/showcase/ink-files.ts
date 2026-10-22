// The showcase cards' ink is drawn once by tooling/showcase-ink.ts into public/showcase/ink/ and used as CSS masks, so no drawing code ships.
import type { ShowcaseApp } from './types.ts';

export const INK_DIR = '/showcase/ink/';
export const FRAME = { width: 300, height: 400 };
export const FRAME_WIDE = { width: 360, height: 150 };
export const BAR = { width: 240, height: 14 };
export const STAMP = { width: 120, height: 56 };
export const STAMP_FILE = `${INK_DIR}stamp.svg`;
/** Cards cycle through this many hand-drawn outlines and shadows. */
export const VARIANTS = 4;

export interface CardInkFiles {
	readonly frame: string;
	readonly frameWide: string;
	readonly wash: string;
	readonly washWide: string;
	readonly bar: string;
	/** `null` when no page has moved yet. */
	readonly barFill: string | null;
	readonly barHatch: string | null;
	/** `null` unless the app is finished. */
	readonly stamp: string | null;
}

/** The ink files one card uses, by its position in the grid, its slug, the share of pages moved and whether it is finished. */
export function cardInkFiles(at: number, slug: string, share: number, done: boolean): CardInkFiles {
	const v = at % VARIANTS;
	return {
		frame: `${INK_DIR}frame-${v}.svg`,
		frameWide: `${INK_DIR}frame-wide-${v}.svg`,
		wash: `${INK_DIR}wash-${v}.svg`,
		washWide: `${INK_DIR}wash-wide-${v}.svg`,
		bar: `${INK_DIR}bar-${v}.svg`,
		barFill: share > 0 ? `${INK_DIR}${slug}-fill.svg` : null,
		barHatch: share > 0 ? `${INK_DIR}${slug}-hatch.svg` : null,
		stamp: done ? STAMP_FILE : null,
	};
}

/** The share of pages moved, 0 to 1; 0 before a coverage run. */
export function movedShare(app: ShowcaseApp): number {
	return app.coverage && app.coverage.total > 0 ? app.coverage.ported / app.coverage.total : 0;
}

/** The ink files for every card, in grid order. */
export const inkFilesOf = (apps: readonly ShowcaseApp[]): CardInkFiles[] =>
	apps.map((app, at) => cardInkFiles(at, app.slug, movedShare(app), app.status === 'done'));
