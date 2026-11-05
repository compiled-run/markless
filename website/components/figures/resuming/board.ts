// A chess board left mid-game with three pieces and a score sheet: the next move lifts one piece, and nothing else moves.
import { centreOf, createCamera, ellipse, type P, type Point3, shadowOnDesk } from '../ink/desk.ts';
import { clipTo, hatch, hull, line, outline, pathOf, pool, r1, stroke, wash } from '../ink/ink.ts';
import { deskPlane, plane } from '../ink/plane.ts';
import { FILES, type Kind, PIECES } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 420;

const S = 1.5;
const TOP = 0.55;
const RIM = 0.7;
/** The far rim is deeper, so the back rank's tall pieces stand on wood, not over the edge. */
const BACK = 2.6;
const BOARD = 8 * S;

const camera = createCamera({
	width: WIDTH,
	height: HEIGHT - 26,
	view: { azimuth: 94, elevation: 38, distance: 60, target: [9, 4.8, 0.8] },
	bounds: [
		[-RIM - 0.6, -BACK - 0.4, 0],
		[BOARD + RIM + 0.4, -BACK - 0.4, 0],
		[-RIM - 0.6, BOARD + RIM + 0.8, 0],
		[BOARD + 9.2, 6, 0],
		[BOARD + 9.2, BOARD + RIM + 0.8, 0],
		[4, -1, 3.4],
	],
	pad: 6,
});
const { proj, projAll } = camera;
const lift = 26;
const at = (p: Point3): P => {
	const [x, y] = proj(p);
	return [x, y + lift];
};
const atAll = (pts: Point3[]): P[] => pts.map(at);

export const squareCentre = (square: string): [number, number] => {
	const file = square.charCodeAt(0) - 97;
	const rank = Number(square[1]);
	return [file * S + S / 2, (8 - rank) * S + S / 2];
};

/** The board: a slab with a rim, light and hatched squares, and the file letters and rank numbers inked on the rim. */
function boardArt() {
	const top = plane(at, [0, 0, TOP], [1, 0, 0], [0, 1, 0]);
	const rimOuter = top.on([[-RIM, -BACK], [BOARD + RIM, -BACK], [BOARD + RIM, BOARD + RIM], [-RIM, BOARD + RIM]]);
	const front = atAll([[-RIM, BOARD + RIM, TOP], [BOARD + RIM, BOARD + RIM, TOP], [BOARD + RIM, BOARD + RIM, 0], [-RIM, BOARD + RIM, 0]]);
	const side = atAll([[BOARD + RIM, -BACK, TOP], [BOARD + RIM, BOARD + RIM, TOP], [BOARD + RIM, BOARD + RIM, 0], [BOARD + RIM, -BACK, 0]]);
	const castPts = [[-RIM, -BACK], [BOARD + RIM, -BACK], [BOARD + RIM, BOARD + RIM], [-RIM, BOARD + RIM]].flatMap(([x, y]) => [proj([x!, y!, 0]), proj(shadowOnDesk([x!, y!, TOP]))]).map(([x, y]) => [x, y + lift] as P);
	const cast = hull(castPts);
	const dark: string[] = [];
	for (let f = 0; f < 8; f++)
		for (let r = 0; r < 8; r++)
			if ((f + r) % 2 === 1) {
				const sq = top.on([[f * S, r * S], [(f + 1) * S, r * S], [(f + 1) * S, (r + 1) * S], [f * S, (r + 1) * S]]);
				dark.push(hatch(sq, -0.85, 1.25, 3000 + f * 8 + r, { cluster: 3, skip: 0.08, trim: 0.12 }));
			}
	const grid = [0, 8].map((i) => line(top.on([[0, i * S], [BOARD, i * S]]), { w: 0.9, seed: 3100 + i })).join('') + [0, 8].map((i) => line(top.on([[i * S, 0], [i * S, BOARD]]), { w: 0.9, seed: 3110 + i })).join('');
	return {
		cast: { wash: wash(cast, 3200, 2, 3), hatch: hatch(cast, -0.4, 2.2, 3201, { cluster: 5, skip: 0.3, trim: 0.4 }) },
		paper: pathOf(rimOuter, true) + pathOf(front, true) + pathOf(side, true),
		rimTone: wash(rimOuter, 3202, 0.4, 1.5),
		dark: dark.join(''),
		front: hatch(front, 0.15, 1.6, 3203, { cluster: 4, skip: 0.1 }),
		side: hatch(side, 1.25, 1.2, 3204, { cluster: 3 }) + hatch(side, -0.4, 1.8, 3205, { cluster: 3, skip: 0.3 }),
		ink: outline(rimOuter, { w: 1.6, heavy: 1.4, centre: centreOf(rimOuter), seed: 3206 }) + outline(front, { w: 1.2, heavy: 1, seed: 3207 }) + outline(side, { w: 1.2, heavy: 1, seed: 3208 }) + grid,
	};
}

