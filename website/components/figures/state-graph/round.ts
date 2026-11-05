// A newsagent's round book on the desk beside a street of three houses: each paper is delivered only to the houses on its round.
import { createDesk, ellipse, hatch, line, outline, type P, pathOf, type Point3, roundRect } from '../how/desk-kit.ts';
import { HOUSES } from './model.ts';

type Desk = ReturnType<typeof createDesk>;

export const WIDTH = 680;
export const HEIGHT = 340;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [15, 4.4, 1.6],
		elevation: 38,
		bounds: [[-0.6, 0, 0], [30.4, 0, 0], [30.4, 10.2, 0], [-0.6, 10.2, 0], [14, 1.2, 6.4], [30.4, 1.2, 6.4]],
	});

/** The open round book: two pages, a spine, and the ruled lines the rounds are written on. */
function book(desk: Desk) {
	const left = desk.flat([0, 0.6], -0.04, 0.12);
	const right = desk.flat([6.9, 0.32], 0.04, 0.12);
	desk.box([-0.2, 0.4, 0], 14.2, 8.6, 0.12, 5000, 'kraft-fill');
	desk.card(left, 6.8, 8.2, 5010, { r: 0.1 });
	desk.card(right, 6.8, 8.2, 5020, { r: 0.1 });
	desk.put('hatch light', hatch(left.on([[6.2, 0], [6.8, 0], [6.8, 8.2], [6.2, 8.2]]), 1.4, 1.3, 5030, { cluster: 3 }));
	for (const [page, seed] of [[left, 5040], [right, 5060]] as const) for (const [i, v] of [2.2, 3.4, 4.6, 5.8, 7.0].entries()) desk.put('ink faint', line(page.on([[0.5, v], [6.2, v]]), { w: 0.45, seed: seed + i, over: 0 }));
	desk.say('print title', left.matrix(0.5, 1.3), 'state:bags');
	desk.say('hand', left.matrix(0.6, 2.0), 'In your cart  (h1)');
	desk.say('hand', left.matrix(0.6, 3.2), 'computed:total');
	desk.say('pencil-text', left.matrix(0.6, 4.4), 'House blend: no round');
	desk.say('print title', right.matrix(0.5, 1.3), 'computed:total');
	desk.say('hand', right.matrix(0.6, 2.0), 'Total  (h2)');
	desk.say('pencil-text', right.matrix(0.6, 4.4), 'reads state:bags');
	return { bookMatrix: left.matrix(0.5, 7.6) };
}

/** Three houses standing in a row, each with its door sign, and the doorstep where a paper lands. */
function street(desk: Desk) {
	const k = 1.3;
	return HOUSES.map((house, i) => {
		const x = 14.8 + i * 5.1;
		const front = desk.upright([x, 1.2, 0]);
		const sc = (pts: P[]): P[] => pts.map(([u, v]) => [u * k, v * k]);
		const wall = front.on(sc([[0, 0], [3.4, 0], [3.4, 3], [0, 3]]));
		const roof = front.on(sc([[-0.35, 3], [1.7, 4.6], [3.75, 3]]));
		const door = front.on(sc(roundRect(1.25, 0, 2.15, 1.6, 0.08)));
		const sign = front.on(sc([[0.2, 1.9], [3.2, 1.9], [3.2, 2.75], [0.2, 2.75]]));
		const shadow: P[] = [...front.on(sc([[0, 0], [3.4, 0]])), desk.at([x + 3.4 * k + 2.4, 1.2 + 2, 0]), desk.at([x + 2.4, 1.2 + 2, 0])];
		desk.put('shadow', pathOf(shadow, true));
		desk.put('paper', pathOf(wall, true) + pathOf(roof, true));
		desk.put('hatch light', hatch(roof, 0.5, 1.6, 5100 + i * 10, { cluster: 3, skip: 0.2 }));
		desk.put('paper', pathOf(door, true) + pathOf(sign, true));
		desk.put('ink', outline(wall, { w: 1.3, heavy: 1.1, seed: 5102 + i * 10 }) + outline(roof, { w: 1.2, seed: 5103 + i * 10 }) + outline(door, { w: 0.9, seed: 5104 + i * 10 }) + outline(sign, { w: 0.8, seed: 5105 + i * 10 }) + outline(front.on(sc(ellipse(1.95, 0.8, 0.05, 0.05, 8))), { w: 0.8, seed: 5106 + i * 10 }));
		const step = desk.flat([x + 1.1 * k, 1.2], 0, 0.02);
		const paperPoly = step.on(sc([[0.15, 0.25], [1.75, 0.15], [1.85, 0.9], [0.25, 1.0]]), 0.05);
		return {
			key: house.key,
			label: front.matrix(0.34 * k, 2.12 * k, 0.1),
			paper: {
				fill: pathOf(paperPoly, true),
				ink: outline(paperPoly, { w: 0.9, seed: 5107 + i * 10 }) + [0.45, 0.65].map((v, n) => line(step.on(sc([[0.45, v], [1.55, v - 0.05]]), 0.06), { w: 0.45, seed: 5108 + i * 10 + n, over: 0 })).join(''),
				spot: desk.spot(front.on(sc(ellipse(1.7, 2.33, 1.6, 0.55, 26))), 5110 + i * 10),
			},
		};
	});
}

/** The bundle of today's papers on the desk, its edition number lettered on top. */
function bundle(desk: Desk) {
	const b = desk.box([20.6, 6.4, 0], 3.6, 2.4, 1.1, 5200, 'paper');
	desk.put('ink', line([b.point(1.8, 0, 1.1), b.point(1.8, 2.4, 1.1)], { w: 0.8, seed: 5210, over: 0 }) + line([b.point(0, 1.2, 1.1), b.point(3.6, 1.2, 1.1)], { w: 0.8, seed: 5211, over: 0 }));
	return { edition: b.top.matrix(0.3, 0.85, 0.1) };
}

export function drawing() {
	const desk = makeDesk();
	desk.deskTone(-1, 26, 9.4, 11.4, 5300);
	const rounds = book(desk);
	const houses = street(desk);
	const pile = bundle(desk);
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		rounds,
		houses,
		pile,
		note: desk.note(desk.at([1.4, 0.4, 0.2] as Point3), 5400),
	};
}
