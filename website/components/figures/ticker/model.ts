// The values the ticker figure shows, its tour and the sentences its live region speaks.
export const HEADING = 'Orders';
export const PENDING = 'Loading…';
export const ARRIVED = '3 orders';
/** How long the slow part takes to come down the tape, in milliseconds. */
export const SLOW_MS = 1700;
export const TICKER_TOUR = ['print', 'rest', 'rest'] as const;

export type Step = 0 | 1 | 2;

export function describeTicker(step: Step, tugged: boolean): string {
	if (tugged) return 'One tape: it stretches, but it will not tear. The orders come down this same tape.';
	if (step === 1) return 'Printing. The first part is out: the heading, and Loading… in pencil.';
	if (step === 2) return 'The same tape carried on with 3 orders. No second trip.';
	return '';
}
