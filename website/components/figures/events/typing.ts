// The shop page with its name field under a typewriter's platen, and the typewriter's keys on the desk: a key strike is the event, and the platen types it onto the page.
import { createScene, ellipse, type P, roundRect } from '../ink/scene.ts';
import { deskPlane, pencil } from '../ink/plane.ts';
import { hatch, hull, line, outline, pathOf, pool, r1, wash } from '../ink/ink.ts';
import { PREVIEW_NEW } from './typing-model.ts';

export const WIDTH = 680;
export const HEIGHT = 440;

export const LABEL_ROW = { u: 1.4, v: 8.85 };
export const PREVIEW_ROW = { u: 1.4, v: 14.1 };
const FIELD = { u0: 1.4, v0: 10.6, u1: 12.4, v1: 12.3 };
const KEYS = { c: [27.2, 1.2] as P, w: 10.6, h: 5.2, turn: 0.04 };
export const ROWS = ['QWERTYU', 'ASDFGHJ', 'ZXCVBNM'] as const;

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [
		[KEYS.c[0] + KEYS.w / 2 + 1, KEYS.c[1] - KEYS.h / 2 - 2.4, 0],
		[KEYS.c[0] + KEYS.w / 2 + 1, KEYS.c[1] + KEYS.h / 2 + 1, 0],
	],
	target: [13.6, -2, 0.4],
});
const { proj, onSheet, sheetMatrix } = scene;
const deck = deskPlane(proj, KEYS.c, KEYS.w, KEYS.h, KEYS.turn, 0.6);

/** The name field on the page, with the typewriter's platen lying across its top edge. */
function fieldArt() {
	const { u0, v0, u1, v1 } = FIELD;
	const box = onSheet(roundRect(u0, v0, u1, v1, 0.2));
	const roller = onSheet(roundRect(u0 - 0.8, v0 - 0.95, u1 + 0.8, v0 - 0.05, 0.45), 0.5);
	const rollerShade = onSheet([[u0 - 0.6, v0 - 0.45], [u1 + 0.6, v0 - 0.45], [u1 + 0.6, v0 - 0.1], [u0 - 0.6, v0 - 0.1]], 0.5);
	const knob = (u: number, seed: number) => {
		const k = onSheet(ellipse(u, v0 - 0.5, 0.55, 0.62, 18), 0.6);
		return { paper: pathOf(k, true), ink: outline(k, { w: 1.1, heavy: 0.9, seed }), shade: hatch(k, 0.9, 1.1, seed + 1, { cluster: 2 }) };
	};
	return {
		paper: pathOf(box, true),
		ink: outline(box, { w: 1.1, heavy: 0.9, seed: 4010 }),
		matrix: sheetMatrix(u0 + 0.5, v1 - 0.45),
		roller: {
			cast: wash(onSheet(roundRect(u0 - 0.6, v0 - 0.2, u1 + 1, v0 + 0.4, 0.3)), 4020, 0.8, 2),
			paper: pathOf(roller, true),
			shade: hatch(rollerShade, 0.08, 1.2, 4021, { cluster: 5, skip: 0.15 }),
			ink: outline(roller, { w: 1.4, heavy: 1.2, seed: 4022 }) + line(onSheet([[u0 - 0.4, v0 - 0.55], [u1 + 0.4, v0 - 0.55]], 0.5), { w: 0.5, seed: 4023, over: 0 }),
			knobs: [knob(u0 - 1.2, 4030), knob(u1 + 1.2, 4040)],
			labelMatrix: sheetMatrix((u0 + u1) / 2 - 1.4, v0 - 0.22),
		},
	};
}

