import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { Basic } from './scenarios/basic.tsrx';
import { Filtered } from './scenarios/filtered.tsrx';
import { Inline } from './scenarios/inline.tsrx';
import { Multiple } from './scenarios/multiple.tsrx';
import { OpenList } from './scenarios/open-list.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { SignupForm } from './scenarios/signup-form.tsrx';
import { TwoComboboxes } from './scenarios/two-comboboxes.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';
import { WithCallbacks } from './scenarios/with-callbacks.tsrx';
import { WithError } from './scenarios/with-error.tsrx';

// Colocated browser suite for the combobox family. Each test renders a realistic
// consumer scenario, and the locators name the QDS part anatomy: root, label,
// input, trigger, content, item, itemlabel, itemindicator, description, error,
// field - prefixed per option, the way a consumer names their own choices.
//
// The behaviours asserted here are the sixteen read off Qwik UI's own handlers
// in goals/headless-components/notes/research-combobox.md section 5. Where one
// cannot ship, the row is `test.fails` with the reason beside it rather than
// absent.
const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Input = page.getByTestId('input');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const Apple = page.getByTestId('apple');
const AppleLabel = page.getByTestId('apple-itemlabel');
const AppleIndicator = page.getByTestId('apple-itemindicator');
const Banana = page.getByTestId('banana');
const BananaIndicator = page.getByTestId('banana-itemindicator');
const Cherry = page.getByTestId('cherry');
// Options and comboboxes nobody may use.
const Basic1 = page.getByTestId('basic');
const Premium = page.getByTestId('premium');
const Ultra = page.getByTestId('ultra');
const LockedRoot = page.getByTestId('locked-root');
const LockedInput = page.getByTestId('locked-input');
const LockedTrigger = page.getByTestId('locked-trigger');
const LockedLegacy = page.getByTestId('locked-legacy');
// More than one choice at a time.
const Olive = page.getByTestId('olive');
const Basil = page.getByTestId('basil');
const Caper = page.getByTestId('caper');
const Picked = page.getByTestId('picked');
// The consumer's own filtered list.
const Rows = page.getByTestId('rows');
const Empty = page.getByTestId('empty');
// The form and its hidden native control.
const Field = page.getByTestId('field');
const Description = page.getByTestId('description');
const ErrorMessage = page.getByTestId('error');
const Monthly = page.getByTestId('monthly');
const Annual = page.getByTestId('annual');
const Submitted = page.getByTestId('submitted');
// Two comboboxes on one page.
const LeftInput = page.getByTestId('left-input');
const LeftTrigger = page.getByTestId('left-trigger');
const LeftContent = page.getByTestId('left-content');
const LeftBanana = page.getByTestId('left-banana');
const LeftBananaIndicator = page.getByTestId('left-banana-itemindicator');
const RightInput = page.getByTestId('right-input');
const RightContent = page.getByTestId('right-content');
const RightBasicIndicator = page.getByTestId('right-basic-itemindicator');
// The consumer handlers' log.
const Chosen = page.getByTestId('chosen');
const Typed = page.getByTestId('typed');
const Opens = page.getByTestId('opens');
const Changes = page.getByTestId('changes');

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be passed
// by reference or wrapped in a helper - the branch below keeps both call sites
// literal, which is why this idiom rather than a `mount` parameter.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// A real submit would navigate the test iframe, so the event is dispatched. What
// is proven is what the browser itself put in the FormData for this form. The
// read polls: the page's own submit handler is a lazily loaded symbol, so the
// output is still empty on the line after the dispatch.
async function expectSubmitted(expected: Record<string, string>) {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	await expect
		.poll(() => JSON.parse(el(Submitted).textContent || '{}'))
		.toEqual(expected);
}

/** Type into the field the way a person does, one key at a time. */
async function typeInto(input: HTMLInputElement, text: string) {
	input.focus();
	await userEvent.keyboard(text);
}

/** Give a dispatch the room a real gesture gets, then read. */
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

