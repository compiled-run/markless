// The values the two-notebooks figure shows, its tour and the sentence its live region speaks.
export const KEPT = 'storage';
export const PLAIN = 'state';
export const PAGE_BEFORE = '7';
export const PAGE_FIRST = '1';
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const BOOKMARK_TOUR = ['reload', 'rest', 'rest'] as const;

export const START = 7;
export const LAST = 99;
/** Turning a page forward or back, kept within the notebook. */
export const turn = (page: number, by: number) => Math.min(LAST, Math.max(1, page + by));

export function describeBookmark(reloaded: boolean): string {
	return reloaded
		? `Reloaded. Both notebooks shut and opened again. The one with the ribbon, ${KEPT}, opened at page ${PAGE_BEFORE}. The one without, ${PLAIN}, opened at page ${PAGE_FIRST}.`
		: '';
}

/** The live sentence after a reload, from the pages each notebook reopened at. */
export function describeReload(kept: number, plain: number, ribbon: boolean): string {
	return ribbon
		? `Reloaded. The ${KEPT} notebook kept its ribbon and opened at page ${kept}. The ${PLAIN} notebook opened at page ${plain}.`
		: `Reloaded with the ribbon pulled out. Both notebooks opened at page ${plain}: without its ribbon, ${KEPT} has nothing to keep.`;
}
