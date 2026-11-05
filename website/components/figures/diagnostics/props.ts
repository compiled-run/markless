// Street props for the diagnostics figures: a windscreen wiper lying across the code, a ticket's barcode and a paper clip.
import { roundRect } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, wash } from '../ink/ink.ts';
import type { desk, P } from '../ink/sheets.ts';

type Kit = ReturnType<typeof desk>;

/** A wiper resting on sheet `key` from its pivot (u0, v0) to its tip (u1, v1): the rubber blade in its frame, the arm from the pivot to the blade's middle, and their shadow. */
export function wiper(k: Kit, key: string, u0: number, v0: number, u1: number, v1: number) {
	const lift = 0.5;
	const len = Math.hypot(u1 - u0, v1 - v0);
	const ax: P = [(u1 - u0) / len, (v1 - v0) / len];
	const nx: P = [-ax[1], ax[0]];
	const at = (s: number, t: number): P => [u0 + ax[0] * s + nx[0] * t, v0 + ax[1] * s + nx[1] * t];
	const b0 = 2.2;
	const rubber = k.raw.on(key, [at(b0, -0.1), at(len, -0.1), at(len, 0.18), at(b0, 0.18)], lift * 0.4);
	const frame = k.raw.on(key, [at(b0 + 0.2, -0.3), at(len - 0.2, -0.3), at(len - 0.2, -0.1), at(b0 + 0.2, -0.1)], lift * 0.7);
	const mid = (b0 + len) / 2;
	const arm = k.raw.on(key, [at(0, -0.22), at(mid - 0.6, -0.72), at(mid + 0.4, -0.62), at(mid + 0.4, -0.42), at(mid - 0.6, -0.5), at(0, 0.06)], lift);
	const shadow = k.raw.on(key, [at(0.6, 0.35), at(len + 0.3, 0.4), at(len + 0.4, 0.95), at(0.7, 1)], 0);
	k.raw.path(wash(shadow, 1801, 0.6, 1.2), 'shadow-wash light');
	k.raw.path(hatch(shadow, -0.6, 1.8, 1802, { cluster: 3, skip: 0.2 }), 'hatch deep light');
	k.raw.path(pathOf(rubber, true), 'sheet-paper');
	k.raw.path(hatch(rubber, 1.2, 0.8, 1803, { cluster: 2, trim: 0.1 }), 'sheet-hatch');
	k.raw.path(outline(rubber, { w: 0.9, heavy: 0.8, seed: 1804 }), 'sheet-ink');
	k.raw.path(pathOf(frame, true), 'sheet-paper');
	k.raw.path(outline(frame, { w: 0.9, heavy: 0.6, seed: 1806 }), 'sheet-ink');
	for (const [i, s] of [b0 + 1.2, (b0 + mid) / 2 + 0.5, mid, (mid + len) / 2 - 0.5, len - 1.2].entries()) {
		const yoke = k.raw.on(key, [at(s - 0.7, -0.3), at(s - 0.3, -0.55), at(s + 0.3, -0.55), at(s + 0.7, -0.3)], lift * 0.8);
		k.raw.path(line(yoke, { w: 0.8, seed: 1810 + i, over: 0 }), 'sheet-ink');
	}
	k.raw.path(pathOf(arm, true), 'sheet-paper');
	k.raw.path(hatch(arm, 0.4, 1.4, 1807, { cluster: 3, skip: 0.3 }), 'sheet-hatch light');
	k.raw.path(outline(arm, { w: 1.2, heavy: 1, seed: 1805 }), 'sheet-ink');
	const hub = k.raw.on(key, Array.from({ length: 20 }, (_, i) => [u0 + Math.cos((i / 20) * Math.PI * 2) * 0.6, v0 + Math.sin((i / 20) * Math.PI * 2) * 0.55] as P), lift + 0.2);
	const nut = k.raw.on(key, Array.from({ length: 6 }, (_, i) => [u0 + Math.cos((i / 6) * Math.PI * 2) * 0.26, v0 + Math.sin((i / 6) * Math.PI * 2) * 0.24] as P), lift + 0.3);
	k.raw.path(pathOf(hub, true), 'sheet-paper');
	k.raw.path(hatch(hub, 0.7, 1, 1820, { cluster: 2 }), 'sheet-hatch light');
	k.raw.path(outline(hub, { w: 1.2, heavy: 1, seed: 1821 }) + outline(nut, { w: 0.8, seed: 1822 }), 'sheet-ink');
}

/** A barcode printed across a sheet between `u0` and `u1`, bars of uneven width from a fixed pattern. */
export function barcode(k: Kit, key: string, u0: number, u1: number, v0: number, v1: number) {
	const widths = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 2, 3, 1];
	const unit = (u1 - u0) / widths.reduce((a, w) => a + w + 1, 0);
	let u = u0;
	let d = '';
	for (const w of widths) {
		d += pathOf(k.raw.on(key, roundRect(u, v0, u + w * unit, v1, 0.001, 1)), true);
		u += (w + 1) * unit;
	}
	k.raw.path(d, 'sheet-ink');
}

/** A paper clip biting the edge between two sheets: its wire is two nested loops around (u, v) on `key`. */
export function clip(k: Kit, key: string, u: number, v: number, seed: number) {
	const loop = (w: number, h: number): P[] => roundRect(u - w / 2, v - h, u + w / 2, v + h * 0.35, w / 2, 6);
	const outer = k.raw.on(key, loop(0.9, 2.3), 0.15);
	const inner = k.raw.on(key, loop(0.55, 1.7), 0.18);
	const shade = k.raw.on(key, loop(0.95, 2.35).map(([a, b]) => [a + 0.18, b + 0.22] as P), 0);
	k.raw.path(wash(hull(shade), seed, 0.3, 0.8), 'shadow-wash light');
	k.raw.path(line([...outer, outer[0]!], { w: 1.2, heavy: 0.6, seed: seed + 1, over: 0.3 }) + line(inner, { w: 1, seed: seed + 2, over: 0.3 }), 'sheet-ink');
}