// ---------------------------------------------------------------- 5.1 and 5.2

function expectBasicRendered() {
	// The INPUT is the role="combobox" element, not the trigger. That is the
	// whole difference from select, where a button carries the role.
	expect(el(Input).tagName).toBe('INPUT');
	expect(el(Input).getAttribute('role')).toBe('combobox');
	expect(el(Input).getAttribute('aria-autocomplete')).toBe('list');
	expect(el(Input).getAttribute('aria-haspopup')).toBe('listbox');
	expect(el(Input).getAttribute('aria-expanded')).toBe('false');
	expect(el(Content).getAttribute('role')).toBe('listbox');
	// Closed hides the list; it never detaches it, so the input's aria-controls
	// never points at nothing.
	expect(el<HTMLElement>(Content).hidden).toBe(true);
	expect(el(Root).getAttribute('role')).toBe('group');
	expect(el(Root).getAttribute('ui-closed')).toBe('');

	expect(page.getByRole('option', { includeHidden: true }).elements().length).toBe(3);
	for (const option of [Apple, Banana, Cherry]) {
		expect(el(option).getAttribute('aria-selected')).toBe('false');
		expect(el(option).getAttribute('aria-disabled')).toBe('false');
		expect(el(option).getAttribute('tabindex')).toBe('-1');
		expect(el(option).hasAttribute('ui-selected')).toBe(false);
		expect(el(option).hasAttribute('ui-highlighted')).toBe(false);
	}
}

// 5.1: the trigger is deliberately NOT tabbable. Only the input is a tab stop,
// which is what makes the whole focus-stays-in-the-field model hold.
function expectOnlyTheInputIsATabStop() {
	expect(el(Trigger).getAttribute('tabindex')).toBe('-1');
	expect(el(Input).hasAttribute('tabindex')).toBe(false);
	for (const option of [Apple, Banana, Cherry]) {
		expect(el(option).getAttribute('tabindex')).toBe('-1');
	}
}

// Every IDREF this family writes resolves to an element that is really there.
function expectNamedWithNoDanglingIdref() {
	const labelId = el(Label).getAttribute('id');
	const contentId = el(Content).getAttribute('id');
	expect(labelId).toBeTruthy();
	expect(contentId).toBeTruthy();
	expect(el(Input).getAttribute('aria-labelledby')).toBe(labelId);
	expect(el(Input).getAttribute('aria-controls')).toBe(contentId);
	expect(el(Content).getAttribute('aria-labelledby')).toBe(labelId);
	expect(el(Label).getAttribute('for')).toBe(el(Input).getAttribute('id'));
	expect(document.getElementById(labelId as string)).toBe(el(Label));
	expect(document.getElementById(contentId as string)).toBe(el(Content));
}

function expectOneElementPerPart() {
	expect(el(Root).children.length).toBe(4);
	expect(el(Root).children[0]).toBe(el(Label));
	expect(el(Root).children[1]).toBe(el(Input));
	expect(el(Root).children[2]).toBe(el(Trigger));
	expect(el(Root).children[3]).toBe(el(Content));
	expect(el(Content).children.length).toBe(3);
	expect(el(Apple).children.length).toBe(2);
	expect(el(Apple).children[0]).toBe(el(AppleLabel));
	expect(el(Apple).children[1]).toBe(el(AppleIndicator));
	expect(el(AppleIndicator).getAttribute('aria-hidden')).toBe('true');
}

// 5.2: the trigger focuses the field, then toggles the list.
async function expectTriggerOpensAndFocusesTheField() {
	el(Trigger).click();
	await expect.poll(() => el(Input).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	await expect.poll(() => document.activeElement).toBe(el(Input));

	el(Trigger).click();
	await expect.poll(() => el(Input).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
}

// 5.3: the label names the input with `for`, so a click lands the caret in the
// field without this family writing a handler for it.
async function expectLabelFocusesTheField() {
	el(Label).click();
	await expect.poll(() => document.activeElement).toBe(el(Input));
}

// ------------------------------------------------------------------- 5.4/5.13

// 5.13: choosing writes the option's own words into the field.
async function expectChoosingWritesTheLabelIntoTheField() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);

	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el<HTMLInputElement>(Input).value).toBe('Banana');
	// Choosing is what closes the list, in one gesture.
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
	expect(el(Apple).getAttribute('aria-selected')).toBe('false');
}

