import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Mixed from './scenarios/mixed.tsrx';
import TwoBars from './scenarios/two-bars.tsrx';
import Vertical from './scenarios/vertical.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Copy = page.getByTestId('copy');
const Cut = page.getByTestId('cut');
const Paste = page.getByTestId('paste');

const Left = page.getByTestId('left');
const Center = page.getByTestId('center');
const Wrap = page.getByTestId('wrap');
const Font = page.getByTestId('font');
const FontContent = page.getByTestId('font-content');
const Print = page.getByTestId('print');

const Up = page.getByTestId('up');
const Down = page.getByTestId('down');
const Blend = page.getByTestId('blend');
const BlendContent = page.getByTestId('blend-content');

const Undo = page.getByTestId('undo');
const Redo = page.getByTestId('redo');
const Track = page.getByTestId('track');
const Compare = page.getByTestId('compare');

const FirstRoot = page.getByTestId('first-root');
const SecondRoot = page.getByTestId('second-root');
const Bold = page.getByTestId('bold');
const Italic = page.getByTestId('italic');
const Row = page.getByTestId('row');
const Column = page.getByTestId('column');
const Merge = page.getByTestId('merge');
const Loose = page.getByTestId('loose');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

const stopsOf = (parts: ReadonlyArray<{ element(): Element | null }>) =>
	parts.map((one) => el(one).getAttribute('tabindex'));

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

// The bar hands focus on rather than keeping it, so entering it is one gesture
// whichever way a person arrives.
async function enter(bar: HTMLElement, first: HTMLElement) {
	bar.focus();
	await expect.poll(() => document.activeElement).toBe(first);
}

function expectBasicRendered() {
	expect(el(Root).getAttribute('role')).toBe('toolbar');
	expect(el(Root).getAttribute('aria-orientation')).toBe('horizontal');
	expect(el(Root).hasAttribute('ui-vertical')).toBe(false);
	expect(el(Copy).tagName).toBe('BUTTON');
	expect(el(Copy).getAttribute('type')).toBe('button');
	expect(el(Copy).hasAttribute('aria-disabled')).toBe(false);
}

function expectBarIsNamedByItsLabel() {
	const labelledby = el(Root).getAttribute('aria-labelledby');
	expect(labelledby, 'the bar points at a name').toBeTruthy();
	expect(document.getElementById(labelledby ?? '')).toBe(el(Label));
	expect(el(Label).textContent).toBe('Text formatting');
	// A toolbar is not a form control, so the name is a span rather than a label.
	expect(el(Label).tagName).toBe('SPAN');
}

// Cold, before any gesture: exactly one tab stop for the whole bar, and it is the
// bar itself. A handle cannot be read while deriving, so no control can render
// the stop; the bar carries it until focus arrives and then hands it on.
function expectOneColdTabStop() {
	expect(el(Root).getAttribute('tabindex')).toBe('0');
	expect(stopsOf([Copy, Cut, Paste])).toEqual(['-1', '-1', '-1']);
}

function expectOneTabStopIn(bar: HTMLElement) {
	const stops = [...bar.querySelectorAll('[tabindex="0"]')];
	expect(stops.length, 'one tab stop over the whole bar').toBe(1);
	expect(bar.getAttribute('tabindex')).toBe('-1');
}

async function expectEntryLandsOnTheFirstControl() {
	await enter(el(Root), el(Copy));
	await expect.poll(() => el(Copy).getAttribute('tabindex')).toBe('0');
	expect(stopsOf([Cut, Paste])).toEqual(['-1', '-1']);
	// The bar drops out of the tab order, so the next Tab leaves the bar entirely.
	expect(el(Root).getAttribute('tabindex')).toBe('-1');
	expectOneTabStopIn(el(Root));
}

async function expectArrowsWalkTheBar() {
	await enter(el(Root), el(Copy));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Cut));
	await expect.poll(() => el(Cut).getAttribute('tabindex')).toBe('0');
	expect(el(Copy).getAttribute('tabindex')).toBe('-1');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(Copy));
}

async function expectTheEndsStayPut() {
	await enter(el(Root), el(Copy));
	// A move that has to land somewhere new comes first: the first arrow on a page
	// whose handler has not woken is the one that wakes it.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Cut));

	el(Copy).focus();
	await userEvent.keyboard('{ArrowLeft}');
	await settled();
	expect(document.activeElement).toBe(el(Copy));

	el(Paste).focus();
	await userEvent.keyboard('{ArrowRight}');
	await settled();
	expect(document.activeElement).toBe(el(Paste));
}

async function expectHomeAndEnd() {
	await enter(el(Root), el(Copy));

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(Paste));

	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(Copy));
}

