// The words on the instruction card and the sentence the build figure's live region speaks.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
export const START = 2;
/** The card's lines, in the order the `@{ }` body runs them. */
export const CARD_LINES = ['bags starts at 2', 'show a button with bags in it'] as const;
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const BUILD_TOUR = ['run', 'rest', 'rest'] as const;

export function describeBuild(ran: boolean): string {
	return ran
		? `Reloaded. The card's two lines ran top to bottom: bags started at ${START}, then the button went on the page with ${START} in its hole.`
		: `The page shows a button reading ${START} bags.`;
}

export const VALUES_START = 2;
const VALUES_LAST = 9;
export const nextBags = (bags: number) => (bags >= VALUES_LAST ? VALUES_START : bags + 1);
export const VALUES_TOUR = ['add', 'add', 'rest', 'rest', 'reset'] as const;

export function describeValues(bags: number, added: boolean): string {
	const now = `The button shows ${bags} bags and its title says Add bag ${bags + 1}.`;
	return added ? `Clicked. ${now}` : now;
}

/** The receipt card's lines, in the order the `@{ }` body runs them. */
export const STEP_LINES = ['price is 14', 'bags is 3', 'total is price × bags', 'show the receipt'] as const;
/** What the first three lines leave on the desk: a name, then its value. */
export const STEP_CHIPS = [
	['price', '14'],
	['bags', '3'],
	['total', '42'],
] as const;
export const STEPS_TOUR = ['run', 'rest', 'rest'] as const;

export function describeSteps(ran: boolean): string {
	return ran
		? 'Reloaded. The four lines ran top to bottom: price became 14, bags became 3, total became 42, and the last line put the receipt on the page.'
		: 'The page shows a receipt: 3 bags at 14 dollars, total 42 dollars.';
}

/** The cart rows the @for figure can show, one per bag. */
export const ROW_NAMES = ['House blend', 'Dark roast', 'Decaf', 'Espresso'] as const;
export const BLOCKS_START = 2;
/** Shipping is free from this many bags. */
export const FREE_AT = 3;
export const addRow = (bags: number) => (bags >= ROW_NAMES.length ? 1 : bags + 1);
export const BLOCKS_TOUR = ['add', 'rest', 'add', 'rest', 'add', 'rest', 'add', 'rest'] as const;

export function describeBlocks(bags: number, added: boolean): string {
	const rows = `The list shows ${bags} ${bags === 1 ? 'row' : 'rows'}`;
	const flap = bags >= FREE_AT ? 'and the Free shipping flap is open.' : 'and the Free shipping flap is shut.';
	return `${added ? 'Added a bag. ' : ''}${rows}, ${flap}`;
}