// 5.4, the quirk: clicking the option that is ALREADY chosen unselects it and
// leaves the list showing. That is Qwik UI's deliberate rule and it is the one
// most likely to be "fixed" by a later reader, so it gets its own row.
async function expectClickingTheChosenOptionUnchoosesAndStaysOpen() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');

	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('false');
	// Still showing: unchoosing is not choosing.
	await settle();
	expect(el<HTMLElement>(Content).hidden).toBe(false);
}

// ------------------------------------------------------------------------ 5.5

// The pointer highlights only once it is genuinely inside the list. A list that
// opens under a resting mouse must not steal the keyboard's highlight.
async function expectPointerHighlightsOnlyFromInsideTheList() {
	el(Apple).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
	await settle();
	expect(el(Apple).hasAttribute('ui-highlighted')).toBe(false);

	el(Content).dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
	await settle();
	el(Apple).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
}

// ------------------------------------------------------------------------ 5.6

// Whatever focuses an option, the caret goes back to the field. This is the
// safety net that keeps DOM focus in one place no matter what moved it.
async function expectOptionFocusBouncesBackToTheField() {
	el<HTMLElement>(Apple).focus();
	await expect.poll(() => document.activeElement).toBe(el(Input));
}

// ------------------------------------------------------------------------ 5.9

async function expectArrowDownOpensAndHighlightsTheFirst() {
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Input).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
	// DOM focus never moved: the highlight is state, not a focused element.
	expect(document.activeElement).toBe(el(Input));
}

async function expectArrowUpFromClosedHighlightsTheLast() {
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => el(Input).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(Cherry).getAttribute('ui-highlighted')).toBe('');
}

async function expectArrowsWalkAndStopAtTheEnds() {
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Banana).getAttribute('ui-highlighted')).toBe('');
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
	// Without `loop`, the top is the top.
	await userEvent.keyboard('{ArrowUp}');
	await settle();
	expect(el(Apple).getAttribute('ui-highlighted')).toBe('');
}

async function expectHomeAndEndJump() {
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
	await userEvent.keyboard('{End}');
	await expect.poll(() => el(Cherry).getAttribute('ui-highlighted')).toBe('');
	await userEvent.keyboard('{Home}');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
}

async function expectEnterTakesTheHighlightedOption() {
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}{ArrowDown}');
	await expect.poll(() => el(Banana).getAttribute('ui-highlighted')).toBe('');
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el<HTMLInputElement>(Input).value).toBe('Banana');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
}

async function expectEscapeClosesAndLeavesTheValueAlone() {
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
	expect(el(Apple).getAttribute('aria-selected')).toBe('false');
	expect(document.activeElement).toBe(el(Input));
}

// The walk steps past an option nobody may choose, and `loop` wraps the ends.
async function expectTheWalkStepsPastLockedOptionsAndLoops() {
	el<HTMLElement>(page.getByTestId('input')).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Basic1).getAttribute('ui-highlighted')).toBe('');
	await userEvent.keyboard('{ArrowDown}');
	// Premium is disabled, so the step lands on Ultra.
	await expect.poll(() => el(Ultra).getAttribute('ui-highlighted')).toBe('');
	expect(el(Premium).hasAttribute('ui-highlighted')).toBe(false);
	// `loop` on this root: past the last is the first.
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Basic1).getAttribute('ui-highlighted')).toBe('');
}

// ----------------------------------------------------------------------- 5.11

