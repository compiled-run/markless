import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import {
	announcedText,
	canonicalText,
	committedValue,
	formatNumber,
	isValidPartial,
	localeSymbols,
	parseNumber,
	snapToStep,
	steppedValue,
} from './numberbox-math.ts';
import Basic from './scenarios/basic.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Currency from './scenarios/currency.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Form from './scenarios/form.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import MinMaxStep from './scenarios/min-max-step.tsrx';
import ReadOnly from './scenarios/readonly.tsrx';
import Required from './scenarios/required.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Input = page.getByTestId('input');
const Back = page.getByTestId('backtrigger');
const Forward = page.getByTestId('forwardtrigger');
const ValueLabel = page.getByTestId('valuelabel');
const Field = page.getByTestId('field');
const Description = page.getByTestId('description');
const ErrorMessage = page.getByTestId('error');
const Submitted = page.getByTestId('submitted');
const FirstValue = page.getByTestId('first-value');
const LockedValue = page.getByTestId('locked-value');
const Calls = page.getByTestId('calls');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent on
// purpose rather than by suppression: this family ships unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

const shown = (locator: { element(): Element | null }) => el<HTMLInputElement>(locator).value;

function pointer(target: Element, type: string, pointerType = 'mouse') {
	target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, button: 0 }));
}

// A real submit would navigate the test iframe, so the event is dispatched.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

