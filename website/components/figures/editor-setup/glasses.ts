// A pair of reading glasses lying across the printed counter.tsrx: the top lens (the TSRX extension) shows the code in colour, the bottom lens (the Markless plugin) shows the red line under onClik and the @ suggestions; outside the lenses the print is grey.
import { centreOf, roundRect, shadowOnDesk } from '../ink/desk.ts';
import { hatch, hull, line, outline, pathOf, stroke, wash } from '../ink/ink.ts';
import { desk, type P, type Point3, type Run } from '../ink/sheets.ts';

const PITCH = 0.85;
const CODE = 2.2;
const ADV = 0.3;

/** counter.tsrx, one array of runs per printed line; null is the gap the glasses' bridge sits over. onClik is the misspelt handler the plugin catches. */
export const LINES: (Run[] | null)[] = [
	[{ t: 'import', tint: 'kw' }, { t: ' { state } ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'@markless/core'", tint: 'str' }, { t: ';' }],
	[],
	[{ t: 'export default function', tint: 'kw' }, { t: ' ' }, { t: 'Counter', tint: 'fn' }, { t: '() ' }, { t: '@{', tint: 'kw' }],
	[{ t: '  ' }, { t: 'let', tint: 'kw' }, { t: ' count = ' }, { t: 'state', tint: 'fn' }, { t: '(' }, { t: '0', tint: 'num' }, { t: ');' }],
	null,
	null,
	[{ t: '  <' }, { t: 'button', tint: 'tag' }, { t: ' ' }, { t: 'onClik', tint: 'fn' }, { t: '={() => count++}>' }],
	[{ t: '    Count {count}' }],
	[{ t: '  </' }, { t: 'button', tint: 'tag' }, { t: '>' }],
	[{ t: '  ' }, { t: '@', tint: 'kw' }],
	[{ t: '}' }],
];

export const SUGGESTED = ['@if', '@for', '@try'];

const row = (i: number) => 2.3 + i * PITCH;
/** The two lenses in sheet units: the extension's over lines 1 to 4, the plugin's over the button and the @. */
export const LENSES = {
	extension: { u0: 1.75, v0: row(0) - 0.85, u1: 14.4, v1: row(3) + 0.5 },
	plugin: { u0: 1.75, v0: row(6) - 0.85, u1: 14.4, v1: row(10) + 0.9 },
};

const textOf = (runs: Run[]) => runs.map((r) => r.t).join('');

export function drawing() {
	const k = desk(680, [{ key: 'page', x: 0, y: 0, w: 21, h: row(LINES.length) + 0.8, curl: true }], [[3, 12, 0]]);
	k.lay();
	const lift = 0.55;
	const at = (u: number, v: number, z = lift): Point3 => k.raw.at('page', u, v, z);
	const P = k.raw.proj;
	const lensOf = (i: number) => (i < 4 ? LENSES.extension : LENSES.plugin);
	let n = 0;
	LINES.forEach((runs, i) => {
		if (runs === null) return;
		n++;
		k.row('page', 0.9, row(i), String(n), 'num');
		if (!runs.length) return;
		k.print('page', CODE, row(i), [{ t: textOf(runs), c: 'mono dim' }]);
	});

	for (const lens of [LENSES.extension, LENSES.plugin]) {
		const shadow = roundRect(lens.u0, lens.v0, lens.u1, lens.v1, 1.1, 6).map(([u, v]) => P(shadowOnDesk(at(u, v))));
		k.raw.path(stroke([...shadow, shadow[0]!, shadow[1]!], { w: 4, seed: 2000 + Math.round(lens.v0 * 10), over: 0, wobble: 0.3 }), 'shadow-wash');
	}
	k.next();

	for (const lens of [LENSES.extension, LENSES.plugin]) {
		const glass = k.raw.on('page', roundRect(lens.u0 + 0.1, lens.v0 + 0.1, lens.u1 - 0.1, lens.v1 - 0.1, 1, 6), 0.03);
		k.raw.path(pathOf(glass, true), 'sheet-paper');
	}
	LINES.forEach((runs, i) => {
		if (!runs || !runs.length) return;
		const lens = lensOf(i);
		if (lens === LENSES.extension) {
			k.print('page', CODE, row(i), [{ t: textOf(runs), c: 'mono dim' }], 'gone', 500);
			k.print('page', CODE, row(i), runs, 'show', 600);
		} else k.print('page', CODE, row(i), [{ t: textOf(runs), c: 'mono' }]);
	});
	const clik = textOf(LINES[6]!).indexOf('onClik');
	k.wavy('page', CODE + clik * ADV, CODE + (clik + 6) * ADV, row(6), 'draw', 1500);
	const at8 = CODE + 4 * ADV;
	const popV = row(9) - 0.75;
	const pop = k.raw.on('page', roundRect(at8, popV, at8 + 1.9, popV + SUGGESTED.length * 0.55 + 0.25, 0.15, 3), 0.06);
	k.raw.path(pathOf(pop, true), 'sheet-paper show', k.raw.motion('show', 2200));
	k.raw.path(outline(pop, { w: 0.9, heavy: 0.7, seed: 2101 }), 'sheet-ink show', k.raw.motion('show', 2200));
	SUGGESTED.forEach((s, i) => k.raw.text('page', at8 + 0.35, popV + 0.6 + i * 0.55, s, 'mono tint-kw', 'show', 2300 + i * 90));
	k.next();

	[LENSES.extension, LENSES.plugin].forEach((lens, i) => {
		const outer = roundRect(lens.u0 - 0.35, lens.v0 - 0.35, lens.u1 + 0.35, lens.v1 + 0.35, 1.4, 6).map(([u, v]) => P(at(u, v)));
		const inner = roundRect(lens.u0 + 0.1, lens.v0 + 0.1, lens.u1 - 0.1, lens.v1 - 0.1, 1, 6).map(([u, v]) => P(at(u, v)));
		k.raw.path(pathOf(outer, true) + pathOf([...inner].reverse(), true), 'sheet-paper');
		k.raw.path(outline(outer, { w: 2.2, heavy: 2, centre: centreOf(outer), seed: 2200 + i * 10 }) + outline(inner, { w: 1.1, seed: 2201 + i * 10 }), 'sheet-ink');
		const glint = (s0: number, s1: number, inset: number): P[] => Array.from({ length: 8 }, (_, s) => {
			const t = s0 + ((s1 - s0) * s) / 7;
			return P(at(lens.u1 - 2.2 - inset + t * 1.4, lens.v0 + 0.32 + inset * 0.2));
		});
		k.raw.path(stroke(glint(0, 1, 0.6), { w: 2, seed: 2205 + i * 10, over: 0 }) + stroke(glint(0.2, 0.8, 1), { w: 1.2, seed: 2206 + i * 10, over: 0 }), 'sheet-paper');
	});
	const mid = (LENSES.extension.u0 + LENSES.extension.u1) / 2;
	const bridge = Array.from({ length: 10 }, (_, s) => {
		const t = s / 9;
		return P(at(mid - 0.2 + Math.sin(t * Math.PI) * 0.5, LENSES.extension.v1 + 0.35 + t * (LENSES.plugin.v0 - LENSES.extension.v1 - 0.7), lift + 0.2));
	});
	k.raw.path(line(bridge, { w: 2.6, heavy: 1.4, seed: 2230 }), 'sheet-ink');
	const arm = (lens: { u1: number; v0: number; v1: number }, top: boolean, seed: number) => {
		const v = top ? lens.v0 + 0.3 : lens.v1 - 0.3;
		const pts = Array.from({ length: 8 }, (_, s) => at(lens.u1 + 0.3 + s * 0.6, v + (top ? 1 : -1) * s * 0.05, lift + 0.2));
		const topLine = pts.map(P);
		const low = pts.map((p) => P([p[0], p[1], p[2] - 0.3]));
		const body = [...topLine, ...low.reverse()];
		k.raw.path(wash(hull(pts.map((p) => P(shadowOnDesk(p)))), seed, 0.6, 1.4), 'shadow-wash light');
		k.raw.path(pathOf(body, true), 'sheet-paper');
		k.raw.path(hatch(body, 1.1, 1.2, seed + 1, { cluster: 2, trim: 0.1 }), 'sheet-hatch light');
		k.raw.path(outline(body, { w: 1.1, heavy: 1, centre: centreOf(body), seed: seed + 2 }), 'sheet-ink');
	};
	arm(LENSES.extension, true, 2240);
	arm(LENSES.plugin, false, 2250);
	k.hand('page', 15.2, row(1.6), 'THE EXTENSION:', 'show', 900);
	k.hand('page', 15.2, row(2.4), 'COLOURS', 'show', 900);
	k.hand('page', 15.2, row(7.2), 'THE PLUGIN:', 'show', 2700);
	k.hand('page', 15.2, row(8), 'RED LINES,', 'show', 2700);
	k.hand('page', 15.2, row(8.8), 'SUGGESTIONS', 'show', 2700);
	return k.build();
}
