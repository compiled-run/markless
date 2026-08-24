import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { Basic } from './scenarios/basic.tsrx';
import { LongList } from './scenarios/long-list.tsrx';
import { OpenList } from './scenarios/open-list.tsrx';
import { OptionalOption } from './scenarios/optional-option.tsrx';
import { OptionsFromData } from './scenarios/options-from-data.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { SignupForm } from './scenarios/signup-form.tsrx';
import { TwoSelects } from './scenarios/two-selects.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';
import { WithOnChange } from './scenarios/with-onchange.tsrx';
import { WithoutOnChange } from './scenarios/without-onchange.tsrx';

// Colocated browser suite for the select family. Each test renders a realistic
// consumer scenario, and the locators name the QDS part anatomy: root, label,
// trigger, content, item, itemlabel, itemindicator, field - prefixed per option,
// the way a consumer names their own choices.
const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const Apple = page.getByTestId('apple');
const AppleLabel = page.getByTestId('apple-itemlabel');
const AppleIndicator = page.getByTestId('apple-itemindicator');
const Banana = page.getByTestId('banana');
const BananaIndicator = page.getByTestId('banana-itemindicator');
const Cherry = page.getByTestId('cherry');
const CherryIndicator = page.getByTestId('cherry-itemindicator');
// Options and selects nobody may choose.
const LockedRoot = page.getByTestId('locked-root');
const LockedTrigger = page.getByTestId('locked-trigger');
const LockedPremium = page.getByTestId('locked-premium');
const LockedPremiumIndicator = page.getByTestId('locked-premium-itemindicator');
// The signup form and its hidden native control.
const Field = page.getByTestId('field');
const Monthly = page.getByTestId('monthly');
const Annual = page.getByTestId('annual');
const Submitted = page.getByTestId('submitted');
// Two selects on one page.
const LeftTrigger = page.getByTestId('left-trigger');
const LeftContent = page.getByTestId('left-content');
const LeftBanana = page.getByTestId('left-banana');
const LeftBananaIndicator = page.getByTestId('left-banana-itemindicator');
const RightContent = page.getByTestId('right-content');
const RightBasicIndicator = page.getByTestId('right-basic-itemindicator');
// The consumer handlers' log.
const Value = page.getByTestId('value');
const Calls = page.getByTestId('calls');
const Opens = page.getByTestId('opens');

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be passed
// by reference or wrapped in a helper — the branch below keeps both call sites
// literal, which is why this idiom rather than a `mount` parameter.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// A real submit would navigate the test iframe, so the event is dispatched. What
// is proven is what the browser itself put in the FormData for this form.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

// The gesture that opens the popup, and the wait the roving focus needs: the
// listbox is `hidden` until the open cell reaches the DOM, so the family moves
// focus one frame later rather than into a subtree nothing can focus.
async function openWith(key: string) {
	el(Trigger).focus();
	await userEvent.keyboard(key);
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
}

async function focused() {
	return document.activeElement as HTMLElement;
}

function expectBasicRendered() {
	// The trigger is a combobox, not a button: a reader that says "button,
	// collapsed" fails aria-at's `Role 'combobox' is conveyed` row, and that is
	// exactly what QDS's bare <button aria-haspopup> produces.
	expect(el(Trigger).tagName).toBe('BUTTON');
	expect(el(Trigger).getAttribute('role')).toBe('combobox');
	expect(el(Trigger).getAttribute('aria-haspopup')).toBe('listbox');
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(Content).getAttribute('role')).toBe('listbox');
	// Closed hides the popup; it never detaches it, so the trigger's
	// aria-controls never points at nothing.
	expect(el<HTMLElement>(Content).hidden).toBe(true);
	expect(el(Root).getAttribute('ui-closed')).toBe('');
	expect(el(Root).hasAttribute('ui-open')).toBe(false);

	expect(page.getByRole('option', { includeHidden: true }).elements().length).toBe(3);
	for (const option of [Apple, Banana, Cherry]) {
		expect(el(option).getAttribute('aria-selected')).toBe('false');
		expect(el(option).getAttribute('aria-disabled')).toBe('false');
		expect(el(option).getAttribute('tabindex')).toBe('-1');
		expect(el(option).hasAttribute('ui-selected')).toBe(false);
	}
}

