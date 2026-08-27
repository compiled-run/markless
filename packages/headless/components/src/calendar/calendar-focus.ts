/** The focus moves the family owns. */

type Days = ReadonlyArray<HTMLElement> | undefined;

// A month change replaces every day row, and the runtime mints the replacements
// during the flush rather than on the write, so the new day does not exist yet
// when the handler that caused the change returns.
const VALUE_TRIES = 30;

export function landFocus(target: HTMLElement | undefined): void {
	target?.focus();
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
