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
import WithOnChange from './scenarios/with-onchange.tsrx';

const Root = page.getByTestId('root');
const Input = page.getByTestId('input');
const Textarea = page.getByTestId('textarea');
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
const AfterRoot = page.getByTestId('after-root');
const BeforeRoot = page.getByTestId('before-root');
const SingleInput = page.getByTestId('single-input');
const SingleValue = page.getByTestId('single-value');
const MultiTextarea = page.getByTestId('multi-textarea');
const MultiValue = page.getByTestId('multi-value');
const Calls = page.getByTestId('calls');

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
	expect(control.hasAttribute('aria-invalid')).toBe(false);
	expect(el(Root).getAttribute('ui-empty')).toBe('');
	expect(el(Root).hasAttribute('ui-disabled')).toBe(false);
	expect(el(Root).hasAttribute('ui-required')).toBe(false);
	expect(el(Root).hasAttribute('ui-readonly')).toBe(false);
	expect(el(Root).hasAttribute('ui-invalid')).toBe(false);
	// The label names the control by a minted id nobody spelled, and nothing else does.
	expect(el(Label).getAttribute('for')).toBe(control.getAttribute('id'));
	expect(control.id).toBeTruthy();
	expect(control.hasAttribute('aria-labelledby')).toBe(false);
	// Neither message part is placed, so both handles drop out and no empty
	// attribute is left behind.
	expect(control.hasAttribute('aria-describedby')).toBe(false);
}

function expectSignupFormRendered() {
	const username = el<HTMLInputElement>(UsernameInput);
	const bio = el<HTMLTextAreaElement>(BioTextarea);
	expect(username.tagName).toBe('INPUT');
	expect(bio.tagName).toBe('TEXTAREA');
	expect(bio.getAttribute('name')).toBe('bio');
	expect(el(UsernameLabel).getAttribute('for')).toBe(username.id);
	// A textarea is named by aria-labelledby: one handle cannot also bind the input's `for`.
	expect(bio.getAttribute('aria-labelledby')).toBe(el(BioLabel).id);
	expect(username.hasAttribute('aria-labelledby')).toBe(false);
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
	expect(el<HTMLInputElement>(Input).hasAttribute('aria-invalid')).toBe(false);
	expect(el(Root).hasAttribute('ui-invalid')).toBe(false);
	// Only the description was placed, so the error drops out of the list.
	expect(el<HTMLInputElement>(Input).getAttribute('aria-describedby')).toBe(el(Description).id);
	expect(el(Description).id).toBeTruthy();
}

function expectInvalidRendered() {
	expect(el(AfterError).textContent).toBe('Password is required');
	// Every part of one widget instance seeds before any part renders, so document
	// order does not decide what a part reads - the error marks the control either way.
	expect(el<HTMLInputElement>(AfterInput).getAttribute('aria-invalid')).toBe('true');
	// The root reports the same state for styling, whichever side the error sits on.
	expect(el(AfterRoot).getAttribute('ui-invalid')).toBe('');
	expect(el(BeforeRoot).getAttribute('ui-invalid')).toBe('');
	// Only the error was placed, so the description drops out and the error is
	// named alone - no stray space, no dangling id.
	expect(el<HTMLInputElement>(AfterInput).getAttribute('aria-describedby')).toBe(
		el(AfterError).id,
	);
	expect(el(AfterError).id).toBeTruthy();

	expect(el(BeforeError).textContent).toBe('Password is required');
	expect(el<HTMLInputElement>(BeforeInput).getAttribute('aria-invalid')).toBe('true');
	expect(el<HTMLInputElement>(BeforeInput).getAttribute('aria-describedby')).toBe(
		el(BeforeError).id,
	);
}

