import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import TermsForm from './scenarios/form.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import PartialSelection from './scenarios/partial-selection.tsrx';
import PrefilledForm from './scenarios/prefilled-form.tsrx';
import SettingsList from './scenarios/settings-list.tsrx';
import UnavailableOptions from './scenarios/unavailable-options.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';
import WithHelp from './scenarios/with-help.tsrx';

const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Indicator = page.getByTestId('indicator');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const HiddenInput = page.getByTestId('field');
const SubmitButton = page.getByTestId('submit');
const Submitted = page.getByTestId('submitted');
const Calls = page.getByTestId('calls');
const EmailsRoot = page.getByTestId('emails-root');
const EmailsTrigger = page.getByTestId('emails-trigger');
const EmailsIndicator = page.getByTestId('emails-indicator');
const EmailsLabel = page.getByTestId('emails-label');
const DigestRoot = page.getByTestId('digest-root');
const DigestTrigger = page.getByTestId('digest-trigger');
const DigestIndicator = page.getByTestId('digest-indicator');
const DigestLabel = page.getByTestId('digest-label');
const AlertsRoot = page.getByTestId('alerts-root');
const AlertsTrigger = page.getByTestId('alerts-trigger');
const AlertsIndicator = page.getByTestId('alerts-indicator');
const OffTrigger = page.getByTestId('off-trigger');
const OffIndicator = page.getByTestId('off-indicator');
const OffRoot = page.getByTestId('off-root');
const OnRoot = page.getByTestId('on-root');
const AfterTrigger = page.getByTestId('after-trigger');
const AfterDescription = page.getByTestId('after-description');
const AfterError = page.getByTestId('after-error');
const BeforeTrigger = page.getByTestId('before-trigger');
const BeforeError = page.getByTestId('before-error');
const FirstTrigger = page.getByTestId('first-trigger');
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

// A real submit would navigate the test iframe, so the event is dispatched directly.
// What the page then shows is the FormData the browser itself built for this form.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

function expectBasicRendered() {
	expect(el(Trigger).getAttribute('role')).toBe('checkbox');
	expect(el(Trigger).getAttribute('aria-checked')).toBe('false');
	expect(el(Root).hasAttribute('ui-checked')).toBe(false);
	expect(el(Indicator).textContent).toBe('');
	expect(el(Label).getAttribute('for')).toBe(el(Trigger).getAttribute('id'));
	expect(el(Trigger).id).toBeTruthy();
}

function expectSettingsRendered() {
	expect(el(EmailsTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(EmailsIndicator).textContent).toBe('');

	expect(el(DigestTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(DigestRoot).getAttribute('ui-checked')).toBe('');
	expect(el(DigestIndicator).textContent).toBe('Checked');

	expect(el(AlertsTrigger).getAttribute('aria-checked')).toBe('mixed');
	expect(el(AlertsRoot).getAttribute('ui-mixed')).toBe('');
	expect(el(AlertsRoot).hasAttribute('ui-checked')).toBe(false);
	expect(el(AlertsIndicator).textContent).toBe('Checked');

	expect(el(EmailsLabel).getAttribute('for')).toBe(el(EmailsTrigger).getAttribute('id'));
	expect(el(EmailsLabel).getAttribute('for')).not.toBe(el(DigestLabel).getAttribute('for'));
}

function expectDisabledRendered() {
	expect(el(OffTrigger).getAttribute('disabled')).toBe('');
	expect(el(OffRoot).getAttribute('ui-disabled')).toBe('');
	expect(el(OnRoot).getAttribute('ui-checked')).toBe('');
	expect(el(OnRoot).getAttribute('ui-disabled')).toBe('');
}

function expectDisabledBlocks() {
	el(OffTrigger).click();
	expect(el(OffIndicator).textContent).toBe('');
	expect(el(OffTrigger).getAttribute('ui-disabled')).toBe('');
}

function expectTermsFieldRendered() {
	expect(el(HiddenInput)).not.toBeNull();
	expect(el(HiddenInput).getAttribute('name')).toBe('terms');
	expect(el(HiddenInput).getAttribute('value')).toBe('on');
	expect(el(HiddenInput).hasAttribute('checked')).toBe(false);
	expect(el(HiddenInput).hasAttribute('required')).toBe(false);
	expect(getComputedStyle(el(HiddenInput).parentElement as Element).position).toBe('absolute');
	expect(el(SubmitButton).getAttribute('type')).toBe('submit');
}

function expectPrefilledFieldRendered() {
	expect(el(HiddenInput).getAttribute('checked')).toBe('');
	expect(el<HTMLInputElement>(HiddenInput).checked).toBe(true);
	expect(el(HiddenInput).getAttribute('value')).toBe('checked');
	expect(el(HiddenInput).getAttribute('required')).toBe('');
}

function expectPartialFieldRendered() {
	expect(el(HiddenInput).getAttribute('indeterminate')).toBe('');
	expect(el(HiddenInput).hasAttribute('checked')).toBe(false);
}

async function expectFieldFollowsTheTrigger() {
	el(Trigger).click();
	// The field is a different part from the trigger that wrote the state. A live
	// `checked` lands on the property, which is what a submission reads.
	await expect.poll(() => el<HTMLInputElement>(HiddenInput).checked).toBe(true);
	await expect.poll(() => submit().textContent).toBe('{"terms":"on"}');

	el(Trigger).click();
	await expect.poll(() => el<HTMLInputElement>(HiddenInput).checked).toBe(false);
	await expect.poll(() => submit().textContent).toBe('{}');
}

async function expectMixedResolvesOnFirstClick() {
	expect(el(HiddenInput).hasAttribute('indeterminate')).toBe(true);
	el(Trigger).click();
	await expect.poll(() => el(HiddenInput).hasAttribute('indeterminate')).toBe(false);
	expect(el<HTMLInputElement>(HiddenInput).checked).toBe(true);
}

function expectHelpRendered() {
	expect(el(Label).textContent).toBe('Subscribe to newsletter');
	expect(el(Label).getAttribute('for')).toBe(el(Trigger).id);
	expect(el(Description).textContent).toBe("We'll send you updates about new features");
	expect(el(Trigger).getAttribute('aria-invalid')).toBe('false');
	expect(page.getByTestId('error').query()).toBeNull();
}

function expectInvalidRendered() {
	expect(el(AfterDescription).textContent).toBe('Read our terms and conditions before accepting');
	expect(el(AfterError).textContent).toBe('Please accept the terms and conditions');
	// Every part of one widget instance seeds before any part renders, so the
	// error part's `checkbox.invalid = true` is what the trigger reads.
	expect(el(AfterTrigger).getAttribute('aria-invalid')).toBe('true');

	// The same error written BEFORE the trigger: document order does not decide
	// what a part reads, so this trigger is invalid too.
	expect(el(BeforeError).textContent).toBe('Please accept the terms and conditions');
	expect(el(BeforeTrigger).getAttribute('aria-invalid')).toBe('true');
}

async function expectConsumerCallbackFires() {
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstTrigger).getAttribute('aria-checked')).toBe('true');
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
	expect(el(SecondValue).textContent).toBe('false');
}

