import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import BasicCheckbox from './checkbox-basic.tsrx';
import CheckedDisabledCheckbox from './checkbox-checked-disabled.tsrx';
import CheckedCheckbox from './checkbox-checked.tsrx';
import ControlledCheckboxes from './checkbox-controlled.tsrx';
import DescribedCheckbox from './checkbox-described.tsrx';
import DisabledCheckbox from './checkbox-disabled.tsrx';
import ErrorFirstCheckbox from './checkbox-error-first.tsrx';
import ErroredCheckbox from './checkbox-errored.tsrx';
import CheckedFormCheckbox from './checkbox-form-checked.tsrx';
import MixedFormCheckbox from './checkbox-form-mixed.tsrx';
import ValuedFormCheckbox from './checkbox-form-valued.tsrx';
import FormCheckbox from './checkbox-form.tsrx';
import MixedCheckbox from './checkbox-mixed.tsrx';
import SilentCheckbox from './checkbox-silent.tsrx';
import TwoCheckboxes from './checkbox-two.tsrx';

// Colocated browser suite for the checkbox family, in the QDS shape: locators
// name the part anatomy, and each test renders a real example component a
// consumer could copy. The harness mounts a zero-argument component, so a state
// is a thin example wrapper rather than a prop passed to render().
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Indicator = page.getByTestId('indicator');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const CheckboxError = page.getByTestId('error');
const HiddenInput = page.getByTestId('field');
const SubmitButton = page.getByTestId('submit');
const Submitted = page.getByTestId('submitted');
const Calls = page.getByTestId('calls');
const FirstTrigger = page.getByTestId('first-trigger');
const FirstIndicator = page.getByTestId('first-indicator');
const FirstValue = page.getByTestId('first-value');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondIndicator = page.getByTestId('second-indicator');
const SecondValue = page.getByTestId('second-value');
const ThirdTrigger = page.getByTestId('third-trigger');
const ThirdIndicator = page.getByTestId('third-indicator');

// Two runtime errors escape as unhandled rejections while this suite runs, and
// neither is a defect in the family or in these assertions:
//   * a click on a <label> — an element whose whole job is to name a trigger —
//     reaches the delegated listener, which has no record for it;
//   * a container from an earlier SSR test still answers document-level events
//     after cleanup(), so a later click or keypress lands on a stale resume.
// They are captured here so they cannot masquerade as a failure of this suite,
// and recorded red once in shared-read-refresh.test.ts, which turns red itself
// the day the runtime stops raising them.
function onUnmatchedRejection(event: PromiseRejectionEvent) {
	if (!String(event.reason).includes('_UNMATCHED')) return;
	event.preventDefault();
}

beforeEach(() => window.addEventListener('unhandledrejection', onUnmatchedRejection));

afterEach(async () => {
	await cleanup();
	// Late rejections arrive after the gesture that caused them settles.
	await new Promise((resolve) => setTimeout(resolve, 50));
	window.removeEventListener('unhandledrejection', onUnmatchedRejection);
});

function el(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as HTMLElement;
}

// --- seeded configuration -------------------------------------------------

function expectPlainRendered() {
	expect(el(Trigger).getAttribute('role')).toBe('checkbox');
	expect(el(Trigger).getAttribute('aria-checked')).toBe('false');
	expect(el(Root).hasAttribute('ui-checked')).toBe(false);
	expect(el(Indicator).textContent).toBe('');
	// The label points at its own trigger, by a minted id nobody spelled.
	expect(el(Label).getAttribute('for')).toBe(el(Trigger).getAttribute('id'));
	expect(el(Trigger).id).toBeTruthy();
}

function expectCheckedRendered() {
	expect(el(Trigger).getAttribute('aria-checked')).toBe('true');
	expect(el(Root).getAttribute('ui-checked')).toBe('');
	expect(el(Indicator).textContent).toBe('Checked');
}

function expectMixedRendered() {
	expect(el(Trigger).getAttribute('aria-checked')).toBe('mixed');
	expect(el(Root).getAttribute('ui-mixed')).toBe('');
	expect(el(Root).hasAttribute('ui-checked')).toBe(false);
	expect(el(Indicator).textContent).toBe('Checked');
}

function expectDisabledRendered() {
	expect(el(Trigger).getAttribute('disabled')).toBe('');
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
}

