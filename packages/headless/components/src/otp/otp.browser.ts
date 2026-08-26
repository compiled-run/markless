import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import ArmedLength from './scenarios/armed-length.tsrx';
import Basic from './scenarios/basic.tsrx';
import DerivedLength from './scenarios/derived-length.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import ItemsFromData from './scenarios/items-from-data.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import TwoWidgets from './scenarios/two-widgets.tsrx';
import VerificationForm from './scenarios/verification-form.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithOnComplete from './scenarios/with-oncomplete.tsrx';
import WithPattern from './scenarios/with-pattern.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';
import WithoutShift from './scenarios/without-shift.tsrx';

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

// What a pointer landing on this spot actually hits. The family's whole shape is
// that the answer is always the field, however the boxes are laid out.
function topmostOver(box: Element) {
	const spot = box.getBoundingClientRect();
	return document.elementFromPoint(spot.left + spot.width / 2, spot.top + spot.height / 2);
}

// The mechanism this family is built on, matched to QDS's otp.css: the root is
// the positioned box, and the field is stretched over it, invisible but still
// the thing every gesture on a box reaches.
function expectFieldStretchesOverTheBoxes(boxes: number) {
	const input = el<HTMLInputElement>(Field);
	expect(getComputedStyle(el(Root)).position).toBe('relative');

	const painted = getComputedStyle(input);
	expect(painted.position).toBe('absolute');
	expect(painted.opacity).toBe('0');

	// Invisible is not hidden: a hidden control takes no typing and leaves the
	// accessibility tree, so this row also guards against fixing the paint with
	// `visibility` or `display`.
	expect(painted.visibility).toBe('visible');
	expect(painted.display).not.toBe('none');

	const over = input.getBoundingClientRect();
	const root = el(Root).getBoundingClientRect();
	expect(over.top).toBe(root.top);
	expect(over.bottom).toBe(root.bottom);
	expect(over.left).toBe(root.left);

	for (let index = 0; index < boxes; index++) {
		expect(topmostOver(item('item-', index))).toBe(input);
	}
}

function expectFieldConfig(input: HTMLInputElement, boxes: number) {
	// The three attributes that make this family worth shipping: the platform's
	// own one-time-code autofill, the numeric keypad, and a real text input.
	expect(input.tagName).toBe('INPUT');
	expect(input.getAttribute('type')).toBe('text');
	expect(input.getAttribute('inputmode')).toBe('numeric');
	expect(input.getAttribute('autocomplete')).toBe('one-time-code');
	// Nothing declares a length: the boxes the scenario wrote are counted as they
	// render, and that count is what truncates typing and a long paste. The field
	// is written before them, so this also pins that the count reaches it.
	expect(input.getAttribute('maxlength')).toBe(String(boxes));
}

