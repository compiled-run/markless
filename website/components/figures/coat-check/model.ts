// The values the coat-check figure shows, its tour and the sentences its live region speaks.
export const HANDLE = 'field';
export const COAT = '<input>';
/** What handing the ticket over gives back: the coat if it is on the stand, nothing if it isn't. */
export const fetched = (coatHere: boolean) => (coatHere ? COAT : 'undefined');
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const COAT_TOUR = ['hand', 'rest', 'rest'] as const;

export const describeHand = (coatHere: boolean) =>
	coatHere
		? `Handed in ${HANDLE}. It came back with the real ${COAT}, still on the page.`
		: `Handed in ${HANDLE}, but the coat isn't on the rack, so it came back undefined.`;
export const describeStand = (coatHere: boolean) =>
	coatHere ? `The ${COAT} is back on the page.` : `The ${COAT} left the page. The ticket ${HANDLE} still exists.`;
