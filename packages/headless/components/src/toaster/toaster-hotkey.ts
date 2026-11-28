// Where focus was when F8 moved it into the region; an element, so it lives in this module rather than in state.
let opener: Element | null = null;

/** Remembers where focus was before the region takes it, unless it was already inside. */
export function rememberOpener(active: Element | null, isInside: boolean): void {
	if (!isInside) opener = active;
}

/** Hands focus back to where it was before the region took it. */
export function restoreOpener(): void {
	const back = opener;
	opener = null;
	if (back instanceof HTMLElement) back.focus();
}
