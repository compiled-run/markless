import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import ConsumerAttributes from './scenarios/consumer-attributes.tsrx';
import DisabledItems from './scenarios/disabled-items.tsrx';
import Form from './scenarios/form.tsrx';
import ItemsFromData from './scenarios/items-from-data.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import Required from './scenarios/required.tsrx';
import Vertical from './scenarios/vertical.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Left = page.getByTestId('left');
const Center = page.getByTestId('center');
const Right = page.getByTestId('right');
const Bold = page.getByTestId('bold');
const Italic = page.getByTestId('italic');
const Underline = page.getByTestId('underline');
const Grid = page.getByTestId('grid');
const List = page.getByTestId('list');
const Email = page.getByTestId('email');
const Sms = page.getByTestId('sms');
const High = page.getByTestId('high');
const Normal = page.getByTestId('normal');
const Low = page.getByTestId('low');
const Justify = page.getByTestId('justify');
const LockedRoot = page.getByTestId('locked-root');
const LockedBold = page.getByTestId('locked-bold');
const BoldField = page.getByTestId('bold-field');
const ItalicField = page.getByTestId('italic-field');
const LeftField = page.getByTestId('left-field');
const Submit = page.getByTestId('submit');
const Submitted = page.getByTestId('submitted');
const SingleValue = page.getByTestId('single-value');
const ManyValue = page.getByTestId('many-value');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

const rows = () => page.getByTestId('row').elements() as HTMLButtonElement[];

