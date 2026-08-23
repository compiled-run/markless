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
	/** Nothing navigates while this is set, and every control reports unavailable. */
	readonly disabled?: boolean;
	/**
	 * Called with the new page number when a person moves to another page. Omit it
	 * and the pagination still moves; the call site simply does nothing.
	 */
	readonly onChange?: (page: number) => void;
};

/**
 * One page's box. It exists to carry `ui-active` for a stylesheet, so a consumer
 * can style the current page's surroundings; the control inside it carries the
 * ARIA. `value` is repeated on the control because the control is written by the
 * consumer, not by this part, and a part reads its own props only.
 */
export type PaginationItemProps = PropsOf<'div'> & {
	/** Which page this box stands for, counting from 1. */
	readonly value: number;
};

/**
 * A consumer's `onClick` runs after the page has already moved.
 *
 * The native `value` is omitted before ours replaces it: a `<button value>` is a
 * string that a form submits, and this one is a page number nothing submits.
 */
export type PaginationItemTriggerProps = Omit<PropsOf<'button'>, 'value'> & {
	/** Which page this control goes to, counting from 1. */
	readonly value: number;
};

/**
 * The same control as `itemtrigger` over an `<a>`, for pagination that is real
 * navigation with real URLs. An anchor has no `disabled` attribute, so an
 * unavailable link reports `aria-disabled` and stays in the tab order.
 */
export type PaginationItemLinkProps = PropsOf<'a'> & {
	/** Which page this link goes to, counting from 1. */
	readonly value: number;
};

/** Steps to the next page. Natively `disabled` on the last page. */
export type PaginationForwardTriggerProps = PropsOf<'button'>;

/** Steps to the previous page. Natively `disabled` on page 1. */
export type PaginationBackTriggerProps = PropsOf<'button'>;

/**
 * The shared instance every pagination part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for the writers to
 * call.
 */
export type PaginationInstanceState = Seeded<PaginationRootProps, 'count' | 'page' | 'disabled'> & {
	onChange?: PaginationRootProps['onChange'];
};
