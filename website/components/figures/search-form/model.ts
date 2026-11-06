// The words the search-form figure shows and the sentences its live region speaks.
export const HANDLE = 'field';
export const CALL = 'field.focus()';
export const GONE = 'undefined';
export const BUTTON = 'Focus search';

export function describePress(present: boolean): string {
	return present
		? `Pressed ${BUTTON}. The handle field reached the real input, and the cursor is blinking in it.`
		: `Pressed ${BUTTON}, but the input is gone. field is undefined, so nothing got the focus.`;
}

export const describeToggle = (present: boolean) =>
	present ? 'The input is back on the page, and field points at it again.' : 'The input left the page. field now points at nothing: undefined.';
