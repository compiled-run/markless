/**
 * The walk starts from the focused trigger, handed in by the caller: a lazily
 * loaded handler runs after the native dispatch has finished, so
 * `event.currentTarget` is null by then, while focus has not moved and
 * `document.activeElement` still names the button the key was pressed on.
 */

type Triggers = ReadonlyArray<HTMLButtonElement>;

export function walkableTriggers(triggers: Triggers | undefined): HTMLButtonElement[] {
	return Array.from(triggers ?? []).filter(
		(trigger) => trigger.disabled !== true && trigger.getAttribute('aria-disabled') !== 'true',
	);
}

/**
 * Which trigger a movement key focuses next, or `undefined` for "leave focus
 * where it is" - there is nothing to walk, or the key is not one of ours.
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
	if (at < 0) return walkable[isForwardKey ? 0 : last];

	const raw = at + (isForwardKey ? 1 : -1);
	if (raw < 0) return walkable[last];
	if (raw > last) return walkable[0];
	return walkable[raw];
}
