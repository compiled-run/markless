/**
 * Moving the roving focus among one surface's items, and answering which level
 * of a nested menu an event landed on.
 *
 * Every question here is asked of the `element()` handles the family binds: the
 * top surface, the plural roster of every `menu.itemcontent`, and the plural
 * roster of every `menu.item`, all live and in document order. Nothing is looked
 * up and nothing is walked to. `contains` is the one platform question asked,
 * and only of a handle this family bound, about a node the platform handed over.
 */

type Parts<Part extends HTMLElement> = ReadonlyArray<Part> | undefined;

/** How long a typeahead buffer stays open, in milliseconds. Select's window, so a consumer using both meets one. */
export const TYPEAHEAD_WINDOW = 750;

/**
 * Every surface of one menu, outermost first: `menu.content`, then every
 * `menu.itemcontent` in document order, which puts a nested surface after the
 * one holding it.
 */
export function surfacesOf(
	content: HTMLElement | undefined,
	itemContents: Parts<HTMLElement>,
): HTMLElement[] {
	const all: HTMLElement[] = [];
	if (content !== undefined) all.push(content);
	for (const one of itemContents ?? []) all.push(one);
	return all;
}

/** The surface an event landed in: the DEEPEST one holding the target. */
export function surfaceOf(
	surfaces: readonly HTMLElement[],
	target: Node | null | undefined,
): HTMLElement | undefined {
	if (target === null || target === undefined) return undefined;
	let found: HTMLElement | undefined;
	for (const surface of surfaces) if (surface.contains(target)) found = surface;
	return found;
}

/** Which item the event landed on: the DEEPEST holder, because a consumer may put an icon inside an item. */
export function itemAt(
	items: readonly HTMLElement[],
	target: Node | null | undefined,
): HTMLElement | undefined {
	if (target === null || target === undefined) return undefined;
	let found: HTMLElement | undefined;
	for (const item of items) if (item.contains(target)) found = item;
	return found;
}

/** One surface's OWN items: the ones no deeper surface holds. */
export function ownItems(
	surfaces: readonly HTMLElement[],
	items: Parts<HTMLElement>,
	surface: HTMLElement | undefined,
): HTMLElement[] {
	if (surface === undefined) return [];
	const own: HTMLElement[] = [];
	for (const item of items ?? [])
		if (surface.contains(item) && surfaceOf(surfaces, item) === surface) own.push(item);
	return own;
}

/** Every surface holding this node, innermost first. */
export function surfacesHolding(
	surfaces: readonly HTMLElement[],
	node: Node | null | undefined,
): HTMLElement[] {
	if (node === null || node === undefined) return [];
	const held: HTMLElement[] = [];
	for (const surface of surfaces) if (surface.contains(node)) held.push(surface);
	return held.reverse();
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
 * An item's own words, for typeahead.
 *
 * A nesting item holds its whole submenu, so its text carries every command
 * inside it too - and a decoration marked `aria-hidden` is in there as well. A
 * match is `startsWith`, and both of those follow the item's own label rather
 * than preceding it, so what answers is still the label. Subtracting them would
 * mean walking child nodes, which this family may not do.
 */
export function itemWords(item: HTMLElement): string {
	return (item.textContent ?? '').trim().toLowerCase();
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
 * Land the roving focus on a surface's first or last item as it is revealed.
 *
 * One call, no retry: the runtime commits the `hidden` write the opening handler
 * just made, so the item is focusable by the time this runs. A family that has
 * to poll frames for that is reporting a runtime defect, not fixing one.
 */
export function focusEdge(items: readonly HTMLElement[], fromEnd: boolean): void {
	const wanted = fromEnd ? items[items.length - 1] : items[0];
	wanted?.focus();
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

/**
 * Close the whole chain a node sits in, by reporting the same `dismiss` the
 * overlay primitive reports, on each surface holding the node, innermost first.
 *
 * Every level answers for itself - a `menu.itemcontent` collapses its own item,
 * `menu.content` closes the menu - and the outermost runs last, so focus ends on
 * the control that opened the menu rather than on an intermediate item.
 */
export function dismissChain(
	surfaces: readonly HTMLElement[],
	node: Node | null | undefined,
): void {
	for (const surface of surfacesHolding(surfaces, node)) {
		surface.dispatchEvent(
			new CustomEvent('dismiss', {
				bubbles: false,
				cancelable: true,
				detail: { reason: 'escape' },
			}),
		);
	}
}