// The family's whole point: four families' controls in one roster, walked in
// document order, with no wrapper part around any of them.
async function expectRovingAcrossMixedControls() {
	await enter(el(Root), el(Left));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Center));

	// The button group's own walk stops at its last item, so the bar takes the key
	// and leaves the group. Nothing was stopped or flagged to arrange that.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Wrap));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Font));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Print));
	expectOneTabStopIn(el(Root));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(Font));
}

function expectEveryControlKeepsItsOwnRole() {
	expect(el(Left).getAttribute('aria-pressed')).toBe('true');
	expect(el(Wrap).getAttribute('role')).toBe('switch');
	expect(el(Wrap).getAttribute('aria-checked')).toBe('false');
	expect(el(Font).getAttribute('aria-haspopup')).toBe('listbox');
	expect(el(Print).hasAttribute('role')).toBe(false);
	// The bar claims one tab stop and an orientation, and nothing else.
	expect(el(Root).getAttribute('role')).toBe('toolbar');
}

async function expectAControlKeepsItsOwnKeyboard() {
	await enter(el(Root), el(Left));
	el(Font).focus();
	await expect.poll(() => document.activeElement).toBe(el(Font));

	// ArrowDown is the select's own key, not the horizontal bar's: it opens the
	// listbox and the bar never sees a move of its own to make.
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(FontContent).hasAttribute('hidden')).toBe(false);
	expect(document.activeElement).not.toBe(el(Print));
}

// Two controls that change their own state under a press, each of which
// re-renders its own element. The bar's stop has to survive that.
async function expectPressingInsideTheBarKeepsTheStop() {
	await enter(el(Root), el(Left));

	el(Wrap).focus();
	await expect.poll(() => el(Wrap).getAttribute('tabindex')).toBe('0');
	el(Wrap).click();
	await expect.poll(() => el(Wrap).getAttribute('aria-checked')).toBe('true');
	await settled();
	expect(el(Wrap).getAttribute('tabindex')).toBe('0');
	expectOneTabStopIn(el(Root));

	el(Center).focus();
	await expect.poll(() => el(Center).getAttribute('tabindex')).toBe('0');
	el(Center).click();
	await expect.poll(() => el(Center).getAttribute('aria-pressed')).toBe('true');
	await settled();
	// The group's own roving rule stands down inside a bar, so its press does not
	// hand the stop back to the item the group would have chosen.
	expect(el(Center).getAttribute('tabindex')).toBe('0');
	expect(el(Left).getAttribute('tabindex')).toBe('-1');
	expectOneTabStopIn(el(Root));
}

function expectVerticalRendered() {
	expect(el(Root).getAttribute('aria-orientation')).toBe('vertical');
	expect(el(Root).getAttribute('ui-vertical')).toBe('');
}

async function expectAStackedBarWalksOnUpAndDown() {
	await enter(el(Root), el(Up));

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(Down));

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(Up));

	// Off-axis arrows are not this bar's, so nothing moves.
	await userEvent.keyboard('{ArrowRight}');
	await settled();
	expect(document.activeElement).toBe(el(Up));
}

// The APG's own caution, measured: a control whose keyboard needs the pair of
// arrows the bar walks on takes them, and the bar does not move. That is why the
// select is the last control in this bar.
async function expectTheLastControlMayTakeTheBarsAxis() {
	await enter(el(Root), el(Up));
	el(Blend).focus();
	await expect.poll(() => document.activeElement).toBe(el(Blend));

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(BlendContent).hasAttribute('hidden')).toBe(false);
	expect(document.activeElement).not.toBe(el(Up));
}

function expectDisabledRendered() {
	// aria-disabled, not the native attribute: it stays focusable and stays a
	// destination, which is the APG toolbar rule.
	expect(el(Redo).getAttribute('aria-disabled')).toBe('true');
	expect(el(Redo).getAttribute('ui-disabled')).toBe('');
	expect(el<HTMLButtonElement>(Redo).disabled).toBe(false);
	// The switch is disabled outright by its own family, so the browser has taken
	// it out of the tab order entirely.
	expect(el<HTMLButtonElement>(Track).disabled).toBe(true);
}

async function expectArrowsSkipOnlyWhatCannotTakeFocus() {
	await enter(el(Root), el(Undo));

	// A destination: aria-disabled, still focusable.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Redo));

	// Walked past: natively disabled, and focusing it would swallow the key.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Compare));
}

async function expectADisabledItemRefusesActivation() {
	await enter(el(Root), el(Undo));
	el(Redo).click();
	await settled();
	expect(el(Redo).getAttribute('aria-disabled')).toBe('true');
}

