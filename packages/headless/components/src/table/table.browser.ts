import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Cells from './scenarios/cells.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import PickedCells from './scenarios/picked-cells.tsrx';
import Prepicked from './scenarios/prepicked.tsrx';
import RowModel from './scenarios/row-model.tsrx';
import Selectable from './scenarios/selectable.tsrx';
import Sortable from './scenarios/sortable.tsrx';
import TwoTables from './scenarios/two-tables.tsrx';

const Root = page.getByTestId('root');
const Caption = page.getByTestId('caption');
const NameHeader = page.getByTestId('name-header');
const SizeHeader = page.getByTestId('size-header');
const ChangedHeader = page.getByTestId('changed-header');
const ReadmeItem = page.getByTestId('readme-item');
const LicenseItem = page.getByTestId('license-item');
const ChangelogItem = page.getByTestId('changelog-item');
const NoticeItem = page.getByTestId('notice-item');
const ReadmeName = page.getByTestId('readme-name');
const ReadmeSize = page.getByTestId('readme-size');
const ReadmeChanged = page.getByTestId('readme-changed');
const LicenseName = page.getByTestId('license-name');
const LicenseSize = page.getByTestId('license-size');
const ChangelogName = page.getByTestId('changelog-name');
const ChangelogSize = page.getByTestId('changelog-size');
const ReadmeField = page.getByTestId('readme-rowfield');
const LicenseField = page.getByTestId('license-rowfield');
const Picked = page.getByTestId('picked');
const Calls = page.getByTestId('calls');
const Column = page.getByTestId('column');
const Selection = page.getByTestId('selection');
const HeaderRow = page.getByTestId('header-row');
const LeftRoot = page.getByTestId('left-root');
const LeftIndexName = page.getByTestId('left-index-name');
const LeftAppName = page.getByTestId('left-app-name');
const RightIntroItem = page.getByTestId('right-intro-item');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

