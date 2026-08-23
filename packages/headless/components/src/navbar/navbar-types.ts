import type { PropsOf, Seeded } from '@markless/core';

/**
 * The `<nav>` landmark that holds the site's primary navigation.
 *
 * It is a landmark, so it needs a name, and this family writes none: a page can
 * carry a primary nav and a footer nav, and an invented "Navigation" on both is
 * two landmarks a reader cannot tell apart. `{...rest}` is spread first, so
 * `<navbar.root aria-label="Primary">` is the whole story.
 *
 * The family is a DISCLOSURE, never a menubar. `role="menubar"` puts screen
 * readers into application mode and promises desktop-menu behaviour that site
 * navigation does not have; the authoring practices, the aria-at plan and every
 * surveyed library agree that navigation is a set of buttons that show and hide
 * panels. See goals/headless-components/notes/research-navbar.md §1.
 */
export type NavbarRootProps = Omit<PropsOf<'nav'>, 'onChange'> & {
	/**
	 * Which item's dropdown is showing, named by that item's `value`. Omit it, or
	 * pass the empty string, and every dropdown is closed.
	 *
	 * One value on the root rather than an `open` flag per item, because opening
	 * one dropdown closes the others and only a value the whole navbar shares can
	 * say that.
	 */
	readonly value?: string;
	/** Dropdowns open when the pointer rests on an item. Omit it and they do. */
	readonly hover?: boolean;
	/**
	 * How long the pointer must rest on an item before its dropdown opens, in
	 * milliseconds. Omit it and it is 200. It applies to the first dropdown only:
	 * once one is showing, moving to another opens it at once.
	 */
	readonly delay?: number;
	/**
	 * How long after a dropdown opened under the pointer a click on the same
	 * trigger is ignored, in milliseconds. Omit it and it is 300. Without it the
	 * click that lands while the pointer is resting shuts the panel it just
	 * opened.
	 */
	readonly clickGrace?: number;
	/**
	 * Called with the value of the item now showing its dropdown, or the empty
	 * string when everything closed. Omit it and the navbar still opens and
	 * closes; the call site simply does nothing.
	 */
	readonly onChange?: (value: string) => void;
};

/**
 * One top-level entry. It wraps either a plain `navbar.itemlink` or a
 * `navbar.itemtrigger` and the `navbar.itemcontent` that trigger shows, and it
 * is the element the pointer enters and leaves, so moving from a trigger down
 * into its own dropdown never counts as leaving.
 */
export type NavbarItemProps = PropsOf<'div'> & {
	/** Names the item. The root's `value` names the item whose dropdown shows. Required. */
	readonly value: string;
	/**
	 * This entry leads to the section a person is in. It writes `ui-active` for a
	 * stylesheet and nothing else: the ARIA for "the page you are on now" belongs
	 * on the one link that is that page, which is `navbar.itemlink`'s `current`.
	 */
	readonly active?: boolean;
};

/**
 * The button that shows and hides one item's dropdown. `aria-expanded` says
 * which way it is, `aria-controls` names the panel by a minted id.
 *
 * A consumer's `onClick` and `onKeydown` both run after the family's.
 */
export type NavbarItemTriggerProps = PropsOf<'button'>;

/**
 * One dropdown. It stays in the page when it is closed - `hidden` decides
 * whether it shows, never an arm - so the trigger's `aria-controls` never
 * dangles and the focus, scroll position and form state inside a panel survive a
 * close.
 *
 * A consumer's `onKeydown` runs after the family's.
 */
export type NavbarItemContentProps = PropsOf<'div'>;

/**
 * A navigation link. It works at the top level of the navbar and inside a
 * dropdown, and it is the only part that can carry `aria-current="page"`.
 */
export type NavbarItemLinkProps = PropsOf<'a'> & {
	/**
	 * This link is the page a person is on now. It writes `aria-current="page"`,
	 * which the aria-at disclosure-navigation plan makes a priority-1 assertion.
	 * Set it on the one link that is the current page, never on the whole section.
	 */
	readonly current?: boolean;
};

/**
 * The shared instance every navbar part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `show()`,
 * `toggle()` and `closeAll()` to call.
 */
export type NavbarInstanceState = Seeded<
	NavbarRootProps,
	'value' | 'hover' | 'delay' | 'clickGrace'
> & {
	onChange?: NavbarRootProps['onChange'];
};

/**
 * One instance per rendered `navbar.item`, seeded by that item and read by the
 * trigger and the content nested inside it - the same nesting pagination gets
 * from its own per-item instance.
 *
 * The three numbers are what a hover has to remember between one pointer event
 * and the next: the pending timer this item scheduled, the moment its open
 * delay is up, and the moment after which a click on its trigger counts again.
 * All three are zero when nothing is pending.
 */
export type NavbarItemInstanceState = Seeded<NavbarItemProps, 'value' | 'active'> & {
	openTimer: number;
	restingUntil: number;
	graceUntil: number;
};
