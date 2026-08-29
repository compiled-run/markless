import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import DisabledRow from './scenarios/disabled-row.tsrx';
import Gallery from './scenarios/gallery.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import Prepicked from './scenarios/prepicked.tsrx';
import RowsFromData from './scenarios/rows-from-data.tsrx';
import Selectable from './scenarios/selectable.tsrx';
import TwoGrids from './scenarios/two-grids.tsrx';
import Typeahead from './scenarios/typeahead.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithWidgets from './scenarios/with-widgets.tsrx';
import Wrap from './scenarios/wrap.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const ReadmeItem = page.getByTestId('readme-item');
const LicenseItem = page.getByTestId('license-item');
const ChangelogItem = page.getByTestId('changelog-item');
const NoticeItem = page.getByTestId('notice-item');
const ReadmeLabel = page.getByTestId('readme-itemlabel');
const ReadmeIndicator = page.getByTestId('readme-itemindicator');
const LicenseIndicator = page.getByTestId('license-itemindicator');
const ReadmeRename = page.getByTestId('readme-rename');
const ReadmeDelete = page.getByTestId('readme-delete');
const LicenseRename = page.getByTestId('license-rename');
const Pressed = page.getByTestId('pressed');
const Picked = page.getByTestId('picked');
const Calls = page.getByTestId('calls');
const OneItem = page.getByTestId('one-item');
const TwoItem = page.getByTestId('two-item');
const ThreeItem = page.getByTestId('three-item');
const FourItem = page.getByTestId('four-item');
const FiveItem = page.getByTestId('five-item');
const AppleItem = page.getByTestId('apple-item');
const BananaItem = page.getByTestId('banana-item');
const BlueberryItem = page.getByTestId('blueberry-item');
const CherryItem = page.getByTestId('cherry-item');
const LeftRoot = page.getByTestId('left-root');
const LeftIndexItem = page.getByTestId('left-index-item');
const LeftAppItem = page.getByTestId('left-app-item');
const RightIntroItem = page.getByTestId('right-intro-item');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function rows(root: Element) {
	return Array.from(root.querySelectorAll<HTMLElement>('[role="row"]'));
}

