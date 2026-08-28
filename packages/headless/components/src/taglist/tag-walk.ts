/**
 * The taglist's value arithmetic, held on its own.
 *
 * Nothing here touches the DOM and nothing here reads the family's instance.
 * Every function takes the committed `string[]` and gives back a new one, or
 * takes the array and the current highlight and gives back the next highlight.
 * That is deliberate: a chip's order IS the value array, so the walk needs no
 * elements at all — unlike the combobox, whose options are consumer markup and
 * whose walk has to go through registered handles to find them.
 *
 * It is also what makes this file the reusable half of the family. A future
 * multi-select combobox renders chips from its own value and drives them with
 * exactly these four functions.
 *
 * The highlight is a VALUE, and `''` means "no tag highlighted — the caret is in
 * the input". Tags are unique, so a value names exactly one tag.
 */

/** The one place the caret's home is spelled: no tag is highlighted. */
export const NO_TAG = '';

/**
 * Where the highlight lands for one movement key.
 *
 * `undefined` means "leave it where it is": there is nothing to walk, or the key
 * asked for a step past the left end, which holds rather than wrapping. Walking
 * right off the last tag returns `NO_TAG`, which is how the caret gets back into
 * the input without anything else having to know the list's length.
 */
export function nextHighlight(
	values: readonly string[],
	current: string,
	key: string,
): string | undefined {
	if (values.length === 0) return undefined;
	const last = values[values.length - 1] as string;
	if (key === 'Home') return values[0] as string;
	if (key === 'End') return last;

	const at = values.indexOf(current);
	if (key === 'ArrowLeft') {
		if (at === -1) return last;
		if (at === 0) return undefined;
		return values[at - 1] as string;
	}
	if (key === 'ArrowRight') {
		if (at === -1) return undefined;
		if (at === values.length - 1) return NO_TAG;
		return values[at + 1] as string;
	}
	return undefined;
}

/**
 * Which tag holds the highlight once `removed` is gone: the one after it, the one
 * before it when it was last, and `NO_TAG` when it was the only one. Read against
 * the array as it stood BEFORE the removal, so the caller does not have to keep
 * two versions of it.
 */
export function afterRemoval(values: readonly string[], removed: string): string {
	const at = values.indexOf(removed);
	if (at === -1) return NO_TAG;
	const next = values[at + 1];
	if (next !== undefined) return next;
	const before = values[at - 1];
	return before ?? NO_TAG;
}

/**
 * The pieces one pasted or typed string carries.
 *
 * Splitting always happens. Ark's `addOnPaste` defaults to off, which makes the
 * out-of-the-box behaviour of a tags field paste `a,b,c` as one tag literally
 * named `a,b,c`; a person pasting a comma-separated list into a chip field means
 * the list.
 */
export function splitPasted(text: string, delimiter: string): string[] {
	const parts = delimiter === '' ? [text] : text.split(delimiter);
	return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/**
 * The value after taking `incoming` onto `held`.
 *
 * Empties are dropped, whitespace is trimmed, a tag already held is silently
 * passed over rather than repeated, and `max` stops the run where it is reached.
 * `max` of 0 is no limit: `Infinity` does not survive serialization.
 */
export function admit(
	held: readonly string[],
	incoming: readonly string[],
	max: number,
): readonly string[] {
	const after = [...held];
	for (const raw of incoming) {
		const one = raw.trim();
		if (one === '') continue;
		if (after.includes(one)) continue;
		if (max > 0 && after.length >= max) break;
		after.push(one);
	}
	return after.length === held.length ? held : after;
}

/**
 * The value after `was` is edited to read `now`.
 *
 * The tag keeps its place. Editing it to the empty string removes it, and editing
 * it onto a tag already held merges the two rather than making a duplicate the
 * highlight could not tell apart.
 */
export function rename(
	held: readonly string[],
	was: string,
	now: string,
): readonly string[] {
	const at = held.indexOf(was);
	if (at === -1) return held;
	const one = now.trim();
	if (one === was) return held;
	if (one === '') return held.filter((tag) => tag !== was);
	if (held.includes(one)) return held.filter((tag) => tag !== was);
	const after = [...held];
	after[at] = one;
	return after;
}

/** The element carrying `value` among a set of registered handles. */
export function elementForValue(
	elements: ReadonlyArray<HTMLElement> | undefined,
	value: string,
): HTMLElement | undefined {
	if (!elements || value === NO_TAG) return undefined;
	return elements.find((one) => one.getAttribute('ui-value') === value);
}