// A stopped clock is proved by time passing, not by polling a value that already
// agrees, so the hold rows wait out more than one repeat interval.
const QUIET_MS = 900;
const rest = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function typeInto(locator: { element(): Element | null }, keys: string) {
	el(locator).focus();
	await userEvent.keyboard(keys);
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

// ---------------------------------------------------------------------------
// The arithmetic and the parse, held on their own. There is no node lane in this
// package - every family's math is exercised through the browser project - so the
// round trip, the snap, the clamp and the character guard are rows here.
// ---------------------------------------------------------------------------

test('a formatted number parses back to the number it came from', () => {
	for (const value of [0, 1, -12, 1234.5, 1299, 0.25, -1234.56]) {
		expect(parseNumber(formatNumber(value, 0.01, ''), '')).toBe(value);
	}
	expect(formatNumber(1234.5, 0.01, '')).toBe('1,234.50');
	expect(formatNumber(1234.5, 1, '')).toBe('1,234.5');
	expect(formatNumber(null, 1, '')).toBe('');
});

test('a currency round-trips through its own symbol and grouping', () => {
	expect(formatNumber(1299, 0.01, 'USD')).toBe('$1,299.00');
	expect(parseNumber('$1,299.00', 'USD')).toBe(1299);
	// The symbol is typeable because it is one of the characters the format renders.
	expect(isValidPartial('$1,4', undefined, undefined, 0.01, 'USD')).toBe(true);
	// An unknown code is ignored rather than thrown at render.
	expect(formatNumber(12, 1, 'NOTACODE')).toBe('12');
});

test('what a form submits is the plain number, never the formatted text', () => {
	expect(canonicalText(1234.5)).toBe('1234.5');
	expect(canonicalText(-0.25)).toBe('-0.25');
	expect(canonicalText(null)).toBe('');
});

test('a step counts from min and lands on the grid, whichever way it is pressed', () => {
	expect(snapToStep(7, 0, undefined, 5)).toBe(5);
	expect(snapToStep(7, 5, undefined, 10)).toBe(5);
	// Off-grid by hand: the first press pulls it onto the grid in the direction pressed.
	expect(steppedValue(7, true, false, 0, undefined, 5)).toBe(10);
	expect(steppedValue(7, false, false, 0, undefined, 5)).toBe(5);
	// On-grid: the press moves a whole step, and ten of them when it is a big one.
	expect(steppedValue(10, true, false, 0, undefined, 5)).toBe(15);
	expect(steppedValue(10, true, true, 0, undefined, 5)).toBe(60);
	// Decimal steps do not drift: 0.1 + 0.2 is 0.3 here, not 0.30000000000000004.
	expect(steppedValue(0.1, true, false, 0.1, undefined, 0.2)).toBe(0.3);
});

test('an empty field starts from the bound it steps away from', () => {
	expect(steppedValue(null, true, false, 1, 9, 1)).toBe(1);
	expect(steppedValue(null, false, false, 1, 9, 1)).toBe(9);
	expect(steppedValue(null, true, false, undefined, undefined, 1)).toBe(0);
});

test('a commit clamps into range and a currency rounds to its own scale', () => {
	expect(committedValue(99, 0, 20, 1, '')).toBe(20);
	expect(committedValue(-5, 0, 20, 1, '')).toBe(0);
	// A plain field keeps whatever was typed; only a currency has a scale to round to.
	expect(committedValue(1.234, undefined, undefined, 1, '')).toBe(1.234);
	expect(committedValue(1.234, undefined, undefined, 0.01, 'USD')).toBe(1.23);
	expect(committedValue(null, 0, 20, 1, '')).toBe(null);
});

test('the character guard subtracts what could belong to a number and refuses the rest', () => {
	expect(isValidPartial('1,234', undefined, undefined, 1, '')).toBe(true);
	expect(isValidPartial('$', undefined, undefined, 1, '')).toBe(false);
	expect(isValidPartial('12a', undefined, undefined, 1, '')).toBe(false);
	// A minus needs somewhere below zero to go.
	expect(isValidPartial('-1', undefined, undefined, 1, '')).toBe(true);
	expect(isValidPartial('-1', 0, undefined, 1, '')).toBe(false);
	// A decimal point needs a step that spends fraction digits.
	expect(isValidPartial('1.', undefined, undefined, 1, '')).toBe(false);
	expect(isValidPartial('1.', undefined, undefined, 0.1, '')).toBe(true);
	expect(isValidPartial('1.2.3', undefined, undefined, 0.1, '')).toBe(false);
	// A half-typed field is always still a field.
	expect(isValidPartial('', 0, 9, 1, '')).toBe(true);
});

// The symbols are read out of `Intl` rather than written down, so a locale that
// spells a number the other way round is a change of document language and
// nothing else.
test('another language brings its own decimal, group and both keyboards', () => {
	const before = document.documentElement.lang;
	document.documentElement.lang = 'de-DE';
	try {
		const symbols = localeSymbols('');
		expect(symbols.decimal).toBe(',');
		expect(symbols.group).toBe('.');
		expect(formatNumber(1234.5, 0.01, '')).toBe('1.234,50');
		expect(parseNumber('1.234,50', '')).toBe(1234.5);
		// A plain point typed on a keyboard that has no comma key is the decimal,
		// not a group mark: nothing else in the string is spelling one.
		expect(parseNumber('1234.5', '')).toBe(1234.5);
		expect(isValidPartial('1,5', undefined, undefined, 0.1, '')).toBe(true);
	} finally {
		document.documentElement.lang = before;
	}
});

test('what a reader is told names an empty field and speaks a minus', () => {
	expect(announcedText('')).toBe('Empty');
	expect(announcedText('-12')).toBe('−12');
	expect(announcedText('1,234.50')).toBe('1,234.50');
});

// ---------------------------------------------------------------------------
// What each scenario renders, on both render modes.
// ---------------------------------------------------------------------------

function expectBasicRendered() {
	expect(el(Root).localName).toBe('div');
	expect(el(Input).localName).toBe('input');
	expect(el(Input).getAttribute('type')).toBe('text');
	expect(el(Input).getAttribute('inputmode')).toBe('decimal');
	// A plain text box, not a spinbutton: the role cannot be focused with
	// VoiceOver, and this control is real editable text.
	expect(el(Input).hasAttribute('role')).toBe(false);
	expect(el(Input).getAttribute('aria-roledescription')).toBe('number field');
	expect(el(Input).hasAttribute('aria-valuenow')).toBe(false);
	// Neither message part is placed, so both handles drop out and no empty
	// attribute is left behind.
	expect(el(Input).hasAttribute('aria-describedby')).toBe(false);
	expect(el(Input).hasAttribute('aria-invalid')).toBe(false);
	// The name lives on the hidden element; the visible text is grouped.
	expect(el(Input).hasAttribute('name')).toBe(false);
	expect(el(Field).getAttribute('name')).toBe('quantity');

	expect(el(Label).localName).toBe('label');
	expect(el(Label).getAttribute('for')).toBe(el(Input).id);
	expect(el(Input).id).not.toBe('');

	for (const trigger of [Back, Forward]) {
		expect(el(trigger).localName).toBe('button');
		expect(el(trigger).getAttribute('type')).toBe('button');
		// The text field is the only tab stop; the arrows already do what these do.
		expect(el(trigger).getAttribute('tabindex')).toBe('-1');
		expect(el(trigger).getAttribute('aria-controls')).toBe(el(Input).id);
	}
	expect(el(Back).getAttribute('aria-label')).toBe('Decrease');
	expect(el(Forward).getAttribute('aria-label')).toBe('Increase');

	expect(shown(Input)).toBe('');
	expect(el<HTMLInputElement>(Field).value).toBe('');
	expect(el(Root).getAttribute('ui-empty')).toBe('');
	expect(el(ValueLabel).localName).toBe('output');
	expect(el(ValueLabel).textContent).toBe('');
	expect(el(Field).getAttribute('aria-hidden')).toBe('true');
	expect(el(Field).getAttribute('tabindex')).toBe('-1');
	expect(getComputedStyle(el(Field).parentElement as Element).position).toBe('absolute');
}

function expectCurrencyRendered() {
	expect(shown(Input)).toBe('$1,299.00');
	expect(el(ValueLabel).textContent).toBe('$1,299.00');
	// The input shows a symbol and a group separator; the form carries neither.
	expect(el<HTMLInputElement>(Field).value).toBe('1299');
	expect(el(Root).hasAttribute('ui-empty')).toBe(false);
}

function expectBoundedRendered() {
	expect(shown(Input)).toBe('1.50');
	expect(el<HTMLInputElement>(Field).value).toBe('1.5');
	// With no spinbutton role there is no aria-valuemin/max, so the range is
	// conveyed by the description the input names.
	expect(el(Input).hasAttribute('aria-valuemin')).toBe(false);
	expect(el(Description).id).toBeTruthy();
	expect(el(Input).getAttribute('aria-describedby')).toBe(el(Description).id);
	expect(el(Description).textContent?.trim()).toBe(
		'A number between 0.5 and 3, in steps of 0.25.',
	);
}

function expectDisabledRendered() {
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(el<HTMLInputElement>(Input).disabled).toBe(true);
	expect(el<HTMLButtonElement>(Back).disabled).toBe(true);
	expect(el<HTMLButtonElement>(Forward).disabled).toBe(true);
	expect(el(Back).getAttribute('ui-disabled')).toBe('');
	expect(el<HTMLInputElement>(Field).disabled).toBe(true);
}

function expectReadOnlyRendered() {
	expect(el(Root).getAttribute('ui-readonly')).toBe('');
	expect(el<HTMLInputElement>(Input).readOnly).toBe(true);
	expect(el<HTMLInputElement>(Input).disabled).toBe(false);
	// Focusable, because a value nobody can reach is a value nobody can read.
	expect(el(Input).hasAttribute('tabindex')).toBe(false);
	expect(el<HTMLButtonElement>(Back).disabled).toBe(true);
	expect(el<HTMLButtonElement>(Forward).disabled).toBe(true);
}

function expectRequiredRendered() {
	expect(el(Root).getAttribute('ui-required')).toBe('');
	expect(el<HTMLInputElement>(Input).required).toBe(true);
	expect(el<HTMLInputElement>(Field).required).toBe(true);
}

function expectInvalidRendered() {
	// The root prop marks it.
	expect(el(page.getByTestId('flagged-input')).getAttribute('aria-invalid')).toBe('true');
	expect(el(page.getByTestId('flagged-root')).getAttribute('ui-invalid')).toBe('');
	// So does mounting the error part, and the error was written BEFORE the input:
	// seeding completes before any part renders, so document order does not decide
	// what a part reads.
	expect(el(Input).getAttribute('aria-invalid')).toBe('true');
	expect(el(Root).getAttribute('ui-invalid')).toBe('');
	// Both messages, error first: what is wrong before the format hint.
	expect(el(Input).getAttribute('aria-describedby')).toBe(
		`${el(ErrorMessage).id} ${el(Description).id}`,
	);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders an empty text field between two step buttons`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a money field shows its symbol and submits a plain number`, async () => {
		if (mode === 'CSR') await render(Currency);
		else await renderSSR(Currency);
		expectCurrencyRendered();
	});

	test(`${mode}: a bounded field shows its step's digits and names its range`, async () => {
		if (mode === 'CSR') await render(MinMaxStep);
		else await renderSSR(MinMaxStep);
		expectBoundedRendered();
	});

	test(`${mode}: a number nobody may change renders its flags on every part`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
	});

	test(`${mode}: a read-only number stays focusable and refuses both triggers`, async () => {
		if (mode === 'CSR') await render(ReadOnly);
		else await renderSSR(ReadOnly);
		expectReadOnlyRendered();
	});

	test(`${mode}: a required number is reported by the input and the hidden element`, async () => {
		if (mode === 'CSR') await render(Required);
		else await renderSSR(Required);
		expectRequiredRendered();
	});

	test(`${mode}: a field is marked wrong by the prop and by a mounted error`, async () => {
		if (mode === 'CSR') await render(Invalid);
		else await renderSSR(Invalid);
		expectInvalidRendered();
	});

	test(`${mode}: the hidden element carries the plain number under its name`, async () => {
		if (mode === 'CSR') await render(Form);
		else await renderSSR(Form);
		expect(shown(Input)).toBe('1,234.5');
		expect(el<HTMLInputElement>(Field).value).toBe('1234.5');
		await expect.poll(() => submit().textContent).toBe('{"quantity":"1234.5"}');
	});
}

