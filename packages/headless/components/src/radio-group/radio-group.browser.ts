import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { Basic } from './scenarios/basic.tsrx';
import { OptionsFromData } from './scenarios/options-from-data.tsrx';
import { PlanPickerForm } from './scenarios/plan-picker-form.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { SegmentedControl } from './scenarios/segmented-control.tsrx';
import { TwoGroups } from './scenarios/two-groups.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';
import { WithHelp } from './scenarios/with-help.tsrx';
import { WithOnChange } from './scenarios/with-onchange.tsrx';

// Colocated browser suite for the radio-group family. Each test renders a
// realistic consumer scenario, and the locators name the QDS part anatomy: root,
// label, description, error, item, itemtrigger, itemindicator, itemlabel,
// itemfield - prefixed per option, the way a consumer names their own choices.
const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Monthly = page.getByTestId('monthly');
const MonthlyField = page.getByTestId('monthly-field');
const MonthlyTrigger = page.getByTestId('monthly-trigger');
const MonthlyIndicator = page.getByTestId('monthly-indicator');
const MonthlyLabel = page.getByTestId('monthly-label');
const Annual = page.getByTestId('annual');
const AnnualField = page.getByTestId('annual-field');
const AnnualTrigger = page.getByTestId('annual-trigger');
const AnnualIndicator = page.getByTestId('annual-indicator');
const AnnualLabel = page.getByTestId('annual-label');
const LifetimeField = page.getByTestId('lifetime-field');
const LifetimeTrigger = page.getByTestId('lifetime-trigger');
const LifetimeIndicator = page.getByTestId('lifetime-indicator');
// The segmented control, which is this family laid out sideways.
const DayField = page.getByTestId('day-field');
const WeekField = page.getByTestId('week-field');
const MonthField = page.getByTestId('month-field');
// Options and groups nobody may choose.
const LockedRoot = page.getByTestId('locked-root');
const LockedBasicField = page.getByTestId('locked-basic-field');
const LockedPremiumTrigger = page.getByTestId('locked-premium-trigger');
const LockedPremiumIndicator = page.getByTestId('locked-premium-indicator');
// Help text, and the error written after the options and before them.
const AfterDescription = page.getByTestId('after-description');
const AfterError = page.getByTestId('after-error');
const AfterRoot = page.getByTestId('after-root');
const BeforeError = page.getByTestId('before-error');
const BeforeRoot = page.getByTestId('before-root');
// Two groups on one page.
const LeftMonthlyTrigger = page.getByTestId('left-monthly-trigger');
const LeftAnnualField = page.getByTestId('left-annual-field');
const LeftAnnualIndicator = page.getByTestId('left-annual-indicator');
const RightBasicField = page.getByTestId('right-basic-field');
const RightBasicIndicator = page.getByTestId('right-basic-indicator');
const RightPremiumIndicator = page.getByTestId('right-premium-indicator');
// The consumer handler's log, and what a form actually submitted.
const Value = page.getByTestId('value');
const Calls = page.getByTestId('calls');
const Submitted = page.getByTestId('submitted');

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

function field(locator: { element(): Element | null }) {
	return el<HTMLInputElement>(locator);
}

// A real submit would navigate the test iframe, so the event is dispatched. What
// is proven is what the browser itself put in the FormData for this form.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

