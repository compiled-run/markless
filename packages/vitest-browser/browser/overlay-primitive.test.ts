import { closeOverlay, isOverlayOpen } from '@markless/web/fns/overlay';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedPage from './fixtures/overlay-nested-page.tsrx';
import Page from './fixtures/overlay-primitive.tsrx';

// The overlay primitive is the behaviour half of an elevated surface: a stack
// where the topmost entry wins, Escape and outside pointers dismissing per kind,
// focus contained then restored, the background marked inert and aria-hidden,
// and the surface never detached while it is open.
//
// Every assertion below runs twice, once against a client render and once
// against a server render that resumed, because the primitive is handed
// element() handles and a handle that resolves in CSR is not evidence that it
// resolves in a handler after resume.
// The primitive owns state that outlives the rendered container: a document-wide
// scroll-lock count and the focus it moved. cleanup() only unmounts, so a test
// that fails between open and close leaves its entry on the stack forever — the
// count never falls back to zero, so no later close ever releases the lock and
// every later test in the file reads a scroll lock it never took. Draining the
// stack through the primitive's own API returns that count honestly instead of
// hiding the symptom, which is what keeps one failure from being reported as six.
afterEach(() => {
	try {
		const open = [...document.querySelectorAll('*')].filter((node) => isOverlayOpen(node));
		// Reverse document order is innermost-first, the only order a nested stack
		// unwinds in.
		for (const surface of open.reverse()) closeOverlay(surface);
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
		modalHandled: requireElement(container, '[data-modal-handled]'),
		menuTrigger: requireElement<HTMLButtonElement>(container, '[data-menu-trigger]'),
		menuContent: requireElement<HTMLElement>(container, '[data-menu-content]'),
		menuDismissals: requireElement(container, '[data-menu-dismissals]'),
	};
}

async function expectModalOpensWithModality(container: ParentNode) {
	const page = parts(container);
	expect(page.modalContent.hidden).toBe(true);
	expect(page.background.hasAttribute('inert')).toBe(false);

	page.modalTrigger.click();
	// `hidden` is one commit of the dispatch, not the whole of it: the handler's
	// later writes land as their own commits, so a poll that settles on `hidden`
	// alone hands the assertions below a half-applied dispatch. `modalHandled` is
	// the last thing the handler writes, so waiting for it proves every earlier
	// statement — openOverlay included — has already run.
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, handled: now.modalHandled.textContent };
		})
		.toEqual({ hidden: false, handled: 'opened' });

	const open = parts(container);
	// The primitive is handed the element() handle itself, so this is also the
	// proof that a handle passed as a value resolves inside a handler.
	expect(open.modalHandled.textContent).toBe('opened');
	// Modality the background can observe: everything outside the surface is
	// taken out of the tab order and out of the accessibility tree.
	expect(open.background.hasAttribute('inert')).toBe(true);
	expect(open.background.getAttribute('aria-hidden')).toBe('true');
	expect(open.modalWidget.hasAttribute('inert')).toBe(false);
	// A live region has to keep announcing from behind a modal.
	expect(open.live.hasAttribute('inert')).toBe(false);
	expect(open.live.hasAttribute('aria-hidden')).toBe(false);
	// aria-modal is a runtime fact, not a markup fact: it is true only while the
	// runtime is actually preventing interaction outside.
	expect(open.modalContent.getAttribute('aria-modal')).toBe('true');
	expect(document.body.style.overflow).toBe('hidden');
	expect(open.modalContent.contains(document.activeElement)).toBe(true);

	open.modalClose.click();
	// Releasing the scroll lock is the close path's last observable effect, so it
	// is what says the close finished rather than merely started.
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, overflow: document.body.style.overflow };
		})
		.toEqual({ hidden: true, overflow: '' });

	const closed = parts(container);
	expect(closed.background.hasAttribute('inert')).toBe(false);
	expect(closed.background.hasAttribute('aria-hidden')).toBe(false);
	expect(closed.modalContent.hasAttribute('aria-modal')).toBe(false);
	expect(document.body.style.overflow).toBe('');
	// The invoker gets focus back; the platform does not do this for us.
	expect(document.activeElement).toBe(closed.modalTrigger);
}