// ---------------------------------------------------------------------------
// Typing, and what it is allowed to do.
// ---------------------------------------------------------------------------

test('CSR: what a person types stays exactly as typed until it commits', async () => {
	await render(MinMaxStep);

	await userEvent.clear(el<HTMLInputElement>(Input));
	await userEvent.keyboard('2.5');
	// Not reformatted mid-word: turning this into 2.50 under the person's fingers
	// would put the next keystroke in the wrong place.
	await expect.poll(() => shown(Input)).toBe('2.5');
	// The value is live even though nothing has committed.
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('2.5');

	el(Input).blur();
	await expect.poll(() => shown(Input)).toBe('2.50');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('2.5');
});

// The field's fraction digits come from its step, so the default field is a whole
// number and a typed point never lands in one.
test('CSR: a whole-number field refuses a decimal point and formats on commit', async () => {
	await render(Basic);

	await typeInto(Input, '1234');
	await userEvent.keyboard('.');
	await userEvent.keyboard('5');
	await expect.poll(() => shown(Input)).toBe('12345');

	el(Input).blur();
	await expect.poll(() => shown(Input)).toBe('12,345');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('12345');
});

test('CSR: a typed group separator survives, and never reaches the form', async () => {
	await render(Basic);

	await typeInto(Input, '1,234');
	await expect.poll(() => shown(Input)).toBe('1,234');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('1234');

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => shown(Input)).toBe('1,234');
});

