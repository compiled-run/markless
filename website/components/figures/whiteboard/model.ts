// The values the whiteboard figure shows, its tour and the sentence its live region speaks.
export const BOARD = 'cart';
export const WRITER = 'Shop';
export const READER = 'CartBadge';
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const OFFICE_TOUR = ['write', 'rest', 'write', 'rest', 'rest'] as const;

export const MOST = 9;
/** The board's number turns like a dial, wrapping within 0 to 9. */
export const dial = (bags: number, by: number) => (bags + by + MOST + 1) % (MOST + 1);

export function describeOffice(bags: number): string {
	return bags === 0 ? '' : `${WRITER} wrote ${bags} on the ${BOARD} board. ${READER} reads the same board, so it sees ${bags} too.`;
}
