// The search dialog's empty-state drawing: a slip of paper with nothing on it under a magnifier, in the ink hand of the figures.
import { ellipse, jitter } from '../../figures/ink/desk.ts';
import { hatch, line, outline, pathOf, type P, resample, wash } from '../../figures/ink/ink.ts';
import { pencil } from '../../figures/ink/plane.ts';
import { relative } from '../ink-logos.ts';

const WIDTH = 220;
const HEIGHT = 140;

const turn = (points: P[], angle: number, about: P): P[] => {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return points.map(([x, y]) => [about[0] + (x - about[0]) * c - (y - about[1]) * s, about[1] + (x - about[0]) * s + (y - about[1]) * c]);
};

function slip(seed: number) {
	const centre: P = [92, 72];
	const corners = turn(jitter([[30, 26], [156, 26], [156, 116], [30, 116]], seed, 2.4), -0.06, centre);
	const edge = resample(corners, 6, true);
	const [, tr, br, bl] = corners as [P, P, P, P];
	const drop = 7;
	const shadow: P[] = [
		[tr[0], tr[1] + 5],
		[tr[0] + drop, tr[1] + 5 + drop],
		[br[0] + drop, br[1] + drop],
		[bl[0] + 5, bl[1] + drop],
		[bl[0] + 5, bl[1]],
		[br[0], br[1]],
	];
	const rules = [44, 58, 72].map((y, i) =>
		line(turn([[42, y], [42 + 52 - i * 12, y + 0.8]], -0.06, centre), { w: 0.7, seed: seed + 10 + i }),
	);
	return {
		paper: pathOf(edge, true),
		ink: outline(edge, { w: 1.9, heavy: 1.5, centre, seed: seed + 1 }),
		shadow: hatch(shadow, 0.85, 2.2, seed + 3, { cluster: 5, skip: 0.3, trim: 0.5 }),
		rules: rules.join(''),
	};
}

function magnifier(seed: number) {
	const centre: P = [134, 64];
	const outer = ellipse(centre[0], centre[1], 27, 26, 44);
	const inner = ellipse(centre[0], centre[1], 21.5, 20.5, 40);
	const angle = Math.PI / 4;
	const along: P = [Math.cos(angle), Math.sin(angle)];
	const across: P = [-along[1], along[0]];
	const at = (d: number, w: number): P => [centre[0] + along[0] * d + across[0] * w, centre[1] + along[1] * d + across[1] * w];
	const handle: P[] = [at(27, -4.5), at(66, -5.5), at(68, 0), at(66, 5.5), at(27, 4.5)];
	const arc = (rx: number, ry: number, from: number, to: number): P[] =>
		Array.from({ length: 18 }, (_, i) => {
			const t = from + ((to - from) * i) / 17;
			return [centre[0] + Math.cos(t) * rx, centre[1] + Math.sin(t) * ry];
		});
	const crescent = [...arc(27, 26, -0.4, 2.0), ...arc(21.5, 20.5, -0.4, 2.0).toReversed()];
	const shade: P[] = ellipse(centre[0] + 9, centre[1] + 10, 25, 24, 36);
	const handleShadow: P[] = [at(30, 5), at(68, 6), at(72, 14), at(34, 13)].map(([x, y]) => [x + 6, y + 7]);
	return {
		glass: wash(inner, seed, 0.8, 2.5),
		ring: outline(outer, { w: 2.2, heavy: 1.4, centre, seed: seed + 1 }) + outline(inner, { w: 1.1, seed: seed + 2 }),
		ringTone: hatch(crescent, 2.2, 1.4, seed + 3, { cluster: 4, skip: 0.15 }),
		handle: outline(handle, { w: 1.8, heavy: 1.6, centre: at(46, 0), seed: seed + 4 }),
		handleTone: hatch(handle, angle + Math.PI / 2, 1.5, seed + 5, { cluster: 3, skip: 0.1 }),
		shadow:
			hatch(shade, 0.9, 2.6, seed + 6, { cluster: 5, skip: 0.45, trim: 0.6 }) +
			hatch(handleShadow, 0.9, 1.6, seed + 7, { cluster: 4, skip: 0.2 }) +
			hatch(handleShadow, -0.5, 1.9, seed + 8, { cluster: 4, skip: 0.35 }),
		glint: line([at(-14, -10), at(-6, -16)].map(([x, y]) => [x - 4, y - 2] as P), { w: 1, seed: seed + 9 }),
	};
}

/** Every layer of the empty-state drawing, as path data in a WIDTH by HEIGHT box. */
export function art() {
	return {
		width: WIDTH,
		height: HEIGHT,
		slip: slip(900),
		lens: magnifier(940),
		pencil: pencil([[18, 26], [176, 22]], 980) + pencil([[156, 8], [160, 128]], 981) + pencil([[96, 64], [206, 70]], 982),
	};
}

const paint = {
	pencil: 'fill:none;stroke:var(--nothing-pencil);stroke-width:.7;stroke-linecap:round;opacity:var(--nothing-pencil-opacity)',
	hatch: 'fill:none;stroke:var(--nothing-ink);stroke-width:.65;stroke-linecap:round;opacity:.7',
	paper: 'fill:var(--nothing-paper)',
	ink: 'fill:var(--nothing-ink)',
	faint: 'fill:var(--nothing-ink);opacity:.35',
	glass: 'fill:var(--nothing-glass);opacity:var(--nothing-glass-opacity);mix-blend-mode:var(--nothing-glass-blend)',
} as const;

/** The drawing as one `<symbol id="nothing">`, painted from custom properties the page sets on the `<svg>` that uses it. */
export function nothingSprite(drawn: ReturnType<typeof art>): string {
	const layers: [keyof typeof paint, string][] = [
		['pencil', drawn.pencil],
		['hatch', drawn.slip.shadow],
		['paper', drawn.slip.paper],
		['ink', drawn.slip.ink],
		['faint', drawn.slip.rules],
		['hatch', drawn.lens.shadow],
		['glass', drawn.lens.glass],
		['ink', drawn.lens.ring],
		['hatch', drawn.lens.ringTone],
		['hatch', drawn.lens.handleTone],
		['ink', drawn.lens.handle],
		['ink', drawn.lens.glint],
	];
	const paths = layers.map(([kind, d]) => `<path style="${paint[kind]}" d="${relative(d)}"/>`).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg">\n<symbol id="nothing" viewBox="0 0 ${drawn.width} ${drawn.height}" overflow="visible">${paths}</symbol>\n</svg>\n`;
}
