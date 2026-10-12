// The figure's one model: a journal page with one spot cut out for #app, the like button lying beside it, and its count once render() has put it in.
export const JOURNAL = 'Beanshop Journal';
export const TITLE = 'How we roast on Tuesdays';
export const BYLINE = 'by Ines Ortega · 4 min read';
export const URL_TEXT = 'beanshop.dev/journal';
export const TARGET = '#app';
export const LIKE = '♥ Like ·';
export const START = 12;
export const LAST = 99;
/** The like row inside the piece, in tenths of a unit from its left edge: the label, the live count, then the crossed-out one. */
export const SLOTS = { label: 9, now: 52, old: 75 } as const;

/** The piece lies on the desk, has just dropped into the hole, or sits in it counting likes. */
export type Phase = 'out' | 'drop' | 'live';

export const like = (count: number) => (count >= LAST ? 0 : count + 1);
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
/** The first press runs render() and drops the piece into the hole; every press after that is a like. */
export const pressed = (phase: Phase): Phase => (phase === 'out' ? 'drop' : 'live');

/** The sentence the screen-reader live region speaks after each change. */
export function describe(phase: Phase, count: number, reset = false): string {
	if (phase === 'out') return reset ? `The like button is back on the desk, and the ${TARGET} spot is empty again.` : `The like button lies beside the page, and the ${TARGET} spot is empty.`;
	if (phase === 'drop') return `render() put the like button into the ${TARGET} spot. The rest of the page did not move.`;
	return `Liked. The button now shows ${count}.`;
}

/** What the idle tour does on each beat while nobody touches the figure: place the piece, like twice, rest, reset. */
export const TOUR = ['press', 'press', 'press', 'rest', 'reset'] as const;
