// One paper sewing pattern on a cutting table, cut from three fabrics: every piece has the same outline.
import { createDesk, ellipse, hatch, line, outline, type P, pathOf, roundRect } from '../how/desk-kit.ts';
import { FABRICS } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

type Desk = ReturnType<typeof createDesk>;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [13, 6.6, 0],
		elevation: 54,
		bounds: [[-0.6, -0.4, 0], [27, -0.4, 0], [27, 14, 0], [-0.6, 14, 0]],
	});

/** The pattern piece: a shop card with a notch, the shape every fabric is cut to. */
const PIECE = (x: number, y: number): P[] => roundRect(x, y, x + 6, y + 4, 0.6, 6);

function texture(desk: Desk, poly: P[], kind: number, seed: number) {
	if (kind === 0) return hatch(poly, 0.8, 1.4, seed, { cluster: 3, skip: 0.05 }) + hatch(poly, -0.8, 1.4, seed + 1, { cluster: 3, skip: 0.05 });
	if (kind === 1) {
		let d = '';
		const xs = poly.map((p) => p[0]);
		const ys = poly.map((p) => p[1]);
		for (let x = Math.min(...xs) + 3; x < Math.max(...xs); x += 7) for (let y = Math.min(...ys) + 3; y < Math.max(...ys); y += 6) d += outline(ellipse(x + ((y * 7) % 3), y, 0.9, 0.7, 8), { w: 0.5, seed: seed + Math.round(x * 3 + y) });
		return d;
	}
	return hatch(poly, 0.02, 2.2, seed, { cluster: 6, skip: 0.02, trim: 0.05 });
}

export function drawing() {
	const desk = makeDesk();
	desk.deskTone(-1, 27, 13.4, 15, 9800);
	const table = desk.flat([0, 0], 0, 0);
	desk.card(table, 26.4, 13.6, 9801, { paper: 'kraft-fill' });
	for (let i = 1; i < 13; i++) desk.put('ink faint', line(table.on([[0.3, i], [26.1, i]]), { w: 0.3, seed: 9810 + i, over: 0 }));

	const paper = desk.flat([10, 0.6], -0.04, 0.03);
	const piece = paper.on(PIECE(0, 0));
	desk.put('shadow', pathOf(paper.on(PIECE(0.25, 0.3), -0.02), true));
	desk.put('paper', pathOf(piece, true));
	desk.put('ink', outline(piece, { w: 1.3, heavy: 1, seed: 9820 }));
	desk.say('print title', paper.matrix(0.6, 1.2), 'Cart: the compiled plan');
	desk.say('hand', paper.matrix(0.6, 2.2), 'state:bags · symbol:0 · symbol:1');
	desk.say('pencil-text', paper.matrix(0.6, 3.2), 'cut 3, one pattern');
	const glow = desk.spot(piece, 9821);

	const cuts = FABRICS.map((name, i) => {
		const cloth = desk.flat([0.8 + i * 8.6, 6.4], (i - 1) * 0.04, 0.02);
		const sheet = cloth.on([[0, 0], [7.8, 0], [7.8, 6.2], [0, 6.2]]);
		desk.put('paper', pathOf(sheet, true));
		desk.put('hatch light', texture(desk, sheet, i, 9830 + i * 10));
		desk.put('ink', outline(sheet, { w: 1, heavy: 0.8, seed: 9831 + i * 10 }));
		const hole = cloth.on(PIECE(0.9, 1.0));
		desk.put('pencil', desk.pencilLine([...hole, hole[0]!], 9832 + i * 10));
		desk.say('print title', cloth.matrix(0.4, 6.9), name);
		const part = desk.group(() => {
			const cut = cloth.on(PIECE(0.9, 1.0), 0.06);
			desk.put('shadow', pathOf(cloth.on(PIECE(1.1, 1.3), 0.0), true));
			desk.put('paper', pathOf(cut, true));
			desk.put('hatch', texture(desk, cut, i, 9840 + i * 10));
			desk.put('ink', outline(cut, { w: 1.2, heavy: 1, seed: 9841 + i * 10 }));
		});
		return { key: name, ...part };
	});
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		glow,
		cuts,
		note: desk.note(desk.at([10.4, 0.6, 0]), 9900, [190, 32]),
	};
}
