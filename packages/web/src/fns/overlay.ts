/**
 * The overlay behaviour: the half of an elevated surface that the `overlay` mark
 * disclaims.
 *
 * There is no import surface. The bare `overlay` attribute is the whole API: the
 * compiler lowers it to `overlay=""` on the host, elevation is the CSS the
 * consumer writes against `[overlay]`, and this module reads stack membership
 * off that same attribute. Nothing here is called from authored code.
 *
 * What it does. A marked element joins the overlay stack when it BECOMES shown -
 * a transition out of `hidden` - and, at startup, when it is ALREADY shown and
 * its visibility is bound. Those two are the same rule: enlistment follows the
 * `hidden` binding, not the DOM state the element happened to be rendered in. An
 * element with no `hidden` binding at all - the inline shape - therefore never
 * enlists whatever it looks like, which is what will make a future `inline` mode
 * free. While enlisted the topmost element receives a `dismiss` event when
 * Escape is pressed or a press lands outside it, carrying `detail.reason` and,
 * for an outside press, the `detail.pressTarget` the press landed on.
 *
 * What it deliberately does not do. It never closes anything and never moves
 * focus. It does READ focus - `document.activeElement` at the moment an element
 * enlists is left on that element, because only this module is present at that
 * moment and a family restoring focus later cannot go back and look. Reading is
 * not moving: what to do with it is the family's. `dismiss` is a report, not an
 * action: the family reads it with an ordinary `onDismiss` handler and decides.
 * The one policy that is not the
 * family's to implement is modality, because it is document-wide and has to be
 * reference counted across nesting - so an enlisted element that the family
 * authored `aria-modal="true"` on takes the rest of the page out of reach and
 * locks the page's scroll, and gives both back when it leaves the stack.
 *
 * An enlisted element must still be attached when it hides. An element removed
 * from the document while it is on the stack leaves its background marks behind,
 * so families hide their surface rather than unmounting it. Teardown makes that
 * violation inevitable anyway - a navigation or a test unwind detaches whatever
 * was open - so the stack drops a detached entry the moment it would receive a
 * dismissal, and says so with a dev-build console.error naming the element.
 * Pruning is the repair, not the rule: without it the corpse is topmost and
 * every gesture aimed at the live surface underneath it disappears.
 *
 * A dismissal that finds nothing live to report to is not spent. It is left
 * primed for the next installation, the same way the resumer leaves the Escape
 * that woke a served-open page - a lost gesture is silent wrongness, while a
 * primer no page ever consumes costs nothing.
 */

import type {
	OverlayFocusOriginHost,
	OverlayHiddenBoundRoot,
	OverlayInstalledRoot,
	OverlayPrimedDismissalHost,
} from '../overlay-handoff.ts';

/** The DOM spelling the compiler lowers the `overlay` mark to. */
const OVERLAY_SELECTOR = '[overlay]';
const MODAL_SELECTOR = '[aria-modal="true"]';
const DISMISS_EVENT = 'dismiss';

export type OverlayDismissReason = 'escape' | 'outside-press';

/**
 * What a `dismiss` report carries.
 *
 * `pressTarget` is the element the press actually landed on, and it is present
 * only for `outside-press` - Escape has no target, so the key is absent rather
 * than undefined. Reporting where the press was is still not policy: whether a
 * press on the family's own trigger counts as a dismissal is the family's call,
 * and this is what lets it answer that by asking where rather than by timing how
 * soon.
 */
export type OverlayDismissDetail = {
	readonly reason: OverlayDismissReason;
	readonly pressTarget?: Element;
};

type OverlayEntry = {
	readonly element: HTMLElement;
	readonly undo: Array<() => void>;
};

/** A dismissal waiting for something live to report it to. */
type PrimedDismissal = {
	readonly reason: OverlayDismissReason;
	readonly pressTarget?: Element;
};

type BackgroundAttribute = 'inert' | 'aria-hidden';

// Topmost last. Every document-level decision reads only the last entry.
const stack: OverlayEntry[] = [];

// How many enlisted overlays have marked each background element, so a nested
// overlay leaving the stack cannot un-hide a background its parent still hides.
const markCounts: Record<BackgroundAttribute, WeakMap<Element, number>> = {
	inert: new WeakMap(),
	'aria-hidden': new WeakMap(),
};

