// The screen you wrote, Markless reading it, the plan it makes, and each device drawing that plan its own way, inked in perspective on one desk.
import { add3, dot3, mul3, sub3 } from '../kit/lathe.ts';
import { centreOf, createCamera, ellipse, type P, type Point3, roundRect, shadowOnDesk, TAU } from '../ink/desk.ts';
import { hatch, hull, lengthOf, line, outline, pathOf, pool, r1, resample, stroke, wash } from '../ink/ink.ts';
import { barbs, deskPlane, pencil, plane, type Plane } from '../ink/plane.ts';
import { ADAPTER_NOTE, DEVICES, FINDINGS, PLAN_NOTE, WROTE } from './model.ts';

type Tier = 'source' | 'native' | 'wanted';
interface Flat {
	c: P;
	w: number;
	h: number;
	turn: number;
}
interface Laptop {
	c: P;
	w: number;
	d: number;
	lid: number;
	lean: number;
	turn: number;
}
interface Arrow {
	/** Corners of the arrow's run on the desk; the last leg is the clear stretch its word sits above. */
	run: Point3[];
	/** Sideways nudge of the word along that stretch, in screen units. */
	across?: number;
	/** Set when the last leg runs down: the words sit beside it, this far to the right. */
	beside?: number;
	/** Set when the words sit at a fixed spot on the desk instead of over the last leg. */
	at?: Point3;
}
interface Fonts {
	finding: number;
	press: number;
	name: number;
	caption: number;
}
interface Spec {
	key: string;
	width: number;
	elevation: number;
	fonts: Fonts;
	card: Flat;
	glass: { at: P; r: number; handle: number };
	findings: { at: Point3; to: P; via?: P }[];
	plan: Flat;
	browser: Flat;
	iphone: Flat;
	mac: Laptop;
	slot: Flat;
	arrows: Record<string, Arrow>;
	/** Sideways shift of the plan's caption, in screen units. */
	captionShift?: number;
	/** Set when the plan's caption sits above the plan instead of under it. */
	captionAbove?: boolean;
}

/** The order card in its own units; the devices show only the cup, the status and the button. */
export const CARD = { w: 44, h: 64, spot: [16.5, 30.6, 15, 6.2], button: [4, 40, 40, 49.5], rule: 15.5, tag: [3.2, 53.6, 40.8, 61.2], leader: [22, 49.8, 53.4] } as const;
/** A device screen in its own units, wide like the landscape screens it sits on. */
const SCREEN = { w: 72, h: 36, cup: [4, 13, 0.85], spot: [41.5, 18.8, 23, 8.6], button: [25, 28.6, 58, 34.2] } as const;

const FONTS: Fonts = { finding: 15, press: 16, name: 13.5, caption: 13.4 };
const glyph = { finding: 0.58, press: 0.52, name: 0.78, caption: 0.54 } as const;

const WIDE: Spec = {
	key: 'wide',
	width: 680,
	elevation: 54,
	fonts: FONTS,
	card: { c: [-13.3, -11.5], w: 10.4, h: 15.13, turn: -0.05 },
	glass: { at: [46.5, 52], r: 1.8, handle: -0.5 },
	findings: [
		{ at: [-17.8, -2.4, 0], to: [6, 47], via: [-1.5, 58] },
		{ at: [-3.6, -17.4, 0], to: [36, 31], via: [53, 30] },
		{ at: [-8.8, -0.9, 0], to: [37, 47], via: [46, 58] },
	],
	plan: { c: [-6, 5], w: 10.8, h: 8.28, turn: 0.03 },
	browser: { c: [14.5, -16.6], w: 10.5, h: 7, turn: 0.03 },
	mac: { c: [14.5, -1.4], w: 10, d: 4.8, lid: 5.6, lean: 0.3, turn: -0.03 },
	iphone: { c: [14.5, 7], w: 10, h: 5, turn: 0.03 },
	slot: { c: [4.5, 13.3], w: 9.5, h: 4.4, turn: -0.03 },
	arrows: {
		browser: { run: [[-0.6, 1.6, 0], [0.8, 1.6, 0], [0.8, -16.6, 0], [9.1, -16.6, 0]] },
		mac: { run: [[-0.6, 3.4, 0], [2.2, 3.4, 0], [2.2, -1.4, 0], [9.3, -1.4, 0]] },
		iphone: { run: [[-0.6, 7, 0], [9.3, 7, 0]] },
		slot: { run: [[-0.6, 8.6, 0], [2.6, 8.6, 0], [2.6, 10.9, 0]], beside: 10 },
	},
	captionShift: -24,
};

