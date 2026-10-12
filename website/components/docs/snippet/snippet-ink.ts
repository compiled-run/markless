// The torn-strip frame round every plain code block: drawn once at true size, frozen into global.css as CSS mask images, and laid on the block by the markup in torn-strip.ts.
import { hatch, line, noise1, normalAt, type P, pathOf, resample, seeded, wash } from '../../figures/ink/ink.ts';

/** Width of a torn band, drawn at true size and repeated past it on very wide blocks. */
export const BAND = 1200;
/** Drawn length of a side; the frame stretches it along its length only. */
export const RISE = 120;
export const UPPER = 16;
export const LOWER = 24;
/** Cast shadow and shaded-side paper tone, drawn at true size and repeated past their length on very long blocks. */
export const SHADE = { below: 1000, beside: 600, depth: 26, dx: 7, dy: 9, tone: 12 } as const;

const shift = (pts: P[], dx: number, dy: number): P[] => pts.map(([x, y]) => [x + dx, y + dy] as P);
const down = (x: number): P[] => [
	[x, 0],
	[x, RISE / 2],
	[x, RISE],
];

/** One side in two or three offset passes: a main stroke, a lighter one a hair off it, and often a short retrace. */
function passes(pts: P[], seed: number, w: number): string {
	const rnd = seeded(seed * 3 + 1);
	const a = pts[0]!;
	const b = pts.at(-1)!;
	const at = (t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	const from = 0.08 + rnd() * 0.3;
	const to = from + 0.3 + rnd() * 0.35;
	let d = line(pts, { w, seed, over: 1.5, wobble: 0.5 });
	d += line(shift(pts, (rnd() - 0.5) * 2.6, 0), { w: w * (0.42 + rnd() * 0.2), seed: seed + 50, over: 2.4, wobble: 0.75 });
	if (rnd() < 0.75) d += line(shift([at(from), at((from + to) / 2), at(to)], (rnd() - 0.5) * 1.8, 0), { w: w * 0.35, seed: seed + 90, over: 0.6, wobble: 0.5 });
	return d;
}

/**
 * A torn edge across the band. Fibre teeth come in uneven sizes and spacing, the
 * depth swells and settles along the edge, and a few bigger nicks bite into the paper.
 * `into` is the direction of the paper: +1 below the edge, -1 above it.
 */
function tear(seed: number, mid: number, depth: number, into: 1 | -1, nicks: number): P[] {
	const rnd = seeded(seed);
	const slow = noise1(rnd, 23);
	const swell = noise1(rnd, 11);
	const bites = Array.from({ length: nicks }, (_, i) => ({
		at: ((i + 0.2 + rnd() * 0.6) / nicks) * BAND,
		half: 3 + rnd() * 6,
		deep: depth * (1.1 + rnd() * 0.9),
	}));
	const pts: P[] = [];
	let tooth = 0;
	for (let x = -4; x < BAND + 4; ) {
		const amp = depth * (0.55 + 0.45 * swell(x / BAND));
		if (tooth <= 0 && rnd() < 0.12) tooth = (rnd() < 0.2 ? 2.2 : 1) * (0.6 + rnd()) * amp * 0.7;
		const teeth = (rnd() - 0.5) * (0.6 + amp * 0.5) + tooth;
		tooth = Math.max(0, tooth - 0.9 - rnd());
		let bite = 0;
		for (const b of bites) {
			const t = 1 - Math.abs(x - b.at) / b.half;
			if (t > 0) bite = Math.max(bite, b.deep * Math.pow(t, 0.7));
		}
		pts.push([x, mid + slow(x / BAND) * amp + (teeth + bite) * into]);
		x += 1 + rnd() * rnd() * 7;
	}
	pts.push([BAND + 4, mid]);
	return pts;
}

/** A fineliner stroke as a filled ribbon, sampled coarser than `line` so a band's worth stays small: uneven pressure, a little shake. */
function ribbon(points: P[], w: number, seed: number, step = 2.6): string {
	const rnd = seeded(seed);
	const pts = resample(points, step);
	const press = noise1(rnd, 31);
	const n = pts.length;
	const left: P[] = [];
	const right: P[] = [];
	for (let i = 0; i < n; i++) {
		const [nx, ny] = normalAt(pts, i);
		const half = (w * (0.55 + 0.45 * (press(i / n) + 1) * 0.75) * (0.85 + rnd() * 0.3)) / 2;
		const p = pts[i]!;
		left.push([p[0] + nx * half, p[1] + ny * half]);
		right.push([p[0] - nx * half, p[1] - ny * half]);
	}
	return pathOf([...left, ...right.reverse()], true);
}

/** Two offset ink passes along a torn edge: a main one, and a fainter one a hair off it that breaks off now and then. */
function edgeInk(pts: P[], seed: number, w: number, k: number) {
	const rnd = seeded(seed + 7);
	const second: string[] = [];
	let run: P[] = [];
	for (const p of pts) {
		run.push([p[0] + 0.6, p[1] + k]);
		if (run.length > 30 && rnd() < 0.02) {
			second.push(ribbon(run, w * 0.45, seed + second.length + 1, 3));
			run = [];
		}
	}
	if (run.length > 1) second.push(ribbon(run, w * 0.45, seed + 99, 3));
	return { main: ribbon(pts, w, seed), second: second.join('') };
}

function torn() {
	const upper = tear(950, 6, 1.6, 1, 2);
	const lower = tear(960, 8, 3, -1, 4);
	return {
		upper: { paper: pathOf([...upper, [BAND + 4, UPPER], [-4, UPPER]], true), ...edgeInk(upper, 951, 0.75, -0.8) },
		lower: { paper: pathOf([[-4, 0], [BAND + 4, 0], ...lower.slice().reverse()], true), ...edgeInk(lower, 961, 1.2, 1) },
		left: passes(down(0), 972, 1.1),
		right: passes(down(0), 973, 1.4),
	};
}

/** A strip running along u from v = near out to a wavy far edge, mapped to x/y by `map`. */
function strip(u0: number, u1: number, far: (u: number) => number, map: (u: number, v: number) => P, near = 0): P[] {
	const out: P[] = [];
	for (let u = u0; u <= u1; u += 6) out.push(map(u, near));
	for (let u = u1; u >= u0; u -= 6) out.push(map(u, far(u)));
	return out;
}

/** Cross-hatched cast shadow along the bottom and right edges and round the corner, dense at the edge and fading out, plus pencil tone on the paper's shaded side. */
function shade() {
	const { dx, dy, tone: T } = SHADE;
	const rnd = seeded(1100);
	const wob = noise1(rnd, 30);
	const wob2 = noise1(rnd, 22);
	const bottom = (u: number, v: number): P => [u, v];
	const right = (u: number, v: number): P => [v, u];
	const reach = (u: number, d: number, k: number) => Math.max(0, 1 - u / (k * 2.6)) * d;
	const cast = (map: (u: number, v: number) => P, L: number, k: number, d: number, s: number) => {
		const core = strip(k * 0.6, L, (u) => d - 1 + wob(u / L) * 1.3 - reach(u, d * 0.7, k), map);
		const fade = strip(k * 0.3, L, (u) => d + 8 + wob2(u / L) * 3 - reach(u, d + 4, k), map);
		return {
			wash: wash(core, s, 0.2, 0.6),
			core: hatch(core, -0.5, 1.7, s + 1, { cluster: 4, skip: 0.12 }) + hatch(core, 0.95, 2.3, s + 2, { cluster: 3, skip: 0.3, trim: 0.25 }),
			fade: hatch(fade, -0.5, 3, s + 3, { cluster: 4, skip: 0.35, trim: 0.35 }),
		};
	};
	const quarter = (rx: number, ry: number): P[] => [
		[0, 0],
		...Array.from({ length: 9 }, (_, i) => {
			const a = (i / 8) * (Math.PI / 2);
			return [Math.cos(a) * rx, Math.sin(a) * ry] as P;
		}),
	];
	const tone = (map: (u: number, v: number) => P, L: number, s: number) => {
		const close = strip(0, L, (u) => -4.5 - wob(u / L), map);
		const far = strip(0, L, (u) => -T + wob2(u / L) * 2, map);
		return hatch(close, -0.5, 1.9, s, { cluster: 4, skip: 0.2, trim: 0.3 }) + hatch(far, -0.5, 3.2, s + 1, { cluster: 3, skip: 0.5, trim: 0.4 });
	};
	const cornerCore = quarter(dx, dy);
	const cornerFade = quarter(dx + 8, dy + 8);
	return {
		below: cast(bottom, SHADE.below, dx, dy, 1110),
		beside: cast(right, SHADE.beside, dy, dx, 1120),
		corner: {
			wash: wash(cornerCore, 1130, 0.2, 0.6),
			core: hatch(cornerCore, -0.5, 1.7, 1131, { cluster: 4, skip: 0.12 }) + hatch(cornerCore, 0.95, 2.3, 1132, { cluster: 3, skip: 0.3 }),
			fade: hatch(cornerFade, -0.5, 3, 1133, { cluster: 4, skip: 0.35, trim: 0.35 }),
		},
		toneBelow: tone(bottom, SHADE.below, 1140),
		toneBeside: tone(right, SHADE.beside, 1150),
	};
}

export function drawing() {
	return { torn: torn(), shade: shade() };
}

/** One SVG as a CSS `url()`; paths are black and only their alpha matters, because every piece is used as a mask over a token colour. */
function svgUrl(viewBox: string, width: number, height: number, body: string, stretch = false): string {
	const svg =
		`<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${viewBox}'${stretch ? " preserveAspectRatio='none'" : ''}>` +
		body +
		'</svg>';
	return `url("data:image/svg+xml,${svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;
}

/** Rewrites absolute M/L/Q/Z path data as relative commands with short numbers: the same shape in far fewer, far more repetitive bytes. */
export function compact(d: string): string {
	const num = (v: number) => {
		const r = Math.round(v * 10) / 10;
		return (r === 0 ? '0' : String(r)).replace(/^(-?)0\./, '$1.');
	};
	const join = (vals: number[]) => vals.map(num).reduce((out, v) => out + (v.startsWith('-') || out === '' ? v : ' ' + v), '');
	let out = '';
	let x = 0;
	let y = 0;
	let sx = 0;
	let sy = 0;
	let last = '';
	for (const [, cmd, args] of d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
		const v = (args!.match(/-?[\d.]+/g) ?? []).map(Number);
		if (cmd === 'Z') {
			out += 'z';
			last = 'z';
			x = sx;
			y = sy;
			continue;
		}
		if (cmd === 'Q') {
			const fixed: number[] = [];
			for (let i = 0; i < v.length; i += 4) {
				fixed.push(v[i]! - x, v[i + 1]! - y, v[i + 2]! - x, v[i + 3]! - y);
				x = v[i + 2]!;
				y = v[i + 3]!;
			}
			out += (last === 'q' && join(fixed).startsWith('-') ? '' : last === 'q' ? ' ' : 'q') + join(fixed);
			last = 'q';
			continue;
		}
		const pts: number[] = [];
		for (let i = 0; i < v.length; i += 2) {
			pts.push(v[i]! - x, v[i + 1]! - y);
			x = v[i]!;
			y = v[i + 1]!;
		}
		if (cmd === 'M') {
			sx = v[0]!;
			sy = v[1]!;
		}
		const letter = cmd === 'M' ? 'm' : 'l';
		const text = join(pts);
		out += (last === letter && letter === 'l' ? (text.startsWith('-') ? '' : ' ') : letter) + text;
		last = letter;
	}
	return out;
}

const fill = (d: string, alpha = 1) => (d ? `<path${alpha < 1 ? ` fill-opacity='${alpha}'` : ''} d='${compact(d)}'/>` : '');
const hatched = (d: string, alpha: number, width = 0.7) =>
	d ? `<path fill='none' stroke='black' stroke-width='${width}' stroke-linecap='round' stroke-opacity='${alpha}' d='${compact(d)}'/>` : '';

type Cast = { readonly wash: string; readonly core: string; readonly fade: string };
const castBody = (c: Cast) => fill(c.wash, 0.08) + hatched(c.fade, 0.26) + hatched(c.core, 0.5);

/** The frozen art as CSS custom properties on `.torn-strip`, ready for `mask-image`. */
export function tornStripCss(art = drawing()): string {
	const { torn: t, shade: s } = art;
	const { below, beside, depth: D, tone: T } = SHADE;
	const props: [string, string][] = [
		['upper-paper', svgUrl(`0 0 ${BAND} ${UPPER}`, BAND, UPPER, fill(t.upper.paper))],
		['upper-ink', svgUrl(`0 0 ${BAND} ${UPPER}`, BAND, UPPER, fill(t.upper.main, 0.7) + fill(t.upper.second, 0.45))],
		['lower-paper', svgUrl(`0 0 ${BAND} ${LOWER}`, BAND, LOWER, fill(t.lower.paper))],
		['lower-ink', svgUrl(`0 0 ${BAND} ${LOWER}`, BAND, LOWER, fill(t.lower.main) + fill(t.lower.second, 0.7))],
		['left', svgUrl(`-10 0 20 ${RISE}`, 20, RISE, fill(t.left), true)],
		['right', svgUrl(`-10 0 20 ${RISE}`, 20, RISE, fill(t.right), true)],
		['below', svgUrl(`0 0 ${below} ${D}`, below, D, castBody(s.below))],
		['beside', svgUrl(`0 0 ${D} ${beside}`, D, beside, castBody(s.beside))],
		['corner', svgUrl(`0 0 ${D} ${D}`, D, D, castBody(s.corner))],
		['tone-below', svgUrl(`0 ${-T} ${below} ${T}`, below, T, hatched(s.toneBelow, 0.3, 0.6))],
		['tone-beside', svgUrl(`${-T} 0 ${T} ${beside}`, T, beside, hatched(s.toneBeside, 0.3, 0.6))],
	];
	return `.torn-strip {\n${props.map(([name, value]) => `\t--torn-${name}: ${value};`).join('\n')}\n}\n`;
}
