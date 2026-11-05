// A surveyor's field book: one sketch per .tsrx file on the left, and the fold-out map that joins them on the right, inked and stamped at build time.
import { createDesk, ellipse, hatch, line, outline, type P } from '../how/desk-kit.ts';
import { FILES } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

type Desk = ReturnType<typeof createDesk>;
type Sheet = ReturnType<Desk['flat']>;

const makeDesk = () =>
	createDesk({
		width: WIDTH,
		height: HEIGHT,
		target: [13.5, 5, 0],
		elevation: 52,
		bounds: [[-0.6, -0.6, 0], [28, -0.6, 0], [28, 11.2, 0], [-0.6, 11.2, 0]],
	});

const box = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** One little plot per file, each with the spots that can change marked by a dot. */
function plots(desk: Desk, page: Sheet) {
	FILES.forEach((file, i) => {
		const y = 0.9 + i * 3;
		desk.say('hand', page.matrix(0.7, y + 0.4), file);
		desk.put('ink', outline(page.on(box(0.7, y + 0.8, 4.6, 1.7)), { w: 0.8, seed: 9010 + i }));
		desk.put('ink faint', line(page.on([[1.0, y + 1.4], [3.8, y + 1.4]]), { w: 0.5, seed: 9020 + i, over: 0 }) + line(page.on([[1.0, y + 1.9], [3.2, y + 1.9]]), { w: 0.5, seed: 9025 + i, over: 0 }));
		if (file === 'cart.tsrx') for (const [k, u] of [4.3, 3.6].entries()) desk.put('wash yellow', desk.spot(page.on(ellipse(u, y + 1.4 + k * 0.5, 0.3, 0.25, 16)), 9030 + k).wash);
	});
}

/** The map that joins the files: drawn twice, once in pencil and once inked, so the figure can ink it on cue. */
function map(desk: Desk, page: Sheet, pen: 'pencil' | 'ink', seed: number) {
	const shapes = [box(0.6, 1.0, 6.4, 7.8), box(1.1, 2.4, 5.4, 1.6), box(1.1, 4.7, 5.4, 3.4)];
	return desk.group(() => {
		for (const [i, shape] of shapes.entries()) desk.put(pen, pen === 'pencil' ? desk.pencilLine([...page.on(shape), page.on(shape)[0]!], seed + i) : outline(page.on(shape), { w: 1, heavy: 0.8, seed: seed + i }));
		if (pen === 'ink') {
			desk.say('label', page.matrix(0.9, 1.7), 'page.tsrx  /');
			desk.say('label', page.matrix(1.4, 3.1), 'header.tsrx');
			desk.say('label', page.matrix(1.4, 5.4), 'cart.tsrx');
			for (const [k, [u, v]] of [[5.6, 6.6], [4.4, 7.4]].entries()) {
				const s = desk.spot(page.on(ellipse(u!, v!, 0.4, 0.3, 18)), seed + 10 + k);
				desk.put('wash yellow', s.wash);
				desk.put('wash yellow pool', s.pool);
			}
		}
	});
}

function stamp(desk: Desk, page: Sheet) {
	return desk.group(() => {
		const ring = page.on(ellipse(9.6, 4.6, 1.9, 1.1, 36), 0.03);
		const inner = page.on(ellipse(9.6, 4.6, 1.6, 0.86, 32), 0.03);
		desk.put('pink-ink', outline(ring, { w: 1.1, seed: 9100 }) + outline(inner, { w: 0.6, seed: 9101 }));
		desk.say('stamp-text', page.matrix(8.35, 4.45, 0.11, 0.04), 'SURVEYED');
		desk.say('stamp-text', page.matrix(8.4, 5.1, 0.11, 0.04), 'AT BUILD');
	});
}

export function drawing() {
	const desk = makeDesk();
	desk.deskTone(-1, 28, 10.6, 12.4, 9200);
	desk.box([-0.3, -0.2, 0], 27.6, 11, 0.14, 9000, 'kraft-fill');
	const left = desk.flat([0, 0], -0.03, 0.14);
	const right = desk.flat([13.7, 0.1], 0.03, 0.14);
	desk.card(left, 13.2, 10.4, 9001);
	desk.card(right, 13.2, 10.4, 9002);
	desk.put('hatch light', hatch(left.on(box(12.4, 0, 0.8, 10.4)), 1.4, 1.2, 9003, { cluster: 3 }));
	for (let i = 0; i < 9; i++) desk.put('ink faint', line(right.on([[0.4, 0.6 + i * 1.1], [12.8, 0.6 + i * 1.1]]), { w: 0.3, seed: 9050 + i, over: 0 }));
	desk.say('print title', left.matrix(0.7, 0.55), 'Field book: one page per file');
	plots(desk, left);
	const notes: P = [7, 1.6];
	desk.say('pencil-text', left.matrix(notes[0], notes[1]), 'every file read');
	desk.say('pencil-text', left.matrix(notes[0], notes[1] + 0.8), 'before anyone visits');
	desk.say('print title', right.matrix(0.6, 0.55), 'Survey map');
	const mapAt = desk.flat([14.5, 1.0], 0.03, 0.15);
	const sketch = map(desk, mapAt, 'pencil', 9300);
	const inked = map(desk, mapAt, 'ink', 9400);
	const seal = stamp(desk, mapAt);
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: [...desk.layers, ...sketch.layers],
		words: desk.words,
		inked,
		seal,
		note: desk.note(desk.at([18, 0.6, 0.2]), 9500, [200, 32]),
	};
}
