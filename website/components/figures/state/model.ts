// The figure's one model: the jar, both wired spots and the readout all read the cart count from here.
/** The cart line on the page, in millimetres from the start of "In your cart:": the crossed-out number, then the live one. */
export const SLOTS = [87, 101] as const;
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
export const START = 3;
export const LAST = 99;

export const add = (cart: number) => (cart >= LAST ? 0 : cart + 1);
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export const bags = (cart: number) => (cart === 1 ? 'bag' : 'bags');

/** The sentence the screen-reader live region speaks after each change. */
export function describe(cart: number, added: boolean): string {
	const now = `The cart badge and the cart line now show ${cart}.`;
	return added && cart > 0 ? `Added a bag. ${now}` : now;
}

/** What the idle tour does on each beat while nobody touches the figure. */
export const TOUR = ['add', 'add', 'rest', 'rest', 'reset'] as const;

/** The most beans the unplugged jar holds before it empties and starts again. */
export const JAR_CAP = 9;
export const fill = (jar: number) => (jar >= JAR_CAP ? 0 : jar + 1);

/** The unplugged figure's live sentence: the jar changes, the page never does. */
export function describeUnplugged(jar: number, added: boolean): string {
	if (jar === 0) return 'The jar is empty, and the page still shows 0.';
	return `${added ? 'Added a bag. ' : ''}The jar holds ${jar}, but the page still shows 0.`;
}
