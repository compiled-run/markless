import type { PropsOf } from '@markless/core';

/**
 * Which column a table is sorted by and which way, in ARIA's own words rather
 * than a library's `asc`/`desc`: `aria-sort` takes these verbatim.
 *
 * One column, not a list. Multi-column sort is data work, so a consumer who
 * needs it keeps their own array and passes the primary column in.
 */
export type TableSort = {
	readonly column: string;
	readonly direction: 'ascending' | 'descending';
};

/**
 * Tabular data where the columns are load-bearing: header association,
 * per-column sort, and a person who navigates in two directions.
 *
 * The family does no data work at all. Sorting, filtering, grouping and paging
 * are the consumer's `computed()`; what arrives here is the rows already in the
 * order they should read, plus which column that order came from. That is what
 * lets a table row model from a data library drive this family with nothing in
 * between: plain data in, plain callbacks out.
 *
 * It is progressive, and the ladder has four rungs. A bare `table.root` holding
 * the consumer's own `<caption>`, `<thead>`, `<tbody>` and `table.item` rows is
 * a plain HTML table: no role, no focus management, nothing to configure.
 * Swapping a `<th scope="col">` for a `table.coltrigger` makes that column
 * sortable. Passing `value`/`onChange`/`multiple` makes the rows selectable, and
 * that is what turns the table into a `role="grid"` carrying `row`, `gridcell`
 * and `rowheader`: the roles arrive exactly when the family is doing the focus
 * management they oblige. Wrapping the cells in `table.itemcontent` makes each
 * cell a focus stop and gives the table its second axis; on its own, with no
 * selection props, it writes no roles - see the family note for why the root
 * cannot see what its descendants mounted.
 *
 * `<thead>`, `<tbody>`, `<tfoot>`, the header row and `<caption>` need no parts.
 * They are the consumer's own elements, they already carry `rowgroup`, `row` and
 * the table's accessible name, and the family needs nothing from them.
 *
 * It reports `ui-selectable`, `ui-multiple` and `ui-disabled` for styling.
 */
export type TableRootProps = Omit<PropsOf<'table'>, 'onChange'> & {
	/**
	 * The rows that are picked, named by the `value` each `table.item` was written
	 * with. Writing it at all is what makes the rows selectable.
	 */
	readonly value?: readonly string[];
	/** Several rows can be picked at once, and the table says so with `aria-multiselectable`. */
	readonly multiple?: boolean;
	/** No row can be reached or picked, and the table drops out of the tab order. */
	readonly disabled?: boolean;
	/**
	 * Which column the rows are already sorted by. Omit it and every sortable
	 * header reads `aria-sort="none"`; the family never sorts anything itself.
	 */
	readonly sort?: TableSort;
	/**
	 * Called with the rows that are picked whenever that changes. Writing it is
	 * the other way to make the rows selectable.
	 */
	readonly onChange?: (value: readonly string[]) => void;
	/**
	 * Called with the column a `table.coltrigger` was activated for. It reports
	 * the press, not a direction: what the next sort should be depends on the
	 * consumer's own policy, and a family that computed it would pick a fight with
	 * every data library that computes it differently.
	 */
	readonly onSortChange?: (column: string) => void;
};

/** What `table.root` hands the table element it renders: everything it was given. */
export type TableGridProps = PropsOf<'table'>;

/**
 * One body row. It carries the row's own identity as `value` - the string that
 * appears in the root's `value` array while this row is picked. Position is
 * never identity, so the `value` is required.
 *
 * A row reports `ui-selected` and `ui-disabled`.
 */
export type TableItemProps = PropsOf<'tr'> & {
	/** This row's identity in the picked set. Two rows must not share one. */
	readonly value: string;
	/** This row cannot be reached by the walk or picked. */
	readonly disabled?: boolean;
};

/**
 * One cell, and the thing focus rests on once a table navigates in two
 * directions. A cell's column is where it sits among its own row's cells, so
 * nothing is ever told a coordinate.
 *
 * Mounting these gives the table its second axis: the arrows walk cell by cell
 * and column by column, Home and End reach the ends of a row and the corners of
 * the table, and the space bar picks the row the focused cell sits in. A table
 * that wants none of that writes plain `<td>` elements. Cells alone do not make
 * the table a grid - the selection props do, and only then do the cells carry
 * `gridcell` and `rowheader`.
 */
export type TableItemContentProps = PropsOf<'td'> & {
	/**
	 * This cell is what names its row: it renders `<th scope="row">` with
	 * `role="rowheader"` instead of a `<td>`. A reader announces it when it
	 * reaches the row.
	 */
	readonly rowheader?: boolean;
};

/** What the two shapes of `table.itemcontent` render: everything it was given. */
export type TableItemContentBaseProps = PropsOf<'td'>;

/**
 * A sortable column header. It is the `<th scope="col">` itself rather than a
 * button inside one, so `aria-sort` and the press sit on one element.
 *
 * A header that cannot be sorted needs no part at all: a plain `<th scope="col">`
 * already associates its column, and no library improves on `scope`.
 */
export type TableColTriggerProps = PropsOf<'th'> & {
	/** This column's name, as it appears in `sort.column` and in `onSortChange`. */
	readonly value: string;
};

/**
 * Carries one row's picked state into a form, and nothing else: it is hidden
 * from sight and from readers, because the row already says whether it is
 * picked. Give it a `name` and the form submits the picked rows under it.
 *
 * It goes inside a cell, never straight inside the row: a `<tr>` may only hold
 * cells, and the parser would lift anything else out of the table.
 */
export type TableItemFieldProps = PropsOf<'input'>;

/**
 * The graph cells every table part reads and writes. Everything here is written
 * by the root from its own props: nothing a descendant renders lands in it,
 * because a render-time write from a cell never reaches an attribute the root
 * has already rendered.
 *
 * `column` and `direction` are the sort descriptor flattened, empty when nothing
 * is sorted. `anchor` is the row a Shift walk measures its run from, and
 * `typed`/`typedAt` are the typeahead buffer and the clock reading that ages it.
 */
export type TableInstanceState = {
	value: readonly string[];
	selectable: boolean;
	multiple: boolean;
	disabled: boolean;
	column: string;
	direction: '' | 'ascending' | 'descending';
	anchor: string;
	typed: string;
	typedAt: number;
	onChange?: TableRootProps['onChange'];
	onSortChange?: TableRootProps['onSortChange'];
};

/** One row's own cells, rooted by `table.item`. */
export type TableItemInstanceState = {
	value: string;
	disabled: boolean;
};
