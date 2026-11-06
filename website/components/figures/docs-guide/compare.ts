// Two small ink sketches side by side: a chess corner you can play (the real object) and the rejected CI boarding pass with its stamps (a metaphor to decode).
import { centreOf, ellipse, matrixOf } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, r1, seeded, wash } from '../ink/ink.ts';
import { desk, type DeskArt, type Point3 } from '../ink/sheets.ts';

const SQ = 1.25;
const N = 5;
const BOARD = { key: 'board', x: 0, y: 0, w: SQ * N + 0.8, h: SQ * N + 0.8, curl: false } as const;
const PASS = { key: 'pass', x: BOARD.w + 2.2, y: 1.1, w: 10.4, h: 5.4, turn: -0.04 } as const;
const STUB = 7.6;

/** Where the knight stands, and the one square it may hop to. */
export const KNIGHT = { from: [1, 3] as const, to: [2, 1] as const };
export const PAWNS = [[3, 2], [4, 4]] as const;

const scene = () => desk(680, [BOARD, PASS], [[BOARD.w + 0.6, -1.8, 2.4]], { elevation: 58 });
type Kit = ReturnType<typeof scene>;
const sq = (c: number, r: number): [number, number] => [0.4 + (c + 0.5) * SQ, 0.4 + (r + 0.5) * SQ];

function flat(art: DeskArt) {
	return { paths: art.layers.flatMap((l) => l.paths).map((p, key) => ({ ...p, key })), texts: art.layers.flatMap((l) => l.texts).map((t, key) => ({ ...t, key })) };
}

/** An upright piece standing on a board square: a turned base, a body and a head, hatched on its shade side. */
function piece(k: Kit, c: number, r: number, tall: number, seed: number, knight = false) {
	const [u, v] = sq(c, r);
	const o = k.raw.at('board', u, v);
	const ring = (z: number, rad: number): Point3[] => ellipse(o[0], o[1], rad, rad * 0.9, 24).map(([x, y]) => [x, y, z] as Point3);
	const P = k.raw.projAll;
	const shadow = hull(ring(0, 0.5).map(([x, y]) => k.raw.proj([x + 0.45, y + 0.4, 0])));
	k.raw.path(wash(shadow, seed, 0.5, 1.2), 'shadow-wash light');
	const base = hull([...P(ring(0, 0.5)), ...P(ring(0.26, 0.5))]);
	const body = hull([...P(ring(0.26, 0.3)), ...P(ring(tall, 0.2))]);
	const head = knight
		? [[0.18, 0], [0.2, 0.55], [0.08, 0.95], [-0.05, 1.05], [-0.1, 0.92], [-0.5, 0.72], [-0.55, 0.55], [-0.2, 0.5], [-0.25, 0]].map(([dx, dz]) => k.raw.proj([o[0] + dx!, o[1], tall + dz!]))
		: hull([...P(ring(tall - 0.05, 0.3)), ...P(ring(tall + 0.48, 0.26))]);
	for (const [shape, s] of [[base, 1], [body, 3], [head, 5]] as const) {
		k.raw.path(pathOf(shape, true), 'sheet-paper');
		k.raw.path(hatch(shape, 1.1, 1.5, seed + s, { cluster: 3, skip: 0.25, trim: 0.3 }), 'sheet-hatch');
		k.raw.path(outline(shape, { w: 1.1, heavy: 1, centre: centreOf(shape), seed: seed + s + 1 }), 'sheet-ink');
	}
}

