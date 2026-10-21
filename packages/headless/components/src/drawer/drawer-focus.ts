/** The two focus moves the overlay behaviour deliberately leaves to the family. */

/**
 * Land focus in the drawer, on an element inside it (APG dialog pattern).
 *
 * The title is the static element at the top of the content the APG names for
 * this: a reader announces the dialog it has entered, then the heading. The
 * first control would mean asking the DOM for focusable descendants, which the
 * library never does. A drawer with no title part falls back to the surface,
 * which carries `tabindex="-1"`; either holder keeps the snap-point arrows in reach.
 */
export function focusIntoSurface(
	content: HTMLElement | undefined,
	title: HTMLElement | undefined,
): void {
	(title ?? content)?.focus();
}

/**
 * Where the overlay behaviour left the focus the page had when the surface
 * enlisted.
 *
 * The property is `__marklessOverlayFocusOrigin` in
 * `packages/web/src/overlay-handoff.ts`, restated here only because
 * `@markless/ui` does not depend on `@markless/web`.
 */
type OverlayFocusOriginHost = {
	__marklessOverlayFocusOrigin?: Element;
};

/**
 * Hand focus back to whatever opened the drawer.
 *
 * Two openers, two answers. A trigger press is the one the family saw happen, so
 * the trigger wins outright - a synthetic press does not focus the button it
 * presses, and the captured reading on that path would be the body. Anything else
 * opened it without telling the family, and the only record of what the page was
 * on is the reading the overlay behaviour took when the surface enlisted.
 */
export function focusBackToOpener(
	trigger: HTMLElement | undefined,
	surface: HTMLElement | undefined,
	isTriggerOpened: boolean,
): void {
	const target = isTriggerOpened ? trigger : capturedOpener(surface);
	target?.focus();
}

function capturedOpener(surface: HTMLElement | undefined): HTMLElement | undefined {
	const captured = (surface as OverlayFocusOriginHost | undefined)?.__marklessOverlayFocusOrigin;
	// The body is what `document.activeElement` answers when nothing on the page
	// held focus, and putting focus on the body is not restoring it.
	return captured instanceof HTMLElement && captured !== captured.ownerDocument.body
		? captured
		: undefined;
}