function expectBasicRendered() {
	expectFieldConfig(el<HTMLInputElement>(Field), 6);
	expect(el<HTMLInputElement>(Field).value).toBe('');

	for (let index = 0; index < 6; index++) {
		const box = item('item-', index);
		// The input carries the code; an exposed box would put every character in
		// the accessibility tree twice, which is QDS's bug and not ours.
		expect(box.hasAttribute('aria-hidden')).toBe(false);
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
	// What the family owns is not replaceable: the spread comes first, so the
	// consumer's own maxlength={2} loses to the six boxes it wrote.
	expect(input.getAttribute('maxlength')).toBe('6');
	expect(input.getAttribute('autocomplete')).toBe('one-time-code');
}

function expectLoopedBoxesRendered() {
	const boxes = LoopedItems.elements();
	expect(boxes.length).toBe(6);
	for (const box of boxes) {
		expect(box.hasAttribute('aria-hidden')).toBe(false);
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

	test(`${mode}: the field is stretched invisibly over every box`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectFieldStretchesOverTheBoxes(6);
	});

	test(`${mode}: a password manager's icon is pushed past the boxes and clipped away`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		const input = el<HTMLInputElement>(Field);
		// The strip the icon sits in: widened past the root, then clipped, so the
		// icon is neither on the boxes nor able to catch a click beside them.
		expect(getComputedStyle(input).clipPath).not.toBe('none');
		expect(input.getBoundingClientRect().right).toBeGreaterThan(el(Root).getBoundingClientRect().right);
	});

	test(`${mode}: a field asked not to shift covers the root exactly`, async () => {
		if (mode === 'CSR') await render(WithoutShift);
		else await renderSSR(WithoutShift);
		const input = el<HTMLInputElement>(Field);
		expect(getComputedStyle(input).clipPath).toBe('none');
		expect(input.getBoundingClientRect().right).toBe(el(Root).getBoundingClientRect().right);
		expect(topmostOver(item('item-', 0))).toBe(input);
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

// The point of stretching the field over the boxes: a person aims at a box and
// the input is what they hit, so no box needs a handler of its own.
test('CSR: clicking a box focuses the field, and typing then fills it', async () => {
	await render(Basic);
	// `force` skips the check that refuses a click on a covered element - being
	// covered by the field is exactly what is under test here.
	await userEvent.click(item('item-', 2), { force: true });
	await expect.poll(() => document.activeElement).toBe(el(Field));

	await userEvent.keyboard('7');
	await expect.poll(() => item('item-', 0).textContent).toBe('7');
	expect(el<HTMLInputElement>(Field).value).toBe('7');
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

// Eight rows here were skipped on one framework defect: `otp.value.slice(...)` in commit() lowered to a read of the whole
// callee chain, so the emitted call invoked a detached String.prototype.slice
// with no receiver and threw "slice called on null or undefined". Fixed in
// collect-expressions.ts (a method call reads its receiver). Five ran green on
// that fix; two of the last three are green now. Only the caret row below is still
// pinned, and on a framework wall rather than anything the family can shape
// around.

// An earlier pin said no box ever fills in WithOnChange;
// re-measured on this tip, every box fills — typing 1,2,3,4,5 one key at a time
// walks the boxes to ["1","2","3","4"] and stops, identical to WithoutOnChange.
// What was left was this row's own read order: `maxlength` truncates the input's
// value in the browser, before any handler runs, so polling the field value
// returns immediately and the hard assertion on the box raced the refresh the
// keystroke scheduled. The row now polls the box — the committed write, per the
// section note above — and asserts the field value after it.
test('CSR: typing past the last box adds nothing', async () => {
	await render(WithOnChange);
	el(Field).focus();

	await userEvent.keyboard('12345');
	await expect.poll(() => item('item-', 3).textContent).toBe('4');
	expect(el<HTMLInputElement>(Field).value).toBe('1234');
});

test('CSR: a whole code arriving at once fills every box', async () => {
	await render(Basic);
	pasteInto(el<HTMLInputElement>(Field), '123456');

	await expect.poll(() => item('item-', 5).textContent).toBe('6');
	expect(item('item-', 0).textContent).toBe('1');
	expect(item('item-', 2).textContent).toBe('3');
	expect(el<HTMLInputElement>(Field).value).toBe('123456');
});

test('CSR: a longer code arriving at once keeps only one character per box', async () => {
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

// Pinned on the construct-arm registration gap, with both halves of the
// isolation. A box registers its place in the code by writing the family's
// shared cell as it renders. That write lands when the box is written flat under
// the root, and it still lands when the box is nested inside plain elements —
// VerificationForm puts its six boxes inside a <div> and reports maxlength="6"
// in both modes. It is dropped when the box instance comes out of a construct
// arm: this @for scenario and the @if scenario below both paint their boxes and
// both leave the shared length at 0, on CSR and SSR alike. Same part, same
// statement, same index order, so the hosting construct is the whole cause.
// Everything downstream of the count then reads empty, which is what these rows
// see. The count claim for arm-delivered boxes lives here and in the row at the
// bottom of this file; the arm rows that stayed green assert the painting only.
test.skip('CSR: a box written by a loop follows the code like any other', async () => {
	await render(ItemsFromData);
	pasteInto(el<HTMLInputElement>(Field), '135');

	await expect.poll(() => LoopedItems.elements()[0]?.textContent).toBe('1');
	const boxes = LoopedItems.elements();
	expect(boxes[1]?.textContent).toBe('3');
	expect(boxes[2]?.textContent).toBe('5');
	expect(boxes[3]?.getAttribute('ui-empty')).toBe('');
});

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

// The row the whole derivation rests on. Nothing in DerivedLength says five: the
// five boxes it wrote are the only thing that decides where the code ends, so
// the fourth character is not a finished code and the fifth is.
test('CSR: five boxes make a five-character code, and onComplete waits for the fifth', async () => {
	await render(DerivedLength);
	expectFieldConfig(el<HTMLInputElement>(Field), 5);
	el(Field).focus();

	await userEvent.keyboard('1234');
	await expect.poll(() => item('item-', 3).textContent).toBe('4');
	expect(el(Completions).textContent).toBe('0');

	await userEvent.keyboard('5');
	await expect.poll(() => el(Code).textContent).toBe('12345');
	await expect.poll(() => el(Completions).textContent).toBe('1');

	// Six characters into five boxes: the count truncates the extra exactly as a
	// written length used to.
	pasteInto(el<HTMLInputElement>(Field), '987654');
	await expect.poll(() => el(Code).textContent).toBe('98765');
	expect(el<HTMLInputElement>(Field).value).toBe('98765');
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

// Still pinned, and re-measured against this tip. The wall
// is unchanged in kind: the family carries the caret policy
// (OtpField's onFocus, QDS's rule: setSelectionRange to the end of the code) and
// the CSR row below proves it runs, but it cannot run in TIME. A handler body is
// a symbol the framework dispatches asynchronously, so `focus()` followed
// immediately by a keystroke types before the caret has moved. What this tip
// measured, with the same scenario driven both ways:
//   - SSR, focus() then keyboard('5') back to back -> "51234"
//   - SSR, focus() then a 400ms wait -> selectionStart 4, then "12345", box 4 "5"
//   - CSR, focus() then keyboard('5') back to back -> "51234" (identical)
// The CSR arm is the one that matters for the pin: the deferral is framework-
// wide, not an SSR-resume delay, so no SSR-side change moves this row. The
// await-ordering fix on this tip did not shorten the window either. The row
// stays as written rather than polling the caret first, because polling is what
// the green CSR row below already does — this row exists to hold the harder
// claim that the policy lands before the very next keystroke.
// Two framework facts measured while first pinning this still hold, and both
// shape any fix:
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

// The arm-delivered verdict this family was asked for, in two halves. A part is
// not a widget root, so an arm that is DECIDED once carries its items fine — the
// rows below prove it in both modes. An arm that FLIPS is refused at compile
// time: `<otp.item>` inside `@if (someState)` fails the module with
// MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED ("cannot be rebuilt when ... changes
// because <otp.item> has to run to produce its content"), measured on this base
// by compiling the scenario. That is a framework limit, not a family one, so the
// scenario decides its arm from a module constant and this note carries the
// verdict instead of a red row. What an arm carries is the painting; the count
// those boxes register is dropped, so that half is the pinned row below.

for (const mode of MODES) {
	test(`${mode}: boxes delivered by an @if arm paint like boxes written flat`, async () => {
		if (mode === 'CSR') await render(ArmedLength);
		else await renderSSR(ArmedLength);
		expect(SmsBoxes.query()).not.toBeNull();
		expect(page.getByTestId('backup-boxes').query()).toBeNull();
		expect(item('sms-item-', 0).hasAttribute('aria-hidden')).toBe(false);
		expect(item('sms-item-', 5).getAttribute('ui-empty')).toBe('');
	});
}

// The other half, pinned on the same construct-arm registration gap the @for row
// above carries. Six boxes come out of the arm and the field still reports no
// length at all, in both modes, where six boxes nested in a plain <div> report
// six.
for (const mode of MODES) {
	test.skip(`${mode}: boxes delivered by an @if arm register the length of the code`, async () => {
		if (mode === 'CSR') await render(ArmedLength);
		else await renderSSR(ArmedLength);
		expect(el<HTMLInputElement>(Field).getAttribute('maxlength')).toBe('6');
	});
}

// The caret policy the family now carries, matched to QDS's `handleFocus`
// (otp-field.tsx:211-223: `setSelectionRange(code.length, code.length)`).
// The poll is not slack, it is the assertion: a handler body is a symbol the
// framework dispatches asynchronously, so the caret moves a turn after focus,
// never during it. This row proves the policy; the pinned SSR row above is
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

// Pinned on the construct-arm registration gap: the arm paints its boxes, but
// the length they register never reaches the field, so the code slices to empty.
test.skip('CSR: an arm-delivered box follows the code like any other', async () => {
	await render(ArmedLength);
	pasteInto(el<HTMLInputElement>(Field), '13');

	await expect.poll(() => item('sms-item-', 0).textContent).toBe('1');
	expect(item('sms-item-', 1).textContent).toBe('3');
	expect(item('sms-item-', 2).getAttribute('ui-empty')).toBe('');
});