async function settled() {
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function expectNoAxeViolations(where: HTMLElement, phase: string) {
	const results = await axe.run(where, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	expect(
		results.violations.map((one) => `${one.id}: ${one.help}`),
		`axe violations while ${phase}`,
	).toEqual([]);
}

function expectBasicRendered() {
	expect(el(Root).getAttribute('role')).toBe('group');
	// Not on `group`: ARIA does not support it there, so the axis is a ui-* flag only.
	expect(el(Root).hasAttribute('aria-orientation')).toBe(false);
	expect(el(Root).hasAttribute('ui-vertical')).toBe(false);
	expect(el(Root).hasAttribute('ui-multiple')).toBe(false);
	expect(el(Left).tagName).toBe('BUTTON');
	expect(el(Left).getAttribute('type')).toBe('button');
	expect(el(Left).getAttribute('value')).toBe('left');
	expect(el(Left).getAttribute('aria-pressed')).toBe('true');
	expect(el(Center).getAttribute('aria-pressed')).toBe('false');
	expect(el(Right).getAttribute('aria-pressed')).toBe('false');
	expect(el(Left).getAttribute('ui-pressed')).toBe('');
	expect(el(Center).hasAttribute('ui-pressed')).toBe(false);
	// No aria-selected, and no aria-checked: neither is supported on a button.
	expect(el(Left).hasAttribute('aria-selected')).toBe(false);
	expect(el(Left).hasAttribute('aria-checked')).toBe(false);
}

function expectGroupIsNamedByItsLabel() {
	const labelledby = el(Root).getAttribute('aria-labelledby');
	expect(labelledby, 'the group points at a name').toBeTruthy();
	expect(document.getElementById(labelledby ?? '')).toBe(el(Label));
	expect(el(Label).textContent).toBe('Text alignment');
}

function expectRovingTabindexBeforeAnyGesture() {
	// One tab stop for the whole group, on the pressed item.
	expect(el(Left).getAttribute('tabindex')).toBe('0');
	expect(el(Center).getAttribute('tabindex')).toBe('-1');
	expect(el(Right).getAttribute('tabindex')).toBe('-1');
}

function expectMultipleRendered() {
	expect(el(Root).getAttribute('ui-multiple')).toBe('');
	expect(el(Bold).getAttribute('aria-pressed')).toBe('true');
	expect(el(Italic).getAttribute('aria-pressed')).toBe('false');
	expect(el(Underline).getAttribute('aria-pressed')).toBe('true');
	// The first pressed value holds the stop; two pressed items are not two stops.
	expect(el(Bold).getAttribute('tabindex')).toBe('0');
	expect(el(Underline).getAttribute('tabindex')).toBe('-1');
}

function expectVerticalRendered() {
	expect(el(Root).getAttribute('ui-vertical')).toBe('');
	expect(el(High).getAttribute('ui-vertical')).toBe('');
	expect(el(Root).hasAttribute('aria-orientation')).toBe(false);
}

function expectDisabledItemsRendered() {
	// A locked item is a disabled button; nothing else marks it.
	expect(el(Justify).getAttribute('disabled')).toBe('');
	expect(el(Justify).getAttribute('ui-disabled')).toBe('');
	expect(el(Left).hasAttribute('disabled')).toBe(false);
	// The group's own `disabled` reaches its aria and every item inside it.
	expect(el(LockedRoot).getAttribute('aria-disabled')).toBe('true');
	expect(el(LockedRoot).getAttribute('ui-disabled')).toBe('');
	expect(el(LockedBold).getAttribute('disabled')).toBe('');
	expect(el(LockedBold).getAttribute('aria-pressed')).toBe('true');
	// Nothing in a locked group holds the tab stop.
	expect(el(LockedBold).getAttribute('tabindex')).toBe('-1');
}

function expectFieldsCarryTheGroupsName() {
	expect(el<HTMLInputElement>(BoldField).type).toBe('hidden');
	expect(el<HTMLInputElement>(BoldField).name).toBe('style');
	expect(el<HTMLInputElement>(BoldField).value).toBe('bold');
	expect(el<HTMLInputElement>(BoldField).disabled).toBe(false);
	// An unpressed item submits nothing: a disabled control is left out of the form data.
	expect(el<HTMLInputElement>(ItalicField).disabled).toBe(true);
	expect(el<HTMLInputElement>(LeftField).name).toBe('align');
	// The field is not interactive content and not in the accessibility tree, which
	// is what keeps it legal inside the button.
	expect(el(Bold).contains(el(BoldField))).toBe(true);
	expect(el(Bold).textContent).toContain('Bold');
}

function expectLoopedItemsCarryTheGroupsName() {
	expect(rows().length).toBe(3);
	expect(rows().map((one) => one.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
	const fields = page.getByTestId('row-field').elements() as HTMLInputElement[];
	// The hole radio-group measured: a row built by a loop takes the root's name too.
	expect(fields.map((one) => one.name)).toEqual(['style', 'style', 'style']);
	expect(fields.map((one) => one.value)).toEqual(['bold', 'italic', 'underline']);
	expect(fields.map((one) => one.disabled)).toEqual([true, false, true]);
}

function expectFamilyOwnsItsOwnAttributes() {
	// `{...rest}` is spread first, so the family's own role and state win.
	expect(el(Root).getAttribute('role')).toBe('group');
	expect(el(Left).getAttribute('aria-pressed')).toBe('true');
	expect(el(Left).getAttribute('type')).toBe('button');
	expect(el(Right).getAttribute('tabindex')).toBe('-1');
}

async function expectPressTogglesTheItem() {
	el(Center).click();
	await expect.poll(() => el(Center).getAttribute('aria-pressed')).toBe('true');
	// Single-select: pressing one unpresses the rest.
	expect(el(Left).getAttribute('aria-pressed')).toBe('false');
	expect(el(Center).getAttribute('ui-pressed')).toBe('');
	await expect.poll(() => el(Center).getAttribute('tabindex')).toBe('0');
	expect(el(Left).getAttribute('tabindex')).toBe('-1');
}

async function expectPressingThePressedItemClearsIt() {
	el(Left).click();
	await expect.poll(() => el(Left).getAttribute('aria-pressed')).toBe('false');
	expect(el(Center).getAttribute('aria-pressed')).toBe('false');
	expect(el(Right).getAttribute('aria-pressed')).toBe('false');
}

async function expectMultipleKeepsWhatIsAlreadyPressed() {
	el(Italic).click();
	await expect.poll(() => el(Italic).getAttribute('aria-pressed')).toBe('true');
	expect(el(Bold).getAttribute('aria-pressed')).toBe('true');
	expect(el(Underline).getAttribute('aria-pressed')).toBe('true');

	el(Bold).click();
	await expect.poll(() => el(Bold).getAttribute('aria-pressed')).toBe('false');
	expect(el(Italic).getAttribute('aria-pressed')).toBe('true');
	expect(el(Underline).getAttribute('aria-pressed')).toBe('true');
}

async function expectRequiredKeepsItsLastPressedValue() {
	el(Grid).click();
	await settled();
	expect(el(Grid).getAttribute('aria-pressed')).toBe('true');
	expect(el(List).getAttribute('aria-pressed')).toBe('false');

	// The multi-select group gives up everything but the last one.
	el(Sms).click();
	await expect.poll(() => el(Sms).getAttribute('aria-pressed')).toBe('true');
	el(Email).click();
	await expect.poll(() => el(Email).getAttribute('aria-pressed')).toBe('false');
	el(Sms).click();
	await settled();
	expect(el(Sms).getAttribute('aria-pressed')).toBe('true');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders three toggle buttons with one pressed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: the group is named by its label`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectGroupIsNamedByItsLabel();
	});

	test(`${mode}: the group holds one tab stop, on the pressed item`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRovingTabindexBeforeAnyGesture();
	});

	test(`${mode}: a multi-select group renders every pressed item`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);
		expectMultipleRendered();
	});

	test(`${mode}: a stacked group says so on the group and each item`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);
		expectVerticalRendered();
	});

	test(`${mode}: a locked item and a locked group both report it`, async () => {
		if (mode === 'CSR') await render(DisabledItems);
		else await renderSSR(DisabledItems);
		expectDisabledItemsRendered();
	});

	test(`${mode}: an item's field carries the group's name and its own value`, async () => {
		if (mode === 'CSR') await render(Form);
		else await renderSSR(Form);
		expectFieldsCarryTheGroupsName();
	});

	test(`${mode}: items built by a keyed loop carry the group's name`, async () => {
		if (mode === 'CSR') await render(ItemsFromData);
		else await renderSSR(ItemsFromData);
		expectLoopedItemsCarryTheGroupsName();
	});

	test(`${mode}: the family's role and state survive a consumer writing them`, async () => {
		if (mode === 'CSR') await render(ConsumerAttributes);
		else await renderSSR(ConsumerAttributes);
		expectFamilyOwnsItsOwnAttributes();
	});

	// The first gesture on a served page is a pointer press, and it is the one
	// gesture the resumer has to serve cold.
	test(`${mode}: pressing an item presses it and unpresses the rest`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectPressTogglesTheItem();
	});

	test(`${mode}: pressing the pressed item leaves the group with nothing pressed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectPressingThePressedItemClearsIt();
	});

	test(`${mode}: a multi-select group presses and unpresses one item at a time`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);
		await expectMultipleKeepsWhatIsAlreadyPressed();
	});

	test(`${mode}: a required group refuses to give up its last pressed value`, async () => {
		if (mode === 'CSR') await render(Required);
		else await renderSSR(Required);
		await expectRequiredKeepsItsLastPressedValue();
	});

	test(`${mode}: a locked item refuses a press`, async () => {
		if (mode === 'CSR') await render(DisabledItems);
		else await renderSSR(DisabledItems);
		el(Justify).click();
		await settled();
		expect(el(Justify).getAttribute('aria-pressed')).toBe('false');
		el(LockedBold).click();
		await settled();
		expect(el(LockedBold).getAttribute('aria-pressed')).toBe('true');
	});

	test(`${mode}: the form submits one name per pressed item`, async () => {
		if (mode === 'CSR') await render(Form);
		else await renderSSR(Form);
		el(Italic).click();
		await expect.poll(() => el(Italic).getAttribute('aria-pressed')).toBe('true');
		el(Submit).click();
		await expect.poll(() => el(Submitted).textContent).toBe('bold,italic|left');
	});

	test(`${mode}: axe finds no violation on the starter, before and after a press`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		const where = container as unknown as HTMLElement;
		await expectNoAxeViolations(where, 'at rest');
		el(Center).click();
		await settled();
		await expectNoAxeViolations(where, 'after a press');
	});

	test(`${mode}: axe sweeps a multi-select group`, async () => {
		const { container } = mode === 'CSR' ? await render(Multiple) : await renderSSR(Multiple);
		await expectNoAxeViolations(container as unknown as HTMLElement, 'multiple');
	});

	test(`${mode}: axe sweeps a required group`, async () => {
		const { container } = mode === 'CSR' ? await render(Required) : await renderSSR(Required);
		await expectNoAxeViolations(container as unknown as HTMLElement, 'required');
	});

	test(`${mode}: axe sweeps a stacked group`, async () => {
		const { container } = mode === 'CSR' ? await render(Vertical) : await renderSSR(Vertical);
		await expectNoAxeViolations(container as unknown as HTMLElement, 'vertical');
	});

	test(`${mode}: axe sweeps a locked item and a locked group`, async () => {
		const { container } =
			mode === 'CSR' ? await render(DisabledItems) : await renderSSR(DisabledItems);
		await expectNoAxeViolations(container as unknown as HTMLElement, 'disabled items');
	});

	test(`${mode}: axe sweeps a group inside a form`, async () => {
		const { container } = mode === 'CSR' ? await render(Form) : await renderSSR(Form);
		await expectNoAxeViolations(container as unknown as HTMLElement, 'form');
	});
}

test('CSR: an arrow moves focus along the group and never presses', async () => {
	await render(Basic);
	el(Left).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Center));
	// The divergence from radiogroup, stated as a row: focus moved, nothing changed.
	expect(el(Center).getAttribute('aria-pressed')).toBe('false');
	expect(el(Left).getAttribute('aria-pressed')).toBe('true');
	// The stop follows focus, so Tab out and back returns to where a person was.
	await expect.poll(() => el(Center).getAttribute('tabindex')).toBe('0');
	expect(el(Left).getAttribute('tabindex')).toBe('-1');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(Left));
});

test('CSR: the ends of a group that does not loop stay put', async () => {
	await render(Basic);
	el(Left).focus();

	// A move that has to land somewhere new comes first. The first arrow on a page
	// is replayed once the handler module arrives, and a "stays put" reading taken
	// before that cannot tell a handler that kept focus from one that has not run.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Center));

	el(Left).focus();
	await userEvent.keyboard('{ArrowLeft}');
	await settled();
	expect(document.activeElement).toBe(el(Left));

	el(Right).focus();
	await userEvent.keyboard('{ArrowRight}');
	await settled();
	expect(document.activeElement).toBe(el(Right));
});

test('CSR: Home and End reach the first and last item', async () => {
	await render(Basic);
	el(Center).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(Right));

	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(Left));
});

test('CSR: a stacked group walks on the up and down arrows, and loops', async () => {
	await render(Vertical);
	el(High).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(Normal));

	// The other axis belongs to somebody else. Read after the frame settles: the
	// handler is warm by now, so staying put is a decision rather than a wait.
	await userEvent.keyboard('{ArrowRight}');
	await settled();
	expect(document.activeElement).toBe(el(Normal));

	el(Low).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(High));
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(Low));
});

test('CSR: the walk steps over a locked item', async () => {
	await render(DisabledItems);
	el(Center).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Right));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(Center));

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(Right));
});

test('CSR: Enter and Space press the focused item once', async () => {
	await render(Basic);
	el(Center).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Center).getAttribute('aria-pressed')).toBe('true');

	await userEvent.keyboard(' ');
	await expect.poll(() => el(Center).getAttribute('aria-pressed')).toBe('false');
});

test('CSR: the consumer callback is called with the shape the value was written in', async () => {
	await render(WithOnChange);
	el(Center).click();
	await expect.poll(() => el(SingleValue).textContent).toBe('center');
	// The consumer's own click handler runs after the family's.
	await expect.poll(() => el(Order).textContent).toBe('change-click');

	el(Italic).click();
	await expect.poll(() => el(ManyValue).textContent).toBe('bold,italic');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: a cleared single-select group reports the empty value', async () => {
	await render(WithOnChange);
	el(Left).click();
	await expect.poll(() => el(SingleValue).textContent).toBe('');
	await expect.poll(() => el(Calls).textContent).toBe('1');
});

test('SSR: the first press on a served page lands without a warm-up', async () => {
	await renderSSR(Basic);
	// No focus, no hover: the cold pointer press is the gesture the resumer serves
	// from its own press record.
	el(Right).click();
	await expect.poll(() => el(Right).getAttribute('aria-pressed')).toBe('true');
	expect(el(Left).getAttribute('aria-pressed')).toBe('false');
});

test('SSR: an arrow after the first press walks from where the press left focus', async () => {
	await renderSSR(Basic);
	el(Center).click();
	await expect.poll(() => el(Center).getAttribute('aria-pressed')).toBe('true');
	el(Center).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Right));
	expect(el(Right).getAttribute('aria-pressed')).toBe('false');
});
