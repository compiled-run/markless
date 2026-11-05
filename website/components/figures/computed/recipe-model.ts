// The Computed figure's values: the cart, the recipe card's three steps, its tour and the sentence its live region speaks.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = 14;
export const FREE_OVER = 40;
export const SHIPPING = 5;
export const START = 2;
export const LAST = 4;

export const add = (cart: number) => (cart >= LAST ? 1 : cart + 1);
export const subtotalOf = (cart: number) => cart * PRICE;
export const shippingOf = (cart: number) => (subtotalOf(cart) > FREE_OVER ? 0 : SHIPPING);
export const totalOf = (cart: number) => subtotalOf(cart) + shippingOf(cart);
export const bags = (cart: number) => (cart === 1 ? 'bag' : 'bags');
export const money = (n: number) => '$' + n;
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
/** Where each recipe-card value ends, in text units along its line: values are right-aligned. */
export const VALUE_END = 142;
export const RECIPE_TOUR = ['add', 'rest', 'add', 'rest', 'add', 'rest', 'add'] as const;

export function describeRecipe(cart: number, added: boolean): string {
	const steps = `${cart} ${bags(cart)} × $${PRICE} is ${money(subtotalOf(cart))}, shipping is ${money(shippingOf(cart))}, so the total is ${money(totalOf(cart))}`;
	return added ? `Added a bag. The recipe card worked itself out again, line by line: ${steps}. No one wrote the total.` : `The recipe card reads: ${steps}.`;
}