const TALL: Spec = {
	key: 'tall',
	width: 360,
	elevation: 56,
	fonts: FONTS,
	card: { c: [-3.6, -37.5], w: 13.2, h: 19.2, turn: -0.04 },
	glass: { at: [46.5, 52], r: 1.8, handle: -0.5 },
	findings: [
		{ at: [-7.6, -25.4, 0], to: [6, 47], via: [-1.5, 58] },
		{ at: [4.6, -48.8, 0], to: [36, 31], via: [57, 22] },
		{ at: [-3.6, -23.4, 0], to: [37, 47], via: [46, 58] },
	],
	plan: { c: [1.6, -16], w: 13.4, h: 10.27, turn: 0.03 },
	browser: { c: [-5.6, -3.4], w: 9, h: 6.2, turn: 0.03 },
	mac: { c: [-5.6, 8.8], w: 9, d: 4.4, lid: 5, lean: 0.3, turn: -0.03 },
	iphone: { c: [-5.6, 16.6], w: 9, h: 4.6, turn: 0.03 },
	slot: { c: [5.4, 21.2], w: 9, h: 4, turn: -0.03 },
	arrows: {
		browser: { run: [[8.3, -18.6, 0], [8.7, -18.6, 0], [8.7, -3.4, 0], [-0.6, -3.4, 0]] },
		mac: { run: [[8.3, -17.1, 0], [9.3, -17.1, 0], [9.3, 8.8, 0], [-0.6, 8.8, 0]] },
		iphone: { run: [[8.3, -15.6, 0], [9.9, -15.6, 0], [9.9, 16.6, 0], [-0.6, 16.6, 0]] },
		slot: { run: [[8.3, -14.1, 0], [10.5, -14.1, 0], [10.5, 21.2, 0], [9.9, 21.2, 0]], at: [4.8, 18.6, 0] },
	},
	captionShift: -24,
};

const flatAt = ({ c, w, h, turn }: { c: P; w: number; h: number; turn: number }, z = 0) => {
	const U: Point3 = [Math.cos(turn), Math.sin(turn), 0];
	const V: Point3 = [-Math.sin(turn), Math.cos(turn), 0];
	return (u: number, v: number): Point3 => [c[0] + U[0] * (u - w / 2) + V[0] * (v - h / 2), c[1] + U[1] * (u - w / 2) + V[1] * (v - h / 2), z];
};
const corners = (f: Flat, z = 0): Point3[] => {
	const at = flatAt(f, z);
	return [at(0, 0), at(f.w, 0), at(f.w, f.h), at(0, f.h)];
};
const centroid3 = (pts: Point3[]): Point3 => mul3(pts.reduce((a, p) => add3(a, p), [0, 0, 0] as Point3), 1 / pts.length);

/** A run of straight legs with rounded corners, as world points. */
function rounded(run: Point3[], r = 0.5): Point3[] {
	const out: Point3[] = [run[0]!];
	for (let i = 1; i < run.length - 1; i++) {
		const [a, b, c] = [run[i - 1]!, run[i]!, run[i + 1]!];
		const into = sub3(b, a);
		const outof = sub3(c, b);
		const li = Math.hypot(into[0], into[1]);
		const lo = Math.hypot(outof[0], outof[1]);
		const k = Math.min(r, li / 2, lo / 2);
		const p0 = sub3(b, mul3(into, k / li));
		const p1 = add3(b, mul3(outof, k / lo));
		out.push(p0);
		for (let j = 1; j < 8; j++) {
			const t = j / 8;
			out.push(add3(add3(mul3(p0, (1 - t) * (1 - t)), mul3(b, 2 * t * (1 - t))), mul3(p1, t * t)));
		}
		out.push(p1);
	}
	out.push(run.at(-1)!);
	return out;
}

function laptopPoints(L: Laptop): Point3[] {
	const at = flatAt({ c: L.c, w: L.w, h: L.d, turn: L.turn });
	const lift: Point3 = [0, 0, L.lid * Math.cos(L.lean)];
	return [at(0, L.d), at(L.w, L.d), add3(at(0, -L.lid * Math.sin(L.lean)), lift), add3(at(L.w, -L.lid * Math.sin(L.lean)), lift)];
}

