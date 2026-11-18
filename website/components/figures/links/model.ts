// The values the clipboard figure shows, its hint tour and the sentence its live region speaks.
export const HOME = '/';
export const ABOUT = '/about';
/** Each swap flips the beat, so the swap animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
/** How far, in drawing units, a sheet must be dragged before letting go swaps it. */
export const SWAP_AT = 70;
/** How far the clip can be pulled before it slips out of the fingers. */
export const CLIP_PULL = 16;

export type Place = 'home' | 'about';
export const other = (at: Place): Place => (at === 'home' ? 'about' : 'home');
export const addressOf = (at: Place) => (at === 'home' ? HOME : ABOUT);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function describeSwap(at: Place, swapped: boolean): string {
	if (!swapped) return '';
	return `New sheet. The board and clip stayed, and the address label now reads ${addressOf(at)}.`;
}

export const CLIP_SAID = 'The clip snapped back. The page around the middle never comes off.';