test('CSR: a character that could not belong to a number never lands', async () => {
	await render(Basic);

	await typeInto(Input, '12');
	await userEvent.keyboard('$');
	await userEvent.keyboard('a');
	await userEvent.keyboard(' ');
	await expect.poll(() => shown(Input)).toBe('12');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('12');
});

test('CSR: a minus is typeable when there is somewhere below zero to go', async () => {
	await render(Basic);

	await typeInto(Input, '-12');
	await expect.poll(() => shown(Input)).toBe('-12');
	el(Input).blur();
	await expect.poll(() => shown(Input)).toBe('-12');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('-12');
});

test('CSR: a minus is refused outright by a field that cannot go below zero', async () => {
	await render(Currency);

	el(Input).focus();
	await userEvent.clear(el<HTMLInputElement>(Input));
	await userEvent.keyboard('-');
	await userEvent.keyboard('5');
	await expect.poll(() => shown(Input)).toBe('5');
});

test('CSR: a whole currency string can be typed back into the field it came from', async () => {
	await render(Currency);

	await userEvent.fill(el<HTMLInputElement>(Input), '$1,450.75');
	await expect.poll(() => shown(Input)).toBe('$1,450.75');
	el(Input).blur();
	await expect.poll(() => shown(Input)).toBe('$1,450.75');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('1450.75');
});

