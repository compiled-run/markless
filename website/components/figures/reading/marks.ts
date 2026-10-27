// The guest-list printout marked up by hand: yellow on every value, a bracket down the instructions, a legend on the desk.
import { sheetAt, SHEET_H, SHEET_W } from '../ink/scene.ts';
import { BODY, LINES } from './model.ts';
import { baselineV, columnU, createPrintout, PRINT, type Token } from './printout.ts';

export const WIDTH = 680;
export const HEIGHT = 600;

const print = createPrintout(WIDTH, HEIGHT, [sheetAt(0, -2.2), sheetAt(SHEET_W, -2.2)], [9.8, -1.2, 0], 84, 91);
const { matrixAt, pen, arrow, turnedAt, freeSwipe } = print;

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

/** The view box cropped to the sheet, its legend and its shadow, so no empty desk sits above or below the figure. */
function cropped() {
	const corners = [print.proj(sheetAt(-0.3, -2.1)), print.proj(sheetAt(SHEET_W + 0.9, -2.1)), print.proj(sheetAt(-0.3, SHEET_H + 0.7)), print.proj(sheetAt(SHEET_W + 0.9, SHEET_H + 0.7))];
	const xs = corners.map((p) => p[0]);
	const ys = corners.map((p) => p[1]);
	const x0 = Math.floor(Math.min(...xs));
	const y0 = Math.floor(Math.min(...ys));
	return { x: x0, y: y0, width: Math.ceil(Math.max(...xs)) - x0, height: Math.ceil(Math.max(...ys)) - y0 };
}

/** The printout and its mark-up, frozen into printout.art.ts. `tokens` is the file in the site's code colours. */
export function drawing(tokens: readonly (readonly Token[])[]) {
	return {
		view: cropped(),
		sheet: print.scene.sheetArt(),
		lines: print.lines(tokens),
		marks: overview(),
	};
}
