import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import ArmedLength from './scenarios/armed-length.tsrx';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import ItemsFromData from './scenarios/items-from-data.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import TwoWidgets from './scenarios/two-widgets.tsrx';
import VerificationForm from './scenarios/verification-form.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithOnComplete from './scenarios/with-oncomplete.tsrx';
import WithPattern from './scenarios/with-pattern.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

// Colocated browser suite for the otp family. Each test renders a realistic
// consumer scenario, and the locators name the part anatomy: root, field, item,
// itemindicator. The family paints slots over ONE real <input>, so most of these
// rows are assertions about that input and about the paint following it.
const Root = page.getByTestId('root');
const Field = page.getByTestId('field');
const Label = page.getByTestId('label');
const Submit = page.getByTestId('submit');
const Submitted = page.getByTestId('submitted');
// The consumer's own callback log.
const Value = page.getByTestId('value');
const Calls = page.getByTestId('calls');
const Typed = page.getByTestId('typed');
const Seen = page.getByTestId('seen');
const Code = page.getByTestId('code');
const Completions = page.getByTestId('completions');
// The locked pair: one empty, one stopped part-way through.
const EmptyRoot = page.getByTestId('empty-root');
const EmptyField = page.getByTestId('empty-field');
const PartialRoot = page.getByTestId('partial-root');
const PartialField = page.getByTestId('partial-field');
// Two code fields on one page.
const SmsField = page.getByTestId('sms-field');
const AppField = page.getByTestId('app-field');
// The boxes written by a loop, and the boxes delivered by an @if arm.
const LoopedItems = page.getByTestId('looped-item');
const SmsBoxes = page.getByTestId('sms-boxes');

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be
// passed by reference or wrapped in a helper — the branch below keeps both call
// sites literal, which is why this idiom rather than a `mount` parameter.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function item(prefix: string, index: number) {
	return el(page.getByTestId(`${prefix}${index}`));
}

