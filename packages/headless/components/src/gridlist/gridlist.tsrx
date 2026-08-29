import { computed, element, shared, state } from '@markless/core';
import { allOf, same, spanBetween, toggled } from './grid-select.ts';
import { isSearchKey, matchAt, nextSearch } from './grid-typeahead.ts';
import {
	heldBy,
	ownParts,
	reachableRows,
	rowAt,
	rowLabels,
	rowValues,
	spatialMove,
} from './grid-walk.ts';
import type {
	GridListGridProps,
	GridListInstanceState,
	GridListItemContentProps,
	GridListItemIndicatorProps,
	GridListItemInstanceState,
	GridListItemLabelProps,
	GridListItemProps,
	GridListItemTriggerProps,
	GridListLabelProps,
	GridListRootProps,
} from './gridlist-types.ts';

// Every keystroke and every press is handled on the grid: a handler declared on `gridlist.item` is matched as an event record and its symbol is never woken.
// One computed() cell per comparison - a comparison written inline in an attribute renders once and then goes stale.

export const gridlistState = shared(
	() => {
		const gridlist: GridListInstanceState = state({
			value: [] as readonly string[],
			selectable: false,
			multiple: false,
			disabled: false,
			wrap: false,
			inside: false,
			anchor: '',
			typed: '',
			typedAt: 0,
		});
		const gridEl = element<HTMLDivElement>();
		const labelEl = element<HTMLSpanElement>();
		// The array type argument is what makes a handle plural: bound on every part
		// of its kind, read back as the live elements in document order. Walking them
		// is how the family reaches another part without ever looking one up.
		const rowEls = element<HTMLDivElement[]>();
		const labelEls = element<HTMLSpanElement[]>();
		const triggerEls = element<HTMLButtonElement[]>();

		return {
			...gridlist,
			gridEl,
			labelEl,
			rowEls,
			labelEls,
			triggerEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: readonly string[]) => void) | undefined,

			/** Settle on a set of rows, and say so only when it is a different set. */
			settle(after: readonly string[]) {
				if (gridlist.disabled || gridlist.selectable !== true) return;
				if (same(gridlist.value, after)) return;
				gridlist.value = after;
				gridlist.onChange?.(after);
			},

			/** Pick one row, and make it the row a Shift walk measures from. */
			pick(value: string) {
				if (gridlist.disabled || gridlist.selectable !== true || value === '') return;
				gridlist.anchor = value;
				const after = toggled(gridlist.value, value, gridlist.multiple === true);
				if (same(gridlist.value, after)) return;
				gridlist.value = after;
				gridlist.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per row, rooted by `gridlist.item`. */
export const gridlistItemState = shared(
	() => {
		const item: GridListItemInstanceState = state({ value: '', disabled: false });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function GridListRoot({
	value = [],
	selectable = false,
	multiple = false,
	disabled = false,
	wrap = false,
	onChange,
	children,
	...rest
}: GridListRootProps) @{
	const gridlist = gridlistState();
	gridlist.onChange = onChange;
	gridlist.value = value;
	// Several rows at once is still selection, so `multiple` alone is enough.
	gridlist.selectable = selectable || multiple;
	gridlist.multiple = multiple;
	gridlist.disabled = disabled;
	gridlist.wrap = wrap;

	<GridListGrid {...rest}>{children}</GridListGrid>
}

// A separate part rather than the root's own element: a widget root cannot read
// its own instance token, so the label IDREF only resolves one component deeper.
function GridListGrid({ children, onClick, onFocusin, onKeydown, ...rest }: GridListGridProps) @{
	const gridlist = gridlistState();
	const ariaMulti = computed(() => (gridlist.multiple === true ? 'true' : null));
	const ariaDisabled = computed(() => (gridlist.disabled === true ? 'true' : 'false'));
	// The grid is the list's only tab stop until focus lands inside, so Shift+Tab out of the first row leaves the list.
	const tabStop = computed(() => (gridlist.disabled === true ? -1 : 0));

	<div
		{...rest}
		el={gridlist.gridEl}
		role="grid"
		tabindex={tabStop}
		aria-labelledby={gridlist.labelEl}
		aria-multiselectable={ariaMulti}
		aria-disabled={ariaDisabled}
		ui-selectable={gridlist.selectable}
		ui-multiple={gridlist.multiple}
		ui-disabled={gridlist.disabled}
		ui-inside={gridlist.inside}
		onFocusin={(event) => {
			// `target`, not `currentTarget`: a lazy handler symbol runs after the native dispatch, when `currentTarget` is null.
			const target = event.target as HTMLElement;
			const grid = gridlist.gridEl;
			const rowEls = gridlist.rowEls;
			if (grid === undefined) {
				onFocusin?.(event);
				return;
			}

			if (target === grid) {
				const rows = reachableRows(rowEls);
				const remembered = rows.find((one) => one.getAttribute('tabindex') === '0');
				(remembered ?? rows[0])?.focus();
				onFocusin?.(event);
				return;
			}

			const row = rowAt(rowEls, target);
			if (row) {
				// Landing on the row itself is what ends a trip into the controls it holds.
				if (target === row) gridlist.inside = false;
				// Roving is written straight to the DOM: grid and rows render tabindex as literals, so nothing else moves it.
				grid.setAttribute('tabindex', '-1');
				for (const one of rowEls ?? []) {
					one.setAttribute('tabindex', one === row ? '0' : '-1');
				}
			}

			onFocusin?.(event);
		}}
		onClick={(event) => {
			const target = event.target as HTMLElement;
			const rowEls = gridlist.rowEls;
			const triggerEls = gridlist.triggerEls;
			const row = rowAt(rowEls, target);
			if (row === null) {
				onClick?.(event);
				return;
			}

			// A press that came out of a control the row holds is that control's, not a pick.
			const widgets = ownParts(triggerEls, row);
			if (!heldBy(widgets, target)) gridlist.pick(row.getAttribute('ui-value') ?? '');
			onClick?.(event);
		}}
		onKeydown={(event) => {
			// Written out from event fields and graph state read directly: the policy
			// has to be readable before the handler symbol loads, and a key list
			// joined to a state read in one guard is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			// The arrows are cancelled whether or not focus is inside a row, which
			// costs nothing on a button and is why the walk only manages buttons.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}
			// The space bar belongs to the control that has focus for as long as it has it.
			if (event.key === ' ' && gridlist.inside !== true) event.preventDefault();
			if (event.key === 'Escape' && gridlist.inside === true) event.preventDefault();
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
			const rowEls = gridlist.rowEls;
			const triggerEls = gridlist.triggerEls;
			const labelEls = gridlist.labelEls;
			const isInside = gridlist.inside === true;
			const isSelectable = gridlist.selectable === true;
			const isMultiple = gridlist.multiple === true;
			const wraps = gridlist.wrap === true;
			const anchor = gridlist.anchor;
			const buffer = gridlist.typed;
			const since = gridlist.typedAt;

			if (gridlist.disabled === true) {
				onKeydown?.(event);
				return;
			}

			const here = rowAt(rowEls, target);
			if (here === null) {
				onKeydown?.(event);
				return;
			}

			const widgets = ownParts(triggerEls, here);

			if (isInside) {
				if (key === 'Escape') {
					gridlist.inside = false;
					here.focus();
				} else if (key === 'ArrowRight' || key === 'ArrowLeft') {
					const where = widgets.indexOf(target as HTMLButtonElement);
					if (where >= 0) widgets[key === 'ArrowRight' ? where + 1 : where - 1]?.focus();
				}
				onKeydown?.(event);
				return;
			}

			const rows = reachableRows(rowEls);
			const at = rows.indexOf(here);
			const order = rowValues(rows);
			const held = here.getAttribute('ui-value') ?? '';
			let landing: HTMLDivElement | null = null;

			if (key === 'ArrowDown') landing = spatialMove(rows, here, 'down', wraps);
			else if (key === 'ArrowUp') landing = spatialMove(rows, here, 'up', wraps);
			else if (key === 'ArrowRight') landing = spatialMove(rows, here, 'right', wraps);
			else if (key === 'ArrowLeft') landing = spatialMove(rows, here, 'left', wraps);
			else if (key === 'Home') landing = rows[0] ?? null;
			else if (key === 'End') landing = rows[rows.length - 1] ?? null;
			else if (key === 'Enter' || key === 'F2') {
				// The APG's own entry into a cell's widgets, and the reason the controls
				// a row holds are out of the tab order.
				const first = widgets[0];
				if (first !== undefined) {
					gridlist.inside = true;
					first.focus();
				}
			} else if (key === 'Escape') {
				gridlist.anchor = '';
				gridlist.settle([]);
			} else if (key === ' ') {
				gridlist.pick(held);
			} else if ((ctrl || meta) && (key === 'a' || key === 'A') && isMultiple) {
				gridlist.anchor = order[0] ?? '';
				gridlist.settle(allOf(order));
			} else if (isSearchKey(key, ctrl, meta, alt)) {
				// The buffer is aged by a clock reading rather than by a timer, so a resumed page has nothing outstanding.
				const now = Date.now();
				const search = nextSearch(buffer, since, now, key);
				gridlist.typed = search;
				gridlist.typedAt = now;
				landing = rows[matchAt(rowLabels(rows, labelEls), at, search)] ?? null;
			}

			if (landing !== null) {
				const arrived = landing.getAttribute('ui-value') ?? '';
				// A Shift walk replaces the run from its anchor rather than growing one,
				// so walking back towards the anchor shrinks what is picked.
				if (
					shift &&
					isSelectable &&
					isMultiple &&
					(key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight')
				) {
					gridlist.settle(spanBetween(order, anchor === '' ? held : anchor, arrived));
					if (anchor === '') gridlist.anchor = held;
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
				   the list is actually reporting. */
				[ui-selectable] {
					-webkit-user-select: none;
					user-select: none;
				}
			}
		</style>
		{children}
	</div>
}

export function GridListLabel({ children, ...rest }: GridListLabelProps) @{
	const gridlist = gridlistState();

	<span {...rest} el={gridlist.labelEl}>{children}</span>
}

export function GridListItem({
	value,
	disabled = false,
	children,
	...rest
}: GridListItemProps) @{
	const gridlist = gridlistState();
	const item = gridlistItemState();
	item.value = value;
	item.disabled = disabled;

	const isSelected = computed(() => gridlist.value.includes(item.value));
	const isDisabled = computed(() => gridlist.disabled === true || item.disabled === true);
	// Absent rather than false while nothing can be picked: a row reporting it is
	// not selected in a list that has no selection has said something untrue.
	const ariaSelected = computed(() =>
		gridlist.selectable === true ? (gridlist.value.includes(item.value) ? 'true' : 'false') : null,
	);
	const ariaDisabled = computed(() =>
		gridlist.disabled === true || item.disabled === true ? 'true' : 'false',
	);

	// tabindex -1 because the grid is the tab stop until focus lands on a row, and the roving write moves it from there.
	<div
		{...rest}
		el={gridlist.rowEls}
		role="row"
		tabindex={-1}
		aria-selected={ariaSelected}
		aria-disabled={ariaDisabled}
		ui-value={item.value}
		ui-selected={isSelected}
		ui-disabled={isDisabled}
	>{children}</div>
}

// ARIA gives a row no meaning without a cell in it, which is why this part is not optional.
export function GridListItemContent({ children, ...rest }: GridListItemContentProps) @{
	<div {...rest} role="gridcell">{children}</div>
}

export function GridListItemLabel({ children, ...rest }: GridListItemLabelProps) @{
	const gridlist = gridlistState();

	<span {...rest} el={gridlist.labelEls}>{children}</span>
}

export function GridListItemTrigger({ children, ...rest }: GridListItemTriggerProps) @{
	const gridlist = gridlistState();
	const item = gridlistItemState();
	const isDisabled = computed(() => gridlist.disabled === true || item.disabled === true);

	// tabindex -1 because the row is the tab stop: Enter on the row is what reaches this.
	<button
		{...rest}
		el={gridlist.triggerEls}
		type="button"
		tabindex={-1}
		disabled={isDisabled}
	>{children}</button>
}

export function GridListItemIndicator({ children, ...rest }: GridListItemIndicatorProps) @{
	const gridlist = gridlistState();
	const item = gridlistItemState();
	const isSelected = computed(() => gridlist.value.includes(item.value));

	// Hidden from readers: the row carries `aria-selected`, and a second announcement of the same fact is noise.
	<span {...rest} aria-hidden="true" ui-selected={isSelected}>{children}</span>
}