function expectBasicRendered() {
	expect(el(Root).tagName).toBe('FIELDSET');
	expect(el(Root).getAttribute('role')).toBe('radiogroup');
	// The legend names the group natively: no id, no IDREF, nothing dangling.
	expect(el(Label).tagName).toBe('LEGEND');
	expect(el(Label).textContent).toBe('Billing Period');
	expect(el(Root).getAttribute('aria-orientation')).toBe('vertical');
	expect(el(Root).hasAttribute('ui-horizontal')).toBe(false);

	// Nothing chosen: three radios, none checked, no indicator content.
	expect(page.getByRole('radio').elements().length).toBe(3);
	for (const option of [MonthlyField, AnnualField, LifetimeField]) {
		expect(field(option).type).toBe('radio');
		expect(field(option).hasAttribute('checked')).toBe(false);
	}
	expect(el(MonthlyIndicator).textContent).toBe('');
	expect(el(Monthly).hasAttribute('ui-selected')).toBe(false);

	// Every item mints its own field id, so a label names exactly one option.
	expect(el(MonthlyLabel).getAttribute('for')).toBe(field(MonthlyField).getAttribute('id'));
	expect(el(AnnualLabel).getAttribute('for')).toBe(field(AnnualField).getAttribute('id'));
	expect(el(MonthlyLabel).getAttribute('for')).not.toBe(el(AnnualLabel).getAttribute('for'));
}

// One element per part: every part this family ships renders exactly one piece
// of markup, so a consumer's stylesheet and a screen reader see the tree they
// wrote. The field is the exception a hidden native control forces - it renders
// inside the clipping span the base family owns.
function expectOneElementPerPart() {
	expect(el(Monthly).children.length).toBe(3);
	expect(el(Monthly).children[1]).toBe(el(MonthlyTrigger));
	expect(el(MonthlyTrigger).children.length).toBe(1);
	expect(el(MonthlyTrigger).children[0]).toBe(el(MonthlyIndicator));
	expect(el(Monthly).children[2]).toBe(el(MonthlyLabel));
	// Present for a form and for a screen reader, absent from sight.
	expect(getComputedStyle(field(MonthlyField).parentElement as Element).position).toBe('absolute');
}

function expectPrefilledRendered() {
	expect(field(AnnualField).hasAttribute('checked')).toBe(true);
	expect(el(Annual).getAttribute('ui-selected')).toBe('');
	expect(el(AnnualIndicator).textContent).toBe('Chosen');

	expect(field(MonthlyField).hasAttribute('checked')).toBe(false);
	expect(el(MonthlyIndicator).textContent).toBe('');
	expect(el(LifetimeIndicator).textContent).toBe('');
}

// Reachability: with nothing chosen the first enabled option is a tab stop, so
// the group can be entered at all. There is no construction-order index in this
// family, so every enabled option holds a stop until the first focus says which
// one owns it.
function expectReachableBeforeAnyGesture() {
	expect(field(MonthlyField).tabIndex).toBe(0);
	field(MonthlyField).focus();
	expect(document.activeElement).toBe(field(MonthlyField));
}

// Once a choice exists, the chosen option is the one Tab lands on.
function expectChosenOptionOwnsTheTabStop() {
	expect(field(AnnualField).tabIndex).toBe(0);
	expect(field(MonthlyField).tabIndex).toBe(-1);
	expect(field(LifetimeField).tabIndex).toBe(-1);
}

async function expectTriggerChooses() {
	el(MonthlyTrigger).click();
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');
	await expect.poll(() => el(Monthly).getAttribute('ui-selected')).toBe('');
	expect(el(AnnualIndicator).textContent).toBe('');
}

// A radio group has no path back to nothing chosen: a second gesture on the
// option already chosen leaves it exactly where it was.
async function expectChoosingIsOneWay() {
	el(MonthlyTrigger).click();
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');
	el(MonthlyTrigger).click();
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');
}

async function expectPickingOneUnpicksTheOther() {
	el(MonthlyTrigger).click();
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');
	el(AnnualTrigger).click();
	await expect.poll(() => el(AnnualIndicator).textContent).toBe('Chosen');
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('');
}

function expectDisabledRendered() {
	expect(field(LifetimeField).disabled).toBe(true);
	expect(field(MonthlyField).disabled).toBe(false);

	// A whole locked group: the root carries the flag, and a fieldset's own
	// disabled is what actually locks every control inside it.
	expect(el(LockedRoot).getAttribute('ui-disabled')).toBe('');
	expect(el<HTMLFieldSetElement>(LockedRoot).disabled).toBe(true);
	expect(field(LockedBasicField).disabled).toBe(true);
}

