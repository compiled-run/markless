// The Styling figure's values: the two files, the class both shirts carry, its tour and the sentence its live region speaks.
export const CLASS = 'card';
export const FILES = ['paper-card.tsrx', 'chalk-card.tsrx'] as const;
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const LAUNDRY_TOUR = ['dye', 'rest', 'rest', 'reset'] as const;

export function describeLaundry(dyed: boolean): string {
	return dyed
		? `Dipped both shirts in paper-card.tsrx's dye. Only the shirt with the paper-card name tape took the colour; the other is still white, though both are labelled ${CLASS}.`
		: `Two white shirts, both labelled ${CLASS}, each with its own name tape.`;
}
