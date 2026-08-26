/**
 * The focus moves the family owns, both retried per frame.
 *
 * A popup's content is still `hidden` when the trigger's handler runs, and the
 * day the keyboard just walked onto may not carry its new date until the render
 * that follows the handler. Neither target can take focus on the call, so the
 * move is retried and then gives up rather than spinning. `modal-focus.ts` found
 * this first; the shape is its.
 */

type Days = ReadonlyArray<HTMLElement> | undefined;

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
 * Land focus on the day holding one date, re-read every frame off the family's
 * own day handles: a month change detaches the element a caller could have
 * captured, so the date is the only handle that survives the rewrite.
 */
export function landFocusOn(days: () => Days, iso: string): void {
	if (iso === '') return;

	let tries = VALUE_TRIES;
	// The element, not a flag: the rewrite in flight replaces the day carrying this
	// date, and the replacement has to be taken too.
	let landed: HTMLElement | undefined;
	const step = () => {
		const target = dayWithValue(days(), iso);
		if (target) {
			const active = document.activeElement;
			// Body is nobody - the rewrite detaches the focused day and drops focus
			// there. Any other holder is a person, and the move gives way to them.
			const isTakenByHand = landed === target && active !== null && active !== document.body;
			if (active === target) landed = target;
			else if (isTakenByHand) return;
			else target.focus();
		}
		tries = tries - 1;
		if (tries > 0) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}

/** The day button carrying one date, out of the handle set the family binds. */
export function dayWithValue(days: Days, iso: string): HTMLElement | undefined {
	return days?.find((day) => day.getAttribute('value') === iso);
}
