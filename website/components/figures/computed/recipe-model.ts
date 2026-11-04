// The Computed figure's values: the cart, the recipe that works out the total, its tour and the sentence its live region speaks.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = 14;
export const START = 2;
export const LAST = 9;

export const add = (cart: number) => (cart >= LAST ? 1 : cart + 1);
export const totalOf = (cart: number) => cart * PRICE;
export const bags = (cart: number) => (cart === 1 ? 'bag' : 'bags');
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const RECIPE_TOUR = ['add', 'add', 'rest', 'rest', 'reset'] as const;

/** Where the crossed-out and live numbers sit, in text units from the start of each line. */
export const CART_SLOT = 82;
export const CART_NEW = 96;
export const CART_UNIT = 112;
export const TOTAL_SLOT = 46;
export const TOTAL_NEW = 82;

export function describeRecipe(cart: number, added: boolean): string {
	return added
		? `Added a bag. The cart line now shows ${cart}, and the recipe worked the total out again: $${totalOf(cart)}. No one set the total.`
		: `The page shows ${cart} ${bags(cart)} in the cart and a total of $${totalOf(cart)}.`;
}
