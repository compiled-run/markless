// A guided tour of the repo: an inked route through the packages a .tsrx file passes on its way to the browser, a file card that rides it, a folder panel that opens at each stop, and side packages as labelled branches.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, r1, resample, stroke, wash } from '../ink/ink.ts';
import { desk, type DeskArt, type Item, type P, type SheetSpec, type TextItem } from '../ink/sheets.ts';
import { SIDES, STOPS } from './stops.ts';

export { SIDES, STOPS };

/** The two lines of the file the card carries. */
export const CODE = ["let pin = state('Lisbon');", '<h1>Pinned: {pin}</h1>'];

const MAP: SheetSpec = { key: 'map', x: 0, y: 0, w: 20.4, h: 10.4, turn: -0.008, curl: false };
const PANEL: SheetSpec = { key: 'panel', x: 3.4, y: MAP.h + 1, w: 13.6, h: 5.2, turn: 0.01, curl: false };
const ROW1 = 3.4;
const ROW2 = 7.6;
const COLS = [2.2, 7, 11.8, 16.6];
/** Where each stop sits on the map: the first row left to right, the second right to left. */
const AT: P[] = [[COLS[0]!, ROW1], [COLS[1]!, ROW1], [COLS[2]!, ROW1], [COLS[3]!, ROW1], [COLS[3]!, ROW2], [COLS[2]!, ROW2], [COLS[1]!, ROW2], [COLS[0]!, ROW2]];
const R = 0.55;

const scene = () => desk(680, [MAP, PANEL], [[MAP.w + 0.4, -0.6, 0]], { elevation: 70 });
type Kit = ReturnType<typeof scene>;

export interface Part {
	readonly paths: Item[];
	readonly texts: TextItem[];
}

const flat = (art: DeskArt): Part => ({
	paths: art.layers.flatMap((l) => l.paths).map((p, key) => ({ ...p, key })),
	texts: art.layers.flatMap((l) => l.texts).map((t, key) => ({ ...t, key })),
});

const part = (draw: (k: Kit) => void): Part => {
	const k = scene();
	draw(k);
	return flat(k.build());
};

const circle = (cu: number, cv: number, r: number): P[] => ellipse(cu, cv, r, r, 28);

/** The route: a heavy inked line through every stop, turning down at the right edge. */
function route(k: Kit) {
	const pts: P[] = [AT[0]!, AT[3]!];
	const turn: P[] = Array.from({ length: 14 }, (_, i) => {
		const a = -Math.PI / 2 + (i / 13) * Math.PI;
		return [COLS[3]! + Math.cos(a) * ((ROW2 - ROW1) / 2), (ROW1 + ROW2) / 2 + Math.sin(a) * ((ROW2 - ROW1) / 2)];
	});
	const all = resample([...pts, ...turn, AT[7]!], 0.3);
	const on = (p: P[]) => k.raw.on('map', p);
	k.raw.path(stroke(on(all), { w: 3.4, seed: 5000, over: 0, wobble: 0.3 }), 'route');
	k.raw.path(stroke(on(all), { w: 1.2, seed: 5001, over: 0, wobble: 0.3 }), 'route-core');
}

/** A folder or a file glyph on the panel. */
function folderGlyph(k: Kit, u: number, v: number, seed: number) {
	const body: P[] = [[u - 0.36, v - 0.42], [u - 0.06, v - 0.42], [u + 0.04, v - 0.54], [u + 0.36, v - 0.54], [u + 0.4, v - 0.42], [u + 0.4, v + 0.14], [u - 0.36, v + 0.14]];
	k.raw.path(pathOf(k.raw.on('panel', body), true), 'folder-fill');
	k.raw.path(outline(k.raw.on('panel', body), { w: 0.9, seed }), 'sheet-ink');
}