function expectCheckedDisabledRendered() {
	expect(el(Root).getAttribute('ui-checked')).toBe('');
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
}

test('CSR: a seeded config renders across every part', async () => {
	await render(BasicCheckbox);
	expectPlainRendered();
	await cleanup();
	await render(CheckedCheckbox);
	expectCheckedRendered();
	await cleanup();
	await render(MixedCheckbox);
	expectMixedRendered();
	await cleanup();
	await render(DisabledCheckbox);
	expectDisabledRendered();
	await cleanup();
	await render(CheckedDisabledCheckbox);
	expectCheckedDisabledRendered();
});

test('SSR: a seeded config renders across every part', async () => {
	await renderSSR(BasicCheckbox);
	expectPlainRendered();
	await cleanup();
	await renderSSR(CheckedCheckbox);
	expectCheckedRendered();
	await cleanup();
	await renderSSR(MixedCheckbox);
	expectMixedRendered();
	await cleanup();
	await renderSSR(DisabledCheckbox);
	expectDisabledRendered();
	await cleanup();
	await renderSSR(CheckedDisabledCheckbox);
	expectCheckedDisabledRendered();
});

// Two labels on one page mint different ids, so a label names exactly one trigger.
test('CSR: each instance mints its own trigger id', async () => {
	await render(TwoCheckboxes);
	const first = el(page.getByTestId('first-label')).getAttribute('for');
	const second = el(page.getByTestId('second-label')).getAttribute('for');
	expect(first).toBe(el(FirstTrigger).getAttribute('id'));
	expect(first).not.toBe(second);
});

// --- gestures -------------------------------------------------------------
//
// Every derived position follows a write now: the tri-state `aria-checked`, the
// root's `ui-checked` / `ui-mixed` flags and the hidden field's `checked` /
// `indeterminate` are all comparisons over the shared instance, and each one
// moves with the plain read beside it. The parts that observe the write are in
// different components from the part that made it.

