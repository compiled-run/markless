// The guest-list file the reading figures print and mark up, and what each figure's live region says.

/** One printed line: how many indent steps it sits in, and its text. */
export interface Line {
	readonly indent: number;
	readonly text: string;
}

export const LINES: readonly Line[] = [
	{ indent: 0, text: 'export default function GuestList() @{' },
	{ indent: 1, text: "let guests = state(['Ada', 'Grace']);" },
	{ indent: 1, text: 'const clear = () => (guests = []);' },
	{ indent: 1, text: '<section>' },
	{ indent: 2, text: '@for (const name of guests; key name) {' },
	{ indent: 3, text: "<p class={name === 'Ada' ? 'host' : ''}>" },
	{ indent: 4, text: '{name}' },
	{ indent: 3, text: '</p>' },
	{ indent: 2, text: '}' },
	{ indent: 2, text: '@if (guests.length === 0) {' },
	{ indent: 3, text: '<p>No one yet</p>' },
	{ indent: 2, text: '}' },
	{ indent: 2, text: '<button onClick={clear}>Clear</button>' },
	{ indent: 1, text: '</section>' },
	{ indent: 0, text: '}' },
];

/** The file as it is printed, with a tab per indent step, so a highlighter can colour it. */
export const SOURCE = LINES.map((line) => '\t'.repeat(line.indent) + line.text).join('\n');

/** Every `{ }` in the markup, as the text it highlights on its line. */
export const VALUES: readonly { readonly line: number; readonly text: string }[] = [
	{ line: 5, text: "{name === 'Ada' ? 'host' : ''}" },
	{ line: 6, text: '{name}' },
	{ line: 12, text: '{clear}' },
];

/** The lines the `@{ }` body spans, first and last, by index into LINES. */
export const BODY = { from: 1, to: 13 } as const;

export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const MARK_TOUR = ['mark', 'rest', 'rest'] as const;

export type Sketch = 'values' | 'steps' | 'blocks';

/** What each sketch shows, in plain words, for its caption and the live region. */
export const SKETCH_SAID: Record<Sketch, string> = {
	values:
		"On the left, four lines of guest-list.tsrx on a paper slip, each pair of braces drawn as an empty socket. On the right, a sketched phone showing the list. Arrows carry each value to its spot: the class value lands as a bold, highlighted style on Ada's row labelled host, {name} lands as the names Ada and Grace, and {clear} lands on the Clear button as a pointing hand ready to click.",
	steps:
		'Three index cards, read top to bottom with numbers 1, 2 and 3: let guests, const clear, and the section element. Cards 1 and 2 leave nothing on the page. Card 3, the element, is lifted off the stack and placed on a sketched phone as what shows up: Ada, Grace and a Clear button.',
	blocks:
		"A slip with the @for block and the @if block, bracketed. On a sketched phone the pen traces the same row once per guest, Ada then Grace. Below the rows a paper flap stays folded shut while there are guests; it holds No one yet and opens only when no one's going.",
};

export const sketchOf = (name: string): Sketch => (name === 'steps' || name === 'blocks' ? name : 'values');

export function describeSketch(sketch: Sketch, empty: boolean, touched: boolean): string {
	if (!touched) return '';
	if (sketch === 'blocks') return empty ? 'Clear pressed. The rows are gone and the flap opens on No one yet.' : 'Ada and Grace are back, and the flap folds shut.';
	return sketch === 'values' ? 'The values travel again from their sockets to the screen.' : 'The cards are read again, and the last one lands on the page.';
}

/** What the printout shows, in plain words: its screen-reader caption, and what the live region says after a replay. */
export const SAID =
	"Every pair of braces in the markup has a yellow highlighter swipe and a note saying value: {name === 'Ada' ? 'host' : ''} in the class attribute, {name} inside the paragraph, and {clear} on the Clear button. A pen bracket runs down the left margin beside the whole component body, labelled instructions. A legend on the desk reads: yellow swipe equals value, written in { }; bracket equals instructions, written in @{ }.";

export function describeMarks(again: boolean): string {
	return (again ? 'Marked up again. ' : '') + SAID;
}
