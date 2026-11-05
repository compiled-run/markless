// A small editor with card.tsrx and two type errors as red squiggles: a string passed to a number prop, and a misspelt state name. Each fix is its own part, so the figure can clear one squiggle at a time.
import { desk, type Run, type SheetSpec } from '../ink/sheets.ts';
import { ADV, boxOf, part, PITCH, squiggle } from '../editor-setup/ui.ts';

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

const W = U + 40 * ADV + 0.5;
const ED: SheetSpec = { key: 'ed', x: 0, y: 0, w: W, h: row(LINES.length) + 0.4, bar: 'editor', title: 'card.tsrx', curl: false };

const scene = () => desk(680, [ED], [], { elevation: 72 });
const draw = (fn: (k: ReturnType<typeof scene>) => void) => part(scene, fn);

/** The editor half of the figure; a terminal half joins it once the app's check command reads .tsrx types. */
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
		view: k.build().view,
	};
}

export function drawing() {
	return { ...editorParts(), width: 680, messages: { size: hoverText(ERRORS.size), titel: hoverText(ERRORS.titel) } };
}
