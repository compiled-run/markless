// An open pop-up book: the left page is the workshop where the order code lifts into cutouts, gets read and stamped, and the map folds shut; the right page is the visitor's browser, where the map pops open beside the page.
import { unit3 } from '../kit/lathe.ts';
import { createCamera, jitter, type P, type Point3, roundRect } from '../ink/desk.ts';
import { hatch, lengthOf, line, outline, pathOf, r1, resample, seeded, wash } from '../ink/ink.ts';
import { barbs, pencil } from '../ink/plane.ts';
import { colsOf, CUT, HEADINGS, KEPT, KEYS, LAST, LISTING, type NodeKey, NODE_KEYS, NODES, nodeOf, READY_TEXT, START, type Tok, type Tone } from './model.ts';

/** Local drawing units per world unit, on cutouts, the window and page lettering. */
const L = 16;
/** Book ink units per world unit. */
const K = 8;
/** One page of the spread, in world units: across, and from its back edge to its front edge. */
const PW = 21.5;
const PD = 29;

/** Cutout type in local units: code size and column, kind and stamp sizes, and each line's baseline from the card's top. */
const CFS = 11;
const COL = CFS * 0.6;
const KFS = 8.5;
const KIND_EM = 0.62;
const SFS = 8.5;
const STAMP_EM = 0.57;
const PADX = 7;
const KIND_Y = 11;
const CODE_Y = 25;
const STAMP_Y = 38;
const CARD_H = 43;
/** How far a standing cutout leans back from flat, and how high its tabs hold it off the page. */
const STAND = (75 * Math.PI) / 180;
const FLOAT = 0.45;
const BOARD = 0.55;
const BLOCK = 0.9;
/** Page lettering in world units: headings, captions, controls, the printed code and its line pitch. */
const HEAD_FS = 1.12;
const CAP_FS = 1.0;
const CTRL_FS = 1.0;
const LIST_FS = 0.95;
const LIST_PITCH = 1.42;
const LIST_AT: P = [1.7, 3.9];
/** The browser window standing at the back of the browser page: its base, height and lean, in world units. */
const WIN = { x0: 2.65, x1: 18.85, y: 11.4, h: 4.2, lean: (78 * Math.PI) / 180 };
/** Window type in local units. */
const WFS = 12;
const VALUE_EM: Record<string, number> = { [START]: 5.15, [READY_TEXT]: 9.35 };
const STATUS_EM = 3.75;
/** The timeline under the book: its rail in screen units for each view, and the thumb's radius. */
const RAIL_H = 24;
const THUMB_R = 8;
/** Light on the cutouts comes from the front left, so their shadows fall back onto the page and leave the text in front clear. */
const SUN = unit3([-0.5, 0.35, 0.8]);
const onFloor = (q: Point3): Point3 => [q[0] - (SUN[0] / SUN[2]) * q[2], q[1] - (SUN[1] / SUN[2]) * q[2], 0];

type PageKey = 'work' | 'browser';
interface Spot {
	x: number;
	y: number;
	/** Set `x` as the card's right edge. */
	right?: boolean;
}
/** Where each cutout stands on the workshop page, by its base. */
const WORK: Record<NodeKey, Spot> = {
	order: { x: 1.2, y: 8 },
	status: { x: 19.6, y: 8, right: true },
	latte: { x: 1.2, y: 13.4 },
	label: { x: 14.2, y: 13.4 },
	button: { x: 1.2, y: 18.8 },
	slot: { x: 19.6, y: 18.8, right: true },
	onClick: { x: 1.2, y: 24.2 },
	assign: { x: 20.3, y: 24.2, right: true },
};
/** Where the map's cutouts stand on the browser page. */
const MAP: Partial<Record<NodeKey, Spot>> = {
	slot: { x: 1.3, y: 17.4 },
	status: { x: 19.4, y: 17.4, right: true },
	assign: { x: 1.3, y: 22.9 },
	onClick: { x: 20.3, y: 22.9, right: true },
};
/** Where the folded map gathers on each page: the stack's left edge and front edge. */
const GATHER: Record<PageKey, P> = { work: [6, 23.2], browser: [1.6, 20.2] };
/** Lettering on the pages: each heading, the caption line, the usual-way switch and the gutter's ship arrow. */
const HEAD_AT: P = [1.1, 1.35];
const CAPTION_AT: P = [1.1, 27.7];
const USUAL_AT: P = [5.2, 27.7];

interface Layout {
	key: 'wide' | 'tall';
	width: number;
	camera: { azimuth: number; elevation: number; distance: number };
	/** Each page's back-left corner in the world. */
	origin: Record<PageKey, P>;
	/** Pages side by side split by an upright gutter, or one above the other split by a level one. */
	stacked: boolean;
	/** How wide the timeline's rail is drawn, in screen units. */
	rail: number;
}

const WIDE: Layout = {
	key: 'wide',
	width: 680,
	camera: { azimuth: 87.5, elevation: 32, distance: 640 },
	origin: { work: [-PW, -PD / 2], browser: [0, -PD / 2] },
	stacked: false,
	rail: 600,
};
const TALL: Layout = {
	key: 'tall',
	width: 360,
	camera: { azimuth: 88, elevation: 33, distance: 900 },
	origin: { work: [-PW / 2, -PD], browser: [-PW / 2, 0] },
	stacked: true,
	rail: 320,
};

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => {
	const t = clamp(v);
	return t * t * (3 - 2 * t);
};
/** Eases in and settles past the end by about three per cent before coming back: paper popping up. */
const pop = (v: number) => {
	const u = clamp(v) - 1;
	return 1 + 1.9 * u * u * u + 0.9 * u * u;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const add = (a: Point3, b: Point3): Point3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a: Point3, k: number): Point3 => [a[0] * k, a[1] * k, a[2] * k];
const isKept = (key: NodeKey) => KEPT.includes(key);
const pageAt = (layout: Layout, page: PageKey, x: number, y: number, z = 0): Point3 => [layout.origin[page][0] + x, layout.origin[page][1] + y, z];

/** A matrix taking local units onto the screen, from where three local points land. */
const matrix = (o: P, x: P, y: P, lx: number, ly: number): number[] => [(x[0] - o[0]) / lx, (x[1] - o[1]) / lx, (y[0] - o[0]) / ly, (y[1] - o[1]) / ly, o[0], o[1]];
const fmt = (m: number[]) => m.map((n, i) => (i < 4 ? Math.round(n * 10000) / 10000 : Math.round(n * 10) / 10)).join(' ');
const css = (m: number[]) => `matrix(${fmt(m).replaceAll(' ', ',')})`;
/** Path data with every point sent through `to`: how ink drawn flat in local units lands on the screen. */
const mapPath = (d: string, to: (x: number, y: number) => P) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => to(Number(x), Number(y)).map(r1).join(' '));

interface CardShape {
	key: NodeKey;
	/** Width and height in world units. */
	w: number;
	h: number;
	code: Tok[];
	kind: string;
	stamp: string;
	/** Where the stamp's text starts, in local units. */
	stampX: number;
	stampW: number;
}

