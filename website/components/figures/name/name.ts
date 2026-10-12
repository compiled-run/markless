// A sheet of plain order code on a desk, first buried under red framework marks (tabs, a rule card, a sticky, pencil circles, each with its cost, under an "other tools" heading), then erased clean and signed "Markless".
import { add3, mul3 } from '../kit/lathe.ts';
import { centreOf, createCamera, ellipse, matrixOf, type P, type Point3, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, lengthOf, line, outline, pathOf, pool, r1, resample, seeded, stroke, wash } from '../ink/ink.ts';
import { barbs, deskPlane, pencil } from '../ink/plane.ts';
import { BANNER, BANNER_FS, CLEAN_NOTE, CODE, CODE_FS, colsOf, columnOf, DEPS, DEPS_COST, FILE, FLAG_FS, FLAGS, NAME, NAME_FS, NOTE_FS, PEEL, RULE_CARD, type Side, stopWindow, WRITE } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 392;

/** Local sheet units per world unit; all page layout below is in local units, the sheet's top-left at 0 0. */
const L = 10;
const SW = 340;
const SH = 236;
const TURN = -0.025;
const LIFT = 0.04;

/** Code type: size, column, where the first line's baseline sits and the line pitch. */
const COL = CODE_FS * 0.6;
const CODE_X = 26;
const ROW0 = 104;
const PITCH = 26;
const FLAG_COL = FLAG_FS * 0.6;
const NAME_Y = 64;

const ERASER_AT: P = [424, 36];
const ERASER = { long: 64, wide: 26, tall: 17, turn: 0.42 };

const sheet = deskPlane(() => [0, 0], [0, 0], SW / L, SH / L, TURN, LIFT);
const world = (x: number, y: number, lift = 0): Point3 => sheet.at(x / L, y / L, lift);

const deskAt = (x: number, y: number, z = 0): Point3 => {
	const p = world(x, y);
	return [p[0], p[1], z];
};

const { proj } = createCamera({
	width: WIDTH,
	height: HEIGHT,
	view: { azimuth: 95, elevation: 57, distance: 74, target: world(SW / 2 + 20, SH / 2 + 10) },
	bounds: [world(-72, -40), world(SW + 74, -40), world(SW + 74, SH + 32), world(-72, SH + 24), deskAt(ERASER_AT[0] + 36, ERASER_AT[1] - 18), shadowOnDesk(world(SW, SH, 1.1))],
	pad: 4,
});

const S = (x: number, y: number, lift = LIFT): P => proj(world(x, y, lift - LIFT));
const onS = (pts: P[], lift = LIFT) => pts.map(([x, y]) => S(x, y, lift));
/** An SVG matrix whose local unit is one sheet unit, at (x, y), turned by `angle` on the sheet. */
const matrixAt = (x: number, y: number, angle = 0, lift = LIFT) => matrixOf(S(x, y, lift), S(x + Math.cos(angle), y + Math.sin(angle), lift), S(x - Math.sin(angle), y + Math.cos(angle), lift));
const turned = (pts: P[], about: P, angle: number): P[] =>
	pts.map(([x, y]) => {
		const dx = x - about[0];
		const dy = y - about[1];
		return [about[0] + dx * Math.cos(angle) - dy * Math.sin(angle), about[1] + dx * Math.sin(angle) + dy * Math.cos(angle)];
	});
/** The shadow a flat shape held `z` world units above the sheet throws onto it. */
const castFrom = (pts: P[], z: number) => pts.map(([x, y]) => proj(shadowOnDesk(world(x, y, z), 0)));

const baseline = (row: number) => ROW0 + row * PITCH;
/** Narrow screens enlarge the hand lettering about this screen point, so it grows away from the code. */
const originOf = ([x, y]: P) => `transform-origin:${r1(x)}px ${r1(y)}px`;

type Anchor = 'start' | 'end';
/** Red hand lettering on the desk beside a mark, one line per entry, saying what the mark makes you do. */
const noteAt = (lines: readonly string[], x: number, y: number, anchor: Anchor, angle = -0.04, grow: Anchor = anchor) => ({
	anchor,
	at: [x, y] as P,
	/** Enlarged about its top, at the end nearer the frame edge, so narrow screens grow it away from its mark and never out of the figure. */
	style: originOf(S(x + (grow === anchor ? 0 : (anchor === 'end' ? -1 : 1) * Math.max(...lines.map((l) => l.length)) * NOTE_FS * 0.52), y - NOTE_FS * 0.8, 0)),
	lines: lines.map((text, key) => {
		const [px, py] = turned([[x, y + key * (NOTE_FS + 3)]], [x, y], angle)[0]!;
		return { key, text, m: matrixAt(px, py, angle, 0) };
	}),
});
const colX = (col: number) => CODE_X + col * COL;

