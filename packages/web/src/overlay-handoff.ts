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

import type { OverlayDismissReason } from './fns/overlay.ts';

export type OverlayHiddenBoundRoot = {
	/**
	 * Every element in this root whose `hidden` attribute is written by a payload
	 * record. Set by the runtime immediately before the installer runs; absent for
	 * a root that resumed without one, which the behaviour reads as "no element
	 * here is hidden-bound".
	 */
	__marklessOverlayHiddenBound?: ReadonlyArray<Element>;
};

/**
 * Where an enlisted element carries the focus the page had when it enlisted.
 *
 * The behaviour captures and never moves: this is the reading, not a decision.
 * A family restoring focus when its surface closes reads it off the element it
 * marked, because the close paths that need it are not all dismissals - a close
 * button and a completed backdrop press are the family's own handlers, and a
 * `dismiss` detail cannot reach either. It is a property rather than an export
 * because `@markless/ui` does not depend on `@markless/web`.
 *
 * Written at enlist, BEFORE the background is marked: marking blurs whatever is
 * inside a subtree that becomes inert, so reading afterwards would answer the
 * body on exactly the pages this exists for. Never cleared - a family restores
 * focus after the surface is already off the stack.
 */
export type OverlayFocusOriginHost = {
	__marklessOverlayFocusOrigin?: Element;
};

/**
 * A gesture swallowed before there was anything to report it to, left on
 * whatever swallowed it.
 *
 * On a ROOT it is the Escape that root's own inline resumer took: a page served
 * with an open overlay has nothing listening until the runtime wakes and the
 * behaviour installs, and the first press is what wakes it, so that press would
 * be spent on the waking and dismiss nothing. Keyed to the root because a second
 * root installing in the same tick would otherwise report one root's press to
 * the other's surface.
 *
 * On `globalThis` it is the document's: a dismissal the behaviour heard with
 * nothing live left on the stack to report it to. That one belongs to no root,
 * so the next installation takes it. Either way it is taken once.
 */
export type OverlayPrimedDismissalHost = {
	__marklessOverlayPrimedDismissal?: OverlayDismissReason;
};

/**
 * Whether the overlay behaviour has been installed for this root.
 *
 * The distinction the inline primer needs, and the only one that says whether
 * anything is listening: a wake that has STARTED is a dynamic import in flight,
 * and the document listener that reports Escape does not exist until that import
 * lands. A press arriving in between belongs to the primer, not to a behaviour
 * that is not there yet.
 */
export type OverlayInstalledRoot = {
	__marklessOverlayInstalled?: boolean;
};
