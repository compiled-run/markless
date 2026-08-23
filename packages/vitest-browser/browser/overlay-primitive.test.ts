import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedPage from './fixtures/overlay-nested-page.tsrx';
import Page from './fixtures/overlay-primitive.tsrx';

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

test('CSR: a nested overlay unwinds one entry at a time', async () => {
	const screen = await render(NestedPage);
	await expectNestedStackUnwinds(screen.container as HTMLElement);
});

test('SSR resume: a nested overlay unwinds one entry at a time', async () => {
	const screen = await renderSSR(NestedPage);
	await expectNestedStackUnwinds(screen.container);
});