// A real clipboard paste is not drivable from browser mode, and neither is SMS
// autofill. Both reach the page as one input event carrying the whole string,
// which is what this writes — the honest substitute, named so nobody reads the
// paste rows as end-to-end coverage.
function pasteInto(input: HTMLInputElement, text: string) {
	input.focus();
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function expectFieldConfig(input: HTMLInputElement, length: number) {
	// The three attributes that make this family worth shipping: the platform's
	// own one-time-code autofill, the numeric keypad, and a real text input.
	expect(input.tagName).toBe('INPUT');
	expect(input.getAttribute('type')).toBe('text');
	expect(input.getAttribute('inputmode')).toBe('numeric');
	expect(input.getAttribute('autocomplete')).toBe('one-time-code');
	// The declared length replaces QDS's construction-order item count, and it is
	// what truncates a long paste.
	expect(input.getAttribute('maxlength')).toBe(String(length));
}

function expectBasicRendered() {
	expectFieldConfig(el<HTMLInputElement>(Field), 6);
	expect(el<HTMLInputElement>(Field).value).toBe('');

	for (let index = 0; index < 6; index++) {
		const box = item('item-', index);
		// The input carries the code; an exposed box would put every character in
		// the accessibility tree twice, which is QDS's bug and not ours.
		expect(box.getAttribute('aria-hidden')).toBe('true');
		expect(box.getAttribute('ui-empty')).toBe('');
		expect(box.hasAttribute('ui-disabled')).toBe(false);
		// The indicator is the caret slot: a span the consumer styles, with no
		// state of its own.
		expect(el(page.getByTestId(`indicator-${index}`)).tagName).toBe('SPAN');
	}
}

function expectOneFormControl() {
	// The property that matters, rather than the attribute that implements it:
	// whatever the paint looks like, a person navigating by form control finds
	// exactly one, and it is the input.
	const controls = el(Root).querySelectorAll('input, textarea, select, button');
	expect(controls.length).toBe(1);
	expect(controls[0]).toBe(el(Field));
}

function expectPrefilledRendered() {
	expect(el<HTMLInputElement>(Field).value).toBe('1234');
	expect(item('item-', 0).textContent).toBe('1');
	expect(item('item-', 1).textContent).toBe('2');
	expect(item('item-', 2).textContent).toBe('3');
	expect(item('item-', 3).textContent).toBe('4');
	// Only the boxes with no character left carry the empty flag.
	expect(item('item-', 0).hasAttribute('ui-empty')).toBe(false);
	expect(item('item-', 3).hasAttribute('ui-empty')).toBe(false);
	expect(item('item-', 4).getAttribute('ui-empty')).toBe('');
	expect(item('item-', 5).getAttribute('ui-empty')).toBe('');
	expect(item('item-', 4).textContent).toBe('');
}

function expectDisabledRendered() {
	expect(el<HTMLInputElement>(EmptyField).disabled).toBe(true);
	expect(el(EmptyRoot).getAttribute('ui-disabled')).toBe('');
	expect(item('empty-item-', 0).getAttribute('ui-disabled')).toBe('');

	// Locked part-way through: the boxes still paint what was entered.
	expect(el<HTMLInputElement>(PartialField).disabled).toBe(true);
	expect(el(PartialRoot).getAttribute('ui-disabled')).toBe('');
	expect(item('partial-item-', 0).textContent).toBe('1');
	expect(item('partial-item-', 1).textContent).toBe('2');
	expect(item('partial-item-', 2).getAttribute('ui-empty')).toBe('');
}

function expectFormRendered() {
	const input = el<HTMLInputElement>(Field);
	expectFieldConfig(input, 6);
	expect(input.getAttribute('name')).toBe('code');
	// The label wraps the input, so it names the one real control with no id
	// wiring at the call site.
	expect(input.labels?.[0]).toBe(el(Label));
	expect(el(Submit).getAttribute('type')).toBe('submit');
}

function expectSpreadCannotReplaceTheFamily() {
	const input = el<HTMLInputElement>(Field);
	// What the consumer added reaches the element.
	expect(input.getAttribute('pattern')).toBe('[0-9]*');
	expect(input.getAttribute('minlength')).toBe('6');
	// What the family owns is not replaceable: the spread comes first.
	expect(input.getAttribute('maxlength')).toBe('6');
	expect(input.getAttribute('autocomplete')).toBe('one-time-code');
}

function expectLoopedBoxesRendered() {
	const boxes = LoopedItems.elements();
	expect(boxes.length).toBe(6);
	for (const box of boxes) {
		expect(box.getAttribute('aria-hidden')).toBe('true');
		expect(box.getAttribute('ui-empty')).toBe('');
	}
}

function expectTwoWidgetsRendered() {
	expectFieldConfig(el<HTMLInputElement>(SmsField), 4);
	expect(el<HTMLInputElement>(SmsField).value).toBe('');
	expect(el<HTMLInputElement>(AppField).value).toBe('99');
	expect(item('sms-item-', 0).getAttribute('ui-empty')).toBe('');
	expect(item('app-item-', 0).textContent).toBe('9');
	expect(item('app-item-', 2).getAttribute('ui-empty')).toBe('');
}

// A real submission would navigate the test iframe, so the event is dispatched.
// What is proven is what the browser itself put in the FormData.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders one configured input under six empty boxes`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: the accessibility tree holds exactly one form control`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneFormControl();
	});

	test(`${mode}: a prefilled code paints the characters it has and leaves the rest empty`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectPrefilledRendered();
	});

	test(`${mode}: a locked field carries the flag onto the input, the root and every box`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
	});

	test(`${mode}: the verification form renders a named, labelled code field`, async () => {
		if (mode === 'CSR') await render(VerificationForm);
		else await renderSSR(VerificationForm);
		expectFormRendered();
	});

	test(`${mode}: a consumer adds attributes to the field and replaces none of the family's`, async () => {
		if (mode === 'CSR') await render(WithPattern);
		else await renderSSR(WithPattern);
		expectSpreadCannotReplaceTheFamily();
	});

	test(`${mode}: boxes written by a loop render exactly as boxes written flat`, async () => {
		if (mode === 'CSR') await render(ItemsFromData);
		else await renderSSR(ItemsFromData);
		expectLoopedBoxesRendered();
	});

	test(`${mode}: two code fields on one page render their own values`, async () => {
		if (mode === 'CSR') await render(TwoWidgets);
		else await renderSSR(TwoWidgets);
		expectTwoWidgetsRendered();
	});

	test(`${mode}: an empty code field submits an empty value under its name`, async () => {
		if (mode === 'CSR') await render(VerificationForm);
		else await renderSSR(VerificationForm);
		await expect.poll(() => submit().textContent).toBe('{"code":""}');
	});
}