test('CSR: an entry beyond the bounds is pulled back when it commits', async () => {
	await render(MinMaxStep);

	await userEvent.fill(el<HTMLInputElement>(Input), '99');
	// Never while typing: a field with min 0.5 that rewrote a lone 9 under the
	// person's fingers would make 99 unreachable.
	await expect.poll(() => shown(Input)).toBe('99');

	el(Input).blur();
	await expect.poll(() => shown(Input)).toBe('3.00');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('3');
});

test('CSR: clearing the field empties the value and the form', async () => {
	await render(Currency);

	await userEvent.clear(el<HTMLInputElement>(Input));
	el(Input).blur();
	await expect.poll(() => shown(Input)).toBe('');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('');
	expect(el(Root).getAttribute('ui-empty')).toBe('');
});

// ---------------------------------------------------------------------------
// Keyboard.
// ---------------------------------------------------------------------------

test('CSR: the arrows step, and shift steps ten of them', async () => {
	await render(MinMaxStep);

	await typeInto(Input, '{ArrowUp}');
	await expect.poll(() => shown(Input)).toBe('1.75');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => shown(Input)).toBe('1.50');

	await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
	// Ten steps is 2.5, which lands past the ceiling and stops there.
	await expect.poll(() => shown(Input)).toBe('3.00');
});

test('CSR: the page keys step by the same ten as a shifted arrow', async () => {
	await render(MinMaxStep);

	await typeInto(Input, '{PageDown}');
	await expect.poll(() => shown(Input)).toBe('0.50');

	await userEvent.keyboard('{PageUp}');
	await expect.poll(() => shown(Input)).toBe('3.00');
});

test('CSR: home and end jump to the bounds when the field has them', async () => {
	await render(MinMaxStep);

	await typeInto(Input, '{End}');
	await expect.poll(() => shown(Input)).toBe('3.00');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('3');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => shown(Input)).toBe('0.50');
});

// Without a bound there is nothing to jump to, so the browser's own Home and End
// keep the caret behaviour an editable field should have.
test('CSR: home is inert on a field with no floor, and the caret still moves', async () => {
	await render(Basic);

	await typeInto(Input, '1234');
	await userEvent.keyboard('{Home}');
	await expect.poll(() => shown(Input)).toBe('1234');
	await expect.poll(() => el<HTMLInputElement>(Input).selectionStart).toBe(0);
});

test('CSR: an off-grid number is pulled onto the grid in the direction pressed', async () => {
	await render(Form);

	await typeInto(Input, '{ArrowUp}');
	await expect.poll(() => shown(Input)).toBe('1,235');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('1235');
});

test('CSR: an empty field starts from its floor rather than one step above it', async () => {
	await render(MinMaxStep);

	await userEvent.clear(el<HTMLInputElement>(Input));
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => shown(Input)).toBe('0.50');
});

