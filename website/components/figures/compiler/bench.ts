// A film editor's bench: cart.tsrx lies as one strip, and the cut hangs each piece on its own peg with an edit list beside them.
import { createDesk, ellipse, line, outline, pathOf, roundRect } from '../how/desk-kit.ts';
import { EDIT_LIST, FRAMES } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

type Desk = ReturnType<typeof createDesk>;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [14, 4.6, 2],
		elevation: 36,
		bounds: [[-0.6, 0, 0], [30, 0, 0], [30, 11.4, 0], [-0.6, 11.4, 0], [0, 0, 7], [30, 0, 7]],
	});

const FRAME = { w: 6.8, h: 3 };

/** One frame of film: the paper, its sprocket holes along both edges, and the line of code it carries. */
function frame(desk: Desk, s: ReturnType<Desk['flat']>, x: number, code: string, seed: number, up = false) {
	const poly = s.on([[x, 0], [x + FRAME.w, 0], [x + FRAME.w, FRAME.h], [x, FRAME.h]]);
	desk.put('paper', pathOf(poly, true));
	desk.put('ink', outline(poly, { w: 1, heavy: 0.8, seed }));
	const holes = [0.3, FRAME.h - 0.55].flatMap((v) => [0.5, 1.6, 2.7, 3.8, 4.9, 6.0].map((u) => s.on(roundRect(x + u - 0.15, v, x + u + 0.15, v + 0.25, 0.05))));
	desk.put('ink faint', holes.map((h, i) => outline(h, { w: 0.5, seed: seed + 1 + i })).join(''));
	desk.say('code', s.matrix(x + 0.35, up ? 1.75 : 1.8, 0.1), code);
}

function strip(desk: Desk) {
	const s = desk.flat([0.6, 7.2], 0.02, 0.02);
	return desk.group(() => {
		FRAMES.forEach((f, i) => frame(desk, s, i * FRAME.w, f.code, 7000 + i * 20));
		desk.say('print title', s.matrix(0, -0.35), 'cart.tsrx');
	});
}

function board(desk: Desk) {
	const face = desk.upright([0.4, 0.2, 0]);
	desk.card(face, 22, 6.6, 7100, { paper: 'kraft-fill' });
	const pegs = FRAMES.map((_, i) => 0.6 + i * 7.2);
	for (const [i, u] of pegs.entries()) {
		const peg = face.on(ellipse(u + FRAME.w / 2, 5.9, 0.22, 0.22, 14), 0.05);
		desk.put('paper', pathOf(peg, true));
		desk.put('ink', outline(peg, { w: 0.9, seed: 7110 + i }));
	}
	return desk.group(() => {
		FRAMES.forEach((f, i) => {
			const card = desk.upright([pegs[i]! + 0.4, 0.3, 2.0]);
			const poly = card.on([[0, 0], [FRAME.w, 0], [FRAME.w, FRAME.h + 0.9], [0, FRAME.h + 0.9]]);
			desk.put('paper', pathOf(poly, true));
			desk.put('ink', outline(poly, { w: 1.1, heavy: 0.9, seed: 7120 + i * 10 }));
			desk.put('wash yellow', desk.spot(card.on(ellipse(1.9, 2.95, 1.7, 0.42, 24)), 7122 + i * 10).wash);
			desk.say('print title', card.matrix(0.35, 2.7), f.id);
			desk.say('code', card.matrix(0.35, 1.75, 0.1), f.code);
			desk.say('hand', card.matrix(0.35, 0.75), f.what);
		});
	});
}

function editList(desk: Desk) {
	const clip = desk.flat([23.4, 2.4], -0.06, 0.02);
	desk.card(clip, 6, 7.6, 7200, { cast: [0, 0, 0] });
	desk.put('ink', outline(clip.on(roundRect(2.2, -0.3, 3.8, 0.5, 0.15), 0.06), { w: 1.2, seed: 7201 }));
	desk.say('print title', clip.matrix(0.5, 1.4), 'Edit list');
	EDIT_LIST.forEach((entry, i) => desk.say('hand', clip.matrix(0.5, 2.8 + i * 1.3, 0.085), entry));
	[2.1, 3.4].forEach((v, i) => desk.put('ink faint', line(clip.on([[0.4, v + 0.9], [5.6, v + 0.9]]), { w: 0.45, seed: 7210 + i, over: 0 })));
	return desk.group(() => desk.say('pencil-text', clip.matrix(0.5, 6.2, 0.085), 'written before anything ran'));
}

export function drawing() {
	const desk = makeDesk();
	desk.deskTone(-1, 30, 10.6, 12, 7300);
	const pegged = board(desk);
	const whole = strip(desk);
	const list = editList(desk);
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		whole,
		pegged,
		list,
		note: desk.note(desk.at([4, 0.2, 6.8]), 7400),
	};
}
