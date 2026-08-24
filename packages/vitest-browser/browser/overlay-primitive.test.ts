import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedPage from './fixtures/overlay-nested-page.tsrx';
import Page from './fixtures/overlay-primitive.tsrx';
import ServedOpenPage from './fixtures/overlay-served-open-page.tsrx';

// The overlay surface is the bare `overlay` attribute and nothing else. A marked
// element joins the stack when it BECOMES shown; Escape and outside presses are
// reported to the topmost one as `dismiss` events carrying a reason, which the
// family answers with an ordinary `onDismiss` handler. The behaviour imposes no
// policy of its own: it never closes anything and never moves focus. The one
// thing it does own is modality, derived from the family's own `aria-modal`,
// because inert marking and the scroll lock are document-wide and reference
// counted across nesting.
//
// Every assertion below runs twice, once against a client render and once
// against a server render that resumed, because a synthetic event reaching a
// handler in CSR is not evidence that it reaches one after resume.
//
// The behaviour owns state that outlives the rendered container: a document-wide
// scroll-lock count and the background marks it took. cleanup() only unmounts, so
// a test that fails between shown and hidden would leave its entry enlisted
// forever - the count never falls back to zero, so no later hide releases the
// lock and every later test reads a lock it never took. Hiding every marked
// element through the same `hidden` transition the behaviour watches is what
// returns that count honestly, instead of hiding the symptom.
afterEach(async () => {
	try {
		const marked = [...document.querySelectorAll<HTMLElement>('[overlay]')];
		for (const surface of marked.reverse()) surface.hidden = true;
		// MutationObserver callbacks run as a microtask, so the releases have not
		// happened yet at the end of this tick.
		await new Promise((resolve) => setTimeout(resolve, 0));
	} finally {
		cleanup();
		document.body.style.overflow = '';
		document.body.style.paddingRight = '';
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		// The drain above presses Escape on a page whose primer may still be armed.
		// A reason left standing would be taken by the NEXT page's installer, so it
		// is dropped with everything else this row owned.
		(globalThis as { __marklessOverlayPrimedDismissal?: unknown })
			.__marklessOverlayPrimedDismissal = undefined;
	}
});

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
	const found = container.querySelector<T>(selector);
	if (!found) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return found;
}

function pressEscape(container: ParentNode): void {
	const target = container.ownerDocument?.activeElement ?? document.activeElement ?? document.body;
	target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function pointerDown(target: Element): void {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 20));
}

function parts(container: ParentNode) {
	return {
		background: requireElement<HTMLButtonElement>(container, '[data-background]'),
		backgroundCount: requireElement(container, '[data-background-count]'),
		live: requireElement(container, '[data-live]'),
		modalWidget: requireElement(container, '[data-modal-widget]'),
		modalTrigger: requireElement<HTMLButtonElement>(container, '[data-modal-trigger]'),
		modalContent: requireElement<HTMLElement>(container, '[data-modal-content]'),
		modalClose: requireElement<HTMLButtonElement>(container, '[data-modal-close]'),
		modalDismissals: requireElement(container, '[data-modal-dismissals]'),
		modalReason: requireElement(container, '[data-modal-reason]'),
		modalPressed: requireElement(container, '[data-modal-pressed]'),
		menuTrigger: requireElement<HTMLButtonElement>(container, '[data-menu-trigger]'),
		menuContent: requireElement<HTMLElement>(container, '[data-menu-content]'),
		menuDismissals: requireElement(container, '[data-menu-dismissals]'),
		menuReason: requireElement(container, '[data-menu-reason]'),
		alwaysShown: requireElement<HTMLElement>(container, '[data-always-shown]'),
		alwaysShownDismissals: requireElement(container, '[data-always-shown-dismissals]'),
		backdropTrigger: requireElement<HTMLButtonElement>(container, '[data-backdrop-trigger]'),
		backdrop: requireElement<HTMLElement>(container, '[data-backdrop]'),
		backdropContent: requireElement<HTMLElement>(container, '[data-backdrop-content]'),
		backdropClose: requireElement<HTMLButtonElement>(container, '[data-backdrop-close]'),
		backdropDismissals: requireElement(container, '[data-backdrop-dismissals]'),
	};
}