async function expectOmittedCallbackStillToggles() {
	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-checked')).toBe('true');
	expect(el(Calls).textContent).toBe('0');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders an unchecked checkbox across every part`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a settings list renders each option in its own state`, async () => {
		if (mode === 'CSR') await render(SettingsList);
		else await renderSSR(SettingsList);
		expectSettingsRendered();
	});

	test(`${mode}: unavailable options render their flags and do not toggle`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		expectDisabledRendered();
		expectDisabledBlocks();
	});

	test(`${mode}: the terms form renders the config a form needs`, async () => {
		if (mode === 'CSR') await render(TermsForm);
		else await renderSSR(TermsForm);
		expectTermsFieldRendered();
	});

	test(`${mode}: a prefilled form carries checked, value and required onto the field`, async () => {
		if (mode === 'CSR') await render(PrefilledForm);
		else await renderSSR(PrefilledForm);
		expectPrefilledFieldRendered();
	});

	test(`${mode}: a partly-selected box renders indeterminate rather than checked`, async () => {
		if (mode === 'CSR') await render(PartialSelection);
		else await renderSSR(PartialSelection);
		expectPartialFieldRendered();
	});

	test(`${mode}: an unchecked terms form submits nothing`, async () => {
		if (mode === 'CSR') await render(TermsForm);
		else await renderSSR(TermsForm);
		await expect.poll(() => submit().textContent).toBe('{}');
	});

	test(`${mode}: a prefilled form submits its own value under its name`, async () => {
		if (mode === 'CSR') await render(PrefilledForm);
		else await renderSSR(PrefilledForm);
		await expect.poll(() => submit().textContent).toBe('{"terms":"checked"}');
	});

	test(`${mode}: a partly-selected box submits nothing`, async () => {
		if (mode === 'CSR') await render(PartialSelection);
		else await renderSSR(PartialSelection);
		await expect.poll(() => submit().textContent).toBe('{}');
	});

	test(`${mode}: clicking the trigger syncs the hidden field and what the form submits`, async () => {
		if (mode === 'CSR') await render(TermsForm);
		else await renderSSR(TermsForm);
		await expectFieldFollowsTheTrigger();
	});

	test(`${mode}: a partly-selected box resolves to checked on the first click`, async () => {
		if (mode === 'CSR') await render(PartialSelection);
		else await renderSSR(PartialSelection);
		await expectMixedResolvesOnFirstClick();
	});

	test(`${mode}: help text renders and leaves the trigger valid`, async () => {
		if (mode === 'CSR') await render(WithHelp);
		else await renderSSR(WithHelp);
		expectHelpRendered();
	});

	test(`${mode}: a mounted error marks the trigger invalid, written after it or before it`, async () => {
		if (mode === 'CSR') await render(Invalid);
		else await renderSSR(Invalid);
		expectInvalidRendered();
	});

	test(`${mode}: a click calls the consumer onChange once with the next value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbackFires();
	});

	test(`${mode}: two sibling checkboxes each reach only their own handler`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectEachInstanceReachesItsOwnHandler();
	});

	test(`${mode}: an omitted onChange toggles without a dispatch`, async () => {
		if (mode === 'CSR') await render(WithoutOnChange);
		else await renderSSR(WithoutOnChange);
		await expectOmittedCallbackStillToggles();
	});
}

// CSR-only: these rows read the indicator, whose content is an arm inside a
// projected part, and such an arm does not re-render after an SSR resume. The
// derived attributes do follow a resume, and the SSR row below covers them.

test('CSR: clicking one option leaves its neighbours alone', async () => {
	await render(SettingsList);
	el(EmailsTrigger).click();
	await expect.poll(() => el(EmailsIndicator).textContent).toBe('Checked');
	await expect.poll(() => el(EmailsTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(EmailsRoot).getAttribute('ui-checked')).toBe('');
	expect(el(DigestIndicator).textContent).toBe('Checked');
	expect(el(DigestTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(AlertsIndicator).textContent).toBe('Checked');
	expect(el(AlertsTrigger).getAttribute('aria-checked')).toBe('mixed');

	el(EmailsTrigger).click();
	await expect.poll(() => el(EmailsIndicator).textContent).toBe('');
	await expect.poll(() => el(EmailsTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(EmailsRoot).hasAttribute('ui-checked')).toBe(false);
	expect(el(DigestIndicator).textContent).toBe('Checked');
});

test('CSR: a checked option unchecks on click', async () => {
	await render(SettingsList);
	el(DigestTrigger).click();
	await expect.poll(() => el(DigestIndicator).textContent).toBe('');
	await expect.poll(() => el(DigestTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(DigestRoot).hasAttribute('ui-checked')).toBe(false);
	expect(el(EmailsIndicator).textContent).toBe('');
	expect(el(EmailsTrigger).getAttribute('aria-checked')).toBe('false');
});

test('CSR: mixed goes to checked, then to unchecked', async () => {
	await render(SettingsList);
	expect(el(AlertsTrigger).getAttribute('aria-checked')).toBe('mixed');
	// mixed -> checked keeps the indicator up, checked -> unchecked takes it down.
	el(AlertsTrigger).click();
	await expect.poll(() => el(AlertsIndicator).textContent).toBe('Checked');
	await expect.poll(() => el(AlertsTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(AlertsRoot).getAttribute('ui-checked')).toBe('');
	expect(el(AlertsRoot).hasAttribute('ui-mixed')).toBe(false);
	el(AlertsTrigger).click();
	await expect.poll(() => el(AlertsIndicator).textContent).toBe('');
	await expect.poll(() => el(AlertsTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(AlertsRoot).hasAttribute('ui-checked')).toBe(false);
});

test('CSR: clicking the label toggles the option it names', async () => {
	await render(SettingsList);
	// The label names the trigger through a minted id, so a click on it is a
	// click on the checkbox — the label part has no handler of its own.
	el(EmailsLabel).click();
	await expect.poll(() => el(EmailsIndicator).textContent).toBe('Checked');

	el(DigestLabel).click();
	await expect.poll(() => el(DigestIndicator).textContent).toBe('');
});

test('SSR: the tri-state attributes follow a click after resume', async () => {
	await renderSSR(SettingsList);

	el(EmailsTrigger).click();
	await expect.poll(() => el(EmailsTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(EmailsRoot).getAttribute('ui-checked')).toBe('');
	expect(el(AlertsTrigger).getAttribute('aria-checked')).toBe('mixed');

	el(EmailsTrigger).click();
	await expect.poll(() => el(EmailsTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(EmailsRoot).hasAttribute('ui-checked')).toBe(false);

	el(AlertsTrigger).click();
	await expect.poll(() => el(AlertsTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(AlertsRoot).hasAttribute('ui-mixed')).toBe(false);
});


test('CSR: Space on the focused trigger toggles the checkbox', async () => {
	await render(Basic);
	el(Trigger).focus();
	expect(document.activeElement).toBe(el(Trigger));

	// Space activates a native button on keyup, so the trigger needs no rule of
	// its own for it; the family only has to not get in the way.
	await userEvent.keyboard(' ');
	await expect.poll(() => el(Indicator).textContent).toBe('Checked');
});

// A Markless handler runs after dispatch returns, so the trigger's
// `event.preventDefault()` on Enter lands after the browser has already decided
// whether to activate the button. This row asserts that timing, not either outcome:
// `defaultPrevented` is false when the dispatch is made and true a tick later.
test('CSR: the trigger asks to prevent Enter, and the request lands too late', async () => {
	await render(Basic);
	el(Trigger).focus();

	const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
	el(Trigger).dispatchEvent(enter);
	expect(enter.defaultPrevented).toBe(false);
	await expect.poll(() => enter.defaultPrevented).toBe(true);
});