// Every IDREF this family writes resolves to an element that is really there.
// QDS's trigger names a label id unconditionally, so a select written without a
// label part carries a dangling reference; here the id is minted from the handle
// the label part binds.
function expectNamedWithNoDanglingIdref() {
	const labelId = el(Label).getAttribute('id');
	const contentId = el(Content).getAttribute('id');
	expect(labelId).toBeTruthy();
	expect(contentId).toBeTruthy();
	expect(el(Trigger).getAttribute('aria-labelledby')).toBe(labelId);
	expect(el(Trigger).getAttribute('aria-controls')).toBe(contentId);
	expect(el(Content).getAttribute('aria-labelledby')).toBe(labelId);
	expect(document.getElementById(labelId as string)).toBe(el(Label));
	expect(document.getElementById(contentId as string)).toBe(el(Content));
}

// One element per part: every part this family ships renders exactly one piece
// of markup, so a consumer's stylesheet and a screen reader see the tree they
// wrote.
function expectOneElementPerPart() {
	expect(el(Root).children.length).toBe(3);
	expect(el(Root).children[0]).toBe(el(Label));
	expect(el(Root).children[1]).toBe(el(Trigger));
	expect(el(Root).children[2]).toBe(el(Content));
	expect(el(Content).children.length).toBe(3);
	expect(el(Apple).children.length).toBe(2);
	expect(el(Apple).children[0]).toBe(el(AppleLabel));
	expect(el(Apple).children[1]).toBe(el(AppleIndicator));
	expect(el(AppleIndicator).getAttribute('aria-hidden')).toBe('true');
}

function expectPrefilledRendered() {
	expect(el(Banana).getAttribute('aria-selected')).toBe('true');
	expect(el(Banana).getAttribute('ui-selected')).toBe('');
	expect(el(BananaIndicator).hasAttribute('ui-hidden')).toBe(false);

	expect(el(Apple).getAttribute('aria-selected')).toBe('false');
	expect(el(AppleIndicator).getAttribute('ui-hidden')).toBe('');
	expect(el(CherryIndicator).getAttribute('ui-hidden')).toBe('');
}

async function expectTriggerOpensAndCloses() {
	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	expect(el(Root).getAttribute('ui-open')).toBe('');

	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
}

async function expectOptionChoosesAndCloses() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);

	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');
	// Choosing is what closes the popup, in one gesture.
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
	expect(el(Apple).getAttribute('aria-selected')).toBe('false');
}

async function expectChoosingOneUnchoosesTheOther() {
	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');
	el(Apple).click();
	await expect.poll(() => el(Apple).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('false');
}

function expectDisabledRendered() {
	expect(el(Banana).getAttribute('aria-disabled')).toBe('true');
	expect(el(Banana).getAttribute('ui-disabled')).toBe('');
	expect(el(Apple).getAttribute('aria-disabled')).toBe('false');

	expect(el(LockedRoot).getAttribute('ui-disabled')).toBe('');
	expect(el<HTMLButtonElement>(LockedTrigger).disabled).toBe(true);
	// A locked select locks every option inside it, not only its trigger.
	expect(el(LockedPremium).getAttribute('aria-disabled')).toBe('true');
}

async function expectDisabledBlocks() {
	el(Banana).click();
	el(LockedPremium).click();
	// Give a dispatch the room a real choice gets, then read: nothing moved.
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(Banana).getAttribute('aria-selected')).toBe('false');
	expect(el(LockedPremiumIndicator).getAttribute('ui-hidden')).toBe('');
}

function expectFormConfigRendered() {
	// The hidden native control is the only thing in this family a form sees,
	// and it is out of the tab order and out of the accessibility tree.
	expect(el(Field).tagName).toBe('SELECT');
	expect(el(Field).getAttribute('aria-hidden')).toBe('true');
	expect(el<HTMLSelectElement>(Field).tabIndex).toBe(-1);
	expect(el<HTMLSelectElement>(Field).name).toBe('plan');
	expect(el<HTMLSelectElement>(Field).required).toBe(true);
	expect(el(Root).getAttribute('ui-required')).toBe('');
	// Present for a form, absent from sight.
	expect(getComputedStyle(el(Field).parentElement as Element).position).toBe('absolute');
}