for (const mode of MODES) {
	/**
	 * Rung 1 of the ladder, and the claim the whole family is built around: a
	 * table nobody has configured is a plain HTML table. No role - not `grid`, not
	 * `table` - no tab stop, and no ARIA written over what the elements already
	 * mean.
	 */
	test(`${mode}: a bare table writes no role and nothing else`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el(Root).tagName).toBe('TABLE');
		expect(el(Root).hasAttribute('role')).toBe(false);
		expect(el(Root).hasAttribute('tabindex')).toBe(false);
		expect(el(Root).hasAttribute('aria-multiselectable')).toBe(false);
		expect(el(Root).hasAttribute('aria-disabled')).toBe(false);
		expect(el(Root).hasAttribute('ui-selectable')).toBe(false);
		expect(el(Root).hasAttribute('ui-celled')).toBe(false);
		// The name is the consumer's own caption, which needs no part.
		expect(el(Caption).tagName).toBe('CAPTION');
		expect(el(Caption).textContent).toBe('Files');

		for (const row of [el(ReadmeItem), el(LicenseItem), el(ChangelogItem)]) {
			expect(row.tagName).toBe('TR');
			expect(row.hasAttribute('role')).toBe(false);
			expect(row.hasAttribute('tabindex')).toBe(false);
			expect(row.hasAttribute('aria-selected')).toBe(false);
			expect(row.hasAttribute('aria-disabled')).toBe(false);
		}
		// The identity a row carries is not repeated as a `data-*` attribute anywhere.
		expect(el(ReadmeItem).getAttribute('ui-value')).toBe('readme');
		expect(el(ReadmeItem).hasAttribute('data-value')).toBe(false);
		// A header the consumer wrote plainly stays plain.
		expect(el(NameHeader).tagName).toBe('TH');
		expect(el(NameHeader).hasAttribute('role')).toBe(false);
	});

	/**
	 * Rung 2: sortable headers arrive by swapping one element for a part. The
	 * table is still not a grid - sorting a read-only table is not focus
	 * management, and the role would be a promise the family is not keeping.
	 */
	test(`${mode}: a sortable header carries aria-sort without making the table a grid`, async () => {
		if (mode === 'CSR') await render(Sortable);
		else await renderSSR(Sortable);

		expect(el(Root).hasAttribute('role')).toBe(false);
		expect(el(SizeHeader).tagName).toBe('TH');
		expect(el(SizeHeader).getAttribute('role')).toBe('columnheader');
		expect(el(SizeHeader).getAttribute('tabindex')).toBe('0');
		expect(el(SizeHeader).getAttribute('ui-value')).toBe('size');
		expect(el(SizeHeader).getAttribute('aria-sort')).toBe('descending');
		expect(el(SizeHeader).getAttribute('ui-sorted')).toBe('');
		// Every sortable column says so, including the ones not currently sorted.
		expect(el(ChangedHeader).getAttribute('aria-sort')).toBe('none');
		expect(el(ChangedHeader).hasAttribute('ui-sorted')).toBe(false);
		// A column that cannot be sorted carries nothing at all.
		expect(el(NameHeader).hasAttribute('aria-sort')).toBe(false);
		expect(el(NameHeader).hasAttribute('tabindex')).toBe(false);
	});

	test(`${mode}: somewhere to put the picked set is what makes the rows selectable`, async () => {
		if (mode === 'CSR') await render(Selectable);
		else await renderSSR(Selectable);

		expect(el(Root).getAttribute('role')).toBe('grid');
		expect(el(Root).getAttribute('tabindex')).toBe('0');
		expect(el(Root).getAttribute('ui-selectable')).toBe('');
		expect(el(Root).hasAttribute('aria-multiselectable')).toBe(false);
		expect(el(ReadmeItem).getAttribute('role')).toBe('row');
		expect(el(ReadmeItem).getAttribute('tabindex')).toBe('-1');
		expect(el(ReadmeItem).getAttribute('aria-selected')).toBe('false');
	});

	test(`${mode}: writing multiple is enough, and the table says so`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);

		expect(el(Root).getAttribute('ui-multiple')).toBe('');
		expect(el(Root).getAttribute('ui-selectable')).toBe('');
		expect(el(Root).getAttribute('aria-multiselectable')).toBe('true');
	});

	test(`${mode}: rows written picked render picked, and a form carries them`, async () => {
		if (mode === 'CSR') await render(Prepicked);
		else await renderSSR(Prepicked);

		expect(el(ReadmeItem).getAttribute('aria-selected')).toBe('true');
		expect(el(ReadmeItem).getAttribute('ui-selected')).toBe('');
		expect(el(ChangelogItem).getAttribute('aria-selected')).toBe('true');
		expect(el(LicenseItem).getAttribute('aria-selected')).toBe('false');
		expect(el(LicenseItem).hasAttribute('ui-selected')).toBe(false);

		// The field is the form's channel and nothing else: out of sight, out of the
		// tab order, and out of the accessibility tree, because the row already
		// says whether it is picked.
		expect(el<HTMLInputElement>(ReadmeField).type).toBe('checkbox');
		expect(el<HTMLInputElement>(ReadmeField).checked).toBe(true);
		expect(el<HTMLInputElement>(ReadmeField).value).toBe('readme');
		expect(el(ReadmeField).getAttribute('name')).toBe('files');
		expect(el(ReadmeField).getAttribute('aria-hidden')).toBe('true');
		expect(el(ReadmeField).getAttribute('tabindex')).toBe('-1');
		expect(el<HTMLInputElement>(LicenseField).checked).toBe(false);
	});

	/**
	 * Rung 4: mounting cells is the other way to earn the grid role. Nothing here
	 * passes a selection prop, and the table is a grid because the family is now
	 * the owner of focus.
	 */
	test(`${mode}: cells make the table a grid and each cell a focus stop`, async () => {
		if (mode === 'CSR') await render(Cells);
		else await renderSSR(Cells);

		expect(el(Root).getAttribute('role')).toBe('grid');
		expect(el(Root).getAttribute('ui-celled')).toBe('');
		expect(el(Root).getAttribute('tabindex')).toBe('0');
		expect(el(Root).hasAttribute('ui-selectable')).toBe(false);

		expect(el(ReadmeSize).tagName).toBe('TD');
		expect(el(ReadmeSize).getAttribute('role')).toBe('gridcell');
		expect(el(ReadmeSize).getAttribute('tabindex')).toBe('-1');
		// The cell that names its row is a header cell, not a data cell.
		expect(el(ReadmeName).tagName).toBe('TH');
		expect(el(ReadmeName).getAttribute('role')).toBe('rowheader');
		expect(el(ReadmeName).getAttribute('tabindex')).toBe('-1');
		expect(el(ReadmeItem).getAttribute('role')).toBe('row');
	});

	test(`${mode}: a table nobody may use leaves the tab order`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);

		expect(el(Root).getAttribute('tabindex')).toBe('-1');
		expect(el(Root).getAttribute('aria-disabled')).toBe('true');
		expect(el(Root).getAttribute('ui-disabled')).toBe('');
		expect(el(ReadmeItem).getAttribute('aria-disabled')).toBe('true');
		expect(el(ReadmeItem).getAttribute('ui-disabled')).toBe('');
	});

	/** The charter's acceptance test: a row model drives the family with no adapter. */
	test(`${mode}: a row model renders its headers, its rows and its cells`, async () => {
		if (mode === 'CSR') await render(RowModel);
		else await renderSSR(RowModel);

		const sortable = page.getByTestId('sortable-header').elements();
		const plain = page.getByTestId('plain-header').elements();
		const items = page.getByTestId('model-item').elements();
		const cells = page.getByTestId('model-cell').elements();

		// Which parts a column gets is the page's own `@if` over the model, so
		// sortability is which element it renders rather than a prop.
		expect(sortable).toHaveLength(2);
		expect(plain).toHaveLength(1);
		expect(sortable[0]?.getAttribute('ui-value')).toBe('size');
		expect(sortable[0]?.getAttribute('aria-sort')).toBe('ascending');
		expect(sortable[1]?.getAttribute('aria-sort')).toBe('none');
		expect(el(HeaderRow).children.length).toBe(3);

		expect(items).toHaveLength(3);
		expect(items[0]?.getAttribute('ui-value')).toBe('readme');
		expect(cells).toHaveLength(9);
		expect(cells[0]?.getAttribute('role')).toBe('rowheader');
		expect(cells[1]?.getAttribute('role')).toBe('gridcell');
		expect(el(Root).getAttribute('role')).toBe('grid');
	});
}