/** Joy Elia advances of each stamp, in ems. */
const STAMP_EMS: Record<string, number> = { 'NEVER CHANGES': 7.15, 'SHOWS status': 6.77, 'CHANGES status': 7.41, "STARTS AS 'Brewing ⏳'": 10.95, 'RUNS ON CLICK': 7.26 };
const stampWidth = (text: string) => (STAMP_EMS[text] ?? text.length * STAMP_EM) * SFS;

function cardShape(key: NodeKey): CardShape {
	const node = nodeOf(key);
	const stampW = stampWidth(node.stamp);
	const w = Math.max(colsOf(node.code.map((t) => t.text).join('')) * COL, node.kind.length * KIND_EM * KFS, stampW + 6) + PADX * 2;
	const stampX = key === 'status' ? w - PADX - stampW - 2 : PADX + 1;
	return { key, w: w / L, h: CARD_H / L, code: node.code, kind: node.kind.toUpperCase(), stamp: node.stamp, stampX, stampW };
}

const SHAPES = Object.fromEntries(NODE_KEYS.map((k) => [k, cardShape(k)])) as Record<NodeKey, CardShape>;
const leftOf = (spot: Spot, key: NodeKey) => (spot.right ? spot.x - SHAPES[key].w : spot.x);

/** Code tokens laid out by column from `x0` on the baseline `y`, so each sits where the monospace face puts it. */
function typeset(tokens: Tok[], x0: number, y: number, col: number) {
	const out: { key: number; x: number; y: number; text: string; tone: Tone }[] = [];
	let at = 0;
	for (const tok of tokens) {
		const lead = tok.text.match(/^ */)![0].length;
		if (tok.text.trim()) out.push({ key: out.length, x: r1(x0 + (at + lead) * col), y: r1(y), text: tok.text.trim(), tone: tok.tone });
		at += colsOf(tok.text);
	}
	return out;
}

interface CardPose {
	/** The bottom-left corner of the face, in the world. */
	hinge: Point3;
	theta: number;
	/** How far the tabs hold the face off the page. */
	float: number;
	/** Size against standing: the printed code is bigger than a cutout's code. */
	s: number;
}

const LIST_SCALE = LIST_FS / (CFS / L);

/** Every cutout's pose at one story position. */
function posesAt(p: number, layout: Layout): Record<NodeKey, CardPose> {
	const out = {} as Record<NodeKey, CardPose>;
	const kept = KEPT;
	NODE_KEYS.forEach((key) => {
		const order = NODES.findIndex((n) => n.key === key);
		const span = 0.7;
		const start = ((1 - span) * order) / (NODE_KEYS.length - 1);
		const s = clamp((Math.min(p, 1) - start) / span);
		const move = ease((s - 0.06) / 0.8);
		let stand = pop((s - 0.3) / 0.7) * (s > 0.3 ? 1 : 0);
		const lift = Math.sin(Math.PI * s) * 1.2;
		const [row, col] = CUT[key];
		const scale = lerp(LIST_SCALE, 1, move);
		const flat: P = [LIST_AT[0] + col * LIST_FS * 0.6 - (PADX / L) * LIST_SCALE, LIST_AT[1] + row * LIST_PITCH + ((CARD_H - CODE_Y) / L) * LIST_SCALE];
		const spot = WORK[key];
		const tree: P = [leftOf(spot, key), spot.y];
		let hinge = pageAt(layout, 'work', lerp(flat[0], tree[0], move), lerp(flat[1], tree[1], move), lift);
		if (!isKept(key)) {
			stand *= 1 - ease(p - 3);
			out[key] = { hinge: add(hinge, [0, 0, FLOAT * Math.min(1, stand)]), theta: STAND * stand, float: FLOAT * Math.min(1, stand), s: scale };
			return;
		}
		const j = kept.indexOf(key);
		if (p > 4) {
			const down = ease((p - 4) / 0.5);
			stand *= 1 - down;
			const g = ease((p - 4.5) / 0.25);
			const stackAt = (page: PageKey) => pageAt(layout, page, GATHER[page][0] + j * 0.18, GATHER[page][1] + j * 0.12, j * 0.05);
			hinge = [lerp(hinge[0], stackAt('work')[0], g), lerp(hinge[1], stackAt('work')[1], g), lerp(hinge[2], stackAt('work')[2], g)];
			const c = ease(p - 5);
			if (p > 5) {
				const a = stackAt('work');
				const b = stackAt('browser');
				hinge = [lerp(a[0], b[0], c), lerp(a[1], b[1], c), lerp(a[2], b[2], c) + Math.sin(Math.PI * clamp(p - 5)) * 1.7];
			}
			if (p > 6.3) {
				const m = MAP[key]!;
				const spread = ease((p - 6.3) / 0.45);
				const b = stackAt('browser');
				const to = pageAt(layout, 'browser', leftOf(m, key), m.y);
				hinge = [lerp(b[0], to[0], spread), lerp(b[1], to[1], spread), lerp(b[2], to[2], spread)];
				stand = pop((p - 6.4) / 0.6) * (p > 6.4 ? 1 : 0);
			}
		}
		const f = Math.min(1, stand);
		out[key] = { hinge: add(hinge, [0, 0, FLOAT * f]), theta: STAND * stand, float: FLOAT * f, s: scale };
	});
	return out;
}

/** A point on a cutout's face: `u` across from its left edge, `v` down from its top, both in world units. */
const onCard = (pose: CardPose, h: number, u: number, v: number): Point3 => [pose.hinge[0] + u * pose.s, pose.hinge[1] - Math.cos(pose.theta) * (h - v) * pose.s, pose.hinge[2] + Math.sin(pose.theta) * (h - v) * pose.s];
const normalOf = (pose: CardPose): Point3 => [0, Math.sin(pose.theta), Math.cos(pose.theta)];

/** The cover that folds over the map: hinged at the stack's back edge, flat behind it at 0, shut over it at 180 degrees. */
const COVER = { w: 14.2, d: 3.6 };
function coverAt(p: number, layout: Layout) {
	const pa = pageAt(layout, 'work', GATHER.work[0] - 0.35, GATHER.work[1] - SHAPES.status.h - 0.3, 0.02);
	const pb = pageAt(layout, 'browser', GATHER.browser[0] - 0.35, GATHER.browser[1] - SHAPES.status.h - 0.3, 0.02);
	const c = ease(p - 5);
	let hinge: Point3 = [lerp(pa[0], pb[0], c), lerp(pa[1], pb[1], c), lerp(pa[2], pb[2], c)];
	if (p > 5 && p < 6) hinge = add(hinge, [0, 0, Math.sin(Math.PI * clamp(p - 5)) * 1.7]);
	let phi = 0;
	if (p >= 4.75 && p <= 5) phi = Math.PI * ease((p - 4.75) / 0.25);
	if (p > 5 && p < 6) phi = Math.PI;
	if (p >= 6) phi = Math.PI * (1 - ease((p - 6) / 0.3));
	return { hinge, phi, o: p <= 4.5 || p >= 6.6 ? 0 : 1 };
}
const onCover = (c: { hinge: Point3; phi: number }, u: number, v: number): Point3 => [c.hinge[0] + u, c.hinge[1] - Math.cos(c.phi) * v, c.hinge[2] + Math.sin(c.phi) * v + 0.06];