function sheetArt() {
	const corners: P[] = roundRect(0, 0, SW, SH, 1.6, 2);
	const edge = onS(corners);
	const centre = centreOf(edge);
	const square: P[] = [[0, 0], [SW, 0], [SW, SH], [0, SH]];
	const [, tr, br, bl] = onS(square);
	/** The L-shaped strip of desk the lifted sheet shades: down its right edge and along its bottom. */
	const shade = (z: number) => {
		const [, tr2, br2, bl2] = castFrom(square, z);
		return [tr!, tr2!, br2!, bl2!, bl!, br!];
	};
	const far = shade(1.7);
	const mid = shade(0.9);
	const near = shade(0.32);
	const tooth = onS([[SW * 0.55, SH * 0.9], [SW, SH * 0.72], [SW, SH], [SW * 0.45, SH]]);
	return {
		paper: pathOf(edge, true),
		edge: outline(edge, { w: 2, heavy: 1.8, centre, seed: 101 }),
		shadow: {
			wash: wash(mid, 110, 0.4, 1.5),
			far: hatch(far, -0.5, 3.1, 111, { cluster: 5, skip: 0.3, trim: 0.5 }),
			mid: hatch(mid, 0.55, 2.1, 112, { cluster: 4, skip: 0.18, trim: 0.35 }),
			near: hatch(near, -1.15, 1.35, 113, { cluster: 3, skip: 0.08 }) + hatch(near, 0.2, 1.5, 114, { cluster: 3, skip: 0.12 }),
		},
		tone: hatch(tooth, 0.62, 4.6, 120, { cluster: 4, skip: 0.62, trim: 0.6 }),
		pencil: [
			pencil(onS([[-22, 0], [SW + 22, 0]]), 130),
			pencil(onS([[SW, -18], [SW, SH + 18]]), 131),
			pencil(onS([[-18, SH], [SW + 18, SH]]), 132),
			pencil(onS([[CODE_X - 6, 10], [CODE_X - 6, SH - 8]]), 133),
			pencil(onS([[60, NAME_Y + 2], [SW - 30, NAME_Y - 6]]), 134),
		].join(''),
	};
}

function codeArt() {
	const tokens = CODE.flatMap((row, r) => {
		let col = 0;
		return row.map(([text, tone]) => {
			const lead = text.length - text.trimStart().length;
			const at = col + lead;
			col += colsOf(text);
			return { text: text.trim(), tone, x: colX(at), y: baseline(r) };
		});
	})
		.filter((t) => t.text)
		.map((t, key) => ({ key, text: t.text, tone: t.tone, m: matrixAt(t.x, t.y) }));
	return { tokens, file: { text: FILE, m: matrixAt(CODE_X, 30) } };
}

