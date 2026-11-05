// A terminal running npm install @markless/core above a file explorer of node_modules/@markless/: the packages land in dependency order, and deleting one marks the packages that need it.
import type { SheetSpec } from '../ink/sheets.ts';
import { band, chevron, cross, figure, folder, strikeOut } from './kit.ts';

/** The packages npm puts in node_modules/@markless/ for @markless/core, breadth first by dependency, with what each does (from the page's tables) and what it depends on (from its package.json). */
export const PACKAGES = [
	{ name: 'core', does: 'state, computed, render()', needs: ['bundler', 'router', 'web'] },
	{ name: 'bundler', does: 'runs the compiler in Vite', needs: ['compiler', 'serializer', 'web'] },
	{ name: 'router', does: 'file routes, Link, navigate()', needs: ['bundler', 'compiler', 'web'] },
	{ name: 'web', does: 'the render code', needs: ['runtime', 'serializer'] },
	{ name: 'compiler', does: 'reads .tsrx files', needs: ['serializer'] },
	{ name: 'serializer', does: 'state and page data format', needs: [] },
	{ name: 'runtime', does: 'keeps state', needs: ['serializer'] },
];

export const COMMAND = 'npm install @markless/core';

const W = 17.6;
const TERM: SheetSpec = { key: 'term', x: 0, y: 0, w: W, h: 3.3, bar: 'terminal', curl: false };
const PITCH = 1.12;
const FIRST = 4.3;
const rowV = (i: number) => FIRST + i * PITCH;
const EXP: SheetSpec = { key: 'exp', x: 0.3, y: TERM.h + 1.3, w: W, h: rowV(PACKAGES.length) + 0.4, turn: -0.012, bar: 'editor', title: 'Explorer' };
const ICON = 3;
const NAME = 3.7;
const DESC = 9.2;

export function drawing() {
	const fig = figure([TERM, EXP], [[W + 1, -1, 0]]);
	const base = fig.base((k) => {
		k.row('term', 1, 2.5, '$', 'dim');
		k.row('term', 1.7, 2.5, COMMAND, 'bold');
		chevron(k, 'exp', 1, 2.5, true, 3000);
		folder(k, 'exp', 1.7, 2.6, 3001);
		k.row('exp', 2.4, 2.55, 'node_modules', 'mono');
		chevron(k, 'exp', 1.7, 3.55, true, 3002);
		folder(k, 'exp', 2.4, 3.6, 3003);
		k.row('exp', 3.1, 3.55, '@markless', 'mono');
	});
	const rows = PACKAGES.map((pkg, i) => {
		const v = rowV(i);
		const shown = fig.part((k) => {
			folder(k, 'exp', ICON, v + 0.05, 3100 + i * 10);
			k.row('exp', NAME, v, pkg.name, 'bold');
		});
		return {
			key: i,
			name: pkg.name,
			does: pkg.does,
			shown,
			hover: fig.part((k) => {
				band(k, 'exp', 2.4, W - 0.4, v - 0.15, 3200 + i);
			}),
			gone: fig.part((k) => {
				strikeOut(k, 'exp', NAME - 0.2, NAME + pkg.name.length * 0.3 + 0.2, v, 3300 + i);
				k.row('exp', DESC, v, 'deleted', 'dim');
			}),
			missing: pkg.needs.map((dep, m) => ({
				key: m,
				dep,
				part: fig.part((k) => {
					cross(k, 'exp', ICON - 1, v - 0.15, 3400 + i * 10 + m);
					k.row('exp', DESC, v, 'missing @markless/' + dep, 'bad-text');
				}),
			})),
			hit: fig.area('exp', [[1.5, v - PITCH / 2 - 0.15], [W - 0.3, v - PITCH / 2 - 0.15], [W - 0.3, v + PITCH / 2 - 0.15], [1.5, v + PITCH / 2 - 0.15]]),
		};
	});
	return {
		view: base.view,
		base: base.part,
		rows,
		run: fig.area('term', [[0, 0], [W, 0], [W, TERM.h], [0, TERM.h]]),
	};
}
