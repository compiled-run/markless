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

export type Figure = 'overview' | 'values' | 'steps' | 'blocks';

/** What each mark-up shows, in plain words: the figure's caption for screen readers, and what the live region says after a replay. */
export const SAID: Record<Figure, string> = {
	overview:
		"Every pair of braces in the markup has a yellow highlighter swipe and a note saying value: {name === 'Ada' ? 'host' : ''} in the class attribute, {name} inside the paragraph, and {clear} on the Clear button. A pen bracket runs down the left margin beside the whole component body, labelled instructions. A legend on the desk reads: yellow swipe equals value, written in { }; bracket equals instructions, written in @{ }.",
	values:
		"Each value is highlighted with a note saying what it produces: the class attribute gives 'host' for Ada and an empty string for Grace, {name} gives Ada, then Grace, and {clear} gives a function that runs on click.",
	steps:
		'The body is numbered in the order it runs, with a note on the desk saying runs in this order: 1, let guests; 2, const clear; 3, the section element. A bracket down the right side of the section, from its opening tag to its closing tag, is labelled this is what shows up.',
	blocks:
		"The @for block is boxed and labelled once per guest. The @if block is boxed and labelled only when no one's going. A slip on the desk, labelled on the page, shows what the file draws: Ada, Grace and a Clear button.",
};

export const figureOf = (name: string): Figure => (name === 'values' || name === 'steps' || name === 'blocks' ? name : 'overview');

export function describeMarks(figure: Figure, again: boolean): string {
	return (again ? 'Marked up again. ' : '') + SAID[figure];
}