/** One sticky tab: its tape half on the sheet, its paper half off the edge, the mark written on it, and where it pulls from. */
function flagArt(flag: (typeof FLAGS)[number], key: number) {
	const rnd = seeded(300 + key * 17);
	const label = colsOf(flag.label) * FLAG_COL;
	const out = label + 18;
	const grip = 22;
	const high = 18;
	const angle = (rnd() - 0.5) * 0.12;
	let tape: P[];
	let tab: P[];
	let glue: P;
	let text: P;
	let towards: P;
	let cost: ReturnType<typeof noteAt>;
	if (flag.side === 'top') {
		const x0 = colX(columnOf(flag.row, flag.at!)) - 4;
		const w = Math.max(label + 16, 44);
		glue = [x0 + w / 2, 14];
		tape = [[x0, 0], [x0 + w, 0], [x0 + w, 14], [x0, 14]];
		tab = [[x0, -30], [x0 + w, -30], [x0 + w, 0], [x0, 0]];
		text = [x0 + (w - label) / 2, -10];
		towards = [10, -46];
		cost = noteAt(flag.cost, x0 - 6, -4, 'end');
	} else {
		const yc = baseline(flag.row) - 5;
		const left = flag.side === 'left';
		const edge = left ? 0 : SW;
		const s = left ? -1 : 1;
		glue = [edge - s * grip, yc];
		tape = [[edge - s * grip, yc - high / 2], [edge, yc - high / 2], [edge, yc + high / 2], [edge - s * grip, yc + high / 2]];
		tab = [[edge, yc - high / 2], [edge + s * out, yc - high / 2], [edge + s * out, yc + high / 2], [edge, yc + high / 2]];
		text = [left ? edge - out + 9 : edge + 9, yc + 4.3];
		towards = [s * 52, -26 - rnd() * 14];
		cost = noteAt(flag.cost, left ? -5 : SW + 7, yc + high / 2 + NOTE_FS + 3, left ? 'end' : 'start', -0.04, left ? 'start' : 'end');
	}
	const t = (pts: P[]) => turned(pts, glue, angle);
	const tapePoly = onS(t(tape), LIFT + 0.02);
	const tabPoly = onS(t(roundRect(Math.min(...tab.map((p) => p[0])), Math.min(...tab.map((p) => p[1])), Math.max(...tab.map((p) => p[0])), Math.max(...tab.map((p) => p[1])), 2, 2)), LIFT + 0.03);
	const shadow = hull([...tabPoly, ...castFrom(t(tab), 0.28)]);
	const [tx, ty] = turned([text], glue, angle)[0]!;
	const pivot = S(glue[0], glue[1]);
	return {
		key,
		label: flag.label,
		side: flag.side as Side,
		shadow: hatch(shadow, -0.6, 1.5, 320 + key, { cluster: 3, skip: 0.2 }),
		tab: pathOf(tabPoly, true),
		tape: pathOf(tapePoly, true),
		tapeTone: hatch(tapePoly, 1.1, 1.8, 330 + key, { cluster: 3, skip: 0.25, trim: 0.3 }),
		ink: outline(tabPoly, { w: 1, seed: 340 + key }) + outline(tapePoly, { w: 0.55, seed: 345 + key }),
		m: matrixAt(tx, ty, angle, LIFT + 0.03),
		cost,
		peel: peelOf(pivot, towards, (rnd() - 0.5) * 50 + (flag.side === 'left' ? -14 : 14), PEEL.from + key * PEEL.step),
	};
}

/** Where a peeled mark flies: its glued point on screen, how far it goes, how far it turns, and when. */
const peelOf = ([ox, oy]: P, [dx, dy]: P, turn: number, delay: number) => ({ style: `transform-origin:${r1(ox)}px ${r1(oy)}px;--px:${r1(dx)}px;--py:${r1(dy)}px;--pr:${r1(turn)}deg;--d:${delay}ms` });

function cardArt() {
	const box: P[] = roundRect(226, 12, 350, 66, 1.5, 2);
	const angle = -0.06;
	const about = centreOf(box);
	const card = onS(turned(box, about, angle), LIFT + 0.05);
	const tapeLocal = turned(roundRect(214, 6, 246, 18, 0.6, 1), [230, 12], -0.62);
	const tape = onS(turned(tapeLocal, about, angle), LIFT + 0.07);
	const at = (x: number, y: number) => {
		const [px, py] = turned([[x, y]], about, angle)[0]!;
		return matrixAt(px, py, angle, LIFT + 0.05);
	};
	return {
		shadow: hatch(hull([...card, ...castFrom(turned(box, about, angle), 0.22)]), -0.55, 1.5, 360, { cluster: 3, skip: 0.15 }),
		paper: pathOf(card, true),
		rule: line(onS(turned([[234, 26], [342, 26]], about, angle), LIFT + 0.05), { w: 0.45, seed: 361, over: 0 }),
		ink: outline(card, { w: 1.1, heavy: 0.8, seed: 362 }),
		tape: pathOf(tape, true),
		tapeTone: hatch(tape, 0.9, 1.6, 363, { cluster: 3, skip: 0.2 }),
		tapeInk: outline(tape, { w: 0.5, seed: 364 }),
		lines: [
			{ key: 0, text: RULE_CARD[0], m: at(234, 23) },
			{ key: 1, text: RULE_CARD[1], m: at(234, 52) },
		],
		peel: peelOf(S(230, 12), [44, -40], 18, PEEL.from + FLAGS.length * PEEL.step),
	};
}

