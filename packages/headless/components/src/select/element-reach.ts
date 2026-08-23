/**
 * Every DOM query this family makes, in one module.
 *
 * Two framework walls put them here, both measured on this tip and written up in
 * `note.md`: a handle read in a handler answers for one widget on the page
 * rather than the handler's own, and nothing yields the rows of a repeated part
 * in order. Until those close, a hop to a sibling part and a walk over the
 * options have to be asked of the document. When they close this file is deleted
 * and the handlers in `select.tsrx` keep the shape they already have.
 *
 * Each function takes the element the gesture happened on and does one job, so a
 * handler never holds a DOM reference of its own.
 */

/**
 * Land the roving focus in the listbox the combobox at `target` controls. The
 * listbox is still `hidden` when the key handler runs and nothing inside a
 * hidden subtree can take focus, so the landing is retried per frame.
 */
export function focusOpeningOption(target: HTMLElement, search: string, isFromEnd: boolean): void {
	const listbox = listboxControlledBy(target);
	if (listbox === null) return;

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
export function focusMatchingOption(target: HTMLElement, search: string): void {
	matchingOption(walkableOptions(listboxAround(target)), search)?.focus();
}

/** Move the roving focus one step, or to an end. The ends do not wrap. */
export function focusNeighbourOption(target: HTMLElement, key: string): void {
	const here = target.closest<HTMLElement>('[role="option"]');
	const options = walkableOptions(listboxAround(target));
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

/** Hand focus back to the combobox that controls the listbox `target` sits in. */
export function returnFocusToTrigger(target: HTMLElement): void {
	const listbox = listboxAround(target);
	if (listbox === null || listbox.id === '') return;
	document.querySelector<HTMLElement>('[aria-controls="' + listbox.id + '"]')?.focus();
}

/** The listbox named by the minted id on the combobox at `target`. */
function listboxControlledBy(target: HTMLElement): HTMLElement | null {
	const combobox = target.closest('[role="combobox"]');
	const listboxId = combobox?.getAttribute('aria-controls') ?? '';
	return listboxId === '' ? null : document.getElementById(listboxId);
}

/** The listbox `target` sits inside. */
function listboxAround(target: HTMLElement): HTMLElement | null {
	return target.closest<HTMLElement>('[role="listbox"]');
}

/** The options a walk may land on, in document order. */
function walkableOptions(listbox: HTMLElement | null): HTMLElement[] {
	if (listbox === null) return [];
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