test('CSR: focus reaching the table lands on the first cell', async () => {
	await render(Cells);
	el(Root).focus();

	await expect.poll(() => document.activeElement).toBe(el(ReadmeName));
	// Roving: the table gives up its tab stop to the cell that has focus.
	await expect.poll(() => el(Root).getAttribute('tabindex')).toBe('-1');
	await expect.poll(() => el(ReadmeName).getAttribute('tabindex')).toBe('0');
	await expect.poll(() => el(ReadmeSize).getAttribute('tabindex')).toBe('-1');
});

test('CSR: focus reaching the table again lands on the cell it left', async () => {
	await render(Cells);
	el(LicenseSize).focus();
	await expect.poll(() => el(LicenseSize).getAttribute('tabindex')).toBe('0');

	el<HTMLElement>(Root).blur();
	el(Root).focus();
	await expect.poll(() => document.activeElement).toBe(el(LicenseSize));
});

test('CSR: the arrows walk a row cell by cell and stop at its ends', async () => {
	await render(Cells);
	el(ReadmeName).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeSize));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeChanged));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeChanged));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeSize));
});

// The second axis: a cell's column is where it sits among its own row's cells,
// so a vertical move needs no coordinate from anybody.
test('CSR: the arrows walk down a column and stay in it', async () => {
	await render(Cells);
	el(ReadmeSize).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseSize));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogSize));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogSize));

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseSize));
});

test('CSR: Home and End go to the ends of the row, and with Control to the corners', async () => {
	await render(Cells);
	el(LicenseSize).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseName).parentElement?.lastElementChild);
	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseName));

	await userEvent.keyboard('{Control>}{End}{/Control}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogName).parentElement?.lastElementChild);
	await userEvent.keyboard('{Control>}{Home}{/Control}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeName));
});

