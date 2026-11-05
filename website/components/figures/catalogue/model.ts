// The values the catalogue card figure shows, its tour and the sentence its live region speaks.
export const SLIP = '/blog/hello';
export const CARD = 'blog/[slug]';
export const PARAM = 'hello';
export const CATALOGUE_TOUR = ['lift', 'drop', 'rest'] as const;

export function describeCatalogue(placed: boolean): string {
	return placed
		? 'The slip /blog/hello is on the card blog/[slug], so hello is pencilled into its blank.'
		: 'The slip is off the card, so the blank is empty again. Only an address fills it.';
}

/** Whether a point in the drawing's own units lands on the card. */
export const onCard = (box: { x0: number; x1: number; y0: number; y1: number }, x: number, y: number) =>
	x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