function stickyArt() {
	const box: P[] = [[308, 202], [386, 202], [386, 260], [308, 266]];
	const angle = 0.07;
	const about = centreOf(box);
	const note = onS(turned(roundRect(308, 202, 386, 264, 1, 2), about, angle), LIFT + 0.04);
	const curl = onS(turned([[308, 252], [386, 246], [386, 264], [308, 264]], about, angle), LIFT + 0.04);
	const [tx, ty] = turned([[319, 238]], about, angle)[0]!;
	return {
		shadow: hatch(hull([...note, ...castFrom(turned(box, about, angle), 0.4)]), 0.6, 1.4, 370, { cluster: 3, skip: 0.1 }),
		paper: pathOf(note, true),
		curl: hatch(curl, -0.2, 1.6, 371, { cluster: 3, skip: 0.2, trim: 0.3 }),
		ink: outline(note, { w: 1.1, heavy: 1, seed: 372 }) + line(onS(turned([[308, 252], [386, 246]], about, angle), LIFT + 0.04), { w: 0.5, seed: 373, over: 0.5 }),
		text: DEPS,
		m: matrixAt(tx, ty, angle, LIFT + 0.04),
		cost: noteAt([DEPS_COST], 300, SH + 24, 'end', -0.06),
		peel: peelOf(S(347, 204), [36, 30], 22, PEEL.from + (FLAGS.length + 1) * PEEL.step),
	};
}

/** A pencil line drawn as a plain centre path, so it can be rubbed out from one end. */
const scribble = (pts: P[], seed: number, jit = 0.9) => {
	const rnd = seeded(seed);
	const screen = resample(pts, 1.2).map(([x, y], i) => [x + Math.sin(i * 0.31 + rnd() * 6) * jit * 0.4, y + Math.cos(i * 0.23) * jit * 0.3] as P);
	return { d: pathOf(screen), length: r1(lengthOf(screen) + 2) };
};
/** Two loose loops round a run of code, not quite closing. */
const loopRound = (x0: number, x1: number, row: number, seed: number) => {
	const cx = (x0 + x1) / 2;
	const cy = baseline(row) - 5;
	const rx = (x1 - x0) / 2 + 6;
	const pts: P[] = [];
	for (let i = 0; i <= 70; i++) {
		const a = -2.6 + (i / 70) * Math.PI * 2.25;
		const grow = 1 + (i / 70) * 0.08;
		pts.push([cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * 11.5 * grow]);
	}
	return scribble(onS(pts), seed);
};
const arrowOf = (pts: P[], seed: number) => {
	const path = onS(pts);
	const curve = resample(path, 1.5);
	const head = barbs(curve, 6, 0.5).map((b) => pathOf(b)).join('');
	const body = scribble(curve, seed);
	return { d: body.d + head, length: r1(body.length + 14) };
};

/** The pencil marks, grouped by the eraser stop that rubs them out. */
function scribbleArt() {
	const read = columnOf(1, '{status}');
	const call = columnOf(2, 'onClick');
	const write = columnOf(3, 'status');
	const make = columnOf(0, 'state');
	const stops = [
		[loopRound(colX(read), colX(read + 8), 1, 400), arrowOf([[SW - 24, baseline(1) - 5], [300, baseline(1) + 9], [colX(read + 13), baseline(1) + 10], [colX(read + 7), baseline(1) + 7]], 401)],
		[scribble(onS(Array.from({ length: 30 }, (_, i) => [colX(call) - 2 + (i / 29) * (7 * COL + 4), baseline(2) + 4 + Math.sin(i * 1.3) * 1.6] as P)), 410)],
		[loopRound(colX(write), colX(write + 6), 3, 420), arrowOf([[20, baseline(3) - 4], [26, baseline(3) - 1], [colX(write) - 9, baseline(3) - 4]], 421)],
		[loopRound(colX(make), colX(make + 5), 0, 430), arrowOf([[232, 70], [214, 76], [colX(make + 5) + 10, baseline(0) - 17]], 431)],
	];
	const centres: P[] = [
		S(colX(read + 4), baseline(1) - 5),
		S(colX(call + 3.5), baseline(2) + 4),
		S(colX(write + 2), baseline(3) - 5),
		S(colX(make + 3), baseline(0) - 9),
	];
	return {
		stops: stops.map((marks, i) => ({ key: i, marks: marks.map((m, k) => ({ key: k, ...m, ...stopWindow(i) })) })),
		centres,
	};
}

