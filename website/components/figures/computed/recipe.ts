// The shop page with its recipe card on the desk: the card works the total out line by line from the cart, and the page shows the last line.
import { createScene, ellipse, type P, roundRect, sheetAt } from '../ink/scene.ts';
import { jitter } from '../ink/desk.ts';
import { deskPlane, pencil } from '../ink/plane.ts';
import { hatch, hull, line, outline, pathOf, pool, r1, resample, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 600;

export const CART_ROW = { u: 1.4, v: 11.3 };
export const TOTAL_ROW = { u: 1.4, v: 13.3 };
const BUTTON = { u0: 5, v0: 8.45, u1: 10.9, v1: 9.75 };
const CARD = { c: [15.2, 11.6] as P, w: 16.6, h: 9.4, turn: -0.05 };
/** The card's lines, in card units from its top left: the title, then the recipe's three steps. */
export const CARD_LINES = [1.9, 4.1, 6.0, 7.9] as const;

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[CARD.c[0] + CARD.w / 2 + 1, CARD.c[1] + CARD.h / 2 + 1.2, 0],
		[CARD.c[0] - CARD.w / 2 - 0.4, CARD.c[1] + CARD.h / 2 + 1.2, 0],
	],
	target: [11, 2.6, 0.4],
});
const { proj, onSheet, sheetMatrix } = scene;
const plane = deskPlane(proj, CARD.c, CARD.w, CARD.h, CARD.turn, 0.02);

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

/** The recipe card lying on the desk: ruled, a pink margin rule, a dog-eared corner, and its shadow. */
function cardArt() {
	const { w, h } = CARD;
	const edgePts: P[] = jitter(resample([[0, 0], [w, 0], [w, h - 0.9], [w - 0.9, h], [0, h]], 0.3, true), 5100, 0.04);
	const edge = plane.on(edgePts);
	const ear = plane.on([[w, h - 0.9], [w - 0.75, h - 0.75], [w - 0.9, h]]);
	const shadow = hull([...edge.map(([x, y]) => [x + 6, y + 7] as P), ...edge]);
	const rules = CARD_LINES.slice(1).map((v, i) => line(plane.on([[0.4, v + 0.35], [w - 0.4, v + 0.35]]), { w: 0.5, seed: 5110 + i, over: 0 })).join('');
	const margin = plane.on([[1.4, 0.2], [1.4, h - 0.2]]);
	const spot = (v: number, seed: number) => {
		const poly = plane.on(ellipse(w - 1.95, v - 0.45, 1.7, 0.75, 26));
		return { wash: wash(poly, seed, 1, 3), pool: wash(pool(poly, poly[0]!, 0.55), seed + 1, 0.5, 2) };
	};
	return {
		paper: pathOf(edge, true),
		shadow: { wash: wash(shadow, 5120, 1.2, 3), hatch: hatch(shadow, -0.5, 2.6, 5121, { cluster: 5, skip: 0.25 }) },
		ink: outline(edge, { w: 1.3, heavy: 1.1, seed: 5122 }) + outline(ear, { w: 0.8, seed: 5123 }),
		ear: hatch(ear, 0.6, 1.2, 5124, { cluster: 2 }),
		rules,
		margin: pathOf(margin),
		pencil: pencil(plane.on([[-0.8, 0], [w + 1, 0]]), 5130) + pencil(plane.on([[0, -0.6], [0, h + 0.8]]), 5131),
		lines: CARD_LINES.map((v) => plane.matrix(1.9, v, 0.1)),
		spots: CARD_LINES.slice(1).map((v, i) => spot(v, 5140 + i * 3)),
	};
}

/** The whole scene, frozen into recipe.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			...scene.shopArt(),
			cartMatrix: sheetMatrix(CART_ROW.u, CART_ROW.v),
			totalMatrix: sheetMatrix(TOTAL_ROW.u, TOTAL_ROW.v),
			cartSpot: scene.spot(CART_ROW.u + 10.15, CART_ROW.v - 0.62, 1.2, 0.85, 3900),
			totalSpot: scene.spot(TOTAL_ROW.u + 7, TOTAL_ROW.v - 0.62, 2.2, 0.9, 3910),
			button: buttonArt(),
		},
		card: cardArt(),
		note: scene.note(plane.on([[0.3, CARD.h * 0.62]])[0]!, 3970, [4, HEIGHT - 26]),
	};
}
