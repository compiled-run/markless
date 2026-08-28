import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Separators from './scenarios/separators.tsrx';
import ToggleButtons from './scenarios/toggle-buttons.tsrx';

const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

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
const Rule = page.getByTestId('rule');
const ColumnRule = page.getByTestId('column-rule');
const Paint = page.getByTestId('paint');

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

/** The separator itself, which sits under the wrapper the test id is on. */
function separatorIn(locator: { element(): Element | null }): Element {
	const found = el(locator).firstElementChild;
	if (!found) throw new Error('Expected a separator under the wrapper.');
	return found;
}

async function expectNoAxeViolations(container: Element, phase: string) {
	const results = await axe.run(container as HTMLElement, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	const reported = results.violations.map((violation) => {
		const nodes = violation.nodes.map((node) => `      ${node.html}`).join('\n');
		return `  ${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}\n${nodes}`;
	});
	expect(reported, `axe violations while ${phase}`).toEqual([]);
}

function scopeOf(result: { container: unknown }): Element {
	const container = result.container;
	if (!(container instanceof Element)) throw new Error('The mount handed back no DOM container.');
	return container;
}

function expectSeparatorsRendered() {
	const rule = separatorIn(Rule);
	expect(rule.getAttribute('role')).toBe('separator');
	expect(rule.getAttribute('aria-orientation')).toBe('horizontal');
	expect(rule.getAttribute('ui-orientation')).toBe('horizontal');
	expect(rule.hasAttribute('ui-separator')).toBe(true);
	expect(rule.hasAttribute('ui-decorative')).toBe(false);

	const column = separatorIn(ColumnRule);
	expect(column.getAttribute('role')).toBe('separator');
	expect(column.getAttribute('aria-orientation')).toBe('vertical');
	expect(column.getAttribute('ui-orientation')).toBe('vertical');
}

// The owner ruling: this part divides, it never splits. The focusable
// window-splitter with a value belongs to the resizable family.
function expectSeparatorCarriesNoMachinery() {
	for (const wrapper of [Rule, ColumnRule, Paint]) {
		const separator = separatorIn(wrapper);
		expect(separator.hasAttribute('tabindex')).toBe(false);
		expect(separator.hasAttribute('aria-valuenow')).toBe(false);
		expect(separator.hasAttribute('aria-controls')).toBe(false);
		expect(separator.hasAttribute('aria-disabled')).toBe(false);
	}
}

// Paint only: no role for a reader to stop on, and nothing to announce.
function expectDecorativeSeparatorIsSilent() {
	const paint = separatorIn(Paint);
	expect(paint.hasAttribute('role')).toBe(false);
	expect(paint.getAttribute('aria-hidden')).toBe('true');
	expect(paint.hasAttribute('aria-orientation')).toBe(false);
	expect(paint.getAttribute('ui-decorative')).toBe('');
	expect(page.getByRole('separator').elements()).toHaveLength(2);
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

	test(`${mode}: a separator declares its axis and a decorative one says nothing`, async () => {
		if (mode === 'CSR') await render(Separators);
		else await renderSSR(Separators);
		expectSeparatorsRendered();
		expectDecorativeSeparatorIsSilent();
		expectSeparatorCarriesNoMachinery();
	});

	test(`${mode}: the separators report no axe violations`, async () => {
		const mounted = mode === 'CSR' ? await render(Separators) : await renderSSR(Separators);
		await expectNoAxeViolations(scopeOf(mounted), `${mode} separators at rest`);
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