// Backgrounds that already carried the attribute before any overlay enlisted.
// Those are the consumer's, and this module must leave them alone.
const authoredMarks: Record<BackgroundAttribute, WeakSet<Element>> = {
	inert: new WeakSet(),
	'aria-hidden': new WeakSet(),
};

let listeningDocument: Document | undefined;
let scrollLocks = 0;
let releaseScroll: (() => void) | undefined;

// Rides with the unkeyed primer, whose reason stays a plain string on the global
// so anything that clears the handoff clears this too.
let primedPressTarget: Element | undefined;

/**
 * Watch one rendered root for marked elements becoming shown.
 *
 * Returns a teardown, or `undefined` when the root carries no marked element -
 * the caller's own gate already asks that question, and answering it twice is
 * how a page with no overlay pays nothing.
 */
export function installOverlayBehavior(root: Element | Document): (() => void) | undefined {
	// Marked before the gates below, because every one of them means the same
	// thing to the inline primer: nothing further is coming for this root.
	(root as OverlayInstalledRoot).__marklessOverlayInstalled = true;
	if (!root.querySelector?.(OVERLAY_SELECTOR)) return undefined;
	const owner = ownerDocumentOf(root);
	const observerFactory = (
		globalThis as unknown as { readonly MutationObserver?: typeof MutationObserver }
	).MutationObserver;
	if (!observerFactory) return undefined;

	const observer = new observerFactory((records) => {
		for (const record of records) {
			if (record.attributeName !== 'hidden') continue;
			const element = record.target as HTMLElement;
			if (element.nodeType !== 1 || !element.matches?.(OVERLAY_SELECTOR)) continue;
			// The attribute's absence before the mutation is what "was shown" means.
			// Reading the property for the after-state instead keeps `until-found`
			// and any other non-empty value on the hidden side, where they belong.
			const wasShown = record.oldValue === null;
			const isShown = !element.hidden;
			if (wasShown === isShown) continue;
			if (isShown) enlist(element, owner);
			else release(element);
		}
	});
	observer.observe(root as Node, {
		attributes: true,
		attributeFilter: ['hidden'],
		attributeOldValue: true,
		subtree: true,
	});

	// A surface served open never flips, so the observer would never see it. The
	// runtime hands over the hosts whose `hidden` is bound; anything marked, in
	// that set, and currently shown is open BECAUSE its binding says so, which is
	// enlistment. An element outside the set looks identical in the DOM and is
	// left alone - that is the inline shape, and it stays free.
	for (const element of hiddenBoundSurfaces(root)) enlist(element, owner);

	// The Escape that woke this page arrived before there was anything to report
	// it to. Reporting it now, to whatever the enlistment above left topmost, is
	// what makes the FIRST press on a served-open page dismiss rather than the
	// second. Taken once: a page has one primer and one wake.
	replayPrimedDismissal(root);

	return () => {
		observer.disconnect();
		// Anything this root enlisted has to leave the stack with it, or the
		// document-wide marks it took outlive the page that took them.
		for (const entry of [...stack].reverse())
			if (root === entry.element || root.contains?.(entry.element)) release(entry.element);
	};
}

function ownerDocumentOf(root: Element | Document): Document {
	return (root as Element).ownerDocument ?? (root as Document);
}

function hiddenBoundSurfaces(root: Element | Document): ReadonlyArray<HTMLElement> {
	const bound = (root as OverlayHiddenBoundRoot).__marklessOverlayHiddenBound;
	if (!bound) return [];
	return bound.filter(
		(element): element is HTMLElement =>
			element.matches?.(OVERLAY_SELECTOR) === true && (element as HTMLElement).hidden !== true,
	);
}

/** Hand this root whatever gesture was swallowed before it could be reported. */
function replayPrimedDismissal(root: Element | Document): void {
	const host = root as OverlayPrimedDismissalHost;
	const keyed = host.__marklessOverlayPrimedDismissal;
	if (keyed) host.__marklessOverlayPrimedDismissal = undefined;
	const primed: PrimedDismissal | undefined = keyed ? { reason: keyed } : takePrimedDismissal();
	if (!primed) return;
	const top = liveTop();
	// An unkeyed replay goes back rather than being eaten by a root with nothing
	// of its own live.
	if (!top) {
		if (!keyed) primeDismissal(primed);
		return;
	}
	// The press that woke a served-open page usually landed INSIDE it, and nothing
	// was on the stack to ask when it did.
	if (primed.pressTarget && top.element.contains(primed.pressTarget)) return;
	reportDismiss(top.element, primed.reason, primed.pressTarget);
}

