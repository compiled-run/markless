import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Described from './scenarios/described.tsrx';
import Nested from './scenarios/nested.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

const Background = page.getByTestId('background');
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const Title = page.getByTestId('title');
const Description = page.getByTestId('description');
const Close = page.getByTestId('close');
const Save = page.getByTestId('save');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
// The nested pair.
const OuterTrigger = page.getByTestId('outer-trigger');
const OuterTitle = page.getByTestId('outer-title');
const OuterContent = page.getByTestId('outer-content');
const OuterClose = page.getByTestId('outer-close');
const InnerTrigger = page.getByTestId('inner-trigger');
const InnerContent = page.getByTestId('inner-content');
const InnerClose = page.getByTestId('inner-close');
// The pair with consumer handlers.
const FirstTrigger = page.getByTestId('first-trigger');
const FirstContent = page.getByTestId('first-content');
const FirstClose = page.getByTestId('first-close');
const FirstValue = page.getByTestId('first-value');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondValue = page.getByTestId('second-value');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function expectClosed(content: HTMLElement) {
	expect(content.hasAttribute('hidden')).toBe(true);
	// aria-modal is a runtime fact, not a markup fact: it says the runtime is
	// actually preventing interaction outside, so a closed surface must not carry it.
	expect(content.hasAttribute('aria-modal')).toBe(false);
	expect(content.getAttribute('ui-closed')).toBe('');
}

function expectShowing(content: HTMLElement) {
	expect(content.hasAttribute('hidden')).toBe(false);
	expect(content.getAttribute('aria-modal')).toBe('true');
	expect(content.getAttribute('ui-open')).toBe('');
}

function expectBackgroundReachable(background: HTMLElement) {
	expect(background.hasAttribute('inert')).toBe(false);
	expect(background.hasAttribute('aria-hidden')).toBe(false);
}

function expectBackgroundOutOfReach(background: HTMLElement) {
	// Modality the background can observe: out of the tab order and out of the
	// accessibility tree, both counted so a nested dialog closing cannot un-hide
	// a background the dialog under it still hides.
	expect(background.hasAttribute('inert')).toBe(true);
	expect(background.getAttribute('aria-hidden')).toBe('true');
}

function expectBasicRendered() {
	const content = el<HTMLElement>(Content);
	expectClosed(content);
	expect(content.getAttribute('role')).toBe('dialog');
	expect(el(Trigger).getAttribute('type')).toBe('button');
	// A dialog is not a disclosure: it says a dialog is behind the button and
	// nothing about expansion.
	expect(el(Trigger).getAttribute('aria-haspopup')).toBe('dialog');
	expect(el(Trigger).hasAttribute('aria-expanded')).toBe(false);
	// The cross-part IDREF: the handle is bound on the title and read on the content.
	expect(el(Title).id).toBeTruthy();
	expect(content.getAttribute('aria-labelledby')).toBe(el(Title).id);
	// Closed hides the surface, it never detaches it - the primitive unmarks the
	// background through this element.
	expect(document.contains(content)).toBe(true);
	expect(content.textContent).toContain('Edit delivery address');
	expectBackgroundReachable(el(Background));
	expect(el(Root).getAttribute('ui-closed')).toBe('');
	expect(el(Root).hasAttribute('ui-open')).toBe(false);
	// The root destructured `open`, so it never reaches the element as an attribute.
	expect(el(Root).hasAttribute('open')).toBe(false);
}

function expectDescribedRendered() {
	expect(el(Description).id).toBeTruthy();
	expect(el(Content).getAttribute('aria-describedby')).toBe(el(Description).id);
	expect(el(Content).getAttribute('aria-labelledby')).toBe(el(Title).id);
	expect(el(Description).textContent).toContain('nobody can put it back');
}

/**
 * A dialog with no title and no description still carries both references, and
 * neither resolves.
 *
 * This is the family's one accepted regression against QDS, which emits each
 * reference only when its naming part mounted. `aria-labelledby={titled ?
 * titleEl : undefined}` is refused at compile time -
 * MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE - because an IDREF position takes a
 * bare element() handle and nothing else, so the choice is "always" or "never",
 * and "never" would lose the dialog's name. The accessible-name computation
 * treats a reference that resolves to nothing as absent, so this costs untidy
 * markup rather than a wrong announcement. The row exists to fail the day the
 * compiler can express the condition.
 */
