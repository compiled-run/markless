import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import FieldWithHelpAndError from './scenarios/help-and-error.tsrx';
import InvalidField from './scenarios/invalid.tsrx';
import LockedField from './scenarios/locked.tsrx';
import PartRestrictions from './scenarios/part-restrictions.tsrx';
import PrefilledField from './scenarios/prefilled.tsrx';
import SignupForm from './scenarios/signup-form.tsrx';
import FieldWithHelp from './scenarios/with-help.tsrx';

const Root = page.getByTestId('root');
const Input = page.getByTestId('input');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const TextboxError = page.getByTestId('error');
const UsernameRoot = page.getByTestId('username-root');
const UsernameInput = page.getByTestId('username-input');
const UsernameLabel = page.getByTestId('username-label');
const BioRoot = page.getByTestId('bio-root');
const BioTextarea = page.getByTestId('bio-textarea');
const BioLabel = page.getByTestId('bio-label');
const StricterRoot = page.getByTestId('stricter-root');
const StricterInput = page.getByTestId('stricter-input');
const LooserRoot = page.getByTestId('looser-root');
const LooserInput = page.getByTestId('looser-input');
const AfterInput = page.getByTestId('after-input');
const AfterError = page.getByTestId('after-error');
const BeforeInput = page.getByTestId('before-input');
const BeforeError = page.getByTestId('before-error');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function expectBasicRendered() {
	const control = el<HTMLInputElement>(Input);
	expect(control.tagName).toBe('INPUT');
	expect(control.getAttribute('name')).toBe('username');
	expect(control.value).toBe('');
	expect(control.getAttribute('aria-invalid')).toBe('false');
	expect(el(Root).getAttribute('ui-empty')).toBe('');
	expect(el(Root).hasAttribute('ui-disabled')).toBe(false);
	expect(el(Root).hasAttribute('ui-required')).toBe(false);
	expect(el(Root).hasAttribute('ui-readonly')).toBe(false);
	// The label and control name each other by a minted id nobody spelled.
	expect(el(Label).getAttribute('for')).toBe(control.getAttribute('id'));
	expect(control.id).toBeTruthy();
	expect(control.getAttribute('aria-labelledby')).toBe(el(Label).id);
}

function expectSignupFormRendered() {
	const username = el<HTMLInputElement>(UsernameInput);
	const bio = el<HTMLTextAreaElement>(BioTextarea);
	expect(username.tagName).toBe('INPUT');
	expect(bio.tagName).toBe('TEXTAREA');
	expect(bio.getAttribute('name')).toBe('bio');
	expect(username.getAttribute('aria-labelledby')).toBe(el(UsernameLabel).id);
	expect(bio.getAttribute('aria-labelledby')).toBe(el(BioLabel).id);
	// Two instances mint two labels, so neither names the other's control.
	expect(el(BioLabel).id).not.toBe(el(UsernameLabel).id);
}

function expectPrefilledRendered() {
	expect(el<HTMLInputElement>(Input).value).toBe('test value');
	expect(el(Root).hasAttribute('ui-empty')).toBe(false);
}

function expectLockedRendered() {
	const control = el<HTMLInputElement>(Input);
	expect(control.disabled).toBe(true);
	expect(control.hasAttribute('required')).toBe(true);
	expect(control.hasAttribute('readonly')).toBe(true);
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(el(Root).getAttribute('ui-required')).toBe('');
	expect(el(Root).getAttribute('ui-readonly')).toBe('');
}

function expectPartRestrictions() {
	// A restriction the control adds reaches the DOM; the root, not told, reports
	// what it was given.
	const stricter = el<HTMLInputElement>(StricterInput);
	expect(stricter.hasAttribute('required')).toBe(true);
	expect(stricter.hasAttribute('readonly')).toBe(true);
	expect(el(StricterRoot).hasAttribute('ui-required')).toBe(false);

	expect(el<HTMLInputElement>(LooserInput).hasAttribute('required')).toBe(true);
	expect(el(LooserRoot).getAttribute('ui-required')).toBe('');
}

function expectHelpRendered() {
	expect(el(Description).textContent).toBe("We'll never share your email");
	expect(el<HTMLInputElement>(Input).getAttribute('aria-invalid')).toBe('false');
	expect(el<HTMLInputElement>(Input).getAttribute('aria-describedby')).toBe(el(Description).id);
	expect(el(Description).id).toBeTruthy();
}

function expectInvalidRendered() {
	expect(el(AfterError).textContent).toBe('Password is required');
	// Every part of one widget instance seeds before any part renders, so document
	// order does not decide what a part reads - the error marks the control either way.
	expect(el<HTMLInputElement>(AfterInput).getAttribute('aria-invalid')).toBe('true');
	expect(el<HTMLInputElement>(AfterInput).getAttribute('aria-describedby')).toBe(
		el(AfterError).id,
	);
	expect(el(AfterError).id).toBeTruthy();

	expect(el(BeforeError).textContent).toBe('Password is required');
	expect(el<HTMLInputElement>(BeforeInput).getAttribute('aria-invalid')).toBe('true');
}