test('CSR: enter commits and the form still submits with the committed value', async () => {
	await render(Form);

	await userEvent.fill(el<HTMLInputElement>(Input), '2,000');
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => shown(Input)).toBe('2,000');
	await expect.poll(() => submit().textContent).toBe('{"quantity":"2000"}');
});

test('CSR: focusing a field that already holds a number puts the caret after it', async () => {
	await render(Currency);

	el(Input).focus();
	await expect.poll(() => el<HTMLInputElement>(Input).selectionStart).toBe('$1,299.00'.length);
});

// ---------------------------------------------------------------------------
// The triggers.
// ---------------------------------------------------------------------------

test('CSR: a trigger press steps once and moves focus to the field', async () => {
	await render(Basic);

	pointer(el(Forward), 'pointerdown');
	pointer(el(Forward), 'pointerup');
	await expect.poll(() => shown(Input)).toBe('0');
	await expect.poll(() => document.activeElement).toBe(el(Input));

	pointer(el(Forward), 'pointerdown');
	pointer(el(Forward), 'pointerup');
	await expect.poll(() => shown(Input)).toBe('1');

	pointer(el(Back), 'pointerdown');
	pointer(el(Back), 'pointerup');
	await expect.poll(() => shown(Input)).toBe('0');
});

test('CSR: holding a trigger repeats, and releasing stops it', async () => {
	await render(Basic);

	pointer(el(Forward), 'pointerdown');
	// One step lands at once; the repeat waits before it starts, so a value past
	// the second step is the repeat and nothing else.
	await expect.poll(() => Number(shown(Input)), { timeout: 4000 }).toBeGreaterThan(3);
	pointer(el(Forward), 'pointerup');

	const settled = shown(Input);
	await rest(QUIET_MS);
	expect(shown(Input)).toBe(settled);
});

test('CSR: dragging off a held trigger ends the press', async () => {
	await render(Basic);

	pointer(el(Forward), 'pointerdown');
	await expect.poll(() => shown(Input)).toBe('0');
	pointer(el(Forward), 'pointerleave');

	const settled = shown(Input);
	await rest(QUIET_MS);
	expect(shown(Input)).toBe(settled);
});

test('CSR: a trigger goes off at its bound and the hold stops rather than spinning', async () => {
	await render(MinMaxStep);

	pointer(el(Forward), 'pointerdown');
	await expect.poll(() => shown(Input), { timeout: 5000 }).toBe('3.00');
	await expect.poll(() => el<HTMLButtonElement>(Forward).disabled).toBe(true);
	pointer(el(Forward), 'pointerup');
	expect(shown(Input)).toBe('3.00');
});

test('CSR: a read-only field refuses both the arrows and the triggers', async () => {
	await render(ReadOnly);

	el(Input).focus();
	await userEvent.keyboard('{ArrowUp}');
	await userEvent.keyboard('5');
	pointer(el(Forward), 'pointerdown');
	pointer(el(Forward), 'pointerup');
	await expect.poll(() => shown(Input)).toBe('12');
	expect(document.activeElement).toBe(el(Input));
});

// ---------------------------------------------------------------------------
// The consumer's callback.
// ---------------------------------------------------------------------------

test('CSR: onChange fires when the value settles, not per keystroke', async () => {
	await render(Controlled);
	const input = page.getByTestId('first-input');

	await typeInto(input, '{ArrowUp}');
	await expect.poll(() => el(FirstValue).textContent).toBe('13');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	el(input).blur();
	el(input).focus();
	await userEvent.keyboard('4');
	// A keystroke changes what is shown and calls nobody.
	await expect.poll(() => el<HTMLInputElement>(input).value).toBe('134');
	expect(el(Calls).textContent).toBe('1');

	el(input).blur();
	await expect.poll(() => el(FirstValue).textContent).toBe('134');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: a locked field ignores every key and calls nothing', async () => {
	await render(Controlled);
	const locked = page.getByTestId('locked-input');

	el(locked).focus();
	await userEvent.keyboard('{ArrowUp}');
	expect(el<HTMLInputElement>(locked).value).toBe('12');
	expect(el(LockedValue).textContent).toBe('');
	expect(el(Calls).textContent).toBe('0');
});