async function expectChosenOptionSubmits() {
	await expect.poll(() => submit().textContent).toBe('{"plan":""}');

	el(Annual).click();
	await expect.poll(() => submit().textContent).toBe('{"plan":"annual"}');

	el(Monthly).click();
	await expect.poll(() => submit().textContent).toBe('{"plan":"monthly"}');
}

async function expectConsumerCallbacksCarryTheirValue() {
	expect(el(Calls).textContent).toBe('0');
	expect(el(Value).textContent).toBe('');

	el(Trigger).click();
	await expect.poll(() => el(Opens).textContent).toBe('o');

	el(Banana).click();
	await expect.poll(() => el(Value).textContent).toBe('banana');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	// Choosing closes, so the open callback hears about that too.
	await expect.poll(() => el(Opens).textContent).toBe('oc');

	// Choosing what is already chosen is not a change, so nothing is announced.
	el(Trigger).click();
	el(Banana).click();
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(Calls).textContent).toBe('1');
}

async function expectOmittedCallbacksStillChoose() {
	el(Trigger).click();
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(false);
	el(Banana).click();
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');
}

async function expectSelectsStayIsolated() {
	el(LeftTrigger).click();
	await expect.poll(() => el<HTMLElement>(LeftContent).hidden).toBe(false);
	// The other select never heard about it.
	expect(el<HTMLElement>(RightContent).hidden).toBe(true);

	el(LeftBanana).click();
	await expect.poll(() => el(LeftBanana).getAttribute('aria-selected')).toBe('true');
	expect(el(LeftBananaIndicator).hasAttribute('ui-hidden')).toBe(false);
	expect(el(RightBasicIndicator).getAttribute('ui-hidden')).toBe('');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named combobox over a hidden listbox`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: every IDREF the family writes resolves to a real element`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectNamedWithNoDanglingIdref();
	});

	test(`${mode}: every part renders exactly one element`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneElementPerPart();
	});

	test(`${mode}: a prefilled value marks exactly that option`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectPrefilledRendered();
	});

	test(`${mode}: the trigger opens the popup and closes it again`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectTriggerOpensAndCloses();
	});

	test(`${mode}: clicking an option chooses it and closes the popup`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectOptionChoosesAndCloses();
	});

	test(`${mode}: choosing one option unchooses the other`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectChoosingOneUnchoosesTheOther();
	});

	test(`${mode}: an unavailable option and a locked select render their flags`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		expectDisabledRendered();
	});

	test(`${mode}: an unavailable option and a locked select cannot be chosen`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		await expectDisabledBlocks();
	});

	test(`${mode}: the form carries the select's name and a hidden native control`, async () => {
		if (mode === 'CSR') await render(SignupForm);
		else await renderSSR(SignupForm);
		expectFormConfigRendered();
	});

	test(`${mode}: only the chosen option appears in what the form submits`, async () => {
		if (mode === 'CSR') await render(SignupForm);
		else await renderSSR(SignupForm);
		await expectChosenOptionSubmits();
	});

	test(`${mode}: the consumer callbacks are called once with the new value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbacksCarryTheirValue();
	});

	test(`${mode}: omitted callbacks still choose and still open`, async () => {
		if (mode === 'CSR') await render(WithoutOnChange);
		else await renderSSR(WithoutOnChange);
		await expectOmittedCallbacksStillChoose();
	});

	test(`${mode}: a gesture in one select leaves the other select alone`, async () => {
		if (mode === 'CSR') await render(TwoSelects);
		else await renderSSR(TwoSelects);
		await expectSelectsStayIsolated();
	});

	test(`${mode}: the listbox carries thirteen options, aria-at's reference count`, async () => {
		if (mode === 'CSR') await render(LongList);
		else await renderSSR(LongList);
		expect(page.getByRole('option', { includeHidden: true }).elements().length).toBe(13);
	});

	test(`${mode}: a select handed over open renders its popup showing`, async () => {
		if (mode === 'CSR') await render(OpenList);
		else await renderSSR(OpenList);
		expect(el(Trigger).getAttribute('aria-expanded')).toBe('true');
		expect(el<HTMLElement>(Content).hidden).toBe(false);
	});

	test(`${mode}: an option offered by a once-decided arm is a real option`, async () => {
		if (mode === 'CSR') await render(OptionalOption);
		else await renderSSR(OptionalOption);
		expect(page.getByRole('option', { includeHidden: true }).elements().length).toBe(2);
		expect(el(page.getByTestId('lifetime')).getAttribute('aria-selected')).toBe('false');
	});
}

