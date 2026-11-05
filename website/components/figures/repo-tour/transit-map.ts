// The repo's packages printed as a transit map: a compile line and a render line meeting at web, with four termini where the result runs; every line runs one way.
import { ellipse } from '../ink/desk.ts';
import { outline, pathOf, resample, stroke } from '../ink/ink.ts';
import { desk, type P } from '../ink/sheets.ts';

/** Map ink for the two lines: one muted token colour each, darkened with the sheet's own ink so they read in both themes. */
const COMPILE = 'fill:color-mix(in oklch, var(--purple) 50%, var(--sheet-ink))';
const RENDER = 'fill:color-mix(in oklch, var(--green-soft) 52%, var(--sheet-ink))';

type Stop = { name: string; at: P; label: 'above' | 'below'; kind: 'stop' | 'interchange' | 'end' };

export const COMPILE_STOPS: Stop[] = [
	{ name: 'Counter.tsrx', at: [2.4, 2.8], label: 'above', kind: 'end' },
	{ name: 'compiler', at: [6.6, 2.8], label: 'above', kind: 'stop' },
	{ name: 'bundler', at: [10.6, 2.8], label: 'above', kind: 'stop' },
];
export const PLUGIN: Stop = { name: 'typescript-plugin', at: [6.6, 4.5], label: 'below', kind: 'end' };
export const RENDER_STOPS: Stop[] = [
	{ name: 'core', at: [10.2, 6.2], label: 'below', kind: 'stop' },
	{ name: 'web', at: [13.4, 6.2], label: 'below', kind: 'interchange' },
	{ name: 'runtime', at: [16.4, 6.2], label: 'below', kind: 'stop' },
	{ name: 'serializer', at: [19.3, 6.2], label: 'below', kind: 'stop' },
];
export const TERMINI: Stop[] = ['a browser', 'a server', 'a build step', 'a test'].map((name, i) => ({ name, at: [4.4 + i * 4.6, 10] as P, label: 'below', kind: 'end' }));

const MONO = 0.3;

export function drawing() {
	const k = desk(680, [{ key: 'map', x: 0, y: 0, w: 21.4, h: 12 }]);
	k.lay();
	const lineOf = (pts: P[], style: string, seed: number) => k.raw.path(stroke(k.raw.on('map', resample(pts, 0.3)), { w: 6.4, seed, over: 0, wobble: 0.25 }), 'sheet-ink', style);
	const chevron = (a: P, b: P, seed: number) => {
		const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		const d: P = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
		const n: P = [-d[1], d[0]];
		const tip: P = [m[0] + d[0] * 0.22, m[1] + d[1] * 0.22];
		const arm = (s: number): P => [m[0] - d[0] * 0.22 + n[0] * 0.3 * s, m[1] - d[1] * 0.22 + n[1] * 0.3 * s];
		k.raw.path(stroke(k.raw.on('map', [arm(1), tip, arm(-1)]), { w: 1.6, seed, over: 0 }), 'sheet-paper');
	};
	const compilePath: P[] = [[2.4, 2.8], [12.2, 2.8], [13.4, 4], [13.4, 6.2]];
	const pluginPath: P[] = [[6.6, 2.8], [6.6, 4.5]];
	const renderPath: P[] = [[10.2, 6.2], [19.3, 6.2], [19.3, 8.2]];
	const busPath: P[] = [[19.3, 8.2], [4.4, 8.2]];
	lineOf(compilePath, COMPILE, 2201);
	lineOf(pluginPath, COMPILE, 2202);
	lineOf(renderPath, RENDER, 2203);
	lineOf(busPath, RENDER, 2204);
	TERMINI.forEach((t, i) => lineOf([[t.at[0], 8.2], t.at], RENDER, 2210 + i));
	for (const [a, b] of [[[2.4, 2.8], [6.6, 2.8]], [[6.6, 2.8], [10.6, 2.8]], [[13.4, 4.2], [13.4, 6.2]], [[6.6, 2.8], [6.6, 4.5]], [[10.2, 6.2], [13.4, 6.2]], [[13.4, 6.2], [16.4, 6.2]], [[16.4, 6.2], [19.3, 6.2]], [[19.3, 6.2], [19.3, 8.2]], [[19.3, 8.2], [13.8, 8.2]], [[9.2, 8.2], [4.4, 8.2]]] as [P, P][]) chevron(a, b, 2230 + Math.round(a[0] * 7 + a[1] * 3));
	const stops = [...COMPILE_STOPS, PLUGIN, ...RENDER_STOPS, ...TERMINI];
	stops.forEach((s, i) => {
		const [u, v] = s.at;
		if (s.kind === 'end') {
			const bar: P[] = s.label === 'below' ? [[u - 0.55, v], [u + 0.55, v]] : [[u, v - 0.55], [u, v + 0.55]];
			k.raw.path(stroke(k.raw.on('map', bar), { w: 6.4, seed: 2300 + i, over: 0 }), 'sheet-ink');
		} else {
			const r = s.kind === 'interchange' ? 0.62 : 0.36;
			const ring = k.raw.on('map', ellipse(u, v, r, r, 24));
			k.raw.path(pathOf(ring, true), 'sheet-paper');
			k.raw.path(outline(ring, { w: s.kind === 'interchange' ? 2.2 : 1.4, seed: 2320 + i }), 'sheet-ink');
		}
	});
	k.next();
	const labelAt = (s: Stop): P => {
		const w = s.name.length * MONO;
		return [s.at[0] - w / 2, s.label === 'above' ? s.at[1] - 0.75 : s.at[1] + 1.15];
	};
	const order = [...COMPILE_STOPS, ...RENDER_STOPS.slice(1), ...TERMINI];
	stops.forEach((s) => {
		const [u, v] = labelAt(s);
		const n = order.indexOf(s);
		if (n >= 0) k.swipe('map', u - 0.05, u + s.name.length * MONO, v, 'show', 300 + n * 380);
		k.row('map', u, v, s.name, s.kind === 'end' && TERMINI.includes(s) ? 'ui' : 'mono');
	});
	return k.build();
}