async function expectClickShowsIndicator() {
	el(FirstTrigger).click();
	await expect.poll(() => el(FirstIndicator).textContent).toBe('Checked');
	// The trigger's tri-state and the root's flag are comparisons over the same
	// cell the click wrote, and they moved with it.
	await expect.poll(() => el(FirstTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(page.getByTestId('first-root')).getAttribute('ui-checked')).toBe('');
	// The click landed in one family only: the neighbour kept its own value.
	expect(el(SecondIndicator).textContent).toBe('Checked');
	expect(el(SecondTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(ThirdIndicator).textContent).toBe('Checked');
	expect(el(ThirdTrigger).getAttribute('aria-checked')).toBe('mixed');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstIndicator).textContent).toBe('');
	// A false comparison removes the attribute rather than writing "false".
	await expect.poll(() => el(FirstTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(page.getByTestId('first-root')).hasAttribute('ui-checked')).toBe(false);
	expect(el(SecondIndicator).textContent).toBe('Checked');
}

async function expectCheckedHidesIndicator() {
	el(SecondTrigger).click();
	await expect.poll(() => el(SecondIndicator).textContent).toBe('');
	await expect.poll(() => el(SecondTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(page.getByTestId('second-root')).hasAttribute('ui-checked')).toBe(false);
	// The neighbour that started unchecked is still unchecked.
	expect(el(FirstIndicator).textContent).toBe('');
	expect(el(FirstTrigger).getAttribute('aria-checked')).toBe('false');
}

async function expectMixedTransitions() {
	expect(el(ThirdTrigger).getAttribute('aria-checked')).toBe('mixed');
	// mixed -> checked keeps the indicator up, checked -> unchecked takes it down.
	el(ThirdTrigger).click();
	await expect.poll(() => el(ThirdIndicator).textContent).toBe('Checked');
	await expect.poll(() => el(ThirdTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(page.getByTestId('third-root')).getAttribute('ui-checked')).toBe('');
	expect(el(page.getByTestId('third-root')).hasAttribute('ui-mixed')).toBe(false);
	el(ThirdTrigger).click();
	await expect.poll(() => el(ThirdIndicator).textContent).toBe('');
	await expect.poll(() => el(ThirdTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(page.getByTestId('third-root')).hasAttribute('ui-checked')).toBe(false);
}

async function expectLabelToggles() {
	// The label names the trigger through a minted id, so a click on it is a
	// click on the checkbox — the label part has no handler of its own.
	el(page.getByTestId('first-label')).click();
	await expect.poll(() => el(FirstIndicator).textContent).toBe('Checked');

	el(page.getByTestId('second-label')).click();
	await expect.poll(() => el(SecondIndicator).textContent).toBe('');
}

function expectDisabledBlocks() {
	el(Trigger).click();
	expect(el(Indicator).textContent).toBe('');
	expect(el(Trigger).getAttribute('ui-disabled')).toBe('');
}

test('CSR: clicking the trigger checks one family and leaves its neighbours alone', async () => {
	await render(TwoCheckboxes);
	await expectClickShowsIndicator();
});

test('CSR: a checked family unchecks on click', async () => {
	await render(TwoCheckboxes);
	await expectCheckedHidesIndicator();
});

test('CSR: mixed goes to checked, then to unchecked', async () => {
	await render(TwoCheckboxes);
	await expectMixedTransitions();
});

test('CSR: clicking the label toggles the checkbox it names', async () => {
	await render(TwoCheckboxes);
	await expectLabelToggles();
});

// The indicator's arm is a branch in a projected part, which does not re-render
// after an SSR resume (U-F in notes/parity-table.md). The derived ATTRIBUTES do,
// so this is the resume half of the tri-state rows without the blocked arm.
async function expectTriStateFollowsAfterResume() {
	el(FirstTrigger).click();
	await expect.poll(() => el(FirstTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(page.getByTestId('first-root')).getAttribute('ui-checked')).toBe('');
	expect(el(ThirdTrigger).getAttribute('aria-checked')).toBe('mixed');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(page.getByTestId('first-root')).hasAttribute('ui-checked')).toBe(false);

	el(ThirdTrigger).click();
	await expect.poll(() => el(ThirdTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(page.getByTestId('third-root')).hasAttribute('ui-mixed')).toBe(false);
}

test('SSR: the tri-state attributes follow a click after resume', async () => {
	await renderSSR(TwoCheckboxes);
	await expectTriStateFollowsAfterResume();
});

test('CSR: a disabled trigger does not toggle', async () => {
	await render(DisabledCheckbox);
	expectDisabledBlocks();
});

test('SSR: a disabled trigger does not toggle', async () => {
	await renderSSR(DisabledCheckbox);
	expectDisabledBlocks();
});

// --- keyboard -------------------------------------------------------------

async function expectSpaceToggles() {
	el(Trigger).focus();
	expect(document.activeElement).toBe(el(Trigger));

	// Space activates a native button on keyup, so the trigger needs no rule of
	// its own for it; the family only has to not get in the way.
	await userEvent.keyboard(' ');
	await expect.poll(() => el(Indicator).textContent).toBe('Checked');
}

// U-M: a Markless handler runs after dispatch returns, so the trigger's
// `event.preventDefault()` on Enter lands after the browser has already decided
// whether to activate the button. The rule is expressed and the handler does run
// — `defaultPrevented` is true a tick later — but nothing enforces it, so whether
// Enter toggles is a race. This asserts the race rather than one side of it; the
// behavioural row is blocked in notes/parity-table.md.
async function expectEnterPreventionIsLate() {
	el(Trigger).focus();

	const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
	el(Trigger).dispatchEvent(enter);
	expect(enter.defaultPrevented).toBe(false);
	await expect.poll(() => enter.defaultPrevented).toBe(true);
}

test('CSR: Space on the focused trigger toggles the checkbox', async () => {
	await render(BasicCheckbox);
	await expectSpaceToggles();
});

test('CSR: the trigger asks to prevent Enter, and the request lands too late', async () => {
	await render(BasicCheckbox);
	await expectEnterPreventionIsLate();
});

// --- form participation ---------------------------------------------------

function expectPlainFieldRendered() {
	expect(el(HiddenInput)).not.toBeNull();
	expect(el(HiddenInput).getAttribute('name')).toBe('terms');
	// The default a browser submits for a checkbox that carries no value.
	expect(el(HiddenInput).getAttribute('value')).toBe('on');
	expect(el(HiddenInput).hasAttribute('checked')).toBe(false);
	expect(el(HiddenInput).hasAttribute('required')).toBe(false);
	// Present for a form and for assistive tech, absent from sight.
	expect(getComputedStyle(el(HiddenInput).parentElement as Element).position).toBe('absolute');
}

function expectCheckedFieldRendered() {
	expect(el(HiddenInput).getAttribute('checked')).toBe('');
	expect((el(HiddenInput) as HTMLInputElement).checked).toBe(true);
}

function expectValuedFieldRendered() {
	expect(el(HiddenInput).getAttribute('value')).toBe('checked');
	expect(el(HiddenInput).getAttribute('required')).toBe('');
}

function expectMixedFieldRendered() {
	// QDS asserts the attribute here too, not the IDL property.
	expect(el(HiddenInput).getAttribute('indeterminate')).toBe('');
	expect(el(HiddenInput).hasAttribute('checked')).toBe(false);
}

// A real submit would navigate the test iframe, so the event is dispatched.
// What is proven is what the browser itself put in the FormData for this form,
// which is the whole point of the field part.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

async function expectFieldFollowsTheTrigger() {
	el(Trigger).click();
	// `checked` and `indeterminate` on the field are comparisons over the cell
	// the trigger wrote, in a different part from the one that wrote it. A live
	// `checked` lands on the property, which is what a submission reads.
	await expect.poll(() => (el(HiddenInput) as HTMLInputElement).checked).toBe(true);
	await expect.poll(() => submit().textContent).toBe('{"terms":"on"}');

	el(Trigger).click();
	await expect.poll(() => (el(HiddenInput) as HTMLInputElement).checked).toBe(false);
	await expect.poll(() => submit().textContent).toBe('{}');
}

async function expectMixedResolvesOnFirstClick() {
	// A mixed box resolves to checked on the first click, the way a native
	// indeterminate box does, and stops being indeterminate.
	expect(el(HiddenInput).hasAttribute('indeterminate')).toBe(true);
	el(Trigger).click();
	await expect.poll(() => el(HiddenInput).hasAttribute('indeterminate')).toBe(false);
	expect((el(HiddenInput) as HTMLInputElement).checked).toBe(true);
}

test('CSR: the field renders the config a form needs', async () => {
	await render(FormCheckbox);
	expectPlainFieldRendered();
	await cleanup();
	await render(CheckedFormCheckbox);
	expectCheckedFieldRendered();
	await cleanup();
	await render(ValuedFormCheckbox);
	expectValuedFieldRendered();
	await cleanup();
	await render(MixedFormCheckbox);
	expectMixedFieldRendered();
});

test('SSR: the field renders the config a form needs', async () => {
	await renderSSR(FormCheckbox);
	expectPlainFieldRendered();
	await cleanup();
	await renderSSR(CheckedFormCheckbox);
	expectCheckedFieldRendered();
	await cleanup();
	await renderSSR(ValuedFormCheckbox);
	expectValuedFieldRendered();
	await cleanup();
	await renderSSR(MixedFormCheckbox);
	expectMixedFieldRendered();
});

test('CSR: submitting carries the checkbox into the FormData', async () => {
	await render(FormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{}');
	await cleanup();
	await render(CheckedFormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{"terms":"on"}');
	await cleanup();
	await render(ValuedFormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{"terms":"checked"}');
	await cleanup();
	// Indeterminate is not checked: a mixed box submits nothing.
	await render(MixedFormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{}');
});

test('SSR: submitting carries the checkbox into the FormData', async () => {
	await renderSSR(FormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{}');
	await cleanup();
	await renderSSR(CheckedFormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{"terms":"on"}');
	await cleanup();
	await renderSSR(ValuedFormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{"terms":"checked"}');
	await cleanup();
	await renderSSR(MixedFormCheckbox);
	await expect.poll(() => submit().textContent).toBe('{}');
});

test('CSR: clicking the trigger syncs the hidden field and what the form submits', async () => {
	await render(FormCheckbox);
	await expectFieldFollowsTheTrigger();
});

test('SSR: clicking the trigger syncs the hidden field and what the form submits', async () => {
	await renderSSR(FormCheckbox);
	await expectFieldFollowsTheTrigger();
});

test('CSR: a mixed box resolves to checked on the first click', async () => {
	await render(MixedFormCheckbox);
	await expectMixedResolvesOnFirstClick();
});

test('SSR: a mixed box resolves to checked on the first click', async () => {
	await renderSSR(MixedFormCheckbox);
	await expectMixedResolvesOnFirstClick();
});

// The submit button is a real part of the form example, not decoration.
test('CSR: the form example renders a submit button', async () => {
	await render(FormCheckbox);
	expect(el(SubmitButton).getAttribute('type')).toBe('submit');
});

// --- label, description and error -----------------------------------------

function expectDescribed() {
	expect(el(Label).textContent).toBe('Subscribe to newsletter');
	expect(el(Label).getAttribute('for')).toBe(el(Trigger).id);
	expect(el(Description).textContent).toBe("We'll send you updates about new features");
	expect(el(Trigger).getAttribute('aria-invalid')).toBe('false');
	// No error part is mounted, so nothing marks the trigger invalid.
	expect(CheckboxError.query()).toBeNull();
}

function expectErrored() {
	expect(el(Description).textContent).toBe('Read our terms and conditions before accepting');
	expect(el(CheckboxError).textContent).toBe('Please accept the terms and conditions');
	// Every part of one widget instance seeds before any part renders, so the
	// error part's `checkbox.invalid = true` is what the trigger reads.
	expect(el(Trigger).getAttribute('aria-invalid')).toBe('true');
}

function expectErrorFirst() {
	// The same error, written before the trigger instead of after it: seeding is
	// a phase that completes before any part renders, so document order does not
	// decide what a part reads.
	expect(el(CheckboxError).textContent).toBe('Please accept the terms and conditions');
	expect(el(Trigger).getAttribute('aria-invalid')).toBe('true');
}

test('CSR: the description renders and a mounted error marks the trigger invalid', async () => {
	await render(DescribedCheckbox);
	expectDescribed();
	await cleanup();
	await render(ErroredCheckbox);
	expectErrored();
	await cleanup();
	await render(ErrorFirstCheckbox);
	expectErrorFirst();
});

test('SSR: the description renders and a mounted error marks the trigger invalid', async () => {
	await renderSSR(DescribedCheckbox);
	expectDescribed();
	await cleanup();
	await renderSSR(ErroredCheckbox);
	expectErrored();
	await cleanup();
	await renderSSR(ErrorFirstCheckbox);
	expectErrorFirst();
});

// --- consumer callbacks (U-B) ---------------------------------------------
//
// `onChange` is a callback slot on the shared instance: the root fills it with
// its own prop at build time, and `toggle()` dispatches through that route. The
// slot never becomes a graph node, so these assertions are about a call that
// reaches the consumer, not about a value the payload carried.

async function expectConsumerCallbackFires() {
	// Nothing fired on mount, first render or resume.
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	// Called once, with the next value, and the state moved with it.
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstTrigger).getAttribute('aria-checked')).toBe('true');
	// The sibling's handler did not run.
	expect(el(SecondValue).textContent).toBe('');
}

async function expectEachInstanceReachesItsOwnHandler() {
	el(SecondTrigger).click();
	await expect.poll(() => el(SecondValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstValue).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('2');
	// Each click reached only its own consumer handler.
	expect(el(SecondValue).textContent).toBe('false');
}

async function expectOmittedCallbackStillToggles() {
	// The trigger's own click record survives with no consumer handler in play.
	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-checked')).toBe('true');
	expect(el(Calls).textContent).toBe('0');
}

test('CSR: a click calls the consumer onChange once with the next value', async () => {
	await render(ControlledCheckboxes);
	await expectConsumerCallbackFires();
});

test('SSR: a click after resume calls the consumer onChange once with the next value', async () => {
	await renderSSR(ControlledCheckboxes);
	await expectConsumerCallbackFires();
});

test('CSR: two sibling checkboxes each reach only their own handler', async () => {
	await render(ControlledCheckboxes);
	await expectEachInstanceReachesItsOwnHandler();
});

test('SSR: two sibling checkboxes each reach only their own handler', async () => {
	await renderSSR(ControlledCheckboxes);
	await expectEachInstanceReachesItsOwnHandler();
});

test('CSR: an omitted onChange toggles without a dispatch', async () => {
	await render(SilentCheckbox);
	await expectOmittedCallbackStillToggles();
});

test('SSR: an omitted onChange toggles without a dispatch', async () => {
	await renderSSR(SilentCheckbox);
	await expectOmittedCallbackStillToggles();
});