// --- keyboard, closed -----------------------------------------------------
//
// The APG's select-only combobox table. A key that opens the popup also decides
// where the roving focus lands, and the choice is QDS's: the chosen option if
// there is one, otherwise the first for a downward key and the last for an
// upward one.

test('CSR: ArrowDown opens the popup and lands on the first option', async () => {
	await render(Basic);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Apple));
	// Landing on an option is not choosing it.
	expect(el(Apple).getAttribute('aria-selected')).toBe('false');
});

test('CSR: ArrowUp opens the popup and lands on the last option', async () => {
	await render(Basic);
	await openWith('{ArrowUp}');
	await expect.poll(async () => await focused()).toBe(el(Cherry));
});

// Enter and Space reach the popup through the button's own activation rather
// than through a key rule, because preventDefault() from a deferred handler
// cannot suppress the native click. What matters to a person is unchanged: the
// key opens the popup and the roving focus lands on an option.
test('CSR: Enter and Space open the popup and land on the first option', async () => {
	await render(Basic);
	await openWith('{Enter}');
	await expect.poll(async () => await focused()).toBe(el(Apple));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('false');
	await openWith(' ');
	await expect.poll(async () => await focused()).toBe(el(Apple));
});

test('CSR: Home and End open the popup on the first and the last option', async () => {
	await render(Basic);
	await openWith('{Home}');
	await expect.poll(async () => await focused()).toBe(el(Apple));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('false');
	await openWith('{End}');
	await expect.poll(async () => await focused()).toBe(el(Cherry));
});

test('CSR: opening a select that already has a choice lands on the chosen option', async () => {
	await render(Prefilled);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Banana));
});

test('CSR: Alt+ArrowDown opens the popup and leaves focus on the combobox', async () => {
	await render(Basic);
	el(Trigger).focus();
	await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(Trigger));
});

test('CSR: the arrow walk skips an option nobody may choose', async () => {
	await render(UnavailableOptions);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Apple));

	// apple -> (banana is unavailable) -> cherry
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Cherry));
});

// --- keyboard, open -------------------------------------------------------
//
// The rule that separates this family from a radio group: moving the highlight
// is not choosing. A reader that says "selected" after an arrow means the arrow
// handler committed, which is the select family's most common bug.

test('CSR: ArrowDown inside the open listbox moves the highlight and changes nothing', async () => {
	await render(Basic);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Apple));

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Banana));
	expect(el(Apple).getAttribute('aria-selected')).toBe('false');
	expect(el(Banana).getAttribute('aria-selected')).toBe('false');

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(async () => await focused()).toBe(el(Apple));
	expect(el(Banana).getAttribute('aria-selected')).toBe('false');
});

test('CSR: Home and End inside the open listbox reach the ends and stop there', async () => {
	await render(Basic);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Apple));

	await userEvent.keyboard('{End}');
	await expect.poll(async () => await focused()).toBe(el(Cherry));
	// The ends do not wrap: a select's list has a top and a bottom.
	await userEvent.keyboard('{ArrowDown}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(Cherry));

	await userEvent.keyboard('{Home}');
	await expect.poll(async () => await focused()).toBe(el(Apple));
	await userEvent.keyboard('{ArrowUp}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(Apple));
});

test('CSR: Enter commits the highlighted option, closes, and hands focus back', async () => {
	await render(Basic);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Apple));

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Banana));
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Banana).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
	await expect.poll(async () => await focused()).toBe(el(Trigger));
});

