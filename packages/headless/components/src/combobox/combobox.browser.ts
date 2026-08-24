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
const Basic1 = page.getByTestId('basic');
const Premium = page.getByTestId('premium');
const Ultra = page.getByTestId('ultra');
const LockedRoot = page.getByTestId('locked-root');
const LockedInput = page.getByTestId('locked-input');
const LockedTrigger = page.getByTestId('locked-trigger');
const LockedLegacy = page.getByTestId('locked-legacy');
const Olive = page.getByTestId('olive');
const Basil = page.getByTestId('basil');
const Caper = page.getByTestId('caper');
const Picked = page.getByTestId('picked');
const Rows = page.getByTestId('rows');
const Empty = page.getByTestId('empty');
const Field = page.getByTestId('field');
const Description = page.getByTestId('description');
const ErrorMessage = page.getByTestId('error');
const Monthly = page.getByTestId('monthly');
const Annual = page.getByTestId('annual');
const Submitted = page.getByTestId('submitted');
const LeftInput = page.getByTestId('left-input');
const LeftTrigger = page.getByTestId('left-trigger');
const LeftContent = page.getByTestId('left-content');
const LeftBanana = page.getByTestId('left-banana');
const LeftBananaIndicator = page.getByTestId('left-banana-itemindicator');
const RightInput = page.getByTestId('right-input');
const RightContent = page.getByTestId('right-content');
const RightBasicIndicator = page.getByTestId('right-basic-itemindicator');
const Chosen = page.getByTestId('chosen');
const Typed = page.getByTestId('typed');
const Opens = page.getByTestId('opens');
const Changes = page.getByTestId('changes');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// A real submit would navigate the test iframe, so the event is dispatched instead;
// the read polls because the page's submit handler is a lazily loaded symbol.
async function expectSubmitted(expected: Record<string, string>) {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	await expect
		.poll(() => JSON.parse(el(Submitted).textContent || '{}'))
		.toEqual(expected);
}

async function typeInto(input: HTMLInputElement, text: string) {
	input.focus();
	await userEvent.keyboard(text);
}

// Give a dispatch the room a real gesture gets, then read.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

function expectBasicRendered() {
	// The INPUT carries role="combobox", not the trigger - the difference from select.
	expect(el(Input).tagName).toBe('INPUT');
	expect(el(Input).getAttribute('role')).toBe('combobox');
	expect(el(Input).getAttribute('aria-autocomplete')).toBe('list');
	expect(el(Input).getAttribute('aria-haspopup')).toBe('listbox');
	expect(el(Input).getAttribute('aria-expanded')).toBe('false');
	expect(el(Content).getAttribute('role')).toBe('listbox');
	// Closed hides the list and never detaches it, so aria-controls always resolves.
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

// Only the input is a tab stop, which is what makes focus stay in the field.
function expectOnlyTheInputIsATabStop() {
	expect(el(Trigger).getAttribute('tabindex')).toBe('-1');
	expect(el(Input).hasAttribute('tabindex')).toBe(false);
	for (const option of [Apple, Banana, Cherry]) {
		expect(el(option).getAttribute('tabindex')).toBe('-1');
	}
}

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

async function expectTriggerOpensAndFocusesTheField() {
	el(Trigger).click();
	await expect.poll(() => el(Input).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	await expect.poll(() => document.activeElement).toBe(el(Input));

	el(Trigger).click();
	await expect.poll(() => el(Input).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
}

// The label names the input with `for`, so the caret lands without a handler.
async function expectLabelFocusesTheField() {
	el(Label).click();
	await expect.poll(() => document.activeElement).toBe(el(Input));
}

async function expectChoosingWritesTheLabelIntoTheField() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);

	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el<HTMLInputElement>(Input).value).toBe('Banana');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
	expect(el(Apple).getAttribute('aria-selected')).toBe('false');
}

// Deliberate: clicking the option ALREADY chosen unselects it and leaves the list
// showing - the rule most likely to be "fixed" by a later reader.
async function expectClickingTheChosenOptionUnchoosesAndStaysOpen() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');

	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('false');
	await settle();
	expect(el<HTMLElement>(Content).hidden).toBe(false);
}

