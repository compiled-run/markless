/**
 * The focus moves the family owns, both retried per frame.
 *
 * A popup's content is still `hidden` when the trigger's handler runs, and the
 * day the keyboard just walked onto may not carry its new date until the render
 * that follows the handler. Neither target can take focus on the call, so the
 * move is retried and then gives up rather than spinning. `modal-focus.ts` found
 * this first; the shape is its.
 */

const TRIES = 12;
// A month change replaces every keyed row, and the rewrite lands several frames
// after the write that caused it.
const VALUE_TRIES = 30;

export function landFocus(target: HTMLElement | undefined): void {
	if (!target) return;

	let tries = TRIES;
	const step = () => {
		// Never stops early on a hit: hiding the surface the focus came from blurs it
		// again a frame later, and the move has to be re-asserted until it holds.
		if (document.activeElement !== target) target.focus();
		tries = tries - 1;
		if (tries > 0) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}

/**
 * Land focus on the day holding one date, re-read from the DOM every frame: a
 * month change detaches the element a caller could have captured, so the date is
 * the only handle that survives the rewrite.
 */
export function landFocusOn(within: HTMLElement | undefined, iso: string): void {
	if (!within || iso === '') return;

	let tries = VALUE_TRIES;
	const step = () => {
		// Never stops early on a hit: the row that took focus can be replaced by the
		// rewrite still in flight, and the next frame has to put it back.
		const target = within.querySelector<HTMLElement>(`button[value="${iso}"]`);
		if (target && document.activeElement !== target) target.focus();
		tries = tries - 1;
		if (tries > 0) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}
