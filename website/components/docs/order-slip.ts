// A Beanshop order slip lying on the desk, seen from straight above: the printed body, four rubber stamps, and a tear-off stub below a perforation.
import { ellipse, roundRect } from '../figures/ink/desk.ts';
import { hatch, hull, line, lengthOf, outline, type P, pathOf, r1, resample, seeded, wash } from '../figures/ink/ink.ts';

export const WIDTH = 460;
export const HEIGHT = 460;
/** Every position on the slip, in viewBox units; the markup lays its text out on the same grid. */
export const SLIP = { left: 24, right: 416, top: 22, tear: 340, bottom: 436, inset: 44 } as const;
/** Four stamps in two columns and two rows, between the second printed rule and the perforation. */
export const STAMP = { width: 164, height: 64, lefts: [44, 230], tops: [180, 258], turns: [-2.2, 1.8, 1.4, -2] } as const;
export const RULES = [84, 162] as const;
export const SHADOW: P = [9, 11];

/** A printer's serrated cut between two x positions at height y. */
function serrated(x0: number, x1: number, y: number, depth: number, seed: number): P[] {
	const rnd = seeded(seed);
	const pts: P[] = [];
	const step = 7.5;
	for (let x = x0, i = 0; x < x1; x += step * (0.8 + rnd() * 0.4), i++) pts.push([x, y + (i % 2 ? depth * (0.6 + rnd() * 0.5) : -depth * 0.2 * rnd())]);
	pts.push([x1, y]);
	return pts;
}

/** A ruled edge with a little hand wander. */
function edge(a: P, b: P, seed: number, amount = 0.9): P[] {
	const rnd = seeded(seed);
	return resample([a, b], 12).map(([x, y], i, all) => (i === 0 || i === all.length - 1 ? [x, y] : [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]));
}

const shifted = (pts: P[], [dx, dy]: P): P[] => pts.map(([x, y]) => [x + dx, y + dy]);

/** A dashed rule printed across the slip, each dash its own short stroke. */
function dashes(y: number, seed: number): string {
	const rnd = seeded(seed);
	let d = '';
	for (let x = SLIP.inset, k = 0; x < SLIP.right - 22; x += 9, k++) d += line([[x, y + (rnd() - 0.5) * 0.6], [x + 5 + rnd(), y + (rnd() - 0.5) * 0.6]], { w: 0.9, seed: seed + k, over: 0.3, wobble: 0.2 });
	return d;
}

/** The cast shadow of a paper shape lifted a hair off the desk: a soft wash and clusters of hatching. */
function cast(poly: P[], seed: number) {
	const shadow = hull([...poly, ...shifted(poly, SHADOW)]);
	return {
		wash: wash(shifted(poly, [SHADOW[0] * 0.7, SHADOW[1] * 0.7]), seed, 1, 2.5),
		hatch: hatch(shadow, -0.5, 3, seed + 1, { cluster: 5, skip: 0.2 }),
	};
}

function bodyArt() {
	const { left, right, top, tear } = SLIP;
	const topEdge = serrated(left, right, top, 3.2, 100);
	const rightEdge = edge([right, top], [right + 0.6, tear], 101);
	const leftEdge = edge([left + 0.4, tear], [left, top], 102);
	const paper: P[] = [...topEdge, ...rightEdge.slice(1), [right + 0.6, tear], [left + 0.4, tear], ...leftEdge.slice(1)];
	const shadow = cast(paper, 110);
	const feed = edge([left + 2, tear - 0.6], [right - 1, tear - 0.6], 152, 0.5);
	const fringe = serrated(left + 0.4, right + 0.6, tear + 1, 3, 150);
	const curl: P[] = [[right - 9, top + 6], [right, top + 2], [right + 0.6, tear], [right - 6, tear]];
	return {
		paper: pathOf(paper, true),
		shadow,
		ink:
			line(topEdge, { w: 0.9, seed: 120, over: 0.5, wobble: 0.3 }) +
			line(rightEdge, { w: 1.9, heavy: 0.8, seed: 121, over: 2.5 }) +
			line(leftEdge, { w: 1.2, seed: 122, over: 2.5 }),
		curl: hatch(curl, 1.45, 2.4, 123, { cluster: 4, trim: 0.35, skip: 0.15 }),
		rules: dashes(RULES[0], 130) + dashes(RULES[1], 131),
		feed: { d: pathOf(feed), length: r1(lengthOf(feed) + 1) },
		torn: { paper: pathOf([[left + 0.4, tear - 2], ...fringe, [right + 0.6, tear - 2]], true), ink: line(fringe, { w: 0.9, seed: 151, over: 0.4, wobble: 0.3 }) },
	};
}