/** A pink rubber eraser in a paper sleeve, resting on the desk; `contact` is its worn end, the point that rubs the page. */
function eraserArt(centres: P[]) {
	const { long, wide, tall, turn } = ERASER;
	const ax: Point3 = [Math.cos(turn), Math.sin(turn), 0];
	const ay: Point3 = [-Math.sin(turn), Math.cos(turn), 0];
	const base = deskAt(ERASER_AT[0], ERASER_AT[1]);
	const at = (u: number, v: number, z: number): Point3 => add3(add3(base, mul3(ax, u / L)), add3(mul3(ay, v / L), [0, 0, z / L]));
	const box = (u0: number, u1: number, grow = 0) => {
		const ring = roundRect(u0, -wide / 2 - grow, u1, wide / 2 + grow, 2.5, 2);
		return { top: ring.map(([u, v]) => proj(at(u, v, tall + grow))), bottom: ring.map(([u, v]) => proj(at(u, v, 0))) };
	};
	const whole = box(-long / 2, long / 2);
	const silhouette = hull([...whole.top, ...whole.bottom]);
	const sleeve = box(-long / 2 + 16, long / 2 - 4, 0.6);
	const sleeveSil = hull([...sleeve.top, ...sleeve.bottom]);
	const castRing = roundRect(-long / 2, -wide / 2, long / 2, wide / 2, 2.5, 2).map(([u, v]) => proj(shadowOnDesk(at(u, v, tall))));
	const cast = hull([...whole.bottom, ...castRing]);
	const sideFaces = hull([...whole.bottom, ...whole.top.filter((p) => p[1] > centreOf(whole.top)[1])]);
	const contact = proj(at(-long / 2, 0, 0));
	const rnd = seeded(520);
	const crumbs = centres.flatMap((c, stop) =>
		Array.from({ length: 6 }, (_, k) => {
			const x = c[0] + (rnd() - 0.5) * 30;
			const y = c[1] + (rnd() - 0.3) * 14;
			const r = 1.2 + rnd() * 1.4;
			const a = rnd() * Math.PI;
			const bit: P[] = [[x - Math.cos(a) * r * 1.6, y - Math.sin(a) * r], [x, y + r * 0.6], [x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r]];
			const w = stopWindow(stop);
			const delay = Math.round(w.from + rnd() * (w.to - w.from));
			return { key: stop * 6 + k, d: stroke(bit, { w: 2.2, seed: 530 + stop * 6 + k, over: 0.2, wobble: 0.3 }), style: `--d:${delay}ms;--bx:${r1(30 + rnd() * 70)}px;--by:${r1(8 + rnd() * 36)}px;--br:${Math.round((rnd() - 0.5) * 300)}deg` };
		}),
	);
	return {
		cast: hatch(cast, -0.5, 1.4, 500, { cluster: 3, skip: 0.1 }) + hatch(cast, 0.6, 2, 501, { cluster: 3, skip: 0.2 }),
		rubber: pathOf(silhouette, true),
		side: hatch(sideFaces, 1.2, 1.5, 502, { cluster: 4, skip: 0.15, trim: 0.25 }),
		sleeve: pathOf(sleeveSil, true),
		sleeveTone: hatch(hull([...sleeve.bottom, ...sleeve.top.filter((p) => p[1] > centreOf(sleeve.top)[1])]), 1.25, 1.6, 503, { cluster: 4, skip: 0.2 }),
		ink:
			outline(silhouette, { w: 1.5, heavy: 1.4, centre: centreOf(silhouette), seed: 504 }) +
			outline(whole.top, { w: 0.8, seed: 505 }) +
			outline(sleeveSil, { w: 1.1, seed: 506 }) +
			line([sleeve.top[0]!, sleeve.top[Math.floor(sleeve.top.length / 2)]!], { w: 0.4, seed: 507 }),
		style: centres.map((c, i) => `--s${i}x:${r1(c[0] - contact[0])}px;--s${i}y:${r1(c[1] - contact[1])}px`).join(';'),
		stops: centres.map((c) => [r1(c[0] - contact[0]), r1(c[1] - contact[1])] as P),
		crumbs,
	};
}

