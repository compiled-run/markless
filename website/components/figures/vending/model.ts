// The values the vending-machine figure shows, its tour and the sentence its live region speaks.
export type Pressed = 'none' | 'GET' | 'POST';

export const FILE = 'users/[id].get.ts';
/** The plate split so the method in the file name can be marked. */
export const FILE_PARTS = ['users/[id]', '.get', '.ts'] as const;
export const ANSWER = '{"id":"42"}';

/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const VENDING_TOUR = ['GET', 'rest', 'rest'] as const;

export function describeVending(pressed: Pressed): string {
	if (pressed === 'GET') return `Pressed GET. The file name says get, so ${ANSWER} dropped into the tray.`;
	if (pressed === 'POST') return 'Pressed POST. The file name says get, so nothing dropped, and the coin came back.';
	return '';
}