function fileGlyph(k: Kit, u: number, v: number, seed: number) {
	const page: P[] = [[u - 0.24, v - 0.46], [u + 0.08, v - 0.46], [u + 0.26, v - 0.28], [u + 0.26, v + 0.12], [u - 0.24, v + 0.12]];
	k.raw.path(pathOf(k.raw.on('panel', page), true), 'sheet-paper');
	k.raw.path(outline(k.raw.on('panel', page), { w: 0.75, seed }) + line(k.raw.on('panel', [[u + 0.08, v - 0.46], [u + 0.08, v - 0.28], [u + 0.26, v - 0.28]]), { w: 0.5, seed: seed + 1, over: 0 }), 'sheet-ink');
}

/** The browser stop's glyph: a small window instead of a station circle. */
function browserGlyph(k: Kit, u: number, v: number, seed: number) {
	const win = k.raw.on('map', roundRect(u - 0.75, v - 0.55, u + 0.75, v + 0.55, 0.1, 2), 0.02);
	k.raw.path(pathOf(win, true), 'sheet-paper');
	k.raw.path(outline(win, { w: 1.3, heavy: 1, seed }) + line(k.raw.on('map', [[u - 0.75, v - 0.22], [u + 0.75, v - 0.22]]), { w: 0.7, seed: seed + 1, over: 0 }), 'sheet-ink');
	k.raw.path(hatch(k.raw.on('map', [[u - 0.75, v - 0.55], [u + 0.75, v - 0.55], [u + 0.75, v - 0.22], [u - 0.75, v - 0.22]]), 0.1, 1.6, seed + 2, { cluster: 4, skip: 0.2 }), 'sheet-hatch light');
}

