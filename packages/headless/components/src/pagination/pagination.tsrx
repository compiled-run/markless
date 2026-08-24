import { shared, state } from '@markless/core';
import { pageRange } from './pagination-range.ts';
import type {
	PaginationBackTriggerProps,
	PaginationForwardTriggerProps,
	PaginationInstanceState,
	PaginationItemInstanceState,
	PaginationItemLinkProps,
	PaginationItemProps,
	PaginationItemTriggerProps,
	PaginationRootProps,
} from './pagination-types.ts';

export const paginationState = shared(
	() => {
		const pagination: PaginationInstanceState = state({
			count: 1,
			page: 1,
			siblingCount: 1,
			disabled: false,
		});

		return {
			...pagination,
			// Which pages to show, read as a zero-arg accessor:
			// `.
const p = pagination.state(); const entries = computed(() => p.getEntries())`.
			//
			// The clamp lives here rather than on the way in: a component body may seed
			// a shared cell only from a bare prop or a constant, so the root cannot
			// narrow `page` as it arrives. Narrowing at every read is what makes a
			// bookmarked `?page=99` render the last page's range.
			getEntries() {
				const showing = Math.min(Math.max(pagination.page, 1), Math.max(pagination.count, 1));
				return pageRange(showing, pagination.count, pagination.siblingCount);
			},
			// The literal.
 function type matters: a callback slot is recognised only from
			// the written annotation, never inferred.
			onChange: undefined as ((page: number) => void) | undefined,
			// `value = 1` rather than `value: number`, and the default is never used. A
			// dispatching shared method is inlined into the handler that calls it, and
			// the capture analysis parses that handler with a JavaScript-only parser; a
			// type annotation makes the parse throw, and every `onClick?.(event)` in the
			// handler is then reported as an unconditional call, refusing the build. The
			// default carries the same `number` type in plain JavaScript.
			goTo(value = 1) {
				if (pagination.disabled) return;
				const next = Math.min(Math.max(value, 1), Math.max(pagination.count, 1));
				// Going where you already are is not a page change, so no callback fires.
				if (next === pagination.page) return;
				pagination.page = next;
				pagination.onChange?.(next);
			},
			// These repeat goTo()'s body rather than calling it: a shared method has no
			// receiver to reach its siblings through.
			back() {
				if (pagination.disabled) return;
				if (pagination.page <= 1) return;
				const next = pagination.page - 1;
				pagination.page = next;
				pagination.onChange?.(next);
			},
			forward() {
				if (pagination.disabled) return;
				if (pagination.page >= pagination.count) return;
				const next = pagination.page + 1;
				pagination.page = next;
				pagination.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// The per-item instance, and the reason `itemtrigger` and `itemlink` take no page
// number of their own. A widget-scoped definition is rooted by the component that
// SEEDS it, so each rendered `PaginationItem` owns its own `value` and a control
// nested inside resolves to the nearest enclosing item. Two definitions are live at
// once inside one control: the family instance from the root, and this one.
export const paginationItemState = shared(
	() => {
		const item: PaginationItemInstanceState = state({ value: 1 });

		return { ...item };
	},
	{ scope: 'widget' },
);

// Every part below compares against `pagination.page` with a plain cell read, and
// that spelling is load-bearing.
//
// This family holds no computed(): a widget-scoped shared computed read in a part's
// attribute renders once and then never refreshes, because writing the cell
// underneath it wakes no DOM update. Wrapping a comparison in a clamp turns it into
// an expression, which stops refreshing for the same reason, so the comparisons stay
// unclamped by design. `goTo()` clamps every write, and `getEntries()` clamps on the
// read side because a consumer holds it in a computed() and reads a value rather
// than an attribute. A bookmarked `?page=99` therefore gets the last page's range
// while the comparisons here still see 99, until the first gesture clamps it.
//
// The nav's name is written BEFORE the spread and the state attributes after it, so
// a consumer can replace the landmark's name and cannot replace aria-current or
// disabled.
export function PaginationRoot({
	count,
	page = 1,
	siblingCount = 1,
	disabled = false,
	onChange,
	children,
	...rest
}: PaginationRootProps) @{
	const pagination = paginationState();
	pagination.onChange = onChange;
	pagination.count = count;
	pagination.page = page;
	pagination.siblingCount = siblingCount;
	pagination.disabled = disabled;

	<nav aria-label="Pagination" {...rest} ui-disabled={pagination.disabled}>{children}</nav>
}

// The one part that declares a page number. Its `value` seeds the per-item
// instance, and the control it wraps reads that back rather than being told the
// number a second time.
export function PaginationItem({ value, children, ...rest }: PaginationItemProps) @{
	const pagination = paginationState();
	const item = paginationItemState();
	item.value = value;

	<div {...rest} ui-active={pagination.page === item.value}>{children}</div>
}

export function PaginationItemTrigger({
	children,
	onClick,
	...rest
}: PaginationItemTriggerProps) @{
	const pagination = paginationState();
	const item = paginationItemState();

	// aria-current is absent on the pages you are not on, never "false" - the
	// attribute's own default is already "false". The absent branch must be spelled
	// `false` rather than `undefined`: an `undefined` branch compiles to no DOM-update
	// record at all, so the attribute would render once and never move again.
	<button
		{...rest}
		type="button"
		aria-current={pagination.page === item.value ? 'page' : false}
		disabled={pagination.disabled}
		ui-active={pagination.page === item.value}
		onClick={(event) => {
			pagination.goTo(item.value);
			onClick?.(event);
		}}
	>{children}</button>
}

export function PaginationItemLink({ children, onClick, ...rest }: PaginationItemLinkProps) @{
	const pagination = paginationState();
	const item = paginationItemState();

	// An anchor has no `disabled`, so an unavailable link says so with
	// aria-disabled and stays focusable; goTo() is what refuses to move.
	<a
		{...rest}
		aria-current={pagination.page === item.value ? 'page' : false}
		aria-disabled={pagination.disabled ? 'true' : false}
		ui-active={pagination.page === item.value}
		onClick={(event) => {
			pagination.goTo(item.value);
			onClick?.(event);
		}}
	>{children}</a>
}

export function PaginationBackTrigger({
	children,
	onClick,
	...rest
}: PaginationBackTriggerProps) @{
	const pagination = paginationState();

	<button
		aria-label="Previous page"
		{...rest}
		type="button"
		disabled={pagination.disabled || pagination.page <= 1}
		onClick={(event) => {
			pagination.back();
			onClick?.(event);
		}}
	>{children}</button>
}

export function PaginationForwardTrigger({
	children,
	onClick,
	...rest
}: PaginationForwardTriggerProps) @{
	const pagination = paginationState();

	<button
		aria-label="Next page"
		{...rest}
		type="button"
		disabled={pagination.disabled || pagination.page >= pagination.count}
		onClick={(event) => {
			pagination.forward();
			onClick?.(event);
		}}
	>{children}</button>
}
