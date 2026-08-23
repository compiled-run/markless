import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Alert from './scenarios/alert.tsrx';
import Basic from './scenarios/basic.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Described from './scenarios/described.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Form from './scenarios/form.tsrx';
import Nested from './scenarios/nested.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

const Background = page.getByTestId('background');
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Backdrop = page.getByTestId('backdrop');
const Content = page.getByTestId('content');
const Title = page.getByTestId('title');
const Description = page.getByTestId('description');
const Close = page.getByTestId('close');
const Save = page.getByTestId('save');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
const Confirm = page.getByTestId('confirm');
const Opener = page.getByTestId('opener');
const Closer = page.getByTestId('closer');
// The nested pair.
const OuterTrigger = page.getByTestId('outer-trigger');
const OuterTitle = page.getByTestId('outer-title');
const OuterBackdrop = page.getByTestId('outer-backdrop');
const OuterContent = page.getByTestId('outer-content');
const OuterClose = page.getByTestId('outer-close');
const InnerTrigger = page.getByTestId('inner-trigger');
const InnerBackdrop = page.getByTestId('inner-backdrop');
const InnerClose = page.getByTestId('inner-close');
// The pair with consumer handlers.
const FirstTrigger = page.getByTestId('first-trigger');
const FirstBackdrop = page.getByTestId('first-backdrop');
const FirstClose = page.getByTestId('first-close');
const FirstValue = page.getByTestId('first-value');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondValue = page.getByTestId('second-value');
// The disabled pair.
const StuckTrigger = page.getByTestId('stuck-trigger');
const StuckBackdrop = page.getByTestId('stuck-backdrop');
const OpenTrigger = page.getByTestId('open-trigger');
const OpenBackdrop = page.getByTestId('open-backdrop');
const OpenClose = page.getByTestId('open-close');
// The form pair.
const FormTrigger = page.getByTestId('form-trigger');
const FormBackdrop = page.getByTestId('form-backdrop');
const FormSubmit = page.getByTestId('form-submit');
const Saved = page.getByTestId('saved');
const WrapTrigger = page.getByTestId('wrap-trigger');
const WrapBackdrop = page.getByTestId('wrap-backdrop');
const WrapContent = page.getByTestId('wrap-content');
const WrapInput = page.getByTestId('wrap-input');
const WrapClose = page.getByTestId('wrap-close');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

/**
 * The overlay behaviour keeps one module-level stack for the whole page, so a
 * row that leaves a surface enlisted leaves the next row's background inert.
 * Every row closes what it opened; this is the net that catches the one that
 * does not.
 */
afterEach(async () => {
	// Drain first: Escape is reported to the topmost enlisted element, so a few
	// of them unwind whatever a failing row left standing.
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	// Then reset, because a surface the drain could not reach leaves its marks on.
	for (const marked of Array.from(document.body.children)) {
		marked.removeAttribute('inert');
		marked.removeAttribute('aria-hidden');
	}
	document.body.style.overflow = '';
	document.body.style.paddingRight = '';
});

function expectClosed(backdrop: HTMLElement, content: HTMLElement) {
	// The backdrop carries the gating: it is the elevated element, so it is the
	// one whose showing and hiding the behaviour watches.
	expect(backdrop.hasAttribute('hidden')).toBe(true);
	expect(backdrop.getAttribute('ui-closed')).toBe('');
	expect(content.getAttribute('ui-closed')).toBe('');
	// The surface is hidden with the layer, never detached.
	expect(document.contains(content)).toBe(true);
}

function expectShowing(backdrop: HTMLElement, content: HTMLElement) {
	expect(backdrop.hasAttribute('hidden')).toBe(false);
	expect(backdrop.getAttribute('ui-open')).toBe('');
	// aria-modal is authored rather than toggled: the behaviour reads it off this
	// subtree when the layer enlists, and that read is what makes the page inert.
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

async function openBasic() {
	el(Trigger).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
}

async function closeBasic() {
	el(Close).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
}

/** A whole primary-button gesture, which is what a dismissal is made of. */
function press(target: HTMLElement, button = 0) {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button }));
	target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, button }));
}

