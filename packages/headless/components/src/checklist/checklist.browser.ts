// No longer pinned at suite level. T072 landed component-tag spread forwarding:
// `{...rest}` on `<CheckboxRoot>` is an edge prop now, so every consumer
// attribute — `data-testid` first among them — crosses `<checklist.root>` into
// the DOM and these locators resolve. The starter row below runs.
//
// The rows still pinned share ONE named defect: COMPOSED-ROOT SEED DOES NOT
// EVALUATE THE COMPOSING COMPONENT'S COMPUTEDS. A part written inside
// `<checklist.root>` renders during the CONSUMER's render, before ChecklistRoot
// runs, so the checkbox instance it reads has to be seeded from the consumer's
// own seed pass. That pass descends to the child the consumer wrote and runs its
// seeds, but the seeds of the root that child COMPOSES take `checked=
// {checklist.allChecked}` and `checked={checklist.value.includes(item.value)}` —
// values of a computed, which the seed pass has no evaluator for. So every part
// reads `checked === undefined` and reports `false`: the select-all never reads
// mixed, membership never shows, and the field never carries its name or value.
// Two further gaps are pinned row-level in projection-into-composed-root.test.ts.
// See note.md.
import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import CondimentsForm from './scenarios/condiments-form.tsrx';
import ItemsFromData from './scenarios/items-from-data.tsrx';
import Partial from './scenarios/partial.tsrx';
import TwoLists from './scenarios/two-lists.tsrx';
import UnavailableOptions from './scenarios/unavailable-options.tsrx';
import WithError from './scenarios/with-error.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

// Colocated browser suite for the checklist family. Each test renders a
// realistic consumer scenario, and the locators name the QDS part anatomy: root,
// label, error, field, selectall, selectallindicator, item, itemtrigger,
// itemlabel, itemdescription, itemindicator.
const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const SelectAllTrigger = page.getByTestId('selectall-trigger');
const SelectAllIndicator = page.getByTestId('selectall-indicator');
const SelectAllField = page.getByTestId('selectall-field');
// One condiment per part role, the way a consumer names their own options.
const Lettuce = page.getByTestId('lettuce');
const LettuceTrigger = page.getByTestId('lettuce-trigger');
const LettuceIndicator = page.getByTestId('lettuce-indicator');
const LettuceLabel = page.getByTestId('lettuce-label');
const LettuceField = page.getByTestId('lettuce-field');
const TomatoTrigger = page.getByTestId('tomato-trigger');
const TomatoIndicator = page.getByTestId('tomato-indicator');
const TomatoField = page.getByTestId('tomato-field');
const MustardTrigger = page.getByTestId('mustard-trigger');
// Options and groups nobody may change.
const CaviarTrigger = page.getByTestId('caviar-trigger');
const CaviarIndicator = page.getByTestId('caviar-indicator');
const LockedRoot = page.getByTestId('locked-root');
const LockedSelectAllTrigger = page.getByTestId('locked-selectall-trigger');
const LockedMustardTrigger = page.getByTestId('locked-mustard-trigger');
const LockedMustardIndicator = page.getByTestId('locked-mustard-indicator');
// The group error, written after the items and before them.
const AfterError = page.getByTestId('after-error');
const AfterSelectAllTrigger = page.getByTestId('after-selectall-trigger');
const BeforeError = page.getByTestId('before-error');
const BeforeSelectAllTrigger = page.getByTestId('before-selectall-trigger');
// Two lists on one page.
const LeftSelectAllTrigger = page.getByTestId('left-selectall-trigger');
const LeftLettuceIndicator = page.getByTestId('left-lettuce-indicator');
const LeftTomatoIndicator = page.getByTestId('left-tomato-indicator');
const RightSelectAllTrigger = page.getByTestId('right-selectall-trigger');
const RightSourdoughIndicator = page.getByTestId('right-sourdough-indicator');
const RightRyeIndicator = page.getByTestId('right-rye-indicator');
// The consumer handler's log.
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