function expectHelpAndErrorRendered() {
	expect(el(Description).textContent).toBe('Enter a valid email address');
	expect(el(TextboxError).textContent).toBe('Email format is invalid');
	// aria-describedby names exactly one id, so the second message sits unattached
	// until a handle list is expressible.
	const described = el<HTMLInputElement>(Input).getAttribute('aria-describedby');
	expect(described).toBeTruthy();
	expect(document.getElementById(described as string)).toBe(el(Description));
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a labelled, empty single-line field`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a form renders a single-line and a multi-line field side by side`, async () => {
		if (mode === 'CSR') await render(SignupForm);
		else await renderSSR(SignupForm);
		expectSignupFormRendered();
	});

	test(`${mode}: a prefilled field starts out of its empty state`, async () => {
		if (mode === 'CSR') await render(PrefilledField);
		else await renderSSR(PrefilledField);
		expectPrefilledRendered();
	});

	test(`${mode}: a locked field carries every restriction the root set`, async () => {
		if (mode === 'CSR') await render(LockedField);
		else await renderSSR(LockedField);
		expectLockedRendered();
	});

	test(`${mode}: a control may add a restriction the root did not set, and may not remove one`, async () => {
		if (mode === 'CSR') await render(PartRestrictions);
		else await renderSSR(PartRestrictions);
		expectPartRestrictions();
	});

	test(`${mode}: help text renders and leaves the control valid`, async () => {
		if (mode === 'CSR') await render(FieldWithHelp);
		else await renderSSR(FieldWithHelp);
		expectHelpRendered();
	});

	test(`${mode}: a mounted error marks the control invalid, written after it or before it`, async () => {
		if (mode === 'CSR') await render(InvalidField);
		else await renderSSR(InvalidField);
		expectInvalidRendered();
	});

	test(`${mode}: help text and an error render together, the first of them naming the control`, async () => {
		if (mode === 'CSR') await render(FieldWithHelpAndError);
		else await renderSSR(FieldWithHelpAndError);
		expectHelpAndErrorRendered();
	});
}

// Expected red: an element() handle binds one live host, so the label's `for` always
// names the single-line control and a textarea-only field names an id nothing carries.
test.fails('CSR: a label beside a multiline control names an element that exists', async () => {
	await render(SignupForm);
	const named = el(BioLabel).getAttribute('for');
	expect(named).not.toBeNull();
	expect(document.getElementById(named as string)).not.toBeNull();
});

test('CSR: the control takes typing and the root follows it out of empty', async () => {
	await render(Basic);
	expect(el(Root).getAttribute('ui-empty')).toBe('');

	await userEvent.fill(el<HTMLInputElement>(Input), 'test user');
	expect(el<HTMLInputElement>(Input).value).toBe('test user');
	// `ui-empty` reads the cell the keystroke wrote, from a different part.
	await expect.poll(() => el(Root).hasAttribute('ui-empty')).toBe(false);
});

test('CSR: the multiline control takes typing too', async () => {
	await render(SignupForm);

	await userEvent.fill(el<HTMLTextAreaElement>(BioTextarea), 'test bio');
	expect(el<HTMLTextAreaElement>(BioTextarea).value).toBe('test bio');
	await expect.poll(() => el(BioRoot).hasAttribute('ui-empty')).toBe(false);
});

test('CSR: clearing a prefilled field puts the root back to empty', async () => {
	await render(PrefilledField);
	expect(el(Root).hasAttribute('ui-empty')).toBe(false);

	await userEvent.clear(el<HTMLInputElement>(Input));
	await expect.poll(() => el(Root).getAttribute('ui-empty')).toBe('');
});

test('CSR: typing in one field leaves its neighbour alone', async () => {
	await render(SignupForm);

	await userEvent.fill(el<HTMLInputElement>(UsernameInput), 'only here');
	await expect.poll(() => el(UsernameRoot).hasAttribute('ui-empty')).toBe(false);
	expect(el<HTMLTextAreaElement>(BioTextarea).value).toBe('');
	expect(el(BioRoot).getAttribute('ui-empty')).toBe('');
});

test('CSR: clicking the label focuses the control it names', async () => {
	await render(Basic);

	el(Label).click();
	await expect.poll(() => document.activeElement).toBe(el(Input));
});

test('CSR: a disabled control takes no typing', async () => {
	await render(LockedField);
	expect(el<HTMLInputElement>(Input).disabled).toBe(true);

	el(Input).focus();
	await userEvent.keyboard('nope');
	expect(el<HTMLInputElement>(Input).value).toBe('');
});