function expectUnnamedCarriesUnresolvedReferences() {
	const content = el<HTMLElement>(Content);
	const labelledby = content.getAttribute('aria-labelledby');
	const describedby = content.getAttribute('aria-describedby');
	expect(labelledby).toBeTruthy();
	expect(describedby).toBeTruthy();
	expect(document.getElementById(labelledby as string)).toBe(null);
	expect(document.getElementById(describedby as string)).toBe(null);
}

async function expectTriggerOpensAndCloseButtonCloses() {
	expectClosed(el<HTMLElement>(Content));

	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	expectShowing(el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el<HTMLElement>(Background));
	expect(el(Root).getAttribute('ui-open')).toBe('');
	// Focus went into the dialog, which is what the APG asks of an opening dialog.
	expect(el(Content).contains(document.activeElement)).toBe(true);
	// The page behind stops scrolling while the dialog is showing.
	expect(document.body.style.overflow).toBe('hidden');

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);

	expectClosed(el<HTMLElement>(Content));
	expectBackgroundReachable(el<HTMLElement>(Background));
	expect(document.body.style.overflow).toBe('');
	// Focus returns to the invoker. The platform does not do this for us and QDS
	// does not either; it is the family's clearest missing behaviour elsewhere.
	expect(document.activeElement).toBe(el(Trigger));
	// Closing hid the surface; it never took it out of the page.
	expect(document.contains(el(Content))).toBe(true);
}

async function expectEscapeCloses() {
	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el<HTMLElement>(Background));
	expect(document.activeElement).toBe(el(Trigger));
}

async function expectConsumerCallbackFires() {
	// Nothing fired on mount, first render or resume.
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');
	expect(el(Order).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstContent).hasAttribute('hidden')).toBe(false);
	// The consumer's own click handler on the trigger runs after the dialog has
	// already opened and after onChange has already been called.
	await expect.poll(() => el(Order).textContent).toBe('change-click');
	expect(el(SecondValue).textContent).toBe('');

	el(FirstClose).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('2');
}

async function expectOmittedCallbackStillOpens() {
	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	expect(el(Calls).textContent).toBe('0');

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expect(el(Calls).textContent).toBe('0');
}

