import type { PropsOf, Seeded } from '@markless/core';

/**
 * Which side of the trigger the surface is placed on. `start` and `end` are the
 * writing direction's sides, so they swap in a right-to-left page; `top` and
 * `bottom` are the same everywhere. A menu opened from `menu.contextarea` is
 * placed at the pointer instead, and ignores this. A submenu is always placed at
 * its item's inline end.
 */
export type MenuSide = 'top' | 'bottom' | 'start' | 'end';

/** Where a context menu was asked for, in client coordinates. */
export type MenuPoint = { readonly x: number; readonly y: number };

/**
 * The menu itself. Everything the family renders goes inside it, and it is the
 * anchor scope the surface is placed within.
 *
 * There is one root however deep the menu nests: a submenu is a
 * `menu.itemcontent` written inside a `menu.item`, and an item activated at any
 * depth reports to this root's `onChange`.
 */
export type MenuRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the surface is showing. Omit it and the menu starts closed. */
	readonly open?: boolean;
	/**
	 * The values of the items that start checked - checkbox items, or the one
	 * chosen radio item. The checked set lives here rather than on each item
	 * because a radio choice unchecks its siblings, which is one decision about
	 * the whole menu, and because a seed may only read its own component's props.
	 */
	readonly checked?: readonly string[];
	/** Nobody can open the menu, and no item may be activated. */
	readonly disabled?: boolean;
	/** The arrow walk wraps at both ends, on every surface. Menus wrap; a listbox does not. */
	readonly loop?: boolean;
	/**
	 * The items of this menu are one radio group: each renders
	 * `role="menuitemradio"`, and choosing one unchecks the rest. Without it an
	 * item carrying `checked` is a `menuitemcheckbox` and the rest are plain
	 * commands. An item carrying `submenu` stays a plain `menuitem` either way.
	 */
	readonly radio?: boolean;
	/**
	 * Where the top surface is placed against the trigger. It is also written on
	 * `menu.content` as `ui-side`, so styling can follow the placement.
	 */
	readonly side?: MenuSide;
	/** How long a pointer rests on a `submenu` item before its submenu opens, in milliseconds. */
	readonly delay?: number;
	/** How long a submenu stays open after the pointer leaves its item, in milliseconds. */
	readonly closeDelay?: number;
	/**
	 * Called with the item's `value` when an item is activated - a command, a
	 * checkbox item toggling, or a radio item being chosen - at any depth.
	 */
	readonly onChange?: (value: string) => void;
	/** Called when the surface opens or closes, including when Escape or a press outside closes it. */
	readonly onOpenChange?: (open: boolean) => void;
};

/**
 * The control the menu opens from, and the family's only tab stop. It declares
 * `aria-haspopup="menu"`, so a reader says a menu is there before it is opened.
 */
export type MenuTriggerProps = PropsOf<'button'>;

/**
 * A region that opens the menu where the pointer is: right-click, a touch long
 * press, `Shift+F10` or the ContextMenu key on anything focused inside it.
 *
 * It carries no role, no name and no ARIA state at all. `aria-haspopup` says a
 * control opens a menu when it is activated, which a region that answers a
 * right-click does not do, and a context menu is equally discoverable to
 * everyone without an announcement of its own (React Aria's reasoning, and
 * w3c/aria#1971 is the open discussion). Give `menu.content` an `aria-label`:
 * with no trigger there is nothing else to name the surface.
 */
export type MenuContextareaProps = PropsOf<'div'>;

/**
 * The top surface the items go in, `role="menu"`. It is never modal: it writes
 * no `aria-modal`, so the page behind it keeps its focus and is never made
 * inert, and a wheel does not dismiss it.
 *
 * It stays in the page when the menu is closed - `hidden` decides whether it
 * shows, never an arm - because an enlisted element removed from the document
 * leaves the overlay stack's marks behind.
 *
 * It owns the keyboard walk over the items IT holds. A submenu's own items
 * belong to that submenu's `menu.itemcontent`.
 */