function takePrimedDismissal(): PrimedDismissal | undefined {
	const host = globalThis as OverlayPrimedDismissalHost;
	const reason = host.__marklessOverlayPrimedDismissal;
	if (!reason) return undefined;
	host.__marklessOverlayPrimedDismissal = undefined;
	const pressTarget = primedPressTarget;
	primedPressTarget = undefined;
	return pressTarget ? { reason, pressTarget } : { reason };
}

function primeDismissal(primed: PrimedDismissal): void {
	(globalThis as OverlayPrimedDismissalHost).__marklessOverlayPrimedDismissal = primed.reason;
	primedPressTarget = primed.pressTarget;
}

/** The topmost entry still in the document, dropping the dead ones on the way. */
function liveTop(): OverlayEntry | undefined {
	for (let index = stack.length - 1; index >= 0; index -= 1) {
		const entry = stack[index];
		if (!entry) continue;
		if (entry.element.isConnected) return entry;
		reportDetachedEntry(entry.element);
		release(entry.element);
	}
	return undefined;
}

function reportDetachedEntry(element: HTMLElement): void {
	if (!import.meta.env?.DEV) return;
	console.error(
		'markless: an overlay element was removed from the document while it was still enlisted, so it was dropped from the overlay stack. An enlisted element must still be attached when it hides - hide the surface instead of unmounting it.',
		element,
	);
}

function enlist(element: HTMLElement, owner: Document): void {
	if (findEntry(element)) return;
	const entry: OverlayEntry = { element, undo: [] };
	stack.push(entry);

	// Read before anything below marks the background: marking makes the subtree
	// the focused element sits in inert, which blurs it, so asking afterwards
	// answers the body on exactly the pages a family needs this for.
	const active = owner.activeElement;
	if (active) (element as OverlayFocusOriginHost).__marklessOverlayFocusOrigin = active;

	// Modality is derived, never configured: the family authored `aria-modal` and
	// this module reads it. The mark and `aria-modal` sit on different elements in
	// the shape a modal actually needs - `<backdrop overlay><content role="dialog"
	// aria-modal="true">` - because the backdrop is what elevates while the dialog
	// role belongs to the content, so the test reads the enlisted element or its
	// subtree. Anything else - what closes, where focus lands - stays the family's
	// own handler.
	if (element.matches?.(MODAL_SELECTOR) || element.querySelector(MODAL_SELECTOR)) {
		entry.undo.push(hideBackground(element));
		entry.undo.push(lockScroll(owner));
	}
	listen(owner);
}

function release(element: HTMLElement): void {
	const entry = findEntry(element);
	if (!entry) return;
	const index = stack.indexOf(entry);
	if (index >= 0) stack.splice(index, 1);
	for (const undo of entry.undo.reverse()) undo();
	entry.undo.length = 0;
	if (stack.length === 0) stopListening();
}

function findEntry(element: HTMLElement): OverlayEntry | undefined {
	return stack.find((entry) => entry.element === element);
}

function reportDismiss(
	element: HTMLElement,
	reason: OverlayDismissReason,
	pressTarget?: Element,
): void {
	// Built conditionally so Escape's detail has no `pressTarget` key at all: a
	// key set to undefined still answers `in`, and absence is the contract.
	const detail: OverlayDismissDetail = pressTarget ? { reason, pressTarget } : { reason };
	// Not bubbling: a nested surface's dismissal is not its parent's. The
	// framework's own dispatch reaches the handler through the container's
	// capture listener, which a non-bubbling event still passes through.
	element.dispatchEvent(
		new CustomEvent<OverlayDismissDetail>(DISMISS_EVENT, {
			bubbles: false,
			cancelable: true,
			detail,
		}),
	);
}

/* Background modality, after Base UI's markOthers
   (packages/react/src/floating-ui-react/utils/markOthers.ts): keep the chain of
   ancestors down to the surface, mark every subtree beside it, count the marks
   so nesting unwinds cleanly, and leave live regions announceable. */

