import { shared, state } from '@markless/core';
import type {
	PaginationBackTriggerProps,
	PaginationForwardTriggerProps,
	PaginationInstanceState,
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
			disabled: false,
		});

		return {
			...pagination,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((page: number) => void) | undefined,
			// `value = 1` rather than `value: number`, and the default is never used.
			// A shared method that dispatches is INLINED into the handler that calls
			// it, and the inlined arrow keeps the parameter exactly as written; the
			// capture analysis then parses that handler source with a JavaScript-only
			// parser to decide whether a consumer prop is called safely. A type
			// annotation makes that parse throw, and every `onClick?.(event)` in the
			// same handler is then reported as an unconditional call
			// (MARKLESS_CAPTURE_OPAQUE_PROP), which refuses the whole build. A default
			// value carries the same `number` type and is plain JavaScript.
			// `back()` and `forward()` take no parameter, so they never hit this.
			goTo(value = 1) {
				if (pagination.disabled) return;
				const next = Math.min(Math.max(value, 1), Math.max(pagination.count, 1));
				// Going where you already are is not a page change, so no callback fires.
				if (next === pagination.page) return;
				pagination.page = next;
				pagination.onChange?.(next);
			},
			// back() and forward() repeat goTo()'s body rather than calling it: a
			// shared method has no receiver to reach its siblings through.
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

// Every part compares against `pagination.page` with a plain cell read, and
// that spelling is load-bearing twice over.
//
// There is no computed() in this family: a widget-scoped shared computed read in
// a part's attribute renders correctly and then never refreshes, because writing
// the cell underneath it wakes no DOM update. Measured on this base by reading
// one comparison both ways - through a computed nothing woke and the attribute
// never moved; through the cell eight modules woke and it moved.
//
// The page is also NOT clamped on the way in. A component body may seed a shared
// cell only from a bare prop or a constant, so the root cannot narrow `page`
// here, and clamping in the parts instead turns the comparison into an
// expression, which stops refreshing for the same reason a computed does.
// `goTo()` clamps every write, so an out-of-range `page` only survives until the
// first gesture; the suite pins the seeded case.
//
// The nav is named, which is the family's one non-negotiable ARIA fact and the
// one the QDS reference's spec promises and its code omits. The name is written
// BEFORE the spread and the state attributes after it: the intent is that a
// consumer can replace the landmark's name and cannot replace aria-current or
// disabled. Only the second half holds today - a spread does not overwrite an
// attribute written before it either - and the suite pins the first half.
export function PaginationRoot({
	count,
	page = 1,
	disabled = false,
	onChange,
	children,
	...rest
}: PaginationRootProps) @{
	const pagination = paginationState();
	pagination.onChange = onChange;
	pagination.count = count;
	pagination.page = page;
	pagination.disabled = disabled;

	<nav aria-label="Pagination" {...rest} ui-disabled={pagination.disabled}>{children}</nav>
}

export function PaginationItem({ value, children, ...rest }: PaginationItemProps) @{
	const pagination = paginationState();
	const item = state({ value });

	<div {...rest} ui-active={pagination.page === item.value}>{children}</div>
}

export function PaginationItemTrigger({
	value,
	children,
	onClick,
	...rest
}: PaginationItemTriggerProps) @{
	const pagination = paginationState();
	const item = state({ value });

	// aria-current is absent on the pages you are not on, never "false": the
	// attribute's own default IS "false", and no library in the survey writes it.
	//
	// The absent branch is `false` rather than `undefined` because an `undefined`
	// branch compiles to no DOM-update record at all: measured here, the attribute
	// rendered right on first paint and then never moved again, and the server
	// rendered it not at all. `false` is what the attribute writer already reads as
	// "remove this attribute", and it refreshes.
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

export function PaginationItemLink({
	value,
	children,
	onClick,
	...rest
}: PaginationItemLinkProps) @{
	const pagination = paginationState();
	const item = state({ value });

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
