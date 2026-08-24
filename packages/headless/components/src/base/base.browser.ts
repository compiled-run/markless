import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import ToggleButtons from './scenarios/toggle-buttons.tsrx';

const Button = page.getByRole('button', { name: 'Press' });
const Label = page.getByText('Name');
const Hidden = page.getByText('Hidden');
const Field = page.getByTestId('field');
const Mute = page.getByRole('button', { name: 'Mute' });
const Bold = page.getByRole('button', { name: 'Bold' });
const Locked = page.getByRole('button', { name: 'Locked' });
const Plain = page.getByRole('button', { name: 'Plain' });
const Value = page.getByTestId('value');
const Calls = page.getByTestId('calls');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function expectBasicRendered() {
	expect(el(Button).getAttribute('type')).toBe('button');
	expect(el(Button).hasAttribute('aria-pressed')).toBe(false);
	expect(el(Button).hasAttribute('ui-pressed')).toBe(false);
	expect(el(Button).hasAttribute('disabled')).toBe(false);

	expect(el(Label).tagName).toBe('LABEL');
	expect(el(Label).getAttribute('for')).toBe(el(Field).id);
	expect(el(Field).id).toBe('field-id');

	expect(el(Hidden).tagName).toBe('SPAN');
	expect(getComputedStyle(el(Hidden)).position).toBe('absolute');
	expect(el(Hidden).hasAttribute('class')).toBe(false);
}

function expectToggleButtonsRendered() {
	expect(el(Mute).getAttribute('aria-pressed')).toBe('false');
	expect(el(Mute).hasAttribute('ui-pressed')).toBe(false);
	expect(el(Bold).getAttribute('aria-pressed')).toBe('true');
	expect(el(Bold).getAttribute('ui-pressed')).toBe('');
	expect(el(Locked).getAttribute('aria-pressed')).toBe('false');
	expect(el<HTMLButtonElement>(Locked).disabled).toBe(true);
}

// A button without the capability is the plain button it was: no pressed state at
// all, so a reader announces it as a command rather than as something switched off.
function expectPlainButtonCarriesNoPressedState() {
	expect(el(Plain).getAttribute('type')).toBe('button');
	expect(el(Plain).hasAttribute('aria-pressed')).toBe(false);
	expect(el(Plain).hasAttribute('ui-pressed')).toBe(false);
}

async function expectClickFlipsOnePressedButton() {
	el(Mute).click();
	await expect.poll(() => el(Mute).getAttribute('aria-pressed')).toBe('true');
	expect(el(Mute).getAttribute('ui-pressed')).toBe('');
	expect(el(Bold).getAttribute('aria-pressed')).toBe('true');

	el(Mute).click();
	await expect.poll(() => el(Mute).getAttribute('aria-pressed')).toBe('false');
	expect(el(Mute).hasAttribute('ui-pressed')).toBe(false);
}

// The seed the server carried: a button that starts pressed reaches false first.
async function expectPressedFlipsOff() {
	el(Bold).click();
	await expect.poll(() => el(Bold).getAttribute('aria-pressed')).toBe('false');
	expect(el(Bold).hasAttribute('ui-pressed')).toBe(false);
}

// The native button turns Enter and Space into a click, so the keyboard needs no
// handler of its own here.
async function expectKeyboardFlips() {
	el(Mute).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Mute).getAttribute('aria-pressed')).toBe('true');
	expect(el(Mute).getAttribute('ui-pressed')).toBe('');

	await userEvent.keyboard(' ');
	await expect.poll(() => el(Mute).getAttribute('aria-pressed')).toBe('false');
	expect(el(Mute).hasAttribute('ui-pressed')).toBe(false);
}

async function expectConsumerCallbackFires() {
	expect(el(Calls).textContent).toBe('0');
	expect(el(Value).textContent).toBe('');

	el(Mute).click();
	await expect.poll(() => el(Value).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	el(Mute).click();
	await expect.poll(() => el(Value).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('2');
}

// A button with no handler of the consumer's own still flips.
async function expectOmittedOnChangeFlipsAnyway() {
	el(Bold).click();
	await expect.poll(() => el(Bold).getAttribute('aria-pressed')).toBe('false');
	expect(el(Calls).textContent).toBe('0');
}

for (const mode of MODES) {
	test(`${mode}: base one-offs render their single elements`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a pressed button reports its state, a plain one carries none`, async () => {
		if (mode === 'CSR') await render(ToggleButtons);
		else await renderSSR(ToggleButtons);
		expectToggleButtonsRendered();
		expectPlainButtonCarriesNoPressedState();
	});

	test(`${mode}: clicking flips one pressed button and leaves its neighbours alone`, async () => {
		if (mode === 'CSR') await render(ToggleButtons);
		else await renderSSR(ToggleButtons);
		await expectClickFlipsOnePressedButton();
	});

	test(`${mode}: a button seeded pressed flips off first`, async () => {
		if (mode === 'CSR') await render(ToggleButtons);
		else await renderSSR(ToggleButtons);
		await expectPressedFlipsOff();
	});

	test(`${mode}: Enter and Space flip the button`, async () => {
		if (mode === 'CSR') await render(ToggleButtons);
		else await renderSSR(ToggleButtons);
		await expectKeyboardFlips();
	});

	test(`${mode}: a flip calls the consumer onChange once with the new state`, async () => {
		if (mode === 'CSR') await render(ToggleButtons);
		else await renderSSR(ToggleButtons);
		await expectConsumerCallbackFires();
	});

	test(`${mode}: an omitted onChange flips the button anyway`, async () => {
		if (mode === 'CSR') await render(ToggleButtons);
		else await renderSSR(ToggleButtons);
		await expectOmittedOnChangeFlipsAnyway();
	});
}