test('CSR: clearing the field calls the consumer with no number', async () => {
	await render(Controlled);
	const input = page.getByTestId('first-input');

	await userEvent.clear(el<HTMLInputElement>(input));
	el(input).blur();
	await expect.poll(() => el(FirstValue).textContent).toBe('null');
	await expect.poll(() => el(Calls).textContent).toBe('1');
});

// ---------------------------------------------------------------------------
// The first gesture on a resumed page.
// ---------------------------------------------------------------------------

// A dispatch after a resume reads its first value out of the payload rather than
// out of a live render, which is the class of defect the slider note records.
// The focus that must precede a keystroke spends the demand-load window.
test('SSR: the first arrow after a resume steps from the rendered number', async () => {
	await renderSSR(MinMaxStep);

	await typeInto(Input, '{ArrowUp}');
	await expect.poll(() => shown(Input)).toBe('1.75');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('1.75');
});

test('SSR: the first digit after a resume lands in the field it was typed in', async () => {
	await renderSSR(Basic);

	await typeInto(Input, '7');
	await expect.poll(() => shown(Input)).toBe('7');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('7');
});

// `click` and `pointerdown` are in neither preload list and Safari does not focus
// a button on click, so a trigger press has no focus ahead of it to prime the
// window. This row is the one that would say so.
test('SSR: the first trigger press after a resume steps and starts its repeat', async () => {
	await renderSSR(MinMaxStep);

	pointer(el(Forward), 'pointerdown');
	await expect.poll(() => shown(Input), { timeout: 4000 }).toBe('1.75');
	await expect.poll(() => shown(Input), { timeout: 4000 }).toBe('2.00');
	pointer(el(Forward), 'pointerup');
});

test('SSR: the first blur after a resume formats what was typed', async () => {
	await renderSSR(Basic);

	await typeInto(Input, '1234');
	el(Input).blur();
	await expect.poll(() => shown(Input)).toBe('1,234');
});

// ---------------------------------------------------------------------------
// axe, per scenario. The battery in test-support holds the starter to the same
// tags on both render modes; these are the eight the battery never mounts.
// ---------------------------------------------------------------------------

test('CSR: axe finds nothing in the starter', async () => {
	await expectNoAxeViolations(scopeOf(await render(Basic)), 'the starter');
});

test('CSR: axe finds nothing in a controlled pair', async () => {
	await expectNoAxeViolations(scopeOf(await render(Controlled)), 'a controlled pair');
});

test('CSR: axe finds nothing in a bounded field', async () => {
	await expectNoAxeViolations(scopeOf(await render(MinMaxStep)), 'a bounded field');
});

test('CSR: axe finds nothing in a money field', async () => {
	await expectNoAxeViolations(scopeOf(await render(Currency)), 'a money field');
});

test('CSR: axe finds nothing in a required field', async () => {
	await expectNoAxeViolations(scopeOf(await render(Required)), 'a required field');
});

test('CSR: axe finds nothing in a disabled field', async () => {
	await expectNoAxeViolations(scopeOf(await render(Disabled)), 'a disabled field');
});

test('CSR: axe finds nothing in a read-only field', async () => {
	await expectNoAxeViolations(scopeOf(await render(ReadOnly)), 'a read-only field');
});

test('CSR: axe finds nothing in an invalid field', async () => {
	await expectNoAxeViolations(scopeOf(await render(Invalid)), 'an invalid field');
});

test('CSR: axe finds nothing in a form', async () => {
	await expectNoAxeViolations(scopeOf(await render(Form)), 'a form');
});
