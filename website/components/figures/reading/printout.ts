// The guest-list file printed on a sheet on the desk, in a true monospace and the site's code colours, so every highlight and bracket lands on the characters it marks.
import { createScene, type P, type Point3, sheetAt } from '../ink/scene.ts';
import { jitter, matrixOf } from '../ink/desk.ts';
import { lengthOf, pathOf, r1, resample } from '../ink/ink.ts';
import { LINES, VALUES } from './model.ts';

/** One coloured run of a printed line, as the site's code highlighter colours it; `color` is empty for plain text. */
export interface Token {
	readonly content: string;
	readonly color: string;
}

/** Page layout in sheet centimetres: left margin, first baseline, line step, type size, character advance, indent step. */
export const PRINT = { left: 2.0, top: 1.15, step: 0.94, size: 0.64, advance: 0.384, indent: 0.768 };

export const columnU = (line: number, col: number) => PRINT.left + LINES[line]!.indent * PRINT.indent + col * PRINT.advance;
export const baselineV = (line: number) => PRINT.top + line * PRINT.step;

export function createPrintout(width: number, height: number, extra: Point3[], target: Point3, elevation: number, azimuth: number) {
	const scene = createScene({ width, height, extra, target, elevation, azimuth });
	const { proj, sheetMatrix } = scene;

	/** Each line split at every token and highlight edge, each piece placed at its own column so the font's width can never drift a highlight. */
	function lines(tokens: readonly (readonly Token[])[]) {
		return LINES.map((line, i) => {
			const cuts = new Set<number>([0, line.text.length]);
			for (const value of VALUES.filter((v) => v.line === i)) {
				const at = line.text.indexOf(value.text);
				cuts.add(at);
				cuts.add(at + value.text.length);
			}
			const runs: { from: number; to: number; color: string }[] = [];
			let col = -line.indent;
			for (const token of tokens[i] ?? []) {
				const from = col;
				col += token.content.length;
				if (col > 0) runs.push({ from: Math.max(0, from), to: col, color: token.color });
			}
			for (const run of runs) cuts.add(run.from);
			const edges = [...cuts].filter((at) => at >= 0 && at <= line.text.length).sort((a, b) => a - b);
			return {
				key: i,
				pieces: edges
					.slice(0, -1)
					.map((from, k) => {
						const run = runs.find((r) => r.from <= from && from < r.to);
						return { key: k, text: line.text.slice(from, edges[k + 1]), tint: run?.color ? '--c:' + run.color : '', matrix: sheetMatrix(columnU(i, from), baselineV(i)) };
					})
					.filter((piece) => piece.text.trim() !== ''),
			};
		});
	}

	/** A highlighter pass over characters `from` to `to` of a line: a jittered centre line, its pen width in screen pixels, and its length for the draw-on. */
	function swipe(line: number, from: number, to: number, seed: number) {
		const v = baselineV(line) - PRINT.size * 0.34;
		const inset = PRINT.size * 0.42;
		const pts: P[] = jitter(resample([proj(sheetAt(columnU(line, from) + inset, v + 0.03)), proj(sheetAt(columnU(line, to) - inset, v - 0.03))], 6), seed, 0.5);
		const top = proj(sheetAt(columnU(line, from), v - PRINT.size * 0.62));
		const bottom = proj(sheetAt(columnU(line, from), v + PRINT.size * 0.52));
		return { d: pathOf(pts), length: r1(lengthOf(pts) + 2), width: r1(Math.hypot(bottom[0] - top[0], bottom[1] - top[1])) };
	}

	const values = VALUES.map((value, k) => {
		const from = LINES[value.line]!.text.indexOf(value.text);
		return { key: k, line: value.line, text: value.text, ...swipe(value.line, from, from + value.text.length, 7000 + k * 7) };
	});

	/** A shaky pen line through sheet points, with its length for the draw-on. */
	function pen(points: readonly (readonly [number, number])[], seed: number, step = 4) {
		const pts: P[] = jitter(resample(points.map(([u, v]) => proj(sheetAt(u, v, 0.02))), step), seed, 0.7);
		return { d: pathOf(pts), length: r1(lengthOf(pts) + 2) };
	}

	/** A short pen arrow from `from` to `to`, with two barbs at the tip. */
	function arrow(from: [number, number], to: [number, number], seed: number) {
		const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
		const barb = (s: number): [number, number][] => [[to[0] - Math.cos(a + s) * 0.32, to[1] - Math.sin(a + s) * 0.32], to];
		const shaft = pen([from, to], seed, 3);
		return { d: shaft.d + pen(barb(0.6), seed + 1, 2).d + pen(barb(-0.6), seed + 2, 2).d, length: r1(shaft.length + 40) };
	}

	/** A hand-drawn oval round a centre, closed with a little overshoot. */
	function ring(cu: number, cv: number, ru: number, rv: number, seed: number) {
		const pts: [number, number][] = Array.from({ length: 26 }, (_, i) => {
			const a = -1.9 + (i / 24) * Math.PI * 2;
			return [cu + Math.cos(a) * ru, cv + Math.sin(a) * rv];
		});
		return pen(pts, seed, 2);
	}

	/** A loose rounded box from (u0, v0) to (u1, v1), drawn in one stroke that overshoots where it closes. */
	function box(u0: number, v0: number, u1: number, v1: number, seed: number) {
		const r = 0.35;
		return pen(
			[
				[u0 + r, v0 - 0.05],
				[u1 - r, v0],
				[u1, v0 + r],
				[u1 + 0.03, v1 - r],
				[u1 - r, v1],
				[u0 + r, v1 + 0.03],
				[u0, v1 - r],
				[u0 - 0.03, v0 + r],
				[u0 + r + 0.5, v0 - 0.08],
			],
			seed,
			3,
		);
	}

	/** Text written along the sheet turned a quarter turn: `up` reads bottom to top, otherwise top to bottom. */
	const turnedAt = (u: number, v: number, up: boolean) => (up ? matrixOf(proj(sheetAt(u, v)), proj(sheetAt(u, v - 0.1)), proj(sheetAt(u + 0.1, v))) : matrixOf(proj(sheetAt(u, v)), proj(sheetAt(u, v + 0.1)), proj(sheetAt(u - 0.1, v))));

	/** A highlighter pass on the desk or the sheet between two points, as wide as a printed line. */
	function freeSwipe(u: number, v: number, length: number, seed: number) {
		const pts: P[] = jitter(resample([proj(sheetAt(u, v, 0.02)), proj(sheetAt(u + length, v - 0.05, 0.02))], 6), seed, 0.5);
		const t = proj(sheetAt(u, v - PRINT.size * 0.55));
		const b = proj(sheetAt(u, v + PRINT.size * 0.45));
		return { d: pathOf(pts), length: r1(lengthOf(pts) + 2), width: r1(Math.hypot(b[0] - t[0], b[1] - t[1])) };
	}

	return { scene, lines, values, matrixAt: sheetMatrix, proj, pen, arrow, ring, box, turnedAt, freeSwipe };
}
