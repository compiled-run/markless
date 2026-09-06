// The keycaps every family's keyboard rows are built from. A key is authored
// once here in both forms - what a Mac keyboard prints and what everything else
// prints - and always with the plain word a screen reader should say, because a
// lone glyph announces as nothing useful.

/** One key as it is drawn and as it is spoken. */
export type KeyForm = {
	/** What the keycap shows: a glyph where the keyboard prints one, else the word. */
	readonly symbol: string;
	/** The plain word, always present, and what `aria-label` carries. */
	readonly label: string;
};

/** One key in both platform forms. Most keys print the same thing on both. */
export type KeyCap = { readonly mac: KeyForm; readonly other: KeyForm };

/** Which keyboard the caps are drawn for. The server has no user agent, so it draws `other`. */
export type KeyPlatform = 'mac' | 'other';

function same(symbol: string, label: string): KeyCap {
	const form = { symbol, label };
	return { mac: form, other: form };
}

function split(macSymbol: string, macLabel: string, otherSymbol: string, otherLabel: string): KeyCap {
	return { mac: { symbol: macSymbol, label: macLabel }, other: { symbol: otherSymbol, label: otherLabel } };
}

export const keys = {
	enter: split('⏎', 'Enter', 'Enter', 'Enter'),
	space: split('␣', 'Space', 'Space', 'Space'),
	tab: split('⇥', 'Tab', 'Tab', 'Tab'),
	escape: split('⎋', 'Escape', 'Esc', 'Escape'),
	backspace: split('⌫', 'Backspace', 'Backspace', 'Backspace'),
	del: same('Delete', 'Delete'),
	up: same('↑', 'Up arrow'),
	down: same('↓', 'Down arrow'),
	left: same('←', 'Left arrow'),
	right: same('→', 'Right arrow'),
	home: same('Home', 'Home'),
	end: same('End', 'End'),
	pageUp: same('Page Up', 'Page Up'),
	pageDown: same('Page Down', 'Page Down'),
	shift: split('⇧', 'Shift', 'Shift', 'Shift'),
	// The chord modifier a platform actually uses, which is Command on a Mac and Control elsewhere.
	mod: split('⌘', 'Command', 'Ctrl', 'Control'),
	option: split('⌥', 'Option', 'Alt', 'Alt'),
	control: split('⌃', 'Control', 'Ctrl', 'Control'),
} as const satisfies Readonly<Record<string, KeyCap>>;

export type KeyName = keyof typeof keys;

/** The form to draw for a platform. */
export function formFor(cap: KeyCap, platform: KeyPlatform): KeyForm {
	return platform === 'mac' ? cap.mac : cap.other;
}
