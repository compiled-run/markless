import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import Basic from './scenarios/textbox-basic.tsrx';
import FieldWithHelpAndError from './scenarios/textbox-help-and-error.tsrx';
import InvalidField from './scenarios/textbox-invalid.tsrx';
import LockedField from './scenarios/textbox-locked.tsrx';
import PartRestrictions from './scenarios/textbox-part-restrictions.tsrx';
import PrefilledField from './scenarios/textbox-prefilled.tsrx';
import SignupForm from './scenarios/textbox-signup-form.tsrx';
import FieldWithHelp from './scenarios/textbox-with-help.tsrx';

// Colocated browser suite for the textbox family. Each test renders a realistic
// consumer scenario, and the locators name the part anatomy: root, input,
// textarea, label, description, error.
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
// The part-restrictions example holds one field the control tightens and one it
// tries to loosen.
const StricterRoot = page.getByTestId('stricter-root');
const StricterInput = page.getByTestId('stricter-input');
const LooserRoot = page.getByTestId('looser-root');
const LooserInput = page.getByTestId('looser-input');
// The invalid example holds the error written after the control and before it.
const AfterInput = page.getByTestId('after-input');
const AfterError = page.getByTestId('after-error');
const BeforeInput = page.getByTestId('before-input');
const BeforeError = page.getByTestId('before-error');

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be
// passed by reference or wrapped in a helper — the branch below keeps both call
// sites literal, which is why this idiom rather than a `mount` parameter.
const MODES = ['CSR', 'SSR'] as const;

// Same two runtime errors the checkbox suite captures (U-G in
// goals/headless-components/notes/parity-table.md), recorded red once in
// shared-read-refresh.test.ts.
function onUnmatchedRejection(event: PromiseRejectionEvent) {
	if (!String(event.reason).includes('_UNMATCHED')) return;
	event.preventDefault();
}

beforeEach(() => window.addEventListener('unhandledrejection', onUnmatchedRejection));

afterEach(async () => {
	await cleanup();
	await new Promise((resolve) => setTimeout(resolve, 50));
	window.removeEventListener('unhandledrejection', onUnmatchedRejection);
});

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
	// The label points at its own control, by a minted id nobody spelled.
	expect(el(Label).getAttribute('for')).toBe(control.getAttribute('id'));
	expect(control.id).toBeTruthy();
	// The control points back at the label for its name.
	expect(control.getAttribute('aria-labelledby')).toBe(el(Label).id);
}

function expectSignupFormRendered() {
	const username = el<HTMLInputElement>(UsernameInput);
	const bio = el<HTMLTextAreaElement>(BioTextarea);
	expect(username.tagName).toBe('INPUT');
	expect(bio.tagName).toBe('TEXTAREA');
	expect(bio.getAttribute('name')).toBe('bio');
	// Both controls carry their name the other way round, from the label they
	// point at, which is one handle bound once and readable by either control.
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
	// A restriction the control adds reaches the DOM; the root, which was not
	// told, keeps reporting what it was given.
	const stricter = el<HTMLInputElement>(StricterInput);
	expect(stricter.hasAttribute('required')).toBe(true);
	expect(stricter.hasAttribute('readonly')).toBe(true);
	expect(el(StricterRoot).hasAttribute('ui-required')).toBe(false);

	// The other direction does not work: a part may add a restriction, never
	// remove one the root set.
	expect(el<HTMLInputElement>(LooserInput).hasAttribute('required')).toBe(true);
	expect(el(LooserRoot).getAttribute('ui-required')).toBe('');
}

function expectHelpRendered() {
	expect(el(Description).textContent).toBe("We'll never share your email");
	expect(el<HTMLInputElement>(Input).getAttribute('aria-invalid')).toBe('false');
}

function expectInvalidRendered() {
	expect(el(AfterError).textContent).toBe('Password is required');
	// Every part of one widget instance seeds before any part renders, so the
	// error part's `textbox.invalid = true` is what the control reads.
	expect(el<HTMLInputElement>(AfterInput).getAttribute('aria-invalid')).toBe('true');

	// The same error written BEFORE the control: document order does not decide
	// what a part reads, so this control is invalid too.
	expect(el(BeforeError).textContent).toBe('Password is required');
	expect(el<HTMLInputElement>(BeforeInput).getAttribute('aria-invalid')).toBe('true');
}

function expectHelpAndErrorRendered() {
	expect(el(Description).textContent).toBe('Enter a valid email address');
	expect(el(TextboxError).textContent).toBe('Email format is invalid');
	// Neither message is named by the control: an aria-describedby handle list is
	// not expressible yet (U-C), so no part wires its id onto the control.
	expect(el<HTMLInputElement>(Input).hasAttribute('aria-describedby')).toBe(false);
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

	test(`${mode}: help text and an error render together, neither named by the control`, async () => {
		if (mode === 'CSR') await render(FieldWithHelpAndError);
		else await renderSSR(FieldWithHelpAndError);
		expectHelpAndErrorRendered();
	});
}

// U-N: an element() handle binds one live host, so the single-line control and
// the multi-line control cannot share one. The label's `for` therefore names the
// single-line control, and in a family that mounts only a textarea it renders a
// minted id no element carries. Clicking such a label focuses nothing. Turns
// green the day an IDREF over an unbound handle renders no attribute (or one
// handle may name whichever of two alternative controls is mounted).
test.fails('CSR: a label beside a multiline control names an element that exists', async () => {
	await render(SignupForm);
	const named = el(BioLabel).getAttribute('for');
	expect(named).not.toBeNull();
	expect(document.querySelector(`#${named}`)).not.toBeNull();
});

// --- typing ---------------------------------------------------------------

test('CSR: the control takes typing and the root follows it out of empty', async () => {
	await render(Basic);
	expect(el(Root).getAttribute('ui-empty')).toBe('');

	await userEvent.fill(el<HTMLInputElement>(Input), 'test user');
	expect(el<HTMLInputElement>(Input).value).toBe('test user');
	// `ui-empty` is a comparison over the same cell the keystroke wrote, in a
	// different part from the one that wrote it.
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