export function drawing() {
	const sheets = scene();
	sheets.lay();
	for (let c = 0; c < N; c++)
		for (let r = 0; r < N; r++)
			if ((c + r) % 2) {
				const [u, v] = sq(c, r);
				const cell = sheets.raw.on('board', [[u - SQ / 2, v - SQ / 2], [u + SQ / 2, v - SQ / 2], [u + SQ / 2, v + SQ / 2], [u - SQ / 2, v + SQ / 2]]);
				sheets.raw.path(hatch(cell, 0.75, 1.3, 4100 + c * 7 + r, { cluster: 4, skip: 0.1, trim: 0.2 }), 'sheet-hatch');
			}
	sheets.raw.path(outline(sheets.raw.on('board', [[0.4, 0.4], [0.4 + SQ * N, 0.4], [0.4 + SQ * N, 0.4 + SQ * N], [0.4, 0.4 + SQ * N]]), { w: 1, seed: 4190 }), 'sheet-ink');
	const on = (pts: [number, number][]) => sheets.raw.on('pass', pts);
	sheets.raw.path(hatch(on([[0, 0], [PASS.w, 0], [PASS.w, 1.2], [0, 1.2]]), 0.1, 1.6, 4200, { cluster: 6, skip: 0.15 }), 'sheet-hatch light');
	sheets.raw.path(line(on([[0, 1.2], [PASS.w, 1.2]]), { w: 0.8, seed: 4201 }), 'sheet-ink');
	for (let i = 0; i < 16; i++) {
		const v0 = 1.5 + i * 0.24;
		if (v0 < PASS.h - 0.3) sheets.raw.path(pathOf(on([[STUB, v0], [STUB, v0 + 0.11]])), 'perforation');
	}
	const rnd = seeded(4210);
	for (let u = STUB + 0.5; u < PASS.w - 0.4; ) {
		const w = 0.05 + rnd() * 0.12;
		sheets.raw.path(pathOf(on([[u, 1.8], [u + w, 1.8], [u + w, 4.6], [u, 4.6]]), true), 'barcode');
		u += w + 0.06 + rnd() * 0.1;
	}
	[[2.1, 3.1, -0.15], [5.2, 3.3, 0.12]].forEach(([cu, cv, tilt], i) => {
		const ring = (r: number, seed: number) => outline(on(ellipse(cu!, cv!, r * 1.5, r, 36)), { w: 1.2, seed });
		sheets.raw.path(ring(1, 4220 + i) + ring(0.78, 4230 + i), 'stamp-ink');
		const o: [number, number] = [cu! - 1.12 * Math.cos(tilt!), cv! + 0.15 - 1.12 * Math.sin(tilt!)];
		const p = on([o, [o[0] + 0.05 * Math.cos(tilt!), o[1] + 0.05 * Math.sin(tilt!)], [o[0] - 0.05 * Math.sin(tilt!), o[1] + 0.05 * Math.cos(tilt!)]]);
		sheets.raw.textWith(matrixOf(p[0]!, p[1]!, p[2]!), 'PASSED', 'stamp-word');
	});
	const base = sheets.build();

	const pawns = scene();
	PAWNS.forEach(([c, r], i) => piece(pawns, c, r, 0.95, 4300 + i * 10));
	const at = (c: number, r: number) => {
		const k = scene();
		piece(k, c, r, 0.75, 4400 + c * 10 + r, true);
		return flat(k.build());
	};
	const mark = scene();
	const [tu, tv] = sq(...KNIGHT.to);
	mark.raw.path(outline(mark.raw.on('board', ellipse(tu, tv, 0.55, 0.5, 24)), { w: 1, seed: 4500 }), 'sheet-ink');

	const geo = scene();
	const hit = (key: string, u0: number, v0: number, u1: number, v1: number) => {
		const a = geo.raw.proj(geo.raw.at(key, u0, v0));
		const b = geo.raw.proj(geo.raw.at(key, u1, v1));
		return { x: r1(Math.min(a[0], b[0])), y: r1(Math.min(a[1], b[1]) - 14), w: r1(Math.abs(b[0] - a[0])), h: r1(Math.abs(b[1] - a[1]) + 14) };
	};
	return {
		view: base.view,
		base: flat(base),
		pawns: flat(pawns.build()),
		knightFrom: at(...KNIGHT.from),
		knightTo: at(...KNIGHT.to),
		target: flat(mark.build()),
		hits: { board: hit('board', 0, 0, BOARD.w, BOARD.h), pass: hit('pass', 0, 0, PASS.w, PASS.h) },
	};
}
