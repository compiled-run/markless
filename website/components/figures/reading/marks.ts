// The four hand mark-ups of the one guest-list printout: the whole file, its values, its instructions in run order, and its @ blocks.
import { sheetAt, SHEET_W } from '../ink/scene.ts';
import { BODY, LINES } from './model.ts';
import { baselineV, columnU, createPrintout, PRINT, type Token } from './printout.ts';

export const WIDTH = 680;
export const HEIGHT = 600;

const print = createPrintout(WIDTH, HEIGHT, [sheetAt(0, -2.2), sheetAt(SHEET_W, -2.2)], [9.8, -1.2, 0], 84, 91);
const { matrixAt, pen, arrow, ring, box, turnedAt, freeSwipe } = print;

type Tone = 'sheet' | 'desk' | 'print';

interface Swipe {
	readonly key: number;
	readonly d: string;
	readonly length: number;
	readonly width: number;
	readonly at: number;
	readonly desk: boolean;
}

interface Stroke {
	readonly key: number;
	readonly d: string;
	readonly length: number;
	readonly at: number;
	readonly desk: boolean;
}

interface Note {
	readonly key: number;
	readonly matrix: string;
	readonly text: string;
	readonly at: number;
	readonly tone: Tone;
}

interface Marks {
	readonly swipes: Swipe[];
	readonly pens: Stroke[];
	readonly notes: Note[];
	readonly slips: { readonly key: number; readonly d: string }[];
}

/** Collects marks in drawing order, numbering each kind as it goes. */
function markup() {
	const marks: Marks = { swipes: [], pens: [], notes: [], slips: [] };
	return {
		marks,
		swipe: (s: { d: string; length: number; width: number }, at: number, desk = false) => marks.swipes.push({ key: marks.swipes.length, d: s.d, length: s.length, width: s.width, at, desk }),
		pen: (s: { d: string; length: number }, at: number, desk = false) => marks.pens.push({ key: marks.pens.length, d: s.d, length: s.length, at, desk }),
		note: (matrix: string, text: string, at: number, tone: Tone = 'sheet') => marks.notes.push({ key: marks.notes.length, matrix, text, at, tone }),
	};
}

const v = baselineV;
const lineEnd = (line: number) => columnU(line, LINES[line]!.text.length);
const valueSpan = (k: number) => {
	const value = print.values[k]!;
	const from = LINES[value.line]!.text.indexOf(value.text);
	return { line: value.line, from: columnU(value.line, from), to: columnU(value.line, from + value.text.length), mid: columnU(value.line, from + value.text.length / 2) };
};
const midline = (line: number) => v(line) - PRINT.size * 0.32;

/** The whole file: yellow on every value, a bracket down the body, and a legend on the desk. */
function overview(): Marks {
	const m = markup();
	print.values.forEach((value, k) => m.swipe(value, 200 + k * 380));
	const bu = 1.4;
	const top = v(BODY.from) - PRINT.size * 0.95;
	const bottom = v(BODY.to) + 0.2;
	const mid = (top + bottom) / 2;
	m.pen(pen([[bu + 0.7, top], [bu, top + 0.12], [bu, mid - 0.35], [bu - 0.35, mid], [bu, mid + 0.35], [bu, bottom - 0.12], [bu + 0.7, bottom]], 7400, 3), 1800);
	m.note(turnedAt(bu - 0.55, mid + 2.6, true), 'instructions', 2300);
	print.values.forEach((_, k) => {
		const span = valueSpan(k);
		const text = LINES[span.line]!.text;
		const atEnd = text.length - text.indexOf(print.values[k]!.text) - print.values[k]!.text.length <= 1;
		if (atEnd) {
			const tip = lineEnd(span.line) + 0.15;
			m.pen(arrow([tip + 0.8, midline(span.line) - 0.05], [tip, midline(span.line)], 7600 + k * 9), 2500 + k * 250);
			m.note(matrixAt(tip + 1, v(span.line)), 'value', 2650 + k * 250);
		} else {
			m.pen(arrow([span.mid - 0.1, v(span.line + 1) - PRINT.size * 0.2], [span.mid, v(span.line) + 0.2], 7600 + k * 9), 2500 + k * 250);
			m.note(matrixAt(span.mid + 0.25, v(span.line + 1)), 'value', 2650 + k * 250);
		}
	});
	m.swipe(freeSwipe(3, -1.05, 1.6, 7500), 3500, true);
	m.note(matrixAt(5.1, -0.8), '= value  { }', 3600, 'desk');
	m.pen(pen([[12.85, -1.65], [12.4, -1.53], [12.4, -0.63], [12.85, -0.51]], 7510, 2), 3700, true);
	m.note(matrixAt(13.3, -0.8), '= instructions  @{ }', 3800, 'desk');
	return m.marks;
}