// `hidden` is one commit of the dispatch, not the whole of it, and enlistment
// happens in a MutationObserver callback after that commit lands. The inert mark
// the behaviour takes is therefore the observable that says the surface is
// actually enlisted; `hidden` alone only says the dispatch started.
async function openModal(container: ParentNode): Promise<void> {
	parts(container).modalTrigger.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.modalContent.hidden,
				backgroundInert: now.background.hasAttribute('inert'),
			};
		})
		.toEqual({ hidden: false, backgroundInert: true });
}

async function expectModalEnlistsWithModality(container: ParentNode) {
	const page = parts(container);
	expect(page.modalContent.hidden).toBe(true);
	expect(page.modalContent.hasAttribute('overlay')).toBe(true);
	expect(page.background.hasAttribute('inert')).toBe(false);

	await openModal(container);

	const open = parts(container);
	// Modality the background can observe: everything outside the surface is taken
	// out of the tab order and out of the accessibility tree. It is derived from
	// the family's own aria-modal, not from an option handed to a function.
	expect(open.background.hasAttribute('inert')).toBe(true);
	expect(open.background.getAttribute('aria-hidden')).toBe('true');
	expect(open.modalWidget.hasAttribute('inert')).toBe(false);
	// A live region has to keep announcing from behind a modal.
	expect(open.live.hasAttribute('inert')).toBe(false);
	expect(open.live.hasAttribute('aria-hidden')).toBe(false);
	expect(document.body.style.overflow).toBe('hidden');
	// Focus is the family's job. The behaviour must not have touched it.
	expect(open.modalContent.contains(document.activeElement)).toBe(false);

	open.modalClose.click();
	// Releasing the scroll lock is the last observable effect of leaving the
	// stack, so it is what says the release finished rather than merely started.
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, overflow: document.body.style.overflow };
		})
		.toEqual({ hidden: true, overflow: '' });

	const closed = parts(container);
	expect(closed.background.hasAttribute('inert')).toBe(false);
	expect(closed.background.hasAttribute('aria-hidden')).toBe(false);
	expect(document.body.style.overflow).toBe('');
	// No focus restore either: the behaviour reports, the family acts.
	expect(document.activeElement).not.toBe(closed.modalContent);
}

async function expectEscapeReportsDismiss(container: ParentNode) {
	await openModal(container);

	pressEscape(container);
	// The dismissal counter is the last thing the handler writes, and the handler
	// is what hid the surface - the behaviour itself closed nothing.
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.modalContent.hidden,
				dismissals: now.modalDismissals.textContent,
				reason: now.modalReason.textContent,
			};
		})
		.toEqual({ hidden: true, dismissals: '1', reason: 'escape' });
	expect(document.body.style.overflow).toBe('');
}

async function expectOutsidePressReportedNotEnforced(container: ParentNode) {
	await openModal(container);

	// The behaviour reports an outside press; it does not act on it. This modal's
	// own handler ignores that reason, so the surface stays shown - which is only
	// provable because the report itself is counted.
	pointerDown(parts(container).background);
	await expect
		.poll(() => {
			const now = parts(container);
			return { dismissals: now.modalDismissals.textContent, reason: now.modalReason.textContent };
		})
		.toEqual({ dismissals: '1', reason: 'outside-press' });
	await settle();
	expect(parts(container).modalContent.hidden).toBe(false);
	expect(parts(container).background.hasAttribute('inert')).toBe(true);

	parts(container).modalClose.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, overflow: document.body.style.overflow };
		})
		.toEqual({ hidden: true, overflow: '' });
}

