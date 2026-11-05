// Ink frames for the Styling figure: three source-file sheets with a folded corner, two rendered cards, and a colour swatch.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

/** One file sheet in its own 300 × 200 box: a page with a folded corner and a hatched shadow. */
function fileArt(seed: number) {
	const page: P[] = jitter(resample([[4, 4], [270, 4], [296, 30], [296, 196], [4, 196]], 7, true), seed, 0.9);
	const fold: P[] = [[270, 4], [272, 28], [296, 30]];
	const shadow: P[] = page.map(([x, y]) => [x + 5, y + 6]);
	return {
		shadow: pathOf(shadow, true),
		page: pathOf(page, true),
		ink: outline(page, { w: 1.5, heavy: 1.1, seed: seed + 1 }) + outline(fold, { w: 0.9, seed: seed + 2 }, false),
		fold: hatch(fold, 0.8, 1.6, seed + 3, { cluster: 2 }),
		rule: line([[14, 34], [250, 35]], { w: 0.5, seed: seed + 4, over: 0.2 }),
	};
}

/** A rendered card in its own 260 × 120 box, with a thick lower edge for weight. */
function cardArt(seed: number) {
	const face = jitter(resample(roundRect(4, 4, 256, 116, 12), 6, true), seed, 1);
	const shadow = jitter(resample(roundRect(10, 12, 262, 124, 12), 8, true), seed + 1, 1.1);
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow.map(([x, y]) => [x, y]), -0.4, 2.6, seed + 2, { cluster: 4, skip: 0.3 }),
		face: pathOf(face, true),
		ink: outline(face, { w: 1.8, heavy: 1.4, seed: seed + 3 }),
		avatar: outline(ellipse(44, 60, 24, 24, 20), { w: 1.2, seed: seed + 4 }),
	};
}

/** The small paint swatch drawn on a rule's line, 26 × 20. */
function swatchArt(seed: number) {
	const blob = jitter(resample(ellipse(13, 10, 11, 8, 14), 3, true), seed, 1.4);
	return { blob: pathOf(blob, true), ink: outline(blob, { w: 1.1, seed: seed + 1 }) };
}

/** The whole figure's frames, frozen into files.art.ts. */
export function drawing() {
	return {
		files: [fileArt(9810), fileArt(9830), fileArt(9850)],
		cards: [cardArt(9870), cardArt(9890)],
		swatches: [swatchArt(9910), swatchArt(9920), swatchArt(9930)],
	};
}
