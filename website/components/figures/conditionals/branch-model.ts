// The Conditionals figure's values: the cart, the line built only at three bags or more, its tour and its spoken sentence.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
export const START = 2;
export const LAST = 4;
export const FREE_AT = 3;
export const PERK = 'Free shipping';

export const add = (cart: number) => (cart >= LAST ? 1 : cart + 1);
export const free = (cart: number) => cart >= FREE_AT;
export const bags = (cart: number) => (cart === 1 ? 'bag' : 'bags');
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const BRANCH_TOUR = ['add', 'rest', 'add', 'rest', 'add', 'rest', 'add'] as const;

/** Where the crossed-out and live numbers sit, in text units from the start of the cart line. */
export const CART_SLOT = 82;
export const CART_NEW = 96;
export const CART_UNIT = 112;

export function describeBranch(cart: number, added: boolean): string {
	const line = free(cart) ? `The free-shipping line is built on the page.` : `The free-shipping line is gone from the page, not hidden.`;
	return added ? `The cart now holds ${cart} ${bags(cart)}. ${line}` : `The cart holds ${cart} ${bags(cart)}, and there is no free-shipping line yet.`;
}
