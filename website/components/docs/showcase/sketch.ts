// Where things sit in a showcase card's drawing. tooling/showcase-sketch.ts draws the ink into public/showcase/sketch/; the card places the screenshot and labels with these same numbers.
import type { ShowcaseApp } from './types.ts';

export const SKETCH_DIR = '/showcase/sketch/';
export const VIEW = { width: 320, height: 200 };
export const SHEET = { cx: 104, cy: 90, w: 164, h: 102.5, margin: 7 };
/** Each card's sheet lies at its own slight angle, in degrees. */
export const ANGLES = [-3, 2, -2, 2.5];
/** The hatching angle every stroke of tone shares, as in the ink logos. */
export const HATCH = -0.8;
export const PILES = { base: 166, max: 88, w: 30, dx: 9, dy: -7, old: 210, moved: 266 };
/** The layers of every sketch file, bottom to top; each is a `<g id>` the card draws with `<use>` in its own colour. */
export const DESK_LAYERS = [
	'ground',
	'pile-shadow',
	'pile-paper',
	'pile-tone',
	'pile-wash',
	'pile-hatch',
	'pile-ink',
] as const;
export const CAST_LAYERS = ['sheet-shade', 'sheet-hatch'] as const;
/** Drawn over the sheet: the paper under the screenshot, then the hatching and ink over it. */
export const SHEET_UNDER = 'sheet-paper';
export const SHEET_OVER = ['sheet-texture', 'sheet-ink'] as const;

export const angleOf = (at: number) => ANGLES[at % ANGLES.length]!;

/** The screenshot's place on the sheet: the same rectangle and turn the tooling inks round. */
export function shotPlacement(at: number) {
	return {
		x: SHEET.cx - SHEET.w / 2,
		y: SHEET.cy - SHEET.h / 2,
		width: SHEET.w,
		height: SHEET.h,
		transform: `rotate(${angleOf(at)} ${SHEET.cx} ${SHEET.cy})`,
	};
}

/** Pages still on the old app and pages moved; `null` before a coverage run. */
export function pileCounts(
	app: ShowcaseApp,
): { readonly old: number; readonly moved: number } | null {
	return app.coverage
		? { old: app.coverage.total - app.coverage.ported, moved: app.coverage.ported }
		: null;
}

/** A pile's drawn height: in proportion to every page of the app, at least one sheet when it holds any. */
export function pileHeight(pages: number, total: number): number {
	if (pages <= 0 || total <= 0) return 0;
	return Math.max(2.4, (PILES.max * pages) / total);
}

export const sketchFile = (slug: string) => `${SKETCH_DIR}${slug}.svg`;