function hideBackground(surface: HTMLElement): () => void {
	const outside: Element[] = [];
	const body = surface.ownerDocument.body;
	if (body) collectOutsideSubtrees(body, surface, outside);

	const undo: Array<() => void> = [];
	for (const element of outside) {
		undo.push(mark(element, 'inert'));
		undo.push(mark(element, 'aria-hidden'));
	}
	return () => {
		for (const step of undo) step();
	};
}

function collectOutsideSubtrees(parent: Element, surface: Element, outside: Element[]): void {
	for (const child of Array.from(parent.children)) {
		if (child === surface) continue;
		if (child.contains(surface)) {
			collectOutsideSubtrees(child, surface, outside);
			continue;
		}
		if (child.tagName === 'SCRIPT') continue;
		// A live region behind a modal still has to announce, so it is neither
		// marked nor descended into; a subtree holding one is descended into so
		// the region survives while its siblings are marked.
		if (child.hasAttribute('aria-live')) continue;
		if (holdsLiveRegion(child)) {
			collectOutsideSubtrees(child, surface, outside);
			continue;
		}
		outside.push(child);
	}
}

function holdsLiveRegion(element: Element): boolean {
	for (const child of Array.from(element.children)) {
		if (child.hasAttribute('aria-live') || holdsLiveRegion(child)) return true;
	}
	return false;
}

function mark(element: Element, attribute: BackgroundAttribute): () => void {
	const counts = markCounts[attribute];
	const count = (counts.get(element) ?? 0) + 1;
	counts.set(element, count);

	if (count === 1) {
		const authored = element.getAttribute(attribute);
		if (authored !== null && authored !== 'false') authoredMarks[attribute].add(element);
		else element.setAttribute(attribute, attribute === 'inert' ? '' : 'true');
	}

	return () => {
		const remaining = (counts.get(element) ?? 1) - 1;
		counts.set(element, remaining);
		if (remaining > 0) return;
		if (authoredMarks[attribute].has(element)) authoredMarks[attribute].delete(element);
		else element.removeAttribute(attribute);
	};
}

/* Scroll */

function lockScroll(owner: Document): () => void {
	scrollLocks += 1;
	if (scrollLocks === 1) {
		const body = owner.body;
		const overflow = body.style.overflow;
		const paddingRight = body.style.paddingRight;
		const view = owner.defaultView;
		const scrollbar = view ? view.innerWidth - owner.documentElement.clientWidth : 0;
		const padding = view ? Number.parseFloat(view.getComputedStyle(body).paddingRight) || 0 : 0;

		body.style.overflow = 'hidden';
		// Hiding the scrollbar makes the page wider; paying the difference back as
		// padding is what stops the content jumping sideways.
		if (scrollbar > 0) body.style.paddingRight = `${padding + scrollbar}px`;

		releaseScroll = () => {
			body.style.overflow = overflow;
			body.style.paddingRight = paddingRight;
		};
	}

	return () => {
		scrollLocks -= 1;
		if (scrollLocks > 0) return;
		releaseScroll?.();
		releaseScroll = undefined;
	};
}

/* Document listeners, added only while something is enlisted */

function listen(owner: Document): void {
	if (listeningDocument === owner) return;
	stopListening();
	owner.addEventListener('keydown', onKeyDown, true);
	owner.addEventListener('pointerdown', onPointerDown, true);
	listeningDocument = owner;
}

function stopListening(): void {
	if (!listeningDocument) return;
	listeningDocument.removeEventListener('keydown', onKeyDown, true);
	listeningDocument.removeEventListener('pointerdown', onPointerDown, true);
	listeningDocument = undefined;
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || event.defaultPrevented) return;
	const top = liveTop();
	// Escape is reported to the topmost element and nothing below it, so a nested
	// surface's handler answers for it rather than every open surface at once.
	if (top) reportDismiss(top.element, 'escape');
	else primeDismissal({ reason: 'escape' });
}

function onPointerDown(event: Event): void {
	const top = liveTop();
	const target = event.target;
	const pressTarget = target instanceof Element ? target : undefined;
	if (!top) {
		primeDismissal({ reason: 'outside-press', pressTarget });
		return;
	}
	if (target instanceof Node && top.element.contains(target)) return;
	// The report is made on the press, not the click, so a drag that starts
	// inside the surface and ends outside it never counts as an outside press.
	// The pressed element rides along, so a family can tell a press on its own
	// trigger from an unrelated one by asking where it landed.
	reportDismiss(top.element, 'outside-press', pressTarget);
}