async function openNestedPair() {
	el(OuterTrigger).click();
	await expect.poll(() => el(OuterContent).hasAttribute('hidden')).toBe(false);
	el(InnerTrigger).click();
	await expect.poll(() => el(InnerContent).hasAttribute('hidden')).toBe(false);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a closed dialog wired to its trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a described dialog points at its description`, async () => {
		if (mode === 'CSR') await render(Described);
		else await renderSSR(Described);
		expectDescribedRendered();
	});

	test(`${mode}: a dialog with no naming parts carries references that resolve to nothing`, async () => {
		if (mode === 'CSR') await render(Unnamed);
		else await renderSSR(Unnamed);
		expectUnnamedCarriesUnresolvedReferences();
	});

	test(`${mode}: the trigger opens the dialog and the close button closes it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectTriggerOpensAndCloseButtonCloses();
	});

	test(`${mode}: Escape closes the dialog and hands focus back`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectEscapeCloses();
	});

	test(`${mode}: a click calls the consumer onChange once with the next value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbackFires();
	});

	test(`${mode}: an omitted onChange opens and closes the dialog anyway`, async () => {
		if (mode === 'CSR') await render(WithoutOnChange);
		else await renderSSR(WithoutOnChange);
		await expectOmittedCallbackStillOpens();
	});
}

// --- modality -------------------------------------------------------------

test('CSR: the page behind an open dialog cannot be reached', async () => {
	await render(Basic);
	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	expectBackgroundOutOfReach(el<HTMLElement>(Background));
	// Focus cannot leave the dialog: aiming at the page behind lands back inside.
	el<HTMLElement>(Background).focus();
	await expect.poll(() => el(Content).contains(document.activeElement)).toBe(true);

	// The stack the primitive keeps is one module-level list for the whole page,
	// so a row that leaves a surface open leaves the next row's background marked
	// and the next row's focus caught. Every row that opens closes.
	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
});

/**
 * A modal refuses an outside pointer rather than treating it as a dismissal.
 *
 * This is the family's deviation from QDS, whose modal takes
 * `closeOnOutsideClick` and defaults it to true. Our overlay primitive answers
 * an outside press for a modal by ignoring it - only a `disclosure` surface
 * light-dismisses - and reimplementing a document-level press guard family-side
 * is exactly the duplication the primitive exists to prevent, so the prop is not
 * shipped. See note.md.
 */
test('CSR: pressing the page behind an open dialog does not close it', async () => {
	await render(Basic);
	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	el(Background).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	el(Background).click();

	expect(el(Content).hasAttribute('hidden')).toBe(false);
	expectBackgroundOutOfReach(el<HTMLElement>(Background));

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
});

test('CSR: the surface stays in the page across open and close', async () => {
	await render(Basic);
	const content = el<HTMLElement>(Content);

	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	expect(el(Content)).toBe(content);

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	// The same node throughout: a surface that detached while open would strand
	// the background's inert and aria-hidden marks with nothing left to undo them.
	expect(el(Content)).toBe(content);
	expect(document.contains(content)).toBe(true);
});

// --- nesting --------------------------------------------------------------

test('CSR: Escape closes only the dialog on top', async () => {
	await render(Nested);
	await openNestedPair();

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(InnerContent).hasAttribute('hidden')).toBe(true);
	// The one underneath is still showing and still modal.
	expect(el(OuterContent).hasAttribute('hidden')).toBe(false);
	expect(el(OuterContent).getAttribute('aria-modal')).toBe('true');
	// And the background the first dialog hid is still hidden, because the marks
	// are counted rather than set and cleared.
	expectBackgroundOutOfReach(el<HTMLElement>(Background));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(OuterContent).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el<HTMLElement>(Background));
});

test('CSR: closing the second dialog returns focus into the first', async () => {
	await render(Nested);
	await openNestedPair();
	// The first dialog's own content is out of reach while the second is showing.
	// Its surface is not marked - it is an ancestor of the second one, and the
	// chain down to the topmost surface is what the primitive keeps reachable -
	// so the fact is asserted on the part of it that sits beside the second dialog.
	expect(el(OuterTitle).hasAttribute('inert')).toBe(true);

	el(InnerClose).click();
	await expect.poll(() => el(InnerContent).hasAttribute('hidden')).toBe(true);
	// Focus went back to the button inside the first dialog that opened the second.
	expect(document.activeElement).toBe(el(InnerTrigger));
	expect(el(OuterContent).hasAttribute('inert')).toBe(false);
	expect(el(OuterContent).hasAttribute('hidden')).toBe(false);

	el(OuterClose).click();
	await expect.poll(() => el(OuterContent).hasAttribute('hidden')).toBe(true);
	expect(document.activeElement).toBe(el(OuterTrigger));
	expect(document.body.style.overflow).toBe('');
});

// --- keyboard -------------------------------------------------------------

test('CSR: the dialog opens from the keyboard and the controls inside it are reachable', async () => {
	await render(Basic);
	el(Trigger).focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	el<HTMLElement>(Save).focus();
	expect(document.activeElement).toBe(el(Save));
	el<HTMLElement>(Close).focus();
	expect(document.activeElement).toBe(el(Close));

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
});

// --- resume ---------------------------------------------------------------

test('SSR: the served dialog is closed, attached and already named', async () => {
	await renderSSR(Basic);
	// What the server sent, before anything on the client has run. The naming
	// reference is correct in the served HTML because the seed phase runs first.
	expectClosed(el<HTMLElement>(Content));
	expect(el(Content).getAttribute('role')).toBe('dialog');
	expect(el(Content).getAttribute('aria-labelledby')).toBe(el(Title).id);
	expect(el(Content).textContent).toContain('Edit delivery address');
	expectBackgroundReachable(el<HTMLElement>(Background));
});

test('SSR: the first open after resume marks the background and the first close restores focus', async () => {
	await renderSSR(Basic);

	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	expectShowing(el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el<HTMLElement>(Background));
	expect(el(Content).contains(document.activeElement)).toBe(true);

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el<HTMLElement>(Background));
	// The element() handles the primitive was handed resolved inside a handler
	// after a resume, which is the half a client render cannot prove.
	expect(document.activeElement).toBe(el(Trigger));
});

test('SSR: opening twice after resume does not double-mark the background', async () => {
	await renderSSR(Basic);

	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);

	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	expectBackgroundOutOfReach(el<HTMLElement>(Background));

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el<HTMLElement>(Background));
	expect(document.body.style.overflow).toBe('');
});

test('SSR: two sibling dialogs each reach only their own handler', async () => {
	await renderSSR(WithOnChange);

	el(SecondTrigger).click();
	await expect.poll(() => el(SecondValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstValue).textContent).toBe('');
});
