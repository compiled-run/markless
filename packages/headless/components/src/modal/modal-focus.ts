/**
 * The two focus moves the overlay behaviour deliberately leaves to the family.
 *
 * Both are retried per frame rather than done on the call: the surface is still
 * `hidden` when the opening handler runs, and the invoker is still `inert` when
 * the closing one does, so neither target can take focus yet. The retry gives
 * up rather than spinning.
 */

const TRIES = 12;

function land(target: HTMLElement | undefined): void {
	if (!target) return;

	let tries = TRIES;
	const step = () => {
		if (document.activeElement === target) return;
		target.focus();
		tries = tries - 1;
		if (tries > 0 && document.activeElement !== target) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}

/**
 * Land focus in the dialog.
 *
 * The surface itself takes it, not the first control inside it. Naming that
 * control would mean asking the DOM for the surface's focusable descendants,
 * and the library selects no DOM nodes. An alert is the exception the ruling
 * names: it prefers its close control, which is a part and so has a handle.
 */
export function focusIntoSurface(
	content: HTMLElement | undefined,
	close: HTMLElement | undefined,
	isAlert: boolean,
): void {
	if (isAlert && close) return land(close);
	land(content);
}

/**
 * Where the overlay behaviour left the focus the page had when the surface
 * enlisted.
 *
 * The property is `__marklessOverlayFocusOrigin` in
 * `packages/web/src/overlay-handoff.ts`, restated here only because
 * `@markless/ui` does not depend on `@markless/web`; see note.md.
 */
type OverlayFocusOriginHost = {
	__marklessOverlayFocusOrigin?: Element;
};

/**
 * Hand focus back to whatever opened the dialog.
 *
 * Two openers, two answers, exactly as ruled. A trigger press is the one the
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
	land(isTriggerOpened ? trigger : capturedOpener(surface));
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
