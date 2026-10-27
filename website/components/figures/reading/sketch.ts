// Flat ink sketches for the reading page: a short slice of the guest list on a paper slip beside what it does on a phone screen.
import { roundRect } from '../ink/desk.ts';
import { hatch, lengthOf, line, outline, type P, pathOf, r1, resample, seeded, wash } from '../ink/ink.ts';
import { LINES } from './model.ts';
import type { Token } from './printout.ts';

interface Shape {
	readonly key: number;
	readonly d: string;
	readonly cls: string;
}

interface Stroke {
	readonly key: number;
	readonly d: string;
	readonly length: number;
	readonly at: number;
	readonly cls: string;
}

interface Text {
	readonly key: number;
	readonly x: number;
	readonly y: number;
	readonly text: string;
	readonly cls: string;
	readonly style: string;
}

/** One sketch at one size: everything is drawn in viewBox units, in the order the arrays are listed. */
export interface Layout {
	readonly width: number;
	readonly height: number;
	readonly size: number;
	readonly shapes: Shape[];
	readonly strokes: Stroke[];
	readonly texts: Text[];
}

/** A slice of the file as it is printed: real lines by index, or a hand-made line built from runs of real ones. */
type SlicePart = { readonly line: number; readonly from: number; readonly to: number } | { readonly text: string };
type SliceLine = number | readonly SlicePart[];

function jittered(points: P[], seed: number, amount: number): P[] {
	const rnd = seeded(seed);
	return points.map(([x, y], i) => (i === 0 || i === points.length - 1 ? [x, y] : [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]));
}

/** Points along a cubic curve from `a` to `d`. */
function curve(a: P, b: P, c: P, d: P, steps = 30): P[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		const s = 1 - t;
		return [s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0], s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]];
	});
}

