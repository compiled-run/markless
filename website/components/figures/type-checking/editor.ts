// A small editor with card.tsrx and two type errors as red squiggles: a string passed to a number prop, and a misspelt state name. Each fix is its own part, so the figure can clear one squiggle at a time.
import { desk, type Run, type SheetSpec } from '../ink/sheets.ts';
import { ADV, band, boxOf, part, PITCH, squiggle } from '../editor-setup/ui.ts';

/** The messages the checker printed for card.tsrx, as an editor shows them on hover. */
export const ERRORS = {
	size: { line: 8, col: 11, message: "Type 'string' is not assignable to type 'number'.", code: 2322 },
	titel: { line: 9, col: 8, message: "Cannot find name 'titel'. Did you mean 'title'?", code: 2552 },
};

/** The message as an editor's hover shows it, with the code it appends. */
export const hoverText = (e: { message: string; code: number }) => e.message + ' ts(' + e.code + ')';

const U = 1.9;
const FIRST = 2.4;
const row = (i: number) => FIRST + i * PITCH;
const LINES: Run[][] = [
	[{ t: 'import', tint: 'kw' }, { t: ' { state } ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'@markless/core'", tint: 'str' }, { t: ';' }],
	[{ t: 'import', tint: 'kw' }, { t: ' Avatar ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'./avatar.tsrx'", tint: 'str' }, { t: ';' }],
	[],
	[{ t: 'export default function', tint: 'kw' }, { t: ' ' }, { t: 'Card', tint: 'fn' }, { t: '() ' }, { t: '@{', tint: 'kw' }],
	[{ t: '  ' }, { t: 'let', tint: 'kw' }, { t: ' title = ' }, { t: 'state', tint: 'fn' }, { t: '(' }, { t: "'Hello'", tint: 'str' }, { t: ');' }],
	[],
	[{ t: '  <' }, { t: 'article', tint: 'tag' }, { t: '>' }],
	[],
	[],
	[{ t: '  </' }, { t: 'article', tint: 'tag' }, { t: '>' }],
	[{ t: '}' }],
];
/** Lines 8 and 9, wrong as written and fixed. Tabs print as two spaces. */
export const VARIANTS = {
	size: {
		wrong: [{ t: '    <' }, { t: 'Avatar', tint: 'tag' }, { t: ' ' }, { t: 'size', tint: 'fn' }, { t: '=' }, { t: '"large"', tint: 'str' }, { t: ' />' }] as Run[],
		right: [{ t: '    <' }, { t: 'Avatar', tint: 'tag' }, { t: ' ' }, { t: 'size', tint: 'fn' }, { t: '={' }, { t: '48', tint: 'num' }, { t: '} />' }] as Run[],
	},
	titel: {
		wrong: [{ t: '    <' }, { t: 'h2', tint: 'tag' }, { t: '>{titel}</' }, { t: 'h2', tint: 'tag' }, { t: '>' }] as Run[],
		right: [{ t: '    <' }, { t: 'h2', tint: 'tag' }, { t: '>{title}</' }, { t: 'h2', tint: 'tag' }, { t: '>' }] as Run[],
	},
};
/** 0-based columns of `size`, its value and `titel` as printed, two spaces per tab. */
const SIZE_COL = 12;
const VALUE_COL = 17;
const TITEL_COL = 9;

/** What `npm run check` prints for this file, a real run's format; the error lines' positions were checked with the repo checker on the same text. */
export const CHECK = {
	command: 'npm run check',
	pass: ['pass: All 8 files are correctly formatted (346ms, 18 threads)', 'pass: Found no warnings or lint errors in 2 files (299ms, 18 threads)'],
	errors: [
		{ key: 'size', text: 'pages/card.tsrx(' + ERRORS.size.line + ',' + ERRORS.size.col + '): error TS' + ERRORS.size.code + ': ' + ERRORS.size.message },
		{ key: 'titel', text: 'pages/card.tsrx(' + ERRORS.titel.line + ',' + ERRORS.titel.col + '): error TS' + ERRORS.titel.code + ': ' + ERRORS.titel.message },
	],
};
/** Columns a narrow terminal wraps at. */
const WRAP = 50;
export const wrap = (text: string): string[] => {
	const out: string[] = [];
	let line = '';
	for (const word of text.split(' ')) {
		if (line && (line + ' ' + word).length > WRAP) {
			out.push(line);
			line = word;
		} else line = line ? line + ' ' + word : word;
	}
	return line ? [...out, line] : out;
};

const W = 1.4 + WRAP * ADV + 0.6;
const ED: SheetSpec = { key: 'ed', x: 0, y: 0, w: W, h: row(LINES.length) + 0.4, bar: 'editor', title: 'card.tsrx', curl: false };
const T_FIRST = 2.4;
const trow = (i: number) => T_FIRST + i * PITCH;
const T_ROWS = 1 + CHECK.pass.reduce((n, l) => n + wrap(l).length, 0) + CHECK.errors.reduce((n, e) => n + wrap(e.text).length, 0);
const TERM: SheetSpec = { key: 'term', x: 0.3, y: ED.h + 1, w: W - 0.3, h: trow(T_ROWS) + 0.2, bar: 'terminal', curl: false };
const TU = 1.4;

const scene = () => desk(680, [ED, TERM], [], { elevation: 72 });
const draw = (fn: (k: ReturnType<typeof scene>) => void) => part(scene, fn);

/** The editor half of the figure. */
function editorParts() {
	const k = scene();
	const at = (col: number, line: number, len: number) => boxOf(k, 'ed', U + col * ADV - 0.1, row(line) - 0.62, U + (col + len) * ADV + 0.1, row(line) + 0.32);
	return {
		base: draw((k) => {
			k.lay();
			LINES.forEach((runs, i) => {
				k.row('ed', U - 1.1, row(i), String(i + 1).padStart(2, ' '), 'num');
				if (runs.length) k.print('ed', U, row(i), runs);
			});
		}),
		size: {
			wrong: draw((k) => {
				k.print('ed', U, row(7), VARIANTS.size.wrong);
				squiggle(k, 'ed', U, SIZE_COL, SIZE_COL + 4, row(7), 3800);
			}),
			right: draw((k) => k.print('ed', U, row(7), VARIANTS.size.right)),
			hits: { name: at(SIZE_COL, 7, 4), value: at(VALUE_COL, 7, 7) },
		},
		titel: {
			wrong: draw((k) => {
				k.print('ed', U, row(8), VARIANTS.titel.wrong);
				squiggle(k, 'ed', U, TITEL_COL, TITEL_COL + 5, row(8), 3820);
			}),
			right: draw((k) => k.print('ed', U, row(8), VARIANTS.titel.right)),
			hits: { name: at(TITEL_COL, 8, 5) },
		},
		bands: [7, 8].map((line, i) => ({ key: i, art: draw((k) => band(k, 'ed', U - 0.2, row(line) - 0.62, U + 24 * ADV, row(line) + 0.28, 3840 + i)) })),
		view: k.build().view,
	};
}

/** The terminal half: the command, the two pass lines, and each error's wrapped lines with a hit box; `shift` moves the second error up into the first one's rows once that is fixed. */
function terminalParts() {
	const k = scene();
	let r = 1;
	const pass = CHECK.pass.map((l) => {
		const rows = wrap(l).map((t, i) => ({ t, r: r + i }));
		r += rows.length;
		return rows;
	});
	const errors = CHECK.errors.map((e, i) => {
		const rows = wrap(e.text).map((t, j) => ({ t, r: r + j }));
		r += rows.length;
		return { key: i, rows, hit: boxOf(k, 'term', 0.3, trow(rows[0]!.r) - 0.62, TERM.w - 0.3, trow(rows.at(-1)!.r) + 0.3) };
	});
	const a = k.raw.proj(k.raw.at('term', TU, trow(errors[0]!.rows[0]!.r)));
	const b = k.raw.proj(k.raw.at('term', TU, trow(errors[1]!.rows[0]!.r)));
	return {
		base: draw((k) => {
			k.row('term', 0.8, trow(0), '$', 'dim');
			k.row('term', TU, trow(0), CHECK.command, 'bold');
			pass.flat().forEach((p) => k.row('term', TU, trow(p.r), p.t, 'mono'));
		}),
		errors: errors.map((e) => ({ key: e.key, hit: e.hit, art: draw((k) => e.rows.forEach((p) => k.row('term', TU, trow(p.r), p.t, 'mono'))) })),
		shift: Math.round((b[1] - a[1]) * 10) / 10,
	};
}

export function drawing() {
	return { ...editorParts(), terminal: terminalParts(), width: 680, messages: { size: hoverText(ERRORS.size), titel: hoverText(ERRORS.titel) } };
}
