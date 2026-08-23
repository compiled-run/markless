/**
 * The overlay primitive: the behaviour half of an elevated surface.
 *
 * Elevation itself is not here. The compiler's `overlay` mark owns elevation and
 * says so in its own doc comment ("Elevation only - no dismissal, focus,
 * positioning, ARIA, or animation policy rides on this record"), and the owner
 * has ruled that positioning stays CSS. Everything this module does is the half
 * that mark disclaims: a stack, dismissal, focus, aria modality, scroll.
 *
 * Two rules the families that wrap this must keep.
 *
 * A surface must still be attached when it closes. An element in the overlay
 * stack that is removed from the document leaves its background marks behind,
 * so the family hides its surface rather than unmounting it.
 *
 * The surface and the trigger arrive as element() handles, never as selectors.
 * A handle can be `undefined` - that is what `element()` resolves to before its
 * host renders - so both entry points take `Element | undefined` and report
 * whether they acted.
 */

export type OverlayKind = 'modal' | 'disclosure';

export type OverlayDismissReason = 'escape' | 'outside-interaction';

export type OverlayOptions = {
	/**
	 * `modal` takes the rest of the page out of reach and contains focus.
	 * `disclosure` leaves the page usable and closes on an outside press.
	 */
	readonly kind: OverlayKind;
	/** The element that opened the surface. A press on it is not "outside". */
	readonly trigger?: Element | undefined;
	/** Where focus goes on open. Defaults to the surface itself. */
	readonly initialFocus?: Element | undefined;
	/** Where focus goes on close. Defaults to whatever had focus on open. */
	readonly finalFocus?: Element | undefined;
	/** Called when the primitive closed the surface itself. */
	readonly onDismiss?: ((reason: OverlayDismissReason) => void) | undefined;
};

type OverlayEntry = {
	readonly element: HTMLElement;
	readonly kind: OverlayKind;
	readonly trigger: Element | undefined;
	readonly onDismiss: ((reason: OverlayDismissReason) => void) | undefined;
	readonly restoreFocusTo: Element | undefined;
	readonly undo: Array<() => void>;
};

type BackgroundAttribute = 'inert' | 'aria-hidden';

// Topmost last. Every document-level decision reads only the last entry.
const stack: OverlayEntry[] = [];

// How many open overlays have marked each background element, so a nested
// overlay closing cannot un-hide a background its parent still hides.
const markCounts: Record<BackgroundAttribute, WeakMap<Element, number>> = {
	inert: new WeakMap(),
	'aria-hidden': new WeakMap(),
};

// Backgrounds that already carried the attribute before any overlay opened.
// Those are the consumer's, and the primitive must leave them alone.
const authoredMarks: Record<BackgroundAttribute, WeakSet<Element>> = {
	inert: new WeakSet(),
	'aria-hidden': new WeakSet(),
};

let listeningDocument: Document | undefined;
let scrollLocks = 0;
let releaseScroll: (() => void) | undefined;

export function openOverlay(surface: Element | undefined, options: OverlayOptions): boolean {
	const element = asHtmlElement(surface);
	if (!element) return false;
	if (findEntry(element)) return true;

	const owner = element.ownerDocument;
	const entry: OverlayEntry = {
		element,
		kind: options.kind,
		trigger: options.trigger,
		onDismiss: options.onDismiss,
		restoreFocusTo: options.finalFocus ?? owner.activeElement ?? undefined,
		undo: [],
	};

	// Focus cannot enter a hidden surface, and the family's own `hidden` binding
	// may not have landed yet. Opening means shown, so say so first.
	if (element.hidden) element.hidden = false;

	stack.push(entry);

	if (entry.kind === 'modal') {
		entry.undo.push(hideBackground(element));
		entry.undo.push(setAttributeWhileOpen(element, 'aria-modal', 'true'));
		entry.undo.push(lockScroll(owner));
	}

	moveFocusInto(entry, options.initialFocus);
	listen(owner);
	return true;
}

export function closeOverlay(surface: Element | undefined): boolean {
	const element = asHtmlElement(surface);
	if (!element) return false;
	const entry = findEntry(element);
	if (!entry) return false;
	release(entry);
	return true;
}

export function isOverlayOpen(surface: Element | undefined): boolean {
	const element = asHtmlElement(surface);
	return element !== undefined && findEntry(element) !== undefined;
}