function all(testId: string) {
	return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`));
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
	// The group and the select-all's checkbox root are one element, which is what
	// lets `checklist.label` name the group by naming the select-all trigger.
	expect(el(Root).getAttribute('role')).toBe('group');
	expect(el(Label).tagName).toBe('LABEL');
	expect(el(Label).textContent).toBe('Sandwich Condiments');

	// Nothing ticked: the select-all is off, not mixed.
	expect(el(SelectAllTrigger).getAttribute('role')).toBe('checkbox');
	expect(el(SelectAllTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(Root).hasAttribute('ui-mixed')).toBe(false);
	expect(el(SelectAllIndicator).textContent).toBe('');

	for (const trigger of [LettuceTrigger, TomatoTrigger, MustardTrigger]) {
		expect(el(trigger).getAttribute('role')).toBe('checkbox');
		expect(el(trigger).getAttribute('aria-checked')).toBe('false');
	}
	// Every instance mints its own trigger id, so each label names exactly one.
	expect(el(Label).getAttribute('for')).toBe(el(SelectAllTrigger).getAttribute('id'));
	expect(el(LettuceLabel).getAttribute('for')).toBe(el(LettuceTrigger).getAttribute('id'));
	expect(el(LettuceLabel).getAttribute('for')).not.toBe(el(Label).getAttribute('for'));
}

// One element per part: every part this family ships renders exactly one piece of
// markup, so a consumer's stylesheet and a screen reader see the tree they wrote.
function expectOneElementPerPart() {
	expect(el(Lettuce).getAttribute('ui-checked')).not.toBe(null);
	expect(el(Lettuce).children.length).toBe(2);
	expect(el(Lettuce).children[0]).toBe(el(LettuceTrigger));
	expect(el(LettuceTrigger).children.length).toBe(1);
	expect(el(LettuceTrigger).children[0]).toBe(el(LettuceIndicator));
	expect(el(Lettuce).children[1]).toBe(el(LettuceLabel));
}

function expectPartialRendered() {
	// Some but not all: the select-all reports the third state.
	expect(el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
	expect(el(Root).getAttribute('ui-mixed')).toBe('');
	expect(el(Root).hasAttribute('ui-checked')).toBe(false);

	// Membership decides each item, and only the ticked one is on.
	expect(el(TomatoTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(TomatoIndicator).textContent).toBe('Checked');
	expect(el(LettuceTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(LettuceIndicator).textContent).toBe('');
	expect(el(MustardTrigger).getAttribute('aria-checked')).toBe('false');
}

// The ARIA state belongs on the ARIA element and the DOM property on the native
// one: a native input carrying both is a markuplint error and can desync.
function expectMixedSplitAcrossTriggerAndField() {
	expect(el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
	expect(el(SelectAllField).hasAttribute('aria-checked')).toBe(false);
	expect(el(SelectAllField).getAttribute('indeterminate')).toBe('');
	expect(el(SelectAllField).hasAttribute('checked')).toBe(false);
}

function expectDisabledRendered() {
	// One locked option inside a group that is otherwise usable.
	expect(el(CaviarTrigger).getAttribute('disabled')).toBe('');
	expect(el(TomatoTrigger).hasAttribute('disabled')).toBe(false);

	// A whole locked group: the root carries the flag, and so does every trigger,
	// including the select-all's.
	expect(el(LockedRoot).getAttribute('ui-disabled')).toBe('');
	expect(el(LockedSelectAllTrigger).getAttribute('disabled')).toBe('');
	expect(el(LockedMustardTrigger).getAttribute('disabled')).toBe('');
}

async function expectDisabledBlocks() {
	el(CaviarTrigger).click();
	el(LockedMustardTrigger).click();
	// Give a dispatch the room a real toggle gets, then read: nothing moved.
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(CaviarIndicator).textContent).toBe('');
	expect(el(LockedMustardIndicator).textContent).toBe('');
}

function expectGroupErrorRendered() {
	expect(el(AfterError).textContent).toBe('Pick at least one condiment');
	// Every part of one instance seeds before any part renders, so an error part
	// written after the items still marks the group's own trigger invalid.
	expect(el(AfterSelectAllTrigger).getAttribute('aria-invalid')).toBe('true');
	// The same error written BEFORE the items: document order does not decide.
	expect(el(BeforeError).textContent).toBe('Pick at least one condiment');
	expect(el(BeforeSelectAllTrigger).getAttribute('aria-invalid')).toBe('true');
}

function expectFormConfigRendered() {
	expect(el(LettuceField).getAttribute('name')).toBe('lettuce');
	expect(el(TomatoField).getAttribute('name')).toBe('tomato');
	// The item's own value is what a ticked box submits, not the browser default.
	expect(el(LettuceField).getAttribute('value')).toBe('lettuce');
	expect(el(TomatoField).getAttribute('value')).toBe('tomato');
	expect(el(LettuceField).hasAttribute('checked')).toBe(false);
}

async function expectTickedItemsSubmit() {
	await expect.poll(() => submit().textContent).toBe('{}');

	el(LettuceTrigger).click();
	await expect.poll(() => submit().textContent).toBe('{"lettuce":"lettuce"}');

	el(SelectAllTrigger).click();
	await expect.poll(() => submit().textContent).toBe('{"lettuce":"lettuce","tomato":"tomato"}');
}

// The whole point of the family: one gesture on the select-all writes the whole
// ticked set, and every item follows because membership is what it renders.
async function expectSelectAllTicksEverything() {
	el(SelectAllTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('true');
	await expect.poll(() => el(LettuceTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(TomatoTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(MustardTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(Root).hasAttribute('ui-mixed')).toBe(false);
}

async function expectSelectAllUnticksEverything() {
	el(SelectAllTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('true');

	el(SelectAllTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('false');
	await expect.poll(() => el(LettuceTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(TomatoTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(MustardTrigger).getAttribute('aria-checked')).toBe('false');
}

// aria-at's standalone tri-state plan cycles unchecked -> mixed; a select-all
// never does, because its mixed state is computed from the items and is not a
// destination a person can choose. Mixed goes to all.
async function expectMixedSelectAllTicksEverything() {
	expect(el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
	el(SelectAllTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('true');
	await expect.poll(() => el(LettuceTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(TomatoTrigger).getAttribute('aria-checked')).toBe('true');
	expect(el(MustardTrigger).getAttribute('aria-checked')).toBe('true');
}

// The other direction: an item toggle moves the select-all through the pure
// function of the two arrays, with no second cell to disagree.
async function expectOneItemMovesTheSelectAllToMixed() {
	expect(el(SelectAllTrigger).getAttribute('aria-checked')).toBe('false');
	el(LettuceTrigger).click();
	await expect.poll(() => el(LettuceTrigger).getAttribute('aria-checked')).toBe('true');
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
	expect(el(TomatoTrigger).getAttribute('aria-checked')).toBe('false');
}

async function expectTickingEveryItemChecksTheSelectAll() {
	el(LettuceTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
	el(TomatoTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
	el(MustardTrigger).click();
	// Every value ticked, so the pure function reports the group as fully on.
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('true');

	el(MustardTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
}

async function expectInstancesStayIsolated() {
	el(LeftSelectAllTrigger).click();
	await expect.poll(() => el(LeftLettuceIndicator).textContent).toBe('Checked');
	expect(el(LeftTomatoIndicator).textContent).toBe('Checked');
	// The other list never heard about it.
	expect(el(RightSourdoughIndicator).textContent).toBe('');
	expect(el(RightRyeIndicator).textContent).toBe('');
	expect(el(RightSelectAllTrigger).getAttribute('aria-checked')).toBe('false');
}

// Sibling items inside ONE list: a gesture on one item may not move another's
// composed checkbox instance, and it may not move the select-all past mixed.
async function expectSiblingItemsStayIsolated() {
	el(LettuceTrigger).click();
	await expect.poll(() => el(LettuceIndicator).textContent).toBe('Checked');
	expect(el(TomatoIndicator).textContent).toBe('');
	expect(el(TomatoTrigger).getAttribute('aria-checked')).toBe('false');
	expect(el(MustardTrigger).getAttribute('aria-checked')).toBe('false');
}

// `onChange` is a callback slot on the shared instance: the root fills it with
// its own prop at build time, and the writers dispatch through that route.
async function expectConsumerCallbackCarriesTheWholeSet() {
	expect(el(Calls).textContent).toBe('0');
	expect(el(Value).textContent).toBe('');

	el(LettuceTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('lettuce');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	el(TomatoTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('lettuce,tomato');
	await expect.poll(() => el(Calls).textContent).toBe('2');

	// The select-all hands over the whole set in one call, not one per item.
	el(SelectAllTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('');
	await expect.poll(() => el(Calls).textContent).toBe('3');
}

async function expectOmittedCallbackStillTicks() {
	el(LettuceTrigger).click();
	await expect.poll(() => el(LettuceTrigger).getAttribute('aria-checked')).toBe('true');
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named group, a select-all and three items`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test.skip(`${mode}: every part renders exactly one element`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneElementPerPart();
	});

	test.skip(`${mode}: some ticked renders the select-all mixed and each item by membership`, async () => {
		if (mode === 'CSR') await render(Partial);
		else await renderSSR(Partial);
		expectPartialRendered();
	});

	test.skip(`${mode}: a mixed select-all splits aria-checked and indeterminate across two elements`, async () => {
		if (mode === 'CSR') await render(Partial);
		else await renderSSR(Partial);
		expectMixedSplitAcrossTriggerAndField();
	});

	test.skip(`${mode}: unavailable options and a locked group render their flags`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		expectDisabledRendered();
	});

	test.skip(`${mode}: unavailable options and a locked group do not toggle`, async () => {
		if (mode === 'CSR') await render(UnavailableOptions);
		else await renderSSR(UnavailableOptions);
		await expectDisabledBlocks();
	});

	test.skip(`${mode}: a mounted error marks the group invalid, written after the items or before them`, async () => {
		if (mode === 'CSR') await render(WithError);
		else await renderSSR(WithError);
		expectGroupErrorRendered();
	});

	test.skip(`${mode}: the form carries a name and a value onto every item's field`, async () => {
		if (mode === 'CSR') await render(CondimentsForm);
		else await renderSSR(CondimentsForm);
		expectFormConfigRendered();
	});

	test.skip(`${mode}: only ticked items appear in what the form submits`, async () => {
		if (mode === 'CSR') await render(CondimentsForm);
		else await renderSSR(CondimentsForm);
		await expectTickedItemsSubmit();
	});

	test.skip(`${mode}: the select-all ticks every item`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectSelectAllTicksEverything();
	});

	test.skip(`${mode}: the select-all unticks every item`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectSelectAllUnticksEverything();
	});

	test.skip(`${mode}: a mixed select-all ticks everything rather than cycling`, async () => {
		if (mode === 'CSR') await render(Partial);
		else await renderSSR(Partial);
		await expectMixedSelectAllTicksEverything();
	});

	test.skip(`${mode}: ticking one item moves the select-all to mixed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectOneItemMovesTheSelectAllToMixed();
	});

	test.skip(`${mode}: ticking every item checks the select-all, and unticking one returns it to mixed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectTickingEveryItemChecksTheSelectAll();
	});

	test.skip(`${mode}: a select-all in one list leaves the other list alone`, async () => {
		if (mode === 'CSR') await render(TwoLists);
		else await renderSSR(TwoLists);
		await expectInstancesStayIsolated();
	});

	test.skip(`${mode}: ticking one item leaves its siblings alone`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectSiblingItemsStayIsolated();
	});

	test.skip(`${mode}: the consumer onChange is called once with the whole new ticked set`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbackCarriesTheWholeSet();
	});

	test.skip(`${mode}: an omitted onChange still ticks`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectOmittedCallbackStillTicks();
	});
}

