// The values the wired cart figure shows, the press, the tour and the sentence its live region speaks.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
/** What one bag costs, the recipe inside the `total` box. */
export const EACH = 14;
export const START = 3;
export const LAST = 99;

/** The cart line, in millimetres from the start of "In your cart:": the crossed-out number, then the live one. */
export const SLOTS = [87, 101] as const;
/** The total line, in millimetres from the start of "Total:". */
export const TOTAL_SLOTS = [36, 64] as const;

export const add = (bags: number) => (bags >= LAST ? 0 : bags + 1);
export const totalOf = (bags: number) => bags * EACH;
export const dollars = (bags: number) => '$' + totalOf(bags);
export const unit = (bags: number) => (bags === 1 ? 'bag' : 'bags');
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export function describeWire(bags: number, added: boolean): string {
	const now = `The cart badge and the cart line now show ${bags}, and the total shows ${dollars(bags)}.`;
	return added && bags > 0 ? `Added a bag. ${now}` : now;
}

/** What the idle tours do on each beat while nobody touches the figure. */
export const TOUR = ['add', 'add', 'rest', 'rest', 'reset'] as const;