function expectBasicRendered() {
	const backdrop = el<HTMLElement>(Backdrop);
	const content = el<HTMLElement>(Content);
	expectClosed(backdrop, content);
	expect(content.getAttribute('role')).toBe('dialog');
	// The surface itself is a focus target, which is where an opening dialog lands.
	expect(content.getAttribute('tabindex')).toBe('-1');
	expect(el(Trigger).getAttribute('type')).toBe('button');
	expect(el(Trigger).getAttribute('aria-haspopup')).toBe('dialog');
	// Base UI's conformance suite asserts both of these on a dialog trigger.
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(Trigger).getAttribute('aria-controls')).toBe(content.id);
	// The cross-part IDREF: the handle is bound on the title and read on the content.
	expect(el(Title).id).toBeTruthy();
	expect(content.getAttribute('aria-labelledby')).toBe(el(Title).id);
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
	expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));

	await openBasic();

	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el(Background));
	expect(el(Root).getAttribute('ui-open')).toBe('');
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('true');
	// Focus went into the dialog, which is what the APG asks of an opening dialog.
	await expect.poll(() => el(Content).contains(document.activeElement)).toBe(true);
	// The page behind stops scrolling while the dialog is showing.
	expect(document.body.style.overflow).toBe('hidden');

	await closeBasic();

	expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundReachable(el(Background));
	expect(document.body.style.overflow).toBe('');
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
	// Focus returns to the invoker. The behaviour moves no focus at all now, so
	// this is the family's own handler and its retry against the inert background.
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
}

async function expectEscapeCloses() {
	await openBasic();

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
}

async function expectConsumerCallbackFires() {
	// Nothing fired on mount, first render or resume.
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');
	expect(el(Order).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstBackdrop).hasAttribute('hidden')).toBe(false);
	// The consumer's own click handler on the trigger runs after the dialog has
	// already opened and after onChange has already been called.
	await expect.poll(() => el(Order).textContent).toBe('change-click');
	expect(el(SecondValue).textContent).toBe('');

	el(FirstClose).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('2');
}

async function expectOmittedCallbackStillOpens() {
	await openBasic();
	expect(el(Calls).textContent).toBe('0');

	await closeBasic();
	expect(el(Calls).textContent).toBe('0');
}

async function openNestedPair() {
	el(OuterTrigger).click();
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	el(InnerTrigger).click();
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(false);
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
	await openBasic();

	expectBackgroundOutOfReach(el(Background));
	// Focus cannot leave the dialog: the background is inert, so aiming at it
	// lands nowhere and the dialog keeps the cursor.
	el<HTMLElement>(Background).focus();
	expect(document.activeElement).not.toBe(el(Background));

	await closeBasic();
});

test('CSR: the surface stays in the page across open and close', async () => {
	await render(Basic);
	const content = el<HTMLElement>(Content);

	await openBasic();
	expect(el(Content)).toBe(content);

	await closeBasic();
	// The same node throughout: a surface that detached while showing would
	// strand the background's inert and aria-hidden marks with nothing to undo them.
	expect(el(Content)).toBe(content);
	expect(document.contains(content)).toBe(true);
});

// --- dismissal ------------------------------------------------------------

/**
 * Base UI's `ignores a native click whose pointerdown opened the dialog`, which
 * their suite calls out as the highest-value case: the classic open-then-
 * instantly-close defect.
 *
 * Two things stop it here, and the row proves the pair rather than either alone.
 * The behaviour only listens while something is enlisted, and the opening press
 * lands before the layer is on the stack; and the family's own layer press has
 * to *start* on the layer, which the opening press did not.
 */
