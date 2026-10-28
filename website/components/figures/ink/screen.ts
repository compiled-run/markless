// A flat sheet drawn as a browser window, and ink buttons, sized so live HTML can sit on top of them.
import { ellipse, jitter, roundRect } from './desk.ts';
import { hatch, line, outline, type P, pathOf, wash } from './ink.ts';
import { pencil } from './plane.ts';

/** Height of the browser bar in art units; the HTML lays its own bar over it at the same share of the sheet. */
export const BAR = 30;

const quad = (x0: number, y0: number, x1: number, y1: number, seed: number, wobble = 1.4): P[] =>
	jitter([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], seed, wobble);

const closedEdge = (corners: P[], step = 6): P[] =>
	corners.flatMap((a, i) => {
		const b = corners[(i + 1) % corners.length]!;
		const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
		return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as P);
	});

/** A sheet of paper lying on the desk, drawn as a browser window `width` by `height` art units, with a hatched shadow down and to the right. */
export function screen(width: number, height: number, seed: number) {
	const corners = quad(0, 0, width, height, seed, 2.2);
	const edge = closedEdge(corners);
	const drop = 9;
	const [, tr, br, bl] = corners as [P, P, P, P];
	const shadow: P[] = [
		[tr[0], tr[1] + 6],
		[tr[0] + drop, tr[1] + 6 + drop],
		[br[0] + drop, br[1] + drop],
		[bl[0] + 6, bl[1] + drop],
		[bl[0] + 6, bl[1]],
		[br[0], br[1]],
	];
	const pill = roundRect(width * 0.17, 8, width * 0.66, BAR - 8, 6);
	const dots = [16, 28, 40].map((x, i) => outline(ellipse(x, BAR / 2, 4, 4, 16), { w: 0.9, seed: seed + 40 + i }));
	const bar: P[] = [[0, 0], [width, 0], [width, BAR], [0, BAR]];
	return {
		width,
		height,
		paper: pathOf(edge, true),
		shadow: { wash: pathOf(shadow, true), hatch: hatch(shadow, 0.9, 2.1, seed + 3, { cluster: 5, skip: 0.1 }) },
		bar: {
			tone: hatch(bar, 0.12, 2.6, seed + 10, { cluster: 6, skip: 0.25 }),
			rule: line([[1, BAR], [width - 1, BAR + 0.6]], { w: 1, seed: seed + 11 }),
			dots: dots.join(''),
			url: outline(pill, { w: 0.85, seed: seed + 12 }),
		},
		ink: outline(edge, { w: 2, heavy: 1.6, centre: [width / 2, height / 2], seed: seed + 1 }),
		pencil: pencil([[-12, -6], [width + 18, -4]], seed + 20) + pencil([[width + 6, -14], [width + 3, height + 16]], seed + 21) + pencil([[-8, height + 5], [width * 0.4, height + 7]], seed + 22),
	};
}

/** A button drawn as a raised paper tab: its face, a hatched side below it, and a wash for when it is chosen. */
export function button(width: number, height: number, seed: number) {
	const face = closedEdge(roundRect(2, 2, width - 4, height - 6, 7, 4).map((p, i) => [p[0] + Math.sin(i * 1.7 + seed) * 0.5, p[1] + Math.cos(i * 2.3 + seed) * 0.5] as P), 4);
	const side: P[] = [[4, height - 8], [width - 4, height - 8], [width - 1, height - 2], [6, height - 1]];
	return {
		width,
		height,
		face: pathOf(face, true),
		side: hatch(side, 0.95, 1.5, seed + 2, { cluster: 1 }) + line([[6, height - 1.5], [width - 2, height - 2.2]], { w: 0.8, seed: seed + 3 }),
		wash: wash(face, seed + 4, 0.5, 2),
		ink: outline(face, { w: 1.5, heavy: 1.2, centre: [width / 2, height / 2], seed: seed + 5 }),
	};
}

/** A hand-drawn ring around a number in the margin. */
export function ring(size: number, seed: number) {
	const loop = ellipse(size / 2, size / 2, size / 2 - 2, size / 2 - 2.4, 28);
	return { size, ink: outline(loop, { w: 1.1, seed }) };
}

export function art() {
	return {
		wide: screen(440, 300, 700),
		narrow: screen(340, 360, 760),
		button: button(112, 44, 820),
		buttonAlt: button(112, 44, 840),
		ring: ring(26, 860),
	};
}
