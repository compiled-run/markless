// A restaurant pass at opening: a prep tub for every dish has arrived and stands sealed; an order ticket opens only its own tub.
import { createDesk, ellipse, hatch, line, outline, pathOf, type Point3 } from '../how/desk-kit.ts';
import { TUBS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 360;

type Desk = ReturnType<typeof createDesk>;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [12, 3.6, 1.4],
		elevation: 34,
		bounds: [[-0.6, -0.4, 0], [25.4, -0.4, 0], [25.4, 9.6, 0], [-0.6, 9.6, 0], [0, 0, 6.2], [25, 0, 6.2]],
	});

const SHELF = { x: 0, y: 0, w: 25, d: 3.2, h: 1.6 };
const TUB = { w: 5.4, d: 2.4, h: 1.6 };

function tubAt(i: number): Point3 {
	return [1.4 + i * 8, 0.4, SHELF.h];
}

function tub(desk: Desk, i: number, label: string) {
	const o = tubAt(i);
	const body = desk.box(o, TUB.w, TUB.d, TUB.h, 6100 + i * 40);
	const tape = body.front.on([[0.5, 0.45], [TUB.w - 0.5, 0.45], [TUB.w - 0.5, 1.15], [0.5, 1.15]], 0.02);
	desk.put('paper', pathOf(tape, true));
	desk.put('ink', outline(tape, { w: 0.7, seed: 6110 + i * 40 }));
	desk.say('hand', body.front.matrix(0.75, 0.62, 0.1, 0.03), label);
	desk.say('pencil-text', body.front.matrix(0.6, 1.42, 0.08, 0.03), 'arrived with the page');
	return body;
}

function lid(desk: Desk, i: number) {
	const [x, y, z] = tubAt(i);
	return desk.group(() => {
		desk.box([x - 0.15, y - 0.15, z + TUB.h], TUB.w + 0.3, TUB.d + 0.3, 0.35, 6200 + i * 40);
		desk.put('pencil', line(desk.atAll([[x + 0.6, y + TUB.d + 0.15, z + TUB.h + 0.18], [x + TUB.w - 0.6, y + TUB.d + 0.15, z + TUB.h + 0.18]]), { w: 0.6, seed: 6210 + i * 40, over: 0 }));
	});
}

/** The steel pass: a long shelf under the tubs, its front lightly hatched. */
function shelf(desk: Desk) {
	desk.box([SHELF.x, SHELF.y, 0], SHELF.w, SHELF.d, SHELF.h, 6000);
}

/** The ticket rail at the front of the pass, and the order ticket that clips into it. */
function ticket(desk: Desk) {
	const rail = desk.atAll([[0.2, SHELF.d + 0.05, SHELF.h - 0.15], [SHELF.w - 0.2, SHELF.d + 0.05, SHELF.h - 0.15]]);
	desk.put('ink', line(rail, { w: 1.6, heavy: 1, seed: 6300 }));
	return desk.group(() => {
		const card = desk.upright([2.2, SHELF.d + 0.08, SHELF.h - 2.6]);
		desk.card(card, 3.2, 2.5, 6310);
		desk.say('print title', card.matrix(0.3, 2.0), 'ORDER');
		desk.say('hand', card.matrix(0.3, 1.2), TUBS[0]);
		desk.put('ink', line(card.on([[0.3, 0.7], [2.8, 0.7]]), { w: 0.45, seed: 6311, over: 0 }));
	});
}

/** The plate on the counter in front, and the dish served on it. */
function plate(desk: Desk) {
	const flat = desk.flat([3.2, 5.6], 0, 0.02);
	const rim = flat.on(ellipse(1.6, 1.3, 1.6, 1.3, 40));
	const well = flat.on(ellipse(1.6, 1.3, 1.05, 0.85, 36));
	desk.put('shadow', pathOf(flat.on(ellipse(1.9, 1.6, 1.7, 1.35, 36), -0.02), true));
	desk.put('paper', pathOf(rim, true));
	desk.put('ink', outline(rim, { w: 1.1, heavy: 0.9, seed: 6400 }) + outline(well, { w: 0.6, seed: 6401 }));
	const dish = flat.on(ellipse(1.6, 1.25, 0.8, 0.6, 30), 0.1);
	return { dish: desk.spot(dish, 6410), dishInk: outline(dish, { w: 0.9, seed: 6412 }) + hatch(dish, 0.7, 1.4, 6413, { cluster: 3 }), label: flat.matrix(0.6, 2.95) };
}

export function drawing() {
	const desk = makeDesk();
	desk.deskTone(-1, 26, 8.4, 10.2, 6500);
	shelf(desk);
	TUBS.forEach((label, i) => tub(desk, i, label));
	const lids = TUBS.map((_, i) => lid(desk, i));
	const rail = ticket(desk);
	const served = plate(desk);
	const lift = desk.at([3.1, 1.2, SHELF.h + TUB.h + 1.6])[1] - desk.at([3.1, 1.2, SHELF.h + TUB.h])[1];
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		opened: lids[0]!,
		sealedLids: [...lids[1]!.layers, ...lids[2]!.layers],
		ticket: rail,
		served,
		lift: `--lift:${Math.round(lift)}px`,
		note: desk.note(desk.at([9.4, 0.2, SHELF.h + TUB.h + 0.4]), 6600),
	};
}