test('CSR: the gesture that opens the dialog does not immediately close it', async () => {
	await render(Basic);

	press(el<HTMLElement>(Trigger));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);

	// Still showing after the gesture has fully played out.
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));

	// And a fresh press on the layer while showing still dismisses, so this is not
	// passing by never recording presses at all.
	press(el<HTMLElement>(Backdrop));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: a press on the backdrop is not a dismissal until the release lands there too', async () => {
	await render(Basic);
	await openBasic();

	el(Backdrop).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
	// The press alone leaves it showing: a drag out of the dialog is not a dismissal.
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));

	el(Backdrop).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: a right-button press on the backdrop does not dismiss', async () => {
	await render(Basic);
	await openBasic();

	press(el<HTMLElement>(Backdrop), 2);
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));

	await closeBasic();
});

test('CSR: a press inside the surface never dismisses', async () => {
	await render(Basic);
	await openBasic();

	// The press lands on a control inside the dialog, so it is neither an outside
	// press for the behaviour nor a layer press for the family.
	press(el<HTMLElement>(Save));
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);

	await closeBasic();
});

test('CSR: a press beyond the layer is reported as an outside press and closes the dialog', async () => {
	await render(Basic);
	await openBasic();

	// The behaviour reports this one, because the target is outside the enlisted
	// element entirely. A press on the layer itself is the family's own pair of
	// handlers - the behaviour counts its own element as inside.
	el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
});

test('CSR: closing and reopening rewires dismissal', async () => {
	await render(Basic);

	await openBasic();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);

	// The second open has to register its own dismissal, not run on the first
	// open's stale wiring.
	await openBasic();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);

	await openBasic();
	press(el<HTMLElement>(Backdrop));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: Escape closes the dialog once and calls the consumer once', async () => {
	await render(WithOnChange);

	el(FirstTrigger).click();
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(FirstBackdrop).hasAttribute('hidden')).toBe(true);
	// Exactly one more call: a double-fire between the behaviour's report and the
	// family's handler would show up here as 3.
	await expect.poll(() => el(FirstValue).textContent).toBe('false');
	expect(el(Calls).textContent).toBe('2');
});

test('CSR: a click on the close button while the dialog is closed changes nothing', async () => {
	await render(WithOnChange);
	expect(el(Calls).textContent).toBe('0');

	// Our surface is hidden rather than detached, so a closed dialog's close
	// button is still reachable by script. It must not report a second close.
	el(FirstClose).click();
	await expect.poll(() => el(Calls).textContent).toBe('0');
	expect(el(FirstBackdrop).hasAttribute('hidden')).toBe(true);
});

// --- alert ----------------------------------------------------------------

test('CSR: an alert announces as alertdialog and refuses an outside press', async () => {
	await render(Alert);
	expect(el(Content).getAttribute('role')).toBe('alertdialog');

	el(Trigger).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
	// Opening an alert prefers its cancel control over the surface itself.
	await expect.poll(() => document.activeElement).toBe(el(Close));

	press(el<HTMLElement>(Backdrop));
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	// Refusing the press leaves it fully modal, not merely visible.
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el(Background));
	expect(document.body.style.overflow).toBe('hidden');

	// A press reported from beyond the layer is refused on the same grounds.
	el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);

	// Escape still closes it, which is the one dismissal an alert answers.
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
});

test('CSR: an alert still opens and closes from its own controls', async () => {
	await render(Alert);

	el(Trigger).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
	expect(el(Confirm).textContent).toContain('Delete');

	el(Close).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
});

// --- nesting --------------------------------------------------------------

test('CSR: Escape closes only the dialog on top', async () => {
	await render(Nested);
	await openNestedPair();

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(true);
	// The one underneath is still showing and still modal.
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	expect(el(OuterContent).getAttribute('aria-modal')).toBe('true');
	// And the background the first dialog hid is still hidden, because the marks
	// are counted rather than set and cleared.
	expectBackgroundOutOfReach(el(Background));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
});

