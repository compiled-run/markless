/**
 * The walk starts from the focused trigger, handed in by the caller: a lazily
 * loaded handler runs after the native dispatch has finished, so
 * `event.currentTarget` is null by then, while focus has not moved and
 * `document.activeElement` still names the button the key was pressed on.
 */

type Triggers = ReadonlyArray<HTMLButtonElement>;

function isWalkable(trigger: HTMLButtonElement): boolean {
	return trigger.disabled !== true && trigger.getAttribute('aria-disabled') !== 'true';
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
	// Before any read of the triggers: most keydowns on a trigger are not ours.
	const isForwardKey = key === 'ArrowDown';
	const isStepKey = isForwardKey || key === 'ArrowUp';
	if (!isStepKey && key !== 'Home' && key !== 'End') return undefined;
	if (!triggers) return undefined;

	let first: HTMLButtonElement | undefined;
	let last: HTMLButtonElement | undefined;
	let before: HTMLButtonElement | undefined;
	let after: HTMLButtonElement | undefined;
	let isHereWalkable = false;

	for (const trigger of triggers) {
		if (!isWalkable(trigger)) continue;
		first ??= trigger;
		last = trigger;
		if (trigger === here) {
			isHereWalkable = true;
			continue;
		}
		if (isHereWalkable) after ??= trigger;
		else before = trigger;
	}

	if (first === undefined) return undefined;
	if (key === 'Home') return first;
	if (key === 'End') return last;
	// Focus sitting outside the walk starts it at the end the key comes from.
	if (!isHereWalkable) return isForwardKey ? first : last;
	return isForwardKey ? (after ?? first) : (before ?? last);
}
