import type { PropsOf, Seeded } from '@markless/core';

/**
 * The `<nav>` landmark that holds the page controls. It is a landmark, so it
 * carries a name: `aria-label="Pagination"` by default, and a consumer's own
 * `aria-label` replaces it - a page with a site nav, a breadcrumb and a
 * pagination has three navigation landmarks, and a reader lists them by name.
 */
export type PaginationRootProps = Omit<PropsOf<'nav'>, 'onChange'> & {
	/**
	 * How many pages there are in total - pages, not rows. How many rows fit on a
	 * page is the consumer's data layer, and a component told about the data twice
	 * can disagree with itself.
	 */
	readonly count: number;
	/** Which page is showing, counting from 1. Omit it and it starts at page 1. */
	readonly page?: number;
	/**
	 * How many pages to show on each side of the current one when the family
	 * computes its range. Omit it and it is 1.
	 */
	readonly siblingCount?: number;
	/** Nothing navigates while this is set, and every control reports unavailable. */
	readonly disabled?: boolean;
	/**
	 * Called with the new page number when a person moves to another page. Omit it
	 * and the pagination still moves; the call site simply does nothing.
	 */
	readonly onChange?: (page: number) => void;
};

/**
 * One page's box, and the part that declares WHICH page this row of the anatomy
 * stands for. The control inside it - an `itemtrigger` or an `itemlink` - reads
 * that page number back off the item and carries the ARIA for it, so the number
 * is written once, on the wrapper, exactly as the QDS reference declares it.
 */
export type PaginationItemProps = PropsOf<'div'> & {
	/** Which page this box stands for, counting from 1. */
	readonly value: number;
};

/**
 * The control inside a `pagination.item`. It takes no page number of its own:
 * the enclosing item already declared one, and this part reads it back to decide
 * where a click goes and whether it is the current page.
 *
 * A consumer's `onClick` runs after the page has already moved.
 */
export type PaginationItemTriggerProps = PropsOf<'button'>;

/**
 * The same control as `itemtrigger` over an `<a>`, for pagination that is real
 * navigation with real URLs. An anchor has no `disabled` attribute, so an
 * unavailable link reports `aria-disabled` and stays in the tab order.
 */
export type PaginationItemLinkProps = PropsOf<'a'>;

/** Steps to the next page. Natively `disabled` on the last page. */
export type PaginationForwardTriggerProps = PropsOf<'button'>;

/** Steps to the previous page. Natively `disabled` on page 1. */
export type PaginationBackTriggerProps = PropsOf<'button'>;

/**
 * The shared instance every pagination part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for the writers to
 * call.
 */
export type PaginationInstanceState = Seeded<
	PaginationRootProps,
	'count' | 'page' | 'siblingCount' | 'disabled'
> & {
	onChange?: PaginationRootProps['onChange'];
};

/**
 * The per-item instance: one page number, seeded by the `item` part and read by
 * whichever control that item wraps. It is its own widget-scoped definition, so
 * every rendered `item` starts a fresh one and the control inside resolves to
 * the nearest one - which is the same nesting the QDS reference gets from a
 * second context provider on the item.
 */
export type PaginationItemInstanceState = Seeded<PaginationItemProps, 'value'>;