// The family ships no filter: the consumer filters their own list from
// `combobox.state().input`, and `@empty` is the empty state the dropped
// `combobox.empty` part used to be.
// The consumer's computed reaches the page: `matches.length` is rendered beside
// the rows and it follows the field.
async function expectTheConsumerFilterRecomputes() {
	await expect.poll(() => page.getByTestId('count').element()?.textContent).toBe('4');
	await typeInto(el<HTMLInputElement>(Input), 'ap');
	await expect.poll(() => page.getByTestId('count').element()?.textContent).toBe('2');
}

async function expectTheConsumerFilterNarrowsTheList() {
	await expect.poll(() => el(Rows).querySelectorAll('[role="option"]').length).toBe(4);
	await typeInto(el<HTMLInputElement>(Input), 'ap');
	await expect.poll(() => el(Rows).querySelectorAll('[role="option"]').length).toBe(2);
	const words = Array.from(el(Rows).querySelectorAll('[role="option"]')).map((option) =>
		(option.textContent ?? '').trim(),
	);
	expect(words).toEqual(['Apple', 'Grape']);
}

async function expectTheEmptyArmSpeaksWhenNothingMatches() {
	await typeInto(el<HTMLInputElement>(Input), 'zzz');
	await expect.poll(() => el(Rows).querySelectorAll('[role="option"]').length).toBe(0);
	await expect.poll(() => Empty.element()?.textContent).toBe('Nothing matches');
}

// --------------------------------------------------------------- 5.10 and D3

async function expectMoreThanOneChoiceAtATime() {
	el(Olive).click();
	await expect.poll(() => el(Olive).getAttribute('aria-selected')).toBe('true');
	el(Caper).click();
	await expect.poll(() => el(Caper).getAttribute('aria-selected')).toBe('true');
	// Both, not the last one: that is the whole point of `multiple`.
	expect(el(Olive).getAttribute('aria-selected')).toBe('true');
	expect(el(Basil).getAttribute('aria-selected')).toBe('false');
	await expect.poll(() => el(Picked).textContent).toBe('olive,caper');
	// The list stays showing while more choices are being made.
	expect(el<HTMLElement>(Content).hidden).toBe(false);
}

async function expectClickingAChosenOptionGivesItBack() {
	el(Olive).click();
	await expect.poll(() => el(Olive).getAttribute('aria-selected')).toBe('true');
	el(Olive).click();
	await expect.poll(() => el(Olive).getAttribute('aria-selected')).toBe('false');
	await expect.poll(() => el(Picked).textContent).toBe('');
}

// 5.10: the two-flag dance. The FIRST backspace on a field with text deletes
// text; only a backspace on an already empty field gives a value back.
async function expectBackspaceRemovesTheLastChoiceOnlyWhenTheFieldWasEmpty() {
	el(Olive).click();
	await expect.poll(() => el(Picked).textContent).toBe('olive');
	el(Basil).click();
	await expect.poll(() => el(Picked).textContent).toBe('olive,basil');

	const input = el<HTMLInputElement>(Input);
	await typeInto(input, 'x');
	await expect.poll(() => input.value).toBe('x');
	// This one deletes the text, not a choice.
	await userEvent.keyboard('{Backspace}');
	await settle();
	expect(el(Picked).textContent).toBe('olive,basil');
	// This one, on an empty field, gives the last choice back.
	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => el(Picked).textContent).toBe('olive');
}

// -------------------------------------------------------------- 5.8 dismissal

async function expectEscapeDismissesTheOpenList() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(Input));
}

async function expectAPressOutsideDismissesTheOpenList() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
}

// The press that dismissed is the same press whose click the trigger is about to
// see: without the identity guard, pressing the trigger of an open list closes it
// on the press and re-opens it on the click.
async function expectPressingTheTriggerOfAnOpenListClosesItAndLeavesItClosed() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	el(Trigger).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	el(Trigger).click();
	await settle();
	expect(el<HTMLElement>(Content).hidden).toBe(true);
}

// ---------------------------------------------------------------- 5.15 a form