type Profile = ReadonlyArray<readonly [number, number]>;

const PROFILES: Record<Exclude<Kind, 'knight'>, Profile> = {
	pawn: [[0, 0.5], [0.12, 0.5], [0.2, 0.38], [0.34, 0.26], [0.72, 0.18], [0.8, 0.27], [0.88, 0.3], [1.02, 0.28], [1.14, 0.2], [1.2, 0.08], [1.22, 0]],
	rook: [[0, 0.55], [0.14, 0.55], [0.24, 0.42], [0.4, 0.34], [1.08, 0.3], [1.16, 0.4], [1.42, 0.4], [1.42, 0.3]],
	bishop: [[0, 0.52], [0.13, 0.52], [0.22, 0.4], [0.4, 0.27], [1.0, 0.19], [1.08, 0.3], [1.16, 0.22], [1.36, 0.27], [1.56, 0.18], [1.72, 0.06], [1.8, 0.07], [1.86, 0]],
	queen: [[0, 0.56], [0.14, 0.56], [0.24, 0.43], [0.42, 0.3], [1.22, 0.2], [1.3, 0.32], [1.38, 0.24], [1.66, 0.38], [1.74, 0.3], [1.86, 0.12], [1.92, 0]],
	king: [[0, 0.58], [0.14, 0.58], [0.24, 0.45], [0.42, 0.32], [1.3, 0.22], [1.38, 0.34], [1.46, 0.26], [1.74, 0.36], [1.82, 0.2], [1.86, 0]],
};
const KNIGHT_BASE: Profile = [[0, 0.56], [0.14, 0.56], [0.24, 0.44], [0.4, 0.4], [0.6, 0.42]];
const KNIGHT_HEAD: P[] = [[-0.45, 0.59], [0.43, 0.59], [0.28, 0.94], [0.38, 1.16], [0.78, 1.32], [0.98, 1.51], [0.83, 1.70], [0.40, 1.77], [0.25, 2.03], [0.00, 2.19], [-0.12, 2.03], [-0.45, 1.89], [-0.70, 1.56], [-0.70, 1.16], [-0.45, 0.90]];
const KING_CROSS: P[] = [[-0.06, 1.84], [0.06, 1.84], [0.06, 1.96], [0.17, 1.96], [0.17, 2.06], [0.06, 2.06], [0.06, 2.2], [-0.06, 2.2], [-0.06, 2.06], [-0.17, 2.06], [-0.17, 1.96], [-0.06, 1.96]];

const K = 1.75;

function circleAt(cx: number, cy: number, z: number, r: number, n = 28): Point3[] {
	z *= K;
	r *= K;
	return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r, TOP + z] as Point3);
}

/** A turned piece's outline as the camera sees it: both side chains of its stacked rings, closed by the near half of its base. */
function silhouette(cx: number, cy: number, profile: Profile): P[] {
	const samples: Array<{ left: P; right: P; ring: P[] }> = [];
	for (let i = 0; i < profile.length - 1; i++) {
		const [z0, r0] = profile[i]!;
		const [z1, r1v] = profile[i + 1]!;
		for (let k = 0; k < 3; k++) {
			const t = k / 3;
			const ring = atAll(circleAt(cx, cy, z0 + (z1 - z0) * t, Math.max(0.001, r0 + (r1v - r0) * t)));
			const left = ring.reduce((a, b) => (b[0] < a[0] ? b : a));
			const right = ring.reduce((a, b) => (b[0] > a[0] ? b : a));
			samples.push({ left, right, ring });
		}
	}
	const [zl, rl] = profile.at(-1)!;
	const last = atAll(circleAt(cx, cy, zl, Math.max(0.001, rl)));
	samples.push({ left: last.reduce((a, b) => (b[0] < a[0] ? b : a)), right: last.reduce((a, b) => (b[0] > a[0] ? b : a)), ring: last });
	const base = samples[0]!.ring;
	const mid = (base[0]![1] + base[Math.floor(base.length / 2)]![1]) / 2;
	const nearBase = base
		.filter((p) => p[1] >= mid - 0.01)
		.sort((a, b) => b[0] - a[0]);
	const topRing = samples.at(-1)!.ring;
	const topMid = (topRing[0]![1] + topRing[Math.floor(topRing.length / 2)]![1]) / 2;
	const farTop = rl > 0.05 ? topRing.filter((p) => p[1] <= topMid + 0.01).sort((a, b) => a[0] - b[0]) : [];
	return [...samples.map((s) => s.left), ...farTop, ...samples.map((s) => s.right).reverse(), ...nearBase];
}

