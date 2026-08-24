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
const OuterTrigger = page.getByTestId('outer-trigger');
const OuterTitle = page.getByTestId('outer-title');
const OuterBackdrop = page.getByTestId('outer-backdrop');
const OuterContent = page.getByTestId('outer-content');
const OuterClose = page.getByTestId('outer-close');
const InnerTrigger = page.getByTestId('inner-trigger');
const InnerBackdrop = page.getByTestId('inner-backdrop');
const InnerClose = page.getByTestId('inner-close');
const FirstTrigger = page.getByTestId('first-trigger');
const FirstBackdrop = page.getByTestId('first-backdrop');
const FirstClose = page.getByTestId('first-close');
const FirstValue = page.getByTestId('first-value');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondValue = page.getByTestId('second-value');
const StuckTrigger = page.getByTestId('stuck-trigger');
const StuckBackdrop = page.getByTestId('stuck-backdrop');
const OpenTrigger = page.getByTestId('open-trigger');
const OpenBackdrop = page.getByTestId('open-backdrop');
const OpenClose = page.getByTestId('open-close');
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

// The overlay behaviour keeps one module-level stack for the whole page, so a row
// that leaves a surface enlisted leaves the next row's background inert.
afterEach(async () => {
	// Escape is reported to the topmost enlisted element, so a few of them unwind
	// whatever a failing row left standing.
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
	// The backdrop is the elevated element, so its showing is what the behaviour watches.
	expect(backdrop.hasAttribute('hidden')).toBe(true);
	expect(backdrop.getAttribute('ui-closed')).toBe('');
	expect(content.getAttribute('ui-closed')).toBe('');
	expect(document.contains(content)).toBe(true);
}

function expectShowing(backdrop: HTMLElement, content: HTMLElement) {
	expect(backdrop.hasAttribute('hidden')).toBe(false);
	expect(backdrop.getAttribute('ui-open')).toBe('');
	// aria-modal is authored, not toggled: the behaviour reads it at enlist time.
	expect(content.getAttribute('aria-modal')).toBe('true');
	expect(content.getAttribute('ui-open')).toBe('');
}

function expectBackgroundReachable(background: HTMLElement) {
	expect(background.hasAttribute('inert')).toBe(false);
	expect(background.hasAttribute('aria-hidden')).toBe(false);
}

function expectBackgroundOutOfReach(background: HTMLElement) {
	// Both marks are counted, so a nested dialog closing cannot un-hide a background
	// the dialog under it still hides.
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
	expect(content.getAttribute('tabindex')).toBe('-1');
	expect(el(Trigger).getAttribute('type')).toBe('button');
	expect(el(Trigger).getAttribute('aria-haspopup')).toBe('dialog');
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(Trigger).getAttribute('aria-controls')).toBe(content.id);
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

// A shared() IDREF whose handle no rendered part of this widget binds writes no
// attribute at all, rather than one naming an id that is not on the page.
function expectUnnamedOmitsUnboundReferences() {
	const content = el<HTMLElement>(Content);
	expect(content.hasAttribute('aria-labelledby')).toBe(false);
	expect(content.hasAttribute('aria-describedby')).toBe(false);
}

async function expectTriggerOpensAndCloseButtonCloses() {
	expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));

	await openBasic();

	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el(Background));
	expect(el(Root).getAttribute('ui-open')).toBe('');
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(Content).contains(document.activeElement)).toBe(true);
	expect(document.body.style.overflow).toBe('hidden');

	await closeBasic();

	expectClosed(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundReachable(el(Background));
	expect(document.body.style.overflow).toBe('');
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
	// The behaviour moves no focus, so this is the family's own handler retrying
	// against the inert background.
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
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');
	expect(el(Order).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstBackdrop).hasAttribute('hidden')).toBe(false);
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

	test(`${mode}: a dialog with no naming parts omits the references entirely`, async () => {
		if (mode === 'CSR') await render(Unnamed);
		else await renderSSR(Unnamed);
		expectUnnamedOmitsUnboundReferences();
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

test('CSR: the page behind an open dialog cannot be reached', async () => {
	await render(Basic);
	await openBasic();

	expectBackgroundOutOfReach(el(Background));
	// The background is inert, so aiming focus at it lands nowhere.
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
	// A surface that detached while showing would strand the background's marks.
	expect(el(Content)).toBe(content);
	expect(document.contains(content)).toBe(true);
});

// Two things stop it: the opening press lands before the layer is on the stack, and
// the family's own layer press has to start on the layer, which that press did not.
test('CSR: the gesture that opens the dialog does not immediately close it', async () => {
	await render(Basic);

	press(el<HTMLElement>(Trigger));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);

	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));

	// A fresh press still dismisses, so this is not passing by recording no presses.
	press(el<HTMLElement>(Backdrop));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: a press on the backdrop is not a dismissal until the release lands there too', async () => {
	await render(Basic);
	await openBasic();

	el(Backdrop).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
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

	press(el<HTMLElement>(Save));
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);

	await closeBasic();
});

