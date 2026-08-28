/**
 * Walking the bar: which menu a gesture landed in, where a movement key takes
 * the stop, and where the stop is written.
 *
 * Every question is asked of the `element()` handles the bar binds - the roster
 * of registered `menu.trigger`s and the roster of their `menu.root`s - and of
 * the attributes those elements already carry. `contains` on a bound handle is
 * the one platform predicate used; nothing is looked up and nothing is walked
 * to. The typeahead is `menu`'s own, imported rather than restated so a consumer
 * meeting both families meets one window.
 */

import { matchingItem } from '../menu/menu-walk.ts';

export { TYPEAHEAD_WINDOW } from '../menu/menu-walk.ts';

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

/**
 * The registered elements in document order; registration order is not page
 * order.
 *
 * `skip` is the bar's own element, which is in both rosters on purpose: a module
 * that only READS a plural `element()` handle - never binding it in its own
 * markup - reads `undefined`, because the read is lowered against the bindings
 * the module itself carries (`elementHandleValueLowering` in
 * packages/compiler/src/passes/symbol-modules.ts). Every element in these two
 * rosters is registered by the `menu` family from its own components, so the bar
 * binds itself to make its own reads resolve, and walks past itself here.
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

/**
 * Whether an arrow may land here. A natively disabled trigger - a `menu.root`
 * given `disabled` - cannot take focus at all, so walking onto it would swallow
 * the key.
 */
export function isWalkable(trigger: HTMLElement): boolean {
	return (trigger as Partial<HTMLButtonElement>).disabled !== true;
}

/** Whether this trigger's menu is showing, read off the state the trigger already declares. */
export function isShowing(trigger: HTMLElement | undefined): boolean {
	return trigger !== undefined && trigger.getAttribute('aria-expanded') === 'true';
}

/** The position of the one showing menu, or -1. */
export function showingIndex(triggers: readonly HTMLElement[]): number {
	for (let index = 0; index < triggers.length; index++)
		if (isShowing(triggers[index])) return index;
	return -1;
}

/** The deepest registered `menu.root` holding this node. */
function rootOf(roots: readonly HTMLElement[], node: Node): HTMLElement | undefined {
	let found: HTMLElement | undefined;
	for (const root of roots) if (root.contains(node)) found = root;
	return found;
}

/**
 * Which of the bar's menus a node sits in, as a position in the trigger roster,
 * or -1 for a node the bar does not own.
 *
 * A trigger is paired with its menu through containment rather than by index:
 * the two rosters are registered from two different parts, so index parity is a
 * guess and `root.contains(trigger)` is the fact.
 */
export function menuIndexOf(
	triggers: readonly HTMLElement[],
	roots: readonly HTMLElement[],
	node: Node | null | undefined,
): number {
	if (node === null || node === undefined) return -1;
	for (let index = 0; index < triggers.length; index++) {
		const trigger = triggers[index];
		if (trigger === undefined) continue;
		const root = rootOf(roots, trigger);
		if (root !== undefined && root.contains(node)) return index;
	}
	return -1;
}

/** Where the bar's tab stop sits: the active position, clamped onto a walkable trigger. */
export function stopIndex(triggers: readonly HTMLElement[], active: number): number {
	if (triggers.length === 0) return -1;
	const at = active >= 0 && active < triggers.length ? active : 0;
	if (isWalkable(triggers[at] as HTMLElement)) return at;
	const firstWalkable = triggers.findIndex(isWalkable);
	return firstWalkable === -1 ? at : firstWalkable;
}

/**
 * Write the roving tab stop across the roster. The bar does this from its own
 * handlers because a handle cannot be read while deriving
 * (MARKLESS_ELEMENT_HANDLE_UNBOUND), so no trigger can compare itself to the
 * roster at render time. Setting `tabIndex` on elements the bar already holds is
 * a write, not a lookup.
 */
export function applyStops(triggers: readonly HTMLElement[], active: number): void {
	const stop = stopIndex(triggers, active);
	for (let index = 0; index < triggers.length; index++)
		(triggers[index] as HTMLElement).tabIndex = index === stop ? 0 : -1;
}

/**
 * Where a movement key takes the stop, or `undefined` for "not ours, or nowhere
 * to go". The bar wraps at both ends, which is the APG's rule for a menubar and
 * the rule the retired flag already shipped; `toolbar` does not wrap because a
 * bar of plain controls has a Tab-out to make discoverable and this one does
 * not.
 */
export function nextStop(
	triggers: readonly HTMLElement[],
	at: number,
	key: string,
): number | undefined {
	const walkable: number[] = [];
	for (let index = 0; index < triggers.length; index++)
		if (isWalkable(triggers[index] as HTMLElement)) walkable.push(index);
	if (walkable.length === 0) return undefined;

	if (key === 'Home') return walkable[0];
	if (key === 'End') return walkable[walkable.length - 1];

	const isForward = key === 'ArrowRight';
	if (!isForward && key !== 'ArrowLeft') return undefined;
	const here = walkable.indexOf(at);
	if (here === -1) return undefined;
	const raw = here + (isForward ? 1 : -1);
	return walkable[(raw + walkable.length) % walkable.length];
}

/** The first trigger after `at` whose own words start with `search`, wrapping. */
export function matchingTrigger(
	triggers: readonly HTMLElement[],
	search: string,
	at: number,
): HTMLElement | undefined {
	return matchingItem(triggers, search, triggers[at]);
}
