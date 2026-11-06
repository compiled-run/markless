// A terminal session of npm create markless: run bare, the CLI asks its first question and waits; with the flags after --, the same session runs to the end with no questions; without the --, npm keeps the flags.
import { roundRect } from '../ink/desk.ts';
import { outline, pathOf, stroke, wash } from '../ink/ink.ts';
import type { SheetSpec } from '../ink/sheets.ts';
import { figure, type Kit, type P } from '../reference/kit.ts';

export const COMMAND = 'npm create markless@latest my-app';
export const FLAGS = '--yes --starter app --no-git';

/** What the CLI prints when it has to ask, up to its first question (packages/cli/src/index.ts, drawn in clack's frame). */
export const ASKING = ['┌  Welcome to Markless', '│', "◇  Let's build you an app.", '│', '◆  What are you building today?', '│  ● Learn Markless', '│  ○ Build an app', '│  ○ Write docs', '│  ○ Full-stack app', '└'];
/** What it prints when the flags answered everything: its closing note and outro, after npm install. */
export const DONE = ['│  …', '◇  Created my-app', '│  Next steps:', '│    cd my-app', '│    npm run dev', '│  Then open:', '│    http://localhost:3000', '└  Markless app ready.'];

/** The flag chips, with the question each one answers. */
export const CHIPS = [
	{ flag: '--', answers: 'npm passes the rest on' },
	{ flag: '--yes', answers: 'use the defaults' },
	{ flag: '--starter app', answers: 'What are you building today?' },
	{ flag: '--no-git', answers: 'Initialize git?' },
];

const W = 17.6;
const PITCH = 0.82;
const FIRST = 2.5;
const L = 1.7;
const row = (i: number) => FIRST + i * PITCH;
const TERM: SheetSpec = { key: 'term', x: 0, y: 0, w: W, h: row(ASKING.length + 2) + 0.2, bar: 'terminal', curl: false };
const SLIP: SheetSpec = { key: 'slip', x: 0.6, y: TERM.h + 1.4, w: W - 1.2, h: 2.6, kraft: true, curl: false, turn: 0.012 };
const col = (c: number) => L + c * 0.3;

function chip(k: Kit, u0: number, text: string, seed: number) {
	const u1 = u0 + text.length * 0.3 + 0.9;
	const card = k.raw.on('slip', roundRect(u0, 0.7, u1, 1.95, 0.25, 3), 0.05);
	k.raw.path(wash(k.raw.on('slip', roundRect(u0 + 0.15, 0.9, u1 + 0.25, 2.2, 0.25, 3)), seed, 0.3, 1), 'shadow-wash light');
	k.raw.path(pathOf(card, true), 'sheet-paper');
	k.raw.path(outline(card, { w: 1, heavy: 0.8, seed: seed + 1 }), 'sheet-ink');
	k.row('slip', u0 + 0.45, 1.6, text, 'bold');
	return { u0, u1 };
}

export function drawing() {
	const fig = figure([TERM, SLIP], [[W + 1, -1, 0]]);
	const base = fig.base((k) => {
		k.row('term', 1, row(0), '$', 'dim');
		k.row('term', L, row(0), COMMAND, 'bold');
	});
	let u = 0.7;
	const chips = CHIPS.map((c, i) => {
		const start = u;
		const width = c.flag.length * 0.3 + 0.9;
		u += width + 0.5;
		return {
			key: i,
			flag: c.flag,
			ink: fig.part((k) => {
				chip(k, start, c.flag, 3700 + i * 10);
			}),
			torn: fig.part((k) => k.raw.path(stroke(k.raw.on('slip', [[start - 0.1, 1.1], [start + width + 0.1, 1.5]] as P[], 0.06), { w: 1.4, seed: 3750 + i, over: 0.2 }), 'bad-pen-fill')),
			answers: c.answers,
			hit: fig.area('slip', roundRect(start, 0.7, start + width, 1.95, 0.25, 3)),
		};
	});
	const lines = (texts: string[], from: number, cls = 'mono') => fig.part((k) => texts.forEach((text, i) => k.row('term', L, row(from + i), text, cls)));
	return {
		view: base.view,
		base: base.part,
		chips,
		cmdOk: fig.part((k) => {
			k.row('term', col(COMMAND.length + 1), row(0), '\\', 'bold');
			k.print('term', L, row(1), [{ t: '  ' }, { t: '-- ', c: 'bold' }, { t: FLAGS, c: 'bold' }]);
		}),
		cmdSwallowed: fig.part((k) => {
			k.row('term', col(COMMAND.length + 1), row(0), '\\', 'bold');
			k.row('term', L, row(1), '  ' + FLAGS, 'bold');
			k.raw.path(stroke(k.raw.on('term', [[col(2), row(1) - 0.2], [col(2 + FLAGS.length), row(1) - 0.32]] as P[], 0.05), { w: 1.3, seed: 3800, over: 0.3 }), 'bad-pen-fill');
			k.row('term', col(3 + FLAGS.length), row(1), 'npm took these', 'hand bad-hand');
		}),
		asking: lines(ASKING, 2),
		caret: fig.part((k) => k.raw.path(pathOf(k.raw.on('term', roundRect(col(19), row(7) - 0.55, col(19.8), row(7) + 0.1, 0.05, 1)), true), 'caret')),
		done: lines(DONE, 2),
		run: fig.area('term', [[0, 0], [W, 0], [W, TERM.h], [0, TERM.h]]),
	};
}
