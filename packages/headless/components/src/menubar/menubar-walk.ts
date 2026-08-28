/**
 * Walking the bar: which item a gesture landed in, where a movement key takes
 * the stop, where the stop is written, and how one item hands over to the next.
 *
 * Every question is asked of the `element()` handles the bar binds - the roster
 * of its own `menubar.item`s - and of the attributes those items already carry.
 * `contains` on a bound handle is the one platform predicate used; nothing is
 * looked up and nothing is walked to. The typeahead is `menu`'s own, imported
 * rather than restated so a consumer meeting both families meets one window.
 */

import { matchingItem } from '../menu/menu-walk.ts';

export { TYPEAHEAD_WINDOW } from '../menu/menu-walk.ts';

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

/**
 * The registered items in document order; registration order is not page order.
 *
 * `skip` is the bar's own element, which is in the roster on purpose: a module
 * that only READS a plural `element()` handle - never binding it in its own
 * markup - reads `undefined`, because the read is lowered against the bindings
 * the module itself carries (`elementHandleValueLowering` in
 * packages/compiler/src/passes/symbol-modules.ts). The bar binds its roster to
 * itself so its own reads resolve, and walks past itself here.
 */
export function orderedRoster(items: unknown, skip?: HTMLElement): HTMLElement[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	const registered = items.filter(
		(one): one is HTMLElement => one instanceof HTMLElement && one !== skip,
	);
	return registered.sort((left, right) => {
		if (left === right) return 0;
		return (left.compareDocumentPosition(right) & FOLLOWING) !== 0 ? -1 : 1;
	});
}

/** Whether this item's menu is showing, read off the state the item already declares. */
export function isShowing(item: HTMLElement | undefined): boolean {
	return item !== undefined && item.getAttribute('aria-expanded') === 'true';
}

/** The position of the one showing menu, or -1. */
export function showingIndex(items: readonly HTMLElement[]): number {
	for (let index = 0; index < items.length; index++) if (isShowing(items[index])) return index;
	return -1;
}

/**
 * Which of the bar's items a node sits in, or -1 for a node the bar does not
 * own. An item HOLDS its own menu, so a command three levels down is inside the
 * item it belongs to and this answers with that item.
 */
export function itemIndexOf(
	items: readonly HTMLElement[],
	node: Node | null | undefined,
): number {
	if (node === null || node === undefined) return -1;
	for (let index = 0; index < items.length; index++)
		if (items[index]?.contains(node) === true) return index;
	return -1;
}

/** Where the bar's tab stop sits: the active position, clamped onto the roster. */
export function stopIndex(items: readonly HTMLElement[], active: number): number {
	if (items.length === 0) return -1;
	return active >= 0 && active < items.length ? active : 0;
}

/**
 * Write the roving tab stop across the roster. The bar does this from its own
 * handlers because a handle cannot be read while deriving
 * (MARKLESS_ELEMENT_HANDLE_UNBOUND), so no item can compare itself to the roster
 * at render time. Setting `tabIndex` on elements the bar already holds is a
 * write, not a lookup.
 */
export function applyStops(items: readonly HTMLElement[], active: number): void {
	const stop = stopIndex(items, active);
	for (let index = 0; index < items.length; index++)
		(items[index] as HTMLElement).tabIndex = index === stop ? 0 : -1;
}

/**
 * Where a movement key takes the stop, or `undefined` for a key that moves
 * nothing. The bar wraps at both ends, which is the APG's rule for a menubar;
 * `toolbar` does not wrap because a bar of plain controls has a Tab-out to make
 * discoverable and this one does not.
 *
 * A disabled item is a destination: the APG has the arrows land on one and
 * refuse to open it, so a person is told the menu exists.
 */
export function nextStop(
	items: readonly HTMLElement[],
	at: number,
	key: string,
): number | undefined {
	const last = items.length - 1;
	if (last < 0) return undefined;
	if (key === 'Home') return 0;
	if (key === 'End') return last;

	const isForward = key === 'ArrowRight';
	if (!isForward && key !== 'ArrowLeft') return undefined;
	if (at < 0 || at > last) return undefined;
	return (at + (isForward ? 1 : -1) + items.length) % items.length;
}

/** The first item after `at` whose own words start with `search`, wrapping. */
export function matchingBarItem(
	items: readonly HTMLElement[],
	search: string,
	at: number,
): HTMLElement | undefined {
	return matchingItem(items, search, items[at]);
}

/**
 * Hand the bar over from one item to the next, by re-delivering the gestures the
 * items already answer for themselves: an ArrowDown opens a menu on its first
 * command, a click opens one leaving focus where it is, and a click on an open
 * item is what closes it. A bar instance cannot reach one item's cells, so a
 * gesture is the only thing there is to write.
 *
 * Open first, close after: the focus the neighbour takes is what collapses any
 * submenu the leaving item had open. The neighbour answers through its own lazily
 * woken handler, so nothing here may assume it has opened by the time this
 * returns.
 */
export function travel(items: readonly HTMLElement[], from: number, next: number): void {
	items[next]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
	conceal(items, from);
}

/** Travel's pointer half: the menu opens and focus stays on the bar. */
export function reveal(items: readonly HTMLElement[], from: number, next: number): void {
	items[next]?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
	conceal(items, from);
}

function conceal(items: readonly HTMLElement[], from: number): void {
	const leaving = items[from];
	if (leaving !== undefined && isShowing(leaving)) {
		leaving.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
	}
}