function expectHelpAndErrorRendered() {
	expect(el(Description).textContent).toBe('Enter a valid email address');
	expect(el(TextboxError).textContent).toBe('Email format is invalid');
	expect(el(Description).id).toBeTruthy();
	expect(el(TextboxError).id).toBeTruthy();
	expect(el(Description).id).not.toBe(el(TextboxError).id);
	// Both ids, error first, on the single-line control and the multi-line one
	// alike: the hint is written above the error in this page, so the order is
	// the family's rather than the document's.
	const named = `${el(TextboxError).id} ${el(Description).id}`;
	expect(el<HTMLInputElement>(Input).getAttribute('aria-describedby')).toBe(named);
	expect(el<HTMLTextAreaElement>(Textarea).getAttribute('aria-describedby')).toBe(named);
	expect(el<HTMLInputElement>(Input).getAttribute('aria-invalid')).toBe('true');
	expect(el<HTMLTextAreaElement>(Textarea).getAttribute('aria-invalid')).toBe('true');
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

	test(`${mode}: both messages are named by the input and the textarea, error first`, async () => {
		if (mode === 'CSR') await render(FieldWithHelpAndError);
		else await renderSSR(FieldWithHelpAndError);
		expectHelpAndErrorRendered();
	});

	test(`${mode}: the text a field starts with calls nobody`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		expect(el<HTMLInputElement>(SingleInput).value).toBe('ada');
		expect(el(Calls).textContent).toBe('0');
		expect(el(SingleValue).textContent).toBe('');
	});
}

// ---------------------------------------------------------------------------
// The consumer's callback. Each keystroke is polled for before the next: a burst
// typed into a control whose handler is still waking reaches the family as one
// change, and one change is one call.
// ---------------------------------------------------------------------------

// A programmatic focus leaves the caret at the front of a prefilled control.
function focusAtEnd(control: HTMLInputElement | HTMLTextAreaElement) {
	control.focus();
	control.setSelectionRange(control.value.length, control.value.length);
}

test('CSR: every keystroke calls the consumer once with the text so far', async () => {
	await render(WithOnChange);

	focusAtEnd(el<HTMLInputElement>(SingleInput));
	await userEvent.keyboard('m');
	await expect.poll(() => el(SingleValue).textContent).toBe('adam');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard('s');
	await expect.poll(() => el(SingleValue).textContent).toBe('adams');
	await expect.poll(() => el(Calls).textContent).toBe('2');
	expect(el(MultiValue).textContent).toBe('');
});

test('CSR: the multiline control reports to the consumer the same way', async () => {
	await render(WithOnChange);

	focusAtEnd(el<HTMLTextAreaElement>(MultiTextarea));
	await userEvent.keyboard('h');
	await expect.poll(() => el(MultiValue).textContent).toBe('h');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard('i');
	await expect.poll(() => el(MultiValue).textContent).toBe('hi');
	await expect.poll(() => el(Calls).textContent).toBe('2');
	expect(el(SingleValue).textContent).toBe('');
});

test('CSR: clearing a field calls the consumer with the empty text', async () => {
	await render(WithOnChange);

	focusAtEnd(el<HTMLInputElement>(SingleInput));
	await userEvent.keyboard('m');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.clear(el<HTMLInputElement>(SingleInput));
	await expect.poll(() => el(Calls).textContent).toBe('2');
	expect(el(SingleValue).textContent).toBe('');
	expect(el(page.getByTestId('single-root')).getAttribute('ui-empty')).toBe('');
});

test('SSR: the first keystroke after a resume reaches the consumer', async () => {
	await renderSSR(WithOnChange);

	focusAtEnd(el<HTMLInputElement>(SingleInput));
	await userEvent.keyboard('m');
	await expect.poll(() => el(SingleValue).textContent).toBe('adam');
	await expect.poll(() => el(Calls).textContent).toBe('1');
});

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

// ---------------------------------------------------------------------------
// Composition. This family mirrors the control rather than deriving from it and
// binds no commit key, so the thing an IME can break here is the write-back:
// `value={textbox.value}` puts the family's own idea of the text onto the
// element, and a pre-edit is text the family has no idea about yet.
// ---------------------------------------------------------------------------

const drained = () => new Promise((resolve) => setTimeout(resolve, 1000));

/**
 * The region an IME owns inside a plain field, as the events a real composition
 * raises around a pre-edit that is already in the field's own text.
 */
function composition(field: HTMLInputElement | HTMLTextAreaElement) {
	field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
	const write = (text: string) => {
		field.value = text;
		field.setSelectionRange(text.length, text.length);
	};
	return {
		preEdit(text: string) {
			write(text);
			field.dispatchEvent(
				new CompositionEvent('compositionupdate', { bubbles: true, data: text }),
			);
			field.dispatchEvent(
				new InputEvent('input', {
					bubbles: true,
					inputType: 'insertCompositionText',
					data: text,
					isComposing: true,
				}),
			);
		},
		/** The candidate that was chosen, which is not what the pre-edit showed. */
		commit(text: string) {
			write(text);
			field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
			field.dispatchEvent(
				new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: text }),
			);
		},
	};
}

