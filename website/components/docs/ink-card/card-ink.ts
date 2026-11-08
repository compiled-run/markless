// The paper card behind every note, blockquote and disclosure: its inked edge drawn once at true size and frozen into global.css as CSS masks, plus the notes' small ink icons.
import { ellipse } from '../../figures/ink/desk.ts';
import { line, type P, seeded, stroke } from '../../figures/ink/ink.ts';
import { type Drawing, Sheet } from '../navbar/decor.ts';
import { compact, svgUrl } from '../snippet/snippet-ink.ts';

/** How far the ink may stray outside the paper edge; the mask box is the card grown by this much. */
export const PAD = 7;
/** Corner radius of the paper, and the side of a corner piece. */
export const RADIUS = 9;
export const CORNER = PAD + RADIUS + 2;
/** The folded-down top right corner: the fold's side on the paper, and the side of its piece. */
export const FOLD = 22;
export const FOLD_TILE = FOLD + PAD * 2;
/** Drawn length of an edge; a card stretches it along its length only, so the nib keeps its width. */
export const RUN = 240;
export const EDGE = PAD * 2;

const shift = (pts: P[], dx: number, dy: number): P[] => pts.map(([x, y]) => [x + dx, y + dy] as P);

/** One side of the card: one unbroken stroke, since a lift would stretch into a gap on a tall card, and a fainter pass a hair off it. */
function side(from: P, to: P, seed: number, w: number) {
	const rnd = seeded(seed);
	const off = (rnd() - 0.4) * 2.2;
	const across: P = Math.abs(to[0] - from[0]) > Math.abs(to[1] - from[1]) ? [0, off] : [off, 0];
	const t0 = 0.05 + rnd() * 0.25;
	const t1 = Math.min(0.98, t0 + 0.45 + rnd() * 0.3);
	const at = (t: number): P => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
	return {
		main: stroke([from, at(0.5), to], { w, seed, over: 0.6, wobble: 0.45 }),
		trace: line(shift([at(t0), at((t0 + t1) / 2), at(t1)], across[0], across[1]), { w: w * 0.45, seed: seed + 40, over: 1, wobble: 0.6 }),
	};
}

/** A quarter of the rounded corner, from one side's end round to the next. */
function corner(centre: P, from: number, seed: number, w: number) {
	const pts = Array.from({ length: 10 }, (_, k): P => {
		const a = ((from + (k / 9) * 90) * Math.PI) / 180;
		return [centre[0] + Math.cos(a) * RADIUS, centre[1] + Math.sin(a) * RADIUS];
	});
	return line(pts, { w, seed, over: 1.2, wobble: 0.3 });
}

export function drawing() {
	const near = PAD;
	const far = CORNER - PAD - RADIUS;
	const edge = (seed: number, w: number, along: 'x' | 'y') =>
		along === 'x' ? side([0, near], [RUN, near], seed, w) : side([near, 0], [near, RUN], seed, w);
	const f = FOLD_TILE - PAD;
	return {
		top: edge(1201, 2.1, 'x'),
		bottom: edge(1202, 2.6, 'x'),
		left: edge(1203, 2.1, 'y'),
		right: edge(1204, 2.6, 'y'),
		tl: corner([PAD + RADIUS, PAD + RADIUS], 180, 1211, 2.1),
		br: corner([far, far], 0, 1213, 2.6),
		bl: corner([PAD + RADIUS, far], 90, 1214, 2.4),
		fold: {
			flap:
				line([[PAD, PAD], [PAD + 0.6, PAD + FOLD * 0.5], [PAD + 0.9, f]], { w: 1.3, seed: 1221, over: 0.8, wobble: 0.35 }) +
				line([[PAD + 0.9, f], [PAD + FOLD * 0.5, f - 0.4], [f, f]], { w: 1.5, seed: 1222, over: 0.8, wobble: 0.35 }),
			crease: line([[PAD - 0.4, PAD - 0.6], [PAD + FOLD * 0.5, PAD + FOLD * 0.5 - 0.3], [f + 0.4, f + 0.3]], { w: 1.4, seed: 1223, over: 1.2, wobble: 0.3 }),
			edges:
				line([[0, PAD], [PAD, PAD - 0.2]], { w: 1.7, seed: 1224, over: 0.4, wobble: 0.2 }) +
				line([[f, f], [f + 0.2, FOLD_TILE]], { w: 2.1, seed: 1225, over: 0.4, wobble: 0.2 }),
			retrace: line([[PAD + 3, PAD + 2.2], [PAD + 9, PAD + 8], [PAD + 15, PAD + 14.4]], { w: 0.6, seed: 1226, over: 0.6, wobble: 0.4 }),
		},
	};
}

