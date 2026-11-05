// A pair of reading glasses lying on the printed counter.tsrx: under one lens the TSRX extension's colours, under the other the Markless plugin's red line and @ suggestions; outside both, plain grey print.
import { centreOf, ellipse, matrixOf, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, stroke, wash } from '../ink/ink.ts';
import { desk, type P, type Point3, type Run } from '../ink/sheets.ts';

const row = (i: number) => 2.4 + i * 0.85;
const CODE = 2.2;
const ADV = 0.3;
const MAG = 1.08;

/** counter.tsrx with its colours, one array of runs per line; onClik is the misspelt handler the plugin catches. */
export const LINES: Run[][] = [
	[{ t: 'import', tint: 'kw' }, { t: ' { state } ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'@markless/core'", tint: 'str' }, { t: ';' }],
	[],
	[{ t: 'export default function', tint: 'kw' }, { t: ' ' }, { t: 'Counter', tint: 'fn' }, { t: '() ' }, { t: '@{', tint: 'kw' }],
	[{ t: '  ' }, { t: 'let', tint: 'kw' }, { t: ' count = ' }, { t: 'state', tint: 'fn' }, { t: '(' }, { t: '0', tint: 'num' }, { t: ');' }],
	[{ t: '  <' }, { t: 'button', tint: 'tag' }, { t: ' ' }, { t: 'onClik', tint: 'fn' }, { t: '={() => count++}>Count {count}</' }, { t: 'button', tint: 'tag' }, { t: '>' }],
	[{ t: '  ' }, { t: '@', tint: 'kw' }],
	[{ t: '}' }],
];

export const SUGGESTED = ['@if', '@for', '@try'];

/** The two lenses on the page, in sheet units: the extension's over the top lines, the plugin's over onClik and the @. */
export const LENSES = {
	extension: { u: 10.8, v: 3.3, r: 3.3 },
	plugin: { u: 4.9, v: 7.4, r: 3.3 },
};

const textOf = (runs: Run[]) => runs.map((r) => r.t).join('');

/** Every printed character with its colour, in sheet units: its left edge, baseline and centre. */
function chars() {
	const out: { ch: string; tint: string; u: number; v: number; line: number; col: number }[] = [];
	LINES.forEach((runs, line) => {
		let col = 0;
		for (const run of runs) {
			for (const ch of run.t) {
				if (ch !== ' ') out.push({ ch, tint: run.tint ?? '', u: CODE + col * ADV, v: row(line), line, col });
				col++;
			}
		}
	});
	return out;
}

const inside = (lens: { u: number; v: number; r: number }, u: number, v: number, shrink = 1) => Math.hypot(u - lens.u, v - lens.v) < lens.r * shrink;

export function drawing() {
	const k = desk(680, [{ key: 'page', x: 0, y: 0, w: 21, h: row(LINES.length) + 2.6, curl: true }], [[3, 11.5, 0], [14, 0.2, 0]]);
	k.lay();
	const lensList = [LENSES.extension, LENSES.plugin];
	const centreOfChar = (c: { u: number; v: number }) => [c.u + ADV / 2, c.v - 0.18] as const;
	LINES.forEach((_, i) => k.row('page', 0.9, row(i), String(i + 1), 'num'));
	for (const c of chars()) {
		const [cu, cv] = centreOfChar(c);
		if (lensList.some((lens) => inside(lens, cu, cv, 1.01))) continue;
		k.raw.text('page', c.u, c.v, c.ch, 'mono dim');
	}

	const lift = 0.55;
	const at = (u: number, v: number, z = lift): Point3 => k.raw.at('page', u, v, z);
	const P = k.raw.proj;
	const magnified = (lens: { u: number; v: number }, u: number, v: number): [number, number] => [lens.u + (u - lens.u) * MAG, lens.v + (v - lens.v) * MAG];
	const textIn = (lens: { u: number; v: number }, u: number, v: number, text: string, cls: string, m: '' | 'show' | 'gone' = '', when?: number) => {
		const [mu, mv] = magnified(lens, u, v);
		const s = 0.05 * MAG;
		k.raw.textWith(matrixOf(P(at(mu, mv, 0.02)), P(at(mu + s, mv, 0.02)), P(at(mu, mv + s, 0.02))), text, cls, m, when);
	};
	const fits = (lens: { u: number; v: number; r: number }, u: number, v: number) => {
		const [mu, mv] = magnified(lens, u, v);
		return inside(lens, mu, mv, 0.97);
	};

	for (const lens of lensList) {
		const ringShadow = ellipse(lens.u, lens.v, lens.r + 0.1, lens.r + 0.1, 48).map(([u, v]) => P(shadowOnDesk(at(u, v))));
		k.raw.path(stroke([...ringShadow, ringShadow[0]!, ringShadow[1]!], { w: 4, seed: 2000 + Math.round(lens.u * 10), over: 0, wobble: 0.3 }), 'shadow-wash');
	}
	k.next();

	for (const c of chars()) {
		const [cu, cv] = centreOfChar(c);
		if (fits(LENSES.extension, cu, cv)) {
			textIn(LENSES.extension, c.u, c.v, c.ch, 'mono dim', 'gone', 500);
			textIn(LENSES.extension, c.u, c.v, c.ch, c.tint ? 'mono tint-' + c.tint : 'mono', 'show', 600);
		}
		if (fits(LENSES.plugin, cu, cv)) textIn(LENSES.plugin, c.u, c.v, c.ch, 'mono dim');
	}
	const clik = textOf(LINES[4]!).indexOf('onClik');
	const wave: P[] = [];
	for (let s = 0; s <= 1.0001; s += 0.04) {
		const u = CODE + clik * ADV + s * 6 * ADV;
		const [mu, mv] = magnified(LENSES.plugin, u, row(4) + 0.17 + Math.sin(s * Math.PI * 6) * 0.07);
		wave.push(P(at(mu, mv, 0.02)));
	}
	k.raw.path(pathOf(wave), 'pen squiggle draw', k.raw.motion('draw', 1500, '--l:' + Math.round(wave.length * 3)));
	const popU = CODE + 3 * ADV;
	const popV = row(5) + 0.35;
	const pop = roundRect(popU, popV, popU + 1.8, popV + SUGGESTED.length * 0.55 + 0.3, 0.15, 3).map(([u, v]) => P(at(...magnified(LENSES.plugin, u, v), 0.04)));
	k.raw.path(pathOf(pop, true), 'sheet-paper show', k.raw.motion('show', 2200));
	k.raw.path(outline(pop, { w: 0.9, heavy: 0.7, seed: 2101 }), 'sheet-ink show', k.raw.motion('show', 2200));
	SUGGESTED.forEach((s, i) => textIn(LENSES.plugin, popU + 0.35, popV + 0.68 + i * 0.55, s, 'mono tint-kw', 'show', 2300 + i * 90));
	k.next();

	for (const [i, lens] of lensList.entries()) {
		const rim = ellipse(lens.u, lens.v, lens.r, lens.r, 48).map(([u, v]) => P(at(u, v)));
		const outer = ellipse(lens.u, lens.v, lens.r + 0.22, lens.r + 0.22, 48).map(([u, v]) => P(at(u, v)));
		k.raw.path(outline(outer, { w: 2.4, heavy: 2.2, centre: centreOf(outer), seed: 2200 + i * 10 }) + outline(rim, { w: 1.1, seed: 2201 + i * 10 }), 'sheet-ink');
		const glint = (a0: number, a1: number, rr: number) => Array.from({ length: 10 }, (_, s) => {
			const a = a0 + ((a1 - a0) * s) / 9;
			return P(at(lens.u + Math.cos(a) * rr, lens.v + Math.sin(a) * rr));
		});
		const sheen = [...glint(3.5, 4.6, lens.r * 0.92), ...glint(3.5, 4.6, lens.r * 0.7).reverse()];
		k.raw.path(hatch(sheen, 0.9, 1.3, 2207 + i * 10, { cluster: 3, skip: 0.2, trim: 0.2 }), 'sheet-hatch light');
		k.raw.path(stroke(glint(3.6, 4.4, lens.r * 0.78), { w: 2.2, seed: 2205 + i * 10, over: 0 }) + stroke(glint(3.75, 4.15, lens.r * 0.62), { w: 1.4, seed: 2206 + i * 10, over: 0 }), 'sheet-paper');
	}
	const dx = LENSES.extension.u - LENSES.plugin.u;
	const dy = LENSES.extension.v - LENSES.plugin.v;
	const len = Math.hypot(dx, dy);
	const ax: [number, number] = [dx / len, dy / len];
	const nx: [number, number] = [-ax[1], ax[0]];
	const r = LENSES.plugin.r + 0.22;
	const b0: [number, number] = [LENSES.plugin.u + ax[0] * r, LENSES.plugin.v + ax[1] * r];
	const b1: [number, number] = [LENSES.extension.u - ax[0] * r, LENSES.extension.v - ax[1] * r];
	const bridge = Array.from({ length: 12 }, (_, s) => {
		const t = s / 11;
		const bow = Math.sin(t * Math.PI) * 0.45;
		return P(at(b0[0] + (b1[0] - b0[0]) * t - nx[0] * bow, b0[1] + (b1[1] - b0[1]) * t - nx[1] * bow, lift + 0.15));
	});
	k.raw.path(line(bridge, { w: 2.2, heavy: 1.2, seed: 2230 }), 'sheet-ink');
	const arm = (lens: { u: number; v: number; r: number }, side: 1 | -1, seed: number) => {
		const hinge: [number, number] = [lens.u + side * ax[0] * (lens.r + 0.1) - nx[0] * 0.5, lens.v + side * ax[1] * (lens.r + 0.1) - nx[1] * 0.5];
		const end: [number, number] = [hinge[0] + side * ax[0] * 0.9 - nx[0] * 0.2, hinge[1] + side * ax[1] * 0.9 - nx[1] * 0.2];
		const pts = Array.from({ length: 6 }, (_, s) => {
			const t = s / 5;
			return at(hinge[0] + (end[0] - hinge[0]) * t, hinge[1] + (end[1] - hinge[1]) * t, lift + 0.3);
		});
		const top = pts.map(P);
		const low = pts.map((p) => P([p[0], p[1], p[2] - 0.35]));
		const body = [...top, ...low.reverse()];
		k.raw.path(wash(hull(pts.map((p) => P(shadowOnDesk(p)))), seed, 0.6, 1.4), 'shadow-wash light');
		k.raw.path(pathOf(body, true), 'sheet-paper');
		k.raw.path(hatch(body, 1.1, 1.2, seed + 1, { cluster: 2, trim: 0.1 }), 'sheet-hatch light');
		k.raw.path(outline(body, { w: 1.2, heavy: 1, centre: centreOf(body), seed: seed + 2 }), 'sheet-ink');
	};
	arm(LENSES.extension, 1, 2240);
	arm(LENSES.plugin, -1, 2250);
	k.hand('page', 14.4, 1.2, 'THE EXTENSION: COLOURS', 'show', 900);
	k.hand('page', 9.2, row(7) + 1.2, 'THE PLUGIN: RED LINES, SUGGESTIONS', 'show', 2700);
	return k.build();
}
