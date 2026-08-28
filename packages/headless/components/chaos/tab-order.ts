// Sequential focus navigation, done by hand. A dispatched `Tab` keydown is not
// trusted, so the browser never performs the focus move that follows it; without
// this the storm's Tab presses test the family's handler and nothing else, and a
// family that correctly declines to hold focus on Tab looks like it stranded the
// user.

import { isVisible } from './invariants.ts';

/** What one emulated `Tab` did, for the gesture log. */
export type TabStep = {
	/** Where the press started, when that was a real element rather than `<body>`. */
	readonly from: HTMLElement | null;
	/** Where focus landed, or `null` when the press walked off the end of the page. */
	readonly to: HTMLElement | null;
	/** True when there was no next tabbable and focus was dropped on purpose. */
	readonly leftThePage: boolean;
};

const TABBABLE_CANDIDATES = [
	'a[href]',
	'area[href]',
	'audio[controls]',
	'button',
	'details',
	'embed',
	'iframe',
	'input',
	'object',
	'select',
	'summary',
	'textarea',
	'video[controls]',
	'[contenteditable]',
	'[tabindex]',
].join(', ');

let offTheEnd = false;

// Anything taking focus afterwards ends the deliberate tab-out: a later fall to
// `<body>` is then a strand again, not the tab that left on purpose.
const onFocusIn = () => {
	offTheEnd = false;
};

export type TabOutWatch = {
	/** True when the last thing to move focus was `Tab` walking off the last tabbable. */
	walkedOffTheEnd(): boolean;
	stop(): void;
};

export function watchTabOut(): TabOutWatch {
	offTheEnd = false;
	document.addEventListener('focusin', onFocusIn, true);
	return {
		walkedOffTheEnd: () => offTheEnd,
		stop() {
			document.removeEventListener('focusin', onFocusIn, true);
			offTheEnd = false;
		},
	};
}

function isTabbable(node: HTMLElement): boolean {
	if (node.tabIndex < 0) return false;
	// `:disabled` also catches a field a disabled <fieldset> is holding down.
	if (node.matches(':disabled') || node.matches('[inert], [inert] *')) return false;
	return isVisible(node);
}

/**
 * Every tabbable element on the page, in the order the browser walks them: a
 * positive `tabindex` comes first, ascending, then everything at 0 in document
 * order.
 */
export function tabbablesInOrder(): HTMLElement[] {
	const found: HTMLElement[] = [];
	for (const node of document.querySelectorAll<HTMLElement>(TABBABLE_CANDIDATES)) {
		if (isTabbable(node)) found.push(node);
	}
	return found
		.map((node, position) => ({
			node,
			position,
			group: node.tabIndex > 0 ? node.tabIndex : Number.MAX_SAFE_INTEGER,
		}))
		.sort((left, right) => left.group - right.group || left.position - right.position)
		.map((entry) => entry.node);
}

function firstAfter(order: readonly HTMLElement[], from: HTMLElement): HTMLElement | null {
	for (const node of order) {
		if (from.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) return node;
	}
	return null;
}

function lastBefore(order: readonly HTMLElement[], from: HTMLElement): HTMLElement | null {
	let best: HTMLElement | null = null;
	for (const node of order) {
		if (from.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) best = node;
	}
	return best;
}

function nextInOrder(
	order: readonly HTMLElement[],
	from: HTMLElement | null,
	backwards: boolean,
): HTMLElement | null {
	if (order.length === 0) return null;
	// Nothing focused: the press after one that left the page, which in a real
	// browser is the one coming back out of the chrome.
	if (!from || !from.isConnected) return (backwards ? order[order.length - 1] : order[0]) ?? null;
	const index = order.indexOf(from);
	if (index >= 0) return order[backwards ? index - 1 : index + 1] ?? null;
	// The focused element is not tabbable itself - a roving `tabindex="-1"` option,
	// or one the family just hid. The browser keeps its navigation point where that
	// element stood, so carry on from there in document order.
	return backwards ? lastBefore(order, from) : firstAfter(order, from);
}

/**
 * Move focus the way a trusted `Tab` would have. `origin` is where focus was when
 * the key went down, which is not always where it is now: a handler can hide the
 * focused element and the browser drops focus to `<body>` before this runs.
 */
export function emulateTab(origin: HTMLElement | null, backwards: boolean): TabStep {
	const from =
		origin && origin !== document.body && origin !== document.documentElement ? origin : null;
	const order = tabbablesInOrder();
	const to = nextInOrder(order, from, backwards);
	offTheEnd = false;
	if (to) {
		to.focus();
	} else {
		// What the browser does at the end of the page: focus leaves for the chrome
		// and the document is left with none.
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		// A page with nothing tabbable left is a strand, not a tab-out: there is
		// nothing for the next Tab to come back to.
		offTheEnd = order.length > 0;
	}
	return { from, to, leftThePage: to === null };
}