function compose(spec: Spec) {
	const view = { azimuth: 92, elevation: spec.elevation, distance: 92, target: [0, 0, 1] as Point3 };
	const things: Point3[] = [...corners(spec.card), ...corners(spec.plan), ...corners(spec.browser), ...corners(spec.iphone), ...corners(spec.slot), ...laptopPoints(spec.mac)];
	const base = createCamera({ width: 1000, height: 1000, view, bounds: things, pad: 0 });
	const EYE = base.EYE;
	let A = 1;
	let OX = 0;
	let OY = 0;
	const proj = (p: Point3): P => {
		const [x, y] = base.proj(p);
		return [x * A + OX, y * A + OY];
	};
	const projAll = (pts: Point3[]): P[] => pts.map(proj);
	const cardK = spec.card.w / CARD.w;
	const onCard = flatAt(spec.card, 0.06);
	const glassCentre = add3(onCard(spec.glass.at[0] * cardK, spec.glass.at[1] * cardK), [0, 0, 1.2]);
	const handleDir: Point3 = [Math.cos(spec.glass.handle), Math.sin(spec.glass.handle), 0];
	const handleEnd = add3(add3(glassCentre, mul3(handleDir, spec.glass.r + 3.6)), [0, 0, -0.9]);
	const runs = DEVICES.map((d) => rounded(spec.arrows[d.key]!.run));
	const extra: Point3[] = [
		...[0, 1, 2, 3].map((i) => add3(glassCentre, [Math.cos((i * TAU) / 4) * spec.glass.r, Math.sin((i * TAU) / 4) * spec.glass.r, 0]) as Point3),
		handleEnd,
		...runs.flat(),
	];
	const footprints: Record<string, Point3[]> = {
		browser: corners(spec.browser),
		mac: laptopPoints(spec.mac),
		iphone: corners(spec.iphone),
		slot: corners(spec.slot),
		plan: corners(spec.plan),
	};

	type Note = { kind: keyof Fonts; text: string; x: number; y: number; device?: string };
	/** Every hand-lettered word, placed in screen units: its centre x and baseline y. */
	function notes(): Note[] {
		const under = (pts: Point3[], gap: number) => {
			const s = projAll(pts);
			return { x: (Math.min(...s.map((p) => p[0])) + Math.max(...s.map((p) => p[0]))) / 2, y: Math.max(...s.map((p) => p[1])) + gap };
		};
		const out: Note[] = spec.findings.map((f, i) => {
			const [x, y] = proj(f.at);
			return { kind: 'finding', text: FINDINGS[i]!, x, y };
		});
		DEVICES.forEach((d) => {
			const arrow = spec.arrows[d.key]!;
			const [a, b] = projAll(arrow.run.slice(-2));
			const said = `→ ${d.press}`;
			const whole = `${WROTE} ${said}`;
			const wide = whole.length * glyph.press * spec.fonts.press;
			const spot = arrow.at && proj(arrow.at);
			const x = spot ? spot[0] : arrow.beside === undefined ? (a![0] + b![0]) / 2 + (arrow.across ?? 0) : a![0] + arrow.beside + wide / 2;
			const y = spot ? spot[1] : arrow.beside === undefined ? Math.min(a![1], b![1]) - 8 : (a![1] + b![1]) / 2 + spec.fonts.press * 0.35;
			if (spot || arrow.beside !== undefined || wide <= Math.abs(b![0] - a![0]) - 16) out.push({ kind: 'press', text: whole, x, y, device: d.key });
			else out.push({ kind: 'press', text: WROTE, x, y: y - spec.fonts.press - 1, device: d.key }, { kind: 'press', text: said, x, y, device: d.key });
			if (d.name) out.push({ kind: 'name', text: d.name, ...under(footprints[d.key]!, spec.fonts.name + 6) });
		});
		const planNote = spec.captionAbove ? { ...under(footprints.plan!, 0), y: Math.min(...projAll(footprints.plan!).map((p) => p[1])) - 8 } : under(footprints.plan!, spec.fonts.caption + 8);
		out.push({ kind: 'caption', text: PLAN_NOTE, x: planNote.x + (spec.captionShift ?? 0), y: planNote.y });
		out.push({ kind: 'caption', text: ADAPTER_NOTE, ...under(footprints.slot!, spec.fonts.caption + 7) });
		return out;
	}
	const boxOf = (n: Note) => {
		const size = spec.fonts[n.kind];
		const w = n.text.length * glyph[n.kind] * size;
		return [n.x - w / 2, n.y - size * 0.8, n.x + w / 2, n.y + size * 0.28] as const;
	};
	function extent() {
		const pts = projAll([...things, ...extra]);
		const boxes = notes().map(boxOf);
		return [Math.min(...pts.map((p) => p[0]), ...boxes.map((b) => b[0])), Math.max(...pts.map((p) => p[0]), ...boxes.map((b) => b[2])), Math.min(...pts.map((p) => p[1]), ...boxes.map((b) => b[1])), Math.max(...pts.map((p) => p[1]), ...boxes.map((b) => b[3]))] as const;
	}
	const pad = 10;
	let lo = 0.05;
	let hi = 5;
	for (let i = 0; i < 40; i++) {
		A = (lo + hi) / 2;
		const [x0, x1] = extent();
		if (x1 - x0 > spec.width - pad * 2) hi = A;
		else lo = A;
	}
	A = lo;
	{
		const [x0, x1, y0] = extent();
		OX = pad - x0 + (spec.width - pad * 2 - (x1 - x0)) / 2;
		OY = pad - y0;
	}
	const height = Math.ceil(extent()[3] + pad);

	function sheetFor(key: string, tier: Tier) {
		const out = { key, tier, shell: '', paper: '', face: '', fine: '', tone: '', deep: '', pencil: '', pink: '', yellow: '', pool: '', edge: '', ink: '', texts: [] as { key: string; text: string; m: string; size: number; kind: string }[], screens: [] as { key: string; m: string }[] };
		const wanted = tier === 'wanted';
		return {
			out,
			paper(pts: P[]) {
				if (!wanted) out.paper += pathOf(pts, true);
			},
			face(pts: P[]) {
				if (!wanted) out.face += pathOf(pts, true);
			},
			shell(pts: P[]) {
				if (!wanted) out.shell += pathOf(pts, true);
			},
			edge(pts: P[], w: number, seed: number, heavy = 0) {
				if (wanted) out.pencil += pencil(pts, seed, true);
				else out.ink += outline(pts, { w, heavy, centre: centreOf(pts), seed });
			},
			run(pts: P[], w: number, seed: number, over = 1) {
				if (wanted) out.pencil += pencil(pts, seed);
				else out.ink += line(pts, { w, seed, over });
			},
			tone(poly: P[], angle: number, gap: number, seed: number, cluster = 4) {
				if (!wanted) out.tone += hatch(poly, angle, gap, seed, { cluster, skip: 0.15 });
			},
			deep(poly: P[], angle: number, gap: number, seed: number) {
				if (!wanted) out.deep += hatch(poly, angle, gap, seed, { cluster: 3, skip: 0.1 }) + hatch(poly, angle - 1.3, gap * 1.2, seed + 1, { cluster: 3, skip: 0.25 });
			},
			spot(poly: P[], seed: number) {
				out.yellow += wash(poly, seed, 0.8, 2.2);
				out.pool += wash(pool(poly, centreOf(poly), 0.55), seed + 1, 0.4, 1.6);
				out.edge += wash(poly, seed + 2, 0.3, 2);
			},
			button(poly: P[], seed: number) {
				if (wanted) out.pencil += pencil(poly, seed, true);
				else {
					out.face += pathOf(poly, true);
					out.pink += wash(poly, seed, 1, 2.4);
					out.ink += outline(poly, { w: 1, heavy: 1, centre: centreOf(poly), seed: seed + 1 });
				}
			},
		};
	}
	type Sheet = ReturnType<typeof sheetFor>;

	/** The cup, the status spot and the button laid onto a device's screen; the status words ride on its matrix. */
	function simpleScreen(s: Sheet, surface: Plane, u0: number, v0: number, k: number, seed: number, lift = 0.005) {
		const at = (pts: P[]) => surface.on(pts.map(([x, y]) => [u0 + x * k, v0 + y * k] as P), lift);
		const [dx, dy, q] = SCREEN.cup;
		const body = at([[dx, dy], [dx + 10 * q, dy], [dx + 8.4 * q, dy + 16 * q], [dx + 1.6 * q, dy + 16 * q]]);
		const lid = at(roundRect(dx - 0.8 * q, dy - 2.4 * q, dx + 10.8 * q, dy, 0.8 * q, 2));
		const sleeve = at([[dx + 0.5 * q, dy + 5 * q], [dx + 9.5 * q, dy + 5 * q], [dx + 9 * q, dy + 10 * q], [dx + 1 * q, dy + 10 * q]]);
		s.edge(body, 0.9, seed, 0.8);
		s.edge(lid, 0.8, seed + 1);
		s.out.fine += hatch(sleeve, 0.9, 1.3, seed + 2, { cluster: 3, skip: 0.15 });
		const [bx0, by0, bx1, by1] = SCREEN.button;
		s.button(at(roundRect(bx0, by0, bx1, by1, 2, 3)), seed + 3);
		const [sx, sy, rx, ry] = SCREEN.spot;
		s.spot(at(ellipse(sx, sy, rx, ry, 26)), seed + 5);
		s.out.screens.push({ key: 'status', m: surface.matrix(u0, v0, k, lift) });
	}

	function shadowOf(points: Point3[], core: Point3[], seed: number) {
		const shade = hull(points.map((p) => proj(shadowOnDesk(p))).concat(points.filter((p) => p[2] < 0.05).map(proj)));
		const dark = hull(core.map((p) => proj(shadowOnDesk(p))).concat(core.filter((p) => p[2] < 0.05).map(proj)));
		return {
			wash: wash(shade, seed, 1.2, 2.5),
			hatch: hatch(shade, -0.45, 2.6, seed + 1, { cluster: 5, skip: 0.2, trim: 0.4 }),
			core: dark.length > 2 ? hatch(dark, 0.6, 1.5, seed + 2, { cluster: 3, skip: 0.15 }) : '',
		};
	}
	const raised = (f: Flat, z: number): Point3[] => corners(f).flatMap((p) => [p, add3(p, [0, 0, z])]);

	function card() {
		const s = sheetFor('card', 'source');
		const f = spec.card;
		const surface = deskPlane(proj, f.c, f.w, f.h, f.turn, 0.06);
		const edge = surface.on(roundRect(0, 0, f.w, f.h, 0.25, 3));
		s.paper(edge);
		s.edge(edge, 2.1, 101, 1.7);
		const at = (pts: P[]) => surface.on(pts.map(([x, y]) => [x * cardK, y * cardK] as P), 0.01);
		const [bx0, by0, bx1, by1] = CARD.button;
		s.button(at(roundRect(bx0, by0, bx1, by1, 2, 3)), 110);
		const [sx, sy, rx, ry] = CARD.spot;
		s.spot(at(ellipse(sx, sy, rx, ry, 26)), 113);
		s.run(at([[4, CARD.rule], [40, CARD.rule]]), 0.5, 116, 0.4);
		const [tx0, ty0, tx1, ty1] = CARD.tag;
		const [lx, ly0, ly1] = CARD.leader;
		s.edge(at(roundRect(tx0, ty0, tx1, ty1, 1.6, 3)), 0.6, 117);
		s.run(at([[lx, ly0], [lx - 0.4, (ly0 + ly1) / 2], [lx, ly1]]), 1.1, 118, 0.2);
		return { ...s.out, matrix: surface.matrix(0, 0, cardK, 0.01), shadow: shadowOf(raised(f, 0.6), raised(f, 0.2), 120) };
	}

	/** A magnifying glass held just past the card's right edge, clear of its words. */
	function glass() {
		const C = glassCentre;
		const R = spec.glass.r;
		const ring = (r: number, z = 0) => Array.from({ length: 64 }, (_, i) => add3(C, [Math.cos((i / 64) * TAU) * r, Math.sin((i / 64) * TAU) * r, z]) as Point3);
		const outer = projAll(ring(R));
		const inner = projAll(ring(R - 0.26));
		const under = projAll(ring(R, -0.22));
		const side: Point3 = [-handleDir[1], handleDir[0], 0];
		const h0 = add3(C, mul3(handleDir, R + 0.05));
		const h1 = handleEnd;
		const l0 = proj(add3(h0, mul3(side, 0.32)));
		const l1 = proj(add3(h1, mul3(side, 0.4)));
		const r0 = proj(add3(h0, mul3(side, -0.32)));
		const r1v = proj(add3(h1, mul3(side, -0.4)));
		const handle = [l0, l1, r1v, r0];
		const rim = hull([...outer, ...under]);
		const centre = centreOf(outer);
		const shadow = hull([...ring(R).map((p) => proj(shadowOnDesk(p, 0.06))), proj(shadowOnDesk(h1, 0.06))]);
		const glints = [-2.3, -2.05].map((t, i) => line(projAll(Array.from({ length: 9 }, (_, j) => add3(C, [Math.cos(t + j * 0.07) * (R - 0.55 - i * 0.18), Math.sin(t + j * 0.07) * (R - 0.55 - i * 0.18), 0]) as Point3)), { w: 0.9, seed: 150 + i, over: 0 }));
		return {
			shadow: hatch(shadow, -0.4, 2.4, 140, { cluster: 4, skip: 0.3, trim: 0.4 }),
			ringShadow: line(projAll(ring(R - 0.1).map((p) => shadowOnDesk(p, 0.06))), { w: 0.7, seed: 141, over: 0.5 }),
			lens: pathOf(inner, true),
			band: pathOf([...outer, outer[0]!, ...inner.slice().reverse(), inner.at(-1)!], true),
			tone: hatch(rim.filter((p) => p[1] > centre[1] - 2), 0.15, 1.2, 142, { cluster: 4 }) + hatch(handle, 1.2, 1.3, 143, { cluster: 3 }),
			handle: pathOf(handle, true),
			ink:
				outline(rim, { w: 2, heavy: 1.6, centre, seed: 144 }) +
				outline(inner, { w: 1, seed: 145 }) +
				line([l0, l1], { w: 1.4, seed: 146, over: 0.8 }) +
				line([r0, r1v], { w: 2, heavy: 1, centre: centreOf(handle), seed: 147, over: 0.8 }) +
				line(resample([l1, r1v], 0.5), { w: 1.6, seed: 148, over: 0.4 }) +
				glints.join(''),
		};
	}

	/** Each note Markless makes, with a pen lead to the spot on the card it names. */
	function findings(placed: Note[]) {
		return spec.findings.map((n, i) => {
			const { x, y } = placed[i]!;
			const target = proj(onCard(n.to[0] * cardK, n.to[1] * cardK));
			const start: P = [x, y + (target[1] < y ? -18 : 8)];
			const bend: P = n.via ? proj(onCard(n.via[0] * cardK, n.via[1] * cardK)) : [(start[0] + target[0]) / 2 + (i % 2 ? 6 : -6), (start[1] + target[1]) / 2];
			const pts = resample(Array.from({ length: 12 }, (_, j) => {
				const t = j / 11;
				return [start[0] * (1 - t) * (1 - t) + bend[0] * 2 * t * (1 - t) + target[0] * t * t, start[1] * (1 - t) * (1 - t) + bend[1] * 2 * t * (1 - t) + target[1] * t * t] as P;
			}), 2);
			const lead = pts.slice(1, -2);
			const end = lead.at(-1)!;
			return {
				key: `finding-${i}`,
				text: FINDINGS[i]!,
				x: r1(x),
				y: r1(y),
				lead: line(lead, { w: 0.7, seed: 160 + i, over: 0.3 }) + outline(ellipse(end[0], end[1], 1.2, 1.2, 8), { w: 0.9, seed: 170 + i }),
			};
		});
	}

	/** The plan: a sheet with a hanging tag marked status, its wire to the status label, and the button's thin wire into the tag. */
	function plan() {
		const s = sheetFor('plan', 'source');
		const t = sheetFor('tag', 'source');
		const f = spec.plan;
		const sheet = deskPlane(proj, f.c, f.w, f.h, f.turn, 0.04);
		const edge = sheet.on(roundRect(0, 0, f.w, f.h, 0.12, 2));
		s.paper(edge);
		s.edge(edge, 1.8, 201, 1.5);
		const sc = f.w / 6.8;
		const on = (pts: P[], lift = 0.005) => sheet.on(pts.map(([u, v]) => [u * sc, v * sc] as P), lift);
		const nail = on([[1.8, 0.75]])[0]!;
		s.out.ink += pathOf(on(ellipse(1.8, 0.75, 0.13, 0.11, 10)), true);
		const tag = on([[1.0, 2.0], [1.5, 1.5], [2.1, 1.5], [2.6, 2.0], [2.6, 4.3], [1.0, 4.3]], 0.01);
		t.run(on([[1.8, 0.78], [1.72, 1.4], [1.8, 1.98]], 0.01), 0.6, 202, 0);
		t.paper(tag);
		t.tone(on([[2.2, 2.2], [2.6, 2.2], [2.6, 4.3], [2.2, 4.3]], 0.01), 1.45, 1.1, 203, 3);
		t.edge(tag, 1.2, 204, 0.9);
		t.edge(on(ellipse(1.8, 2.0, 0.13, 0.12, 10), 0.01), 0.7, 205);
		t.out.texts.push({ key: 'tag', text: 'status', m: sheet.matrix(1.2 * sc, 3.3 * sc, 0.1 * sc, 0.01), size: 3.3, kind: 'tag' });
		const label = on(roundRect(3.95, 1.15, 6.4, 2.85, 0.2, 3));
		s.paper(label);
		s.edge(label, 1, 214, 0.8);
		s.spot(on(ellipse(5.18, 2.0, 1.05, 0.62, 22)), 215);
		s.out.screens.push({ key: 'status', m: sheet.matrix(5.18 * sc, 0, 0.1 * sc, 0.005) });
		const wire = resample(on([[2.62, 2.75], [3.2, 2.7], [3.5, 2.0], [3.92, 2.0]]), 0.4);
		s.run(wire, 1.5, 216, 0.3);
		s.run(resample(on([[2.62, 2.87], [3.25, 2.82], [3.55, 2.12], [3.92, 2.12]]), 0.4), 0.5, 217, 0.2);
		s.edge(on(ellipse(3.94, 2.05, 0.09, 0.09, 8)), 0.9, 218);
		s.button(on(roundRect(3.95, 3.4, 6.4, 4.3, 0.3, 3)), 219);
		s.run(resample(on([[3.95, 3.85], [3.3, 3.9], [3.0, 3.6], [2.66, 3.5]]), 0.3), 0.7, 221, 0.2);
		s.out.ink += barbs(on([[3.0, 3.62], [2.82, 3.53], [2.68, 3.5]]), 2.5).map((b, i) => stroke(b, { w: 0.6, seed: 222 + i, over: 0 })).join('');
		const { key: _k, tier: _t, ...tagArt } = t.out;
		return {
			...s.out,
			wire: { d: pathOf(wire), length: r1(lengthOf(wire)) },
			tag: { ...tagArt, origin: [r1(nail[0]), r1(nail[1])] as [number, number] },
			shadow: shadowOf(raised(f, 0.5), raised(f, 0.15), 230),
		};
	}

	function browser() {
		const s = sheetFor('browser', 'native');
		const f = spec.browser;
		const surface = deskPlane(proj, f.c, f.w, f.h, f.turn, 0.04);
		const edge = surface.on([[0, 0], [f.w, 0], [f.w, f.h], [0, f.h]].flatMap(([u, v], i, all) => resample([[u!, v!], all[(i + 1) % 4] as P], 0.5)));
		s.paper(edge);
		const bar = 1.1;
		s.tone(surface.on([[0, 0], [f.w, 0], [f.w, bar], [0, bar]]), 0.12, 2.1, 301, 6);
		s.run(surface.on([[0, bar], [f.w, bar]]), 0.9, 302);
		[0.55, 1.05, 1.55].forEach((u, i) => s.edge(surface.on(ellipse(u, bar / 2, 0.15, 0.15, 14)), 0.8, 303 + i));
		const pill = surface.on(roundRect(2.3, 0.27, 6.6, 0.85, 0.28, 3), 0.002);
		s.paper(pill);
		s.edge(pill, 0.8, 307);
		s.out.texts.push({ key: 'url', text: 'beanshop.dev', m: surface.matrix(2.5, 0.76, 0.1), size: 5.6, kind: 'url' });
		s.edge(edge, 2, 308, 1.6);
		const k = Math.min((f.w - 0.6) / SCREEN.w, (f.h - bar - 0.4) / SCREEN.h);
		simpleScreen(s, surface, (f.w - SCREEN.w * k) / 2, bar + 0.2, k, 310);
		return { ...s.out, shadow: shadowOf(raised(f, 0.5), raised(f, 0.15), 320) };
	}

	function phone(key: string, f: Flat, r: number, seed: number) {
		const s = sheetFor(key, 'native');
		const { w, h } = f;
		const bottom = deskPlane(proj, f.c, w, h, f.turn, 0);
		const top = deskPlane(proj, f.c, w, h, f.turn, 0.32);
		const shape = roundRect(0, 0, w, h, r, 5);
		const sil = hull([...bottom.on(shape), ...top.on(shape)]);
		s.shell(sil);
		s.deep(sil, 1.1, 1.3, seed);
		s.face(top.on(shape));
		s.edge(sil, 1.6, seed + 1, 1.2);
		s.edge(top.on(shape), 0.8, seed + 2);
		s.edge(top.on(roundRect(0.2, 0.2, w - 0.2, h - 0.2, r - 0.12, 5)), 0.7, seed + 3);
		s.out.ink += pathOf(top.on(roundRect(0.42, h / 2 - 0.46, 0.7, h / 2 + 0.46, 0.14, 3)), true);
		s.run(top.on([[w - 0.4, h / 2 - 0.6], [w - 0.4, h / 2 + 0.6]]), 0.7, seed + 5, 0);
		const k = Math.min((w - 1.7) / SCREEN.w, (h - 0.5) / SCREEN.h);
		simpleScreen(s, top, (w - SCREEN.w * k) / 2, (h - SCREEN.h * k) / 2, k, seed + 20);
		return { ...s.out, shadow: shadowOf(raised(f, 0.9), raised(f, 0.4), seed + 40) };
	}

	/** The open slot for the next adapter: faint pencil sketches of a phone, a watch and an envelope. */
	function slot() {
		const s = sheetFor('slot', 'wanted');
		const f = spec.slot;
		const on = deskPlane(proj, f.c, f.w, f.h, f.turn, 0).on;
		s.edge(on(roundRect(0, 0, f.w, f.h, 0.4, 4)), 0, 850);
		s.edge(on(roundRect(0.7, 0.55, 2.1, 3.45, 0.25, 3)), 0, 852);
		s.edge(on(roundRect(0.88, 0.85, 1.92, 3.0, 0.08, 2)), 0, 853);
		s.edge(on(ellipse(1.4, 3.22, 0.09, 0.09, 8)), 0, 854);
		s.edge(on(ellipse(3.55, 2.0, 0.72, 0.72, 20)), 0, 856);
		s.edge(on([[3.2, 1.33], [3.3, 0.5], [3.8, 0.5], [3.9, 1.33]]), 0, 857);
		s.edge(on([[3.2, 2.67], [3.3, 3.5], [3.8, 3.5], [3.9, 2.67]]), 0, 858);
		s.run(on([[3.55, 2.0], [3.55, 1.55]]), 0, 859);
		s.run(on([[3.55, 2.0], [3.85, 2.15]]), 0, 860);
		s.edge(on([[4.85, 1.2], [6.45, 1.2], [6.45, 2.8], [4.85, 2.8]]), 0, 862);
		s.run(on([[4.85, 1.22], [5.65, 2.0], [6.45, 1.22]]), 0, 863);
		return { ...s.out, shadow: { wash: '', hatch: '', core: '' } };
	}

	function laptop(key: string, L: Laptop, seed: number) {
		const s = sheetFor(key, 'native');
		const { w, d, lid, lean, turn } = L;
		const T = 0.32;
		const U: Point3 = [Math.cos(turn), Math.sin(turn), 0];
		const V: Point3 = [-Math.sin(turn), Math.cos(turn), 0];
		const base = flatAt({ c: L.c, w, h: d, turn });
		const corner = (u: number, v: number, z: number): Point3 => add3(base(u, v), [0, 0, z]);
		const up: Point3 = add3(mul3(V, -Math.sin(lean)), [0, 0, Math.cos(lean)]);
		const lidNormal: Point3 = add3(mul3(V, Math.cos(lean)), [0, 0, Math.sin(lean)]);
		const screenPlane = plane(proj, add3(corner(0, 0.15, T), mul3(up, lid)), U, mul3(up, -1), lidNormal);
		const lidFace = screenPlane.on([[0, 0], [w, 0], [w, lid], [0, lid]].flatMap(([u, v], i, all) => resample([[u!, v!], all[(i + 1) % 4] as P], 0.6)));
		const lidSil = hull([...lidFace, ...screenPlane.on([[0, 0], [w, 0]], -0.2)]);
		s.shell(lidSil);
		s.edge(lidSil, 1.6, seed, 1);
		s.run(screenPlane.on([[0.3, 0], [w - 0.3, 0]]), 0.6, seed + 1, 0);
		const bez = { side: 0.36, top: 0.4, bottom: 0.55 };
		const glassFace = screenPlane.on(roundRect(bez.side, bez.top, w - bez.side, lid - bez.bottom, 0.1, 2));
		s.tone([...lidFace, ...glassFace.slice().reverse()], 0.95, 1.7, seed + 2, 4);
		s.face(glassFace);
		s.edge(glassFace, 0.8, seed + 3);
		s.out.ink += pathOf(screenPlane.on(ellipse(w / 2, bez.top / 2, 0.06, 0.06, 10)), true);
		const k = Math.min((w - bez.side * 2 - 0.3) / SCREEN.w, (lid - bez.top - bez.bottom - 0.3) / SCREEN.h);
		simpleScreen(s, screenPlane, (w - SCREEN.w * k) / 2, bez.top + 0.15, k, seed + 20);
		const faces = [
			{ n: mul3(U, -1), pts: [corner(0, 0, T), corner(0, d, T), corner(0, d, 0), corner(0, 0, 0)] },
			{ n: U, pts: [corner(w, d, T), corner(w, 0, T), corner(w, 0, 0), corner(w, d, 0)] },
			{ n: V, pts: [corner(0, d, T), corner(w, d, T), corner(w, d, 0), corner(0, d, 0)] },
		];
		const topFace = projAll([corner(0, 0, T), corner(w, 0, T), corner(w, d, T), corner(0, d, T)]);
		const shown = faces.filter((x) => dot3(x.n, sub3(EYE, centroid3(x.pts))) > 0);
		const baseSil = hull([...topFace, ...shown.flatMap((x) => projAll(x.pts))]);
		s.shell(baseSil);
		shown.forEach((x, i) => s.deep(projAll(x.pts), 1.2, 1.3, seed + 30 + i * 2));
		s.face(topFace);
		s.edge(baseSil, 1.7, seed + 7, 1.3);
		s.edge(topFace, 0.8, seed + 8);
		const deck = plane(proj, corner(0, 0, T), U, V);
		const keys = d * 0.53;
		const kb = deck.on(roundRect(0.6, 0.45, w - 0.6, keys, 0.15, 2));
		s.tone(kb, 1.3, 2.2, seed + 9, 3);
		s.edge(kb, 0.7, seed + 10);
		for (let row = 1; row < 5; row++) s.run(deck.on([[0.7, 0.45 + (row * (keys - 0.45)) / 5], [w - 0.7, 0.45 + (row * (keys - 0.45)) / 5]]), 0.35, seed + 11 + row, 0);
		s.edge(deck.on(roundRect(w / 2 - 1.5, d * 0.6, w / 2 + 1.5, d - 0.35, 0.22, 3)), 0.7, seed + 17);
		const height = lid * Math.cos(lean);
		const back = lid * Math.sin(lean);
		const shadow = shadowOf(
			[corner(0, 0, height), corner(w, 0, height), add3(corner(0, -back, 0), [0, 0, height]), add3(corner(w, -back, 0), [0, 0, height]), corner(0, d, T), corner(w, d, T), corner(0, d, 0), corner(w, d, 0), corner(w, 0, 0)],
			[corner(w, 0, T), corner(w, d, T), corner(0, d, T), corner(w, d, 0), corner(0, d, 0), corner(w, 0, 0)],
			seed + 50,
		);
		return { ...s.out, shadow };
	}

	function arrows(placed: Note[]) {
		return DEVICES.map((device, i) => {
			const pts = resample(projAll(runs[i]!), 3);
			const seed = 600 + i * 10;
			const d =
				device.status === 'wanted'
					? pencil(pts, seed) + barbs(pts, 8).map((b, j) => pencil(b, seed + 1 + j, false, 1)).join('')
					: stroke(pts, { w: 1.6, seed, over: 0.6 }) + barbs(pts, 9).map((b, j) => stroke(b, { w: 1.3, seed: seed + 1 + j, over: 0.3 })).join('');
			const lines = placed.filter((n) => n.kind === 'press' && n.device === device.key);
			const word = lines.at(-1)!;
			return { key: device.key, status: device.status, d, path: pathOf(device.status === 'wanted' ? pts.slice(0, Math.round(pts.length * 0.62)) : pts), word: device.press, stack: lines.length > 1, x: r1(word.x), y: r1(word.y), top: r1(lines[0]!.y), length: r1(lengthOf(pts)) };
		});
	}

	const placed = notes();
	const cardArt = card();
	const planArt = plan();
	const devices = [laptop('mac', spec.mac, 900), browser(), phone('iphone', spec.iphone, 0.55, 800), slot()];
	const solid = [cardArt.shadow, planArt.shadow, ...devices.map((x) => x.shadow)].reduce((a, b) => ({ wash: a.wash + b.wash, hatch: a.hatch + b.hatch, core: a.core + b.core }));
	const labels = placed.filter((n) => n.kind === 'name').map((n) => ({ key: DEVICES.find((d) => d.name === n.text)!.key, name: n.text, x: r1(n.x), y: r1(n.y) }));
	const [planNote, adapter] = placed.filter((n) => n.kind === 'caption').map((n) => ({ x: r1(n.x), y: r1(n.y) }));
	const { shadow: _card, ...cardRest } = cardArt;
	const { shadow: _plan, wire: planWire, tag: planTag, ...planRest } = planArt;
	return {
		key: spec.key,
		width: spec.width,
		height,
		fonts: spec.fonts,
		shadow: solid,
		card: cardRest,
		glass: glass(),
		findings: findings(placed),
		parts: [planRest, ...devices.map(({ shadow: _shadow, ...rest }) => rest)],
		planNote: planNote!,
		planWire,
		planTag,
		arrows: arrows(placed),
		labels,
		adapter: adapter!,
	};
}

/** The whole scene, wide for the prose column and tall for phones, frozen into wired.art.ts. */
export function drawing() {
	return { views: [compose(WIDE), compose(TALL)] };
}
