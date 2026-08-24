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

/** The options a walk may land on. An option nobody may choose is stepped past. */
export function walkableOptions(options: Options): HTMLElement[] {
	return options.filter((option) => option.getAttribute('aria-disabled') !== 'true');
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
	const walkable = walkableOptions(options);
	const last = walkable.length - 1;
	if (last < 0) return undefined;

	if (key === 'Home') return optionValue(walkable[0] as HTMLElement);
	if (key === 'End') return optionValue(walkable[last] as HTMLElement);

	const isForwardKey = key === 'ArrowDown';
	const at = walkable.findIndex((option) => optionValue(option) === current);
	// Nothing highlighted yet: down lands on the first, up lands on the LAST.
	// That asymmetry is Qwik UI's, and it is what makes ArrowUp from a closed
	// field open on the end of the list.
	if (at < 0) return optionValue(walkable[isForwardKey ? 0 : last] as HTMLElement);

	const raw = at + (isForwardKey ? 1 : -1);
	if (raw < 0) return isLooping ? optionValue(walkable[last] as HTMLElement) : undefined;
	if (raw > last) return isLooping ? optionValue(walkable[0] as HTMLElement) : undefined;
	return optionValue(walkable[raw] as HTMLElement);
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
