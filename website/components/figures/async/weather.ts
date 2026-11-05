// A weather card drawn in ink: its card edge, three city tabs, and a sun, a cloud and a rain cloud for the forecasts.
import { ellipse, jitter, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, resample, wash } from '../ink/ink.ts';
import type { P } from '../ink/ink.ts';

export const WIDTH = 600;
export const HEIGHT = 330;
const CARD = { x: 20, y: 56, w: 560, h: 256 };
export const TAB_X = [30, 150, 270] as const;

function cardArt() {
	const { x, y, w, h } = CARD;
	const edge = jitter(resample(roundRect(x, y, x + w, y + h, 16), 7, true), 9301, 1.1);
	const shadow = jitter(resample(roundRect(x + 9, y + 11, x + w + 9, y + h + 11, 16), 9, true), 9302, 1.2);
	const strip = line([[x + 24, y + 160], [x + w - 24, y + 161]], { w: 0.7, seed: 9303, over: 0.3 });
	return {
		shadow: pathOf(shadow, true),
		shadowHatch: hatch(shadow, -0.4, 2.8, 9304, { cluster: 4, skip: 0.3 }),
		paper: pathOf(edge, true),
		ink: outline(edge, { w: 1.9, heavy: 1.5, seed: 9305 }) + strip,
		pencil: outline(edge, { w: 0.9, wobble: 2, seed: 9306 }),
	};
}

function tabArt(x: number, seed: number) {
	const shape = jitter(resample([[x, 56], [x + 8, 18], [x + 104, 18], [x + 112, 56]], 5, true), seed, 0.7);
	return { paper: pathOf(shape, true), ink: outline(shape, { w: 1.2, seed: seed + 1 }), hatch: hatch(shape, 0.1, 2.4, seed + 2, { cluster: 4, skip: 0.3 }) };
}

function sun(cx: number, cy: number, r: number, seed: number) {
	const disc = ellipse(cx, cy, r, r, 28);
	const rays = Array.from({ length: 10 }, (_, i) => {
		const a = (i / 10) * Math.PI * 2 + 0.2;
		return line([[cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5)], [cx + Math.cos(a) * (r + 13 + (i % 2) * 5), cy + Math.sin(a) * (r + 13 + (i % 2) * 5)]], { w: 1.6, seed: seed + i, over: 0.2 });
	}).join('');
	return { wash: wash(disc, seed + 20, 1.5, 2.5), ink: outline(disc, { w: 1.7, heavy: 1.2, seed: seed + 21 }) + rays, shade: hatch(disc.filter(([x, y]) => x + y > cx + cy), 0.8, 2, seed + 22, { cluster: 3 }) };
}

function cloud(cx: number, cy: number, s: number, seed: number, rain: boolean) {
	const puffs: P[] = [];
	for (const [dx, dy, r] of [[-22, 4, 14], [-6, -8, 18], [14, -4, 15], [26, 6, 11]] as const) puffs.push(...ellipse(cx + dx * s, cy + dy * s, r * s, r * s, 14));
	const body = jitter(resample(hull(puffs), 4, true), seed, 0.8);
	const drops = rain ? [-14, 0, 14].map((dx, i) => line([[cx + dx * s, cy + 22 * s], [cx + (dx - 5) * s, cy + 36 * s]], { w: 1.5, seed: seed + 10 + i, over: 0.2 })).join('') : '';
	return { wash: wash(body, seed + 20, 1.2, 2.5), ink: outline(body, { w: 1.6, heavy: 1.1, seed: seed + 21 }) + drops, shade: hatch(body.filter(([, y]) => y > cy), 0.2, 2, seed + 22, { cluster: 3, skip: 0.2 }) };
}

function hull(points: P[]): P[] {
	const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: P[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: P[] = [];
	for (const p of pts.reverse()) {
		while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Big icons for today, then small ones for the strip, frozen into weather.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		card: cardArt(),
		tabs: TAB_X.map((x, i) => tabArt(x, 9400 + i * 10)),
		big: { sun: sun(110, 136, 32, 9500), cloud: cloud(110, 136, 1.5, 9540, false), rain: cloud(110, 128, 1.5, 9580, true) },
		small: [0, 1, 2].map((i) => {
			const cx = 150 + i * 160;
			const cy = 262;
			return { sun: sun(cx, cy, 13, 9620 + i * 40), cloud: cloud(cx, cy, 0.7, 9640 + i * 40, false), rain: cloud(cx, cy - 4, 0.7, 9650 + i * 40, true) };
		}),
	};
}