function release(entry: OverlayEntry): void {
	const wasTopmost = stack[stack.length - 1] === entry;
	const index = stack.indexOf(entry);
	if (index >= 0) stack.splice(index, 1);

	for (const undo of entry.undo.reverse()) undo();
	entry.undo.length = 0;

	// Only the topmost surface may take focus back. Closing a surface underneath
	// an open one must not pull focus out of the one the person is using.
	if (wasTopmost) restoreFocus(entry);
	if (stack.length === 0) stopListening();
}

function dismiss(entry: OverlayEntry, reason: OverlayDismissReason): void {
	release(entry);
	entry.onDismiss?.(reason);
}

function findEntry(element: HTMLElement): OverlayEntry | undefined {
	return stack.find((entry) => entry.element === element);
}

function asHtmlElement(value: Element | undefined): HTMLElement | undefined {
	if (!value || value.nodeType !== 1) return undefined;
	const candidate = value as HTMLElement;
	return typeof candidate.focus === 'function' ? candidate : undefined;
}

/* Focus */

function moveFocusInto(entry: OverlayEntry, initialFocus: Element | undefined): void {
	const target = asHtmlElement(initialFocus) ?? entry.element;
	if (target === entry.element && !entry.element.hasAttribute('tabindex')) {
		// The APG's own technique for a dialog whose first control is the wrong
		// landing place: make the container itself programmatically focusable.
		entry.undo.push(setAttributeWhileOpen(entry.element, 'tabindex', '-1'));
	}
	target.focus();
}

function restoreFocus(entry: OverlayEntry): void {
	const target = asHtmlElement(entry.restoreFocusTo);
	if (target?.isConnected) target.focus();
}

/* Background modality, after Base UI's markOthers
   (packages/react/src/floating-ui-react/utils/markOthers.ts): keep the chain of
   ancestors down to the surface, mark every subtree beside it, count the marks
   so nesting unwinds cleanly, and leave live regions announceable. */

function hideBackground(surface: HTMLElement): () => void {
	const outside: Element[] = [];
	collectOutsideSubtrees(surface.ownerDocument.body, surface, outside);

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

function setAttributeWhileOpen(element: Element, name: string, value: string): () => void {
	const authored = element.getAttribute(name);
	element.setAttribute(name, value);
	return () => {
		if (authored === null) element.removeAttribute(name);
		else element.setAttribute(name, authored);
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

/* Document listeners, added only while something is open */

function listen(owner: Document): void {
	if (listeningDocument === owner) return;
	stopListening();
	owner.addEventListener('keydown', onKeyDown, true);
	owner.addEventListener('pointerdown', onPointerDown, true);
	owner.addEventListener('focusin', onFocusIn, true);
	listeningDocument = owner;
}

function stopListening(): void {
	if (!listeningDocument) return;
	listeningDocument.removeEventListener('keydown', onKeyDown, true);
	listeningDocument.removeEventListener('pointerdown', onPointerDown, true);
	listeningDocument.removeEventListener('focusin', onFocusIn, true);
	listeningDocument = undefined;
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || event.defaultPrevented) return;
	const top = stack[stack.length - 1];
	if (!top) return;
	// Escape reaches the topmost surface and stops there, so a nested surface
	// closes back to the one that opened it rather than closing both.
	event.preventDefault();
	event.stopPropagation();
	dismiss(top, 'escape');
}

function onPointerDown(event: Event): void {
	const top = stack[stack.length - 1];
	if (!top || top.kind !== 'disclosure') return;
	if (isInside(top, event.target)) return;
	// The decision is made on the press, not the click, so a drag that starts
	// inside the surface and ends outside it never counts as an outside press.
	dismiss(top, 'outside-interaction');
}

function onFocusIn(event: Event): void {
	const top = stack[stack.length - 1];
	if (!top || top.kind !== 'modal') return;
	if (event.target instanceof Node && top.element.contains(event.target)) return;
	top.element.focus();
}

function isInside(entry: OverlayEntry, target: EventTarget | null): boolean {
	if (!(target instanceof Node)) return false;
	if (entry.element.contains(target)) return true;
	return entry.trigger !== undefined && entry.trigger.contains(target);
}