/** One round typewriter key standing on the deck: its rim, its face, a side shadow and the matrix for its letter. */
function keyArt(row: number, col: number, seed: number) {
	const u = 0.9 + col * 1.42 + row * 0.45;
	const v = 0.9 + row * 1.55;
	const face = deck.on(ellipse(u, v, 0.58, 0.52, 22), 0.5);
	const side = deck.on(ellipse(u + 0.05, v + 0.08, 0.58, 0.52, 22));
	const stem = hull([...face, ...side]);
	const top = deck.at(u, v, 0.5);
	const bottom = deck.at(u + 0.05, v + 0.08, 0);
	return {
		stem: pathOf(stem, true),
		paper: pathOf(face, true),
		ink: outline(face, { w: 1, heavy: 0.8, seed }) + outline(side, { w: 0.6, seed: seed + 1 }),
		shade: hatch(stem, 1, 1.2, seed + 2, { cluster: 2, skip: 0.3 }),
		wash: wash(face, seed + 3, 0.6, 1.4),
		matrix: deck.matrix(u - 0.18, v + 0.2, 0.1, 0.5),
		sink: `--sink-x:${r1(proj(bottom)[0] - proj(top)[0]) * 0.4}px;--sink-y:${r1((proj(bottom)[1] - proj(top)[1]) * 0.6)}px`,
	};
}

/** The deck under the keys: a dark metal plate with a hatched front edge. */
function deckArt() {
	const { w, h } = KEYS;
	const plate = deck.on([[0, 0], [w, 0], [w, h], [0, h]], 0);
	const front = deskPlane(proj, KEYS.c, KEYS.w, KEYS.h, KEYS.turn, 0).on([[0, h], [w, h]]);
	const edge = [...deck.on([[w, h], [0, h]], 0), ...front.reverse()];
	const shadow = hull([...plate.map(([x, y]) => [x + 7, y + 8] as P), ...plate]);
	return {
		shadow: { wash: wash(shadow, 4110, 1.2, 3), hatch: hatch(shadow, -0.5, 2.6, 4111, { cluster: 5, skip: 0.25 }) },
		paper: pathOf(plate, true),
		tone: hatch(plate, 0.15, 2.2, 4112, { cluster: 5, skip: 0.35, trim: 0.5 }),
		edge: pathOf(edge, true),
		edgeHatch: hatch(edge, 1.2, 1.1, 4113, { cluster: 3 }),
		ink: outline(plate, { w: 1.5, heavy: 1.3, seed: 4114 }) + outline(edge, { w: 1, seed: 4115 }),
		pencil: pencil(deck.on([[-0.8, 0], [w + 1, 0]], 0), 4116),
	};
}

/** The slip a struck key throws up: the event, typed on a scrap of paper above the keys. */
function slipArt() {
	const at = deskPlane(proj, [KEYS.c[0] - 1.6, KEYS.c[1] - KEYS.h / 2 - 1.6], 5.6, 1.6, KEYS.turn, 1.2);
	const poly = at.on(roundRect(0, 0, 5.6, 1.6, 0.15));
	return {
		paper: pathOf(poly, true),
		ink: outline(poly, { w: 0.9, seed: 4210 }),
		wash: wash(poly, 4211, 0.5, 1.2),
		pool: wash(pool(poly, poly[0]!, 0.5), 4212, 0.4, 1),
		matrix: at.matrix(0.35, 1.05, 0.1),
	};
}

/** The whole scene, frozen into typing.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: scene.sheetArt(),
		page: {
			...scene.shopArt(),
			labelMatrix: sheetMatrix(LABEL_ROW.u, LABEL_ROW.v),
			previewMatrix: sheetMatrix(PREVIEW_ROW.u, PREVIEW_ROW.v),
			spot: scene.spot(PREVIEW_ROW.u + PREVIEW_NEW / 10 + 1.4, PREVIEW_ROW.v - 0.62, 2.2, 0.9, 4900),
			field: fieldArt(),
		},
		deck: deckArt(),
		keys: ROWS.flatMap((row, r) => [...row].map((letter, c) => ({ letter, ...keyArt(r, c, 4300 + r * 40 + c * 5) }))),
		slip: slipArt(),
		note: scene.note(deck.on([[0.5, 0.3]], 0.5)[0]!, 4970),
	};
}
