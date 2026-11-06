// Front-on ink drawing for the How it works toys: real objects (a browser, a phone, a terminal) drawn flat, returned as layered plain data.
import { centreOf, ellipse, type P, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, pool, r1, resample, stroke, wash } from '../ink/ink.ts';

export type { P };
export { ellipse, roundRect };

export type Layer = { readonly key: string; readonly cls: string; readonly d: string };
export type Words = { readonly key: string; readonly cls: string; readonly matrix: string; readonly text: string };
export type Group = { readonly layers: Layer[]; readonly words: Words[] };

export const rect = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export function flatKit(prefix: string) {
	const layers: Layer[] = [];
	const words: Words[] = [];
	let n = 0;
	const put = (cls: string, d: string) => {
		if (d) layers.push({ key: prefix + n++, cls, d });
	};
	const say = (cls: string, x: number, y: number, text: string) => words.push({ key: prefix + n++, cls, matrix: `translate(${r1(x)} ${r1(y)})`, text });

	function group(draw: () => void): Group {
		const a = layers.length;
		const b = words.length;
		draw();
		return { layers: layers.splice(a), words: words.splice(b) };
	}

	/** Paper with a soft offset shadow, an inked edge and optional hatched tone. */
	function card(poly: P[], seed: number, options: { readonly paper?: string; readonly shadow?: number; readonly tone?: number; readonly w?: number } = {}) {
		if (options.shadow) put('shadow', pathOf(poly.map(([x, y]) => [x + options.shadow!, y + options.shadow!] as P), true));
		put(options.paper ?? 'paper', pathOf(poly, true));
		if (options.tone !== undefined) put('hatch light', hatch(poly, options.tone, 2.4, seed + 1, { cluster: 4, skip: 0.25, trim: 0.4 }));
		put('ink', outline(poly, { w: options.w ?? 1.3, heavy: 1.1, centre: centreOf(poly), seed: seed + 2 }));
		return poly;
	}

	/** A browser or app window: frame, title bar with three dots, and a URL pill. */
	function windowFrame(x: number, y: number, w: number, h: number, url: string, seed: number) {
		card(roundRect(x, y, x + w, y + h, 10, 6), seed, { shadow: 6 });
		put('hatch light', hatch(rect(x + 2, y + 2, w - 4, 24), 0.1, 2.4, seed + 3, { cluster: 6, skip: 0.2 }));
		put('ink', line([[x, y + 26], [x + w, y + 26]], { w: 0.9, seed: seed + 4 }) + [14, 26, 38].map((dx, i) => outline(ellipse(x + dx, y + 13, 3.6, 3.6, 14), { w: 0.8, seed: seed + 5 + i })).join(''));
		const pill = roundRect(x + 52, y + 6, x + Math.min(w - 14, 52 + 9 * url.length + 24), y + 20, 7, 4);
		put('paper', pathOf(pill, true));
		put('ink', outline(pill, { w: 0.8, seed: seed + 9 }));
		say('url', x + 62, y + 17, url);
	}

	/** A small landscape picture inside a frame: hills, sun or moon, water lines. */
	function picture(x: number, y: number, w: number, h: number, kind: number, seed: number) {
		const frame = rect(x, y, w, h);
		put('paper', pathOf(frame, true));
		const hill: P[] = kind === 0
			? [[x, y + h], [x, y + h * 0.65], [x + w * 0.3, y + h * 0.35], [x + w * 0.5, y + h * 0.55], [x + w * 0.72, y + h * 0.28], [x + w, y + h * 0.6], [x + w, y + h]]
			: kind === 1
				? [[x, y + h], [x, y + h * 0.62], [x + w, y + h * 0.62], [x + w, y + h]]
				: [[x, y + h], [x, y + h * 0.8], [x + w * 0.4, y + h * 0.7], [x + w, y + h * 0.82], [x + w, y + h]];
		put('hatch', hatch(hill, kind === 1 ? 0.05 : 0.9, kind === 1 ? 3 : 2, seed, { cluster: 3, skip: 0.1 }));
		put('ink', outline(hill, { w: 0.9, seed: seed + 1 }));
		if (kind === 2) {
			const trunk = rect(x + w * 0.62, y + h * 0.42, w * 0.05, h * 0.32);
			const crown = ellipse(x + w * 0.645, y + h * 0.36, w * 0.14, h * 0.18, 18);
			put('paper', pathOf(crown, true));
			put('hatch', hatch(crown, -0.7, 2.2, seed + 2, { cluster: 3 }));
			put('ink', outline(trunk, { w: 0.9, seed: seed + 3 }) + outline(crown, { w: 1, seed: seed + 4 }));
		}
		const sun = ellipse(x + w * (kind === 1 ? 0.5 : 0.2), y + h * (kind === 1 ? 0.45 : 0.24), Math.min(w, h) * 0.09, Math.min(w, h) * 0.09, 16);
		put('wash yellow', wash(sun, seed + 5, 0.8, 1.5));
		put('ink', outline(sun, { w: 0.8, seed: seed + 6 }) + outline(frame, { w: 1.2, heavy: 1, seed: seed + 7 }));
	}

	/** The one margin note, top left, and a loose arrow to `aim`. */
	function note(aim: P, from: P, seed: number) {
		const c: P = [Math.min(from[0], aim[0]) - 20, (from[1] + aim[1]) / 2];
		const pts: P[] = Array.from({ length: 16 }, (_, i) => {
			const t = i / 15;
			return [(1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * c[0] + t * t * aim[0], (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * c[1] + t * t * aim[1]];
		});
		const end = pts.at(-1)!;
		const prev = pts.at(-4)!;
		const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
		const head = (s: number): P[] => [[end[0] - Math.cos(ang + s) * 9, end[1] - Math.sin(ang + s) * 9], end];
		return { x: 4, y: 22, arrow: line(pts, { w: 1.3, seed, over: 1 }) + stroke(head(0.45), { w: 1.3, seed: seed + 1, over: 0.5 }) + stroke(head(-0.45), { w: 1.3, seed: seed + 2, over: 0.5 }) };
	}

	const spot = (poly: P[], seed: number) => ({ wash: wash(poly, seed, 1.2, 3), pool: wash(pool(poly, centreOf(poly), 0.55), seed + 1, 0.5, 2) });

	return { layers, words, put, say, group, card, windowFrame, picture, note, spot, line, outline, hatch, stroke, wash, pathOf, resample };
}
