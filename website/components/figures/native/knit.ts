// One hand-written knitting chart pinned above two swatches, a phone and a laptop, both knitting the same button; three needles wait empty.
import { createDesk, ellipse, line, outline, pathOf, roundRect } from '../how/desk-kit.ts';
import { KNITTED, WAITING } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

type Desk = ReturnType<typeof createDesk>;
type Sheet = ReturnType<Desk['flat']>;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [13, 6.6, 0],
		elevation: 56,
		bounds: [[-0.6, -0.4, 0], [27, -0.4, 0], [27, 14.2, 0], [-0.6, 14.2, 0]],
	});

/** Knitted stitches: rows of small V strokes filling a rectangle on a sheet. */
function stitches(s: Sheet, x0: number, y0: number, x1: number, y1: number, seed: number) {
	let d = '';
	let k = 0;
	for (let y = y0 + 0.25; y < y1 - 0.1; y += 0.42)
		for (let x = x0 + 0.2; x < x1 - 0.2; x += 0.42) d += line(s.on([[x, y], [x + 0.14, y + 0.3], [x + 0.28, y]]), { w: 0.4, seed: seed + k++, over: 0 });
	return d;
}

/** A knitting needle lying on the desk, with its knob at one end. */
function needle(desk: Desk, s: Sheet, x0: number, x1: number, y: number, seed: number) {
	desk.put('ink', line(s.on([[x0, y], [x1, y]], 0.08), { w: 1.6, heavy: 1, seed }));
	const knob = s.on(ellipse(x0 - 0.25, y, 0.3, 0.3, 14), 0.1);
	desk.put('paper', pathOf(knob, true));
	desk.put('ink', outline(knob, { w: 1, seed: seed + 1 }));
}

function swatch(desk: Desk, x: number, y: number, w: number, h: number, name: string, seed: number) {
	const s = desk.flat([x, y], 0, 0.04);
	needle(desk, s, -0.6, w + 0.8, 0, seed);
	const body = s.on(roundRect(0, 0.1, w, h, name === 'iOS' ? 0.6 : 0.25));
	desk.put('shadow', pathOf(s.on(roundRect(0.3, 0.4, w + 0.3, h + 0.3, 0.4), -0.03), true));
	desk.put('paper', pathOf(body, true));
	desk.put('hatch light', stitches(s, 0, 0.1, w, h, seed + 10));
	desk.put('ink', outline(body, { w: 1.2, heavy: 1, seed: seed + 2 }));
	const bx = w / 2 - 1.8;
	const by = h / 2 - 0.4;
	const button = s.on(roundRect(bx, by, bx + 3.6, by + 1.3, 0.3), 0.02);
	desk.put('paper', pathOf(button, true));
	desk.put('ink', outline(button, { w: 1, seed: seed + 3 }));
	desk.say('print title', s.matrix(0, h + 0.9), name);
	return { label: s.matrix(bx + 0.45, by + 0.95, 0.12), spot: desk.spot(button, seed + 4) };
}

export function drawing() {
	const desk = makeDesk();
	desk.deskTone(-1, 27, 13.6, 15.2, 9600);

	const chart = desk.flat([0.6, 0.4], -0.03, 0.02);
	desk.card(chart, 11.6, 6.4, 9500);
	for (let i = 1; i < 11; i++) desk.put('ink faint', line(chart.on([[i * 1.05, 1.4], [i * 1.05, 6.2]]), { w: 0.3, seed: 9510 + i, over: 0 }));
	for (let i = 0; i < 5; i++) desk.put('ink faint', line(chart.on([[0.2, 1.4 + i * 1.2], [11.4, 1.4 + i * 1.2]]), { w: 0.3, seed: 9530 + i, over: 0 }));
	desk.put('ink', outline(chart.on(ellipse(5.8, 0.25, 0.22, 0.22, 12), 0.05), { w: 1, seed: 9540 }));
	desk.say('print title', chart.matrix(0.4, 1.0), 'Counter chart');
	desk.say('pencil-text', chart.matrix(6.6, 1.0), 'written by hand');
	desk.say('hand', chart.matrix(0.5, 2.3), 'state:count = 0');
	desk.say('hand', chart.matrix(0.5, 3.5), 'button tap → symbol');
	desk.say('hand', chart.matrix(0.5, 4.7), 'count = count + 1');
	desk.say('hand', chart.matrix(0.5, 5.9), 'title: Count {count}');

	const phone = swatch(desk, 13.6, 0.8, 5.2, 8.4, KNITTED[0], 9700);
	const laptop = swatch(desk, 13.6 + 6.4, 2.6, 6.2, 4.6, KNITTED[1], 9750);

	const rack = desk.flat([0.6, 9.4], 0, 0.02);
	WAITING.forEach((name, i) => {
		needle(desk, rack, i * 8.4 + 0.6, i * 8.4 + 6.6, 1, 9800 + i * 10);
		desk.say('label', rack.matrix(i * 8.4 + 0.6, 2.2), name);
		desk.say('pencil-text', rack.matrix(i * 8.4 + 0.6, 3.0), 'nothing cast on yet');
	});

	return {
		width: WIDTH,
		height: HEIGHT,
		layers: desk.layers,
		words: desk.words,
		buttons: [
			{ key: 'ios', ...phone },
			{ key: 'macos', ...laptop },
		],
		note: desk.note(desk.at([3, 0.4, 0]), 9900, [150, 32]),
	};
}
