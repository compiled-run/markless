// Two objects on the desk: a stencil card with BAGS cut through it, and a paint pot tagged bags whose paint shows through the letters.
import { createScene, type P, type Point3, roundRect, sheetAt } from '../ink/scene.ts';
import { centreOf, jitter, matrixOf, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, r1, resample, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 360;

/** The stencil card lying on the desk, in desk centimetres, and its turn. */
const CARD = { u: 0.4, v: 1.4, w: 19.6, h: 10.6, turn: -0.035 };
const LIFT = 0.18;
/** The paint pot standing on the desk: its centre, radius and height. */
const POT = { u: 23.6, v: 10.2, r: 2.9, h: 4.2 };

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [sheetAt(POT.u + POT.r + 1, POT.v + POT.r, 0), sheetAt(POT.u, POT.v - POT.r, POT.h + 1)],
	target: [11.6, -2.4, 0.6],
});
const { proj, onSheet } = scene;

function cardAt(x: number, y: number): P {
	const c = Math.cos(CARD.turn);
	const s = Math.sin(CARD.turn);
	return [CARD.u + x * c - y * s, CARD.v + x * s + y * c];
}
const onCard = (pts: P[], lift = LIFT): P[] => onSheet(pts.map(([x, y]) => cardAt(x, y)), lift);
const cardMatrix = (x: number, y: number, lift = LIFT) => {
	const at = (a: number, b: number) => {
		const [u, v] = cardAt(a, b);
		return proj(sheetAt(u, v, lift));
	};
	return matrixOf(at(x, y), at(x + 0.1, y), at(x, y + 0.1));
};

/** The stencil: a stiff card with its cast shadow, card grain and a heavy edge. Cut once; nothing about it ever changes. */
function cardArt() {
	const { w, h } = CARD;
	const edge: P[] = roundRect(0, 0, w, h, 0.35);
	const body = onCard(edge);
	const under: Point3[] = edge.map(([x, y]) => {
		const [u, v] = cardAt(x, y);
		return shadowOnDesk(sheetAt(u, v, LIFT));
	});
	const cast = hull([...onCard(edge, 0), ...under.map(proj)]);
	const shade = onCard([[w - 1.6, 0.2], [w - 0.2, 0.2], [w - 0.2, h - 0.2], [w - 1.6, h - 0.2]]);
	return {
		cast: wash(cast, 3200, 1.2, 2.5),
		castHatch: hatch(cast, -0.6, 1.7, 3201, { cluster: 4, skip: 0.3, trim: 0.4 }),
		paper: pathOf(body, true),
		grain: hatch(body, 1.15, 3.2, 3202, { cluster: 4, skip: 0.45, trim: 0.55 }),
		shade: hatch(shade, 1.2, 1.4, 3203, { cluster: 3, skip: 0.2, trim: 0.3 }),
		ink: outline(body, { w: 1.6, heavy: 1.3, centre: centreOf(body), seed: 3204 }),
		lettersMatrix: cardMatrix(1.5, 6.6, 0.02),
		nameMatrix: cardMatrix(1.7, 9.4),
	};
}

/** A ring around the pot's axis at height z, as screen points. */
function ring(z: number, r: number, n = 36): P[] {
	const c = sheetAt(POT.u, POT.v, 0);
	return Array.from({ length: n }, (_, i) => {
		const a = (i / n) * Math.PI * 2;
		return proj([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, z]);
	});
}

/** The paint pot: a tin with a rolled rim, the paint inside, a wire handle and a paper tag. */
function potArt() {
	const { r, h } = POT;
	const top = ring(h, r);
	const bottom = ring(0, r);
	const inner = ring(h - 0.15, r * 0.86);
	const sil = hull([...top, ...bottom]);
	const c = sheetAt(POT.u, POT.v, 0);
	const castPts = [0, h].flatMap((z) =>
		Array.from({ length: 24 }, (_, i) => {
			const a = (i / 24) * Math.PI * 2;
			return proj(shadowOnDesk([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, z]));
		}),
	);
	const cast = hull(castPts);
	const front = bottom.filter((p) => p[1] >= centreOf(bottom)[1] - 1);
	const shadeSide = hull([...ring(h, r).slice(0, 12), ...ring(0, r).slice(0, 12)]);
	const bands = [h * 0.35, h * 0.7].map((z, i) => line(ring(z, r).filter((p) => p[1] >= centreOf(ring(z, r))[1] - 1), { w: 0.6, seed: 3320 + i, over: 0 })).join('');
	const label = hull([...ring(h * 0.62, r, 60).slice(8, 22), ...ring(h * 0.2, r, 60).slice(8, 22)]);
	const tagC = proj([c[0] + r * 0.2, c[1] + r * 0.98, h * 0.42]);
	const drip = stroke(resample([proj([c[0] - r * 0.3, c[1] + r * 0.95, h]), proj([c[0] - r * 0.32, c[1] + r * 0.96, h * 0.72])], 2), { w: 2.2, seed: 3330, over: 0 });
	return {
		cast: wash(cast, 3300, 1.2, 2),
		castHatch: hatch(cast, -0.6, 1.5, 3301, { cluster: 3, skip: 0.2, trim: 0.3 }),
		body: pathOf(sil, true),
		shade: hatch(shadeSide, 1.4, 1.5, 3302, { cluster: 3, skip: 0.25, trim: 0.3 }),
		paint: pathOf(inner, true),
		paintPool: wash(inner, 3303, 0.3, 1),
		drip,
		ink: outline(sil, { w: 1.6, heavy: 1.2, centre: centreOf(sil), seed: 3304 }) + outline(top, { w: 1.1, seed: 3305 }) + outline(inner, { w: 0.7, seed: 3306 }) + line(front, { w: 1.3, seed: 3307, over: 0 }) + bands,
		label: pathOf(label, true),
		labelInk: outline(label, { w: 0.7, seed: 3308 }),
		tagMatrix: `translate(${r1(tagC[0])} ${r1(tagC[1])})`,
		valueAt: (() => {
			const p = proj([c[0], c[1], h + 1.6]);
			return `translate(${r1(p[0])} ${r1(p[1])})`;
		})(),
		hit: pathOf(hull([...ring(h + 0.4, r + 0.4), ...ring(0, r + 0.4)]), true),
	};
}

/** Faint construction lines: the card's top and left edges run on, and the pot's axis. */
function pencil() {
	const c = sheetAt(POT.u, POT.v, 0);
	const runs: P[][] = [
		onSheet([cardAt(-1.6, 0), cardAt(CARD.w + 2.2, 0)]),
		onSheet([cardAt(0, -1.4), cardAt(0, CARD.h + 1.6)]),
		[proj([c[0], c[1], -0.6]), proj([c[0], c[1], POT.h + 1.2])],
	];
	return runs.map((run, i) => pathOf(jitter(resample(run, 9), 3400 + i, 0.8))).join('');
}

/** The whole scene, frozen into stencil.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		pencil: pencil(),
		card: cardArt(),
		pot: potArt(),
	};
}
