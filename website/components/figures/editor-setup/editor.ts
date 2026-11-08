// A VS Code-style window: the Extensions sidebar with the TSRX extension and its Install button, and profile.tsrx in the editor, plain before the install and in colour after, with a hover on `name` and a squiggle once `name` is misspelt.
import { roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, stroke } from '../ink/ink.ts';
import { desk, type Run, type SheetSpec } from '../ink/sheets.ts';
import { ADV, boxOf, part, PITCH, squiggle } from './ui.ts';

/** The extension as the Marketplace lists it: name, description and publisher from its package.json (2.2.4), installs from the Marketplace gallery API on 2026-11-07. */
export const EXTENSION = { name: 'TSRX Syntax for VS Code', description: 'TSRX JavaScript/TypeScript language support', publisher: 'TSRX', id: 'TSRX.tsrx-vscode-plugin', installs: '134' };
/** The words a search matches, as the Marketplace matches name, description and publisher. */
export const MATCHES = (EXTENSION.name + ' ' + EXTENSION.description + ' ' + EXTENSION.publisher).toLowerCase();
/** The steps the figure walks the reader through, and the pencil hint for each. */
export const HINTS = { search: 'Search tsrx', install: 'Press Install', hover: 'Hover name', typo: 'Click {name} to make a typo' };
/** What the editor shows: the hover on `name`, and the checker's message for the typo, from a real run. */
export const HOVER = 'let name: string';
export const TYPO = { message: "Cannot find name 'nmae'.", code: 2304 };