/** The page's extent of the spread in the world. */
function spreadOf(layout: Layout) {
	const a = pageAt(layout, 'work', 0, 0);
	const b = pageAt(layout, 'browser', PW, PD);
	return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
}

/** The window's plane: `u` across from its left edge, `v` down from its top, both in world units. */
const onWindow = (layout: Layout, u: number, v: number, lift = 0): Point3 => {
	const base = pageAt(layout, 'browser', WIN.x0 + u, WIN.y, FLOAT);
	return [base[0], base[1] - Math.cos(WIN.lean) * (WIN.h - v) + Math.sin(WIN.lean) * lift, base[2] + Math.sin(WIN.lean) * (WIN.h - v) + Math.cos(WIN.lean) * lift];
};

/** The one camera, fitted to the book, the standing cutouts and the window. */
function cameraOf(layout: Layout) {
	const sp = spreadOf(layout);
	const bounds: Point3[] = [];
	for (const [x, y] of [[sp.x0 - BOARD, sp.y0 - BOARD], [sp.x1 + BOARD, sp.y0 - BOARD], [sp.x1 + BOARD, sp.y1 + BOARD], [sp.x0 - BOARD, sp.y1 + BOARD]] as P[]) bounds.push([x, y, 0], [x, y, -BLOCK - 0.2]);
	for (const at of [1, 7]) {
		const poses = posesAt(at, layout);
		for (const key of NODE_KEYS) bounds.push(onCard(poses[key], SHAPES[key].h, 0, 0), onCard(poses[key], SHAPES[key].h, SHAPES[key].w, 0));
	}
	bounds.push(onWindow(layout, 0, 0), onWindow(layout, WIN.x1 - WIN.x0, 0));
	const view = { azimuth: layout.camera.azimuth, elevation: layout.camera.elevation, distance: layout.camera.distance, target: [0, 0, 0] as Point3 };
	const probe = createCamera({ width: layout.width, height: 10000, view, bounds, pad: 4 });
	const ys = bounds.map((b) => probe.proj(b)[1]);
	const height = Math.ceil(Math.max(...ys) - Math.min(...ys) + 8);
	return { cam: createCamera({ width: layout.width, height, view, bounds, pad: 4 }), height };
}

/** A piece placed per story key: a matrix and an opacity for each key. */
interface Track {
	keys: string;
	start: string;
	fade0: number;
}
function track(frames: { m: number[]; o: number }[]): Track {
	const rounded = frames.map(({ m, o }) => ({ m, o: Math.round(clamp(o) * 100) / 100 }));
	return { keys: rounded.map(({ m, o }) => fmt(m) + ' ' + o).join('|'), start: css(rounded[0]!.m), fade0: rounded[0]!.o };
}

const TAB = 20;

/** Where the word `status` sits on a cutout's code line, in local units. */
function wordOn(key: NodeKey) {
	const text = SHAPES[key].code.map((t) => t.text).join('');
	const c = colsOf(text.slice(0, text.indexOf('status')));
	return { x0: PADX + c * COL, x1: PADX + (c + 6) * COL, y: CODE_Y - CFS * 0.33 };
}