/** Each value with a margin note saying what it produces. */
function values(): Marks {
	const m = markup();
	print.values.forEach((value, k) => m.swipe(value, 200 + k * 380));
	const [ternary, name, clear] = [valueSpan(0), valueSpan(1), valueSpan(2)];
	m.pen(arrow([name.to + 1.2, midline(name.line) - 0.05], [name.to + 0.2, midline(name.line)], 8100), 1500);
	m.note(matrixAt(name.to + 1.4, v(name.line)), 'Ada, then Grace', 1650);
	m.pen(arrow([16.4, v(7) - 0.7], [16.3, v(ternary.line) + 0.22], 8110), 1900);
	m.note(matrixAt(15.2, v(7) + 0.05), "'host' for Ada,", 2050);
	m.note(matrixAt(15.2, v(8) + 0.05), 'empty for Grace', 2150);
	m.pen(arrow([clear.mid - 0.1, v(clear.line + 1) - PRINT.size * 0.2], [clear.mid, v(clear.line) + 0.2], 8120), 2400);
	m.note(matrixAt(clear.mid + 0.25, v(clear.line + 1)), 'a function, run on click', 2550);
	return m.marks;
}

/** The body's instructions numbered in the order they run, the last one bracketed as what shows up. */
function steps(): Marks {
	const m = markup();
	[1, 2, 3].forEach((line, k) => {
		m.pen(ring(1.05, midline(line), 0.36, 0.36, 8200 + k * 5), 600 + k * 450);
		m.note(matrixAt(0.86, v(line) - 0.02), String(k + 1), 720 + k * 450);
	});
	m.note(matrixAt(0.3, -0.8), 'runs in this order', 100, 'desk');
	m.pen(arrow([0.75, -0.45], [0.95, midline(1) - 0.5], 8220), 300, true);
	const bu = 20.2;
	const top = v(3) - PRINT.size * 0.9;
	const bottom = v(BODY.to) + 0.2;
	const mid = (top + bottom) / 2;
	m.pen(pen([[bu - 0.5, top], [bu, top + 0.12], [bu, mid - 0.35], [bu + 0.35, mid], [bu, mid + 0.35], [bu, bottom - 0.12], [bu - 0.5, bottom]], 8230, 3), 2200);
	m.note(turnedAt(bu + 0.6, mid - 3.9, false), 'this is what shows up', 2700);
	return m.marks;
}

/** The @for and @if blocks boxed with what each does, and a slip on the desk with what the page shows. */
function blocks(): Marks {
	const m = markup();
	m.pen(box(2.95, v(4) - 0.74, 20.1, v(8) + 0.24, 8300), 200);
	m.note(matrixAt(8.4, v(7) + 0.05), 'once per guest', 900);
	m.pen(box(2.95, v(9) - 0.62, 14.4, v(11) + 0.26, 8310), 1300);
	m.note(matrixAt(15, v(9) + 0.45), 'only when', 2000);
	m.note(matrixAt(15, v(10) + 0.45), "no one's going", 2100);
	const slip: [number, number][] = [[12.1, -2.05], [21.4, -2.1], [21.45, -0.2], [12.05, -0.15]];
	m.marks.slips.push({ key: 0, d: pen([...slip, slip[0]!], 8320, 2).d + 'Z' });
	m.pen(pen([...slip, slip[0]!], 8321, 2), 2500, true);
	m.note(matrixAt(12.6, -1.3), 'Ada', 2900, 'print');
	m.note(matrixAt(12.6, -0.55), 'Grace', 3000, 'print');
	m.pen(box(16.4, -1.45, 19.4, -0.5, 8330), 3100, true);
	m.note(matrixAt(16.95, -0.75), 'Clear', 3200, 'print');
	m.pen(arrow([10.6, -0.95], [11.8, -1.05], 8340), 3300, true);
	m.note(matrixAt(5.6, -0.8), 'on the page:', 3400, 'desk');
	return m.marks;
}

/** The printout and its four mark-ups, frozen into printout.art.ts. `tokens` is the file as the site's code highlighter colours it. */
export function drawing(tokens: readonly (readonly Token[])[]) {
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: print.scene.sheetArt(),
		lines: print.lines(tokens),
		marks: { overview: overview(), values: values(), steps: steps(), blocks: blocks() },
	};
}