/** profile.tsrx; line 7 is the one the reader breaks. */
export const LINES: Run[][] = [
	[{ t: 'import', tint: 'kw' }, { t: ' { state } ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'@markless/core'", tint: 'str' }, { t: ';' }],
	[],
	[{ t: 'export default function', tint: 'kw' }, { t: ' ' }, { t: 'Profile', tint: 'fn' }, { t: '() ' }, { t: '@{', tint: 'kw' }],
	[{ t: '  ' }, { t: 'let', tint: 'kw' }, { t: ' name = ' }, { t: 'state', tint: 'fn' }, { t: '(' }, { t: "'Ada'", tint: 'str' }, { t: ');' }],
	[],
	[{ t: '  <' }, { t: 'section', tint: 'tag' }, { t: ' ' }, { t: 'class', tint: 'fn' }, { t: '=' }, { t: '"profile"', tint: 'str' }, { t: '>' }],
	[],
	[{ t: '  </' }, { t: 'section', tint: 'tag' }, { t: '>' }],
	[{ t: '}' }],
];
export const HEADING = {
	right: [{ t: '    <' }, { t: 'h2', tint: 'tag' }, { t: '>{name}</' }, { t: 'h2', tint: 'tag' }, { t: '>' }] as Run[],
	typo: [{ t: '    <' }, { t: 'h2', tint: 'tag' }, { t: '>{nmae}</' }, { t: 'h2', tint: 'tag' }, { t: '>' }] as Run[],
};
const NAME_DECL = 6;
const NAME_USE = 9;
const H2 = 6;

const BAR = 1.5;
const ACT = 0.9;
const SIDE = 7.6;
const U = ACT + SIDE + 1.6;
const FIRST = BAR + 1.2;
const row = (i: number) => FIRST + i * PITCH;
const W = U + 40 * ADV + 0.4;
const WIN: SheetSpec = { key: 'win', x: 0, y: 0, w: W, h: row(LINES.length) + 0.4, curl: false };
const INSTALL = { u0: ACT + 1.9, v0: BAR + 4.5, u1: ACT + 5.1, v1: BAR + 5.5 };
const SEARCH = { u0: ACT + 0.3, v0: BAR + 1.25, u1: ACT + SIDE - 0.3, v1: BAR + 2.05 };
const LOGO = { u: ACT + 1.0, v: BAR + 3.25, size: 0.82 };

/** The TSRX extension's icon (icons/logo.png): a filled square with TSRX lettered in its bottom-right corner. */
function logo(k: ReturnType<typeof scene>, seed: number) {
	const [u0, v0, u1, v1] = [LOGO.u - LOGO.size, LOGO.v - LOGO.size, LOGO.u + LOGO.size, LOGO.v + LOGO.size];
	const [tu, tv] = [u1 - 1.3, v1 - 0.62];
	k.raw.path(hatch(k.raw.on('win', [[u0, v0], [u1, v0], [u1, tv], [tu, tv], [tu, v1], [u0, v1]]), 0.9, 1.6, seed, { cluster: 4, skip: 0.1 }), 'sheet-hatch');
	k.raw.path(outline(k.raw.on('win', [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]), { w: 1.1, seed: seed + 1 }), 'sheet-ink');
	k.row('win', tu + 0.12, v1 - 0.16, 'TSRX', 'bold small');
}

const scene = () => desk(680, [WIN], [], { elevation: 72 });
const draw = (fn: (k: ReturnType<typeof scene>) => void) => part(scene, fn);
const plain = (runs: Run[]): Run[] => [{ t: runs.map((r) => r.t).join('') }];

export function drawing() {
	const k = scene();
	const at = (col: number, line: number, len: number) => boxOf(k, 'win', U + col * ADV - 0.1, row(line) - 0.62, U + (col + len) * ADV + 0.1, row(line) + 0.32);
	return {
		base: draw((k) => {
			k.lay();
			const on = (pts: [number, number][]) => k.raw.on('win', pts);
			k.raw.path(hatch(on([[0, 0], [W, 0], [W, BAR], [0, BAR]]), 0.12, 2.2, 3900, { cluster: 6, skip: 0.2 }), 'sheet-hatch light');
			k.raw.path(line(on([[0, BAR], [W, BAR]]), { w: 0.9, seed: 3901 }) + line(on([[ACT, BAR], [ACT, WIN.h]]), { w: 0.7, seed: 3902 }) + line(on([[ACT + SIDE, BAR], [ACT + SIDE, WIN.h]]), { w: 0.9, seed: 3903 }), 'sheet-ink');
			[0.75, 1.4, 2.05].forEach((u, i) => k.raw.path(outline(on(roundRect(u - 0.2, BAR / 2 - 0.2, u + 0.2, BAR / 2 + 0.2, 0.2, 4)), { w: 0.8, seed: 3904 + i }), 'sheet-ink'));
			[0, 1, 2, 3].forEach((i) => k.raw.path(outline(on(roundRect(0.22, BAR + 0.5 + i * 1.1, 0.68, BAR + 0.96 + i * 1.1, 0.06, 1)), { w: 0.7, seed: 3910 + i }), 'sheet-ink light'));
			k.row('win', ACT + 0.4, BAR + 0.85, 'EXTENSIONS', 'dim small');
			const search = on(roundRect(SEARCH.u0, SEARCH.v0, SEARCH.u1, SEARCH.v1, 0.05, 1));
			k.raw.path(outline(search, { w: 0.7, seed: 3920 }), 'sheet-ink');
			k.raw.path(pathOf(on([[U - 1.6, 0.25], [U - 1.6, BAR], [U - 1.6 + 4.2, BAR], [U - 1.6 + 4.2, 0.25]])), 'sheet-paper');
			k.raw.path(line(on([[U - 1.6, BAR], [U - 1.6, 0.25], [U - 1.6 + 4.2, 0.25], [U - 1.6 + 4.2, BAR]]), { w: 0.9, seed: 3930 }), 'sheet-ink');
			k.row('win', U - 1.2, 1.02, 'profile.tsrx', 'mono small');
			LINES.forEach((_, i) => k.row('win', U - 1.1, row(i), String(i + 1).padStart(2, ' '), 'num'));
		}),
		plain: draw((k) => LINES.forEach((runs, i) => runs.length && k.print('win', U, row(i), plain(runs)))),
		colour: draw((k) => LINES.forEach((runs, i) => runs.length && k.print('win', U, row(i), runs))),
		heading: {
			plainRight: draw((k) => k.print('win', U, row(H2), plain(HEADING.right))),
			plainTypo: draw((k) => k.print('win', U, row(H2), plain(HEADING.typo))),
			colourRight: draw((k) => k.print('win', U, row(H2), HEADING.right)),
			colourTypo: draw((k) => k.print('win', U, row(H2), HEADING.typo)),
		},
		squiggle: draw((k) => squiggle(k, 'win', U, NAME_USE, NAME_USE + 4, row(H2), 3940)),
		listing: draw((k) => {
			logo(k, 3950);
			k.row('win', ACT + 1.9, BAR + 2.85, EXTENSION.name.slice(0, 15) + '…', 'bold');
			k.row('win', ACT + 1.9, BAR + 3.45, EXTENSION.description.slice(0, 21) + '…', 'dim small');
			k.row('win', ACT + 1.9, BAR + 4.05, EXTENSION.publisher, 'dim small');
			const d: [number, number] = [ACT + 4.9, BAR + 3.8];
			k.raw.path(stroke(k.raw.on('win', [[d[0], d[1] - 0.25], [d[0], d[1] + 0.05]]), { w: 0.9, seed: 3960, over: 0 }) + stroke(k.raw.on('win', [[d[0] - 0.13, d[1] - 0.06], [d[0], d[1] + 0.07], [d[0] + 0.13, d[1] - 0.06]]), { w: 0.9, seed: 3961, over: 0 }) + stroke(k.raw.on('win', [[d[0] - 0.16, d[1] + 0.17], [d[0] + 0.16, d[1] + 0.17]]), { w: 0.9, seed: 3962, over: 0 }), 'sheet-ink');
			k.row('win', d[0] + 0.3, BAR + 4.05, EXTENSION.installs, 'dim small');
		}),
		empty: draw((k) => k.row('win', ACT + 0.4, BAR + 2.85, 'No extensions found.', 'dim small')),
		rings: {
			search: draw((k) => k.ring('win', SEARCH.u0 + 0.1, SEARCH.u1 - 0.1, (SEARCH.v0 + SEARCH.v1) / 2 + 0.2, '', undefined, 0.75)),
			install: draw((k) => k.ring('win', INSTALL.u0 + 0.1, INSTALL.u1 - 0.1, (INSTALL.v0 + INSTALL.v1) / 2 + 0.2, '', undefined, 0.85)),
			hover: draw((k) => k.ring('win', U + NAME_DECL * ADV, U + (NAME_DECL + 4) * ADV, row(3), '', undefined, 0.55)),
			typo: draw((k) => k.ring('win', U + NAME_USE * ADV - 0.2, U + (NAME_USE + 6) * ADV, row(H2), '', undefined, 0.55)),
		},
		install: draw((k) => k.button('win', INSTALL.u0, INSTALL.v0, INSTALL.u1, INSTALL.v1, 'Install')),
		uninstall: draw((k) => k.button('win', INSTALL.u0, INSTALL.v0, INSTALL.u1 + 0.8, INSTALL.v1, 'Uninstall')),
		hits: {
			search: boxOf(k, 'win', SEARCH.u0, SEARCH.v0, SEARCH.u1, SEARCH.v1),
			install: boxOf(k, 'win', INSTALL.u0, INSTALL.v0, INSTALL.u1 + 0.8, INSTALL.v1),
			entry: boxOf(k, 'win', ACT + 0.2, BAR + 2.2, ACT + SIDE - 0.2, BAR + 5.7),
			decl: at(NAME_DECL, 3, 4),
			use: at(NAME_USE, H2, 4),
		},
		view: k.build().view,
		width: 680,
		height: Number(k.build().view.split(' ')[3]),
		messages: { name: HOVER, typo: TYPO.message + ' ts(' + TYPO.code + ')' },
	};
}