// A list that opens under a resting mouse must not steal the keyboard's highlight.
async function expectPointerHighlightsOnlyFromInsideTheList() {
	el(Apple).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
	await settle();
	expect(el(Apple).hasAttribute('ui-highlighted')).toBe(false);

	el(Content).dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
	await settle();
	el(Apple).dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
}

// Whatever focuses an option, the caret goes back to the field.
async function expectOptionFocusBouncesBackToTheField() {
	el<HTMLElement>(Apple).focus();
	await expect.poll(() => document.activeElement).toBe(el(Input));
}

async function expectArrowDownOpensAndHighlightsTheFirst() {
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Input).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
	// The highlight is state, not a focused element.
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

async function expectTheWalkStepsPastLockedOptionsAndLoops() {
	el<HTMLElement>(page.getByTestId('input')).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Basic1).getAttribute('ui-highlighted')).toBe('');
	await userEvent.keyboard('{ArrowDown}');
	// Premium is disabled, so the step lands on Ultra; `loop` then wraps the ends.
	await expect.poll(() => el(Ultra).getAttribute('ui-highlighted')).toBe('');
	expect(el(Premium).hasAttribute('ui-highlighted')).toBe(false);
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Basic1).getAttribute('ui-highlighted')).toBe('');
}

// The family ships no filter: the consumer filters their own list from
// `combobox.state().input`, and `@empty` is the empty state.
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

async function expectMoreThanOneChoiceAtATime() {
	el(Olive).click();
	await expect.poll(() => el(Olive).getAttribute('aria-selected')).toBe('true');
	el(Caper).click();
	await expect.poll(() => el(Caper).getAttribute('aria-selected')).toBe('true');
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

// The FIRST backspace on a field with text deletes text; only a backspace on an
// already empty field gives a value back.
async function expectBackspaceRemovesTheLastChoiceOnlyWhenTheFieldWasEmpty() {
	el(Olive).click();
	await expect.poll(() => el(Picked).textContent).toBe('olive');
	el(Basil).click();
	await expect.poll(() => el(Picked).textContent).toBe('olive,basil');

	const input = el<HTMLInputElement>(Input);
	await typeInto(input, 'x');
	await expect.poll(() => input.value).toBe('x');
	// Poll rather than read after settle(): a bare read raced the dispatch under
	// full-lane load, measured 1-in-2.
	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => el(Picked).textContent).toBe('olive,basil');
	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => el(Picked).textContent).toBe('olive');
}

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

// Without the identity guard, the dismissing press and the click it becomes would
// close the list and re-open it.
async function expectPressingTheTriggerOfAnOpenListClosesItAndLeavesItClosed() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	el(Trigger).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	el(Trigger).click();
	await settle();
	expect(el<HTMLElement>(Content).hidden).toBe(true);
}

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
	// Nothing chosen submits the empty value, as a native `<select>` does.
	await expectSubmitted({ plan: '' });
	el(Annual).click();
	await expect.poll(() => el(Annual).getAttribute('aria-selected')).toBe('true');
	await expectSubmitted({ plan: 'annual' });
	el(Monthly).click();
	await expect.poll(() => el(Monthly).getAttribute('aria-selected')).toBe('true');
	await expectSubmitted({ plan: 'monthly' });
}

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

// Callbacks fire from handlers, so there is no mount-time dispatch to suppress.
async function expectNoCallbackOnFirstRender() {
	await settle();
	expect(el(Opens).textContent).toBe('0');
	expect(el(Changes).textContent).toBe('0');
	expect(el(Typed).textContent).toBe('');
}

