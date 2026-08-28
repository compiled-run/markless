/**
 * The walk starts from the trigger the key was pressed on, handed in by the
 * caller off its own instance handle: a lazily loaded handler runs after the
 * native dispatch has finished, so `event.currentTarget` is null by then.
 */

type Triggers = ReadonlyArray<HTMLButtonElement>;

/**
 * Which trigger a movement key focuses next, or `undefined` for "leave focus
 * where it is" - the key is not one of ours, there is nothing to walk, or
 * focus sits outside the walk. Off the ends the walk wraps only when the list
 * loops; otherwise it stays put.
 */
export function nextTriggerToFocus(
	triggers: Triggers | undefined,
	here: Element | null | undefined,
	key: string,
	isHorizontal: boolean,
	loop: boolean,
): HTMLButtonElement | undefined {
	// Before any read of the triggers: most keydowns on a trigger are not ours.
	const isForwardKey = key === (isHorizontal ? 'ArrowRight' : 'ArrowDown');
	const isStepKey = isForwardKey || key === (isHorizontal ? 'ArrowLeft' : 'ArrowUp');
	if (!isStepKey && key !== 'Home' && key !== 'End') return undefined;
	if (!triggers || !here) return undefined;

	let first: HTMLButtonElement | undefined;
	let last: HTMLButtonElement | undefined;
	let before: HTMLButtonElement | undefined;
	let after: HTMLButtonElement | undefined;
	let isHereWalkable = false;

	for (const trigger of triggers) {
		if (trigger.disabled) continue;
		first ??= trigger;
		last = trigger;
		if (trigger === here) {
			isHereWalkable = true;
			continue;
		}
		if (isHereWalkable) after ??= trigger;
		else before = trigger;
	}

	if (!isHereWalkable) return undefined;
	if (key === 'Home') return first;
	if (key === 'End') return last;
	if (isForwardKey) return after ?? (loop ? first : last);
	return before ?? (loop ? last : first);
}