const BANNER_AT: P = [-80, -64];
/** Measured widths of the banner lines in Shantell Sans 800, in ems. */
const BANNER_EMS = [6.22, 13.31];
/** The red heading on the desk above the marked-up sheet, with a frown doodled after it; once clean, a green tick and "just your code" in its place. */
function bannerArt() {
	const angle = -0.035;
	const [x, y] = BANNER_AT;
	const at = (dx: number, dy: number, lift = 0) => {
		const [px, py] = turned([[x + dx, y + dy]], [x, y], angle)[0]!;
		return { p: [px, py] as P, m: matrixAt(px, py, angle, lift) };
	};
	const lead = BANNER_FS + 4;
	const lines = BANNER.map((text, key) => ({ key, text, m: at(0, key * lead).m }));
	const face = at(BANNER_EMS[0]! * BANNER_FS + 14, -6).p;
	const r = 8;
	const ring = Array.from({ length: 44 }, (_, i) => {
		const a = -1.2 + (i / 43) * Math.PI * 2.15;
		return [face[0] + Math.cos(a) * r, face[1] + Math.sin(a) * r * 0.92] as P;
	});
	const frown = Array.from({ length: 12 }, (_, i) => {
		const a = Math.PI * (1.2 + (i / 11) * 0.6);
		return [face[0] + Math.cos(a) * 3.6, face[1] + 4.6 + Math.sin(a) * 2.2] as P;
	});
	const eye = (dx: number): P[] => [[face[0] + dx, face[1] - 3], [face[0] + dx + 0.3, face[1] - 1.2]];
	const under = Array.from({ length: 40 }, (_, i) => at(-2 + (i / 39) * (BANNER_EMS[1]! * BANNER_FS + 6), lead + 5 + Math.sin(i * 0.9) * 1.2).p);
	const doodle = [scribble(onS(under, 0), 704, 0.4), scribble(onS(ring, 0), 700), scribble(onS(frown, 0), 701, 0.4), scribble(onS(eye(-2.6), 0), 702, 0.1), scribble(onS(eye(2.4), 0), 703, 0.1)].map((d) => d.d).join('');
	const tickAt = at(4, 12).p;
	const tick: P[] = [[tickAt[0], tickAt[1] - 5], [tickAt[0] + 4, tickAt[1]], [tickAt[0] + 13, tickAt[1] - 13]];
	return {
		lines,
		doodle,
		style: originOf(S(...at(0, 8).p, 0)),
		fade: PEEL.from + (FLAGS.length + 1) * PEEL.step + PEEL.length,
		clean: { text: CLEAN_NOTE, m: at(22, 12).m, tick: scribble(onS(tick, 0), 710, 0.3).d },
	};
}

/** Measured advances of Shantell Sans, in ems, for the name written across the top. */
const ADVANCE: Record<string, number> = { M: 1.03, a: 0.68, r: 0.54, k: 0.65, l: 0.35, e: 0.6, s: 0.53 };

/** The barista's hand writes the name across the clean sheet, a letter at a time, a little uphill. */
function nameArt() {
	const rnd = seeded(600);
	const width = [...NAME].reduce((w, ch) => w + (ADVANCE[ch] ?? 0.6) * NAME_FS, 0);
	const x0 = SW / 2 + 12 - width / 2;
	let x = x0;
	const glyphs = [...NAME].map((ch, key) => {
		const adv = (ADVANCE[ch] ?? 0.6) * NAME_FS;
		const y = NAME_Y - (x - x0) * 0.035 + (rnd() - 0.5) * 1.6;
		const m = matrixAt(x, y, -0.035 + (rnd() - 0.5) * 0.03);
		x += adv;
		return { key, ch, m, delay: WRITE.from + key * WRITE.step };
	});
	const spot = onS(ellipse(x0 + width / 2, NAME_Y - 11 - width * 0.017, width / 2 + 8, NAME_FS * 0.42, 30).map(([x, y]) => [x, y + (x - x0) * -0.035] as P));
	return {
		glyphs,
		spot: { wash: wash(spot, 610, 1.2, 3.2), pool: wash(pool(spot, [spot[2]![0] - 20, spot[2]![1] - 6], 0.5), 611, 0.5, 2), edge: wash(spot, 612, 0.4, 2.6) },
		washDelay: WRITE.from + NAME.length * WRITE.step + 250,
	};
}

/** The whole scene, frozen into name.art.ts. */
export function drawing() {
	const scribbles = scribbleArt();
	return {
		width: WIDTH,
		height: HEIGHT,
		sheet: sheetArt(),
		code: codeArt(),
		flags: FLAGS.map(flagArt),
		card: cardArt(),
		sticky: stickyArt(),
		scribbles: { stops: scribbles.stops },
		eraser: eraserArt(scribbles.centres),
		name: nameArt(),
		banner: bannerArt(),
	};
}
