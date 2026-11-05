// .ruler/ as a rubber stamp: pnpm rules presses the same imprint onto every generated file, and a hand-edited copy shows as a smudge agent-files catches.
import { centreOf, ellipse, matrixOf, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, outline, pathOf, wash } from '../ink/ink.ts';
import { desk, type Point3 } from '../ink/sheets.ts';

/** What pnpm rules writes from .ruler/. */
export const OUTPUTS = ['AGENTS.md', 'CLAUDE.md', 'skill copies'];

const SLIP = { w: 5.6, h: 6.4, gap: 0.6, y: 6 };
const slipX = (i: number) => 1.6 + i * (SLIP.w + SLIP.gap);

export function drawing() {
	const sheets = OUTPUTS.map((name, i) => ({ key: 'out' + i, x: slipX(i), y: SLIP.y + (i % 2) * 0.25, w: SLIP.w, h: SLIP.h, turn: (i - 1) * 0.025, curl: i === 2 }));
	const k = desk(680, [{ key: 'pad', x: 1, y: 0.6, w: 7.4, h: 4, kraft: true, curl: false }, ...sheets], [[13.4, 1, 4.8]]);
	k.lay();
	const P = k.raw.projAll;
	const pad = k.raw.on('pad', roundRect(0.5, 0.5, 6.5, 3.7, 0.4, 4), 0.03);
	k.raw.path(pathOf(pad, true), 'shadow-wash');
	k.raw.path(hatch(pad, 0.4, 2.2, 3001, { cluster: 5, skip: 0.2, trim: 0.25 }), 'hatch light');
	k.raw.text('pad', 0.6, 3.5, 'pnpm rules', 'mono');

	const imprint = (key: string, smudge: boolean, at: number) => {
		const u0 = 0.55;
		const v0 = 1.8;
		const frame = k.raw.on(key, roundRect(u0, v0, u0 + 4.1, v0 + 2.5, 0.25, 4), 0.02);
		k.raw.path(outline(frame, { w: 1.3, seed: 3100 + Math.round(at) }) + outline(k.raw.on(key, roundRect(u0 + 0.2, v0 + 0.2, u0 + 3.9, v0 + 2.3, 0.18, 4), 0.02), { w: 0.6, seed: 3110 + Math.round(at) }), 'stamp-ink show', k.raw.motion('show', at));
		k.raw.text(key, u0 + 0.45, v0 + 1.05, 'FROM .ruler/', 'stamp-word', 'show', at);
		k.raw.text(key, u0 + 0.45, v0 + 1.95, 'do not edit', 'stamp-word', 'show', at);
		if (smudge) {
			const blot = k.raw.on(key, ellipse(u0 + 2.7, v0 + 1.4, 1.2, 0.7, 24), 0.03);
			k.raw.path(wash(blot, 3150, 1.2, 3), 'shadow-wash show', k.raw.motion('show', at + 900));
			k.raw.text(key, u0 - 0.1, v0 + 3.15, 'edited by hand:', 'mono small', 'show', at + 900);
			k.raw.path(pathOf(k.raw.on(key, [[u0 - 0.1, v0 - 0.3], [u0 + 4.3, v0 + 2.8]])) + pathOf(k.raw.on(key, [[u0 + 4.3, v0 - 0.3], [u0 - 0.1, v0 + 2.8]])), 'pen squiggle draw', k.raw.motion('draw', at + 1500, '--l:200'));
			k.raw.text(key, u0 - 0.1, v0 + 3.8, 'agent-files fails', 'mono small tint-err', 'show', at + 1500);
		}
	};
	OUTPUTS.forEach((name, i) => {
		const key = 'out' + i;
		k.row(key, 0.6, 1.1, name, 'bold');
		imprint(key, i === 1, 700 + i * 700);
	});
	k.next();

	const hover: Point3 = [13.4, 2.4, 0];
	const c = (dx: number, dy: number, z: number): Point3 => [hover[0] + dx, hover[1] + dy, hover[2] + z];
	const corners = [-2.6, 2.6].flatMap((x) => [-1.6, 1.6].flatMap((y) => [0, 1.3].map((z) => c(x, y, z))));
	const block = hull(P(corners));
	const front = P([c(-2.6, 1.6, 0), c(2.6, 1.6, 0), c(2.6, 1.6, 1.3), c(-2.6, 1.6, 1.3)]);
	const lid = P([c(-2.6, -1.6, 1.3), c(2.6, -1.6, 1.3), c(2.6, 1.6, 1.3), c(-2.6, 1.6, 1.3)]);
	const ring = (z: number, r: number) => P(ellipse(0, 0, r, r * 0.8, 30).map(([x, y]) => c(x, y, z)));
	const neck = hull([...ring(1.3, 0.7), ...ring(2.9, 0.5)]);
	const knob = hull([...ring(2.9, 1.2), ...ring(4.3, 1.3), ...ring(4.8, 0.7)]);
	const shadow = hull([c(-2.6, -1.6, 0), c(2.6, -1.6, 0), c(2.6, 1.6, 0), c(-2.6, 1.6, 0), c(-2.6, -1.6, 1.3), c(2.6, 1.6, 1.3), c(0, 0, 4.8)].map((p) => k.raw.proj(shadowOnDesk(p))));
	const lift = k.raw.motion('sink', 300);
	k.raw.path(wash(shadow, 3200, 1.4, 2.5), 'shadow-wash');
	k.raw.path(hatch(shadow, -0.5, 2.2, 3201, { cluster: 4, skip: 0.2 }), 'hatch deep');
	k.raw.path(pathOf(block, true), 'kraft sink', lift);
	k.raw.path(hatch(front, 0.15, 2.8, 3202, { cluster: 3, skip: 0.4, trim: 0.5 }), 'sheet-hatch sink', lift);
	k.raw.path(outline(block, { w: 1.5, heavy: 1.3, centre: centreOf(block), seed: 3203 }) + outline(front, { w: 0.8, seed: 3204 }) + outline(lid, { w: 0.7, seed: 3209 }), 'sheet-ink sink', lift);
	k.raw.path(pathOf(neck, true) + pathOf(knob, true), 'sheet-paper sink', lift);
	k.raw.path(hatch(knob, 1.2, 1.4, 3205, { cluster: 3, trim: 0.2 }) + hatch(neck, 1.1, 1.2, 3206, { cluster: 2 }), 'sheet-hatch sink', lift);
	k.raw.path(outline(neck, { w: 1.1, seed: 3207 }) + outline(knob, { w: 1.4, heavy: 1.2, centre: centreOf(knob), seed: 3208 }), 'sheet-ink sink', lift);
	const o = c(-2.2, 1.6, 0.42);
	k.raw.textWith(matrixOf(k.raw.proj(o), k.raw.proj([o[0] + 0.05, o[1], o[2]]), k.raw.proj([o[0], o[1], o[2] - 0.05])), '.ruler/', 'big', 'sink', 300);
	return k.build();
}
