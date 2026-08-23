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
 * a transition out of `hidden`, never the state it was rendered in. An element
 * shown at first render therefore never enlists, which is what will make a future
 * `inline` mode free; an element rendered hidden and later shown enlists on that
 * first flip. While enlisted the topmost element receives a `dismiss` event when
 * Escape is pressed or a press lands outside it, carrying `detail.reason`.
 *
 * What it deliberately does not do. It never closes anything and never moves
 * focus. `dismiss` is a report, not an action: the family reads it with an
 * ordinary `onDismiss` handler and decides. The one policy that is not the
 * family's to implement is modality, because it is document-wide and has to be
 * reference counted across nesting - so an enlisted element that the family
 * authored `aria-modal="true"` on takes the rest of the page out of reach and
 * locks the page's scroll, and gives both back when it leaves the stack.
 *
 * An enlisted element must still be attached when it hides. An element removed
 * from the document while it is on the stack leaves its background marks behind,
 * so families hide their surface rather than unmounting it.
 */

/** The DOM spelling the compiler lowers the `overlay` mark to. */
const OVERLAY_SELECTOR = '[overlay]';
const MODAL_SELECTOR = '[aria-modal="true"]';
const DISMISS_EVENT = 'dismiss';

export type OverlayDismissReason = 'escape' | 'outside-press';

type OverlayEntry = {
	readonly element: HTMLElement;
	readonly undo: Array<() => void>;
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

/**
 * Watch one rendered root for marked elements becoming shown.
 *
 * Returns a teardown, or `undefined` when the root carries no marked element -
 * the caller's own gate already asks that question, and answering it twice is
 * how a page with no overlay pays nothing.
 */
export function installOverlayBehavior(root: Element | Document): (() => void) | undefined {
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

function enlist(element: HTMLElement, owner: Document): void {
	if (findEntry(element)) return;
	const entry: OverlayEntry = { element, undo: [] };
	stack.push(entry);

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

function reportDismiss(element: HTMLElement, reason: OverlayDismissReason): void {
	// Not bubbling: a nested surface's dismissal is not its parent's. The
	// framework's own dispatch reaches the handler through the container's
	// capture listener, which a non-bubbling event still passes through.
	element.dispatchEvent(
		new CustomEvent(DISMISS_EVENT, { bubbles: false, cancelable: true, detail: { reason } }),
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
	const top = stack[stack.length - 1];
	// Escape is reported to the topmost element and nothing below it, so a nested
	// surface's handler answers for it rather than every open surface at once.
	if (top) reportDismiss(top.element, 'escape');
}

function onPointerDown(event: Event): void {
	const top = stack[stack.length - 1];
	if (!top) return;
	const target = event.target;
	if (target instanceof Node && top.element.contains(target)) return;
	// The report is made on the press, not the click, so a drag that starts
	// inside the surface and ends outside it never counts as an outside press.
	reportDismiss(top.element, 'outside-press');
}
