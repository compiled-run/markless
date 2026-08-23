/**
 * The one fact the overlay behaviour cannot read off the served DOM, and where
 * the runtime leaves it.
 *
 * An element shown at first render has two possible reasons, and the served HTML
 * spells them identically - `<div overlay>` with no `hidden` attribute either
 * way. One is "nothing gates this at all", the inline shape, which must never
 * join the stack. The other is "its `hidden` binding is currently false", a
 * surface served open, which must. Only the payload separates them: a `hidden`
 * attribute update names exactly the hosts whose visibility is bound.
 *
 * The handoff rides on the root element rather than a parameter because the
 * app's own emitted installer forwards the root and nothing else, and rather
 * than a second global because the root is already the thing both sides hold.
 * This module is types only, so naming the property costs no bytes anywhere.
 */
export type OverlayHiddenBoundRoot = {
	/**
	 * Every element in this root whose `hidden` attribute is written by a payload
	 * record. Set by the runtime immediately before the installer runs; absent for
	 * a root that resumed without one, which the behaviour reads as "no element
	 * here is hidden-bound".
	 */
	__marklessOverlayHiddenBound?: ReadonlyArray<Element>;
};
