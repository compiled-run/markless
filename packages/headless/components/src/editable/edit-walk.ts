/**
 * The edit session's arithmetic, held on its own.
 *
 * Nothing here reads the family's instance, and everything above `landCaret`
 * takes plain strings, numbers and booleans and gives one back — which is what
 * makes this file the reusable half of the family: taglist's
 * per-tag inline edit runs the same session (open on a double-click, Enter takes
 * the words, Escape gives the previous ones back) over a `string[]` instead of a
 * single string, so it can import `editKey`, `opensEdit` and `settled` and keep
 * only its list splice of its own.
 */

/**
 * What one key press means inside an open session, or `undefined` for a key the
 * session does not answer for.
 *
 * The whole keyboard protocol is these two keys. Everything else — caret
 * movement, selection, typing — belongs to the native input underneath, which
 * is why there is no third case here and no arrow handling anywhere in the
 * family.
 */
export function editKey(key: string): 'commit' | 'cancel' | undefined {
	if (key === 'Enter') return 'commit';
	if (key === 'Escape') return 'cancel';
	return undefined;
}

/**
 * Whether a press on the preview control opens a session.
 *
 * `detail` is the platform's own click count, so a double-click needs no second
 * event name and no timer. `detail` of 0 is a click nobody pointed at — the one
 * Enter or Space on a button made — and it always opens: a family that asks for
 * two clicks still has to open from the keyboard, or the control is a WCAG 2.1.1
 * failure.
 */
export function opensEdit(detail: number, onDoubleClick: boolean): boolean {
	if (detail === 0) return true;
	if (onDoubleClick) return detail >= 2;
	return true;
}

/**
 * The value a session leaves behind: the trimmed words when they are taken, and
 * the value from before the session when they are not.
 *
 * Escape restores the PREVIOUS value rather than clearing anything — the input's
 * own text is discarded unread, which is why the caller passes it in and this
 * function ignores it on the cancel path.
 */
export function settled(previous: string, typed: string, keep: boolean): string {
	if (!keep) return previous;
	return typed.trim();
}

/** The words the preview control shows: the value, or the placeholder for an empty one. */
export function previewText(value: string, placeholder: string): string {
	return value === '' ? placeholder : value;
}

/** Whether those words are the placeholder rather than a value somebody wrote. */
export function showsPlaceholder(value: string, placeholder: string): boolean {
	return value === '' && placeholder !== '';
}

/**
 * The value now, out of the three places one can come from: the `value` prop
 * when the consumer controls it, the family's own last write, and `defaultValue`
 * before any write has happened.
 */
export function heldText(
	given: string | undefined,
	own: string | null,
	seed: string,
): string {
	if (given !== undefined) return given;
	if (own !== null) return own;
	return seed;
}

/**
 * Put the words in the field the family bound and give it the caret with all of
 * them selected, which is what "open a session" means at the element.
 *
 * The words go on the element rather than into a bound cell: the field belongs
 * to the person from the moment it shows, and a binding would fight the caret.
 * The write has to happen through a helper — assigning to an element binding
 * inside a `.tsrx` is `MARKLESS_STATE_READ_ONLY_WRITE`, because the compiler
 * cannot own resume state for it. This finds nothing: the caller hands over a
 * handle the family bound itself.
 */
export function landCaret(box: HTMLInputElement | undefined, words: string): void {
	if (box === undefined) return;
	box.value = words;
	box.focus();
	box.select();
}
