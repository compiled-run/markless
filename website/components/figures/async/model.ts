// The values the waiting figure shows, its tour and the sentence its live region speaks.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const WAIT_TOUR = ['reload', 'rest', 'rest'] as const;

export const ARRIVES = 'Tuesday';
export const ROASTED = 'Roasted every Monday';
export const RETURNS = 'Free returns for 30 days';
export const CHECKING = 'checking…';
/** The arrival line, in millimetres from the start of "Arrives:". */
export const ARRIVE_SLOT = 58;

export function describeWait(reloaded: boolean): string {
	return reloaded
		? `Reloaded. The arrival spot held "${CHECKING}" in pencil until the date came back, then showed ${ARRIVES}. Nothing else on the page changed.`
		: `The page shows Arrives ${ARRIVES}.`;
}