export function sketcher(width: number, height: number, tokens: readonly (readonly Token[])[], size: number) {
	const out: Layout = { width, height, size, shapes: [], strokes: [], texts: [] };
	const advance = size * 0.6;
	let seed = 9000;
	const next = () => (seed += 7);

	const shape = (d: string, cls: string) => out.shapes.push({ key: out.shapes.length, d, cls });
	const text = (x: number, y: number, value: string, cls: string, style = '') => out.texts.push({ key: out.texts.length, x: r1(x), y: r1(y), text: value, cls, style });

	/** A pen line drawn on in the order of `at`, shaky like the hand that drew it. */
	function pen(points: P[], at: number, cls = 'pen') {
		const pts = jittered(resample(points, 4), next(), 0.9);
		out.strokes.push({ key: out.strokes.length, d: pathOf(pts), length: r1(lengthOf(pts) + 2), at, cls });
	}

	/** A curved pen arrow from `from` to `to`, leaving and arriving along the given directions. */
	function arrow(from: P, to: P, at: number, cls = 'pen', bend: [P, P] = [[0, 0], [0, 0]]) {
		const pts = curve(from, [from[0] + bend[0][0], from[1] + bend[0][1]], [to[0] + bend[1][0], to[1] + bend[1][1]], to);
		pen(pts, at, cls);
		const tail = pts.at(-4)!;
		const a = Math.atan2(to[1] - tail[1], to[0] - tail[0]);
		const barb = (s: number): P[] => [[to[0] - Math.cos(a + s) * 9, to[1] - Math.sin(a + s) * 9], to];
		pen(barb(0.5), at + 380, cls);
		pen(barb(-0.5), at + 380, cls);
	}

	/** A sheet of paper: its fill, a hatched shadow down and right, and an inked edge. */
	function paper(x0: number, y0: number, x1: number, y1: number, r: number, cls = '') {
		const s = next();
		shape(pathOf(roundRect(x0 + 5, y0 + 6, x1 + 5, y1 + 6, r), true), ('shade ' + cls).trim());
		shape(hatch(roundRect(x0 + 6, y1 - 4, x1 + 5, y1 + 6, 2), -0.7, 3, s, { cluster: 3, skip: 0.2 }) + hatch(roundRect(x1 - 4, y0 + 8, x1 + 5, y1 + 6, 2), -0.7, 3, s + 1, { cluster: 3, skip: 0.2 }), ('hatch ' + cls).trim());
		shape(pathOf(roundRect(x0, y0, x1, y1, r), true), ('paper ' + cls).trim());
		shape(outline(roundRect(x0, y0, x1, y1, r), { w: 1.6, heavy: 1, seed: s + 2 }), ('ink ' + cls).trim());
	}

	/** A phone lying flat: body, screen and speaker slot; returns the screen's inner box. */
	function phone(x0: number, y0: number, x1: number, y1: number) {
		const s = next();
		shape(pathOf(roundRect(x0 + 6, y0 + 7, x1 + 6, y1 + 7, 22), true), 'shade');
		shape(pathOf(roundRect(x0, y0, x1, y1, 22), true), 'body');
		shape(hatch(roundRect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, 20), -0.8, 2.6, s, { cluster: 5, skip: 0.15 }), 'hatch');
		shape(outline(roundRect(x0, y0, x1, y1, 22), { w: 2, heavy: 1.2, seed: s + 1 }), 'ink');
		const screen = { x0: x0 + 9, y0: y0 + 26, x1: x1 - 9, y1: y1 - 22 };
		shape(pathOf(roundRect(screen.x0, screen.y0, screen.x1, screen.y1, 6), true), 'screen');
		shape(outline(roundRect(screen.x0, screen.y0, screen.x1, screen.y1, 6), { w: 1, seed: s + 2 }), 'ink');
		shape(line([[(x0 + x1) / 2 - 16, y0 + 13], [(x0 + x1) / 2 + 16, y0 + 13]], { w: 2.2, seed: s + 3, over: 0 }), 'ink');
		return screen;
	}

	/** A dashed pencil outline where a folded flap would open. */
	function tucked(x0: number, y0: number, x1: number, y1: number, cls: string) {
		shape(pathOf(jittered(resample([...roundRect(x0, y0, x1, y1, 3), [x0 + 3, y0]], 3), next(), 0.6)), 'tucked ' + cls);
	}

	/** A loose highlighter pass behind a span of the screen or the slip. */
	function highlight(x0: number, y: number, x1: number, h: number, cls: string) {
		shape(wash(roundRect(x0, y - h / 2, x1, y + h / 2, h / 2.2), next(), 1.2, 2.2), cls);
	}

	/** A small pointing hand, its fingertip at (x, y). */
	function cursor(x: number, y: number, cls: string) {
		const hand: P[] = [
			[x, y],
			[x + 3, y - 1],
			[x + 4, y + 9],
			[x + 9, y + 7],
			[x + 14, y + 9],
			[x + 18, y + 12],
			[x + 18, y + 22],
			[x + 14, y + 28],
			[x + 5, y + 28],
			[x - 3, y + 17],
			[x - 1, y + 14],
			[x + 2, y + 17],
			[x - 1, y + 1],
		];
		shape(pathOf(hand, true), 'paper ' + cls);
		shape(outline(hand, { w: 1.2, seed: next() }), 'ink ' + cls);
	}

	/** Lines of the file on a slip, at the site's code colours; returns where each column and line sits. */
	function code(lines: readonly SliceLine[], x: number, y: number, lineHeight: number, cls = '') {
		const runsOf = (entry: SliceLine): Token[] => {
			const pick = (index: number, from = 0, to = Infinity) => {
				const lead = LINES[index]!.indent;
				const picked: Token[] = [];
				let col = -lead;
				for (const token of tokens[index] ?? []) {
					const start = col;
					col += token.content.length;
					const a = Math.max(start, from, 0);
					const b = Math.min(col, to);
					if (b > a) picked.push({ content: token.content.slice(a - start, b - start), color: token.color, dark: token.dark });
				}
				return picked;
			};
			return typeof entry === 'number' ? pick(entry) : entry.flatMap((part) => ('text' in part ? [{ content: part.text, color: '', dark: '' }] : pick(part.line, part.from, part.to)));
		};
		const first = (entry: readonly SlicePart[]) => entry.find((part): part is { line: number; from: number; to: number } => 'line' in part)!.line;
		const indents = lines.map((entry) => LINES[typeof entry === 'number' ? entry : first(entry)]!.indent);
		const base = Math.min(...indents);
		const rows = lines.map((entry, row) => {
			const indent = (indents[row]! - base) * 2;
			let col = indent;
			for (const run of runsOf(entry)) {
				const tint = run.color ? '--c:' + run.color + ';--cd:' + (run.dark || 'var(--ink)') : '';
				if (run.content.trim()) text(x + col * advance, y + row * lineHeight, run.content, ('code ' + (tint ? 'tint ' : '') + cls).trim(), tint);
				col += run.content.length;
			}
			return { indent, length: col, y: y + row * lineHeight };
		});
		const columnX = (row: number, col: number) => x + (rows[row]!.indent + col) * advance;
		return { rows, columnX, advance };
	}

	/** An empty socket drawn round a printed value from x0 to x1: a pen outline with its inside hatched hollow. */
	function socket(x0: number, x1: number, y: number, at: number, cls = 'pen') {
		const top = y - size * 0.95;
		const bottom = y + size * 0.4;
		shape(hatch(roundRect(x0 - 2, top, x1 + 2, bottom, 5), 0.9, 3.2, next(), { cluster: 2, skip: 0.1, trim: 0.1 }), 'socket');
		pen([...roundRect(x0 - 3, top - 1, x1 + 3, bottom + 1, 6), [x0 - 3 + 6, top - 1]], at, cls);
	}

	return { out, pen, arrow, paper, phone, highlight, cursor, code, socket, text, shape, tucked, advance };
}