function expectFormPartsRendered() {
	expect(el(Field).tagName).toBe('SELECT');
	expect(el(Field).getAttribute('name')).toBe('plan');
	expect(el(Field).getAttribute('aria-hidden')).toBe('true');
	expect(el(Field).getAttribute('tabindex')).toBe('-1');
	expect(el<HTMLSelectElement>(Field).required).toBe(true);
	const describedId = el(Description).getAttribute('id');
	expect(describedId).toBeTruthy();
	expect(el(Input).getAttribute('aria-describedby')).toBe(describedId);
}

async function expectOnlyTheChosenOptionIsSubmitted() {
	// Nothing chosen submits the empty value, which is what a native `<select>`
	// with no choice does.
	await expectSubmitted({ plan: '' });
	el(Annual).click();
	await expect.poll(() => el(Annual).getAttribute('aria-selected')).toBe('true');
	await expectSubmitted({ plan: 'annual' });
	el(Monthly).click();
	await expect.poll(() => el(Monthly).getAttribute('aria-selected')).toBe('true');
	await expectSubmitted({ plan: 'monthly' });
}

// --------------------------------------------------------------- locked state

function expectDisabledRendered() {
	expect(el(Premium).getAttribute('aria-disabled')).toBe('true');
	expect(el(Premium).getAttribute('ui-disabled')).toBe('');
	expect(el(Basic1).getAttribute('aria-disabled')).toBe('false');

	expect(el(LockedRoot).getAttribute('ui-disabled')).toBe('');
	expect(el<HTMLInputElement>(LockedInput).disabled).toBe(true);
	expect(el<HTMLButtonElement>(LockedTrigger).disabled).toBe(true);
	// A locked combobox locks every option inside it, not only its field.
	expect(el(LockedLegacy).getAttribute('aria-disabled')).toBe('true');
}

async function expectDisabledBlocks() {
	el(Premium).click();
	el(LockedLegacy).click();
	await settle();
	expect(el(Premium).getAttribute('aria-selected')).toBe('false');
	expect(el(LockedLegacy).getAttribute('aria-selected')).toBe('false');
}

// ---------------------------------------------------------------------- 5.16

// No mount-time dispatch. Qwik UI needs an `initialLoad` latch to suppress three
// effects on first render; callbacks here fire from handlers, so there is
// nothing to suppress.
async function expectNoCallbackOnFirstRender() {
	await settle();
	expect(el(Opens).textContent).toBe('0');
	expect(el(Changes).textContent).toBe('0');
	expect(el(Typed).textContent).toBe('');
}

async function expectEveryCallbackReportsWhatHappened() {
	await typeInto(el<HTMLInputElement>(Input), 'ba');
	await expect.poll(() => el(Typed).textContent).toBe('ba');
	// Typing opened the list, which is one open report and no change report.
	await expect.poll(() => el(Opens).textContent).toBe('1');
	expect(el(Changes).textContent).toBe('0');

	el(Banana).click();
	await expect.poll(() => el(Chosen).textContent).toBe('banana');
	await expect.poll(() => el(Changes).textContent).toBe('1');
	await expect.poll(() => el(Opens).textContent).toBe('2');
}

// ------------------------------------------------------- two on one page

async function expectTwoComboboxesStayApart() {
	const leftLabelId = el(page.getByTestId('left-label')).getAttribute('id');
	const rightLabelId = el(page.getByTestId('right-label')).getAttribute('id');
	expect(leftLabelId).not.toBe(rightLabelId);
	expect(el(LeftInput).getAttribute('aria-labelledby')).toBe(leftLabelId);
	expect(el(RightInput).getAttribute('aria-labelledby')).toBe(rightLabelId);
	expect(el(LeftInput).getAttribute('aria-controls')).toBe(el(LeftContent).getAttribute('id'));
	expect(el(RightInput).getAttribute('aria-controls')).toBe(el(RightContent).getAttribute('id'));

	el(LeftTrigger).click();
	await expect.poll(() => el<HTMLElement>(LeftContent).hidden).toBe(false);
	// The other one stayed shut.
	expect(el<HTMLElement>(RightContent).hidden).toBe(true);

	el(LeftBanana).click();
	await expect.poll(() => el(LeftBanana).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el<HTMLInputElement>(LeftInput).value).toBe('Banana');
	expect(el<HTMLInputElement>(RightInput).value).toBe('');
	expect(el(LeftBananaIndicator).hasAttribute('ui-hidden')).toBe(false);
	expect(el(RightBasicIndicator).getAttribute('ui-hidden')).toBe('');
}