/** Ink every view shares: each cutout in its own units, the tabs, the window, the cover, the cursor and the timeline's thumb and play and pause marks. */
function sharedInk() {
	const cards = NODE_KEYS.map((key, i) => {
		const shape = SHAPES[key];
		const seed = 1000 + i * 40;
		const cw = shape.w * L;
		const ch = shape.h * L;
		const rect = roundRect(0, 0, cw, ch, 2, 3);
		const foot: P[] = [[0, ch - 7], [cw, ch - 6], [cw, ch], [0, ch]];
		const strip: P[] = [[0, 0], [cw, 0], [cw + 2, 40], [2, 40]];
		const core: P[] = [[-1, 0], [cw + 1, 0], [cw + 1, 11], [-1, 9]];
		const top: P[] = [[0.5, 0], [cw, 0], [cw + 1.3, -1.7], [1.8, -1.7]];
		const side: P[] = [[cw, 0], [cw + 1.3, -1.7], [cw + 1.3, ch - 1.7], [cw, ch]];
		const sx = shape.stampX;
		const box: P[] = [[sx - 3, STAMP_Y - 9], [sx + shape.stampW + 3, STAMP_Y - 9.3], [sx + shape.stampW + 3.3, STAMP_Y + 3], [sx - 3.2, STAMP_Y + 3.2]];
		return {
			key,
			w: r1(cw),
			h: r1(ch),
			once: !isKept(key),
			paper: pathOf(rect, true),
			edge: pathOf(top, true) + pathOf(side, true),
			edgeInk: line([[1.8, -1.7], [cw + 1.3, -1.7], [cw + 1.3, ch - 1.7]], { w: 0.55, seed: seed + 1, over: 0.6 }),
			ink: outline(jitter(rect, seed + 2, 0.5), { w: 1.1, heavy: 1.6, seed: seed + 3, over: 2 }) + outline(jitter(rect, seed + 4, 0.7), { w: 0.45, seed: seed + 5, over: 1.4 }),
			tone: hatch(foot, -0.5, 2, seed + 7, { cluster: 4, skip: 0.3, trim: 0.5 }) + hatch([[cw - 6, 2], [cw, 2], [cw, ch], [cw - 8, ch]], 1.25, 2.2, seed + 8, { cluster: 3, skip: 0.35, trim: 0.5 }),
			code: typeset(shape.code, PADX, CODE_Y, COL),
			kind: { x: PADX, y: KIND_Y, text: shape.kind },
			stamp: { x: r1(sx), y: STAMP_Y, text: shape.stamp, box: pathOf(jitter(resample([...box, box[0]!], 6), 800 + i, 0.5)), cx: r1(sx + shape.stampW / 2), cy: r1(STAMP_Y - 3), tone: shape.stamp === 'NEVER CHANGES' ? 'once' : 'live' },
			shadow: {
				wash: wash(strip, seed + 10, 1.2, 2.5),
				hatch: hatch(strip, -0.4, 3.2, seed + 11, { cluster: 5, skip: 0.3, trim: 0.4 }),
				core: hatch(core, 0.6, 1.3, seed + 12, { cluster: 4, skip: 0.12 }) + hatch(core, -1.1, 1.5, seed + 13, { cluster: 3, skip: 0.2 }) + hatch(core.map(([x, y]) => [x, y * 0.5] as P), 0.1, 1.2, seed + 14, { cluster: 3 }),
			},
		};
	});

	const leaf: P[] = [[0, 0], [TAB, 0], [TAB, TAB], [0, TAB]];
	const vee: P[] = [[0, 0], [TAB, 0], [0, TAB]];
	const tab = {
		paper: pathOf(leaf, true),
		tone: hatch(leaf, 0.35, 1.8, 590, { cluster: 3, skip: 0.15 }),
		ink: outline(leaf, { w: 0.9, heavy: 1.2, seed: 591, over: 1 }),
		vee: pathOf(vee, true),
		veeHatch: hatch(vee, 1.1, 1.1, 592, { cluster: 3 }) + hatch(vee, -0.3, 1.3, 593, { cluster: 3, skip: 0.2 }),
		veeInk: line([[TAB, 0], [0, TAB]], { w: 0.9, seed: 594, over: 0.6 }) + line([[TAB * 0.98, TAB * 0.05], [TAB * 0.05, TAB * 0.98]], { w: 0.35, seed: 595, over: 0.4 }),
	};

	const marks = (['status', 'slot', 'assign'] as NodeKey[]).map((key, i) => {
		const w = wordOn(key);
		const cx = (w.x0 + w.x1) / 2;
		const rx = (w.x1 - w.x0) / 2 + 3.5;
		const ry = CFS * 0.68;
		const ring: P[] = Array.from({ length: 40 }, (_, k) => {
			const a = -2.3 + (k / 39) * (Math.PI * 2 + 0.5);
			const grow = 1 + (k / 39) * 0.07;
			return [cx + Math.cos(a) * rx * grow, w.y + Math.sin(a) * ry * grow];
		});
		return { key, i: NODE_KEYS.indexOf(key), ring: line(ring, { w: 0.65, seed: 540 + i, over: 1 }) };
	});

	const ww = (WIN.x1 - WIN.x0) * L;
	const wh = WIN.h * L;
	const frame = roundRect(0, 0, ww, wh, 3, 3);
	const bar: P[] = [[0, 0], [ww, 0], [ww, 12], [0, 12]];
	const url = roundRect(34, 2.5, 150, 9.8, 3.5, 3);
	const btn = roundRect(ww - 106, 49, ww - 10, 63.5, 6, 3);
	const valueX = 10 + STATUS_EM * WFS;
	const secondX = valueX + VALUE_EM[START]! * WFS + 10;
	const spot = (x0: number, em: number, seed: number) => {
		const sw = em * WFS;
		const pts: P[] = Array.from({ length: 22 }, (_, k) => {
			const a = (k / 22) * Math.PI * 2;
			return [x0 + sw / 2 + Math.cos(a) * (sw / 2 + 2), 43 - WFS * 0.32 + Math.sin(a) * 6];
		});
		return { wash: wash(pts, seed, 0.4, 1.4), edge: wash(pts, seed + 1, 0.1, 1.2) };
	};
	const strikeRnd = seeded(600);
	const sx0 = valueX - 1.5;
	const sx1 = valueX + VALUE_EM[START]! * WFS + 1;
	const sp: P[] = [[sx0, 39.5 + strikeRnd()], [(sx0 + sx1) / 2, 38.2 + strikeRnd()], [sx1, 37 + strikeRnd()]];
	const browser = {
		w: r1(ww),
		h: r1(wh),
		paper: pathOf(frame, true),
		edge: pathOf([[0.5, 0], [ww, 0], [ww + 1.4, -1.8], [1.9, -1.8]], true) + pathOf([[ww, 0], [ww + 1.4, -1.8], [ww + 1.4, wh - 1.8], [ww, wh]], true),
		ink: outline(jitter(frame, 880, 0.5), { w: 1.2, heavy: 1.6, seed: 881, over: 2 }) + outline(jitter(frame, 882, 0.8), { w: 0.45, seed: 883, over: 1.2 }) + line([[0, 12], [ww, 12.4]], { w: 0.6, seed: 884, over: 1 }),
		bar: hatch(bar, -0.5, 1.7, 885, { cluster: 4, skip: 0.15, trim: 0.3 }),
		dots: [9, 16, 23].map((x, k) => outline(Array.from({ length: 10 }, (_, j) => [x + Math.cos((j / 10) * Math.PI * 2) * 2.1, 6 + Math.sin((j / 10) * Math.PI * 2) * 2.1] as P), { w: 0.5, seed: 886 + k })).join(''),
		url: { paper: pathOf(url, true), ink: outline(url, { w: 0.5, seed: 890, over: 0.6 }), x: 40, y: 8.6, text: 'beanshop.dev/order' },
		lines: [{ key: 0, x: 10, y: 27, text: '☕ Latte for Marcus' }, { key: 1, x: 10, y: 43, text: 'Status:' }],
		button: { paper: pathOf(btn, true), wash: wash(btn, 892, 0.8, 1.6), ink: outline(jitter(btn, 893, 0.4), { w: 0.8, heavy: 1.4, seed: 894, over: 1 }), x: ww - 58, y: 59.6, text: 'Mark ready 🔔' },
		tone: hatch([[ww - 9, 13], [ww, 13], [ww, wh], [ww - 11, wh]], 1.25, 2, 895, { cluster: 3, skip: 0.3, trim: 0.5 }),
		value: { x: r1(valueX), x2: r1(secondX), y: 43, size: WFS, spots: { a: spot(valueX, VALUE_EM[START]!, 610), b: spot(secondX, VALUE_EM[READY_TEXT]!, 620) }, strike: { d: `M${r1(sp[0]![0])} ${r1(sp[0]![1])}Q${r1(sp[1]![0])} ${r1(sp[1]![1])} ${r1(sp[2]![0])} ${r1(sp[2]![1])}`, length: r1(lengthOf(sp) + 2) } },
		shadow: {
			wash: wash([[0, 0], [ww, 0], [ww + 2, 46], [2, 46]], 896, 1.2, 2.5),
			hatch: hatch([[0, 0], [ww, 0], [ww + 2, 46], [2, 46]], -0.4, 3.2, 897, { cluster: 5, skip: 0.3, trim: 0.4 }),
			core: hatch([[-1, 0], [ww + 1, 0], [ww + 1, 12], [-1, 10]], 0.6, 1.3, 898, { cluster: 4, skip: 0.12 }) + hatch([[-1, 0], [ww + 1, 0], [ww + 1, 12], [-1, 10]], -1.1, 1.5, 899, { cluster: 3, skip: 0.2 }),
		},
	};

	const cw = COVER.w * L;
	const cd = COVER.d * L;
	const coverRect = roundRect(0, 0, cw, cd, 2, 3);
	const cover = {
		paper: pathOf(coverRect, true),
		ink: outline(jitter(coverRect, 760, 0.5), { w: 1.1, heavy: 1.5, seed: 761, over: 1.6 }),
		tone: hatch(coverRect, -0.6, 2.6, 762, { cluster: 4, skip: 0.45, trim: 0.5 }),
		label: { x: r1(cw / 2), y: r1(cd / 2 + 6), text: 'the map' },
		shadow: wash(roundRect(-4, -4, cw + 4, cd + 4, 8, 3), 763, 2, 4),
	};

	const arrow: P[] = ([[0, 0], [0, 15], [4, 11.5], [7, 18], [10, 16.5], [7, 10.2], [12, 10], [0, 0]] as P[]).map(([x, y]) => [x * 1.45, y * 1.45]);
	const cursor = { paper: pathOf(arrow, true), ink: outline(jitter(arrow, 770, 0.3), { w: 0.9, heavy: 1.3, seed: 771, over: 0.8 }), tap: outline(Array.from({ length: 14 }, (_, j) => [Math.cos((j / 14) * Math.PI * 2) * 7, Math.sin((j / 14) * Math.PI * 2) * 7] as P), { w: 0.6, seed: 772, over: 1 }) };

	const glassRing: P[] = Array.from({ length: 20 }, (_, j) => [Math.cos((j / 20) * Math.PI * 2) * 8.5, Math.sin((j / 20) * Math.PI * 2) * 8.5]);
	const glass = pencil(glassRing, 780, true, 3) + pencil([[6.2, 6.2], [15, 15]], 781, false, 3) + pencil([[7, 8.6], [14, 15.6]], 782, false, 2) + pencil([[-4, -3], [-1.5, -5.5]], 783, false, 1);

	const ring = (r: number, n: number): P[] => Array.from({ length: n }, (_, j) => [Math.cos((j / n) * Math.PI * 2) * r, Math.sin((j / n) * Math.PI * 2) * r]);
	const thumbRing = ring(THUMB_R, 24);
	const playMark: P[] = [[-4.5, -7], [7, 0], [-4.5, 7]];
	const pauseBar = (x: number): P[] => [[x, -7], [x + 3.4, -7], [x + 3.4, 7], [x, 7]];
	const timeline = {
		thumb: { paper: pathOf(thumbRing, true), ink: outline(jitter(thumbRing, 860, 0.25), { w: 1.2, heavy: 1.2, seed: 861, over: 1.2 }), hatch: hatch(ring(THUMB_R - 1.6, 18), -0.7, 2.1, 862, { cluster: 3, trim: 0.1 }) },
		play: { paper: pathOf(playMark, true), ink: outline(jitter(playMark, 870, 0.3), { w: 1.3, heavy: 1, seed: 871, over: 1 }), hatch: hatch(playMark, -0.9, 1.9, 872, { cluster: 3, trim: 0.1 }) },
		pause: { paper: pathOf(pauseBar(-5.2), true) + pathOf(pauseBar(1.8), true), ink: outline(jitter(pauseBar(-5.2), 880, 0.25), { w: 1.2, seed: 881, over: 0.8 }) + outline(jitter(pauseBar(1.8), 882, 0.25), { w: 1.2, seed: 883, over: 0.8 }), hatch: hatch(pauseBar(-5.2), -0.9, 1.7, 884, { cluster: 3, trim: 0.05 }) + hatch(pauseBar(1.8), -0.9, 1.7, 885, { cluster: 3, trim: 0.05 }) },
		ring: { ink: outline(jitter(ring(15, 28), 890, 0.5), { w: 1, heavy: 1.1, seed: 891, over: 1.6 }) },
	};
	const sizes = { head: HEAD_FS * L, caption: CAP_FS * L, control: CTRL_FS * L, listing: LIST_FS * L, code: CFS, kind: KFS, stamp: SFS, window: WFS, url: 7, button: 10.5, usual: 7.5 };
	return { cards, tab, marks, browser, cover, cursor, glass, timeline, sizes };
}

