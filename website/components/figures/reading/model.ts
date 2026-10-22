// The three reading-tsrx figures' one model: the code on each sheet, the shop words on each page, the presses and the sentences they speak.
export type Tone = 'kw' | 'fn' | 'str' | 'tag' | 'plain';
export type Tok = readonly [text: string, tone: Tone];

/** Columns a run of code takes in the monospaced face. */
export const colsOf = (text: string) => [...text].length;
export const plain = (row: readonly Tok[]) => row.map(([t]) => t).join('');

/** Type sizes in sheet units: the code, and the pencil notes beside it. */
export const CODE_FS = 13;
export const NOTE_FS = 12.5;

export const ADDRESS = 'beanshop.dev';
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
/** The margin note every wired figure on the site carries. */
export const MARGIN_NOTE = 'WIRED BEFORE THE PAGE RAN';

/** Figure one: one element taken apart, its button live on the page. */
export const PARTS_FILE = 'cart-button.tsrx';
export const PARTS_CODE: readonly (readonly Tok[])[] = [
	[['<button', 'tag']],
	[['  class', 'fn'], ['=', 'plain'], ['"buy"', 'str']],
	[['  onClick', 'fn'], ['={() ', 'plain'], ['=>', 'kw'], [' bags++}', 'plain']],
	[['>', 'tag']],
	[['  Add to cart: ', 'plain'], ['{bags}', 'plain']],
	[['</button>', 'tag']],
];
export const BUTTON_LABEL = 'Add to cart:';
export const PARTS_START = 3;
/** The parts of the element, as the pencil names them on the sheet, and the code each points at. */
export const PARTS = [
	{ name: 'tag', at: '<button', row: 0 },
	{ name: 'attribute', at: 'class="buy"', row: 1 },
	{ name: 'event handler', at: 'onClick={() => bags++}', row: 2 },
	{ name: 'text', at: 'Add to cart:', row: 4 },
	{ name: 'value', at: '{bags}', row: 4 },
] as const;

/** One more bag, back to one after nine so the number stays a single digit. */
export const addBag = (bags: number) => (bags >= 9 ? 1 : bags + 1);
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export function describeParts(bags: number): string {
	return `Pressed the button. Its onClick ran bags++, and the wired value on the button now reads ${bags}.`;
}

/** Figure two: the statement container around the body, the expression container around one value. */
export const BOXES_FILE = 'cart.tsrx';
export const BOXES_CODE: readonly (readonly Tok[])[] = [
	[['export', 'kw'], [' default', 'kw'], [' function', 'kw'], [' Cart', 'fn'], ['() ', 'plain'], ['@{', 'kw']],
	[['  let', 'kw'], [' bags ', 'plain'], ['=', 'kw'], [' state', 'fn'], ['(2);', 'plain']],
	[['  let', 'kw'], [' price ', 'plain'], ['=', 'kw'], [' state', 'fn'], ['(14);', 'plain']],
	[],
	[['  <p>', 'tag'], ['Total: ', 'plain'], ['{bags * price}', 'plain'], ['</p>', 'tag']],
	[['}', 'kw']],
];
/** The lines the statement container runs, in order, as rows of the code. */
export const STEPS = [1, 2, 4] as const;
export const STATEMENTS_NOTE = ['@{ } holds statements:', 'steps that run in order'] as const;
export const EXPRESSION_NOTE = ['{ } holds one expression:', 'a value for the page'] as const;
export const WORKING = '2 × 14 = 28';
export const TOTAL = '28';
export const TOTAL_LABEL = 'Total:';

export function describeBoxes(ran: boolean): string {
	if (!ran) return 'Back to the start: nothing has run yet.';
	return 'The statements ran in order: line 2 made bags, line 3 made price, then the paragraph. Its expression, bags times price, gave one value, 28, and the page shows Total: 28.';
}

/** Figure three: a loop and a branch deciding what is on the page. */
export const FLOW_FILE = 'cart-list.tsrx';
export const FLOW_CODE: readonly (readonly Tok[])[] = [
	[['<section>', 'tag']],
	[['  <ul>', 'tag']],
	[['    @for', 'kw'], [' (', 'plain'], ['const', 'kw'], [' bag ', 'plain'], ['of', 'kw'], [' bags; ', 'plain'], ['key', 'kw'], [' bag.id) {', 'plain']],
	[['      <li>', 'tag'], ['{bag.name}', 'plain'], ['</li>', 'tag']],
	[['    }', 'plain']],
	[['  </ul>', 'tag']],
	[['  @if', 'kw'], [' (bags.length > ', 'plain'], ['2', 'plain'], [') {', 'plain']],
	[['    <p>', 'tag'], ['Free shipping!', 'plain'], ['</p>', 'tag']],
	[['  }', 'plain']],
	[['</section>', 'tag']],
];
export const BAGS = ['House blend', 'Dark roast', 'Decaf'] as const;
export const FREE = 'Free shipping!';
export const CART_TITLE = 'Your cart';
export const FOR_NOTE = ['one row', 'per bag'] as const;
export const IF_NOTE = ['only while', 'it is true'] as const;
export type Flow = 'two' | 'three';

export function describeFlow(flow: Flow): string {
	if (flow === 'three') return 'Added Decaf. The @for drew a third row for it, and with three bags the @if test is true, so Free shipping! is on the page.';
	return 'Back to two bags. The @for took the Decaf row away, and the @if test is false, so Free shipping! left the page.';
}