async function expectOutsidePressCarriesTheElementPressed(container: ParentNode) {
	// The report says why AND where. Escape has no target at all, so a family that
	// wants to ignore the press that opened it can ask which element was pressed
	// instead of guessing from how soon the press arrived.
	await openModal(container);

	pressEscape(container);
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.modalContent.hidden,
				dismissals: now.modalDismissals.textContent,
				reason: now.modalReason.textContent,
				pressed: now.modalPressed.textContent,
			};
		})
		.toEqual({ hidden: true, dismissals: '1', reason: 'escape', pressed: 'none' });
	// Nothing was stamped, because Escape carried no element to stamp.
	expect(parts(container).background.hasAttribute('data-press-target-seen')).toBe(false);

	await openModal(container);
	pointerDown(parts(container).background);
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				dismissals: now.modalDismissals.textContent,
				reason: now.modalReason.textContent,
				pressed: now.modalPressed.textContent,
			};
		})
		.toEqual({ dismissals: '2', reason: 'outside-press', pressed: 'element' });
	// The handler stamped the node the report handed it, so this is identity: the
	// element the press landed on is the one that arrived, not one that matched a
	// description of it.
	expect(parts(container).background.hasAttribute('data-press-target-seen')).toBe(true);
	expect(parts(container).modalContent.hasAttribute('data-press-target-seen')).toBe(false);

	parts(container).modalClose.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, overflow: document.body.style.overflow };
		})
		.toEqual({ hidden: true, overflow: '' });
}

async function expectNonModalLeavesPageUsable(container: ParentNode) {
	parts(container).menuTrigger.click();
	// The menu takes no document-wide mark, so the second commit driven by the same
	// cell - the trigger's aria-expanded - is what says the dispatch has been
	// applied in full rather than only as far as `hidden`.
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.menuContent.hidden,
				expanded: now.menuTrigger.getAttribute('aria-expanded'),
			};
		})
		.toEqual({ hidden: false, expanded: 'true' });
	await settle();

	// No aria-modal on this surface, so no inert, no scroll lock. This is what a
	// navbar or a menu needs.
	expect(parts(container).background.hasAttribute('inert')).toBe(false);
	expect(document.body.style.overflow).toBe('');

	pointerDown(parts(container).background);
	// This family's handler does act on an outside press. The reason is what
	// distinguishes the two policies written against the same report.
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.menuContent.hidden,
				dismissals: now.menuDismissals.textContent,
				reason: now.menuReason.textContent,
			};
		})
		.toEqual({ hidden: true, dismissals: '1', reason: 'outside-press' });
}

async function expectTopmostOnlyReceivesEscape(container: ParentNode) {
	// Two marked elements shown in order: the second one is the topmost, and it is
	// the only one Escape is reported to.
	await openModal(container);
	parts(container).menuTrigger.click();
	await expect
		.poll(() => parts(container).menuContent.hidden)
		.toBe(false);
	await settle();

	pressEscape(container);
	await expect
		.poll(() => {
			const now = parts(container);
			return { menu: now.menuDismissals.textContent, modal: now.modalDismissals.textContent };
		})
		.toEqual({ menu: '1', modal: '0' });
	expect(parts(container).menuReason.textContent).toBe('escape');
	// The modal underneath is untouched: still shown, still modal.
	expect(parts(container).modalContent.hidden).toBe(false);
	expect(parts(container).background.hasAttribute('inert')).toBe(true);

	// With the menu gone the modal is topmost, and now Escape reaches it.
	pressEscape(container);
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, dismissals: now.modalDismissals.textContent };
		})
		.toEqual({ hidden: true, dismissals: '1' });
}

async function expectShownAtFirstRenderNeverEnlists(container: ParentNode) {
	// The element carries `overlay` and has been shown since the first render, so
	// it never transitioned out of hidden and never joined the stack. It is the
	// whole reason a future `inline` mode costs nothing: nothing is reported to it
	// and it takes no document-wide mark.
	const page = parts(container);
	expect(page.alwaysShown.hasAttribute('overlay')).toBe(true);
	expect(page.alwaysShown.hidden).toBe(false);

	pressEscape(container);
	pointerDown(page.background);
	await settle();
	expect(parts(container).alwaysShownDismissals.textContent).toBe('0');
	expect(page.background.hasAttribute('inert')).toBe(false);
	expect(document.body.style.overflow).toBe('');

	// And a marked element that IS enlisted still reports normally while the
	// always-shown one sits beside it doing nothing.
	await openModal(container);
	pressEscape(container);
	await expect
		.poll(() => parts(container).modalDismissals.textContent)
		.toBe('1');
	expect(parts(container).alwaysShownDismissals.textContent).toBe('0');
}

