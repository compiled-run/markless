// Brief (passes the figure-research checklist: 2 objects, each maps to code, words are only code values).
// Believe: the bracket in a file name is a blank the address fills.
// Objects: the slip is the URL "/blog/hello"; the card is the file "blog/[slug]", whose name never changes.
// Action and change: drop the slip on the card; "hello" is pencilled into the blank. Off the card, the pencil rubs out.
// Prevents: "a [slug] file is a literal name", or "the value lives in the file".
import { createScene, type P, roundRect } from '../ink/scene.ts';
import { matrixOf } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, r1, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

const CARD = { u0: 0.5, u1: 20, v0: 1.5, v1: 14 };
const SLIP = { u0: 12.2, u1: 24.6, v0: -1.6, v1: 1.9, lift: 0.2 };
/** Where the slip starts before it is dropped, in desk centimetres from where it lands. */
const FROM = { du: 4, dv: -4, lift: 2.4 };

const desk = (u: number, v: number, lift = 0): [number, number, number] => [u - 1.6, v - 8.8, 0.02 + lift];

const scene = createScene({
	width: WIDTH,
	height: HEIGHT,
	extra: [desk(SLIP.u1 + FROM.du, SLIP.v0 + FROM.dv, FROM.lift), desk(SLIP.u1 + FROM.du, SLIP.v1 + FROM.dv, FROM.lift)],
	target: [10.4, -2.4, 0.4],
	elevation: 64,
});
const { proj } = scene;
const at = (u: number, v: number, lift = 0) => matrixOf(proj(desk(u, v, lift)), proj(desk(u + 0.1, v, lift)), proj(desk(u, v + 0.1, lift)));
const flat = (pts: P[], lift = 0): P[] => pts.map(([u, v]) => proj(desk(u, v, lift)));

/** The catalogue card lying on the desk: ruled, its name written in ink, and the blank where the address writes. */
function cardArt() {
	const { u0, u1, v0, v1 } = CARD;
	const poly = flat([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
	const shadow = flat([[u0 + 0.3, v1], [u1 + 0.35, v1], [u1 + 0.35, v0 + 0.3], [u1, v0 + 0.3], [u1, v1 - 0.05], [u0 + 0.3, v1 - 0.05]]);
	const rules = [10.6, 12.4].map((v, i) => line(flat([[u0 + 0.8, v], [u1 - 0.8, v]]), { w: 0.5, seed: 5010 + i, over: 0 })).join('');
	const hole = flat(Array.from({ length: 16 }, (_, i) => [(u0 + u1) / 2 + Math.cos((i / 16) * Math.PI * 2) * 0.35, v1 - 0.6 + Math.sin((i / 16) * Math.PI * 2) * 0.3] as P));
	return {
		shadow: hatch(shadow, -0.6, 1.3, 5000, { cluster: 2, trim: 0.1 }),
		paper: pathOf(poly, true),
		ink: outline(poly, { w: 1.6, heavy: 1.3, seed: 5001 }) + outline(hole, { w: 0.8, seed: 5002 }),
		rules,
		redRule: line(flat([[u0 + 0.8, 5.0], [u1 - 0.8, 5.0]]), { w: 0.7, seed: 5020, over: 0.2 }),
		blank: line(flat([[6.2, 8.9], [17.8, 8.9]]), { w: 1.1, seed: 5030, over: 0.2 }),
		nameMatrix: at(u0 + 1.2, 4.2),
		pencilMatrix: at(7.6, 8.5),
		spot: wash(flat(roundRect(6.4, 6.5, 16.4, 9.4, 0.6)), 5040, 1, 3),
		box: { x0: r1(Math.min(...poly.map((p) => p[0]))), x1: r1(Math.max(...poly.map((p) => p[0]))), y0: r1(Math.min(...poly.map((p) => p[1]))), y1: r1(Math.max(...poly.map((p) => p[1]))) },
	};
}

/** The address slip, landed on the card's corner, and the screen offset it falls from. */
function slipArt() {
	const { u0, u1, v0, v1, lift } = SLIP;
	const poly = flat([[u0, v0], [u1, v0 + 0.3], [u1 - 0.1, v1 + 0.3], [u0 - 0.1, v1]], lift);
	const shadow = flat([[u0 + 0.3, v0 + 0.4], [u1 + 0.4, v0 + 0.7], [u1 + 0.3, v1 + 0.6], [u0 + 0.2, v1 + 0.3]]);
	const a = proj(desk((u0 + u1) / 2, (v0 + v1) / 2, lift));
	const b = proj(desk((u0 + u1) / 2 + FROM.du, (v0 + v1) / 2 + FROM.dv, FROM.lift));
	return {
		shadow: wash(shadow, 5100, 0.4, 1.4),
		paper: pathOf(poly, true),
		wash: wash(poly, 5101, 0.3, 1.2),
		ink: outline(poly, { w: 1.2, heavy: 0.9, seed: 5102 }),
		textMatrix: at(u0 + 1.0, v0 + 2.4, lift),
		from: `--from-x:${r1(b[0] - a[0])}px;--from-y:${r1(b[1] - a[1])}px`,
	};
}

/** The whole scene, frozen into catalogue.art.ts. */
export function drawing() {
	const under = flat([[CARD.u0 - 1, CARD.v1 + 0.6], [CARD.u1 + 3, CARD.v1 + 0.6], [CARD.u1 + 3, CARD.v1 + 2.4], [CARD.u0 - 1, CARD.v1 + 2.4]]);
	return {
		width: WIDTH,
		height: HEIGHT,
		desk: hatch(under, -0.5, 2.6, 5200, { cluster: 5, skip: 0.35, trim: 0.55 }),
		card: cardArt(),
		slip: slipArt(),
		pencil: pathOf(flat([[CARD.u0 - 1.4, CARD.v0], [CARD.u1 + 2, CARD.v0]])) + pathOf(flat([[CARD.u0, CARD.v0 - 1.2], [CARD.u0, CARD.v1 + 1.6]])),
	};
}
