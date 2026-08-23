import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedPage from './fixtures/overlay-nested.tsrx';
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
afterEach(() => cleanup());

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
	await expect.poll(() => parts(container).modalContent.hidden).toBe(false);

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
	await expect.poll(() => parts(container).modalContent.hidden).toBe(true);

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
	await expect.poll(() => parts(container).modalContent.hidden).toBe(false);

	pressEscape(container);
	await expect.poll(() => parts(container).modalContent.hidden).toBe(true);
	expect(parts(container).modalDismissals.textContent).toBe('1');
	expect(document.activeElement).toBe(parts(container).modalTrigger);
}

async function expectModalIgnoresOutsidePointer(container: ParentNode) {
	const page = parts(container);
	page.modalTrigger.click();
	await expect.poll(() => parts(container).modalContent.hidden).toBe(false);

	// A modal does not light-dismiss. The background is inert, so a real click
	// never reaches it either; a synthetic pointerdown proves the primitive
	// itself refuses to treat an outside press as a dismissal.
	pointerDown(parts(container).background);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(parts(container).modalContent.hidden).toBe(false);
	expect(parts(container).modalDismissals.textContent).toBe('0');

	parts(container).modalClose.click();
	await expect.poll(() => parts(container).modalContent.hidden).toBe(true);
}

async function expectDisclosureLightDismisses(container: ParentNode) {
	const page = parts(container);
	page.menuTrigger.click();
	await expect.poll(() => parts(container).menuContent.hidden).toBe(false);

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
	await expect.poll(() => parts(container).menuContent.hidden).toBe(true);
	expect(parts(container).menuDismissals.textContent).toBe('1');
	expect(document.activeElement).toBe(parts(container).menuTrigger);
}

async function expectSurfaceNeverUnmounts(container: ParentNode) {
	const before = parts(container).modalContent;
	parts(container).modalTrigger.click();
	await expect.poll(() => parts(container).modalContent.hidden).toBe(false);
	expect(parts(container).modalContent).toBe(before);

	parts(container).modalClose.click();
	await expect.poll(() => parts(container).modalContent.hidden).toBe(true);
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
	await expect.poll(() => nestedParts(container).outerContent.hidden).toBe(false);
	expect(nestedParts(container).outside.hasAttribute('inert')).toBe(true);

	nestedParts(container).innerTrigger.click();
	await expect.poll(() => nestedParts(container).innerContent.hidden).toBe(false);

	const both = nestedParts(container);
	// B is a descendant of A, so opening B takes A's own siblings out but leaves
	// the chain down to B intact.
	expect(both.outerContent.hasAttribute('inert')).toBe(false);
	expect(both.innerTrigger.hasAttribute('inert')).toBe(true);
	expect(both.outerClose.hasAttribute('inert')).toBe(true);
	expect(both.innerContent.contains(document.activeElement)).toBe(true);

	// Escape closes the topmost entry and nothing below it.
	pressEscape(container);
	await expect.poll(() => nestedParts(container).innerContent.hidden).toBe(true);

	const afterInner = nestedParts(container);
	expect(afterInner.outerContent.hidden).toBe(false);
	expect(afterInner.innerTrigger.hasAttribute('inert')).toBe(false);
	expect(afterInner.outerClose.hasAttribute('inert')).toBe(false);
	// A is still modal, so the page behind it is still out of reach.
	expect(afterInner.outside.hasAttribute('inert')).toBe(true);
	expect(document.activeElement).toBe(afterInner.innerTrigger);

	pressEscape(container);
	await expect.poll(() => nestedParts(container).outerContent.hidden).toBe(true);
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
