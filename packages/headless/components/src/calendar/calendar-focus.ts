/** The focus moves the family owns. */

type Days = ReadonlyArray<HTMLElement> | undefined;

export function landFocus(target: HTMLElement | undefined): void {
	target?.focus();
}

/** Land focus on the day holding one date, read off the family's own day handles. */
export function landFocusOn(days: () => Days, iso: string): void {
	if (iso === '') return;
	dayWithValue(days(), iso)?.focus();
}

/** The day button carrying one date, out of the handle set the family binds. */
export function dayWithValue(days: Days, iso: string): HTMLElement | undefined {
	return days?.find((day) => day.getAttribute('value') === iso);
}