async function expectDisabledBlocks() {
	el(LifetimeTrigger).click();
	el(LockedPremiumTrigger).click();
	// Give a dispatch the room a real choice gets, then read: nothing moved.
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(LifetimeIndicator).textContent).toBe('');
	expect(el(LockedPremiumIndicator).textContent).toBe('');
}

function expectHelpRendered() {
	expect(el(AfterDescription).textContent).toBe('Switch plans whenever you like.');
	expect(el(AfterError).textContent).toBe('Pick a billing period');
	// Every part of one instance seeds before any part renders, so an error part
	// written after the options still marks the group invalid.
	expect(el(AfterRoot).getAttribute('aria-invalid')).toBe('true');
	// The same error written BEFORE the options: document order does not decide.
	expect(el(BeforeError).textContent).toBe('Pick a support plan');
	expect(el(BeforeRoot).getAttribute('aria-invalid')).toBe('true');
}

function expectFormConfigRendered() {
	// One name for the whole group, one value per option: what a radio submits.
	// The name is declared once, by `radiogroup.field`, and every option takes it.
	expect(field(MonthlyField).getAttribute('name')).toBe('plan');
	expect(field(AnnualField).getAttribute('name')).toBe('plan');
	expect(field(MonthlyField).getAttribute('value')).toBe('monthly');
	expect(field(AnnualField).getAttribute('value')).toBe('annual');
	// aria-required goes on the group, per the cross-library convention.
	expect(el(Root).getAttribute('aria-required')).toBe('true');
	expect(field(MonthlyField).required).toBe(true);
	expect(field(AnnualField).required).toBe(true);
}

// The group field declares what a form receives and shows nothing: it holds no
// content, takes no room, and adds no control of its own to the group.
function expectGroupFieldIsHidden() {
	const declared = el(Label).nextElementSibling as HTMLElement;
	expect(declared.textContent).toBe('');
	expect(getComputedStyle(declared).position).toBe('absolute');
	expect(declared.getBoundingClientRect().height).toBeLessThanOrEqual(1);
	// Every control in the group is still an option's own hidden radio.
	expect(page.getByRole('radio').elements().length).toBe(2);
}

// A group with no field part: nothing is named, so a form receives nothing from
// it. This is what makes the field worth mounting rather than a formality.
function expectNamelessGroupSubmitsNothing() {
	expect(field(MonthlyField).getAttribute('name')).toBe('');
	expect(field(MonthlyField).required).toBe(false);
	expect(el(Root).getAttribute('aria-required')).toBe('false');
}

async function expectChosenOptionSubmits() {
	await expect.poll(() => submit().textContent).toBe('{}');

	el(AnnualTrigger).click();
	await expect.poll(() => submit().textContent).toBe('{"plan":"annual"}');

	el(MonthlyTrigger).click();
	await expect.poll(() => submit().textContent).toBe('{"plan":"monthly"}');
}