/** The near half of one ring of a turned piece: a collar line. */
function collar(cx: number, cy: number, z: number, r: number): P[] {
	const ring = atAll(circleAt(cx, cy, z, r, 32));
	const mid = (ring[0]![1] + ring[16]![1]) / 2;
	return ring.filter((p) => p[1] >= mid - 0.01).sort((a, b) => a[0] - b[0]);
}

function shadowOf(cx: number, cy: number, height: number, radius: number): P[] {
	const pts = [...circleAt(cx, cy, 0, radius, 20), ...circleAt(cx, cy, height, radius * 0.5, 12)].map((p) => {
		const s = shadowOnDesk(p, TOP);
		return at(s);
	});
	return hull(pts);
}

/** A flat shape standing upright through the piece's centre, facing the viewer. */
const upright = (cx: number, cy: number, pts: P[], mirror: boolean): P[] => atAll(pts.map(([x, z]) => [cx + (mirror ? -x : x) * K, cy, TOP + z * K]));

function pieceArt(id: string, kind: Kind, white: boolean, square: string, seed: number) {
	const [cx, cy] = squareCentre(square);
	const profile = kind === 'knight' ? KNIGHT_BASE : PROFILES[kind];
	const body = silhouette(cx, cy, profile);
	const extra = kind === 'knight' ? upright(cx, cy, KNIGHT_HEAD, !white) : kind === 'king' ? upright(cx, cy, KING_CROSS, false) : [];
	const height = kind === 'knight' ? 1.62 : kind === 'king' ? 2.2 : profile.at(-1)![0];
	const centre = centreOf(body);
	const shadeClip: P[] = [[centre[0] + 1.2, -50], [centre[0] + 200, -50], [centre[0] + 200, HEIGHT + 50], [centre[0] + 1.2, HEIGHT + 50]];
	const collars = profile
		.filter((_, i) => i > 0 && i < profile.length - 1 && i % 3 === 2)
		.map(([z, r], i) => line(collar(cx, cy, z, r), { w: 0.6, seed: seed + 40 + i, over: 0 }))
		.join('');
	const flatTop = kind === 'rook' ? outline(atAll(circleAt(cx, cy, profile.at(-1)![0], 0.3, 24)), { w: 0.7, seed: seed + 50 }) + [0, 1, 2, 3].map((q) => line(atAll([[cx + Math.cos(q * 1.57 + 0.4) * 0.3 * K, cy + Math.sin(q * 1.57 + 0.4) * 0.3 * K, TOP + 1.42 * K], [cx + Math.cos(q * 1.57 + 0.4) * 0.4 * K, cy + Math.sin(q * 1.57 + 0.4) * 0.4 * K, TOP + 1.42 * K]]), { w: 0.7, seed: seed + 51 + q, over: 0 })).join('') : '';
	const eye = kind === 'knight' ? upright(cx, cy, [[0.3, 1.62]], !white)[0]! : undefined;
	const bodyShade = hatch(clipTo(body, shadeClip), 1.15, white ? 1.5 : 1.1, seed + 10, { cluster: 3, trim: 0.2 });
	const bodyDark = white ? '' : hatch(body, -0.75, 1.05, seed + 20, { cluster: 3, skip: 0.04, trim: 0.1 }) + hatch(body, 0.55, 1.6, seed + 30, { cluster: 3, skip: 0.15, trim: 0.15 });
	const topShade = extra.length ? hatch(clipTo(extra, shadeClip), 1.15, white ? 1.5 : 1.1, seed + 11, { cluster: 3, trim: 0.2 }) : '';
	const topDark = extra.length && !white ? hatch(extra, -0.75, 1.05, seed + 21, { cluster: 3, skip: 0.04, trim: 0.1 }) + hatch(extra, 0.55, 1.6, seed + 31, { cluster: 3, skip: 0.15, trim: 0.15 }) : '';
	return {
		id,
		cast: wash(shadowOf(cx, cy, height, 0.5), seed, 1, 2),
		paper: pathOf(body, true),
		tone: bodyShade + bodyDark,
		ink: outline(body, { w: 1.05, heavy: 0.9, centre, seed: seed + 60 }) + collars + flatTop,
		topPaper: extra.length ? pathOf(extra, true) : '',
		topTone: topShade + topDark,
		topInk: extra.length ? outline(extra, { w: 1.05, heavy: 0.9, centre, seed: seed + 61 }) + (eye ? stroke([eye, [eye[0] + 0.8, eye[1] + 0.3]], { w: 0.9, seed: seed + 70, over: 0 }) : '') : '',
	};
}