export function drawing() {
	const geo = scene();
	const proj = (u: number, v: number) => geo.raw.proj(geo.raw.at('map', u, v));
	const area = (key: string, pts: P[]) => pathOf(geo.raw.on(key, pts), true);
	const base = scene();
	base.lay();
	route(base);
	SIDES.forEach((side, i) => {
		const [u, v] = AT[side.at]!;
		const end = side.end;
		const len = Math.hypot(end[0] - u, end[1] - v);
		const start: P = [u + ((end[0] - u) / len) * (R + 0.1), v + ((end[1] - v) / len) * (R + 0.1)];
		const dash: P[] = resample([start, end], 0.12);
		for (let d = 0; d + 2 < dash.length; d += 5) base.raw.path(stroke(base.raw.on('map', dash.slice(d, d + 3)), { w: 1.1, seed: 5100 + i * 20 + d, over: 0 }), 'sheet-ink');
		base.raw.path(pathOf(base.raw.on('map', circle(end[0], end[1], 0.16)), true), 'sheet-ink');
		base.row('map', end[0] + 0.35, end[1] + 0.2, side.name, 'side-label');
	});
	STOPS.forEach((stop, i) => {
		const [u, v] = AT[i]!;
		if (stop.name === 'browser') browserGlyph(base, u, v, 5200 + i * 7);
		else {
			const ring = base.raw.on('map', circle(u, v, R), 0.02);
			base.raw.path(pathOf(ring, true), 'sheet-paper');
			base.raw.path(outline(ring, { w: 1.6, heavy: 1.2, seed: 5200 + i * 7 }), 'sheet-ink');
		}
		base.row('map', u - stop.name.length * 0.15, v + 1.25, stop.name, 'bold');
		if (stop.name === 'router') base.row('map', u + 1.3, v + 1.25, 'server', 'hand');
		if (stop.name === 'web') base.row('map', u + 0.8, v + 1.25, 'browser', 'hand');
	});
	const baseArt = base.build();

	const anchor = (i: number): P => proj(AT[i]![0] - 1.6, AT[i]![1] - 1.15);
	const origin = anchor(0);
	const stops = STOPS.map((stop, i) => {
		const [u, v] = AT[i]!;
		const at = anchor(i);
		return {
			key: i,
			name: stop.name,
			says: stop.says,
			move: 'translate(' + r1(at[0] - origin[0]) + 'px, ' + r1(at[1] - origin[1]) + 'px)',
			hit: area('map', [[u - 1.4, v - 0.8], [u + 1.4, v - 0.8], [u + 1.4, v + 1.5], [u - 1.4, v + 1.5]]),
			here: part((k) => {
				const blot = k.raw.on('map', circle(u, v, R + 0.12), 0.03);
				k.raw.path(wash(blot, 5300 + i, 0.4, 1.2), 'here-wash');
			}),
			panel: part((k) => {
				if (stop.name === 'browser') {
					const bar: P[] = [[0, 0], [PANEL.w, 0], [PANEL.w, 1.2], [0, 1.2]];
					k.raw.path(hatch(k.raw.on('panel', bar), 0.1, 1.8, 5400, { cluster: 5, skip: 0.2 }), 'sheet-hatch light');
					k.raw.path(line(k.raw.on('panel', [[0, 1.2], [PANEL.w, 1.2]]), { w: 0.8, seed: 5401 }), 'sheet-ink');
					k.row('panel', 2.2, 0.85, stop.path, 'mono small');
					k.row('panel', 1, 2.6, 'Pinned: Lisbon', 'big');
					const map: P[] = [[1, 3.1], [6.4, 3.1], [6.4, 4.8], [1, 4.8]];
					k.raw.path(pathOf(k.raw.on('panel', map), true), 'map-fill');
					k.raw.path(line(k.raw.on('panel', [[1.1, 4.3], [2.6, 3.8], [4, 4.1], [6.3, 3.5]]), { w: 0.8, seed: 5402 }), 'sheet-ink');
					k.raw.path(outline(k.raw.on('panel', map), { w: 1, seed: 5403 }), 'sheet-ink');
					const pin: P[] = Array.from({ length: 20 }, (_, n) => {
						const a = (n / 19) * Math.PI * 1.6 - Math.PI * 1.3;
						return [4.2 + Math.cos(a) * 0.32, 3.55 + Math.sin(a) * 0.32];
					});
					pin.push([4.2, 4.25]);
					k.raw.path(pathOf(k.raw.on('panel', pin, 0.05), true), 'pin-fill');
					k.raw.path(outline(k.raw.on('panel', pin, 0.05), { w: 1, seed: 5404 }), 'sheet-ink');
					return;
				}
				folderGlyph(k, 1.1, 1.3, 5410 + i);
				k.row('panel', 1.8, 1.3, stop.path, 'bold');
				stop.files.forEach((name, n) => {
					fileGlyph(k, 1.9, 2.5 + n * 0.95, 5420 + i * 5 + n);
					k.row('panel', 2.6, 2.5 + n * 0.95, name, 'mono');
				});
			}),
		};
	});
	const sides = SIDES.map((side, i) => {
		const end = side.end;
		return { key: i, name: side.name, does: side.does, hit: area('map', [[end[0] - 0.3, end[1] - 0.5], [end[0] + 0.5 + side.name.length * 0.3, end[1] - 0.5], [end[0] + 0.5 + side.name.length * 0.3, end[1] + 0.45], [end[0] - 0.3, end[1] + 0.45]]) };
	});
	const card = part((k) => {
		const [u, v] = AT[0]!;
		const c: P[] = [[u - 1.6, v - 2.15], [u + 1.3, v - 2.15], [u + 1.7, v - 1.75], [u + 1.7, v - 0.95], [u - 1.6, v - 0.95]];
		const cast: P[] = c.map(([a, b]) => [a + 0.15, b + 0.18]);
		k.raw.path(pathOf(k.raw.on('map', cast, 0.3), true), 'shadow-wash light');
		k.raw.path(pathOf(k.raw.on('map', c, 0.35), true), 'sheet-paper');
		k.raw.path(outline(k.raw.on('map', c, 0.35), { w: 1.3, heavy: 1, seed: 5500 }) + line(k.raw.on('map', [[u + 1.3, v - 2.15], [u + 1.3, v - 1.75], [u + 1.7, v - 1.75]], 0.35), { w: 0.6, seed: 5501, over: 0 }), 'sheet-ink');
		k.row('map', u - 1.35, v - 1.55, 'map.tsrx', 'bold');
		k.row('map', u - 1.35, v - 1.1, CODE[0]!.slice(0, 18) + '…', 'mono tiny');
	});
	return { view: baseArt.view, base: flat(baseArt), stops, sides, card };
}
