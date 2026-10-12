// The screen you wrote, what Markless reads in it, and each device's own word for the same press.
export const SHOP = 'Beanshop';
export const ORDER_FOR = 'Latte for Marcus';
export const ACTION = 'Mark ready';
export const ADDRESS = 'beanshop.dev';
/** The name on the plan's hanging tag: the value the screen keeps. */
export const VALUE = 'status';
/** The press handler you wrote, the one word every device translates. */
export const WROTE = 'onClick';
/** The tag on the card's button: what you wrote for it. */
export const CODE_TAG = '<button onClick>';

export type Order = 'brewing' | 'ready';
/** How each order status reads on a screen, as lines. */
export const STATUS: Record<Order, readonly string[]> = { brewing: ['Brewing…'], ready: ['Ready for', 'pickup'] };
export const said = (order: Order) => STATUS[order].join(' ');

/** What Markless notes about the card, in plain words. */
export const FINDINGS = ['<button>', 'shows the status', 'onClick → mark ready'] as const;
export const PLAN_NOTE = 'same plan for every device';
export const ADAPTER_NOTE = 'add an adapter here';

export type Status = 'native' | 'wanted';

export interface Device {
	readonly key: string;
	/** The label under the device; the pencil slot carries the adapter note instead. */
	readonly name: string;
	/** The device's own word for onClick, as the compiler maps it. */
	readonly press: string;
	readonly status: Status;
	readonly said: string;
}

export const DEVICES: readonly Device[] = [
	{ key: 'browser', name: 'BROWSER', press: 'click', status: 'native', said: 'a browser window, where onClick becomes click' },
	{ key: 'iphone', name: 'IPHONE', press: 'touchUpInside', status: 'native', said: 'an iPhone, where onClick becomes touchUpInside on a real native button' },
	{ key: 'mac', name: 'MAC', press: 'action', status: 'native', said: 'a Mac, where onClick becomes action on a real native button' },
	{ key: 'slot', name: '', press: '?', status: 'wanted', said: 'an empty slot sketched in pink pencil with an Android phone, a smartwatch and an email envelope, its word for onClick a question mark, with the note add an adapter here' },
];

const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** The plain-text description of the drawing, step by step. */
export function describe(): string {
	const inked = DEVICES.filter((d) => d.status === 'native').map((d) => d.said);
	const wanted = DEVICES.filter((d) => d.status === 'wanted').map((d) => d.said);
	return [
		`A pen-and-ink drawing of a pipeline on a desk, read left to right.`,
		`First, the screen you wrote: a paper card with the Beanshop order screen, ${ORDER_FOR}, the status ${said('brewing')} and a pink ${ACTION} button, tagged in hand lettering with what you wrote for it, ${CODE_TAG}.`,
		`A magnifying glass lies beside it, with three notes on what Markless found: ${list(FINDINGS.map((f) => f.replace(' → ', ' means ')))}.`,
		`Next, the plan: a small sheet with a hanging tag marked ${VALUE}, an ink wire from the tag to a label showing ${said('brewing')}, and a thin wire from a button into the tag, captioned ${PLAN_NOTE}.`,
		`Arrows run from the plan to each device, each one labelled with ${WROTE} and the word that device turns it into, and every device shows the same cup, the status and the pink button: ${list(inked)}, all inked solid. Last, ${list(wanted)}.`,
		`Press the figure, or Enter or Space, to mark the order ready: the tag swings, pulses run out along the inked arrows, and every inked device crosses out ${said('brewing')} and writes ${said('ready')}. Press again for a new order. The pencil slot stays as it is. Escape starts again.`,
	].join(' ');
}

export const START: Order = 'brewing';
/** Ready after brewing; a press on a ready order starts a new one. */
export const toggle = (order: Order): Order => (order === 'brewing' ? 'ready' : 'brewing');
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
/** What the idle tour does on each beat while nobody touches the figure. */
export const TOUR = ['press', 'rest', 'press', 'rest', 'rest', 'reset'] as const;

/** The sentence the screen-reader live region speaks after each change. */
export function spoken(order: Order, pressed: boolean): string {
	const now = `The browser, iPhone and Mac now say ${said(order)}.`;
	if (!pressed) return now;
	return order === 'ready' ? `Marked ready. ${now}` : `New order. ${now}`;
}
