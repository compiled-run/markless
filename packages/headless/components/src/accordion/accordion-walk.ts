/**
 * Moving focus among an accordion's section triggers.
 *
 * Nothing here looks an element up. The handler reads `accordion.triggerEls` -
 * one array-typed `element()` handle bound on every trigger - and the runtime
 * answers the live triggers in document order, so a section added, removed or
 * reordered is already accounted for by the next read. There is no
 * `querySelector`, no `closest`, and no list kept here to fall out of step with
 * the page.
 *
 * Which trigger the walk starts from is the focused one, handed in by the
 * caller: a lazily loaded handler runs after the native dispatch has finished,
 * so `event.currentTarget` is null by then (measured in tabs, navbar and otp),
 * while focus has not moved and `document.activeElement` still names the button
 * the key was pressed on.
 */

type Triggers = ReadonlyArray<HTMLButtonElement>;

/** The triggers a walk may land on. A section nobody may open is stepped past. */
export function walkableTriggers(triggers: Triggers | undefined): HTMLButtonElement[] {
	return Array.from(triggers ?? []).filter(
		(trigger) => trigger.disabled !== true && trigger.getAttribute('aria-disabled') !== 'true',
	);
}

/**
 * Which trigger a movement key focuses next, or `undefined` for "leave focus
 * where it is" - there is nothing to walk, or the key is not one of ours.
 *
 * The ends always come round. Qwik UI's accordion calls its index walk with no
 * `loop` argument, and that argument only ever *stops* the wrap, so an accordion
 * wraps and there is no prop to say otherwise.
 */
export function nextTriggerToFocus(
	triggers: Triggers | undefined,
	here: Element | null,
	key: string,
): HTMLButtonElement | undefined {
	const walkable = walkableTriggers(triggers);
	const last = walkable.length - 1;
	if (last < 0) return undefined;

	if (key === 'Home') return walkable[0];
	if (key === 'End') return walkable[last];

	const isForwardKey = key === 'ArrowDown';
	if (isForwardKey !== true && key !== 'ArrowUp') return undefined;

	const at = walkable.findIndex((trigger) => trigger === here);
	// Focus is somewhere else entirely - a consumer's own script, say. Down lands
	// on the first section, up on the last, which is the same asymmetry the walk
	// gives an empty start everywhere else in the library.
	if (at < 0) return walkable[isForwardKey ? 0 : last];

	const raw = at + (isForwardKey ? 1 : -1);
	if (raw < 0) return walkable[last];
	if (raw > last) return walkable[0];
	return walkable[raw];
}