// --- keyboard -------------------------------------------------------------
//
// A checkbox group has no roving tabindex and no arrow navigation: every box is
// its own tab stop and Space is the only activation key, so the family adds no
// keyboard rule of its own beyond what the composed checkbox already has.

test.skip('CSR: Space on the focused select-all ticks every item', async () => {
	await render(Basic);
	el(SelectAllTrigger).focus();
	expect(document.activeElement).toBe(el(SelectAllTrigger));

	await userEvent.keyboard(' ');
	await expect.poll(() => el(SelectAllIndicator).textContent).toBe('Checked');
	await expect.poll(() => el(LettuceTrigger).getAttribute('aria-checked')).toBe('true');
});

test.skip('CSR: Space on a focused item moves the select-all to mixed', async () => {
	await render(Basic);
	el(LettuceTrigger).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(LettuceIndicator).textContent).toBe('Checked');
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
});

// --- repeats ---------------------------------------------------------------
//
// Items authored with a keyed `@for` — the shape a real list has, since a
// checklist over a literal list of options is a toy.

test.skip('CSR: items from a keyed loop each get their own instance', async () => {
	await render(ItemsFromData);
	const triggers = all('row-trigger');
	expect(triggers.length).toBe(3);
	// Three rows, three minted ids: the rows did not share one instance.
	expect(new Set(triggers.map((trigger) => trigger.id)).size).toBe(3);

	(triggers[1] as HTMLElement).click();
	await expect.poll(() => triggers[1]?.getAttribute('aria-checked')).toBe('true');
	// The click landed in one row only.
	expect(triggers[0]?.getAttribute('aria-checked')).toBe('false');
	expect(triggers[2]?.getAttribute('aria-checked')).toBe('false');
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('mixed');
});

test.skip('CSR: the select-all ticks every row of a looped list', async () => {
	await render(ItemsFromData);
	el(SelectAllTrigger).click();
	await expect.poll(() => el(SelectAllTrigger).getAttribute('aria-checked')).toBe('true');
	for (const trigger of all('row-trigger')) {
		await expect.poll(() => trigger.getAttribute('aria-checked')).toBe('true');
	}
});

// --- gaps -----------------------------------------------------------------

// Recorded red, not asserted green. The APG mixed-checkbox example puts an IDREF
// LIST on the tri-state parent naming every box it controls.
// MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE refuses a list today - "an IDREF
// position takes exactly one element() handle written directly" - so the
// select-all ships without it, exactly where QDS is. Red the day an IDREF SET
// lands, and whoever lands it deletes the `.fails`.
test.fails('the select-all names the boxes it controls', async () => {
	await render(Basic);
	const controls = el(SelectAllTrigger).getAttribute('aria-controls') ?? '';
	expect(controls.split(' ').filter(Boolean)).toEqual([
		el(LettuceTrigger).id,
		el(TomatoTrigger).id,
		el(MustardTrigger).id,
	]);
});
