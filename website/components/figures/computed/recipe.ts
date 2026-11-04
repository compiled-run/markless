// The shop page with the `cart` box and the `total` recipe on the desk: one press feeds the cart, and the recipe works the total out by itself.
import { bezier, createScene, type Crate, ellipse, type P, type Point3, roundRect, sheetAt } from '../ink/scene.ts';
import { add3 } from '../kit/lathe.ts';
import { hatch, outline, pathOf, r1, seeded, wash } from '../ink/ink.ts';
import { CART_NEW, CART_SLOT, TOTAL_NEW, TOTAL_SLOT } from './recipe-model.ts';

export const WIDTH = 680;
export const HEIGHT = 420;

export const CART_ROW = { u: 1.4, v: 11.3 };
export const TOTAL_ROW = { u: 1.4, v: 13.3 };
const BUTTON = { u0: 5, v0: 8.45, u1: 10.9, v1: 9.75 };
const CART: Crate = { u: 24.4, v: -1.8, w: 4.8, d: 3.8, h: 3.2 };
const RECIPE: Crate = { u: 25.2, v: 8.2, w: 3.6, d: 2.8, h: 2.2 };

export const CART_CLIP = { rear: [18.4, 9.9] as P, tip: [15.6, 11.0] as P };
export const TOTAL_CLIP = { rear: [17.2, 13.9] as P, tip: [14.2, 13.05] as P };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[CART.u + CART.w - 1.6 + 0.6, CART.v - 8.8, 0],
		[CART.u + CART.w - 1.6, CART.v - 8.8, CART.h + 2.4],
		[RECIPE.u + RECIPE.w - 1.6 + 1.4, RECIPE.v + RECIPE.d - 8.8, 0],
	],
	target: [11.6, -1.6, 0.6],
});
const { proj, onSheet, sheetMatrix, cord, alongSheet, crocodile } = scene;

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

/** The `cart` box: a kraft box of bags with its count stamped on the front. */
function cartArt() {
	const box = scene.crate(CART, 3100);
	const { w, d, h } = CART;
	const face = (pts: [number, number][]) => box.poly(pts.map(([x, z]) => [x, d, z] as [number, number, number]));
	const label = face([[0.5, h * 0.82], [w - 0.5, h * 0.82], [w - 0.5, h * 0.2], [0.5, h * 0.2]]);
	const knot = box.world(w - 0.02, d - 0.02, h * 0.82);
	return {
		cast: box.cast,
		paper: box.paper,
		kraft: wash(face([[0, 0], [w, 0], [w, h], [0, h]]), 3120, 0.8, 2) + wash(box.poly([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]]), 3121, 0.6, 2),
		shade: box.shade,
		ink: box.ink,
		label: pathOf(label, true),
		labelInk: outline(label, { w: 0.8, seed: 3125 }),
		countMatrix: box.frontMatrix(w / 2, h * 0.36),
		pencil: box.pencil,
		tag: scene.tag(knot, [0.55, 1, 0], 3140),
	};
}

/** The `total` recipe: a small box that takes bags in and gives dollars out, its rule lettered on the front. */
function recipeArt() {
	const box = scene.crate(RECIPE, 3200);
	const { w, d, h } = RECIPE;
	const face = (pts: [number, number][]) => box.poly(pts.map(([x, z]) => [x, d, z] as [number, number, number]));
	const plate = face([[0.35, h * 0.8], [w - 0.35, h * 0.8], [w - 0.35, h * 0.22], [0.35, h * 0.22]]);
	const knot = box.world(w - 0.02, d - 0.02, h * 0.82);
	return {
		cast: box.cast,
		paper: box.paper,
		shade: box.shade,
		ink: box.ink,
		plate: pathOf(plate, true),
		plateInk: outline(plate, { w: 0.8, seed: 3225 }),
		ruleMatrix: box.frontMatrix(w / 2, h * 0.38),
		pencil: box.pencil,
		tag: scene.tag(knot, [0.55, 1, 0], 3240),
	};
}