function servedParts(container: ParentNode) {
	return {
		outside: requireElement<HTMLButtonElement>(container, '[data-outside]'),
		outsideCount: requireElement(container, '[data-outside-count]'),
		servedOpen: requireElement<HTMLElement>(container, '[data-served-open]'),
		servedDismissals: requireElement(container, '[data-served-dismissals]'),
		servedReason: requireElement(container, '[data-served-reason]'),
		inlineShown: requireElement<HTMLElement>(container, '[data-inline-shown]'),
		inlineDismissals: requireElement(container, '[data-inline-dismissals]'),
	};
}

async function expectServedOpenEnlistsAndInlineNever(container: ParentNode) {
	const page = servedParts(container);
	// Both are marked, both are shown, and neither carries `hidden` in the served
	// DOM. The only thing that separates them is that one's visibility is bound,
	// which no amount of looking at the DOM can answer - the payload's `hidden`
	// attribute record is what names the bound one.
	expect(page.servedOpen.hidden).toBe(false);
	expect(page.inlineShown.hidden).toBe(false);

	// The boundary this row also pins: the overlay behaviour starts with the
	// resume runtime, and the runtime is woken by the first container event. Until
	// something wakes it nothing is enlisted, so a page served with an open
	// surface is not yet modal. That is a startup gate, not the behaviour's rule;
	// the day the runtime wakes itself this line is what makes the change visible.
	expect(page.outside.hasAttribute('inert')).toBe(false);

	// Any container event does it. This one changes nothing about the surfaces.
	page.outside.click();
	await expect.poll(() => servedParts(container).outsideCount.textContent).toBe('1');

	// With the behaviour started the bound surface is enlisted, with modality
	// derived from its own aria-modal. It never transitioned out of `hidden`, so a
	// flip cannot be what put it on the stack.
	await expect.poll(() => servedParts(container).outside.hasAttribute('inert')).toBe(true);
	expect(document.body.style.overflow).toBe('hidden');
	// The unbound one is not what took those marks: it is not aria-modal, and it
	// takes nothing.
	expect(page.inlineShown.hasAttribute('aria-modal')).toBe(false);

	// Escape reaches the enlisted surface and nothing else.
	pressEscape(container);
	await expect
		.poll(() => {
			const now = servedParts(container);
			return {
				dismissals: now.servedDismissals.textContent,
				reason: now.servedReason.textContent,
				hidden: now.servedOpen.hidden,
			};
		})
		.toEqual({ dismissals: '1', reason: 'escape', hidden: true });
	expect(servedParts(container).inlineDismissals.textContent).toBe('0');

	// Its handler hid it, so it left the stack and gave the document back.
	await expect.poll(() => servedParts(container).outside.hasAttribute('inert')).toBe(false);
	expect(document.body.style.overflow).toBe('');

	// With the stack empty the inline element is still the only marked thing
	// showing, and it still receives nothing - not one report, not one mark.
	pressEscape(container);
	pointerDown(page.outside);
	await settle();
	expect(servedParts(container).inlineDismissals.textContent).toBe('0');
	expect(servedParts(container).outside.hasAttribute('inert')).toBe(false);
	expect(document.body.style.overflow).toBe('');
}

type FocusOriginHost = { readonly __marklessOverlayFocusOrigin?: Element };

async function expectFocusIsReadAtEnlistAndNeverMoved(container: ParentNode) {
	const page = parts(container);
	page.background.focus();
	expect(document.activeElement).toBe(page.background);

	page.modalTrigger.click();
	await expect.poll(() => parts(container).modalContent.hidden).toBe(false);

	// What the page was on at the moment it enlisted, left on the element that
	// enlisted. Taken before the background was marked - marking makes the
	// subtree inert, which blurs the button, so a reading taken afterwards would
	// answer the body.
	const enlisted = parts(container).modalContent as HTMLElement & FocusOriginHost;
	expect(enlisted.__marklessOverlayFocusOrigin).toBe(page.background);

	// Read, never moved. The surface has not taken focus, and neither has
	// anything inside it: focus movement is the family's job and no family here
	// asked for one.
	expect(document.activeElement).not.toBe(enlisted);
	expect(enlisted.contains(document.activeElement)).toBe(false);

	pressEscape(container);
	await expect.poll(() => parts(container).modalContent.hidden).toBe(true);
	// Leaving the stack does not erase the reading: a family restores focus after
	// its surface is already off the stack.
	expect(
		(parts(container).modalContent as HTMLElement & FocusOriginHost)
			.__marklessOverlayFocusOrigin,
	).toBe(page.background);
}