async function expectEveryCallbackReportsWhatHappened() {
	await typeInto(el<HTMLInputElement>(Input), 'ba');
	await expect.poll(() => el(Typed).textContent).toBe('ba');
	await expect.poll(() => el(Opens).textContent).toBe('1');
	expect(el(Changes).textContent).toBe('0');

	el(Banana).click();
	await expect.poll(() => el(Chosen).textContent).toBe('banana');
	await expect.poll(() => el(Changes).textContent).toBe('1');
	await expect.poll(() => el(Opens).textContent).toBe('2');
}

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
	expect(el<HTMLElement>(RightContent).hidden).toBe(true);

	el(LeftBanana).click();
	await expect.poll(() => el(LeftBanana).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el<HTMLInputElement>(LeftInput).value).toBe('Banana');
	expect(el<HTMLInputElement>(RightInput).value).toBe('');
	expect(el(LeftBananaIndicator).hasAttribute('ui-hidden')).toBe(false);
	expect(el(RightBasicIndicator).getAttribute('ui-hidden')).toBe('');
}

for (const mode of MODES) {
	test(`${mode}: the family renders its whole anatomy, closed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

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

	test(`${mode}: the consumer's own filter recomputes as the field is typed in`, async () => {
		if (mode === 'CSR') await render(Filtered);
		else await renderSSR(Filtered);
		await expectTheConsumerFilterRecomputes();
	});

	// `rowStartOffset` on the keyed-repeat record counts the element siblings before
	// the rows, so a `<p>` in front of them no longer shifts the pairing by one.
	test(`${mode}: the consumer's own filter narrows the list as the field is typed in`, async () => {
		if (mode === 'CSR') await render(Filtered);
		else await renderSSR(Filtered);
		await expectTheConsumerFilterNarrowsTheList();
	});

	// The keyed-repeat record carries the arm's finished markup, which works only for
	// an arm that is fully static and names no element, as this `<p>` is; the mint
	// reports the insert and the removal to the element census so indices hold.
	test(`${mode}: the empty arm is what speaks when nothing matches`, async () => {
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

	// `inline` is a boolean on the root: the list is always showing and nothing
	// dismisses it.
	test(`${mode}: an inline combobox shows its list without being opened`, async () => {
		if (mode === 'CSR') await render(Inline);
		else await renderSSR(Inline);
		expect(el<HTMLElement>(Content).hidden).toBe(false);
		expect(el(Root).getAttribute('ui-inline')).toBe('');
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
		await userEvent.keyboard('{Escape}');
		await settle();
		expect(el<HTMLElement>(Content).hidden).toBe(false);
	});
}

// PENDING CAPABILITY - `overlay` with an instance-constant conditional value.
// `overlayLiteralValue` returns null for anything but a boolean literal, so
// `combobox.content` writes `overlay` unconditionally and an inline list enlists in
// the overlay stack; the dismissal handler ignores the report, so nothing is broken.
test.fails('an inline list carries no overlay mark and never enlists', async () => {
	await render(Inline);
	expect(el(Content).hasAttribute('overlay')).toBe(false);
});

// PENDING CAPABILITY - aria-activedescendant is out of IDREF_ATTRIBUTES because
// nothing yet reads ONE row's minted id from an IDREF position, so the highlight is
// visible (`ui-highlighted`) and inaudible.
test.fails('the field names the highlighted option for a screen reader', async () => {
	await render(OpenList);
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Apple).getAttribute('ui-highlighted')).toBe('');
	const named = el(Input).getAttribute('aria-activedescendant');
	expect(named).toBeTruthy();
	expect(named).toBe(el(Apple).getAttribute('id'));
});

// PENDING CAPABILITY - an IDREF list is MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE, so
// this family names ONE handle and the second message goes undescribed.
test.fails('a combobox mounting both messages is described by both', async () => {
	await render(SignupForm);
	const describedBy = el(Input).getAttribute('aria-describedby') ?? '';
	expect(describedBy.split(' ').length).toBe(2);
});

// PENDING BEHAVIOUR - scroll the highlight into view. Not blocked, just unbuilt: one
// `scrollIntoView({ block: 'nearest' })` on the option the walk already hands back.
test.fails('the highlighted option is scrolled into view', async () => {
	await render(OpenList);
	el<HTMLElement>(Input).focus();
	await userEvent.keyboard('{End}');
	await expect.poll(() => el(Cherry).getAttribute('ui-highlighted')).toBe('');
	const list = el(Content);
	expect(list.scrollTop).toBeGreaterThan(0);
});
