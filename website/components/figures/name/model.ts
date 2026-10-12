// The name figure's one model: the plain order code on the sheet, the marks stuck over it, and the order they come off in.
export type Tone = 'kw' | 'fn' | 'str' | 'tag' | 'plain' | 'emoji';
export type Tok = readonly [text: string, tone: Tone];

/** The order example from the page, five lines, exactly as plain code. */
export const CODE: readonly (readonly Tok[])[] = [
	[['let', 'kw'], [' status ', 'plain'], ['=', 'kw'], [' state', 'fn'], ['(', 'plain'], ["'Brewing ", 'str'], ['⏳', 'emoji'], ["'", 'str'], [');', 'plain']],
	[['<p>', 'tag'], ['Status: ', 'plain'], ['{status}', 'plain'], ['</p>', 'tag']],
	[['<button', 'tag'], [' onClick', 'fn'], ['={() ', 'plain'], ['=>', 'kw'], [' {', 'plain']],
	[['  status ', 'plain'], ['=', 'kw'], [" 'Ready for pickup ", 'str'], ['✅', 'emoji'], ["'", 'str'], [';', 'plain']],
	[['}}>', 'plain'], ['Mark ready ', 'plain'], ['🔔', 'emoji'], ['</button>', 'tag']],
];
export const FILE = 'order.tsrx';
/** Type sizes in sheet units: the code, the writing on the tabs, and the name. */
export const CODE_FS = 15;
export const FLAG_FS = 12;
export const NAME_FS = 32;
export const NAME = 'Markless';

/** Columns a token takes in the code font; an emoji is drawn about two columns wide. */
export const colsOf = (text: string) => [...text].reduce((n, ch) => n + (/\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0);

/** Where a run of text starts on its line, in columns. */
export function columnOf(row: number, text: string): number {
	let at = 0;
	for (const [t] of CODE[row]!) {
		const i = t.indexOf(text);
		if (i >= 0) return at + colsOf(t.slice(0, i));
		at += colsOf(t);
	}
	throw new Error(`"${text}" is not on line ${row + 1}`);
}

export type Side = 'left' | 'right' | 'top';
/** The framework marks, as tabs stuck to the sheet at the line they are about. None of them is a real name. */
export const FLAGS: readonly { label: string; side: Side; row: number; at?: string; cost: readonly string[] }[] = [
	{ label: '$', side: 'left', row: 0, cost: ['mark it'] },
	{ label: 'use…', side: 'top', row: 0, at: 'state', cost: ['call it first'] },
	{ label: '.value', side: 'right', row: 1, cost: ['unwrap it'] },
	{ label: 'set…()', side: 'left', row: 3, cost: ["can't just", 'assign'] },
];
export const RULE_CARD = ['RULE 1', 'call me first!'] as const;
export const DEPS = '[status]';
export const DEPS_COST = 'list what it reads';
/** The red heading over the marked-up sheet, and the green note that replaces it once the marks are gone. */
export const BANNER = ['other tools:', 'rules on top of your code'] as const;
export const CLEAN_NOTE = 'just your code';
/** Hand-lettered notes, in sheet units. */
export const NOTE_FS = 12;
export const BANNER_FS = 16;

/** The eraser's run, in ms after the cleaning starts: it leaves its spot, rubs out each pencil stop, and comes back. */
export const ERASER = { start: 300, duration: 2500 } as const;
/** Each pencil stop as a fraction of the eraser's run, matching the eraser keyframes in name-anatomy.tsrx. */
export const STOPS = [
	[0.14, 0.24],
	[0.32, 0.4],
	[0.48, 0.56],
	[0.64, 0.72],
] as const;
export const stopWindow = (i: number) => {
	const [a, b] = STOPS[i]!;
	return { from: Math.round(ERASER.start + a * ERASER.duration), to: Math.round(ERASER.start + b * ERASER.duration) };
};
/** Tabs, the rule card and the sticky come off one by one once the eraser is done. */
export const PEEL = { from: 2700, step: 220, length: 620 } as const;
export const WRITE = { from: 4450, step: 115 } as const;

export type Phase = 'start' | 'marks' | 'clean';

/** The sentence the screen-reader live region speaks after the toggle. */
export function describe(phase: Phase): string {
	if (phase === 'marks') return 'The red marks other tools add are back over the same code: tabs, a rule card, a sticky note and pencil circles, each with the chore it asks for.';
	return 'The marks are gone. The sheet shows only the plain code, with Markless written on top: just your code.';
}
