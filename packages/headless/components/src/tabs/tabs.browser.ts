import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import ArmTabs from './scenarios/arm-tabs.tsrx';
import Basic from './scenarios/basic.tsrx';
import ConsumerAttributes from './scenarios/consumer-attributes.tsrx';
import Looping from './scenarios/looping.tsrx';
import ManualActivation from './scenarios/manual-activation.tsrx';
import SettingsPanels from './scenarios/settings-panels.tsrx';
import TwoWidgets from './scenarios/two-widgets.tsrx';
import Vertical from './scenarios/vertical.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

// Colocated browser suite for the tabs family. Each test renders a realistic
// consumer scenario, and the locators name the QDS part anatomy: root, list,
// trigger, content - prefixed per tab, the way a consumer names their own tabs.
const Root = page.getByTestId('root');
const List = page.getByTestId('list');
const OverviewTrigger = page.getByTestId('overview-trigger');
const UsageTrigger = page.getByTestId('usage-trigger');
const BillingTrigger = page.getByTestId('billing-trigger');
const OverviewContent = page.getByTestId('overview-content');
const UsageContent = page.getByTestId('usage-content');
const BillingContent = page.getByTestId('billing-content');
// The settings page, where one tab is closed to everyone.
const ProfileTrigger = page.getByTestId('profile-trigger');
const TeamTrigger = page.getByTestId('team-trigger');
const DangerTrigger = page.getByTestId('danger-trigger');
const ProfileContent = page.getByTestId('profile-content');
const DangerContent = page.getByTestId('danger-content');
const DisplayName = page.getByTestId('display-name');
const Delete = page.getByTestId('delete');
// Tabs stacked down the side.
const InboxTrigger = page.getByTestId('inbox-trigger');
const SentTrigger = page.getByTestId('sent-trigger');
// The looping pair: a row and a column.
const RowOne = page.getByTestId('row-one');
const RowThree = page.getByTestId('row-three');
const ColumnOne = page.getByTestId('column-one');
const ColumnThree = page.getByTestId('column-three');
// Panels expensive enough that arrowing must not open them.
const DailyTrigger = page.getByTestId('daily-trigger');
const WeeklyTrigger = page.getByTestId('weekly-trigger');
const MonthlyTrigger = page.getByTestId('monthly-trigger');
const DailyContent = page.getByTestId('daily-content');
const WeeklyContent = page.getByTestId('weekly-content');
// The consumer handler's log.
const FirstOverview = page.getByTestId('first-overview');
const FirstUsage = page.getByTestId('first-usage');
const FirstUsageContent = page.getByTestId('first-usage-content');
const SecondBeta = page.getByTestId('second-beta');
const FirstValue = page.getByTestId('first-value');
const SecondValue = page.getByTestId('second-value');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
// Two tab sets on one page, sharing the same values on purpose.
const LeftOne = page.getByTestId('left-one');
const LeftTwo = page.getByTestId('left-two');
const LeftOneContent = page.getByTestId('left-one-content');
const LeftTwoContent = page.getByTestId('left-two-content');
const RightOneContent = page.getByTestId('right-one-content');
const RightTwoContent = page.getByTestId('right-two-content');
// The consumer who wrote the family's own attributes.
const OneTrigger = page.getByTestId('one-trigger');
const TwoContent = page.getByTestId('two-content');

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