test('CSR: one outside press closes exactly one level of the stack', async () => {
	await render(Nested);
	await openNestedPair();

	press(el<HTMLElement>(InnerBackdrop));
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(true);
	// Unwinding is one level per press: the dialog underneath is untouched.
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	expectBackgroundOutOfReach(el(Background));

	press(el<HTMLElement>(OuterBackdrop));
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
});

test('CSR: opening a second dialog from inside the first does not dismiss the first', async () => {
	await render(Nested);
	await openNestedPair();

	// The press that opened the second dialog landed inside the first, so nothing
	// about it reads as a dismissal of the first.
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	expect(el(InnerBackdrop).hasAttribute('hidden')).toBe(false);

	el(InnerClose).click();
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(true);
	el(OuterClose).click();
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: closing the second dialog returns focus into the first', async () => {
	await render(Nested);
	await openNestedPair();
	// The first dialog's own content is out of reach while the second is showing.
	// Its surface is not marked - it is an ancestor of the second one, and the
	// chain down to the topmost surface is what the behaviour keeps reachable -
	// so the fact is asserted on the part of it that sits beside the second dialog.
	expect(el(OuterTitle).hasAttribute('inert')).toBe(true);

	el(InnerClose).click();
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(true);
	// Focus went back to the button inside the first dialog that opened the second.
	await expect.poll(() => document.activeElement).toBe(el(InnerTrigger));
	expect(el(OuterTitle).hasAttribute('inert')).toBe(false);
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);

	el(OuterClose).click();
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(OuterTrigger));
	expect(document.body.style.overflow).toBe('');
});

// --- keyboard and focus ---------------------------------------------------

test('CSR: the dialog opens from the keyboard and the controls inside it are reachable', async () => {
	await render(Basic);
	el<HTMLElement>(Trigger).focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);

	el<HTMLElement>(Save).focus();
	expect(document.activeElement).toBe(el(Save));
	el<HTMLElement>(Close).focus();
	expect(document.activeElement).toBe(el(Close));

	await closeBasic();
});

test('CSR: tabbing off the last control in the dialog does not reach the page behind', async () => {
	await render(Basic);
	await openBasic();

	el<HTMLElement>(Close).focus();
	await userEvent.keyboard('{Tab}');
	// The background is inert, so sequential navigation has nothing outside the
	// dialog to land on. This is the containment fact a programmatic focus cannot
	// prove on its own.
	expect(document.activeElement).not.toBe(el(Background));
	expect(el(Background).contains(document.activeElement)).toBe(false);

	await closeBasic();
});