async function expectFirstEscapeDismissesWithoutAWake(container: ParentNode) {
	const page = servedParts(container);
	// Nothing has been pressed, so the runtime is still asleep and the behaviour
	// is not installed - the state the startup-gate row above pins.
	expect(page.servedOpen.hidden).toBe(false);
	expect(page.outside.hasAttribute('inert')).toBe(false);

	// One press, and it is the FIRST one the page ever sees. Without the primer
	// it is spent on the waking.
	pressEscape(container);

	await expect
		.poll(() => {
			const now = servedParts(container);
			return {
				dismissals: now.servedDismissals.textContent,
				reason: now.servedReason.textContent,
				hidden: now.servedOpen.hidden,
			};
		})
		.toEqual({ dismissals: '1', reason: 'escape', hidden: true });
	// Exactly one report: the primer leaves a reason, it does not replay a press
	// that the behaviour would then hear a second time.
	expect(servedParts(container).inlineDismissals.textContent).toBe('0');
	await expect.poll(() => servedParts(container).outside.hasAttribute('inert')).toBe(false);
}

async function expectSurfaceNeverUnmounts(container: ParentNode) {
	const before = parts(container).modalContent;
	await openModal(container);
	expect(parts(container).modalContent).toBe(before);

	parts(container).modalClose.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, overflow: document.body.style.overflow };
		})
		.toEqual({ hidden: true, overflow: '' });
	// Same node throughout: the surface leaves the stack while it is still
	// attached, which is the only ordering the behaviour can guarantee.
	expect(parts(container).modalContent).toBe(before);
	expect(before.isConnected).toBe(true);
}

async function expectDismissHandlerClosesThroughSharedState(container: ParentNode) {
	// The modal shape end-to-end: a dismiss handler writing shared state is what
	// closes the surface. Nothing in the behaviour hid anything.
	await openModal(container);
	expect(parts(container).modalContent.hidden).toBe(false);

	pressEscape(container);
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.modalContent.hidden,
				expanded: now.modalTrigger.getAttribute('aria-expanded'),
				backgroundInert: now.background.hasAttribute('inert'),
			};
		})
		.toEqual({ hidden: true, expanded: 'false', backgroundInert: false });
}

async function expectBackdropWrappedModalDerivesModality(container: ParentNode) {
	// The enlisted element carries no aria-modal of its own; the content it wraps
	// does. Modality has to follow the surface, not the attribute's exact host, or
	// the one shape a modal actually needs would silently be non-modal.
	const page = parts(container);
	expect(page.backdrop.hasAttribute('overlay')).toBe(true);
	expect(page.backdrop.hasAttribute('aria-modal')).toBe(false);
	expect(page.backdropContent.getAttribute('aria-modal')).toBe('true');

	page.backdropTrigger.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.backdrop.hidden,
				backgroundInert: now.background.hasAttribute('inert'),
				overflow: document.body.style.overflow,
			};
		})
		.toEqual({ hidden: false, backgroundInert: true, overflow: 'hidden' });

	const open = parts(container);
	expect(open.background.getAttribute('aria-hidden')).toBe('true');
	// The chain down to the surface is not marked: the content inside the backdrop
	// is what the user is meant to reach.
	expect(open.backdropContent.hasAttribute('inert')).toBe(false);
	expect(open.backdropClose.hasAttribute('inert')).toBe(false);

	open.backdropClose.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.backdrop.hidden,
				backgroundInert: now.background.hasAttribute('inert'),
				overflow: document.body.style.overflow,
			};
		})
		.toEqual({ hidden: true, backgroundInert: false, overflow: '' });

	// The same subtree test must not turn a plain disclosure modal: this menu holds
	// no aria-modal anywhere inside it, so it still takes no document-wide mark.
	parts(container).menuTrigger.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.menuContent.hidden,
				expanded: now.menuTrigger.getAttribute('aria-expanded'),
			};
		})
		.toEqual({ hidden: false, expanded: 'true' });
	await settle();
	expect(parts(container).background.hasAttribute('inert')).toBe(false);
	expect(parts(container).background.hasAttribute('aria-hidden')).toBe(false);
	expect(document.body.style.overflow).toBe('');
}

