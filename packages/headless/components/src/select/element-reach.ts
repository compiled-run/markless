/**
 * Every DOM query this family still makes, in one module.
 *
 * One framework wall keeps it alive: nothing yields the rows of a repeated part
 * in order, so the options under a listbox have to be asked of the document.
 * The listbox and the trigger are no longer among them — each handler reads its
 * own widget instance's `element()` handle and hands the element in.
 *
 * Each function takes the elements the gesture concerns and does one job, so a
 * handler never looks a sibling part up for itself.
 */

/**
 * Land the roving focus in `listbox`. The listbox is still `hidden` when the key
 * handler runs and nothing inside a hidden subtree can take focus, so the
 * landing is retried per frame.
 */
export function focusOpeningOption(
	listbox: HTMLElement | undefined,
	search: string,
	isFromEnd: boolean,
): void {
	if (!listbox) return;

	let tries = 12;
	const land = () => {
		const options = walkableOptions(listbox);
		const end = isFromEnd ? options[options.length - 1] : options[0];
		// A chosen option wins over the first-or-last default.
		const chosen = options.find((option) => option.getAttribute('aria-selected') === 'true');
		const wanted = search === '' ? (chosen ?? end) : matchingOption(options, search);
		wanted?.focus();
		tries = tries - 1;
		if (tries > 0 && document.activeElement !== wanted) requestAnimationFrame(land);
	};
	requestAnimationFrame(land);
}

/** Move the roving focus to the first option whose own words start with `search`. */
export function focusMatchingOption(listbox: HTMLElement | undefined, search: string): void {
	if (!listbox) return;
	matchingOption(walkableOptions(listbox), search)?.focus();
}

/** Move the roving focus one step, or to an end. The ends do not wrap. */
export function focusNeighbourOption(
	listbox: HTMLElement | undefined,
	target: HTMLElement,
	key: string,
): void {
	if (!listbox) return;
	const here = target.closest<HTMLElement>('[role="option"]');
	const options = walkableOptions(listbox);
	const last = options.length - 1;
	const at = here === null ? -1 : options.indexOf(here);
	const to =
		key === 'Home'
			? 0
			: key === 'End'
				? last
				: key === 'ArrowDown'
					? Math.min(at + 1, last)
					: Math.max(at - 1, 0);
	options[to]?.focus();
}

/** Commit the option `target` sits in, through that option's own click rule. */
export function commitFocusedOption(target: HTMLElement): void {
	target.closest<HTMLElement>('[role="option"]')?.click();
}

/** The options a walk may land on, in document order. */
function walkableOptions(listbox: HTMLElement): HTMLElement[] {
	const all = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'));
	return all.filter((option) => option.getAttribute('aria-disabled') !== 'true');
}

function matchingOption(options: HTMLElement[], search: string): HTMLElement | undefined {
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