/** The two tabs under a cutout: each a front leaf from the face's bottom edge down to the page, and the dark V of its side. */
function tabsOf(pose: CardPose, shape: CardShape) {
	const tw = Math.min(1.1, shape.w * 0.2);
	const inset = Math.min(0.6, shape.w * 0.08);
	return [inset, shape.w - inset - tw].map((u0) => {
		const top = onCard(pose, shape.h, u0, shape.h);
		const reach = 0.5;
		const footFront: Point3 = [top[0], top[1] + reach, top[2] - pose.float];
		const footBack: Point3 = [top[0] + tw, top[1] - reach, top[2] - pose.float];
		return { top, topRight: add(top, [tw, 0, 0]), footFront, footBack, tw };
	});
}

/** A smooth curve through points: Catmull-Rom, `steps` samples per span. */
function smooth<T extends number[]>(pts: T[], steps = 10): T[] {
	if (pts.length < 3) return pts;
	const out: T[] = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)]!;
		const p1 = pts[i]!;
		const p2 = pts[i + 1]!;
		const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
		for (let s = 0; s < steps; s++) {
			const t = s / steps;
			const t2 = t * t;
			const t3 = t2 * t;
			out.push(p1.map((_, k) => 0.5 * (2 * p1[k]! + (-p0[k]! + p2[k]!) * t + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * t2 + (-p0[k]! + 3 * p1[k]! - 3 * p2[k]! + p3[k]!) * t3)) as T);
		}
	}
	out.push(pts.at(-1)!);
	return out;
}