// Two bars, two rosters. Each control's registration is qualified to the instance
// its own `toolbar.state()` read resolved to.
async function expectTwoBarsStayIsolated() {
	await enter(el(FirstRoot), el(Bold));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Italic));

	// The end of the first bar is the end: the second bar's controls are not in it.
	await userEvent.keyboard('{ArrowRight}');
	await settled();
	expect(document.activeElement).toBe(el(Italic));

	await enter(el(SecondRoot), el(Row));
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(Merge));
	expect(el(Column).getAttribute('tabindex')).toBe('-1');
	// Entering the second bar left the first bar's own stop where it was.
	expect(el(Italic).getAttribute('tabindex')).toBe('0');
}

// The other half of the same qualification: a control standing outside every bar
// resolves to no instance, joins no roster, and keeps the tab stop it would have
// anywhere else on the page.
async function expectALooseControlRegistersNowhere() {
	expect(el(Loose).hasAttribute('tabindex')).toBe(false);

	await enter(el(SecondRoot), el(Row));
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(Merge));
	expect(document.activeElement).not.toBe(el(Loose));
	expect(el(Loose).hasAttribute('tabindex')).toBe(false);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named bar of buttons`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
		expectBarIsNamedByItsLabel();
	});

	test(`${mode}: the bar holds one tab stop before any gesture`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneColdTabStop();
	});

	test(`${mode}: entering the bar lands on the first control and Tab then leaves`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectEntryLandsOnTheFirstControl();
	});

	test(`${mode}: the arrows walk the bar and carry the stop`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectArrowsWalkTheBar();
	});

	test(`${mode}: the ends of the bar stay put`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectTheEndsStayPut();
	});

	test(`${mode}: Home and End reach the first and last control`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectHomeAndEnd();
	});

	test(`${mode}: the roving stop crosses four families in document order`, async () => {
		if (mode === 'CSR') await render(Mixed);
		else await renderSSR(Mixed);
		await expectRovingAcrossMixedControls();
	});

	test(`${mode}: every control in the bar keeps its own role`, async () => {
		if (mode === 'CSR') await render(Mixed);
		else await renderSSR(Mixed);
		expectEveryControlKeepsItsOwnRole();
	});

	test(`${mode}: a control's own keyboard stays its own`, async () => {
		if (mode === 'CSR') await render(Mixed);
		else await renderSSR(Mixed);
		await expectAControlKeepsItsOwnKeyboard();
	});

	test(`${mode}: a press inside the bar leaves the stop where it is`, async () => {
		if (mode === 'CSR') await render(Mixed);
		else await renderSSR(Mixed);
		await expectPressingInsideTheBarKeepsTheStop();
	});

	test(`${mode}: a stacked bar says so and walks on the up and down arrows`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);
		expectVerticalRendered();
		await expectAStackedBarWalksOnUpAndDown();
	});

	test(`${mode}: the last control may take the bar's own axis`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);
		await expectTheLastControlMayTakeTheBarsAxis();
	});

	test(`${mode}: an unavailable control renders the kind of unavailable it is`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
	});

	test(`${mode}: the arrows skip only what cannot take focus`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		await expectArrowsSkipOnlyWhatCannotTakeFocus();
	});

	test(`${mode}: a disabled item refuses its activation`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		await expectADisabledItemRefusesActivation();
	});

	test(`${mode}: two bars on one page keep separate rosters`, async () => {
		if (mode === 'CSR') await render(TwoBars);
		else await renderSSR(TwoBars);
		await expectTwoBarsStayIsolated();
	});

	test(`${mode}: a switch outside every bar registers nowhere`, async () => {
		if (mode === 'CSR') await render(TwoBars);
		else await renderSSR(TwoBars);
		await expectALooseControlRegistersNowhere();
	});

	test(`${mode}: axe finds nothing in a bar of buttons`, async () => {
		const screen = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(screen.container as HTMLElement, `${mode} basic`);
	});

	test(`${mode}: axe finds nothing in a mixed bar, entered`, async () => {
		const screen = mode === 'CSR' ? await render(Mixed) : await renderSSR(Mixed);
		await expectNoAxeViolations(screen.container as HTMLElement, `${mode} mixed, cold`);
		await enter(el(Root), el(Left));
		await expectNoAxeViolations(screen.container as HTMLElement, `${mode} mixed, entered`);
	});

	test(`${mode}: axe finds nothing in a stacked bar or a bar with unavailable controls`, async () => {
		const stacked = mode === 'CSR' ? await render(Vertical) : await renderSSR(Vertical);
		await expectNoAxeViolations(stacked.container as HTMLElement, `${mode} vertical`);
		const locked = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		await expectNoAxeViolations(locked.container as HTMLElement, `${mode} disabled`);
	});
}