test('CSR: a display-contents wrapper breaks neither the opening focus nor the tab cycle', async () => {
	await render(Form);

	el(WrapTrigger).click();
	await expect.poll(() => el(WrapBackdrop).hasAttribute('hidden')).toBe(false);
	// A consumer's `<form style="display: contents">` between the layer and the
	// surface changes the box tree but must not change where focus lands.
	await expect.poll(() => el(WrapContent).contains(document.activeElement)).toBe(true);

	el<HTMLElement>(WrapInput).focus();
	await userEvent.keyboard('{Tab}');
	expect(el(Background).contains(document.activeElement)).toBe(false);

	el(WrapClose).click();
	await expect.poll(() => el(WrapBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(WrapTrigger));
});

// --- consumer props through {...rest} -------------------------------------

test('CSR: a disabled trigger does not open the dialog and a disabled close does not close it', async () => {
	await render(Disabled);

	// `disabled` is not a family prop; it rides {...rest} onto the button.
	expect(el<HTMLButtonElement>(StuckTrigger).disabled).toBe(true);
	el(StuckTrigger).click();
	expect(el(StuckBackdrop).hasAttribute('hidden')).toBe(true);

	el(OpenTrigger).click();
	await expect.poll(() => el(OpenBackdrop).hasAttribute('hidden')).toBe(false);
	expect(el<HTMLButtonElement>(OpenClose).disabled).toBe(true);
	el(OpenClose).click();
	expect(el(OpenBackdrop).hasAttribute('hidden')).toBe(false);

	// Escape is the way out of a dialog whose close button is disabled.
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(OpenBackdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: a form inside the surface saves and the dialog closes with focus restored', async () => {
	await render(Form);

	el(FormTrigger).click();
	await expect.poll(() => el(FormBackdrop).hasAttribute('hidden')).toBe(false);

	el(FormSubmit).click();
	await expect.poll(() => el(Saved).textContent).toBe('submitted');
	// Saving is the consumer's handler; closing is still the family's close
	// control, which is the shape QDS's own dialogs use.
	el(page.getByTestId('form-close')).click();
	await expect.poll(() => el(FormBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(FormTrigger));
});

// --- consumer-driven open -------------------------------------------------

test('CSR: flipping the consumer open state shows the surface and marks the background', async () => {
	await render(Controlled);
	expect(el(Backdrop).hasAttribute('hidden')).toBe(true);

	// No trigger part in this scenario at all: the ruling allows one
	// `modal.trigger` per root, so every other opener is the consumer's own state.
	el(Opener).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el(Background));
	expect(document.body.style.overflow).toBe('hidden');

	el(Closer).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
	expect(document.body.style.overflow).toBe('');
});

// --- resume ---------------------------------------------------------------

test('SSR: the served dialog is closed, attached and already named', async () => {
	await renderSSR(Basic);
	// What the server sent, before anything on the client has run. The naming
	// reference is correct in the served HTML because the seed phase runs first.
	expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expect(el(Content).getAttribute('role')).toBe('dialog');
	expect(el(Content).getAttribute('aria-labelledby')).toBe(el(Title).id);
	expect(el(Content).textContent).toContain('Edit delivery address');
	expectBackgroundReachable(el(Background));
});

test('SSR: the first open after resume marks the background and the first close restores focus', async () => {
	await renderSSR(Basic);

	await openBasic();
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el(Background));
	await expect.poll(() => el(Content).contains(document.activeElement)).toBe(true);

	await closeBasic();
	expectBackgroundReachable(el(Background));
	// The element() handles the family's handlers read resolved after a resume,
	// which is the half a client render cannot prove.
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
});

test('SSR: opening twice after resume does not double-mark the background', async () => {
	await renderSSR(Basic);

	await openBasic();
	await closeBasic();

	await openBasic();
	expectBackgroundOutOfReach(el(Background));

	await closeBasic();
	expectBackgroundReachable(el(Background));
	expect(document.body.style.overflow).toBe('');
});

test('SSR: two sibling dialogs each reach only their own handler', async () => {
	await renderSSR(WithOnChange);

	el(SecondTrigger).click();
	await expect.poll(() => el(SecondValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstValue).textContent).toBe('');
});

/**
 * A dialog served already showing renders modal markup, and nothing else.
 *
 * The overlay behaviour enlists an element that *becomes* shown - a transition
 * out of `hidden` - and deliberately never enlists one that was shown at first
 * render, because that is what will make a future inline mode free. A served
 * `<modal.root open>` therefore never joins the stack: its markup is right, and
 * the background is not inert, the page is not locked, and Escape reaches
 * nothing. Recorded as a gap in note.md rather than worked around here; the row
 * pins what actually happens so the day it changes is visible.
 */
test('SSR: a dialog served open renders modal markup but never enlists', async () => {
	await renderSSR(ServedOpen);

	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expect(el(Content).getAttribute('role')).toBe('dialog');
	expect(el(Root).getAttribute('ui-open')).toBe('');
	// The gap, pinned:
	expectBackgroundReachable(el(Background));
	expect(document.body.style.overflow).toBe('');
});