/** The book in the camera: board, page block edges, the two pages, the gutter with its dashed divide and ship arrow, and pencil layout lines. */
function bookInk(layout: Layout, proj: (p: Point3) => P, seed: number) {
	const sp = spreadOf(layout);
	const bw = sp.x1 - sp.x0;
	const bd = sp.y1 - sp.y0;
	const at = (u: number, v: number, z = 0): Point3 => [sp.x0 + u, sp.y0 + v, z];
	const flat = (z: number, du = 0, dv = 0) => (x: number, y: number) => proj(at(x / K + du, y / K + dv, z));
	const w = bw * K;
	const d = bd * K;
	const pages = layout.stacked ? [roundRect(0, 0, w, d / 2, 2.4, 3), roundRect(0, d / 2, w, d, 2.4, 3)] : [roundRect(0, 0, w / 2, d, 2.4, 3), roundRect(w / 2, 0, w, d, 2.4, 3)];
	const spread = flat(0);
	const band = (a: number, b: number): P[] => (layout.stacked ? [[1, a], [w - 1, a], [w - 1, b], [1, b]] : [[a, 1], [b, 1], [b, d - 1], [a, d - 1]]);
	const mid = layout.stacked ? d / 2 : w / 2;
	const board = roundRect(0, 0, (bw + BOARD * 2) * K, (bd + BOARD * 2) * K, 3, 3);
	const onBoard = flat(-BLOCK, -BOARD, -BOARD);
	const down = (u0: number, v0: number, along: Point3) => (x: number, y: number) => proj(add(at(u0, v0), add(scale3(along, x / K), [0, 0, -y / K])));
	const front = down(0, bd, [1, 0, 0]);
	const side = down(bw, 0, [0, 1, 0]);
	const edge = (len: number, to: (x: number, y: number) => P, s: number) => {
		const rect: P[] = [[0, 0], [len * K, 0], [len * K, BLOCK * K], [0, BLOCK * K]];
		let leaves = '';
		for (let i = 0; i < 4; i++) leaves += pathOf(jitter(resample([[1, ((i + 1) / 5) * BLOCK * K], [len * K - 1, ((i + 1) / 5) * BLOCK * K + 0.2]], 40), s + i, 0.3));
		return { paper: mapPath(pathOf(rect, true), to), ink: mapPath(outline(rect, { w: 0.5, heavy: 1.6, seed: s, over: 1 }), to), leaves: mapPath(leaves, to) };
	};
	const dashes: P[][] = [];
	const total = layout.stacked ? w : d;
	for (let s = 4; s < total - 4; s += 8) dashes.push(layout.stacked ? [[s, mid], [s + 5, mid + 0.2]] : [[mid, s], [mid - 0.2, s + 5]]);
	const dashInk = dashes.map((q, i) => line(q, { w: 1.5, seed: seed + 200 + i, over: 0.3 })).join('');
	const pencilLines = [
		...(layout.stacked ? [[[-2, d / 2 - 1.2], [w + 2, d / 2 - 1.1]], [[-2, d / 2 + 1.2], [w + 2, d / 2 + 1.3]]] : [[[w / 2 - 1.2, -2], [w / 2 - 1.1, d + 2]], [[w / 2 + 1.2, -2], [w / 2 + 1.3, d + 2]]]),
		[[-3, 0], [w + 3, 0]],
		[[-3, d], [w + 3, d]],
	] as P[][];
	return {
		board: { cloth: mapPath(pathOf(board, true), onBoard), ink: mapPath(outline(board, { w: 0.75, heavy: 1.6, seed: seed + 50, over: 1.2 }), onBoard) },
		front: edge(bw, front, seed + 60),
		side: edge(bd, side, seed + 70),
		pages: pages.map((pg) => mapPath(pathOf(pg, true), spread)),
		ink: mapPath(pages.map((pg, i) => outline(pg, { w: 0.62, heavy: 1.4, seed: seed + 20 + i, over: 1.2 })).join(''), spread),
		gutter: { soft: mapPath(wash(band(mid - 12, mid + 5), seed + 40, 0.4, 1.2), spread), deep: mapPath(wash(band(mid - 3, mid + 1.5), seed + 41, 0.2, 0.6), spread), dashes: mapPath(dashInk, spread) },
		pencil: mapPath(pencilLines.map((q, i) => pencil(q, seed + 90 + i)).join(''), spread),
	};
}