test('CSR: a press beyond the layer is reported as an outside press and closes the dialog', async () => {
	await render(Basic);
	await openBasic();

	// The behaviour counts its own enlisted element as inside, so only a target
	// beyond it is reported.
	el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
});

test('CSR: closing and reopening rewires dismissal', async () => {
	await render(Basic);

	await openBasic();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);

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
	// A double-fire between the behaviour's report and the family's handler reads as 3.
	await expect.poll(() => el(FirstValue).textContent).toBe('false');
	expect(el(Calls).textContent).toBe('2');
});

test('CSR: a click on the close button while the dialog is closed changes nothing', async () => {
	await render(WithOnChange);
	expect(el(Calls).textContent).toBe('0');

	// The surface is hidden rather than detached, so a closed dialog's close button
	// is still reachable by script and must not report a second close.
	el(FirstClose).click();
	await expect.poll(() => el(Calls).textContent).toBe('0');
	expect(el(FirstBackdrop).hasAttribute('hidden')).toBe(true);
});

test('CSR: an alert announces as alertdialog and refuses an outside press', async () => {
	await render(Alert);
	expect(el(Content).getAttribute('role')).toBe('alertdialog');

	el(Trigger).click();
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
	await expect.poll(() => document.activeElement).toBe(el(Close));

	press(el<HTMLElement>(Backdrop));
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expectBackgroundOutOfReach(el(Background));
	expect(document.body.style.overflow).toBe('hidden');

	el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	expect(el(Backdrop).hasAttribute('hidden')).toBe(false);

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

test('CSR: Escape closes only the dialog on top', async () => {
	await render(Nested);
	await openNestedPair();

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(true);
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	expect(el(OuterContent).getAttribute('aria-modal')).toBe('true');
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
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);
	expectBackgroundOutOfReach(el(Background));

	press(el<HTMLElement>(OuterBackdrop));
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(true);
	expectBackgroundReachable(el(Background));
});

test('CSR: opening a second dialog from inside the first does not dismiss the first', async () => {
	await render(Nested);
	await openNestedPair();

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
	// The first surface is an ancestor of the second, and the chain down to the
	// topmost surface stays reachable, so the mark is read on a part beside it.
	expect(el(OuterTitle).hasAttribute('inert')).toBe(true);

	el(InnerClose).click();
	await expect.poll(() => el(InnerBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(InnerTrigger));
	expect(el(OuterTitle).hasAttribute('inert')).toBe(false);
	expect(el(OuterBackdrop).hasAttribute('hidden')).toBe(false);

	el(OuterClose).click();
	await expect.poll(() => el(OuterBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(OuterTrigger));
	expect(document.body.style.overflow).toBe('');
});

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
	// Sequential navigation is the containment fact a programmatic focus cannot prove.
	expect(document.activeElement).not.toBe(el(Background));
	expect(el(Background).contains(document.activeElement)).toBe(false);

	await closeBasic();
});

test('CSR: a display-contents wrapper breaks neither the opening focus nor the tab cycle', async () => {
	await render(Form);

	el(WrapTrigger).click();
	await expect.poll(() => el(WrapBackdrop).hasAttribute('hidden')).toBe(false);
	// A `display: contents` form between layer and surface changes the box tree only.
	await expect.poll(() => el(WrapContent).contains(document.activeElement)).toBe(true);

	el<HTMLElement>(WrapInput).focus();
	await userEvent.keyboard('{Tab}');
	expect(el(Background).contains(document.activeElement)).toBe(false);

	el(WrapClose).click();
	await expect.poll(() => el(WrapBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(WrapTrigger));
});

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
	// Saving is the consumer's handler; closing is still the family's close control.
	el(page.getByTestId('form-close')).click();
	await expect.poll(() => el(FormBackdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(FormTrigger));
});

test('CSR: flipping the consumer open state shows the surface and marks the background', async () => {
	await render(Controlled);
	expect(el(Backdrop).hasAttribute('hidden')).toBe(true);

	// At most one `modal.trigger` per root, so every other opener is consumer state.
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

// With no trigger part the family has no handle to restore to, so it restores to the
// reading the behaviour took at enlist - hence focusing the opener first.
for (const mode of MODES) {
	test(`${mode}: a dialog opened programmatically restores focus to the pre-open element`, async () => {
		if (mode === 'CSR') await render(Controlled);
		else await renderSSR(Controlled);

		el<HTMLElement>(Opener).focus();
		expect(document.activeElement).toBe(el(Opener));

		el(Opener).click();
		await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(false);
		// Marking the background inert blurs the opener, so the only copy of where
		// focus was is the one taken at enlist.
		expectBackgroundOutOfReach(el(Background));

		el(Close).click();
		await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
		await expect.poll(() => document.activeElement).toBe(el(Opener));
	});
}

test('SSR: the served dialog is closed, attached and already named', async () => {
	await renderSSR(Basic);
	// The naming reference is right in the served HTML because seeding runs first.
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
	// The element() handles the family's handlers read resolved after a resume.
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

// The backdrop is served without `hidden`, so it never transitions and the
// MutationObserver never sees it; what enlists it is the compiler's recorded `hidden`
// update for that host, which an inline-shaped element does not carry.
test('SSR: a dialog served open enlists once the behaviour starts', async () => {
	await renderSSR(ServedOpen);

	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	expect(el(Content).getAttribute('role')).toBe('dialog');
	expect(el(Root).getAttribute('ui-open')).toBe('');
	// The startup gate, pinned: nothing has woken the runtime, so nothing is on
	// the stack and the page behind the dialog is still reachable.
	expectBackgroundReachable(el(Background));

	// A press inside the dialog wakes the runtime and arms no dismissal of its own.
	el(Content).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

	// The backdrop never transitioned out of `hidden`, so a flip cannot be what
	// put it on the stack.
	await expect.poll(() => el(Background).hasAttribute('inert')).toBe(true);
	expectBackgroundOutOfReach(el(Background));
	expect(document.body.style.overflow).toBe('hidden');

	// The scroll-lock count is document-wide and the disabled scenario leaves a
	// surface no Escape can close, so this row reads the per-row background marks.
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => el(Background).hasAttribute('inert')).toBe(false);
	expect(el(Background).hasAttribute('aria-hidden')).toBe(false);
});

// The served page carries an `overlay` mark, so its inline resumer listens above the
// container from first paint and the wake it starts finishes the dismissal - without
// that, this press would be spent waking the runtime and dismiss nothing.
test('SSR: the first Escape on a dialog served open closes it', async () => {
	await renderSSR(ServedOpen);

	expectShowing(el<HTMLElement>(Backdrop), el<HTMLElement>(Content));
	// Nothing has been pressed, so nothing has woken: this is the untouched page.
	expectBackgroundReachable(el(Background));

	await userEvent.keyboard('{Escape}');

	await expect.poll(() => el(Backdrop).hasAttribute('hidden')).toBe(true);
	expect(el(Root).getAttribute('ui-closed')).toBe('');
	await expect.poll(() => el(Background).hasAttribute('inert')).toBe(false);
});
