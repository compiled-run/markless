/**
 * Moving the combobox's highlight among its options.
 *
 * Nothing here looks an element up. Every function is handed the options
 * themselves: a handler reads `combobox.optionEls` - one array-typed `element()`
 * handle bound on every option - and the runtime answers the live options in
 * document order. An option filtered out, added, or reordered is already
 * accounted for by the next read, so there is no list kept here to fall out of
 * step with the page.
 *
 * The highlight is a VALUE, not an element and not an index: DOM focus stays in
 * the input, so nothing about the highlight can be read back off the document's
 * focus. That is why an option carries its own value in the markup as
 * `ui-value` - it is the only channel from an element the walk was handed back
 * to the family state that names it. */

type Options = ReadonlyArray<HTMLElement>;

/** The value an option carries, or '' for an element that carries none. */
export function optionValue(option: HTMLElement): string {
	return option.getAttribute('ui-value') ?? '';
}

/** An option nobody may choose is stepped past. */
function isWalkable(option: HTMLElement): boolean {
	return option.getAttribute('aria-disabled') !== 'true';
}

/**
 * Where the highlight lands for one movement key.
 *
 * `undefined` means "leave it where it is": there is nothing to walk, or the key
 * asked for a step past an end that does not wrap.
 */
export function nextHighlightValue(
	options: Options | undefined,
	current: string,
	key: string,
	isLooping: boolean,
): string | undefined {
	if (!options) return undefined;

	const isForwardKey = key === 'ArrowDown';
	let first: HTMLElement | undefined;
	let last: HTMLElement | undefined;
	let before: HTMLElement | undefined;
	let after: HTMLElement | undefined;
	let isCurrentWalkable = false;

	for (const option of options) {
		if (!isWalkable(option)) continue;
		first ??= option;
		last = option;
		if (!isCurrentWalkable && optionValue(option) === current) {
			isCurrentWalkable = true;
			continue;
		}
		if (isCurrentWalkable) after ??= option;
		else before = option;
	}

	if (first === undefined || last === undefined) return undefined;
	if (key === 'Home') return optionValue(first);
	if (key === 'End') return optionValue(last);
	// Nothing highlighted yet: down lands on the first, up lands on the LAST.
	// That asymmetry is Qwik UI's, and it is what makes ArrowUp from a closed
	// field open on the end of the list.
	if (!isCurrentWalkable) return optionValue(isForwardKey ? first : last);

	if (isForwardKey) {
		if (after) return optionValue(after);
		return isLooping ? optionValue(first) : undefined;
	}
	if (before) return optionValue(before);
	return isLooping ? optionValue(last) : undefined;
}

/**
 * Take the option carrying `value` through its OWN click rule.
 *
 * Every option, not just the walkable ones: that rule is what refuses a locked
 * choice, what decides whether the list closes, and the one place in this family
 * where a value and its label are read. Nothing here needs to know either.
 */
export function clickOptionWithValue(options: Options | undefined, value: string): void {
	options?.find((option) => optionValue(option) === value)?.click();
}