// --- typing ---------------------------------------------------------------
//
// Every box is a comparison over the same cell the keystroke wrote, read in a
// different part from the one that wrote it, so these poll for the committed
// write rather than sleeping.

test('CSR: each keystroke fills the next box and leaves the rest empty', async () => {
	await render(Basic);
	el(Field).focus();

	await userEvent.keyboard('4');
	await expect.poll(() => item('item-', 0).textContent).toBe('4');
	expect(item('item-', 0).hasAttribute('ui-empty')).toBe(false);
	expect(item('item-', 1).getAttribute('ui-empty')).toBe('');

	await userEvent.keyboard('2');
	await expect.poll(() => item('item-', 1).textContent).toBe('2');
	expect(item('item-', 0).textContent).toBe('4');
	expect(item('item-', 2).getAttribute('ui-empty')).toBe('');
	expect(el<HTMLInputElement>(Field).value).toBe('42');
});

test('CSR: Backspace takes the last character back out of its box', async () => {
	await render(Basic);
	el(Field).focus();

	await userEvent.keyboard('42');
	await expect.poll(() => item('item-', 1).textContent).toBe('2');

	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => item('item-', 1).getAttribute('ui-empty')).toBe('');
	expect(item('item-', 1).textContent).toBe('');
	// The character before it is untouched: the code is one string, so moving
	// left across the boxes costs the family no code at all.
	expect(item('item-', 0).textContent).toBe('4');
	expect(el<HTMLInputElement>(Field).value).toBe('4');
});

// Eight rows here were skipped on one framework defect (U121/U126 receipts,
// 2026-08-22): `otp.value.slice(...)` in commit() lowered to a read of the whole
// callee chain, so the emitted call invoked a detached String.prototype.slice
// with no receiver and threw "slice called on null or undefined". Fixed in
// collect-expressions.ts (a method call reads its receiver). Five of the eight
// run green now; the three below stayed red on causes the receiver fix does not
// touch, each re-pinned with what U130 measured on 2026-08-22. The third, the
// caret row, has since been re-pinned again on a different cause (U134) — the
// family carries the caret policy now, and the wall moved to the framework.

// WithOnChange only: the family takes the value (onChange receives the whole
// code, and the field reads "1234" back), but no box ever fills - all four read
// "" with ui-empty set. The same boxes fill in WithoutOnChange and in
// WithOnComplete, so the item refresh is lost in the dispatch that also runs a
// consumer callback writing page state, not in the slice.
test.skip('CSR: typing past the declared length adds nothing', async () => {
	await render(WithOnChange);
	el(Field).focus();

	await userEvent.keyboard('12345');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('1234');
	expect(item('item-', 3).textContent).toBe('4');
});

test('CSR: a whole code arriving at once fills every box', async () => {
	await render(Basic);
	pasteInto(el<HTMLInputElement>(Field), '123456');

	await expect.poll(() => item('item-', 5).textContent).toBe('6');
	expect(item('item-', 0).textContent).toBe('1');
	expect(item('item-', 2).textContent).toBe('3');
	expect(el<HTMLInputElement>(Field).value).toBe('123456');
});

test('CSR: a longer code arriving at once keeps only the declared length', async () => {
	await render(Basic);
	pasteInto(el<HTMLInputElement>(Field), '12345678');

	await expect.poll(() => item('item-', 5).textContent).toBe('6');
	expect(el<HTMLInputElement>(Field).value).toBe('123456');
});

test('CSR: a locked field takes no typing', async () => {
	await render(Disabled);
	el(EmptyField).focus();

	await userEvent.keyboard('1234');
	expect(el<HTMLInputElement>(EmptyField).value).toBe('');
	expect(item('empty-item-', 0).getAttribute('ui-empty')).toBe('');
});

