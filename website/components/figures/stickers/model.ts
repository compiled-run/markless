// The values the sticker figure shows, its tour and the sentences its live region speaks.
export const CHILD = 'Avatar';
export const PROP = 'name';
export const TAG = '<Avatar>';
export const PROP_SOURCE = 'name={name}';
export const NAMES = ['Ada', 'Grace', 'Linus'] as const;
export const SLOTS = 4;
export const START = 0;
export const MAX = NAMES.length - 1;
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
/** Drawing units of drag on the selector per name. */
export const DIAL = 30;
export const turn = (who: number, by: number) => Math.min(MAX, Math.max(0, who + by));
export const cycle = (who: number) => (who >= MAX ? 0 : who + 1);
export const nameOf = (who: number) => NAMES[who] ?? NAMES[0];
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const STICKER_TOUR = ['place', 'place', 'dial', 'dial', 'rest', 'reset', 'rest'] as const;

export const describePlace = (count: number, who: number) =>
	`Placed an ${CHILD}. ${count === 1 ? 'It shows' : `All ${count} show`} ${nameOf(who)}, read from the page's ${PROP}.`;
export const describeDial = (who: number, count: number) =>
	count === 0
		? `The page's ${PROP} is now ${nameOf(who)}. Place an ${CHILD} to see it.`
		: `${PROP} is now ${nameOf(who)}. Every placed ${CHILD} shows ${nameOf(who)} at once, and none was placed again.`;
export const describeBack = (count: number) => `Peeled an ${CHILD} back onto the sheet. ${count} left on the page.`;
export const BEAD = `The ink beads off. An ${CHILD} can't change its ${PROP}; only the page that passes it can.`;
