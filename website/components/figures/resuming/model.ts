// The values the resuming figure shows, its tour and the sentence its live region speaks.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
/** The cart line, in millimetres from the start of "In your cart:": the crossed-out number, then the live one. */
export const SLOTS = [87, 101] as const;
export const START = 2;
export const LAST = 99;
export const RECORD = 'markless/view';

export const add = (cart: number) => (cart >= LAST ? 0 : cart + 1);
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const RESUME_TOUR = ['add', 'rest', 'rest', 'add', 'rest', 'reset'] as const;

export function describeResume(cart: number, pressed: boolean): string {
	if (!pressed) return `The page arrived already wired. The cart line shows ${cart}.`;
	return `Pressed Add to cart. The press ran down the wire the server drew, through the ${RECORD} record, to the cart line, which now shows ${cart}. Nothing else on the page was rebuilt.`;
}
