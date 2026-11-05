// The shop page and a sticker sheet on the desk: at three bags the Free shipping sticker is pressed onto the order; below three it goes back on its backing.
import { createScene, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { jitter } from '../ink/desk.ts';
import { deskPlane, pencil } from '../ink/plane.ts';
import { hatch, hull, outline, pathOf, r1, resample, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 440;

export const CART_ROW = { u: 1.4, v: 11.3 };
const BUTTON = { u0: 5, v0: 8.45, u1: 10.9, v1: 9.75 };
const ON_PAGE = { u0: 1.4, v0: 12.4, u1: 11.2, v1: 14.1 };
const BACKING = { c: [27.6, -3.4] as P, w: 9.6, h: 6.4, turn: 0.06 };
const SLOT = { u0: 1.2, v0: 2.2, u1: 8.4, v1: 4.2 };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[BACKING.c[0] + BACKING.w / 2 + 1, BACKING.c[1] - BACKING.h / 2 - 0.4, 0],
		[BACKING.c[0] + BACKING.w / 2 + 1, BACKING.c[1] + BACKING.h / 2 + 1, 0],
	],
	target: [13.6, -2.4, 0.4],
});
const { proj, onSheet, sheetMatrix } = scene;
const backing = deskPlane(proj, BACKING.c, BACKING.w, BACKING.h, BACKING.turn, 0.02);

/** The Add to cart button: a raised pink tab on the page that sinks when pressed. */
function buttonArt() {
	const { u0, v0, u1, v1 } = BUTTON;
	const face = onSheet(roundRect(u0, v0, u1, v1, 0.35), 0.12);
	const side = onSheet(roundRect(u0 + 0.08, v0 + 0.12, u1 + 0.08, v1 + 0.12, 0.35));
	const a = proj(sheetAt(u0, v0, 0.12));
	const b = proj(sheetAt(u0 + 0.06, v0 + 0.1, 0));
	return {
		side: pathOf(side, true),
		sideHatch: hatch(side, 0.9, 1.4, 3010, { cluster: 1 }),
		paper: pathOf(face, true),
		wash: wash(face, 3011, 0.8, 1.6),
		ink: outline(face, { w: 1.1, heavy: 0.8, seed: 3012 }),
		matrix: sheetMatrix(u0 + 0.5, v0 + 0.9),
		sink: `--sink-x:${r1(b[0] - a[0])}px;--sink-y:${r1(b[1] - a[1] + 0.8)}px`,
	};
}

/** A sticker: a rounded die-cut label with a slight lift, its yellow face and a matrix for its words. */
function stickerOn(map: (pts: P[], lift?: number) => P[], box: typeof ON_PAGE, matrix: string, seed: number) {
	const shape = jitter(resample(roundRect(box.u0, box.v0, box.u1, box.v1, 0.6), 0.25, true), seed, 0.03);
	const face = map(shape, 0.06);
	const lift = map(shape.map(([u, v]) => [u + 0.12, v + 0.16] as P));
	return {
		lift: pathOf(lift, true),
		paper: pathOf(face, true),
		wash: wash(face, seed + 1, 0.6, 1.4),
		ink: outline(face, { w: 1.2, heavy: 0.9, seed: seed + 2 }),
		matrix,
	};
}

/** The sticker sheet on the desk: a glossy backing with the die-cut slot the sticker came from. */
function backingArt() {
	const { w, h } = BACKING;
	const edge = backing.on(jitter(resample(roundRect(0, 0, w, h, 0.3), 0.3, true), 5300, 0.04));
	const shadow = hull([...edge.map(([x, y]) => [x + 5, y + 6] as P), ...edge]);
	const slot = backing.on(roundRect(SLOT.u0, SLOT.v0, SLOT.u1, SLOT.v1, 0.6));
	const gloss = backing.on([[0.6, h - 1.6], [w * 0.55, h - 0.5], [w * 0.55, h - 0.9], [0.6, h - 2]]);
	return {
		paper: pathOf(edge, true),
		shadow: { wash: wash(shadow, 5310, 1.2, 3), hatch: hatch(shadow, -0.5, 2.6, 5311, { cluster: 5, skip: 0.25 }) },
		ink: outline(edge, { w: 1.3, heavy: 1.1, seed: 5312 }),
		slot: outline(slot, { w: 0.6, seed: 5313 }),
		gloss: hatch(gloss, 0.7, 1.4, 5314, { cluster: 3, skip: 0.3 }),
		labelMatrix: backing.matrix(0.6, h - 0.5, 0.1),
		pencil: pencil(backing.on([[-0.8, 0], [w + 1, 0]]), 5330),
		sticker: stickerOn((pts, lift) => backing.on(pts, lift), SLOT, backing.matrix(SLOT.u0 + 0.9, SLOT.v1 - 0.55, 0.1, 0.06), 5340),
	};
}

/** The whole scene, frozen into sticker.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			...scene.shopArt(),
			cartMatrix: sheetMatrix(CART_ROW.u, CART_ROW.v),
			cartSpot: scene.spot(CART_ROW.u + 10.15, CART_ROW.v - 0.62, 1.2, 0.85, 3900),
			button: buttonArt(),
			sticker: stickerOn((pts, lift) => onSheet(pts, lift), ON_PAGE, sheetMatrix(ON_PAGE.u0 + 0.9, ON_PAGE.v1 - 0.5), 5400),
		},
		backing: backingArt(),
		note: scene.note(backing.on([[0.4, 0.5]])[0]!, 5470),
	};
}