function expectStarterRendered() {
	expect(el(Root).getAttribute('role')).toBe('grid');
	// The grid is the list's one tab stop until focus has been inside it.
	expect(el(Root).getAttribute('tabindex')).toBe('0');
	expect(el(Label).textContent).toBe('Files');
	expect(el(Root).getAttribute('aria-labelledby')).toBe(el(Label).getAttribute('id'));
	// Nothing can be picked here, so no row claims to be unpicked and the grid
	// says nothing about how many rows may be picked at once.
	expect(el(Root).hasAttribute('ui-selectable')).toBe(false);
	expect(el(Root).hasAttribute('aria-multiselectable')).toBe(false);

	for (const item of [el(ReadmeItem), el(LicenseItem), el(ChangelogItem)]) {
		expect(item.getAttribute('role')).toBe('row');
		expect(item.getAttribute('tabindex')).toBe('-1');
		expect(item.hasAttribute('aria-selected')).toBe(false);
		expect(item.getAttribute('aria-disabled')).toBe('false');
		expect(item.hasAttribute('ui-selected')).toBe(false);
	}
	expect(el(ReadmeItem).getAttribute('ui-value')).toBe('readme');
	// ARIA gives a row no meaning without a cell in it.
	expect(rows(el(Root)).length).toBe(3);
	expect(el(ReadmeItem).querySelector('[role="gridcell"]')).not.toBeNull();
	// The identity a row carries is not repeated as a `data-*` attribute anywhere.
	expect(el(ReadmeItem).hasAttribute('data-value')).toBe(false);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named grid of rows`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectStarterRendered();
	});

	test(`${mode}: a selectable list reports every row as not picked`, async () => {
		if (mode === 'CSR') await render(Selectable);
		else await renderSSR(Selectable);
		expect(el(Root).getAttribute('ui-selectable')).toBe('');
		expect(el(Root).hasAttribute('aria-multiselectable')).toBe(false);
		expect(el(ReadmeItem).getAttribute('aria-selected')).toBe('false');
		// The mark is the row's state painted again, so it is kept out of the
		// accessibility tree rather than announced twice.
		expect(el(ReadmeIndicator).getAttribute('aria-hidden')).toBe('true');
		expect(el(ReadmeIndicator).hasAttribute('ui-selected')).toBe(false);
	});

	test(`${mode}: writing multiple is enough to make a list selectable`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);
		expect(el(Root).getAttribute('ui-multiple')).toBe('');
		expect(el(Root).getAttribute('ui-selectable')).toBe('');
		expect(el(Root).getAttribute('aria-multiselectable')).toBe('true');
	});

	test(`${mode}: rows written picked render picked`, async () => {
		if (mode === 'CSR') await render(Prepicked);
		else await renderSSR(Prepicked);
		expect(el(ReadmeItem).getAttribute('aria-selected')).toBe('true');
		expect(el(ReadmeItem).getAttribute('ui-selected')).toBe('');
		expect(el(ReadmeIndicator).getAttribute('ui-selected')).toBe('');
		expect(el(ChangelogItem).getAttribute('aria-selected')).toBe('true');
		expect(el(LicenseItem).getAttribute('aria-selected')).toBe('false');
		expect(el(LicenseIndicator).hasAttribute('ui-selected')).toBe(false);
	});

	test(`${mode}: a list nobody may use leaves the tab order and disables its controls`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expect(el(Root).getAttribute('tabindex')).toBe('-1');
		expect(el(Root).getAttribute('aria-disabled')).toBe('true');
		expect(el(Root).getAttribute('ui-disabled')).toBe('');
		expect(el(ReadmeItem).getAttribute('aria-disabled')).toBe('true');
		expect(el(ReadmeItem).getAttribute('ui-disabled')).toBe('');
		expect(el<HTMLButtonElement>(ReadmeRename).disabled).toBe(true);
	});

	test(`${mode}: a control a row holds is out of the tab order`, async () => {
		if (mode === 'CSR') await render(WithWidgets);
		else await renderSSR(WithWidgets);
		expect(el(ReadmeRename).getAttribute('type')).toBe('button');
		expect(el(ReadmeRename).getAttribute('tabindex')).toBe('-1');
		expect(el(ReadmeDelete).getAttribute('tabindex')).toBe('-1');
	});

	test(`${mode}: rows from a keyed loop over data render`, async () => {
		if (mode === 'CSR') await render(RowsFromData);
		else await renderSSR(RowsFromData);
		const files = page.getByTestId('file-item').elements();
		expect(files).toHaveLength(3);
		expect(files[0]?.getAttribute('role')).toBe('row');
		expect(files[0]?.getAttribute('ui-value')).toBe('readme');
		expect(files[2]?.textContent).toContain('CHANGELOG.md');
	});
}

test('CSR: focus reaching the grid lands on the first row', async () => {
	await render(Basic);
	el(Root).focus();

	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	// Roving: the grid gives up its tab stop to the row that has focus.
	await expect.poll(() => el(Root).getAttribute('tabindex')).toBe('-1');
	await expect.poll(() => el(ReadmeItem).getAttribute('tabindex')).toBe('0');
	await expect.poll(() => el(LicenseItem).getAttribute('tabindex')).toBe('-1');
});

test('CSR: focus reaching the grid again lands on the row it left', async () => {
	await render(Basic);
	el(LicenseItem).focus();
	await expect.poll(() => el(LicenseItem).getAttribute('tabindex')).toBe('0');

	el<HTMLElement>(Root).blur();
	el(Root).focus();
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
});

test('CSR: ArrowDown and ArrowUp walk the rows and stop at the ends', async () => {
	await render(Basic);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogItem));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogItem));

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
});

test('CSR: Home and End jump to the ends of the list', async () => {
	await render(Basic);
	el(LicenseItem).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogItem));
	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
});

test('CSR: a walk off the end comes back round when the list wraps', async () => {
	await render(Wrap);
	el(LicenseItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
});

test('CSR: the walk steps over a row nobody may reach', async () => {
	await render(DisabledRow);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogItem));
	expect(document.activeElement).not.toBe(el(LicenseItem));
});

/**
 * The claim that the move is measured rather than counted: in a three-column
 * gallery the row below card Two is card Five, which is three places further on
 * in document order, and the row to the right of the last card in a visual row
 * is the first card of the next one.
 */
test('CSR: a wrapped gallery walks by where the cards are, not by the order they were written', async () => {
	await render(Gallery);
	el(TwoItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(FiveItem));
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(TwoItem));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(OneItem));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(TwoItem));

	// Off the end of a visual row: nothing lines up to the right, so the walk
	// falls through to the next card written, which is the first of the row below.
	el(ThreeItem).focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(FourItem));
});

test('CSR: a press picks a row, and a second press lets it go', async () => {
	await render(Selectable);
	el(ReadmeLabel).click();

	await expect.poll(() => el(ReadmeItem).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el(ReadmeIndicator).getAttribute('ui-selected')).toBe('');

	el(ReadmeLabel).click();
	await expect.poll(() => el(ReadmeItem).getAttribute('aria-selected')).toBe('false');
});

test('CSR: picking a second row in a single-selection list replaces the first', async () => {
	await render(Selectable);
	el(ReadmeItem).click();
	await expect.poll(() => el(ReadmeItem).getAttribute('aria-selected')).toBe('true');

	el(LicenseItem).click();
	await expect.poll(() => el(LicenseItem).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el(ReadmeItem).getAttribute('aria-selected')).toBe('false');
});

test('CSR: Space picks the row that has focus', async () => {
	await render(Selectable);
	el(ReadmeItem).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');
	await userEvent.keyboard(' ');
	await expect.poll(() => el(ReadmeItem).hasAttribute('ui-selected')).toBe(false);
});

test('CSR: a list that picks several keeps them all', async () => {
	await render(Multiple);
	el(ReadmeItem).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
	await userEvent.keyboard(' ');

	await expect.poll(() => el(LicenseItem).getAttribute('ui-selected')).toBe('');
	expect(el(ReadmeItem).getAttribute('ui-selected')).toBe('');
});

test('CSR: Escape lets go of everything that was picked', async () => {
	await render(Multiple);
	el(ReadmeItem).focus();
	await userEvent.keyboard(' ');
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(ReadmeItem).hasAttribute('ui-selected')).toBe(false);
});

test('CSR: Control+A picks every row of a list that takes several', async () => {
	await render(Multiple);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{Control>}a{/Control}');
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(LicenseItem).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(ChangelogItem).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(NoticeItem).getAttribute('ui-selected')).toBe('');
});

/**
 * A Shift walk replaces the run it measures from its anchor rather than growing
 * one, so walking back towards the anchor shrinks what is picked - the
 * behaviour a person expects from every file browser.
 */
test('CSR: a Shift walk picks the run from the row it started on', async () => {
	await render(Multiple);
	el(ReadmeItem).focus();
	await userEvent.keyboard(' ');

	await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
	await expect.poll(() => el(LicenseItem).getAttribute('ui-selected')).toBe('');
	await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
	await expect.poll(() => el(ChangelogItem).getAttribute('ui-selected')).toBe('');

	await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
	await expect.poll(() => el(ChangelogItem).hasAttribute('ui-selected')).toBe(false);
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(LicenseItem).getAttribute('ui-selected')).toBe('');
});

test('CSR: a Shift walk in a list that picks one row at a time only moves focus', async () => {
	await render(Selectable);
	el(ReadmeItem).focus();
	await userEvent.keyboard(' ');

	await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
	await expect.poll(() => el(LicenseItem).hasAttribute('ui-selected')).toBe(false);
	expect(el(ReadmeItem).getAttribute('ui-selected')).toBe('');
});

test('CSR: the consumer hears about a pick once, with the whole picked set', async () => {
	await render(WithOnChange);
	el(ReadmeItem).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(Picked).textContent).toBe('readme');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard('{ArrowDown}');
	await userEvent.keyboard(' ');
	await expect.poll(() => el(Picked).textContent).toBe('readme license');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: a walk that picks nothing new never reaches the consumer', async () => {
	await render(WithOnChange);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await userEvent.keyboard('{ArrowUp}');
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(el(Calls).textContent).toBe('0');
});

/** The APG's own entry into a cell's widgets, and the reason they are out of the tab order. */
test('CSR: Enter moves focus into the controls a row holds and Escape brings it back', async () => {
	await render(WithWidgets);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeRename));
	await expect.poll(() => el(Root).getAttribute('ui-inside')).toBe('');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeDelete));
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeRename));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	await expect.poll(() => el(Root).hasAttribute('ui-inside')).toBe(false);
});

test('CSR: F2 opens the row the same way Enter does', async () => {
	await render(WithWidgets);
	el(LicenseItem).focus();

	await userEvent.keyboard('{F2}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseRename));
});

test('CSR: the arrows walk the list again once focus is back on the row', async () => {
	await render(WithWidgets);
	el(ReadmeItem).focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeRename));
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
});

test('CSR: Enter on a row holding no controls moves focus nowhere', async () => {
	await render(WithWidgets);
	el(ChangelogItem).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogItem));
	expect(el(Root).hasAttribute('ui-inside')).toBe(false);
});

// A control the row holds is the consumer's, and pressing it is not a pick.
test('CSR: pressing a control inside a row does not pick the row', async () => {
	await render(WithWidgets);
	el(ReadmeRename).click();

	await expect.poll(() => el(Pressed).textContent).toBe('readme-rename');
	expect(el(ReadmeItem).hasAttribute('ui-selected')).toBe(false);
});

test('CSR: a letter walks to the next row that starts with it', async () => {
	await render(Typeahead);
	el(AppleItem).focus();

	await userEvent.keyboard('c');
	await expect.poll(() => document.activeElement).toBe(el(CherryItem));
});

// `b` alone is ambiguous between Banana and Blueberry, so it lands on the first.
test('CSR: one letter walks to the first row that starts with it', async () => {
	await render(Typeahead);
	el(AppleItem).focus();

	await userEvent.keyboard('b');
	await expect.poll(() => document.activeElement).toBe(el(BananaItem));
});

// A second letter grows the buffer rather than starting again, so `bl` narrows.
// Each row renders afresh: the buffer outlives one keystroke by design, and a
// row that reused a mounted list would be searching for `blb`.
test('CSR: typing more than one letter narrows to the row that spells it', async () => {
	await render(Typeahead);
	el(AppleItem).focus();

	await userEvent.keyboard('bl');
	await expect.poll(() => document.activeElement).toBe(el(BlueberryItem));
});

test('CSR: two lists on one page keep their own focus and their own picked rows', async () => {
	await render(TwoGrids);
	el(LeftIndexItem).focus();
	await userEvent.keyboard(' ');
	await expect.poll(() => el(LeftIndexItem).getAttribute('ui-selected')).toBe('');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LeftAppItem));
	expect(document.activeElement).not.toBe(el(RightIntroItem));
	expect(el(RightIntroItem).hasAttribute('ui-selected')).toBe(false);
	expect(el(LeftRoot).getAttribute('role')).toBe('grid');
});