function nestedParts(container: ParentNode) {
	return {
		outside: requireElement<HTMLButtonElement>(container, '[data-outside]'),
		outerTrigger: requireElement<HTMLButtonElement>(container, '[data-outer-trigger]'),
		outerContent: requireElement<HTMLElement>(container, '[data-outer-content]'),
		outerClose: requireElement<HTMLButtonElement>(container, '[data-outer-close]'),
		innerTrigger: requireElement<HTMLButtonElement>(container, '[data-inner-trigger]'),
		innerContent: requireElement<HTMLElement>(container, '[data-inner-content]'),
	};
}

async function expectNestedStackUnwinds(container: ParentNode) {
	nestedParts(container).outerTrigger.click();
	// The behaviour's own mark on the background is the observable that says the
	// surface enlisted; `hidden` is only the state write that started it.
	await expect
		.poll(() => {
			const now = nestedParts(container);
			return { hidden: now.outerContent.hidden, outsideInert: now.outside.hasAttribute('inert') };
		})
		.toEqual({ hidden: false, outsideInert: true });

	nestedParts(container).innerTrigger.click();
	await expect
		.poll(() => {
			const now = nestedParts(container);
			return {
				hidden: now.innerContent.hidden,
				outerCloseInert: now.outerClose.hasAttribute('inert'),
			};
		})
		.toEqual({ hidden: false, outerCloseInert: true });

	const both = nestedParts(container);
	// B is a descendant of A, so enlisting B takes A's own siblings out but leaves
	// the chain down to B intact.
	expect(both.outerContent.hasAttribute('inert')).toBe(false);
	expect(both.innerTrigger.hasAttribute('inert')).toBe(true);
	expect(both.outerClose.hasAttribute('inert')).toBe(true);

	// Escape is reported to the topmost entry and nothing below it.
	pressEscape(container);
	// Popping B hands modality back to A, so B's controls losing their mark is what
	// says the unwind of one entry completed.
	await expect
		.poll(() => {
			const now = nestedParts(container);
			return {
				hidden: now.innerContent.hidden,
				outerCloseInert: now.outerClose.hasAttribute('inert'),
			};
		})
		.toEqual({ hidden: true, outerCloseInert: false });

	const afterInner = nestedParts(container);
	expect(afterInner.outerContent.hidden).toBe(false);
	expect(afterInner.innerTrigger.hasAttribute('inert')).toBe(false);
	// A is still modal, so the page behind it is still out of reach and the
	// refcounted scroll lock is still held.
	expect(afterInner.outside.hasAttribute('inert')).toBe(true);
	expect(document.body.style.overflow).toBe('hidden');

	pressEscape(container);
	// The last entry leaving the stack is what releases the background and the
	// scroll lock together.
	await expect
		.poll(() => {
			const now = nestedParts(container);
			return {
				hidden: now.outerContent.hidden,
				outsideInert: now.outside.hasAttribute('inert'),
				overflow: document.body.style.overflow,
			};
		})
		.toEqual({ hidden: true, outsideInert: false, overflow: '' });
}

test('CSR: a marked element enlists on becoming shown and derives modality from aria-modal', async () => {
	const screen = await render(Page);
	await expectModalEnlistsWithModality(screen.container as HTMLElement);
});

test('SSR resume: a marked element enlists on becoming shown and derives modality from aria-modal', async () => {
	const screen = await renderSSR(Page);
	await expectModalEnlistsWithModality(screen.container);
});

test('CSR: Escape is reported as a dismiss event with reason escape', async () => {
	const screen = await render(Page);
	await expectEscapeReportsDismiss(screen.container as HTMLElement);
});

test('SSR resume: Escape is reported as a dismiss event with reason escape', async () => {
	const screen = await renderSSR(Page);
	await expectEscapeReportsDismiss(screen.container);
});

test('CSR: an outside press is reported, never enforced', async () => {
	const screen = await render(Page);
	await expectOutsidePressReportedNotEnforced(screen.container as HTMLElement);
});

test('SSR resume: an outside press is reported, never enforced', async () => {
	const screen = await renderSSR(Page);
	await expectOutsidePressReportedNotEnforced(screen.container);
});