test('CSR: typing in one field leaves its neighbour alone', async () => {
	await render(TwoWidgets);
	el(SmsField).focus();

	await userEvent.keyboard('12');
	await expect.poll(() => item('sms-item-', 1).textContent).toBe('2');
	// The other widget keeps its own value and its own boxes.
	expect(el<HTMLInputElement>(AppField).value).toBe('99');
	expect(item('app-item-', 0).textContent).toBe('9');
	expect(item('app-item-', 2).getAttribute('ui-empty')).toBe('');
});

// A component instance inside an @for arm never follows the shared cell: all six
// looped boxes render and the field holds "135", but every box stays "" with
// ui-empty set, before and after the paste. The same item outside a loop
// follows the code, so what is missing is the looped instance's refresh.
test.skip('CSR: a box written by a loop follows the code like any other', async () => {
	await render(ItemsFromData);
	pasteInto(el<HTMLInputElement>(Field), '135');

	await expect.poll(() => LoopedItems.elements()[0]?.textContent).toBe('1');
	const boxes = LoopedItems.elements();
	expect(boxes[1]?.textContent).toBe('3');
	expect(boxes[2]?.textContent).toBe('5');
	expect(boxes[3]?.getAttribute('ui-empty')).toBe('');
});

// --- consumer callbacks ---------------------------------------------------

