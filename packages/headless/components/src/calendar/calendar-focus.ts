/**
 * The two focus moves the family owns, both retried per frame.
 *
 * A popup's content is still `hidden` when the trigger's handler runs, and the
 * day the keyboard just walked onto may not carry its new date until the render
 * that follows the handler. Neither target can take focus on the call, so the
 * move is retried and then gives up rather than spinning. `modal-focus.ts` found
 * this first; the shape is its.
 */

const TRIES = 12;

export function landFocus(target: HTMLElement | undefined): void {
	if (!target) return;

	let tries = TRIES;
	const step = () => {
		if (document.activeElement === target) return;
		target.focus();
		tries = tries - 1;
		if (tries > 0 && document.activeElement !== target) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}

/**
 * Land focus on one day of the grid, chosen by where it sits rather than by what
 * it holds: the 42 elements keep their places while a month change rewrites every
 * date on them, so the position is what is knowable at the moment of the move.
 */
export function landFocusAt(days: HTMLElement[] | undefined, at: number): void {
	if (!days || at < 0) return;
	landFocus(days[at]);
}
