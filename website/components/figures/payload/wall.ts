// A gallery wall: the finished cart page hangs framed with two plain cards beside it, and a print with nothing to react to hangs with none.
import { createDesk, ellipse, hatch, line, outline, pathOf, roundRect } from '../how/desk-kit.ts';
import { STATE_CARD, VIEW_CARD } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 360;

type Desk = ReturnType<typeof createDesk>;
type Face = ReturnType<Desk['upright']>;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [14, 2, 4.2],
		elevation: 16,
		distance: 70,
		bounds: [[-0.4, 0, 0], [29, 0, 0], [-0.4, 0, 9.6], [29, 0, 9.6], [-0.4, 3, 0], [29, 3, 0]],
	});

/** A frame on the wall: a moulding hatched on its shadow side, and the picture area inside it. */
function frame(desk: Desk, wall: Face, x: number, z: number, w: number, h: number, seed: number) {
	const outer = wall.on([[x, z], [x + w, z], [x + w, z + h], [x, z + h]], 0.15);
	const inner = wall.on([[x + 0.5, z + 0.5], [x + w - 0.5, z + 0.5], [x + w - 0.5, z + h - 0.5], [x + 0.5, z + h - 0.5]], 0.16);
	desk.put('shadow', pathOf(wall.on([[x + 0.3, z - 0.3], [x + w + 0.3, z - 0.3], [x + w + 0.3, z + h - 0.3], [x + 0.3, z + h - 0.3]], 0.01), true));
	desk.put('kraft-fill', pathOf(outer, true));
	desk.put('hatch', hatch(wall.on([[x + w - 0.5, z], [x + w, z], [x + w, z + h], [x + w - 0.5, z + h]], 0.16), 1.2, 1.1, seed, { cluster: 3 }) + hatch(wall.on([[x, z], [x + w, z], [x + w, z + 0.5], [x, z + 0.5]], 0.16), 0.2, 1.3, seed + 1, { cluster: 3 }));
	desk.put('paper', pathOf(inner, true));
	desk.put('ink', outline(outer, { w: 1.4, heavy: 1.2, seed: seed + 2 }) + outline(inner, { w: 0.9, seed: seed + 3 }));
}

/** A small card pinned to the wall with its lines of text. */
function pinned(desk: Desk, wall: Face, x: number, z: number, w: number, h: number, lines: readonly string[], seed: number) {
	const poly = wall.on([[x, z], [x + w, z], [x + w, z + h], [x, z + h]], 0.05);
	desk.put('shadow', pathOf(wall.on([[x + 0.2, z - 0.2], [x + w + 0.2, z - 0.2], [x + w + 0.2, z + h - 0.2], [x + 0.2, z + h - 0.2]], 0.01), true));
	desk.put('paper', pathOf(poly, true));
	desk.put('ink', outline(poly, { w: 1, heavy: 0.8, seed }) + outline(wall.on(ellipse(x + w / 2, z + h - 0.25, 0.12, 0.12, 10), 0.08), { w: 0.9, seed: seed + 1 }));
	lines.forEach((text, i) => desk.say(i === 0 ? 'print title' : 'code', wall.matrix(x + 0.3, z + h - 0.75 - i * 0.75, i === 0 ? 0.1 : 0.09, 0.08), text));
	return poly;
}

export function drawing() {
	const desk = makeDesk();
	const wall = desk.upright([0, 0, 0]);
	desk.card(wall, 29, 9.6, 8000, { paper: 'paper' });
	desk.put('desk-hatch', hatch(desk.atAll([[-0.4, 0, 0], [29, 0, 0], [29, 3, 0], [-0.4, 3, 0]]), -0.5, 2.6, 8001, { cluster: 5, skip: 0.35, trim: 0.5 }));
	desk.put('ink', line(desk.atAll([[-0.4, 0, 0], [29, 0, 0]]), { w: 1.2, seed: 8002 }));

	frame(desk, wall, 1, 2.2, 12, 7, 8010);
	const page = { x: 1.5, z: 2.7 };
	desk.put('hatch light', hatch(wall.on([[page.x, page.z + 5.3], [page.x + 11, page.z + 5.3], [page.x + 11, page.z + 6], [page.x, page.z + 6]], 0.17), 0.1, 1.6, 8020, { cluster: 4 }));
	desk.say('print title', wall.matrix(page.x + 0.6, page.z + 4.4, 0.13, 0.17), 'Beanshop');
	desk.say('print', wall.matrix(page.x + 0.6, page.z + 3.3, 0.11, 0.17), 'House blend · 250 g   $14');
	desk.say('print', wall.matrix(page.x + 0.6, page.z + 2.1, 0.12, 0.17), 'In your cart: 0 bags');
	const button = wall.on(roundRect(page.x + 0.6, page.z + 0.5, page.x + 4.6, page.z + 1.4, 0.2), 0.18);
	desk.put('paper', pathOf(button, true));
	desk.put('ink', outline(button, { w: 1, seed: 8021 }));
	desk.say('label', wall.matrix(page.x + 1.0, page.z + 0.8, 0.12, 0.19), 'Add to cart');

	const stateCard = pinned(desk, wall, 13.8, 5.4, 4.6, 2.4, STATE_CARD, 8030);
	const viewCard = pinned(desk, wall, 13.8, 2.0, 5.6, 3.0, VIEW_CARD, 8040);

	frame(desk, wall, 21.4, 3.2, 6.4, 4.2, 8050);
	desk.say('print', wall.matrix(22.2, 5.0, 0.085, 0.17), 'In your cart: 0 bags');
	desk.say('pencil-text', wall.matrix(21.6, 2.5, 0.09, 0.05), 'nothing to react to, so no cards');

	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		spots: [desk.spot(stateCard, 8060), desk.spot(viewCard, 8062), desk.spot(button, 8064)],
		note: desk.note(desk.at([15.6, 0, 8.0]), 8070, [180, 32]),
	};
}