async function expectConsumerCallbackCarriesTheValue() {
	expect(el(Calls).textContent).toBe('0');
	expect(el(Value).textContent).toBe('');

	el(MonthlyTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('monthly');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	el(AnnualTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('annual');
	await expect.poll(() => el(Calls).textContent).toBe('2');

	// Choosing what is already chosen is not a change, so nothing is announced.
	el(AnnualTrigger).click();
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(Calls).textContent).toBe('2');
}

async function expectOmittedCallbackStillChooses() {
	el(MonthlyTrigger).click();
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');
}

async function expectGroupsStayIsolated() {
	el(RightBasicIndicator); // both groups are on the page before anything moves
	el(LeftMonthlyTrigger).click();
	await expect.poll(() => el(page.getByTestId('left-monthly-indicator')).textContent).toBe(
		'Chosen',
	);
	// The other group never heard about it.
	expect(el(RightBasicIndicator).textContent).toBe('');
	expect(el(RightPremiumIndicator).textContent).toBe('');
	expect(field(RightBasicField).hasAttribute('checked')).toBe(false);
	expect(el(LeftAnnualIndicator).textContent).toBe('');
	expect(field(LeftAnnualField).hasAttribute('checked')).toBe(false);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named group and three unchosen options`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: every part renders exactly one element`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneElementPerPart();
	});

	test(`${mode}: a prefilled value checks exactly that option`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectPrefilledRendered();
	});

	test(`${mode}: with nothing chosen the group is still reachable by Tab`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectReachableBeforeAnyGesture();
	});

	test(`${mode}: the chosen option owns the group's single tab stop`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectChosenOptionOwnsTheTabStop();
	});

	test(`${mode}: clicking an option's trigger chooses it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectTriggerChooses();
	});

	test(`${mode}: choosing the option already chosen changes nothing`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectChoosingIsOneWay();
	});

	test(`${mode}: choosing one option unchooses the other`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectPickingOneUnpicksTheOther();
	});

	test(`${mode}: an unavailable option and a locked group render their flags`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		expectDisabledRendered();
	});

	test(`${mode}: an unavailable option and a locked group cannot be chosen`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		await expectDisabledBlocks();
	});

	// Unpinned: the seed map a part writes now reaches the widget ROOT as well as
	// the parts projected into it, so `group.invalid = true` from the error part
	// is what the root renders `aria-invalid` from, in both modes.
	test(
		`${mode}: a mounted error marks the group invalid, written after the options or before them`,
		async () => {
			if (mode === 'CSR') await render(WithHelp);
			else await renderSSR(WithHelp);
			expectHelpRendered();
		},
	);

	test(`${mode}: the form carries one name for the group and a value per option`, async () => {
		if (mode === 'CSR') await render(PlanPickerForm);
		else await renderSSR(PlanPickerForm);
		expectFormConfigRendered();
	});

	test(`${mode}: the group field declares the form name and shows nothing`, async () => {
		if (mode === 'CSR') await render(PlanPickerForm);
		else await renderSSR(PlanPickerForm);
		expectGroupFieldIsHidden();
	});

	test(`${mode}: a group with no field part names nothing and requires nothing`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectNamelessGroupSubmitsNothing();
	});

	test(`${mode}: only the chosen option appears in what the form submits`, async () => {
		if (mode === 'CSR') await render(PlanPickerForm);
		else await renderSSR(PlanPickerForm);
		await expectChosenOptionSubmits();
	});

	test(`${mode}: the consumer onChange is called once with the new value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbackCarriesTheValue();
	});

	test(`${mode}: an omitted onChange still chooses`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectOmittedCallbackStillChooses();
	});

	test(`${mode}: a choice in one group leaves the other group alone`, async () => {
		if (mode === 'CSR') await render(TwoGroups);
		else await renderSSR(TwoGroups);
		await expectGroupsStayIsolated();
	});
}

// --- keyboard -------------------------------------------------------------
//
// The APG's non-obvious rule for this pattern: an arrow key moves focus AND
// chooses. Unlike tabs, selection is not optional, and a reader that says
// "unchecked" after an arrow is the most common way this pattern is got wrong.

test('CSR: ArrowDown moves focus to the next option and chooses it', async () => {
	await render(Basic);
	field(MonthlyField).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(field(AnnualField));
	await expect.poll(() => el(AnnualIndicator).textContent).toBe('Chosen');
	expect(el(MonthlyIndicator).textContent).toBe('');
});

test('CSR: ArrowUp moves to the previous option and chooses it', async () => {
	await render(Basic);
	field(AnnualField).focus();

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(field(MonthlyField));
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');
});

test('CSR: the ends wrap, both ways', async () => {
	await render(Basic);
	field(LifetimeField).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(field(MonthlyField));
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(field(LifetimeField));
	await expect.poll(() => el(LifetimeIndicator).textContent).toBe('Chosen');
});