/** A loose pen line through an old number, in the text's own units. */
function scratch(x0: number, x1: number, seed: number) {
	const rnd = seeded(seed);
	const pts: P[] = [
		[x0 - 2, -3 + rnd()],
		[(x0 + x1) / 2, -4.6 + rnd()],
		[x1 + 2, -6.2 + rnd()],
	];
	const length = Math.hypot(pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1]) + Math.hypot(pts[2]![0] - pts[1]![0], pts[2]![1] - pts[1]![1]) + 1;
	return { d: `M${r1(pts[0]![0])} ${r1(pts[0]![1])}Q${r1(pts[1]![0])} ${r1(pts[1]![1])} ${r1(pts[2]![0])} ${r1(pts[2]![1])}`, length: r1(length) };
}

function wires() {
	const r = 0.24;
	const t = 0.13;
	const thin = cord(
		alongSheet(
			[
				[BUTTON.u1 + 0.1, (BUTTON.v0 + BUTTON.v1) / 2],
				[12.4, 8.2],
				[17.6, 6.4],
				[21.6, 3.2],
				[23.4, 0.9],
				[CART.u + 0.1, CART.v + 1.6],
			],
			t - 0.02,
		),
		t,
		3300,
	);
	const socket = onSheet(ellipse(CART.u + 0.1, CART.v + 1.6, 0.3, 0.26, 14), 0.4);
	const fromBox = (c: Crate, du: number, desk: P[], seed: number) => {
		const start: Point3 = sheetAt(c.u + du, c.v + c.d + 0.05, 0.6);
		const path = alongSheet(desk, r - 0.02);
		return cord([...bezier(start, add3(start, [0, 0.6, 0]), add3(path[0]!, [0, -0.3, 0.2]), path[0]!, 8), ...path.slice(1)], r, seed);
	};
	const cartRear = CART_CLIP.rear;
	const totalRear = TOTAL_CLIP.rear;
	const cartOut = fromBox(CART, 0.9, [[CART.u + 0.6, CART.v + CART.d + 1.2], [23.6, 4.6], [21.2, 7.2], [cartRear[0] + 0.7, cartRear[1] - 0.2], cartRear], 3400);
	const link = fromBox(CART, CART.w - 1.1, [[CART.u + CART.w - 1.1, CART.v + CART.d + 1], [CART.u + CART.w - 0.6, 5.2], [RECIPE.u + 2.2, RECIPE.v - 0.6], [RECIPE.u + 2.0, RECIPE.v + 0.05]], 3500);
	const totalOut = fromBox(RECIPE, 0.8, [[RECIPE.u + 0.4, RECIPE.v + RECIPE.d + 1.0], [22.6, 13.6], [19.4, 14.6], [totalRear[0] + 0.7, totalRear[1] + 0.1], totalRear], 3600);
	return {
		thin,
		cartOut,
		link,
		totalOut,
		socket: { paper: pathOf(socket, true), ink: outline(socket, { w: 0.8, seed: 3610 }) },
		cartClip: crocodile(CART_CLIP.rear, CART_CLIP.tip, 3700),
		totalClip: crocodile(TOTAL_CLIP.rear, TOTAL_CLIP.tip, 3800),
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
			cartSpot: scene.spot(CART_ROW.u + CART_NEW / 10 + 0.55, CART_ROW.v - 0.62, 1.2, 0.85, 3900),
			totalSpot: scene.spot(TOTAL_ROW.u + TOTAL_NEW / 10 + 2, TOTAL_ROW.v - 0.62, 2.6, 0.9, 3910),
			button: buttonArt(),
		},
		cartStrike: scratch(CART_SLOT, CART_SLOT + 7, 3950),
		totalStrike: scratch(TOTAL_SLOT, TOTAL_SLOT + 22, 3960),
		cart: cartArt(),
		recipe: recipeArt(),
		wires: wires(),
		note: scene.note(proj(sheetAt(20.4, 4.3, 0.3)), 3970),
	};
}
