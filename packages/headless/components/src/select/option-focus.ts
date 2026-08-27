/**
 * Moving the roving focus among a select's options.
 *
 * Nothing here looks an element up. Every function is handed the options
 * themselves: a handler reads `select.optionEls` — one array-typed `element()`
 * handle bound on every option — and the runtime answers the live options in
 * document order. An option added, removed, or reordered is already accounted
 * for by the next read, so there is no list kept here to fall out of step with
 * the page.
 */

type Options = ReadonlyArray<HTMLElement>;

/** Land the roving focus among `options`, on a chosen one or at an end. */
export function focusOpeningOption(
	options: Options | undefined,
	labels: Options | undefined,
	search: string,
	isFromEnd: boolean,
): void {
	if (!options) return;

	let wanted: HTMLElement | undefined;
	if (search === '') {
		let end: HTMLElement | undefined;
		for (const option of options) {
			if (!isWalkable(option)) continue;
			// A chosen option wins over the first-or-last default.
			if (wanted === undefined && option.getAttribute('aria-selected') === 'true') wanted = option;
			if (isFromEnd) end = option;
			else if (end === undefined) end = option;
		}
		wanted ??= end;
	} else {
		wanted = matchingOption(options, labels, search);
	}
	wanted?.focus();
}

/** Move the roving focus to the first option whose own words start with `search`. */
export function focusMatchingOption(
	options: Options | undefined,
	labels: Options | undefined,
	search: string,
): void {
	if (!options) return;
	matchingOption(options, labels, search)?.focus();
}

/** Move the roving focus one step, or to an end. The ends do not wrap. */
export function focusNeighbourOption(
	options: Options | undefined,
	target: HTMLElement,
	key: string,
): void {
	if (!options) return;

	let first: HTMLElement | undefined;
	let last: HTMLElement | undefined;
	let before: HTMLElement | undefined;
	let after: HTMLElement | undefined;
	let isHereWalkable = false;

	for (const option of options) {
		if (!isWalkable(option)) continue;
		first ??= option;
		last = option;
		if (!isHereWalkable && option.contains(target)) {
			isHereWalkable = true;
			continue;
		}
		if (isHereWalkable) after ??= option;
		else before = option;
	}

	if (first === undefined || last === undefined) return;
	if (key === 'Home') return first.focus();
	if (key === 'End') return last.focus();
	// Focus outside every option a walk may land on - an option nobody may choose
	// answers the same - starts the walk at the first, whichever way the key went.
	if (!isHereWalkable) return first.focus();
	// The ends do not wrap: a step past one lands back on the option it came from.
	if (key === 'ArrowDown') return (after ?? last).focus();
	return (before ?? first).focus();
}

/** Commit the option the focus sits in, through that option's own click rule. */
export function commitFocusedOption(options: Options | undefined, target: HTMLElement): void {
	// Every option, not just the walkable ones: the option's own click rule is
	// what refuses a locked choice, and one place in this family reads a value.
	options?.find((option) => option.contains(target))?.click();
}

/** An option nobody may choose is not one a walk may land on. */
function isWalkable(option: HTMLElement): boolean {
	return option.getAttribute('aria-disabled') !== 'true';
}

/** The first walkable option whose own words start with `search`. */
function matchingOption(
	options: Options,
	labels: Options | undefined,
	search: string,
): HTMLElement | undefined {
	for (const option of options) {
		if (isWalkable(option) && optionWords(option, labels).startsWith(search)) return option;
	}
	return undefined;
}

/**
 * An option's own words: the label part this option holds. An indicator is
 * `aria-hidden`, and reading "Chosen" out of one would make that word typeable.
 * An option written without a label falls back to its whole text.
 */
function optionWords(option: HTMLElement, labels: Options | undefined): string {
	const own = labels?.find((label) => option.contains(label));
	return ((own ?? option).textContent ?? '').trim().toLowerCase();
}
