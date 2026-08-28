import type { PropsOf, Seeded } from '@markless/core';

/**
 * An application's menu bar: a row of `menubar.item`s, each holding the commands
 * it drops down in its own `menubar.itemcontent`.
 *
 * The bar is the one root. It owns the walk across its items, the roving tab
 * stop, and the `onChange` every command at every depth reports to. A menu bar
 * is always horizontal, so there is no orientation to choose.
 *
 * Name it with `aria-label`, or with a `menubar.label` beside the items.
 *
 * A menu bar is for an application's own commands - File, Edit, View. Site
 * navigation is a disclosure (see `navbar/note.md`), not a bar of menus.
 */
export type MenubarRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * Called with the item's `value` when a command anywhere in the bar is
	 * activated - a command, a checkbox item toggling, a radio item being chosen -
	 * at any depth of any item's menu.
	 */
	readonly onChange?: (value: string) => void;
};

/** The private part that owns `role="menubar"`; it takes the root's own attributes. */
export type MenubarBarProps = PropsOf<'div'>;

/**
 * One menu on the bar: the `role="menuitem"` a person meets, carrying the label
 * text, and the level its `menubar.itemcontent` drops down.
 *
 * It is the item level of the recursion, so the menu family's own parts go
 * inside it unchanged: a `menu.item` is one command, and a `menu.item submenu`
 * holding a `menu.itemcontent` nests as deep as it likes. Activation at any
 * depth reports to `menubar.root`.
 */
export type MenubarItemProps = PropsOf<'div'> & {
	/** Whether this item's menu is showing. Omit it and the item starts closed. */
	readonly open?: boolean;
	/**
	 * The values of the commands in this menu that start checked - checkbox items,
	 * or the one chosen radio item. The checked set lives on the item because a
	 * radio choice unchecks its siblings, which is one decision about one menu.
	 */
	readonly checked?: readonly string[];
	/** This menu cannot be opened, and no command in it may be activated. */
	readonly disabled?: boolean;
	/** The arrow walk wraps at both ends, on every surface of this menu. */
	readonly loop?: boolean;
	/**
	 * The commands of this menu are one radio group: each renders
	 * `role="menuitemradio"`, and choosing one unchecks the rest.
	 */
	readonly radio?: boolean;
	/** How long a pointer rests on a `submenu` command before its submenu opens, in milliseconds. */
	readonly delay?: number;
	/** How long a submenu stays open after the pointer leaves its command, in milliseconds. */
	readonly closeDelay?: number;
};

/** The private part that carries `role="menuitem"`; it takes the item's own attributes. */
export type MenubarItemControlProps = PropsOf<'div'>;

/**
 * The menu one bar item drops down, `role="menu"`, named by that item.
 *
 * It owns the keyboard walk over the commands IT holds; a `menu.itemcontent`
 * written deeper owns its own. Left and Right from inside it close it and open
 * the neighbouring item's menu, which is what a menu bar does with those keys.
 *
 * Placement is CSS, never a prop: it anchors to its item with a default
 * `position-area` of `block-end`, inside `@layer markless`, so one unlayered
 * rule of yours replaces the default without a specificity fight.
 */
export type MenubarItemContentProps = PropsOf<'div'>;

/**
 * The bar's accessible name. A menu bar is not a form control, so this is a
 * `span` the bar points at with `aria-labelledby`, not a `label` element. Pass
 * `aria-label` on `menubar.root` instead when the name should not be visible.
 */
export type MenubarLabelProps = PropsOf<'span'>;

/**
 * The shared instance every menubar part reads.
 *
 * The `element()` handles are not cells; they are added to the instance the
 * factory returns. `itemEls` is the roster of the bar's own items, which is what
 * the walk, the roving stop and the typeahead are asked of.
 */
export type MenubarInstanceState = {
	/** The position in the item roster, read back in document order, that owns the bar's tab stop. */
	active: number;
	/** Focus has been inside the bar; the bar itself is no longer the page's stop for it. */
	entered: boolean;
	/** The live typeahead buffer over the bar's items, and when its last character arrived. */
	typeahead: string;
	typeaheadAt: number;
	onChange?: MenubarRootProps['onChange'];
};

/**
 * One rendered `menubar.item`. Its own `menubar.itemcontent` reads this; the
 * `menu.item`s inside that menu root their own instances of the menu family and
 * never see this one.
 */
export type MenubarItemInstanceState = Seeded<
	MenubarItemProps,
	'disabled' | 'loop'
> & {
	/** This item's menu is showing. */
	expanded: boolean;
	/** The live typeahead buffer over this menu's own commands, and when its last character arrived. */
	typeahead: string;
	typeaheadAt: number;
	/**
	 * When the item's next click is ignored, as a timestamp.
	 *
	 * A press on an open item is an outside press, so the menu is shut before the
	 * click that follows reaches the item. Without the grace that click re-opens
	 * what the press just closed.
	 */
	graceUntil: number;
};
