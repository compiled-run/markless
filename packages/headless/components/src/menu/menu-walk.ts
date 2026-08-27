/**
 * Moving the roving focus among a menu's items, and finding which menu an event
 * happened in.
 *
 * This family asks the DOM where `select` and `navbar` ask an `element()`
 * handle, and the reason is structural rather than a preference: a submenu is a
 * nested `menu.root`, so its parts belong to a DIFFERENT widget instance than
 * the menu it hangs off. No handle spans that boundary - a `menu.itemtrigger`
 * binds the submenu's handles, while the walk it takes part in belongs to the
 * menu above it - so the only thing both surfaces share is the document. The
 * roles are the family's own output, so reading them back is reading what this
 * module just wrote.
 */

const ITEM_SELECTOR = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';
const SURFACE_SELECTOR = '[role="menu"]';

/** How long a typeahead buffer stays open, in milliseconds. Select's window, so a consumer using both meets one. */
export const TYPEAHEAD_WINDOW = 750;

/** The surface an event happened in: the nearest enclosing `role="menu"`. */
export function surfaceOf(target: Node | null | undefined): HTMLElement | undefined {
	const from =
		target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
	return from?.closest<HTMLElement>(SURFACE_SELECTOR) ?? undefined;
}

/** The surface this one hangs off, or `undefined` for a menu that is nobody's submenu. */
export function parentSurfaceOf(surface: HTMLElement | undefined): HTMLElement | undefined {
	return surfaceOf(surface?.parentElement);
}

/**
 * One surface's own items, in document order. A submenu's items belong to the
 * submenu, and a `menu.itemtrigger` belongs to the menu it is written in, which
 * is what the nearest-surface test answers.
 */
export function itemsOf(surface: HTMLElement | undefined): HTMLElement[] {
	if (!surface) return [];
	const items: HTMLElement[] = [];
	for (const item of surface.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
		if (item.closest(SURFACE_SELECTOR) === surface) items.push(item);
	}
	return items;
}

/**
 * Which item the event happened on: the DEEPEST holder, because a consumer may
 * put an icon or a span inside an item and the event lands on that.
 */
export function itemAt(
	surface: HTMLElement | undefined,
	target: Node | null,
): HTMLElement | undefined {
	if (target === null) return undefined;
	let found: HTMLElement | undefined;
	for (const item of itemsOf(surface)) if (item.contains(target)) found = item;
	return found;
}

export type Step = 'next' | 'previous' | 'first' | 'last';

/**
 * Where a movement key lands, or `undefined` for "leave focus where it is".
 * A disabled item is a destination: the APG has the arrows land on one and
 * refuse to activate it, so a person is told the command exists.
 */
export function stepTo(
	items: readonly HTMLElement[],
	here: HTMLElement | undefined,
	step: Step,
	loop: boolean,
): HTMLElement | undefined {
	const last = items.length - 1;
	if (last < 0) return undefined;
	if (step === 'first') return items[0];
	if (step === 'last') return items[last];
	if (here === undefined) return step === 'next' ? items[0] : items[last];

	const at = items.indexOf(here);
	if (at < 0) return step === 'next' ? items[0] : items[last];
	const raw = at + (step === 'next' ? 1 : -1);
	if (raw < 0) return loop ? items[last] : items[0];
	if (raw > last) return loop ? items[0] : items[last];
	return items[raw];
}

/**
 * An item's own words. A decoration marked `aria-hidden` is not part of them:
 * reading "Checked" out of an indicator would make that word typeable.
 */
export function itemWords(item: HTMLElement): string {
	let words = '';
	for (const node of item.childNodes) {
		const isDecoration =
			node.nodeType === 1 && (node as Element).getAttribute('aria-hidden') === 'true';
		const isNestedSurface = node.nodeType === 1 && (node as Element).matches(SURFACE_SELECTOR);
		if (isDecoration || isNestedSurface) continue;
		words += node.textContent ?? '';
	}
	return words.trim().toLowerCase();
}

/** The first item whose own words start with `search`, looked for after `here` and wrapping. */
export function matchingItem(
	items: readonly HTMLElement[],
	search: string,
	here: HTMLElement | undefined,
): HTMLElement | undefined {
	if (search === '' || items.length === 0) return undefined;
	const from = here === undefined ? 0 : items.indexOf(here) + 1;
	for (let step = 0; step < items.length; step += 1) {
		const item = items[(from + step) % items.length];
		if (item && itemWords(item).startsWith(search)) return item;
	}
	return undefined;
}

/**
 * Land the roving focus on `wanted`.
 *
 * The surface is still `hidden` when the opening handler runs and nothing inside
 * a hidden subtree can take focus, so the landing is retried per frame. Select
 * measured a single frame landing the first open and racing later ones.
 */
export function focusItem(wanted: HTMLElement | undefined): void {
	if (!wanted) return;
	let tries = 12;
	const land = () => {
		wanted.focus();
		tries = tries - 1;
		if (tries > 0 && document.activeElement !== wanted) requestAnimationFrame(land);
	};
	requestAnimationFrame(land);
}

/** Where a movement key lands among `items`, or `undefined` for a key that moves nothing. */
export function walkTarget(
	items: readonly HTMLElement[],
	here: HTMLElement | undefined,
	key: string,
	loop: boolean,
): HTMLElement | undefined {
	if (key === 'Home') return stepTo(items, here, 'first', loop);
	if (key === 'End') return stepTo(items, here, 'last', loop);
	if (key === 'ArrowDown') return stepTo(items, here, 'next', loop);
	if (key === 'ArrowUp') return stepTo(items, here, 'previous', loop);
	return undefined;
}

/**
 * Where focus goes when a context menu closes.
 *
 * A context menu has no trigger to hand focus back to, so the family remembers
 * what held focus when the menu was asked for. It is kept here rather than in
 * the graph because it is an element, which is not state a page can be served
 * with or resumed from; the surface is the key, so two menus never confuse
 * theirs.
 */
const returning = new WeakMap<HTMLElement, HTMLElement>();

export function rememberReturn(surface: HTMLElement, back: HTMLElement): void {
	returning.set(surface, back);
}

export function takeReturn(surface: HTMLElement): HTMLElement | undefined {
	const back = returning.get(surface);
	returning.delete(surface);
	return back;
}

/** Land the roving focus on a surface's first or last item as it opens. */
export function focusOpening(surface: HTMLElement | undefined, fromEnd: boolean): void {
	const items = itemsOf(surface);
	focusItem(fromEnd ? items[items.length - 1] : items[0]);
}

/**
 * Close every surface above this one, by reporting the same `dismiss` the
 * overlay primitive reports. Activating a command closes the whole menu, and a
 * submenu's item can only reach the menus above it through the document: each
 * of them is a separate widget instance with no handle into this one.
 */
export function dismissAbove(surface: HTMLElement | undefined): void {
	let above = parentSurfaceOf(surface);
	while (above) {
		above.dispatchEvent(
			new CustomEvent('dismiss', {
				bubbles: false,
				cancelable: true,
				detail: { reason: 'escape' },
			}),
		);
		above = parentSurfaceOf(above);
	}
}
