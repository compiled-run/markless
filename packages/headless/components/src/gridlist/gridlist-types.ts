import type { PropsOf } from '@markless/core';

/**
 * A list of rich items - a card gallery, a file browser - where a row may hold
 * controls of its own. It is the grid itself and the home of what is picked: put
 * a `gridlist.label` and as many `gridlist.item` rows as the page needs inside
 * it.
 *
 * A plain list cannot hold a button a keyboard can reach, which is the whole
 * reason this family exists. Focus rests on one row at a time; the arrows move
 * between rows, `Enter` moves into the controls that row holds, and `Escape`
 * brings focus back out to the row.
 *
 * The move between rows is measured rather than counted, so the same list works
 * stacked in one column and wrapped across a gallery: a row's neighbour upwards
 * is the row whose box sits above it in the same column, not simply the row
 * written before it.
 *
 * It reports `ui-selectable`, `ui-multiple`, `ui-disabled` and `ui-inside` for
 * styling.
 */
export type GridListRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The rows that are picked, named by the `value` each `gridlist.item` was
	 * written with. Omit it and nothing starts picked.
	 */
	readonly value?: readonly string[];
	/**
	 * Rows can be picked, one at a time. Picking a row that is already picked
	 * lets it go.
	 */
	readonly selectable?: boolean;
	/** Several rows can be picked at once. Writing it also makes the list selectable. */
	readonly multiple?: boolean;
	/** No row can be reached or picked, and the list drops out of the tab order. */
	readonly disabled?: boolean;
	/**
	 * A walk off the last row comes back round to the first. Omit it and the walk
	 * stops at the ends, which is what a list of files behaves like.
	 */
	readonly wrap?: boolean;
	/**
	 * Called with the rows that are picked whenever that changes. Omit it and the
	 * list still works; the call site simply does nothing.
	 */
	readonly onChange?: (value: readonly string[]) => void;
};

/** What `gridlist.root` hands the grid element it renders: everything it was given. */
export type GridListGridProps = PropsOf<'div'>;

/**
 * The list's name: the element `role="grid"` points its `aria-labelledby` at.
 * A grid has no single control for a `for` to point at, so the name is carried
 * by the IDREF.
 */
export type GridListLabelProps = PropsOf<'span'>;

/**
 * One row. It is the thing focus rests on and the thing that gets picked, so it
 * carries the row's own identity as `value` - the string that appears in the
 * root's `value` array while this row is picked.
 *
 * A row reports `ui-selected` and `ui-disabled`, and carries `aria-selected`
 * for as long as the list is selectable at all.
 */
export type GridListItemProps = PropsOf<'div'> & {
	/** This row's identity in the picked set. Two rows must not share one. */
	readonly value: string;
	/** This row cannot be reached by the walk or picked. */
	readonly disabled?: boolean;
};

/**
 * The cell a row's content sits in. ARIA gives a row no meaning without one, so
 * every `gridlist.item` holds at least this part; a list of rich items has one
 * logical column, so it holds exactly one.
 */
export type GridListItemContentProps = PropsOf<'div'>;

/**
 * The row's own words. Typeahead matches against this part when a row has one
 * and against everything the row reads when it does not, so a row carrying a
 * date and a file size still answers to the file's name.
 */
export type GridListItemLabelProps = PropsOf<'span'>;

/**
 * A control the row holds - a rename button, an overflow menu. It is out of the
 * tab order because the row is the tab stop: `Enter` on the row moves focus to
 * the first of these, the arrows step between them, and `Escape` returns focus
 * to the row.
 *
 * The walk only knows the controls written as this part. A bare `<button>`
 * dropped into a row is still reachable by `Tab`, but `Enter` on the row will
 * not find it.
 */
export type GridListItemTriggerProps = PropsOf<'button'>;

/**
 * A mark showing that this row is picked. It is hidden from readers on purpose:
 * the row already carries `aria-selected`, and a second announcement of the same
 * fact is noise. It reports `ui-selected`.
 */
export type GridListItemIndicatorProps = PropsOf<'span'>;

/**
 * The graph cells every gridlist part reads and writes.
 *
 * `anchor` is the row a Shift walk measures its run from, and `typed`/`typedAt`
 * are the typeahead buffer and the clock reading that ages it - text and a
 * number rather than a timer, so a resumed page has nothing outstanding.
 *
 * `inside` is true while focus sits on a control a row holds rather than on the
 * row: the arrows belong to that control for as long as it does.
 */
export type GridListInstanceState = {
	value: readonly string[];
	selectable: boolean;
	multiple: boolean;
	disabled: boolean;
	wrap: boolean;
	inside: boolean;
	anchor: string;
	typed: string;
	typedAt: number;
	onChange?: GridListRootProps['onChange'];
};

/** One row's own cells, rooted by `gridlist.item`. */
export type GridListItemInstanceState = {
	value: string;
	disabled: boolean;
};