// ============================================================ the rows

for (const mode of MODES) {
	test(`${mode}: the family renders its whole anatomy, closed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	// A choice served with the page: the option says it is the chosen one and its
	// indicator is showing, without a gesture having happened.
	test(`${mode}: a choice made before the page was served renders as chosen`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expect(el(Banana).getAttribute('aria-selected')).toBe('true');
		expect(el(Banana).getAttribute('ui-selected')).toBe('');
		expect(el(BananaIndicator).hasAttribute('ui-hidden')).toBe(false);
		expect(el(Apple).getAttribute('aria-selected')).toBe('false');
		expect(el(AppleIndicator).getAttribute('ui-hidden')).toBe('');
	});

	test(`${mode}: only the input is a tab stop`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOnlyTheInputIsATabStop();
	});

	test(`${mode}: every reference this family writes names an element that exists`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectNamedWithNoDanglingIdref();
	});

	test(`${mode}: every part renders exactly one element`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneElementPerPart();
	});

	test(`${mode}: the trigger shows the list and puts the caret back in the field`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectTriggerOpensAndFocusesTheField();
	});

	test(`${mode}: clicking the label lands the caret in the field`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectLabelFocusesTheField();
	});

	test(`${mode}: choosing an option writes its words into the field and closes the list`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectChoosingWritesTheLabelIntoTheField();
	});

	test(`${mode}: clicking the option already chosen gives it back and leaves the list showing`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectClickingTheChosenOptionUnchoosesAndStaysOpen();
	});

	test(`${mode}: a pointer highlights only once it is inside the list`, async () => {
		if (mode === 'CSR') await render(OpenList);
		else await renderSSR(OpenList);
		await expectPointerHighlightsOnlyFromInsideTheList();
	});

	test(`${mode}: focusing an option puts the caret back in the field`, async () => {
		if (mode === 'CSR') await render(OpenList);
		else await renderSSR(OpenList);
		await expectOptionFocusBouncesBackToTheField();
	});

	test(`${mode}: arrow down from a closed field shows the list on the first option`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectArrowDownOpensAndHighlightsTheFirst();
	});

	test(`${mode}: arrow up from a closed field lands on the last option`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectArrowUpFromClosedHighlightsTheLast();
	});

	test(`${mode}: the arrows walk the options and the ends hold`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectArrowsWalkAndStopAtTheEnds();
	});

	test(`${mode}: home and end are absolute moves in the same walk`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectHomeAndEndJump();
	});

	test(`${mode}: enter takes the highlighted option`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectEnterTakesTheHighlightedOption();
	});

	test(`${mode}: escape closes the list and leaves the choice untouched`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectEscapeClosesAndLeavesTheValueAlone();
	});

	test(`${mode}: the walk steps past an option nobody may choose, and loop wraps`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		await expectTheWalkStepsPastLockedOptionsAndLoops();
	});

	test(`${mode}: a locked option and a locked combobox refuse every gesture`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		expectDisabledRendered();
		await expectDisabledBlocks();
	});

	// The half that works: the consumer's `computed()` over
	// `combobox.state().input` DOES refresh as the field is typed in. That is what
	// makes the two pinned rows below a repeat problem rather than a
	// shared-instance one.
	test(`${mode}: the consumer's own filter recomputes as the field is typed in`, async () => {
		if (mode === 'CSR') await render(Filtered);
		else await renderSSR(Filtered);
		await expectTheConsumerFilterRecomputes();
	});

	// PENDING CAPABILITY - a keyed repeat does not follow its source. Measured
	// twice on this tip, both shapes red in CSR and SSR: with the source a
	// `computed()` over the adopted instance, and with it a plain `state()` array
	// rewritten from the family's own `onInput`. In both, a text read of the same
	// array updates - the page renders `matches.length` as 2 - while the `@for`
	// keeps all four rows. The rows root a widget each (`combobox.item`), which is
	// the one thing this shape has that the landed repeat witnesses in
	// packages/vitest-browser/browser/ do not. Deterministic, so test.fails.
	test.fails(`${mode}: the consumer's own filter narrows the list as the field is typed in`, async () => {
		if (mode === 'CSR') await render(Filtered);
		else await renderSSR(Filtered);
		await expectTheConsumerFilterNarrowsTheList();
	});

	test.fails(`${mode}: the empty arm is what speaks when nothing matches`, async () => {
		if (mode === 'CSR') await render(Filtered);
		else await renderSSR(Filtered);
		await expectTheEmptyArmSpeaksWhenNothingMatches();
	});

	test(`${mode}: more than one option can be chosen at a time`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);
		await expectMoreThanOneChoiceAtATime();
	});

	test(`${mode}: clicking a chosen option in a multiple combobox gives it back`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);
		await expectClickingAChosenOptionGivesItBack();
	});

	test(`${mode}: backspace removes the last choice only from an already empty field`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);
		await expectBackspaceRemovesTheLastChoiceOnlyWhenTheFieldWasEmpty();
	});

	test(`${mode}: escape dismisses the shown list`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectEscapeDismissesTheOpenList();
	});

	test(`${mode}: a press outside dismisses the shown list`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectAPressOutsideDismissesTheOpenList();
	});

	test(`${mode}: pressing the trigger of a shown list closes it and leaves it closed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectPressingTheTriggerOfAnOpenListClosesItAndLeavesItClosed();
	});

	test(`${mode}: a form renders the hidden control and the description`, async () => {
		if (mode === 'CSR') await render(SignupForm);
		else await renderSSR(SignupForm);
		expectFormPartsRendered();
	});

	test(`${mode}: only the chosen option appears in what the form submits`, async () => {
		if (mode === 'CSR') await render(SignupForm);
		else await renderSSR(SignupForm);
		await expectOnlyTheChosenOptionIsSubmitted();
	});

	test(`${mode}: no callback fires on first render`, async () => {
		if (mode === 'CSR') await render(WithCallbacks);
		else await renderSSR(WithCallbacks);
		await expectNoCallbackOnFirstRender();
	});

	test(`${mode}: every callback reports what happened`, async () => {
		if (mode === 'CSR') await render(WithCallbacks);
		else await renderSSR(WithCallbacks);
		await expectEveryCallbackReportsWhatHappened();
	});

	test(`${mode}: two comboboxes on one page stay apart`, async () => {
		if (mode === 'CSR') await render(TwoComboboxes);
		else await renderSSR(TwoComboboxes);
		await expectTwoComboboxesStayApart();
	});

	test(`${mode}: an invalid combobox says so on the field`, async () => {
		if (mode === 'CSR') await render(WithError);
		else await renderSSR(WithError);
		expect(el(Input).getAttribute('aria-invalid')).toBe('true');
		expect(el(ErrorMessage).getAttribute('role')).toBe('alert');
		expect(el(Input).getAttribute('aria-describedby')).toBe(el(ErrorMessage).getAttribute('id'));
	});

	// `inline` is a boolean on the root: the list is part of the page, always
	// showing, and nothing dismisses it.
	test(`${mode}: an inline combobox shows its list without being opened`, async () => {
		if (mode === 'CSR') await render(Inline);
		else await renderSSR(Inline);
		expect(el<HTMLElement>(Content).hidden).toBe(false);
		expect(el(Root).getAttribute('ui-inline')).toBe('');
		// Nothing expands, so neither word is written on the field.
		expect(el(Input).hasAttribute('aria-expanded')).toBe(false);
		expect(el(Input).hasAttribute('aria-haspopup')).toBe(false);
	});

	test(`${mode}: an inline list answers the keyboard without ever opening`, async () => {
		if (mode === 'CSR') await render(Inline);
		else await renderSSR(Inline);
		el<HTMLElement>(Input).focus();
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => el(Apple).getAttribute('aria-selected')).toBe('true');
		// Escape is a no-op in an inline list: there is nothing to close.
		await userEvent.keyboard('{Escape}');
		await settle();
		expect(el<HTMLElement>(Content).hidden).toBe(false);
	});
}

// ============================================================ pinned rows

// PENDING CAPABILITY - conditional `overlay`. The owner ruled on 2026-08-23 that
// `overlay` accepts an INSTANCE-CONSTANT conditional value, which is what lets
// one content part serve both modes. The compiler does not implement it yet:
// `overlayLiteralValue` in packages/compiler/src/passes/semantic-graph/
// overlay-attribute.ts returns null for anything but a boolean literal, and the
// caller refuses it as MARKLESS_OVERLAY_VALUE_UNSUPPORTED. So `combobox.content`
// writes `overlay` unconditionally and an inline list enlists in the overlay
// stack, which the owner's ruling says it never should. Everything a person
// experiences is right - the dismissal handler ignores the report in inline mode
// - so this is the one assertion that cannot be made. Deterministic, so
// test.fails rather than skip: it turns red the day the capability lands.
test.fails('an inline list carries no overlay mark and never enlists', async () => {
	await render(Inline);
	expect(el(Content).hasAttribute('overlay')).toBe(false);
});

// PENDING CAPABILITY - aria-activedescendant. DOM focus stays in the field, so
// the ONLY channel that tells a reader which option is highlighted is
// aria-activedescendant, and the compiler leaves it out of IDREF_ATTRIBUTES
// deliberately (packages/compiler/src/passes/semantic-graph/idref-attributes.ts:
// "it names one row of a live collection, which needs per-row identity that this
// slice does not build"). The plural handle landed since that comment was
// written and it answers the ordered walk, but nothing yet reads ONE row's
// minted id from an IDREF position. Until it does, the highlight is visible
// (`ui-highlighted`) and inaudible.
test.fails('the field names the highlighted option for a screen reader', async () => {
	await render(OpenList);
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
	const named = el(Input).getAttribute('aria-activedescendant');
	expect(named).toBeTruthy();
	expect(named).toBe(el(Apple).getAttribute('id'));
});

// PENDING CAPABILITY - a composite IDREF. Qwik UI writes
// `aria-describedby="{description} {error}"`; an IDREF LIST is
// MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE, so this family names ONE handle and a
// combobox that mounts both messages is described by the first. Same call select
// made for aria-labelledby, and the same one textbox made for this attribute.
test.fails('a combobox mounting both messages is described by both', async () => {
	await render(SignupForm);
	const describedBy = el(Input).getAttribute('aria-describedby') ?? '';
	expect(describedBy.split(' ').length).toBe(2);
});

// PENDING BEHAVIOUR - scroll the highlight into view (behaviour 5.14). Qwik UI
// debounces 100 ms, then rooted an IntersectionObserver at the panel and calls
// scrollBy with a centring offset, and only while the last move was a keyboard
// one. Deferred with the behaviour named rather than half-built: it is one
// `scrollIntoView({ block: 'nearest' })` on the option the walk landed on, and
// the walk already hands that element back. Nothing about it is blocked; it is
// scope, and this row is what says so out loud.
test.fails('the highlighted option is scrolled into view', async () => {
	await render(OpenList);
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{End}');
	await expect.poll(() => el(Cherry).getAttribute('ui-highlighted')).toBe('');
	const list = el(Content);
	expect(list.scrollTop).toBeGreaterThan(0);
});
