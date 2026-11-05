// The repo's packages/ folder in a file explorer, a .tsrx file and a browser: the file travels compiler, bundler, web, then the browser; adding an import of core inside web closes a cycle.
import type { SheetSpec } from '../ink/sheets.ts';
import { hatch, line, outline, pathOf } from '../ink/ink.ts';
import { band, chevron, cross, figure, folder, type Kit, type P } from '../reference/kit.ts';

/** packages/ as it sits in the repo, with what each package's src imports (from the tour page). */
export const PACKAGES = [
	{ name: 'analyzer', imports: [] as string[], pipeline: false },
	{ name: 'bundler', imports: ['compiler', 'serializer', 'web'], pipeline: true },
	{ name: 'cli', imports: [], pipeline: false },
	{ name: 'compiler', imports: ['serializer'], pipeline: true },
	{ name: 'core', imports: ['web', 'bundler', 'router'], pipeline: true },
	{ name: 'headless', imports: [], pipeline: false },
	{ name: 'router', imports: ['bundler', 'compiler', 'web'], pipeline: false },
	{ name: 'runtime', imports: ['serializer'], pipeline: true },
	{ name: 'serializer', imports: [], pipeline: true },
	{ name: 'typescript-plugin', imports: ['compiler'], pipeline: false },
	{ name: 'vitest-browser', imports: ['core', 'web'], pipeline: false },
	{ name: 'web', imports: ['runtime', 'serializer'], pipeline: true },
];

/** The stops a .tsrx file makes on its way to the page. */
export const TRACE = ['compiler', 'bundler', 'web'];
/** Two lines of a page that pins a city on a map. */
export const CODE = ["let pin = state('Lisbon');", '<h1>Pinned: {pin}</h1>'];

const W = 13.4;
const PITCH = 0.96;
const FIRST = 3.4;
const rowV = (i: number) => FIRST + i * PITCH;
const STATUS = rowV(PACKAGES.length) - 0.4;
const EXP: SheetSpec = { key: 'exp', x: 0, y: 0, w: W, h: STATUS + 0.6, bar: 'editor', title: 'markless', curl: false, turn: -0.01 };
const FILE: SheetSpec = { key: 'file', x: W + 1.2, y: 0.4, w: 9, h: 4.6, bar: 'editor', title: 'map.tsrx', curl: false, turn: 0.02 };
const PAGE: SheetSpec = { key: 'page', x: W + 1.4, y: 9.6, w: 8.4, h: 6.2, bar: 'browser', title: 'localhost:3000', turn: -0.015 };
const NAME = 3.4;

const nameEnd = (name: string) => NAME + name.length * 0.3;

export function drawing() {
	const fig = figure([EXP, FILE, PAGE], [[W + 10.4, -1, 0]]);
	const base = fig.base((k: Kit) => {
		chevron(k, 'exp', 1, 2.35, true, 3900);
		folder(k, 'exp', 1.75, 2.45, 3901);
		k.row('exp', 2.45, 2.4, 'packages', 'mono');
		PACKAGES.forEach((pkg, i) => {
			const v = rowV(i);
			chevron(k, 'exp', 1.9, v, false, 3910 + i);
			folder(k, 'exp', 2.65, v + 0.05, 3930 + i);
			k.row('exp', NAME, v, pkg.name, pkg.pipeline ? 'bold' : 'dim');
		});
		CODE.forEach((code, i) => k.row('file', 0.8, 2.5 + i * 0.85, code, 'mono'));
	});
	const rows = PACKAGES.map((pkg, i) => {
		const v = rowV(i);
		return {
			key: i,
			name: pkg.name,
			imports: pkg.name + (pkg.imports.length ? ' imports ' + pkg.imports.join(', ') : ' imports nothing'),
			hover: fig.part((k) => {
				band(k, 'exp', 1.5, W - 0.4, v - 0.15, 4000 + i);
			}),
			hit: fig.area('exp', [[1.4, v - PITCH / 2 - 0.15], [W - 0.3, v - PITCH / 2 - 0.15], [W - 0.3, v + PITCH / 2 - 0.15], [1.4, v + PITCH / 2 - 0.15]]),
		};
	});
	const stops = TRACE.map((name, step) => {
		const i = PACKAGES.findIndex((pkg) => pkg.name === name);
		const v = rowV(i);
		return {
			key: step,
			part: fig.part((k) => {
				band(k, 'exp', 1.5, nameEnd(name) + 0.4, v - 0.15, 4100 + step, 'swipe');
				k.number('exp', nameEnd(name) + 1, v + 0.05, String(step + 1));
			}),
		};
	});
	const web = PACKAGES.findIndex((pkg) => pkg.name === 'web');
	const core = PACKAGES.findIndex((pkg) => pkg.name === 'core');
	return {
		view: base.view,
		base: base.part,
		rows,
		stops,
		arrival: fig.part((k) => {
			k.number('page', 0.9, 2.9, String(TRACE.length + 1));
			k.row('page', 1.8, 3, 'Pinned: Lisbon', 'big');
			const map: P[] = [[1.8, 3.7], [6.2, 3.7], [6.2, 5.8], [1.8, 5.8]];
			k.raw.path(pathOf(k.raw.on('page', map), true), 'map-fill');
			k.raw.path(hatch(k.raw.on('page', [[1.8, 4.5], [3.4, 3.7], [6.2, 3.7], [6.2, 4.2], [4, 5.8], [1.8, 5.8]]), 0.6, 1.8, 4300, { cluster: 3, skip: 0.3, trim: 0.3 }), 'sheet-hatch light');
			k.raw.path(line(k.raw.on('page', [[1.9, 5.1], [3.2, 4.6], [4.4, 4.9], [6.1, 4.3]]), { w: 0.8, seed: 4301 }), 'sheet-ink');
			k.raw.path(outline(k.raw.on('page', map), { w: 1.1, heavy: 0.9, seed: 4302 }), 'sheet-ink');
			const pin: P[] = Array.from({ length: 20 }, (_, i) => {
				const a = (i / 19) * Math.PI * 1.6 - Math.PI * 1.3;
				return [4.3 + Math.cos(a) * 0.38, 4.15 + Math.sin(a) * 0.38];
			});
			pin.push([4.3, 4.95]);
			k.raw.path(pathOf(k.raw.on('page', pin, 0.05), true), 'pin-fill');
			k.raw.path(outline(k.raw.on('page', pin, 0.05), { w: 1.1, seed: 4303 }), 'sheet-ink');
		}),
		cycle: fig.part((k) => {
			const wv = rowV(web);
			const cv = rowV(core);
			k.raw.text('exp', nameEnd('web') + 1.7, wv, "+ import core", 'bad-text');
			cross(k, 'exp', 0.9, wv - 0.15, 4200);
			cross(k, 'exp', 0.9, cv - 0.15, 4201);
			k.arrow(['exp', 1.4, wv - 0.3], ['exp', 1.4, cv - 0.1], '', undefined, -2.2);
			k.raw.text('exp', nameEnd('core') + 0.8, cv, 'cycle', 'hand bad-hand');
		}),
		file: fig.area('file', [[0, 0], [FILE.w, 0], [FILE.w, FILE.h], [0, FILE.h]]),
		webHit: rows[web]!.hit,
		web,
	};
}