test('CSR: a pre-edit is never written back over, and the candidate is what lands', async () => {
	await render(Basic);
	const control = el<HTMLInputElement>(Input);
	control.focus();

	const compose = composition(control);
	for (const preEdit of ['n', 'ni', 'nihao']) compose.preEdit(preEdit);

	// Every write the pre-edits scheduled is let go of: a write-back that was
	// going to replace the pre-edit with the family's own text has landed by now.
	await drained();
	expect(control.value).toBe('nihao');

	// The candidate is not the pre-edit, which is what makes a write-back of the
	// wrong text nameable: 'nihao' is a value this control must not end on.
	compose.commit('你好');
	await expect.poll(() => control.value).toBe('你好');
	await expect.poll(() => el(Root).hasAttribute('ui-empty')).toBe(false);
});

test('CSR: a composition into the multiline control lands the same way', async () => {
	await render(SignupForm);
	const control = el<HTMLTextAreaElement>(BioTextarea);
	control.focus();

	const compose = composition(control);
	compose.preEdit('nihao');
	await drained();
	expect(control.value).toBe('nihao');

	compose.commit('你好');
	await expect.poll(() => control.value).toBe('你好');
	await expect.poll(() => el(BioRoot).hasAttribute('ui-empty')).toBe(false);
});

// The family binds no key handler at all, so Enter means what the platform says
// it means in each control. A real submit would navigate the test iframe, so the
// form's own event is caught and counted instead.
function countSubmits(form: HTMLFormElement) {
	const seen = { count: 0 };
	form.addEventListener('submit', (event) => {
		event.preventDefault();
		seen.count += 1;
	});
	return seen;
}

function formOf(control: HTMLInputElement | HTMLTextAreaElement) {
	const { form } = control;
	if (!form) throw new Error('Expected the control to be inside a form.');
	return form;
}

test('CSR: enter in the single-line control submits and never reaches its value', async () => {
	await render(SignupForm);
	const control = el<HTMLInputElement>(UsernameInput);
	const seen = countSubmits(formOf(control));

	await userEvent.fill(control, 'ada');
	control.focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => seen.count).toBe(1);
	// Implicit submission, not text: the value is exactly what was typed.
	expect(control.value).toBe('ada');
	expect(el(UsernameRoot).hasAttribute('ui-empty')).toBe(false);
});

test('CSR: enter in the multiline control breaks the line and submits nothing', async () => {
	await render(SignupForm);
	const control = el<HTMLTextAreaElement>(BioTextarea);
	const seen = countSubmits(formOf(control));

	await userEvent.fill(control, 'first');
	control.focus();
	await userEvent.keyboard('{Enter}second');
	await expect.poll(() => control.value).toBe('first\nsecond');
	// The gesture window has been waited out by the poll above, so a submit that
	// was going to arrive has arrived.
	expect(seen.count).toBe(0);
});

// There is no commit step to revert to: the control writes the family cell on
// every keystroke, so escape leaves both exactly as typed. A commit/revert
// session is the `editable` family's job, not this one's.
test('CSR: escape leaves the typed words in place', async () => {
	await render(Basic);
	const control = el<HTMLInputElement>(Input);

	await userEvent.fill(control, 'half typed');
	control.focus();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Root).hasAttribute('ui-empty')).toBe(false);
	expect(control.value).toBe('half typed');
});

test('CSR: blur leaves the typed words in place', async () => {
	await render(SignupForm);
	const control = el<HTMLInputElement>(UsernameInput);

	await userEvent.fill(control, 'ada');
	// The typing has to have reached the family cell before focus leaves, or the
	// row proves nothing about what blur did to it.
	await expect.poll(() => el(UsernameRoot).hasAttribute('ui-empty')).toBe(false);

	control.focus();
	el<HTMLTextAreaElement>(BioTextarea).focus();
	await expect.poll(() => document.activeElement).toBe(el(BioTextarea));
	expect(control.value).toBe('ada');
	expect(el(UsernameRoot).hasAttribute('ui-empty')).toBe(false);
});
