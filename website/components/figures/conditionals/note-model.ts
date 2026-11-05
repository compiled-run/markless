// The Conditionals figure's values: how far a note must travel to reach the bin, how much it holds, and what the live region says.
export const BIN_REACH = 220;
export const MAX_TEXT = 12;

export const addLetter = (text: string, key: string) => text + key;

export function describeNote(what: 'open' | 'binned'): string {
	return what === 'binned'
		? 'The note is gone, and what you wrote went with it. The sheet underneath is bare.'
		: 'A fresh, blank note is built on the sheet.';
}

export const WRITE_FIRST = 'Write on the note first? Drag it again to throw it away.';

/** True when a pointer landed on the note's little cross. */
export const onClose = (target: unknown) => Boolean((target as Element | null)?.closest?.('.close'));
