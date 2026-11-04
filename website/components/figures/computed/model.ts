// The Computed page's basket demo: its prices and the sentence read out after each press.
export const MUG = 12;
export const COASTER = 3;

export const totalOf = (mugs: number, coasters: number): number => mugs * MUG + coasters * COASTER;

export const times = (count: number): string => (count === 1 ? '1 time' : count + ' times');

/** The sentence a screen reader hears after a press. */
export const describeBasket = (mugs: number, coasters: number, runs: number): string =>
	`${mugs} ${mugs === 1 ? 'mug' : 'mugs'} and ${coasters} ${coasters === 1 ? 'coaster' : 'coasters'}. The total is now $${totalOf(mugs, coasters)}. The recipe has run ${times(runs)}.`;