test('CSR: Escape closes the popup and leaves the value untouched', async () => {
	await render(Prefilled);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Banana));

	// Move the highlight first: the bug this row catches is an Escape that
	// commits whatever the highlight had reached.
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Cherry));
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
	await expect.poll(async () => await focused()).toBe(el(Trigger));
	expect(el(Banana).getAttribute('aria-selected')).toBe('true');
	expect(el(Cherry).getAttribute('aria-selected')).toBe('false');
});

test('CSR: Tab out of the open listbox commits and closes', async () => {
	await render(Basic);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(Apple));

	await userEvent.keyboard('{Tab}');
	await expect.poll(() => el(Apple).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el<HTMLElement>(Content).hidden).toBe(true);
});

// --- typeahead ------------------------------------------------------------
//
// Two graph cells and a Date.now() comparison, where QDS holds a class instance
// with a live setTimeout handle. The window is 750ms, QDS's own.

test('CSR: typing a letter on the closed combobox opens on the first match', async () => {
	await render(LongList);
	el(Trigger).focus();
	await userEvent.keyboard('c');
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('cherry')));
});

test('CSR: a second letter inside the window narrows the match', async () => {
	await render(LongList);
	el(Trigger).focus();
	await userEvent.keyboard('b');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('banana')));

	await userEvent.keyboard('l');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('blackberry')));
	await userEvent.keyboard('u');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('blueberry')));
});

test('CSR: a letter typed after the window starts a new search', async () => {
	await render(LongList);
	el(Trigger).focus();
	await userEvent.keyboard('b');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('banana')));

	// Past 750ms the buffer is stale, so `l` is a fresh search and not `bl`.
	await new Promise((resolve) => setTimeout(resolve, 900));
	await userEvent.keyboard('l');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('lemon')));
});

test('CSR: typing inside the open listbox moves the highlight without choosing', async () => {
	await render(LongList);
	await openWith('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('apple')));

	await userEvent.keyboard('m');
	await expect.poll(async () => await focused()).toBe(el(page.getByTestId('mango')));
	expect(el(page.getByTestId('mango')).getAttribute('aria-selected')).toBe('false');
});

// The indicator sits inside the option and is aria-hidden, so its words are not
// the option's words. Matching on raw textContent would make "Chosen" typeable.
test('CSR: typeahead matches the option text, not its aria-hidden decoration', async () => {
	await render(Basic);
	el(Trigger).focus();
	await userEvent.keyboard('c');
	await expect.poll(async () => await focused()).toBe(el(Cherry));
});

// --- the hidden control ---------------------------------------------------

test('CSR: the hidden native control is never reached by Tab', async () => {
	await render(SignupForm);
	el(Trigger).focus();
	await userEvent.keyboard('{Escape}');
	await userEvent.keyboard('{Tab}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).not.toBe(el(Field));
});

// --- repeats --------------------------------------------------------------
//
// Options authored with a keyed `@for` — the shape every real select has, since
// nobody hand-writes thirteen options. `select.item` roots its own widget
// instance, which is the combination no shipped family has proven.

// Pinned: defect 75 (board) - a keyed-loop option's click runs but aria-selected
// never turns true; red on the tip BEFORE the walk conversion and before the
// collection capability (bisected by U258). Un-pin when the instance fix lands.
test.fails('CSR: options from a keyed loop each get their own instance', async () => {
	await render(OptionsFromData);
	const rows = page.getByTestId('row').elements();
	expect(rows.length).toBe(3);

	(rows[1] as HTMLElement).click();
	await expect.poll(() => page.getByTestId('row').elements()[1]?.getAttribute('aria-selected')).toBe(
		'true',
	);
	// The choice landed in one row only.
	expect(page.getByTestId('row').elements()[0]?.getAttribute('aria-selected')).toBe('false');
	expect(page.getByTestId('row').elements()[2]?.getAttribute('aria-selected')).toBe('false');
});

test('CSR: an arrow key walks a looped listbox', async () => {
	await render(OptionsFromData);
	await openWith('{ArrowDown}');
	const rows = page.getByTestId('row').elements();
	await expect.poll(async () => await focused()).toBe(rows[0]);

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(async () => await focused()).toBe(rows[1]);
});