test('CSR: the space bar picks the row the focused cell sits in', async () => {
	await render(PickedCells);
	el(ReadmeSize).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(Picked).textContent).toBe('readme');

	await userEvent.keyboard(' ');
	await expect.poll(() => el(ReadmeItem).hasAttribute('ui-selected')).toBe(false);
});

/**
 * A Shift walk replaces the run it measures from its anchor rather than growing
 * one, so walking back towards the anchor shrinks what is picked.
 */
test('CSR: a Shift walk picks the run of rows it started from', async () => {
	await render(PickedCells);
	el(ReadmeName).focus();
	await userEvent.keyboard(' ');

	await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
	await expect.poll(() => el(LicenseItem).getAttribute('ui-selected')).toBe('');
	await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
	await expect.poll(() => el(ChangelogItem).getAttribute('ui-selected')).toBe('');

	await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
	await expect.poll(() => el(ChangelogItem).hasAttribute('ui-selected')).toBe(false);
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');
});

test('CSR: Control+A picks every row and Escape lets go of them', async () => {
	await render(PickedCells);
	el(ReadmeName).focus();

	await userEvent.keyboard('{Control>}a{/Control}');
	await expect.poll(() => el(ReadmeItem).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(LicenseItem).getAttribute('ui-selected')).toBe('');
	await expect.poll(() => el(ChangelogItem).getAttribute('ui-selected')).toBe('');

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(ReadmeItem).hasAttribute('ui-selected')).toBe(false);
});

test('CSR: a letter walks to the next row whose words start with it', async () => {
	await render(Cells);
	el(ReadmeName).focus();

	await userEvent.keyboard('l');
	await expect.poll(() => document.activeElement).toBe(el(LicenseName));
});

test('CSR: the consumer hears about a pick once, with the whole picked set', async () => {
	await render(Multiple);
	el(ReadmeItem).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(Picked).textContent).toBe('readme');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
	await userEvent.keyboard(' ');
	await expect.poll(() => el(Picked).textContent).toBe('readme license');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: a walk that picks nothing new never reaches the consumer', async () => {
	await render(Multiple);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await userEvent.keyboard('{ArrowUp}');
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(el(Calls).textContent).toBe('0');
});

// Selection with no cells: the rows themselves are the focus stops, which is the
// rung between a plain table and a grid of cells.
test('CSR: rows are the focus stops when there are no cells', async () => {
	await render(Multiple);
	el(Root).focus();

	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LicenseItem));
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(NoticeItem));
});

test('CSR: pressing a sortable header reports its column, and nothing else', async () => {
	await render(Sortable);
	el(SizeHeader).click();

	await expect.poll(() => el(Column).textContent).toBe('size');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	el(ChangedHeader).click();
	await expect.poll(() => el(Column).textContent).toBe('changed');
	await expect.poll(() => el(Calls).textContent).toBe('2');
	// The family sorted nothing: what the header now reads is still what it was given.
	expect(el(SizeHeader).getAttribute('aria-sort')).toBe('descending');
});

test('CSR: Enter and the space bar on a header report the column too', async () => {
	await render(Sortable);
	el(SizeHeader).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Column).textContent).toBe('size');
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard(' ');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

/** The acceptance test again, driven: plain data in, plain callbacks out. */
test('CSR: a row model gets the picked rows back as its own record shape', async () => {
	await render(RowModel);
	el(page.getByTestId('model-cell')).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(Selection).textContent).toBe('readme');
	await userEvent.keyboard('{ArrowDown}');
	await userEvent.keyboard(' ');
	await expect.poll(() => el(Selection).textContent).toBe('readme license');

	el(page.getByTestId('sortable-header')).click();
	await expect.poll(() => el(Column).textContent).toBe('size');
});

test('CSR: two tables on one page keep their own focus and their own picked rows', async () => {
	await render(TwoTables);
	el(LeftIndexName).focus();
	await userEvent.keyboard(' ');
	await expect.poll(() => el(page.getByTestId('left-index-item')).getAttribute('ui-selected')).toBe('');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(LeftAppName));
	expect(el(RightIntroItem).hasAttribute('ui-selected')).toBe(false);
	expect(el(LeftRoot).getAttribute('role')).toBe('grid');
});