async function expectEscapeDismissesModal(container: ParentNode) {
	const page = parts(container);
	page.modalTrigger.click();
	// Escape is dispatched at whatever is focused, so the press has to wait for the
	// whole open dispatch, not just the `hidden` commit.
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, handled: now.modalHandled.textContent };
		})
		.toEqual({ hidden: false, handled: 'opened' });

	pressEscape(container);
	// The dismissal counter is the last thing onDismiss writes.
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, dismissals: now.modalDismissals.textContent };
		})
		.toEqual({ hidden: true, dismissals: '1' });
	expect(parts(container).modalDismissals.textContent).toBe('1');
	expect(document.activeElement).toBe(parts(container).modalTrigger);
}

async function expectModalIgnoresOutsidePointer(container: ParentNode) {
	const page = parts(container);
	page.modalTrigger.click();
	// The pointer press below only means anything once the surface is actually on
	// the overlay stack, which the handler's last write is the proof of.
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, handled: now.modalHandled.textContent };
		})
		.toEqual({ hidden: false, handled: 'opened' });

	// A modal does not light-dismiss. The background is inert, so a real click
	// never reaches it either; a synthetic pointerdown proves the primitive
	// itself refuses to treat an outside press as a dismissal.
	pointerDown(parts(container).background);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(parts(container).modalContent.hidden).toBe(false);
	expect(parts(container).modalDismissals.textContent).toBe('0');

	parts(container).modalClose.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, overflow: document.body.style.overflow };
		})
		.toEqual({ hidden: true, overflow: '' });
}

async function expectDisclosureLightDismisses(container: ParentNode) {
	const page = parts(container);
	page.menuTrigger.click();
	// The menu handler writes no outcome of its own, so the second commit driven by
	// the same cell — the trigger's aria-expanded — is what says the dispatch has
	// been applied in full rather than only as far as `hidden`.
	await expect
		.poll(() => {
			const now = parts(container);
			return {
				hidden: now.menuContent.hidden,
				expanded: now.menuTrigger.getAttribute('aria-expanded'),
			};
		})
		.toEqual({ hidden: false, expanded: 'true' });

	// A non-modal surface leaves the page usable: no inert, no scroll lock, no
	// aria-modal. This is what a navbar or a menu needs.
	expect(parts(container).background.hasAttribute('inert')).toBe(false);
	expect(parts(container).menuContent.hasAttribute('aria-modal')).toBe(false);
	expect(document.body.style.overflow).toBe('');

	// A press on the trigger is not "outside": the trigger owns the surface, so
	// the primitive leaves the close to the trigger's own handler.
	pointerDown(parts(container).menuTrigger);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(parts(container).menuContent.hidden).toBe(false);
	expect(parts(container).menuDismissals.textContent).toBe('0');

	pointerDown(parts(container).background);
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.menuContent.hidden, dismissals: now.menuDismissals.textContent };
		})
		.toEqual({ hidden: true, dismissals: '1' });
	expect(parts(container).menuDismissals.textContent).toBe('1');
	expect(document.activeElement).toBe(parts(container).menuTrigger);
}

