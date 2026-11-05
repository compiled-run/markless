// Checking in at home: a boarding pass for the pull request, stamped by each fast job, with a barcode stub that says the full checks wait at GitHub.
import { ellipse, matrixOf } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, seeded } from '../ink/ink.ts';
import { desk } from '../ink/sheets.ts';

/** The four fast jobs, in the order a fast run prints them. */
export const FAST = ['agent-files', 'typecheck', 'typecheck-ts7', 'unit'];

const W = 21;
const H = 8.2;
const STUB = 15.4;

export function drawing() {
	const k = desk(680, [{ key: 'pass', x: 0, y: 0, w: W, h: H, turn: -0.025 }]);
	k.lay();
	const on = (pts: [number, number][], lift = 0) => k.raw.on('pass', pts, lift);
	const band = on([[0, 0], [STUB, 0], [STUB, 1.7], [0, 1.7]]);
	k.raw.path(hatch(band, 0.1, 1.6, 1801, { cluster: 6, skip: 0.15 }), 'sheet-hatch light');
	k.raw.path(line(on([[0, 1.7], [STUB, 1.7]]), { w: 0.9, seed: 1802 }), 'sheet-ink');
	const stubBand = on([[STUB, 0], [W, 0], [W, 1.7], [STUB, 1.7]]);
	k.raw.path(hatch(stubBand, 0.1, 1.6, 1803, { cluster: 6, skip: 0.15 }), 'sheet-hatch light');
	for (const v of [0, H]) k.raw.path(outline(on(ellipse(STUB, v, 0.45, 0.45, 20).filter(([, y]) => (v === 0 ? y >= 0 : y <= H))), { w: 0.9, seed: 1804 + v }, false), 'sheet-ink');
	for (let i = 0; i < 28; i++) {
		const v0 = 0.6 + i * 0.26;
		if (v0 + 0.12 < H - 0.5) k.raw.path(pathOf(on([[STUB, v0], [STUB, v0 + 0.12]])), 'perforation');
	}
	const glyph = on([[0.9, 0.85], [2.2, 0.85], [2.6, 0.6], [2.75, 0.85], [2.2, 1.05], [1.6, 1.05], [1.95, 1.45], [1.65, 1.45], [1.1, 1.05], [0.9, 1.05]]);
	k.raw.path(pathOf(glyph, true), 'sheet-ink');
	k.row('pass', 3.2, 1.15, 'BOARDING PASS', 'hand');
	k.row('pass', STUB + 0.7, 1.15, 'NEXT', 'hand');
	const field = (u: number, v: number, caption: string, value: string, cls = 'bold') => {
		k.row('pass', u, v, caption, 'dim small');
		k.row('pass', u, v + 0.75, value, cls);
	};
	field(0.9, 2.6, 'FROM', 'your machine');
	field(5.8, 2.6, 'TO', 'main');
	field(8.6, 2.6, 'FLIGHT', 'ci:local --fast');
	field(STUB + 0.7, 2.6, 'GATE', 'GitHub');
	k.next();
	let left = 0.6;
	FAST.forEach((job, i) => {
		const rx = Math.max(1.1, job.length * 0.105 + 0.35);
		const cu = left + rx * 1.15;
		left = cu + rx * 1.15 + 0.15;
		const cv = 5.9 + (i % 2 ? -0.15 : 0.15);
		const tilt = [-0.18, 0.12, -0.08, 0.2][i]!;
		const at = 400 + i * 450;
		const ring = (r: number, seed: number) => outline(on(ellipse(cu, cv, rx * r, r, 40), 0.02), { w: 1.1, seed });
		k.raw.path(ring(1.15, 1820 + i) + ring(0.9, 1830 + i), 'stamp-ink show', k.raw.motion('show', at));
		const len = job.length * 0.19;
		const o: [number, number] = [cu - (len / 2) * Math.cos(tilt) + 0.12 * Math.sin(tilt), cv + 0.12 - (len / 2) * Math.sin(tilt)];
		const p = on([o, [o[0] + 0.05 * Math.cos(tilt), o[1] + 0.05 * Math.sin(tilt)], [o[0] - 0.05 * Math.sin(tilt), o[1] + 0.05 * Math.cos(tilt)]]);
		k.raw.textWith(matrixOf(p[0]!, p[1]!, p[2]!), job, 'stamp-job', 'show', at);
	});
	const rnd = seeded(1840);
	let u = STUB + 0.8;
	while (u < W - 0.8) {
		const w = 0.05 + rnd() * 0.14;
		k.raw.path(pathOf(on([[u, 4.7], [u + w, 4.7], [u + w, 7.4], [u, 7.4]]), true), 'barcode');
		u += w + 0.06 + rnd() * 0.12;
	}
	return k.build();
}
