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

/**
 * Land the roving focus among `options`, on a chosen one or at an end.
 *
 * The listbox is still `hidden` when the trigger's key handler runs and nothing
 * inside a hidden subtree can take focus, so the landing is retried per frame.
 */
export function focusOpeningOption(
	options: Options | undefined,
	search: string,
	isFromEnd: boolean,
): void {
	if (!options) return;
	const walkable = walkableOptions(options);

	let tries = 12;
	const land = () => {
		const end = isFromEnd ? walkable[walkable.length - 1] : walkable[0];
		// A chosen option wins over the first-or-last default.
		const chosen = walkable.find((option) => option.getAttribute('aria-selected') === 'true');
		const wanted = search === '' ? (chosen ?? end) : matchingOption(walkable, search);
		wanted?.focus();
		tries = tries - 1;
		if (tries > 0 && document.activeElement !== wanted) requestAnimationFrame(land);
	};
	requestAnimationFrame(land);
}

/** Move the roving focus to the first option whose own words start with `search`. */
export function focusMatchingOption(options: Options | undefined, search: string): void {
	if (!options) return;
	matchingOption(walkableOptions(options), search)?.focus();
}

/** Move the roving focus one step, or to an end. The ends do not wrap. */
export function focusNeighbourOption(
	options: Options | undefined,
	target: HTMLElement,
	key: string,
): void {
	if (!options) return;
	const walkable = walkableOptions(options);
	const last = walkable.length - 1;
	// -1 when the focus sits outside every option a walk may land on, which is
	// also what an option nobody may choose answers: both start the walk at an end.
	const at = walkable.findIndex((option) => option.contains(target));
	const to =
		key === 'Home'
			? 0
			: key === 'End'
				? last
				: key === 'ArrowDown'
					? Math.min(at + 1, last)
					: Math.max(at - 1, 0);
	walkable[to]?.focus();
}

/** Commit the option the focus sits in, through that option's own click rule. */
export function commitFocusedOption(options: Options | undefined, target: HTMLElement): void {
	// Every option, not just the walkable ones: the option's own click rule is
	// what refuses a locked choice, and one place in this family reads a value.
	options?.find((option) => option.contains(target))?.click();
}

/** The options a walk may land on. An option nobody may choose is skipped. */
function walkableOptions(options: Options): HTMLElement[] {
	return options.filter((option) => option.getAttribute('aria-disabled') !== 'true');
}

function matchingOption(options: Options, search: string): HTMLElement | undefined {
	return options.find((option) => optionWords(option).startsWith(search));
}

/**
 * An option's own words. An indicator is `aria-hidden`, so its words are not the
 * option's: reading "Chosen" out of one would make that word typeable.
 */
function optionWords(option: HTMLElement): string {
	let words = '';
	for (const node of Array.from(option.childNodes)) {
		const isDecoration =
			node.nodeType === 1 && (node as Element).getAttribute('aria-hidden') === 'true';
		if (isDecoration) continue;
		words += node.textContent ?? '';
	}
	return words.trim().toLowerCase();
}
