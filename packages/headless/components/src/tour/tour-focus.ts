/** The two focus moves the overlay behaviour leaves to the family. */

/**
 * Land focus on the step's card.
 *
 * The card itself takes it, not the first control inside it: naming that control
 * would mean asking the DOM for the card's focusable descendants, which the
 * library does not do. The card carries `tabindex="-1"` so it can hold it.
 */
export function focusIntoCard(cards: readonly HTMLElement[], at: number): void {
	cards[at]?.focus();
}

/**
 * Where the overlay behaviour left the focus the page had when the card
 * enlisted. The property is `__marklessOverlayFocusOrigin` in
 * `packages/web/src/overlay-handoff.ts`, restated here only because
 * `@markless/ui` does not depend on `@markless/web`.
 */
type OverlayFocusOriginHost = {
	__marklessOverlayFocusOrigin?: Element;
};

/**
 * Hand focus back when the tour closes.
 *
 * The step's target wins if it can hold focus, because that is the thing the
 * tour was talking about and the person is already looking at it. The family
 * never makes a target focusable to earn this - a `tabindex` written on a
 * consumer's element is one more thing to leak.
 */
export function focusBackToTarget(
	target: HTMLElement | undefined,
	cards: readonly HTMLElement[],
	at: number,
): void {
	if (target && target.tabIndex >= 0) return target.focus();
	capturedOpener(cards[at])?.focus();
}

function capturedOpener(card: HTMLElement | undefined): HTMLElement | undefined {
	const captured = (card as OverlayFocusOriginHost | undefined)?.__marklessOverlayFocusOrigin;
	// The body is what `document.activeElement` answers when nothing on the page
	// held focus - a tour the server sent open is the ordinary case - and putting
	// focus on the body is not restoring it, so nothing moves.
	return captured instanceof HTMLElement && captured !== captured.ownerDocument.body
		? captured
		: undefined;
}