async function expectSurfaceNeverUnmounts(container: ParentNode) {
	const before = parts(container).modalContent;
	parts(container).modalTrigger.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, handled: now.modalHandled.textContent };
		})
		.toEqual({ hidden: false, handled: 'opened' });
	expect(parts(container).modalContent).toBe(before);

	parts(container).modalClose.click();
	await expect
		.poll(() => {
			const now = parts(container);
			return { hidden: now.modalContent.hidden, overflow: document.body.style.overflow };
		})
		.toEqual({ hidden: true, overflow: '' });
	// Same node throughout: the surface leaves the overlay stack while it is
	// still attached, which is the only ordering the primitive can guarantee.
	expect(parts(container).modalContent).toBe(before);
	expect(before.isConnected).toBe(true);
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
	const page = nestedParts(container);
	page.outerTrigger.click();
	// These families write no outcome text, so the primitive's own mark on the
	// background is the observable that says the open dispatch finished; `hidden`
	// is only the state write that started it.
	await expect
		.poll(() => {
			const now = nestedParts(container);
			return { hidden: now.outerContent.hidden, outsideInert: now.outside.hasAttribute('inert') };
		})
		.toEqual({ hidden: false, outsideInert: true });
	expect(nestedParts(container).outside.hasAttribute('inert')).toBe(true);

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
	// B is a descendant of A, so opening B takes A's own siblings out but leaves
	// the chain down to B intact.
	expect(both.outerContent.hasAttribute('inert')).toBe(false);
	expect(both.innerTrigger.hasAttribute('inert')).toBe(true);
	expect(both.outerClose.hasAttribute('inert')).toBe(true);
	expect(both.innerContent.contains(document.activeElement)).toBe(true);

	// Escape closes the topmost entry and nothing below it.
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
	expect(afterInner.outerClose.hasAttribute('inert')).toBe(false);
	// A is still modal, so the page behind it is still out of reach.
	expect(afterInner.outside.hasAttribute('inert')).toBe(true);
	expect(document.activeElement).toBe(afterInner.innerTrigger);

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
	expect(nestedParts(container).outside.hasAttribute('inert')).toBe(false);
	expect(document.body.style.overflow).toBe('');
	expect(document.activeElement).toBe(nestedParts(container).outerTrigger);
}

test('CSR: a modal overlay marks the background and restores focus on close', async () => {
	const screen = await render(Page);
	await expectModalOpensWithModality(screen.container as HTMLElement);
});

test('SSR resume: a modal overlay marks the background and restores focus on close', async () => {
	const screen = await renderSSR(Page);
	await expectModalOpensWithModality(screen.container);
});

test('CSR: Escape dismisses the modal and reports the dismissal', async () => {
	const screen = await render(Page);
	await expectEscapeDismissesModal(screen.container as HTMLElement);
});

test('SSR resume: Escape dismisses the modal and reports the dismissal', async () => {
	const screen = await renderSSR(Page);
	await expectEscapeDismissesModal(screen.container);
});

test('CSR: a modal refuses an outside pointer', async () => {
	const screen = await render(Page);
	await expectModalIgnoresOutsidePointer(screen.container as HTMLElement);
});

test('SSR resume: a modal refuses an outside pointer', async () => {
	const screen = await renderSSR(Page);
	await expectModalIgnoresOutsidePointer(screen.container);
});

test('CSR: a disclosure overlay light-dismisses and leaves the page usable', async () => {
	const screen = await render(Page);
	await expectDisclosureLightDismisses(screen.container as HTMLElement);
});

test('SSR resume: a disclosure overlay light-dismisses and leaves the page usable', async () => {
	const screen = await renderSSR(Page);
	await expectDisclosureLightDismisses(screen.container);
});

test('CSR: the surface stays attached across open and close', async () => {
	const screen = await render(Page);
	await expectSurfaceNeverUnmounts(screen.container as HTMLElement);
});

test('SSR resume: the surface stays attached across open and close', async () => {
	const screen = await renderSSR(Page);
	await expectSurfaceNeverUnmounts(screen.container);
});

test('CSR: a nested overlay unwinds one entry at a time', async () => {
	const screen = await render(NestedPage);
	await expectNestedStackUnwinds(screen.container as HTMLElement);
});

test('SSR resume: a nested overlay unwinds one entry at a time', async () => {
	const screen = await renderSSR(NestedPage);
	await expectNestedStackUnwinds(screen.container);
});
