import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import { allOf, same, spanBetween, toggled } from '../gridlist/grid-select.ts';
import { isSearchKey, matchAt, nextSearch } from '../gridlist/grid-typeahead.ts';
import { ownParts, reachableRows, rowAt, rowValues } from '../gridlist/grid-walk.ts';
import { cellAt, reachableCells, rowText } from './table-walk.ts';
import type {
	TableItemContentBaseProps,
	TableColTriggerProps,
	TableGridProps,
	TableInstanceState,
	TableItemContentProps,
	TableItemFieldProps,
	TableItemInstanceState,
	TableItemProps,
	TableRootProps,
} from './table-types.ts';

// Every keystroke and every press is handled on the table: a handler declared on
// a row or a cell is matched as an event record and its symbol is never woken.
// One computed() cell per comparison - a comparison written inline in an
// attribute renders once and then goes stale.

export const tableState = shared(
	() => {
		const table: TableInstanceState = state({
			value: [] as readonly string[],
			selectable: false,
			multiple: false,
			disabled: false,
			column: '',
			direction: '' as '' | 'ascending' | 'descending',
			anchor: '',
			typed: '',
			typedAt: 0,
		});
		const tableEl = element<HTMLTableElement>();
		// The array type argument is what makes a handle plural: bound on every part
		// of its kind, read back as the live elements in document order. Walking them
		// is how the family reaches another part without ever looking one up.
		const rowEls = element<HTMLTableRowElement[]>();
		const cellEls = element<HTMLTableCellElement[]>();
		const headerEls = element<HTMLTableCellElement[]>();

		return {
			...table,
			tableEl,
			rowEls,
			cellEls,
			headerEls,
			// literal function types: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: readonly string[]) => void) | undefined,
			onSortChange: undefined as ((column: string) => void) | undefined,

			/**
			 * Say that a column's header was activated. It is a method rather than a
			 * callback read straight out of a handler: a shared member read as a value
			 * leaves the instance name standing in the handler's own module. Not
			 * `sort`: a member call spelled like an array's mutating method is read as
			 * a write to the instance itself.
			 */
			sortBy(column: string) {
				if (table.disabled || column === '') return;
				table.onSortChange?.(column);
			},

			/** Settle on a set of rows, and say so only when it is a different set. */
			settle(after: readonly string[]) {
				if (table.disabled || table.selectable !== true) return;
				if (same(table.value, after)) return;
				table.value = after;
				table.onChange?.(after);
			},

			/** Pick one row, and make it the row a Shift walk measures from. */
			pick(value: string) {
				if (table.disabled || table.selectable !== true || value === '') return;
				table.anchor = value;
				const after = toggled(table.value, value, table.multiple === true);
				if (same(table.value, after)) return;
				table.value = after;
				table.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per row, rooted by `table.item`. */
export const tableItemState = shared(
	() => {
		const item: TableItemInstanceState = state({ value: '', disabled: false });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function TableRoot({
	value,
	multiple = false,
	disabled = false,
	sort,
	onChange,
	onSortChange,
	children,
	...rest
}: TableRootProps) @{
	const table = tableState();
	table.onChange = onChange;
	table.onSortChange = onSortChange;
	table.value = value ?? [];
	// No selection mode to choose: rows become selectable the moment the consumer
	// has somewhere to put the picked set, and `multiple` alone is enough.
	table.selectable = value !== undefined || onChange !== undefined || multiple === true;
	table.multiple = multiple;
	table.disabled = disabled;
	table.column = sort === undefined ? '' : sort.column;
	table.direction = sort === undefined ? '' : sort.direction;

	<TableGrid {...rest}>{children}</TableGrid>
}

// A separate part rather than the root's own element: a widget root cannot read
// its own instance token, so a handle only resolves one component deeper.
function TableGrid({ children, onClick, onFocusin, onKeydown, ...rest }: TableGridProps) @{
	const table = tableState();
	// The role is earned, not declared: a table nobody is steering keeps its native
	// semantics, and `grid` arrives with the focus management it obliges. What earns
	// it is the selection props alone - a root cannot see what its descendants
	// mounted, so a cells-only table stays a plain table (note.md, "Known gaps").
	const gridRole = computed(() => (table.selectable === true ? 'grid' : undefined));
	const ariaMulti = computed(() => (table.multiple === true ? 'true' : null));
	const ariaDisabled = computed(() => (table.disabled === true ? 'true' : null));
	// The table is the widget's only tab stop until focus lands inside it, so
	// Shift+Tab out of the first cell leaves the table.
	const tabStop = computed(() => {
		if (table.selectable !== true) return undefined;
		return table.disabled === true ? -1 : 0;
	});

	<table
		{...rest}
		el={table.tableEl}
		role={gridRole}
		tabindex={tabStop}
		aria-multiselectable={ariaMulti}
		aria-disabled={ariaDisabled}
		ui-selectable={table.selectable}
		ui-multiple={table.multiple}
		ui-disabled={table.disabled}
		onFocusin={(event) => {
			// `target`, not `currentTarget`: a lazy handler symbol runs after the native dispatch, when `currentTarget` is null.
			const target = event.target as HTMLElement;
			const root = table.tableEl;
			const rowEls = table.rowEls;
			const cellEls = table.cellEls;
			// A handler may ask the roster what is mounted; a derivation may not, which
			// is why the role above cannot use this and the walk below can.
			const celled = (cellEls?.length ?? 0) > 0;
			const steering = celled || table.selectable === true;
			if (root === undefined || !steering) {
				onFocusin?.(event);
				return;
			}

			const stops: HTMLElement[] = celled
				? reachableCells(rowEls, cellEls)
				: reachableRows(rowEls);

			if (target === root) {
				const remembered = stops.find((one) => one.getAttribute('tabindex') === '0');
				(remembered ?? stops[0])?.focus();
				onFocusin?.(event);
				return;
			}

			const landed = rowAt(stops, target);
			if (landed) {
				// Roving is written straight to the DOM: the table and its stops render
				// tabindex as literals, so nothing else moves it.
				root.setAttribute('tabindex', '-1');
				for (const one of stops) {
					one.setAttribute('tabindex', one === landed ? '0' : '-1');
				}
			}

			onFocusin?.(event);
		}}
		onClick={(event) => {
			const target = event.target as HTMLElement;
			const rowEls = table.rowEls;
			const headerEls = table.headerEls;

			const header = rowAt(headerEls, target);
			if (header !== null) {
				// The header reports that it was activated. What that should sort by next
				// is the consumer's policy, and the family computes none of it.
				table.sortBy(header.getAttribute('ui-value') ?? '');
				onClick?.(event);
				return;
			}

			const row = rowAt(rowEls, target);
			if (row !== null) table.pick(row.getAttribute('ui-value') ?? '');
			onClick?.(event);
		}}
		onKeydown={(event) => {
			// Written out from event fields alone: the policy has to be readable
			// before the handler symbol loads, and narrowing it to the rungs that
			// actually walk needs graph state, which is
			// MARKLESS_SYNC_POLICY_UNEXTRACTABLE. So a bare table holding a control
			// of the consumer's own loses the arrows and the space bar while focus
			// is inside it, which is the gap `gridlist` recorded first.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === ' '
			) {
				event.preventDefault();
			}
			if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
				event.preventDefault();
			}

			const key = event.key;
			const shift = event.shiftKey;
			const ctrl = event.ctrlKey;
			const meta = event.metaKey;
			const alt = event.altKey;
			const target = event.target as HTMLElement;
			// Read at the handler's top level: a shared read inside a closure below is a ReferenceError.
			const rowEls = table.rowEls;
			const cellEls = table.cellEls;
			const headerEls = table.headerEls;
			const celled = (cellEls?.length ?? 0) > 0;
			const isSelectable = table.selectable === true;
			const isMultiple = table.multiple === true;
			const anchor = table.anchor;
			const buffer = table.typed;
			const since = table.typedAt;

			if (table.disabled === true) {
				onKeydown?.(event);
				return;
			}

			// A sortable header is a control in its own right, in the tab order and
			// outside the walk: it answers Enter and Space and nothing else.
			const header = rowAt(headerEls, target);
			if (header !== null) {
				if (key === 'Enter' || key === ' ') {
					table.sortBy(header.getAttribute('ui-value') ?? '');
				}
				onKeydown?.(event);
				return;
			}

			const here = rowAt(rowEls, target);
			if (here === null || (!celled && !isSelectable)) {
				onKeydown?.(event);
				return;
			}

			const rows = reachableRows(rowEls);
			const at = rows.indexOf(here);
			const order = rowValues(rows);
			const held = here.getAttribute('ui-value') ?? '';
			const mine = ownParts(cellEls, here);
			const cell = rowAt(mine, target);
			const column = cell === null ? 0 : mine.indexOf(cell);
			const jump = ctrl || meta;
			let landing: HTMLElement | null = null;

			if (key === 'ArrowRight' && celled) landing = mine[column + 1] ?? null;
			else if (key === 'ArrowLeft' && celled) landing = mine[column - 1] ?? null;
			else if (key === 'ArrowDown') {
				const next = rows[at + 1];
				landing = celled ? cellAt(cellEls, next, column) : (next ?? null);
			} else if (key === 'ArrowUp') {
				const previous = rows[at - 1];
				landing = celled ? cellAt(cellEls, previous, column) : (previous ?? null);
			} else if (key === 'Home') {
				// Ctrl+Home is the top left of the whole table; Home alone is the start of this row.
				if (celled && !jump) landing = mine[0] ?? null;
				else if (celled) landing = cellAt(cellEls, rows[0], 0);
				else landing = rows[0] ?? null;
			} else if (key === 'End') {
				if (celled && !jump) landing = mine[mine.length - 1] ?? null;
				else if (celled) landing = cellAt(cellEls, rows[rows.length - 1], mine.length - 1);
				else landing = rows[rows.length - 1] ?? null;
			} else if (key === 'Escape') {
				table.anchor = '';
				table.settle([]);
			} else if (key === ' ') {
				// A cell is not selectable; the space bar picks the row the cell sits in.
				table.pick(held);
			} else if (jump && (key === 'a' || key === 'A') && isMultiple) {
				table.anchor = order[0] ?? '';
				table.settle(allOf(order));
			} else if (isSearchKey(key, ctrl, meta, alt)) {
				// The buffer is aged by a clock reading rather than by a timer, so a resumed page has nothing outstanding.
				const now = Date.now();
				const search = nextSearch(buffer, since, now, key);
				table.typed = search;
				table.typedAt = now;
				const found = rows[matchAt(rowText(rows), at, search)];
				landing = celled ? cellAt(cellEls, found, column) : (found ?? null);
			}

			if (landing !== null) {
				const arrivedRow = rowAt(rows, landing);
				const arrived = arrivedRow === null ? '' : (arrivedRow.getAttribute('ui-value') ?? '');
				// A Shift walk replaces the run from its anchor rather than growing one,
				// so walking back towards the anchor shrinks what is picked.
				if (shift && isSelectable && isMultiple && (key === 'ArrowDown' || key === 'ArrowUp')) {
					table.settle(spanBetween(order, anchor === '' ? held : anchor, arrived));
					if (anchor === '') table.anchor = held;
				}
				landing.focus();
			}

			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				/* A Shift walk and a Shift click both paint the page's own text
				   selection across the rows they cross, over the top of the selection
				   the table is actually reporting. */
				[ui-selectable] {
					-webkit-user-select: none;
					user-select: none;
				}
			}
		</style>
		{children}
	</table>
}

export function TableItem({ value, disabled = false, children, ...rest }: TableItemProps) @{
	const table = tableState();
	const item = tableItemState();
	item.value = value;
	item.disabled = disabled;

	const isSelected = computed(() => table.value.includes(item.value));
	const isDisabled = computed(() => table.disabled === true || item.disabled === true);
	// Absent rather than false while nothing can be picked: a row reporting it is
	// not selected in a table that has no selection has said something untrue, and
	// a plain table has no roles of its own to write over the native ones.
	const rowRole = computed(() => (table.selectable === true ? 'row' : undefined));
	const ariaSelected = computed(() =>
		table.selectable === true ? (table.value.includes(item.value) ? 'true' : 'false') : null,
	);
	const ariaDisabled = computed(() =>
		table.disabled === true || item.disabled === true ? 'true' : null,
	);
	// The table is the tab stop until focus lands inside, and the roving write moves it from there.
	const tabStop = computed(() => (table.selectable === true ? -1 : undefined));

	<tr
		{...rest}
		el={table.rowEls}
		role={rowRole}
		tabindex={tabStop}
		aria-selected={ariaSelected}
		aria-disabled={ariaDisabled}
		ui-value={item.value}
		ui-selected={isSelected}
		ui-disabled={isDisabled}
	>{children}</tr>
}

export function TableItemContent({ rowheader = false, children, ...rest }: TableItemContentProps) @{
	@if (rowheader) {
		<TableItemContentHeader {...rest}>{children}</TableItemContentHeader>
	} @else {
		<TableItemContentData {...rest}>{children}</TableItemContentData>
	}
}

// `gridcell` is only meaningful inside a grid, so it rides the same condition the
// root's role does: without it a `<td>` claiming to be a gridcell would be
// describing a container that is not one. The cell is a focus stop either way.
function TableItemContentData({ children, ...rest }: TableItemContentBaseProps) @{
	const table = tableState();
	const cellRole = computed(() => (table.selectable === true ? 'gridcell' : undefined));

	<td {...rest} el={table.cellEls} role={cellRole} tabindex={-1}>{children}</td>
}

function TableItemContentHeader({ children, ...rest }: TableItemContentBaseProps) @{
	const table = tableState();
	// Left off outside a grid the same way, where `<th>` in a body row already maps to it.
	const cellRole = computed(() => (table.selectable === true ? 'rowheader' : undefined));

	<th {...rest} el={table.cellEls} role={cellRole} tabindex={-1}>{children}</th>
}

export function TableColTrigger({ value, children, ...rest }: TableColTriggerProps) @{
	const table = tableState();
	const column = state({ value });

	// Every sortable column carries `aria-sort`, "none" for the ones that are not
	// currently sorted: a column that says nothing is a column that cannot be sorted.
	const ariaSort = computed(() =>
		table.column === column.value && table.direction !== '' ? table.direction : 'none',
	);
	const isSorted = computed(() => table.column === column.value && table.direction !== '');

	// No `scope`: the JSX type service ships no table attributes, so the header
	// roles are written outright and the native association is unavailable today.
	<th
		{...rest}
		el={table.headerEls}
		role="columnheader"
		tabindex={0}
		aria-sort={ariaSort}
		ui-value={column.value}
		ui-sorted={isSorted}
	>{children}</th>
}

export function TableItemField({ ...rest }: TableItemFieldProps) @{
	const table = tableState();
	const item = tableItemState();
	const isChecked = computed(() => table.value.includes(item.value));

	// Hidden from sight and from readers: the row already carries `aria-selected`,
	// and this exists only so a form submits what is picked.
	<VisuallyHidden>
		<input
			{...rest}
			type="checkbox"
			tabindex={-1}
			aria-hidden="true"
			value={item.value}
			checked={isChecked}
		/>
	</VisuallyHidden>
}
