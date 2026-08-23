import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import ErrorBeforeTrigger from './scenarios/error-first.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import NotificationsForm from './scenarios/notifications-form.tsrx';
import SavedSettingsForm from './scenarios/saved-settings-form.tsrx';
import SettingsList from './scenarios/settings-list.tsrx';
import UnavailableOptions from './scenarios/unavailable-options.tsrx';
import WithHelp from './scenarios/with-help.tsrx';

const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Thumb = page.getByTestId('thumb');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const ToggleError = page.getByTestId('error');
const HiddenInput = page.getByTestId('field');
const SubmitButton = page.getByTestId('submit');
const Submitted = page.getByTestId('submitted');
// The settings list: emails starts off, digest starts on.
const EmailsRoot = page.getByTestId('emails-root');
const EmailsTrigger = page.getByTestId('emails-trigger');
const EmailsLabel = page.getByTestId('emails-label');
const DigestRoot = page.getByTestId('digest-root');
const DigestTrigger = page.getByTestId('digest-trigger');
const DigestLabel = page.getByTestId('digest-label');
// Switches nobody may change.
const OffRoot = page.getByTestId('off-root');
const OffTrigger = page.getByTestId('off-trigger');
const OnRoot = page.getByTestId('on-root');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// A real submit would navigate the test iframe, so the event is dispatched.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

function expectBasicRendered() {
	expect(el(Trigger).getAttribute('role')).toBe('switch');
	expect(el(Trigger).getAttribute('aria-checked')).toBe('false');
	expect(el(Trigger).getAttribute('aria-disabled')).toBe('false');
	expect(el(Root).hasAttribute('ui-checked')).toBe(false);
	expect(Thumb.query()).not.toBeNull();
	expect(el(Label).getAttribute('for')).toBe(el(Trigger).getAttribute('id'));
	expect(el(Trigger).id).toBeTruthy();
}

