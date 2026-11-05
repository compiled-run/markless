// Two prep tubs that arrived with the page, and an order ticket: only the ordered tub is opened.
import { createDesk, line, outline, pathOf, type Point3 } from '../how/desk-kit.ts';
import { TUBS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 330;

type Desk = ReturnType<typeof createDesk>;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [10, 3, 1.6],
		elevation: 32,
		bounds: [[-0.4, -0.4, 0], [21, -0.4, 0], [21, 8.4, 0], [-0.4, 8.4, 0], [5, 0, 5.2], [19, 0, 5.2]],
	});

const TUB = { w: 6.2, d: 3, h: 2.4 };

function tub(desk: Desk, x: number, label: string, seed: number) {
	const o: Point3 = [x, 0.6, 0];
	let lid = { layers: [] as { key: string; cls: string; d: string }[], words: [] as { key: string; cls: string; matrix: string; text: string }[] };
	const body = desk.object(
		() => {
			const b = desk.box(o, TUB.w, TUB.d, TUB.h, seed);
			const tape = b.front.on([[0.8, 0.7], [TUB.w - 0.8, 0.7], [TUB.w - 0.8, 1.7], [0.8, 1.7]], 0.02);
			desk.put('paper', pathOf(tape, true));
			desk.put('ink', outline(tape, { w: 0.8, seed: seed + 10 }));
			desk.say('code tub-label', b.front.matrix(1.2, 0.95, 0.13, 0.03), label);
			lid = desk.group(() => {
				desk.box([x - 0.2, 0.4, TUB.h], TUB.w + 0.4, TUB.d + 0.4, 0.45, seed + 20);
				desk.put('pencil', line(desk.atAll([[x + 0.6, 0.6 + TUB.d + 0.2, TUB.h + 0.22], [x + TUB.w - 0.6, 0.6 + TUB.d + 0.2, TUB.h + 0.22]]), { w: 0.7, seed: seed + 30, over: 0 }));
			});
		},
		desk.at([x + 0.4, 0.6, TUB.h + 1.6]),
		desk.at([x + TUB.w / 2, 0.6 + TUB.d, TUB.h / 2]),
	);
	const lift = desk.at([x, 0.6, TUB.h + 2])[1] - desk.at([x, 0.6, TUB.h])[1];
	return { body, lid, lift: `--lift:${Math.round(lift)}px` };
}

export function drawing() {
	const desk = makeDesk();
	desk.deskTone(-1, 21, 7, 9, 6500);
	const add = tub(desk, 1, TUBS.add, 6100);
	const gift = tub(desk, 12.4, TUBS.gift, 6200);
	const card = desk.flat([7.8, 5.2], -0.08, 0.02);
	const ticket = desk.object(
		() => {
			desk.card(card, 4.2, 2.4, 6300, { cast: [0.3, 0.3, 0] });
			desk.say('print title', card.matrix(0.4, 0.9, 0.12), 'ORDER');
			desk.say('code tub-label', card.matrix(0.4, 1.9, 0.12), TUBS.add);
		},
		card.on([[0.2, -0.5]])[0]!,
		card.on([[2.1, 1.2]])[0]!,
	);
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		objects: { ticket, add: add.body, gift: gift.body },
		lids: { add: add.lid, gift: gift.lid },
		lift: add.lift,
		targets: { add: add.body.anchor, gift: gift.body.anchor },
		note: desk.note(desk.at([4, 0.6, 3.4]), 6600, [150, 30]),
	};
}
