/**
 * The walk starts from the item the key was pressed on, handed in by the caller
 * off its own instance handle: a lazily loaded handler runs after the native
 * dispatch has finished, so `event.currentTarget` is null by then.
 */

type Items = ReadonlyArray<HTMLButtonElement>;

/**
 * Which item a movement key focuses next, or `undefined` for "leave focus where
 * it is" - the key is not one of ours, there is nothing to walk, or focus sits
 * outside the walk. A locked item is walked past rather than landed on. Off the
 * ends the walk wraps only when the group loops; otherwise it stays put.
 */
export function nextItemToFocus(
	items: Items | undefined,
	here: Element | null | undefined,
	key: string,
	isHorizontal: boolean,
	loop: boolean,
): HTMLButtonElement | undefined {
	// Before any read of the items: most keydowns on an item are not ours.
	const isForwardKey = key === (isHorizontal ? 'ArrowRight' : 'ArrowDown');
	const isStepKey = isForwardKey || key === (isHorizontal ? 'ArrowLeft' : 'ArrowUp');
	if (!isStepKey && key !== 'Home' && key !== 'End') return undefined;
	if (!items || !here) return undefined;

	let first: HTMLButtonElement | undefined;
	let last: HTMLButtonElement | undefined;
	let before: HTMLButtonElement | undefined;
	let after: HTMLButtonElement | undefined;
	let isHereWalkable = false;

	for (const item of items) {
		if (item.disabled) continue;
		first ??= item;
		last = item;
		if (item === here) {
			isHereWalkable = true;
			continue;
		}
		if (isHereWalkable) after ??= item;
		else before = item;
	}

	if (!isHereWalkable) return undefined;
	if (key === 'Home') return first;
	if (key === 'End') return last;
	if (isForwardKey) return after ?? (loop ? first : last);
	return before ?? (loop ? last : first);
}