function view(layout: Layout) {
	const { cam, height } = cameraOf(layout);
	const proj = cam.proj;
	const frames = KEYS.map((p) => ({ p, poses: posesAt(p, layout) }));
	const placed = (fn: (poses: Record<NodeKey, CardPose>, p: number) => { m: number[]; o: number }) => track(frames.map(({ poses, p }) => fn(poses, p)));
	/** A fixed matrix for flat lettering at page point (x, y), one local unit being 1/L world units. */
	const lettering = (page: PageKey, x: number, y: number) => css(matrix(proj(pageAt(layout, page, x, y)), proj(pageAt(layout, page, x + 1, y)), proj(pageAt(layout, page, x, y + 1)), L, L));
	/** A screen quad around flat lettering, for hit areas: from (x, y - up) to (x + w, y + down) on the page. */
	const quad = (page: PageKey, x: number, y: number, w: number, up: number, down: number) => pathOf([[x, y - up], [x + w, y - up], [x + w, y + down], [x, y + down]].map(([a, b]) => proj(pageAt(layout, page, a!, b!, 0.02))), true);

	const rows = LISTING.map((row, r) => ({ key: r, at: lettering('work', LIST_AT[0], LIST_AT[1] + r * LIST_PITCH), tokens: typeset(row, 0, 0, LIST_FS * L * 0.6) }));
	const words = {
		heads: [
			{ key: 'work', at: lettering('work', HEAD_AT[0], HEAD_AT[1]), text: HEADINGS.work },
			{ key: 'browser', at: lettering('browser', HEAD_AT[0], HEAD_AT[1]), text: HEADINGS.browser },
		],
		caption: lettering('work', CAPTION_AT[0], CAPTION_AT[1]),
		usual: lettering('browser', USUAL_AT[0] + 1.1, USUAL_AT[1]),
	};
	const boxAt = (x: number, y: number) => ([[x, y - 0.85], [x + 0.85, y - 0.85], [x + 0.85, y], [x, y]] as P[]).map(([a, b]) => proj(pageAt(layout, 'browser', a, b, 0.02)));
	const box = boxAt(USUAL_AT[0], USUAL_AT[1]);
	const tickPts: P[] = [[USUAL_AT[0] + 0.12, USUAL_AT[1] - 0.4], [USUAL_AT[0] + 0.35, USUAL_AT[1] - 0.1], [USUAL_AT[0] + 0.95, USUAL_AT[1] - 1.05]];
	const controls = {
		box: [0, 1, 2, 3].map((k) => line([box[k]!, box[(k + 1) % 4]!], { w: 0.8, seed: 840 + k, over: 0.9 })).join(''),
		tick: line(tickPts.map(([a, b]) => proj(pageAt(layout, 'browser', a, b, 0.02))), { w: 1.1, seed: 841, over: 0.6 }),
		usualHit: quad('browser', USUAL_AT[0] - 0.4, USUAL_AT[1], 10.2, 1.4, 0.6),
	};

	/** The gutter's ship arrow: from the workshop page's front corner across to the browser page. */
	const shipFrom = layout.stacked ? pageAt(layout, 'work', 20.5, 27.4) : pageAt(layout, 'work', 18.6, 27.3);
	const shipTo = layout.stacked ? pageAt(layout, 'browser', 20.5, 1.9) : pageAt(layout, 'browser', 2.9, 27.3);
	const shipPath = resample(smooth([shipFrom, add(scale3(add(shipFrom, shipTo), 0.5), layout.stacked ? [-0.7, 0, 0] : [0, -0.9, 0]), shipTo], 10).map(proj), 2);
	const ship = {
		ink: line(shipPath, { w: 1.1, seed: 850, over: 0.6 }) + barbs(shipPath, 6).map((b, i) => line(b, { w: 1, seed: 851 + i, over: 0.4 })).join(''),
		at: layout.stacked ? lettering('work', 18.0, 28.75) : lettering('work', 19.4, 25.9),
	};

	const sp = spreadOf(layout);
	const deskZ = -BLOCK - 0.2;
	const off = onFloor([0, 0, 1.6]);
	const shadowOf = (grow: number): P[] => [[sp.x0, sp.y0], [sp.x1, sp.y0], [sp.x1, sp.y1], [sp.x0, sp.y1]].map(([x, y]) => proj([x! + Math.sign(x!) * (BOARD + grow) + off[0], y! + Math.sign(y!) * (BOARD + grow) + off[1], deskZ]));
	const desk = { wash: pathOf(shadowOf(0.4), true), hatch: hatch(shadowOf(0), -0.45, 2.6, 391, { cluster: 5, skip: 0.35 }) };

	/** Faint pink pencil where each cutout stands: its base line on both pages. */
	const bases: string[] = [];
	for (const key of NODE_KEYS) {
		const s = WORK[key];
		const x = leftOf(s, key);
		bases.push(pencil([proj(pageAt(layout, 'work', x - 0.6, s.y)), proj(pageAt(layout, 'work', x + SHAPES[key].w + 0.6, s.y))], 860 + NODE_KEYS.indexOf(key)));
		const m = MAP[key];
		if (m) bases.push(pencil([proj(pageAt(layout, 'browser', leftOf(m, key) - 0.6, m.y)), proj(pageAt(layout, 'browser', leftOf(m, key) + SHAPES[key].w + 0.6, m.y))], 870 + NODE_KEYS.indexOf(key)));
	}
	bases.push(pencil([proj(pageAt(layout, 'browser', WIN.x0 - 0.8, WIN.y)), proj(pageAt(layout, 'browser', WIN.x1 + 0.8, WIN.y))], 880));

	const cards = NODE_KEYS.map((key) => {
		const shape = SHAPES[key];
		const face = placed((poses, p) => {
			const pose = poses[key];
			return { m: matrix(proj(onCard(pose, shape.h, 0, 0)), proj(onCard(pose, shape.h, shape.w, 0)), proj(onCard(pose, shape.h, 0, shape.h)), shape.w * L, shape.h * L), o: isKept(key) && p >= 5 && p <= 6 ? 0 : 1 };
		});
		const shadow = placed((poses) => {
			const pose = poses[key];
			const o = proj(onCard(pose, shape.h, 0, shape.h));
			const x = proj(onCard(pose, shape.h, shape.w, shape.h));
			let y = proj(onFloor(onCard(pose, shape.h, 0, 0)));
			if (Math.hypot(y[0] - o[0], y[1] - o[1]) < 0.5) y = [o[0] + 0.3, o[1] - 0.4];
			return { m: matrix(o, x, y, shape.w * L, 40), o: Math.sin(pose.theta) * 0.95 };
		});
		const tabs = [0, 1].map((side) => ({
			key: side,
			leaf: placed((poses) => {
				const t = tabsOf(poses[key], shape)[side]!;
				return { m: matrix(proj(t.top), proj(t.topRight), proj(t.footFront), TAB, TAB), o: poses[key].float / FLOAT };
			}),
			vee: placed((poses) => {
				const t = tabsOf(poses[key], shape)[side]!;
				return { m: matrix(proj(t.topRight), proj(add(t.footFront, [t.tw, 0, 0])), proj(t.footBack), TAB, TAB), o: poses[key].float / FLOAT };
			}),
		}));
		return { key, i: NODE_KEYS.indexOf(key), kept: isKept(key), face, shadow, tabs };
	});

	const coverFrames = KEYS.map((p) => coverAt(p, layout));
	const cw = COVER.w * L;
	const cd = COVER.d * L;
	const cover = track(coverFrames.map((c) => ({ m: matrix(proj(onCover(c, 0, 0)), proj(onCover(c, COVER.w, 0)), proj(onCover(c, 0, COVER.d)), cw, cd), o: c.o })));
	const bundle = track(
		KEYS.map((p, k) => {
			const c = coverFrames[k]!;
			const lift = c.hinge[2];
			const base: Point3 = onFloor([c.hinge[0], c.hinge[1], lift]);
			const o: Point3 = [base[0], base[1], 0];
			return { m: matrix(proj(o), proj(add(o, [COVER.w, 0, 0])), proj(add(o, [0, COVER.d, 0])), cw, cd), o: p > 4.7 && p < 6.4 ? 0.25 + lift * 0.3 : 0 };
		}),
	);

	const ww = (WIN.x1 - WIN.x0) * L;
	const winM = (lift = 0) => css(matrix(proj(onWindow(layout, 0, 0, lift)), proj(onWindow(layout, WIN.x1 - WIN.x0, 0, lift)), proj(onWindow(layout, 0, WIN.h, lift)), ww, WIN.h * L));
	const winBase = (u: number) => onWindow(layout, u, WIN.h);
	const winShadow = (() => {
		const o = proj(winBase(0));
		const x = proj(winBase(WIN.x1 - WIN.x0));
		const y = proj(onFloor(onWindow(layout, 0, 0)));
		return css(matrix(o, x, y, ww, 46));
	})();
	const winTabs = [0.7, WIN.x1 - WIN.x0 - 1.8].map((u0, k) => {
		const top = onWindow(layout, u0, WIN.h);
		const footFront: Point3 = [top[0], top[1] + 0.5, top[2] - FLOAT];
		const footBack: Point3 = [top[0] + 1.1, top[1] - 0.5, top[2] - FLOAT];
		return { key: k, leaf: css(matrix(proj(top), proj(add(top, [1.1, 0, 0])), proj(footFront), TAB, TAB)), vee: css(matrix(proj(add(top, [1.1, 0, 0])), proj(add(footFront, [1.1, 0, 0])), proj(footBack), TAB, TAB)) };
	});
	const winPoint = (x: number, y: number) => proj(onWindow(layout, x / L, y / L, 0.04));
	const btnQuad = pathOf([[ww - 110, 46], [ww - 6, 46], [ww - 6, 66], [ww - 110, 66]].map(([a, b]) => winPoint(a!, b!)), true);
	const browser = { at: winM(), shadow: winShadow, tabs: winTabs, press: btnQuad, tap: winPoint(ww - 58, 57) };

	const fp = posesAt(7, layout);
	const wp = posesAt(2, layout);
	/** A pin on a cutout's face: `u` and `v` as fractions across and down, just off the face. */
	const pinOn = (poses: Record<NodeKey, CardPose>, key: NodeKey, u: number, v: number): Point3 => {
		const sh = SHAPES[key];
		return add(onCard(poses[key], sh.h, sh.w * u, sh.h * v), scale3(normalOf(poses[key]), 0.06));
	};
	/** A string through the air between points, sagging a little, as a screen path. */
	const thread = (run: Point3[], seed: number) => {
		const screen = resample(smooth(run, 10).map(proj), 2);
		const jit = jitter(screen, seed, 0.35);
		jit[0] = screen[0]!;
		jit[jit.length - 1] = screen.at(-1)!;
		return jit;
	};
	const asPath = (pts: P[]) => ({ d: pathOf(pts), length: r1(lengthOf(pts) + 2) });
	const sag = (a: Point3, b: Point3, by = 0.25): Point3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 - by];

	const margin = (y: number, z: number) => pageAt(layout, 'work', 20.75, y, z);
	const wStatus = pinOn(wp, 'status', 1, 0.45);
	const wSlot = pinOn(wp, 'slot', 1, 0.45);
	const wAssign = pinOn(wp, 'assign', 1, 0.45);
	const workThreads = [
		thread([wStatus, margin(WORK.status.y - 0.6, wStatus[2] - 0.2), margin(WORK.slot.y - 0.9, wSlot[2] - 0.2), wSlot], 700),
		thread([wStatus, margin(WORK.status.y - 0.4, wStatus[2] - 0.3), margin(WORK.slot.y + 1.2, 0.6), margin(WORK.assign.y - 1, wAssign[2] - 0.1), wAssign], 705),
	].map(asPath);

	const fStatusL = pinOn(fp, 'status', 0, 0.42);
	const fSlotR = pinOn(fp, 'slot', 1, 0.42);
	const fStatusLow = pinOn(fp, 'status', 0.035, 0.97);
	const fAssignTop = pinOn(fp, 'assign', (MAP.status!.x - SHAPES.status.w + 0.4 - MAP.assign!.x) / SHAPES.assign.w, 0.02);
	const fAssignR = pinOn(fp, 'assign', 1, 0.42);
	const fClickL = pinOn(fp, 'onClick', 0, 0.42);
	const fClickR = pinOn(fp, 'onClick', 1, 0.42);
	const fSlotTop = pinOn(fp, 'slot', 0.55, 0.02);
	const valueSpot = onWindow(layout, (10 + STATUS_EM * WFS + VALUE_EM[START]! * WFS * 0.45) / L, 46.5 / L, 0.05);
	const btnRight = onWindow(layout, (ww - 10) / L, 56 / L, 0.05);
	const winEdge = onWindow(layout, (ww + 4) / L, 59 / L, 0.05);
	const floorAt = (x: number, y: number) => pageAt(layout, 'browser', x, y, 0.05);
	const links = {
		button: thread([btnRight, winEdge, floorAt(WIN.x1 + 1.1, WIN.y + 0.6), floorAt(20.95, 14), floorAt(21, MAP.onClick!.y - 0.4), fClickR], 720),
		value: thread([fSlotTop, sag(fSlotTop, valueSpot, -0.2), valueSpot], 725),
	};
	const strings = {
		clickAssign: thread([fClickL, sag(fClickL, fAssignR), fAssignR], 730),
		assignStatus: thread([fAssignTop, sag(fAssignTop, fStatusLow, 0.05), fStatusLow], 733),
		statusSlot: thread([fStatusL, sag(fStatusL, fSlotR), fSlotR], 736),
	};
	const across = (a: Point3, b: Point3): P[] => resample([proj(a), proj(b)], 2);
	const pulse = [...links.button, ...across(fClickR, fClickL), ...strings.clickAssign, ...across(fAssignR, fAssignTop), ...strings.assignStatus, ...across(fStatusLow, fStatusL), ...strings.statusSlot, ...across(fSlotR, fSlotTop), ...links.value];
	const pin = (q: P, seed: number) => {
		const head: P[] = Array.from({ length: 12 }, (_, k) => [q[0] + Math.cos((k / 12) * Math.PI * 2) * 2.2, q[1] - 1 + Math.sin((k / 12) * Math.PI * 2) * 2]);
		return { key: seed, head: pathOf(head, true), ink: outline(head, { w: 0.5, seed }), glint: pathOf([[q[0] - 1.1, q[1] - 1.9], [q[0] - 0.3, q[1] - 2.4]]) };
	};

	/** The usual way: every piece as a faint pencil cutout standing on the browser page, with magnifying glasses hunting over them. */
	const usualCards = NODE_KEYS.map((key, i) => {
		const w = 4.65;
		const x = 0.9 + (i % 4) * 5.0;
		const y = i < 4 ? MAP.slot!.y : MAP.assign!.y;
		const pose: CardPose = { hinge: pageAt(layout, 'browser', x, y, 0), theta: STAND, float: 0, s: 1 };
		const h = 2.2;
		const corners = [onCard(pose, h, 0, 0), onCard(pose, h, w, 0), onCard(pose, h, w, h), onCard(pose, h, 0, h)].map(proj);
		const label = css(matrix(proj(onCard(pose, h, 0, 0)), proj(onCard(pose, h, 1, 0)), proj(onCard(pose, h, 0, 1)), L, L));
		const centre = proj(onCard(pose, h, w / 2, h * 0.45));
		return { key, kept: isKept(key), outline: pencil(corners, 900 + i, true, 2), paper: pathOf(corners, true), label, text: nodeOf(key).kind.toUpperCase(), centre };
	});
	const route = [[0, 5, 2, 7], [6, 1, 4, 3], [7, 3, 5, 0]];
	const glasses = route.map((stops, g) => ({
		key: g,
		style: stops.map((c, k) => `--x${k}:${r1(usualCards[c]!.centre[0] - 3)}px;--y${k}:${r1(usualCards[c]!.centre[1] - 8)}px`).join(';') + `;--delay:${g * 160}ms`,
	}));
	const keptCentres = (['status', 'slot', 'onClick', 'assign'] as NodeKey[]).map((k) => usualCards[NODE_KEYS.indexOf(k)]!);
	const usual = {
		cards: usualCards.map(({ centre: _centre, ...rest }) => rest),
		glasses,
		strings: pencil(keptCentres.map((c) => [c.centre[0], c.centre[1] - 9] as P), 950, false, 2),
	};

	return {
		key: layout.key,
		width: layout.width,
		height,
		desk,
		book: bookInk(layout, proj, layout.stacked ? 360 : 300),
		bases: bases.join(''),
		rows,
		words,
		controls,
		ship,
		browser,
		cards,
		cover,
		bundle,
		rail: railInk(layout.rail, layout.key === 'wide' ? 0 : 50),
		threads: workThreads,
		strings: [strings.clickAssign, strings.assignStatus, strings.statusSlot].map((s, i) => ({ key: i, ...asPath(s) })),
		links: [links.button, links.value].map((s, i) => ({ key: i, ...asPath(s) })),
		pulse: asPath(pulse),
		pins: [pin(proj(wStatus), 740), pin(proj(wSlot), 743), pin(proj(wAssign), 746)],
		knots: [fClickL, fAssignR, fAssignTop, fStatusLow, fStatusL, fSlotR, fSlotTop, fClickR].map((q, i) => pin(proj(q), 760 + i * 3)),
		usual,
	};
}

/** The timeline's rail: a long wobbly ink line across the full width, a pencil guide under it and a tick at every story stop. */
function railInk(width: number, seed: number) {
	const mid = RAIL_H / 2;
	const rnd = seeded(900 + seed);
	const along = Array.from({ length: 13 }, (_, j) => [(j / 12) * width, mid + (rnd() - 0.5) * 1.6] as P);
	const ticks = Array.from({ length: LAST + 1 }, (_, i) => {
		const x = (i / LAST) * width + (rnd() - 0.5) * 0.6;
		return line([[x + (rnd() - 0.5), mid - 6], [x, mid + 6.5]], { w: 1.2, seed: 920 + seed + i, over: 0.6, wobble: 0.3 });
	}).join('');
	return { width, height: RAIL_H, ticks, ink: line(along, { w: 1.5, heavy: 0.6, seed: 910 + seed, over: 2, wobble: 0.9 }), pencil: pencil([[-6, mid + 2.2], [width + 6, mid + 1.4]], 915 + seed, false, 2) };
}

/** The whole figure: shared ink, then a wide and a tall arrangement, frozen into popup.art.ts. */
export function drawing() {
	return { keys: KEYS, ink: sharedInk(), views: [view(WIDE), view(TALL)] };
}