function stampArt(key: number) {
	const { width: w, height: h } = STAMP;
	const outer = roundRect(0, 0, w, h, 10, 4);
	const inner = roundRect(5, 5, w - 5, h - 5, 6, 4);
	const band = [...outer];
	const corner: P[] = [[w * 0.62, h], [w, h * 0.38], [w, h], [w * 0.62, h]];
	return {
		key,
		x: STAMP.lefts[key % 2]!,
		y: STAMP.tops[Math.floor(key / 2)]!,
		turn: STAMP.turns[key]!,
		wash: wash(inner, 200 + key * 10, 1.5, 2.2),
		ink: outline(outer, { w: 1.8, heavy: 0.7, seed: 201 + key * 10 }) + outline(inner, { w: 0.8, seed: 202 + key * 10 }),
		tone: hatch(hull([...corner, ...band.filter(([x, y]) => x > w * 0.6 && y > h * 0.4)]), 0.9, 2.6, 203 + key * 10, { cluster: 3, trim: 0.4, skip: 0.35 }),
	};
}

/** Small hand-drawn scissors with the blade pivot near (x - 8, y), handles to the right, blades cutting toward the left. */
function scissors(x: number, y: number): string {
	const ring = (cy: number, seed: number) => outline(ellipse(x + 3.4, cy, 3.6, 2.9, 14), { w: 1, seed, over: 0.6, wobble: 0.25 });
	return (
		ring(y - 4.6, 360) +
		ring(y + 4.6, 361) +
		line([[x + 0.2, y - 3.2], [x - 8, y], [x - 22, y + 2.4]], { w: 1.2, heavy: 0.4, seed: 362, over: 0.3, wobble: 0.2 }) +
		line([[x + 0.2, y + 3.2], [x - 8, y], [x - 22, y - 2.4]], { w: 1.2, heavy: 0.4, seed: 363, over: 0.3, wobble: 0.2 }) +
		outline(ellipse(x - 8, y, 0.9, 0.9, 8), { w: 0.8, seed: 364, over: 0.2, wobble: 0.1 })
	);
}

function stubArt() {
	const { left, right, tear, bottom } = SLIP;
	const bottomEdge = serrated(left, right, bottom, 3.2, 300).reverse();
	const rightEdge = edge([right + 0.6, tear], [right + 0.2, bottom], 301);
	const leftEdge = edge([left, bottom], [left + 0.4, tear], 302);
	const paper: P[] = [[left + 0.4, tear], [right + 0.6, tear], ...rightEdge.slice(1), ...bottomEdge.slice(1), ...leftEdge.slice(1)];
	const holes = Array.from({ length: Math.floor((right - left - 16) / 8) }, (_, i) => {
		const x = left + 10 + i * 8;
		return outline(roundRect(x, tear - 1.1, x + 3.6, tear + 1.1, 1, 2), { w: 0.6, seed: 310 + i, over: 0.2, wobble: 0.15 });
	}).join('');
	const rnd = seeded(330);
	const rip: P[] = Array.from({ length: Math.floor((right - left) / 4.4) }, (_, i) => [right - 1 - i * 4.4, tear + (i % 2 ? 1.8 : -1.6) * (0.5 + rnd() * 0.7)]);
	return {
		paper: pathOf(paper, true),
		shadow: cast(paper, 320),
		ink:
			line(rightEdge, { w: 1.9, heavy: 0.8, seed: 321, over: 2 }) +
			line(leftEdge, { w: 1.2, seed: 322, over: 2 }) +
			line(bottomEdge, { w: 1.1, seed: 323, over: 0.5, wobble: 0.3 }),
		holes,
		notches: outline([[left - 2, tear - 3.5], [left + 3, tear], [left - 2, tear + 3.5]], { w: 0.9, seed: 324 }, false) + outline([[right + 3, tear - 3.5], [right - 2, tear], [right + 3, tear + 3.5]], { w: 0.9, seed: 325 }, false),
		tone: hatch([[left + 2, bottom - 18], [right - 2, bottom - 14], [right, bottom], [left, bottom]], -0.15, 2.4, 326, { cluster: 4, trim: 0.4, skip: 0.3 }),
		rip: { d: pathOf(rip), length: r1(lengthOf(rip) + 1) },
	};
}

/** The whole slip, frozen into order-slip.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		tear: SLIP.tear,
		body: bodyArt(),
		stamps: STAMP.turns.map((_, key) => stampArt(key)),
		stub: stubArt(),
		scissors: scissors(0, 0),
	};
}
