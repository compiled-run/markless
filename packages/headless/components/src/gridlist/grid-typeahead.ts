/**
 * Typeahead as arithmetic over a buffer and a clock reading. Nothing here holds
 * a timer: the buffer is aged by comparing the two timestamps it is handed, so
 * a page that resumes has no outstanding timeout to reconcile.
 */

/** How long a buffer keeps growing before the next letter starts a fresh search. */
export const TYPEAHEAD_WINDOW_MS = 750;

/** The search a keystroke makes: a fresh letter once the window has lapsed. */
export function nextSearch(buffer: string, since: number, now: number, key: string): string {
	return (now - since > TYPEAHEAD_WINDOW_MS ? key : buffer + key).toLowerCase();
}

/**
 * Whether a keystroke is one a typeahead takes at all. Space is excluded because
 * it is the selection key, and a modified key is a shortcut rather than a letter.
 */
export function isSearchKey(key: string, ctrl: boolean, meta: boolean, alt: boolean): boolean {
	return key.length === 1 && key !== ' ' && !ctrl && !meta && !alt;
}

/**
 * Where the search lands, or -1. A single letter starts the walk after the row
 * under focus, so pressing it again steps through the rows that share it; a
 * grown buffer starts on that row, so the search that just matched it still does.
 */
export function matchAt(labels: readonly string[], at: number, search: string): number {
	if (labels.length === 0 || search === '') return -1;
	const from = search.length > 1 ? at : at + 1;
	for (let step = 0; step < labels.length; step++) {
		const index = (((from + step) % labels.length) + labels.length) % labels.length;
		if (labels[index]?.startsWith(search)) return index;
	}
	return -1;
}