test('CSR: Home and End choose the first and the last option', async () => {
	await render(Basic);
	field(AnnualField).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(field(LifetimeField));
	await expect.poll(() => el(LifetimeIndicator).textContent).toBe('Chosen');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(field(MonthlyField));
	await expect.poll(() => el(MonthlyIndicator).textContent).toBe('Chosen');
});

test('CSR: Space chooses the focused option, and does nothing to the one already chosen', async () => {
	await render(Basic);
	field(AnnualField).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(AnnualIndicator).textContent).toBe('Chosen');

	await userEvent.keyboard(' ');
	await expect.poll(() => el(AnnualIndicator).textContent).toBe('Chosen');
	expect(el(MonthlyIndicator).textContent).toBe('');
});

test('CSR: the arrow keys walk past an option nobody may choose', async () => {
	await render(UnavailableOptions);
	field(MonthlyField).focus();

	// monthly -> (lifetime is unavailable) -> annual
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(field(AnnualField));
	await expect.poll(() => el(AnnualIndicator).textContent).toBe('Chosen');
	expect(el(LifetimeIndicator).textContent).toBe('');
});

test('CSR: a horizontal group walks the horizontal axis and leaves the other alone', async () => {
	await render(SegmentedControl);
	expect(el(Root).getAttribute('aria-orientation')).toBe('horizontal');
	expect(el(Root).getAttribute('ui-horizontal')).toBe('');
	field(WeekField).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(field(MonthField));

	// The vertical arrows are not this group's axis: nothing moves.
	await userEvent.keyboard('{ArrowDown}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(field(MonthField));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(field(WeekField));
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(field(DayField));
});

// --- repeats ---------------------------------------------------------------
//
// Options authored with a keyed `@for` — the shape every real radio group has,
// since a group written over a literal list of options is a toy.

// A looped option's own instance read resolved to the template
// definition no row rendered into, so the write carried `undefined`. Fixed in
// the row-rooted widget lookup; witness is keyed-instance-refresh.
test.ts.
test('CSR: options from a keyed loop each get their own instance', async () => {
	await render(OptionsFromData);
	const triggers = page.getByTestId('row-trigger').elements();
	const fields = page.getByTestId('row-field').elements() as HTMLInputElement[];
	expect(triggers.length).toBe(3);
	// Three rows, three minted ids: the rows did not share one instance.
	expect(new Set(fields.map((row) => row.id)).size).toBe(3);
	expect(fields.map((row) => row.value)).toEqual(['monthly', 'annual', 'lifetime']);

	(triggers[1] as HTMLElement).click();
	await expect.poll(() => page.getByTestId('row-indicator').elements()[1]?.textContent).toBe(
		'Chosen',
	);
	// The choice landed in one row only.
	expect(page.getByTestId('row-indicator').elements()[0]?.textContent).toBe('');
	expect(page.getByTestId('row-indicator').elements()[2]?.textContent).toBe('');
});

// The seed a part writes before the rows are built reaches keyed rows (the
// framework's keyed-row-shared-writes witness owns that proof); this row keeps
// the family-level fact: looped options submit under the declared name.
test('CSR: every option from a loop submits under the name the field declares', async () => {
	await render(OptionsFromData);
	await expect
		.poll(() =>
			(page.getByTestId('row-field').elements() as HTMLInputElement[]).map((row) =>
				row.getAttribute('name'),
			),
		)
		.toEqual(['plan', 'plan', 'plan']);
});

test('CSR: an arrow key walks a looped group', async () => {
	await render(OptionsFromData);
	const fields = page.getByTestId('row-field').elements() as HTMLInputElement[];
	fields[0]?.focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(fields[1]);
	await expect.poll(() => page.getByTestId('row-indicator').elements()[1]?.textContent).toBe(
		'Chosen',
	);
});
