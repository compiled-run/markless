// The Conditionals page's note-panel demo: the words it shows and reads out.
export const times = (count: number): string => (count === 1 ? '1 time' : count + ' times');

/** The sentence a screen reader hears after the panel opens or closes. */
export const describePanel = (open: boolean, note: string, built: number): string =>
	(open ? `The field is on the page, built ${times(built)}.` : 'The field is gone from the page.') +
	` The note still holds ${note === '' ? 'nothing' : '"' + note + '"'}.`;