/** Where every square's centre lands on screen, so a dragged piece can find the square under it. */
function squaresArt() {
	const out: Record<string, [number, number]> = {};
	for (let f = 0; f < 8; f++)
		for (let r = 1; r <= 8; r++) {
			const square = FILES[f]! + r;
			const [x, y] = at([...squareCentre(square), TOP] as Point3);
			out[square] = [r1(x), r1(y)];
		}
	return out;
}

/** The score sheet beside the board: paper, ruled lines, and where each written move goes. */
function sheetArt() {
	const sheet = deskPlane(at, [BOARD + 4.2, 6.4], 4.4, 6.6, 0.05);
	const body = sheet.on([[0, 0], [4.4, 0], [4.4, 6.6], [0, 6.6]]);
	const cast = hull([...body.map(([x, y]) => [x + 3, y + 3] as P), ...body]);
	const rows = [1.6, 3.1, 4.6, 6.1];
	return {
		cast: wash(cast, 3500, 1, 2),
		paper: pathOf(body, true),
		ink: outline(body, { w: 1.1, heavy: 0.9, centre: centreOf(body), seed: 3501 }) + rows.map((v, i) => line(sheet.on([[0.35, v], [4.05, v]]), { w: 0.45, seed: 3510 + i, over: 0 })).join(''),
		lines: rows.map((v) => sheet.matrix(0.5, v - 0.25, 0.1)),
		spot: (() => {
			const slot = sheet.on(ellipse(1.7, rows[0]! - 0.55, 1.4, 0.5, 26), 0.02);
			return { wash: wash(slot, 3520, 1.2, 3), pool: wash(pool(slot, centreOf(slot), 0.55), 3521, 0.5, 2) };
		})(),
	};
}

/** The one margin note, top left, with a loose arrow to the board. */
function noteArt() {
	const aim = at([2.4, -BACK - 0.1, TOP + 0.3]);
	const from: P = [96, 32];
	const pts: P[] = Array.from({ length: 16 }, (_, i) => {
		const t = i / 15;
		const c: P = [from[0] - 30, (from[1] + aim[1]) / 2];
		return [(1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * c[0] + t * t * (aim[0] - 3), (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * c[1] + t * t * (aim[1] - 6)];
	});
	const end = pts.at(-1)!;
	const prev = pts.at(-4)!;
	const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
	const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
	return { x: 4, y: 22, arrow: line(pts, { w: 1.3, seed: 3600, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: 3601, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: 3602, over: 0.5 }) };
}

/** The whole scene, frozen into board.art.ts. Pieces are listed back to front. */
export function drawing() {
	const ordered = [...PIECES].sort((a, b) => squareCentre(a.square)[1] - squareCentre(b.square)[1] || squareCentre(a.square)[0] - squareCentre(b.square)[0]);
	return {
		width: WIDTH,
		height: HEIGHT,
		board: boardArt(),
		pieces: ordered.map((piece, i) => pieceArt(piece.id, piece.kind, piece.white, piece.square, 4000 + i * 100)),
		squares: squaresArt(),
		sheet: sheetArt(),
		note: noteArt(),
		desk: hatch(projAll([[-3, BOARD + RIM + 0.4, 0], [BOARD + 3, BOARD + RIM + 0.4, 0], [BOARD + 3, BOARD + RIM + 2.6, 0], [-3, BOARD + RIM + 2.6, 0]]).map(([x, y]) => [x, y + lift] as P), -0.5, 2.6, 3700, { cluster: 5, skip: 0.35, trim: 0.5 }),
	};
}
