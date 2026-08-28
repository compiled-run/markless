import type { PropsOf } from '@markless/core';

/**
 * An application's menu bar. Whole `menu.root`s go inside it, unchanged: each
 * keeps its own `menu.trigger`, its own `menu.content` and its own submenus, and
 * the bar collects the triggers into one roving tab stop and drives travel
 * between the menus.
 *
 * The bar is a grouping and a tab-stop policy. It holds no value, reports no
 * change, and takes no props: an application menu bar is always horizontal, and
 * every menu inside it already reports for itself through its own `onChange`.
 *
 * Name it with `aria-label`, or with a `menubar.label` beside the menus.
 *
 * A menu bar is for an application's own commands - File, Edit, View. Site
 * navigation is a disclosure (see `navbar/note.md`), not a bar of menus.
 */
export type MenubarRootProps = PropsOf<'div'>;

/** The private part that owns `role="menubar"`; it takes the root's own attributes. */
export type MenubarBarProps = PropsOf<'div'>;

/**
 * The bar's accessible name. A menu bar is not a form control, so this is a
 * `span` the bar points at with `aria-labelledby`, not a `label` element. Pass
 * `aria-label` on `menubar.root` instead when the name should not be visible.
 */
export type MenubarLabelProps = PropsOf<'span'>;

/**
 * The shared instance every menubar part - and every enclosed `menu` part that
 * registers into the bar - reads.
 *
 * The `element()` handles are not cells; they are added to the instance the
 * factory returns. `triggerEls` is the roster of registered `menu.trigger`s and
 * `menuEls` the roster of their `menu.root`s, which is what says WHICH menu a
 * gesture landed in.
 */
export type MenubarInstanceState = {
	/** A bar is rendered around this read. A `menu` part outside every bar reads `false`. */
	mounted: boolean;
	/** The position in the trigger roster, read back in document order, that owns the bar's tab stop. */
	active: number;
	/** Focus has been inside the bar; the bar itself is no longer the page's stop for it. */
	entered: boolean;
	/** The live typeahead buffer over the bar's triggers, and when its last character arrived. */
	typeahead: string;
	typeaheadAt: number;
};
