// The cup figure's one model: the sleeve's ticked boxes and the lid sticker both read the shot count from here.
/** The sticker's shots line, in tenths of a unit from its left edge: the crossed-out number, then the live one. */
export const SLOTS = [39.5, 46] as const;
/** The printed sticker on the lid, in tenths of a unit: its size and the baselines of its two lines. */
export const STICKER = { w: 56, h: 23, product: 8.2, shots: 17.6 };
export const PRODUCT = 'LATTE · 12 OZ';
export const SHOTS = 'EXTRA SHOTS';
export const START = 3;
/** The boxes printed on the cup's sleeve; the cup is full after this many shots. */
export const CAP = 6;

/** One more shot, or a fresh cup once every box is ticked. */
export const add = (count: number) => (count >= CAP ? 0 : count + 1);
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export const shots = (count: number) => (count === 1 ? 'extra shot' : 'extra shots');

/** The sentence the screen-reader live region speaks after each change. */
export function describe(count: number, added: boolean): string {
	const now = `The label now says ${count} ${shots(count)}.`;
	if (!added) return now;
	return count === 0 ? `A fresh cup. ${now}` : `Added a shot. ${now}`;
}
