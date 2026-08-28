/** The two focus moves the overlay behaviour deliberately leaves to the family. */

/**
 * Land focus in the dialog.
 *
 * The surface itself takes it, not the first control inside it. Naming that
 * control would mean asking the DOM for the surface's focusable descendants,
 * and the library selects no DOM nodes. An alert is the exception: it prefers its close control, which is a part and so has a handle.
 */
export function focusIntoSurface(
	content: HTMLElement | undefined,
	close: HTMLElement | undefined,
	isAlert: boolean,
): void {
	if (isAlert && close) return close.focus();
	content?.focus();
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
 * Hand focus back to whatever opened the dialog.
 *
 * Two openers, two answers. A trigger press is the one the
 * family saw happen, so the trigger wins outright - a synthetic press does not
 * focus the button it presses, and the captured reading on that path would be
 * the body. Anything else opened it without telling the family, and the only
 * record of what the page was on is the reading the overlay behaviour took when
 * the surface enlisted.
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
	// held focus - a dialog the server sent open is the ordinary case - and
	// putting focus on the body is not restoring it, so nothing moves.
	return captured instanceof HTMLElement && captured !== captured.ownerDocument.body
		? captured
		: undefined;
}