function expectBasicRendered() {
	expect(el(List).getAttribute('role')).toBe('tablist');
	expect(el(List).getAttribute('aria-orientation')).toBe('horizontal');
	expect(el(OverviewTrigger).getAttribute('role')).toBe('tab');
	expect(el(UsageTrigger).getAttribute('role')).toBe('tab');
	expect(el(BillingTrigger).getAttribute('role')).toBe('tab');
	expect(el(OverviewContent).getAttribute('role')).toBe('tabpanel');
	// Not a live region: every tab change would double-announce over the tab.
	expect(el(OverviewContent).getAttribute('aria-live')).toBe('off');

	expect(el(OverviewTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(UsageTrigger).getAttribute('aria-selected')).toBe('false');
	expect(el(BillingTrigger).getAttribute('aria-selected')).toBe('false');
	expect(el(OverviewTrigger).getAttribute('ui-selected')).toBe('');
	expect(el(UsageTrigger).hasAttribute('ui-selected')).toBe(false);
	// A horizontal set says so by the absence of the flag, not by a value.
	expect(el(Root).hasAttribute('ui-vertical')).toBe(false);
	expect(el(List).hasAttribute('ui-vertical')).toBe(false);
}

function expectOneElementPerPart() {
	expect(page.getByTestId('root').elements().length).toBe(1);
	expect(page.getByTestId('list').elements().length).toBe(1);
	expect(page.getByTestId('overview-trigger').elements().length).toBe(1);
	expect(page.getByTestId('overview-content').elements().length).toBe(1);
	// The trigger is a button that submits nothing.
	expect(el(OverviewTrigger).tagName).toBe('BUTTON');
	expect(el(OverviewTrigger).getAttribute('type')).toBe('button');
}

function expectPanelDisplayFollowsSelection() {
	expect(el(OverviewContent).hasAttribute('hidden')).toBe(false);
	expect(el(UsageContent).hasAttribute('hidden')).toBe(true);
	expect(el(BillingContent).hasAttribute('hidden')).toBe(true);
	expect(el(OverviewContent).getAttribute('ui-selected')).toBe('');
	expect(el(UsageContent).hasAttribute('ui-selected')).toBe(false);
}

function expectRovingTabindexBeforeAnyGesture() {
	// One tab stop for the whole set, on the tab that is showing, so Tab lands
	// on the selected tab and Tab again leaves the tablist for the panel.
	expect(el(OverviewTrigger).getAttribute('tabindex')).toBe('0');
	expect(el(UsageTrigger).getAttribute('tabindex')).toBe('-1');
	expect(el(BillingTrigger).getAttribute('tabindex')).toBe('-1');
	// The showing panel is its own tab stop; the hidden ones are not.
	expect(el(OverviewContent).getAttribute('tabindex')).toBe('0');
	expect(el(UsageContent).getAttribute('tabindex')).toBe('-1');
}

function expectVerticalRendered() {
	expect(el(Root).getAttribute('ui-vertical')).toBe('');
	expect(el(List).getAttribute('ui-vertical')).toBe('');
	expect(el(List).getAttribute('aria-orientation')).toBe('vertical');
	expect(el(InboxTrigger).getAttribute('ui-vertical')).toBe('');
}

function expectSettingsRendered() {
	expect(el(ProfileTrigger).getAttribute('aria-selected')).toBe('true');
	// A tab nobody may open is a disabled button; nothing else marks it.
	expect(el(TeamTrigger).getAttribute('disabled')).toBe('');
	expect(el(DangerTrigger).hasAttribute('disabled')).toBe(false);
	expect(el(List).getAttribute('aria-label')).toBe('Settings');
	// A panel keeps its own focusable controls, so a person can Tab into them.
	expect(el(ProfileContent).hasAttribute('hidden')).toBe(false);
	expect(el(DisplayName)).not.toBeNull();
	expect(el(DangerContent).hasAttribute('hidden')).toBe(true);
}

function expectArmedPartsResolveTheRoot() {
	// A panel authored inside an @if arm reads the enclosing root's instance the
	// way a flat one does. The tab beside it cannot be armed - see the scenario.
	expect(el(page.getByTestId('team-content')).getAttribute('role')).toBe('tabpanel');
	expect(el(page.getByTestId('team-content')).hasAttribute('hidden')).toBe(true);
	expect(el(page.getByTestId('overview-content')).hasAttribute('hidden')).toBe(false);
	expect(el(page.getByTestId('team-trigger')).getAttribute('aria-selected')).toBe('false');
}

function expectTwoWidgetsRenderIndependently() {
	expect(el(LeftOneContent).hasAttribute('hidden')).toBe(false);
	expect(el(RightOneContent).hasAttribute('hidden')).toBe(false);
	expect(el(LeftTwoContent).hasAttribute('hidden')).toBe(true);
	expect(el(RightTwoContent).hasAttribute('hidden')).toBe(true);
}

function expectFamilyOwnsItsOwnAttributes() {
	// `{...rest}` is spread first, so the family's role and state win.
	expect(el(OneTrigger).getAttribute('role')).toBe('tab');
	expect(el(OneTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(List).getAttribute('role')).toBe('tablist');
	expect(el(TwoContent).getAttribute('role')).toBe('tabpanel');
	// A consumer cannot show a panel whose tab is not the showing one.
	expect(el(TwoContent).hasAttribute('hidden')).toBe(true);
}

// The APG wants aria-controls on the tab and aria-labelledby on the panel, and
// this family emits neither. element() mints one id per handle per widget
// instance, and a tabs root is one instance holding N trigger/panel pairs, so a
// handle in an IDREF position names one element, not the third of four
// (research-tabs.md 6b; MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED and
// _COMPOSITE refuse the ways around it). QDS is in the same place. This row
// turns red - which is the signal to wire them - the day a value-keyed
// sub-instance can be resolved from two sibling subtrees.
function expectPairingNotWiredYet() {
	expect(el(OverviewTrigger).hasAttribute('aria-controls')).toBe(false);
	expect(el(OverviewContent).hasAttribute('aria-labelledby')).toBe(false);
}

async function expectClickSelectsTheTab() {
	el(BillingTrigger).click();
	await expect.poll(() => el(BillingTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(OverviewTrigger).getAttribute('aria-selected')).toBe('false');
	// The tab stop moved with the selection.
	await expect.poll(() => el(BillingTrigger).getAttribute('tabindex')).toBe('0');
	expect(el(OverviewTrigger).getAttribute('tabindex')).toBe('-1');
}

async function expectClickMovesThePanels() {
	el(BillingTrigger).click();
	// ui-selected and hidden are the same cell read twice, so which of the two
	// moves says whether the cell or the attribute is what went stale.
	await expect.poll(() => el(BillingContent).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(BillingContent).hasAttribute('hidden')).toBe(false);
	expect(el(OverviewContent).hasAttribute('hidden')).toBe(true);
}

async function expectClickingTheShowingTabChangesNothing() {
	el(OverviewTrigger).click();
	await expect.poll(() => el(OverviewTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(OverviewContent).hasAttribute('hidden')).toBe(false);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders three tabs with the first one showing`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: every part renders exactly one element`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneElementPerPart();
	});

	test(`${mode}: only the showing tab's panel is displayed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectPanelDisplayFollowsSelection();
	});

	test(`${mode}: the tab set holds one tab stop, on the showing tab`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRovingTabindexBeforeAnyGesture();
	});

	test(`${mode}: a vertical set says so on the root, the list and each tab`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);
		expectVerticalRendered();
	});

	test(`${mode}: a settings page renders a closed tab and panels with their own controls`, async () => {
		if (mode === 'CSR') await render(SettingsPanels);
		else await renderSSR(SettingsPanels);
		expectSettingsRendered();
	});

	test(`${mode}: a tab and a panel written inside an arm resolve the enclosing root`, async () => {
		if (mode === 'CSR') await render(ArmTabs);
		else await renderSSR(ArmTabs);
		expectArmedPartsResolveTheRoot();
	});

	test(`${mode}: two tab sets on one page render their own selection`, async () => {
		if (mode === 'CSR') await render(TwoWidgets);
		else await renderSSR(TwoWidgets);
		expectTwoWidgetsRenderIndependently();
	});

	test(`${mode}: the family's role and state survive a consumer writing them`, async () => {
		if (mode === 'CSR') await render(ConsumerAttributes);
		else await renderSSR(ConsumerAttributes);
		expectFamilyOwnsItsOwnAttributes();
	});

	test(`${mode}: the tab and its panel are not paired by an IDREF yet`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectPairingNotWiredYet();
	});

	test(`${mode}: clicking a tab shows it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectClickSelectsTheTab();
	});

	test(`${mode}: clicking the tab already showing changes nothing`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectClickingTheShowingTabChangesNothing();
	});
}

// --- keyboard -------------------------------------------------------------
//
// The APG's rule for this pattern, and where it differs from a radio group: an
// arrow key moves focus, and whether focus also shows the tab is selectOnFocus's
// call. Automatic activation is the default, so the panel swap is silent to a
// screen reader - the documented cost of showing a tab on focus.

test('CSR: ArrowRight walks to the next tab and shows it', async () => {
	await render(Basic);
	el(OverviewTrigger).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(UsageTrigger));
	await expect.poll(() => el(UsageTrigger).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el(UsageContent).hasAttribute('hidden')).toBe(false);
	expect(el(OverviewContent).hasAttribute('hidden')).toBe(true);
});

test('CSR: ArrowLeft walks back', async () => {
	await render(Basic);
	el(BillingTrigger).focus();

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(UsageTrigger));
	await expect.poll(() => el(UsageTrigger).getAttribute('aria-selected')).toBe('true');
});

test('CSR: the arrows walk past a tab nobody may open', async () => {
	await render(SettingsPanels);
	el(ProfileTrigger).focus();

	// profile -> (team is closed) -> danger
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(DangerTrigger));
	await expect.poll(() => el(DangerTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(TeamTrigger).getAttribute('aria-selected')).toBe('false');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(ProfileTrigger));
});

test('CSR: Home and End show the first and the last tab', async () => {
	await render(Basic);
	el(UsageTrigger).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(BillingTrigger));
	await expect.poll(() => el(BillingTrigger).getAttribute('aria-selected')).toBe('true');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(OverviewTrigger));
	await expect.poll(() => el(OverviewTrigger).getAttribute('aria-selected')).toBe('true');
});

test('CSR: the ends stop when nothing said to loop', async () => {
	await render(Basic);
	el(BillingTrigger).focus();

	await userEvent.keyboard('{ArrowRight}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(BillingTrigger));

	el(OverviewTrigger).focus();
	await userEvent.keyboard('{ArrowLeft}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(OverviewTrigger));
});

test('CSR: a vertical set walks the vertical axis and leaves the other alone', async () => {
	await render(Vertical);
	el(InboxTrigger).focus();

	// inbox -> (drafts is closed) -> sent
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(SentTrigger));
	await expect.poll(() => el(SentTrigger).getAttribute('aria-selected')).toBe('true');

	// The horizontal arrows are not this set's axis: nothing moves.
	await userEvent.keyboard('{ArrowRight}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(document.activeElement).toBe(el(SentTrigger));

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(InboxTrigger));
});

test('CSR: a looping row wraps at both ends', async () => {
	await render(Looping);
	el(RowThree).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(RowOne));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(RowThree));
});

test('CSR: a looping column wraps at both ends', async () => {
	await render(Looping);
	el(ColumnThree).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ColumnOne));

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(ColumnThree));
});

// --- manual activation ------------------------------------------------------

test('CSR: with selectOnFocus off an arrow moves focus without showing the tab', async () => {
	await render(ManualActivation);
	el(DailyTrigger).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(WeeklyTrigger));
	// Focus moved; the showing tab did not.
	expect(el(WeeklyTrigger).getAttribute('aria-selected')).toBe('false');
	expect(el(DailyTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(WeeklyContent).hasAttribute('hidden')).toBe(true);
});

test('CSR: with selectOnFocus off Enter and Space show the focused tab', async () => {
	await render(ManualActivation);
	el(WeeklyTrigger).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(WeeklyTrigger).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el(WeeklyContent).hasAttribute('hidden')).toBe(false);
	expect(el(DailyContent).hasAttribute('hidden')).toBe(true);

	el(MonthlyTrigger).focus();
	await userEvent.keyboard(' ');
	await expect.poll(() => el(MonthlyTrigger).getAttribute('aria-selected')).toBe('true');
});

// --- the consumer's callback ------------------------------------------------
//
// `onChange` is a callback slot on the shared instance: the root fills it with
// its own prop at build time, and `show()` dispatches through that route.

test('CSR: onChange is called once, with the new value, before the consumer click handler', async () => {
	await render(WithOnChange);
	// Nothing fired on mount or first render.
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');

	el(FirstUsage).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('usage');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	// The family's own handler ran first, the consumer's after it.
	await expect.poll(() => el(Order).textContent).toBe('change-click');
	await expect.poll(() => el(FirstUsageContent).hasAttribute('hidden')).toBe(false);
	// The sibling set's handler did not run.
	expect(el(SecondValue).textContent).toBe('');
});

test('CSR: each set reaches only its own handler', async () => {
	await render(WithOnChange);
	el(SecondBeta).click();
	await expect.poll(() => el(SecondValue).textContent).toBe('beta');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstValue).textContent).toBe('');

	el(FirstUsage).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('usage');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: showing the tab already showing calls nothing', async () => {
	await render(WithOnChange);
	el(FirstOverview).click();
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');
});

test('CSR: tabs change with no onChange in play', async () => {
	await render(WithoutOnChange);
	el(UsageTrigger).click();
	await expect.poll(() => el(UsageTrigger).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el(UsageContent).hasAttribute('hidden')).toBe(false);
	expect(el(Calls).textContent).toBe('0');
});

// --- two widgets ------------------------------------------------------------

test('CSR: clicking in one tab set leaves the other where it was', async () => {
	await render(TwoWidgets);
	el(LeftTwo).click();
	await expect.poll(() => el(LeftTwoContent).hasAttribute('hidden')).toBe(false);
	expect(el(LeftOneContent).hasAttribute('hidden')).toBe(true);
	// The set beside it, whose tabs carry the same values, did not move.
	expect(el(RightOneContent).hasAttribute('hidden')).toBe(false);
	expect(el(RightTwoContent).hasAttribute('hidden')).toBe(true);
});

test('CSR: arrowing in one tab set leaves the other where it was', async () => {
	await render(TwoWidgets);
	el(LeftOne).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(LeftTwo));
	await expect.poll(() => el(LeftTwoContent).hasAttribute('hidden')).toBe(false);
	expect(el(RightTwoContent).hasAttribute('hidden')).toBe(true);
});

// --- served, then resumed ---------------------------------------------------

test('CSR: clicking a tab moves the panels', async () => {
	await render(Basic);
	await expectClickMovesThePanels();
});

test('SSR: the selection is in the served HTML, and the first click after resume moves the tab', async () => {
	await renderSSR(Basic);
	// What the server wrote, before any gesture.
	expect(el(OverviewTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(OverviewContent).hasAttribute('hidden')).toBe(false);
	expect(el(BillingContent).hasAttribute('hidden')).toBe(true);

	el(BillingTrigger).click();
	await expect.poll(() => el(BillingTrigger).getAttribute('aria-selected')).toBe('true');
	expect(el(OverviewTrigger).getAttribute('aria-selected')).toBe('false');
});

// PINNED. After resume, a `tabs.content` never refreshes again: `ui-selected`
// stays absent and `hidden` stays set, so the panels keep whatever the server
// served while the triggers beside them, in the same widget, move correctly.
// It is the computed cell that is stale, not one attribute - `ui-selected` and
// `hidden` are the same cell read twice, and both are wrong.
//
// Measured on this tip, both ways round:
//   * comparing the root's cell against the content's own PROP (what ships)
//     refreshes in CSR and never after resume;
//   * comparing against a cell on a part instance the content roots itself
//     stops `hidden` refreshing in CSR as well, so it is not the fix.
// The trigger takes the first shape and is fine in both modes, so a part
// reading its own prop is not the whole story either.
//
// Deterministic, so.
 test.fails rather than skip: the row turns red the day the
// panel refreshes, which is the signal to unpin it.
test.fails('SSR: clicking a tab moves the panels', async () => {
	await renderSSR(Basic);
	await expectClickMovesThePanels();
});

test('SSR: the keyboard walk works on a resumed page', async () => {
	await renderSSR(Basic);
	el(OverviewTrigger).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(UsageTrigger));
	await expect.poll(() => el(UsageTrigger).getAttribute('aria-selected')).toBe('true');
});

test('CSR: the panel a consumer opened keeps its control reachable', async () => {
	await render(SettingsPanels);
	el(DangerTrigger).click();
	await expect.poll(() => el(DangerContent).hasAttribute('hidden')).toBe(false);
	// A control inside a shown panel is focusable, which is the whole reason the
	// panels are hidden rather than unmounted.
	el(Delete).focus();
	expect(document.activeElement).toBe(el(Delete));
});