export type MenuContentProps = PropsOf<'div'>;

/**
 * One command. Given `checked` it is a `menuitemcheckbox` that toggles without
 * closing; inside a `radio` menu it is a `menuitemradio`. Given `submenu` it
 * holds a `menu.itemcontent` and opens it instead of activating.
 *
 * A disabled item is still reachable with the arrows and still announced - the
 * APG's rule, and the divergence from `select`, whose walk skips a disabled
 * option - it simply cannot be activated.
 */
export type MenuItemProps = PropsOf<'div'> & {
	/** Reported to `onChange` when this item is activated. Required: no index stands in for it. */
	readonly value: string;
	/**
	 * This item carries a checked state, so it renders as a `menuitemcheckbox`.
	 * Which items ARE checked is `menu.root`'s `checked`; writing the prop is what
	 * says this item has the state at all.
	 */
	readonly checked?: boolean;
	/** Nobody can activate this item; the arrows still land on it. */
	readonly disabled?: boolean;
	/**
	 * This item holds a submenu: it reports `aria-haspopup="menu"` and
	 * `aria-expanded`, and opening it is what activation does.
	 *
	 * Written rather than inferred from the `menu.itemcontent` inside it, for
	 * tree's `leaf` reason: a component cannot see its own children while it
	 * renders, and a served page has to carry both attributes in its HTML before
	 * anything inside the item exists.
	 */
	readonly submenu?: boolean;
};

/**
 * The submenu one item holds, `role="menu"`, named by that item. It is the same
 * surface part one level down: a `menu.item` inside it may hold a
 * `menu.itemcontent` of its own, to any depth.
 *
 * Like `menu.content` it stays in the page when closed, it is an `overlay`, and
 * it owns the keyboard walk over the items it holds.
 */
export type MenuItemContentProps = PropsOf<'div'>;

/**
 * The graph cells every part of one MENU reads and writes: the root's seeded
 * fields, plus the roving focus, the typeahead buffer, the checked set and the
 * point a context menu was asked for. The `element()` handles and the consumer's
 * callbacks are not cells; they are added to the instance the factory returns.
 */
export type MenuInstanceState = Seeded<
	MenuRootProps,
	'open' | 'checked' | 'disabled' | 'loop' | 'radio' | 'side' | 'delay' | 'closeDelay'
> & {
	/** The `value` of the item holding the roving focus, or `''`. */
	focused: string;
	/** The live typeahead buffer, and when its last character arrived. One buffer for the whole menu, whichever surface is being typed at. */
	typeahead: string;
	typeaheadAt: number;
	/** Where a context menu was asked for, or `null` when the trigger opened it. */
	position: MenuPoint | null;
	pressTimer: number;
	pressX: number;
	pressY: number;
	/** When a keyboard gesture opened the context menu, so the platform's own `contextmenu` does not open it twice. */
	keyboardAt: number;
	/**
	 * When the trigger's next click is ignored, as a timestamp.
	 *
	 * A press on an open menu's trigger is an outside press, so the surface is
	 * shut before the click that follows reaches the trigger. Without the grace
	 * that click re-opens what the press just closed.
	 */
	graceUntil: number;
	onChange?: MenuRootProps['onChange'];
	onOpenChange?: MenuRootProps['onOpenChange'];
};

/**
 * One rendered `menu.item`. Its own `menu.itemcontent` reads this; the items
 * inside that submenu root their own instances of the same family and never see
 * this one.
 */
export type MenuItemInstanceState = Seeded<MenuItemProps, 'value' | 'disabled' | 'submenu'> & {
	/** This item's submenu is showing. */
	expanded: boolean;
	/** This item was written with `checked`, so it carries a checked state at all. */
	checkable: boolean;
	/** Whether a pointer resting on this item is what opened its submenu. */
	byHover: boolean;
	openTimer: number;
	closeTimer: number;
	restingUntil: number;
	closingUntil: number;
};
