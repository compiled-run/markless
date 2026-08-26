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

// This family holds no computed(): a widget-scoped shared computed read in a part's attribute renders once and never refreshes, so every part compares against `pagination.page` with a plain unclamped cell read.

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
			// Clamped on the read, not on the way in: a component body may seed a shared cell only from a bare prop or a constant.
			getEntries() {
				const showing = Math.min(Math.max(pagination.page, 1), Math.max(pagination.count, 1));
				return pageRange(showing, pagination.count, pagination.siblingCount);
			},
			// The literal function type matters: a callback slot is recognised only from the written annotation, never inferred.
			onChange: undefined as ((page: number) => void) | undefined,
			// `value = 1`, never `value: number`: a dispatching shared method is inlined into its caller and re-parsed as plain JavaScript, where an annotation throws.
			goTo(value = 1) {
				if (pagination.disabled) return;
				const next = Math.min(Math.max(value, 1), Math.max(pagination.count, 1));
				if (next === pagination.page) return;
				pagination.page = next;
				pagination.onChange?.(next);
			},
			// These repeat goTo()'s body rather than calling it: a shared method has no receiver to reach its siblings through.
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

// Rooted by the component that seeds it, so a control nested in a `PaginationItem` resolves to that item and needs no page number of its own.
export const paginationItemState = shared(
	() => {
		const item: PaginationItemInstanceState = state({ value: 1 });

		return { ...item };
	},
	{ scope: 'widget' },
);

// The landmark's name is written before the spread and its state attributes after, so a consumer can rename it but cannot overwrite the state.
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

	<nav {...rest} ui-disabled={pagination.disabled}>{children}</nav>
}

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

	// The absent aria-current branch is spelled `false`, never `undefined`: an `undefined` branch compiles to no DOM-update record, so the attribute would never move again.
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

	// An anchor has no `disabled`, so it stays focusable and says so with aria-disabled; goTo() is what refuses to move.
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