test('CSR: an outside press carries the element pressed and Escape carries none', async () => {
	const screen = await render(Page);
	await expectOutsidePressCarriesTheElementPressed(screen.container as HTMLElement);
});

test('SSR resume: an outside press carries the element pressed and Escape carries none', async () => {
	const screen = await renderSSR(Page);
	await expectOutsidePressCarriesTheElementPressed(screen.container);
});

test('CSR: a surface without aria-modal leaves the page usable', async () => {
	const screen = await render(Page);
	await expectNonModalLeavesPageUsable(screen.container as HTMLElement);
});

test('SSR resume: a surface without aria-modal leaves the page usable', async () => {
	const screen = await renderSSR(Page);
	await expectNonModalLeavesPageUsable(screen.container);
});

test('CSR: only the topmost enlisted element receives Escape', async () => {
	const screen = await render(Page);
	await expectTopmostOnlyReceivesEscape(screen.container as HTMLElement);
});

test('SSR resume: only the topmost enlisted element receives Escape', async () => {
	const screen = await renderSSR(Page);
	await expectTopmostOnlyReceivesEscape(screen.container);
});

test('CSR: a backdrop-wrapped modal derives modality from the content it wraps', async () => {
	const screen = await render(Page);
	await expectBackdropWrappedModalDerivesModality(screen.container as HTMLElement);
});

test('SSR resume: a backdrop-wrapped modal derives modality from the content it wraps', async () => {
	const screen = await renderSSR(Page);
	await expectBackdropWrappedModalDerivesModality(screen.container);
});

test('CSR: a marked element shown at first render never enlists', async () => {
	const screen = await render(Page);
	await expectShownAtFirstRenderNeverEnlists(screen.container as HTMLElement);
});

test('SSR resume: a marked element shown at first render never enlists', async () => {
	const screen = await renderSSR(Page);
	await expectShownAtFirstRenderNeverEnlists(screen.container);
});

test('CSR: a surface open because its hidden binding is false enlists, an unbound one never does', async () => {
	const screen = await render(ServedOpenPage);
	await expectServedOpenEnlistsAndInlineNever(screen.container as HTMLElement);
});

test('SSR resume: a surface open because its hidden binding is false enlists, an unbound one never does', async () => {
	const screen = await renderSSR(ServedOpenPage);
	await expectServedOpenEnlistsAndInlineNever(screen.container);
});

test('CSR: the surface stays attached across enlist and release', async () => {
	const screen = await render(Page);
	await expectSurfaceNeverUnmounts(screen.container as HTMLElement);
});

test('SSR resume: the surface stays attached across enlist and release', async () => {
	const screen = await renderSSR(Page);
	await expectSurfaceNeverUnmounts(screen.container);
});

test('CSR: a dismiss handler writing shared state is what closes the surface', async () => {
	const screen = await render(Page);
	await expectDismissHandlerClosesThroughSharedState(screen.container as HTMLElement);
});

test('SSR resume: a dismiss handler writing shared state is what closes the surface', async () => {
	const screen = await renderSSR(Page);
	await expectDismissHandlerClosesThroughSharedState(screen.container);
});

test('CSR: the focus a page held is read at enlist and never moved', async () => {
	const screen = await render(Page);
	await expectFocusIsReadAtEnlistAndNeverMoved(screen.container as HTMLElement);
});

test('SSR resume: the focus a page held is read at enlist and never moved', async () => {
	const screen = await renderSSR(Page);
	await expectFocusIsReadAtEnlistAndNeverMoved(screen.container);
});

// Only the served page can show this. A client render has the behaviour
// installed before the reader can press anything, so its first Escape was never
// the one at risk.
test('SSR resume: the first Escape on a served-open page dismisses it', async () => {
	const screen = await renderSSR(ServedOpenPage);
	await expectFirstEscapeDismissesWithoutAWake(screen.container);
});

test('CSR: a nested overlay unwinds one entry at a time', async () => {
	const screen = await render(NestedPage);
	await expectNestedStackUnwinds(screen.container as HTMLElement);
});

test('SSR resume: a nested overlay unwinds one entry at a time', async () => {
	const screen = await renderSSR(NestedPage);
	await expectNestedStackUnwinds(screen.container);
});