function expectSettingsRendered() {
	expect(el(EmailsTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(EmailsRoot).hasAttribute('ui-checked')).toBe(false);
	expect(el(DigestTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(DigestRoot).getAttribute('ui-checked')).toBe('');
	// Each switch mints its own trigger id, so a label names exactly one.
	expect(el(EmailsLabel).getAttribute('for')).not.toBe(el(DigestLabel).getAttribute('for'));
}

async function expectClickFlips() {
	el(EmailsTrigger).click();
	await expect.poll(() => el(EmailsTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(EmailsRoot).getAttribute('ui-checked')).toBe('');
	expect(el(EmailsTrigger).getAttribute('ui-checked')).toBe('');
	// The click landed in one family only: the neighbour kept its own value.
	expect(el(DigestTrigger).getAttribute('aria-checked')).toBe('true');

	el(EmailsTrigger).click();
	await expect.poll(() => el(EmailsTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(EmailsRoot).hasAttribute('ui-checked')).toBe(false);
	expect(el(DigestTrigger).getAttribute('aria-checked')).toBe('true');
}

// `<toggle.root checked>` seeds this switch on, and the server carries that seed in
// the payload, so a resumed instance holds `true` and the first click reaches false.
async function expectCheckedFlipsOff() {
	el(DigestTrigger).click();
	await expect.poll(() => el(DigestTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(DigestRoot).hasAttribute('ui-checked')).toBe(false);
	expect(el(EmailsTrigger).getAttribute('aria-checked')).toBe('false');
}

function expectDisabledRendered() {
	expect(el(OffTrigger).getAttribute('aria-disabled')).toBe('true');
	expect(el<HTMLButtonElement>(OffTrigger).disabled).toBe(true);
	expect(el(OffTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(OffRoot).getAttribute('ui-disabled')).toBe('');
	// Both flags at once on the switch that is on and locked.
	expect(el(OnRoot).getAttribute('ui-checked')).toBe('');
	expect(el(OnRoot).getAttribute('ui-disabled')).toBe('');
}

function expectDisabledBlocks() {
	el(OffTrigger).click();
	expect(el(OffTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(OffTrigger).getAttribute('ui-disabled')).toBe('');
}

function expectNotificationsFieldRendered() {
	expect(el(HiddenInput)).not.toBeNull();
	expect(el(HiddenInput).getAttribute('name')).toBe('notifications');
	expect(el(HiddenInput).getAttribute('value')).toBe('on');
	expect(el(HiddenInput).hasAttribute('checked')).toBe(false);
	expect(el(HiddenInput).hasAttribute('required')).toBe(false);
	// Present for a form and for assistive tech, absent from sight.
	expect(getComputedStyle(el(HiddenInput).parentElement as Element).position).toBe('absolute');
	// The library ships no class name a consumer stylesheet could collide with.
	expect((el(HiddenInput).parentElement as Element).hasAttribute('class')).toBe(false);
	expect(el(SubmitButton).getAttribute('type')).toBe('submit');
}

function expectSavedFieldRendered() {
	expect(el(HiddenInput).getAttribute('checked')).toBe('');
	expect(el<HTMLInputElement>(HiddenInput).checked).toBe(true);
	expect(el(HiddenInput).getAttribute('value')).toBe('enabled');
	expect(el(HiddenInput).getAttribute('required')).toBe('');
}

function expectHelpRendered() {
	expect(el(Description).textContent).toBe('(Receive notifications about important updates)');
	expect(el(Trigger).getAttribute('aria-invalid')).toBe('false');
	// The help text is the switch's description, by a minted id nobody spelled.
	expect(el(Trigger).getAttribute('aria-describedby')).toBe(el(Description).id);
	expect(el(Description).id).toBeTruthy();
}

function expectInvalidRendered() {
	expect(el(ToggleError).textContent).toBe('This field is required');
	// Seeding completes before any part renders, so the error part's
	// `toggle.invalid = true` is what the trigger reads.
	expect(el(Trigger).getAttribute('aria-invalid')).toBe('true');
	// An invalid switch says why: the error is its description.
	expect(el(Trigger).getAttribute('aria-describedby')).toBe(el(ToggleError).id);
	expect(el(ToggleError).id).toBeTruthy();
}

function expectErrorFirstRendered() {
	// The same error written BEFORE the trigger: seeding completes before any
	// part renders, so document order does not decide what a part reads.
	expect(el(ToggleError).textContent).toBe('This field is required');
	expect(el(Trigger).getAttribute('aria-invalid')).toBe('true');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders an off switch across every part`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a settings list renders each switch in its own state`, async () => {
		if (mode === 'CSR') await render(SettingsList);
		else await renderSSR(SettingsList);
		expectSettingsRendered();
	});

	test(`${mode}: clicking the trigger flips one switch and leaves its neighbours alone`, async () => {
		if (mode === 'CSR') await render(SettingsList);
		else await renderSSR(SettingsList);
		await expectClickFlips();
	});

	test(`${mode}: a checked switch flips off on click`, async () => {
		if (mode === 'CSR') await render(SettingsList);
		else await renderSSR(SettingsList);
		await expectCheckedFlipsOff();
	});

	test(`${mode}: a disabled trigger renders its flags and does not flip`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		expectDisabledRendered();
		expectDisabledBlocks();
	});

	test(`${mode}: the field renders the config a form needs`, async () => {
		if (mode === 'CSR') await render(NotificationsForm);
		else await renderSSR(NotificationsForm);
		expectNotificationsFieldRendered();
	});

	test(`${mode}: saved settings carry checked, value and required onto the field`, async () => {
		if (mode === 'CSR') await render(SavedSettingsForm);
		else await renderSSR(SavedSettingsForm);
		expectSavedFieldRendered();
	});

	test(`${mode}: an off switch submits nothing`, async () => {
		if (mode === 'CSR') await render(NotificationsForm);
		else await renderSSR(NotificationsForm);
		await expect.poll(() => submit().textContent).toBe('{}');
	});

	test(`${mode}: saved settings submit their own value under the name`, async () => {
		if (mode === 'CSR') await render(SavedSettingsForm);
		else await renderSSR(SavedSettingsForm);
		await expect.poll(() => submit().textContent).toBe('{"notifications":"enabled"}');
	});

	test(`${mode}: help text renders and leaves the trigger valid`, async () => {
		if (mode === 'CSR') await render(WithHelp);
		else await renderSSR(WithHelp);
		expectHelpRendered();
	});

	test(`${mode}: a mounted error carries its message and marks the trigger invalid`, async () => {
		if (mode === 'CSR') await render(Invalid);
		else await renderSSR(Invalid);
		expectInvalidRendered();
	});

	test(`${mode}: an error written before the trigger still marks it invalid`, async () => {
		if (mode === 'CSR') await render(ErrorBeforeTrigger);
		else await renderSSR(ErrorBeforeTrigger);
		expectErrorFirstRendered();
	});
}

test('CSR: clicking the label flips the switch it names', async () => {
	await render(Basic);
	// The label names the trigger through a minted id, so a click on it is a
	// click on the switch — the label part has no handler of its own.
	el(Label).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-checked')).toBe('true');

	el(Label).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-checked')).toBe('false');
});

// --- keyboard -------------------------------------------------------------
//
// A switch activates on Space and on Enter, which is exactly what a native
// button already does, so the trigger carries no keyboard rule of its own.

async function expectKeyFlips(key: string) {
	el(Trigger).focus();
	expect(document.activeElement).toBe(el(Trigger));

	await userEvent.keyboard(key);
	await expect.poll(() => el(Trigger).getAttribute('aria-checked')).toBe('true');

	await userEvent.keyboard(key);
	await expect.poll(() => el(Trigger).getAttribute('aria-checked')).toBe('false');
}

test('CSR: Space on the focused trigger flips the switch', async () => {
	await render(Basic);
	await expectKeyFlips(' ');
});

test('CSR: Enter on the focused trigger flips the switch', async () => {
	await render(Basic);
	await expectKeyFlips('{Enter}');
});

test('CSR: a disabled trigger ignores Space and Enter', async () => {
	await render(UnavailableOptions);
	el(OffTrigger).focus();
	// A disabled button cannot take focus, so a key press cannot reach it.
	expect(document.activeElement).not.toBe(el(OffTrigger));
	await userEvent.keyboard(' ');
	await userEvent.keyboard('{Enter}');
	expect(el(OffTrigger).getAttribute('aria-checked')).toBe('false');
});

test('CSR: clicking the trigger syncs the hidden field and what the form submits', async () => {
	await render(NotificationsForm);

	el(Trigger).click();
	await expect.poll(() => el<HTMLInputElement>(HiddenInput).checked).toBe(true);
	// A switch with no value of its own submits the browser default "on".
	await expect.poll(() => submit().textContent).toBe('{"notifications":"on"}');

	el(Trigger).click();
	await expect.poll(() => el<HTMLInputElement>(HiddenInput).checked).toBe(false);
	await expect.poll(() => submit().textContent).toBe('{}');
});

// --- why the Submit button is never clicked ------------------------------
//
// A real click on Submit navigates the harness iframe and kills the run, because a
// consumer's handler runs after dispatch returns and its `event.preventDefault()`
// lands once the browser has already committed the navigation. This row pins that
// ordering, and it is why every form row above dispatches the event instead.
test('CSR: a consumer submit handler runs after dispatch returns', async () => {
	await render(SavedSettingsForm);

	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	// Nothing has been written yet: the handler has not run at this point, which
	// is why preventDefault cannot stop a native submission.
	expect(el(Submitted).textContent).toBe('');
	await expect.poll(() => el(Submitted).textContent).toBe('{"notifications":"enabled"}');
});