const ink = (d: string, alpha = 1) => (d ? `<path${alpha < 1 ? ` fill-opacity='${alpha}'` : ''} d='${compact(d)}'/>` : '');
const pass = (p: { main: string; trace: string }) => ink(p.main) + ink(p.trace, 0.45);

/** The frozen edge as CSS custom properties on every card, ready for `mask-image`. */
export function cardCss(art = drawing()): string {
	const square = (n: number, body: string) => svgUrl(`0 0 ${n} ${n}`, n, n, body);
	const props: [string, string][] = [
		['top', svgUrl(`0 0 ${RUN} ${EDGE}`, RUN, EDGE, pass(art.top), true)],
		['bottom', svgUrl(`0 0 ${RUN} ${EDGE}`, RUN, EDGE, pass(art.bottom), true)],
		['left', svgUrl(`0 0 ${EDGE} ${RUN}`, EDGE, RUN, pass(art.left), true)],
		['right', svgUrl(`0 0 ${EDGE} ${RUN}`, EDGE, RUN, pass(art.right), true)],
		['tl', square(CORNER, ink(art.tl))],
		['br', square(CORNER, ink(art.br))],
		['bl', square(CORNER, ink(art.bl))],
		['fold', square(FOLD_TILE, ink(art.fold.flap) + ink(art.fold.crease) + ink(art.fold.edges) + ink(art.fold.retrace, 0.5))],
	];
	return `.ink-card,\n.prose blockquote {\n${props.map(([name, value]) => `\t--card-${name}: ${value};`).join('\n')}\n}\n`;
}

/** A small mark at a note's title: `info` for an aside, `warning` for a trap, `tip` for a shortcut. */
export type NoteKind = 'info' | 'warning' | 'tip';

function info(): Drawing {
	const s = new Sheet(48, 48, 31, false);
	const disc = ellipse(24, 24, 17, 17, 36);
	s.wash(ellipse(24.5, 24.5, 14, 14, 24), 1.5, 1.5);
	s.shape(disc, 2.2, 1.1);
	s.dot([24.2, 14.8], 2.4);
	s.line([[24, 20.5], [24.3, 27], [24.4, 33.5]], 3.2, 0.2);
	s.line([[19.8, 34], [24, 33.6], [28.6, 33.8]], 2, 0.2);
	return s.done();
}

function warning(): Drawing {
	const s = new Sheet(48, 48, 32, false);
	const sign: P[] = [[24, 5.5], [43.5, 40.5], [4.5, 40.5]];
	s.wash([[24, 10], [39.5, 38], [8.5, 38]], 1.5, 1.5);
	s.shape(sign, 2.3, 1.1);
	s.line([[24, 16.5], [24.2, 23], [24.4, 29.5]], 3.4, 0.2);
	s.dot([24.4, 34.6], 2.3);
	return s.done();
}

function tip(): Drawing {
	const s = new Sheet(48, 48, 33, false);
	const arcPts = Array.from({ length: 25 }, (_, k): P => {
		const a = ((128 + (k / 24) * 284) * Math.PI) / 180;
		return [24 + Math.cos(a) * 12, 20 + Math.sin(a) * 12];
	});
	const bulb: P[] = [...arcPts, [29, 31.5], [19, 31.5]];
	s.wash(ellipse(24, 20, 10, 10, 24), 1.5, 1.5);
	s.shape(bulb, 2.1, 1.1);
	s.line([[19.6, 35.2], [24, 35], [28.4, 35.3]], 1.8, 0.2);
	s.line([[20.4, 38.8], [24, 38.6], [27.6, 38.9]], 1.8, 0.2);
	s.line([[22.4, 42.2], [25.6, 42.3]], 1.8, 0.1);
	s.line([[20.6, 30.5], [21.6, 24], [24, 27], [26.4, 24], [27.4, 30.5]], 1, 0.15);
	for (const deg of [-155, -120, -90, -60, -25]) {
		const a = (deg * Math.PI) / 180;
		s.line([[24 + Math.cos(a) * 15.5, 20 + Math.sin(a) * 15.5], [24 + Math.cos(a) * 20, 20 + Math.sin(a) * 20]], 1.8, 0.15);
	}
	return s.done();
}

export function noteIcons(): Record<NoteKind, Drawing> {
	return { info: info(), warning: warning(), tip: tip() };
}