test('CSR: each keystroke calls onChange once with the whole code', async () => {
	await render(WithOnChange);
	expect(el(Calls).textContent).toBe('0');
	el(Field).focus();

	await userEvent.keyboard('1');
	// The callback carries the value, never the character that was typed.
	await expect.poll(() => el(Value).textContent).toBe('1');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard('2');
	await expect.poll(() => el(Value).textContent).toBe('12');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test("CSR: the consumer's own onInput runs, after the family has taken the value", async () => {
	await render(WithOnChange);
	el(Field).focus();

	await userEvent.keyboard('1');
	await expect.poll(() => el(Typed).textContent).toBe('1');
	// `seen` is what the consumer's onInput read out of its own log, which the
	// family's onChange had already written: the part handler calls the shared
	// method first and the consumer's handler after.
	await expect.poll(() => el(Seen).textContent).toBe('1');
});

test('CSR: a field with no onChange still fills its boxes', async () => {
	await render(WithoutOnChange);
	el(Field).focus();

	await userEvent.keyboard('12');
	await expect.poll(() => item('item-', 1).textContent).toBe('2');
	expect(el<HTMLInputElement>(Field).value).toBe('12');
});

test('CSR: onComplete fires once, on the keystroke that fills the last box', async () => {
	await render(WithOnComplete);
	el(Field).focus();

	await userEvent.keyboard('123');
	await expect.poll(() => item('item-', 2).textContent).toBe('3');
	expect(el(Completions).textContent).toBe('0');

	await userEvent.keyboard('4');
	await expect.poll(() => el(Code).textContent).toBe('1234');
	await expect.poll(() => el(Completions).textContent).toBe('1');

	// An input event carrying the value the field already holds is a no-op, so
	// nothing fires a second time and no consumer submits twice.
	pasteInto(el<HTMLInputElement>(Field), '1234');
	await expect.poll(() => el(Completions).textContent).toBe('1');
});

test('CSR: a whole code arriving at once completes in one call', async () => {
	await render(WithOnComplete);
	pasteInto(el<HTMLInputElement>(Field), '9876');

	await expect.poll(() => el(Code).textContent).toBe('9876');
	await expect.poll(() => el(Completions).textContent).toBe('1');
});

test('CSR: a filled code submits under its name', async () => {
	await render(VerificationForm);
	pasteInto(el<HTMLInputElement>(Field), '123456');

	await expect.poll(() => submit().textContent).toBe('{"code":"123456"}');
});

// --- SSR resume -----------------------------------------------------------

// Still pinned, on a framework wall rather than the family gap U130 named.
// The family now carries the caret policy (OtpField's onFocus, QDS's rule:
// setSelectionRange to the end of the code), and the CSR row above proves it
// runs. It cannot run in TIME: a handler body is a symbol the framework
// dispatches asynchronously, so `focus()` followed immediately by a keystroke
// types before the caret has moved. Measured on this base 2026-08-22 (U134):
//   - CSR, focus() then keyboard('5') back to back -> "51234"
//   - CSR, focus() then a 300ms wait -> selectionStart 4, then "12345"
//   - SSR, same, with the resume dispatch logged as "ran warm
//     bound:symbol%3A0" inside the wait window -> same two results
// So the deferral is framework-wide, not an SSR-resume delay. Two further
// framework facts measured while pinning this, both of which shape any fix:
//   - inside a resumed handler `event.currentTarget` is null (the event has
//     finished dispatching), so the handler reaches the field via `event.target`
//   - `otp.fieldEl`, an element() handle, is `undefined` inside a handler after
//     SSR resume; the handle is not rebound to the served node
test.skip('SSR: the served field and boxes carry the code, and the next keystroke moves both', async () => {
	await renderSSR(Prefilled);
	// What the server sent, before anything resumed.
	expect(el<HTMLInputElement>(Field).value).toBe('1234');
	expect(item('item-', 3).textContent).toBe('4');
	expect(item('item-', 4).getAttribute('ui-empty')).toBe('');

	el(Field).focus();
	await userEvent.keyboard('5');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('12345');
	await expect.poll(() => item('item-', 4).textContent).toBe('5');
	expect(item('item-', 4).hasAttribute('ui-empty')).toBe(false);
});

test('SSR: a code arriving at once after resume fills every box', async () => {
	await renderSSR(Basic);
	pasteInto(el<HTMLInputElement>(Field), '246810');

	await expect.poll(() => item('item-', 5).textContent).toBe('0');
	expect(item('item-', 0).textContent).toBe('2');
});

// --- boxes from an arm ----------------------------------------------------
//
// The arm-delivered verdict this family was asked for, in two halves. A part is
// not a widget root, so an arm that is DECIDED once carries its items fine — the
// rows below prove it in both modes. An arm that FLIPS is refused at compile
// time: `<otp.item>` inside `@if (someState)` fails the module with
// MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED ("cannot be rebuilt when ... changes
// because <otp.item> has to run to produce its content"), measured on this base
// by compiling the scenario. That is a framework limit, not a family one, so the
// scenario decides its arm from a module constant and this note carries the
// verdict instead of a red row.

for (const mode of MODES) {
	test(`${mode}: boxes delivered by an @if arm render like boxes written flat`, async () => {
		if (mode === 'CSR') await render(ArmedLength);
		else await renderSSR(ArmedLength);
		expect(SmsBoxes.query()).not.toBeNull();
		expect(page.getByTestId('backup-boxes').query()).toBeNull();
		expect(el<HTMLInputElement>(Field).getAttribute('maxlength')).toBe('6');
		expect(item('sms-item-', 0).getAttribute('aria-hidden')).toBe('true');
		expect(item('sms-item-', 5).getAttribute('ui-empty')).toBe('');
	});
}

// The caret policy the family now carries, matched to QDS's `handleFocus`
// (otp-field.tsx:211-223: `setSelectionRange(code.length, code.length)`).
// The poll is not slack, it is the assertion: a handler body is a symbol the
// framework dispatches asynchronously, so the caret moves a turn after focus,
// never during it. This row proves the policy; the pinned SSR row below is
// what proves it in time for the very next keystroke, and that is still red.
test('CSR: focusing a field that already holds a code puts the caret at the end', async () => {
	await render(Prefilled);
	const input = el<HTMLInputElement>(Field);
	input.focus();

	await expect.poll(() => input.selectionStart).toBe(4);
	expect(input.selectionEnd).toBe(4);

	await userEvent.keyboard('5');
	await expect.poll(() => input.value).toBe('12345');
	await expect.poll(() => item('item-', 4).textContent).toBe('5');
});

test('CSR: an arm-delivered box follows the code like any other', async () => {
	await render(ArmedLength);
	pasteInto(el<HTMLInputElement>(Field), '13');

	await expect.poll(() => item('sms-item-', 0).textContent).toBe('1');
	expect(item('sms-item-', 1).textContent).toBe('3');
	expect(item('sms-item-', 2).getAttribute('ui-empty')).toBe('');
});
