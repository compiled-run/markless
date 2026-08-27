/**
 * The walk starts from the field the key was pressed on, handed in by the
 * caller: a lazily loaded handler runs after the native dispatch has finished,
 * so `event.currentTarget` is null by then while `event.target` still names it.
 */

type Fields = ReadonlyArray<HTMLInputElement>;

/**
 * Which field a movement key focuses next, or `undefined` for "leave focus
 * where it is" - the key is not one of ours, there is nothing to walk, or
 * focus sits outside the walk. Off the ends the walk wraps only when the group
 * loops; otherwise it stays put.
 */
export function nextFieldToFocus(
	fields: Fields | undefined,
	here: Element | null,
	key: string,
	isHorizontal: boolean,
	loop: boolean,
): HTMLInputElement | undefined {
	// Before any read of the fields: most keydowns on a field are not ours.
	const isForwardKey = key === (isHorizontal ? 'ArrowRight' : 'ArrowDown');
	const isStepKey = isForwardKey || key === (isHorizontal ? 'ArrowLeft' : 'ArrowUp');
	if (!isStepKey && key !== 'Home' && key !== 'End') return undefined;
	if (!fields || here === null) return undefined;

	let first: HTMLInputElement | undefined;
	let last: HTMLInputElement | undefined;
	let before: HTMLInputElement | undefined;
	let after: HTMLInputElement | undefined;
	let isHereWalkable = false;

	for (const field of fields) {
		if (field.disabled) continue;
		first ??= field;
		last = field;
		if (field === here) {
			isHereWalkable = true;
			continue;
		}
		if (isHereWalkable) after ??= field;
		else before = field;
	}

	if (!isHereWalkable) return undefined;
	if (key === 'Home') return first;
	if (key === 'End') return last;
	if (isForwardKey) return after ?? (loop ? first : last);
	return before ?? (loop ? last : first);
}
