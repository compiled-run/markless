/** The focus moves the family owns. */

type Days = ReadonlyArray<HTMLElement> | undefined;

export function landFocus(target: HTMLElement | undefined): void {
	target?.focus();
}

/** Land focus on the day holding one date, read off the family's own day handles; false when no day holds it yet. */
export function landFocusOn(days: () => Days, iso: string): boolean {
	if (iso === '') return false;
	const day = dayWithValue(days(), iso);
	day?.focus();
	return day !== undefined;
}

/** The day button carrying one date, out of the handle set the family binds. */
export function dayWithValue(days: Days, iso: string): HTMLElement | undefined {
	return days?.find((day) => day.getAttribute('value') === iso);
}
