import type { PropsOf, Seeded } from '@markless/core';

/** Which way the bar runs, and therefore which pair of arrows walks it. */
export type ToolbarOrientation = 'horizontal' | 'vertical';

/**
 * The bar itself. Controls go inside it - `toolbar.item` buttons, and any other
 * family that registers itself (`toggle.root`, `buttongroup.item`,
 * `select.trigger`). It holds the roster of registered controls and which one
 * owns the bar's single tab stop.
 */
export type ToolbarRootProps = PropsOf<'div'> & {
	/** Which way the bar runs. Omit it and the bar is horizontal. */
	readonly orientation?: ToolbarOrientation;
};

/**
 * The shared instance every toolbar part - and every foreign control that
 * registers into the bar - reads: the root's seeded `orientation`, plus `active`,
 * the position in the registered roster that owns the bar's one tab stop.
 */
export type ToolbarInstanceState = Seeded<ToolbarRootProps, 'orientation'> & {
	/** A bar is rendered around this read. A control outside every bar reads `false`. */
	mounted: boolean;
	/** The position in the roster, read back in document order, that owns the bar's tab stop. */
	active: number;
	/** Focus has been inside the bar; the bar itself is no longer the page's stop for it. */
	entered: boolean;
};

/** The private part that owns `role="toolbar"`; it takes the root's own attributes. */
export type ToolbarBarProps = PropsOf<'div'>;

/**
 * The bar's accessible name. A toolbar is not a form control, so this is a
 * `span` the bar points at with `aria-labelledby`, not a `label` element. Pass
 * `aria-label` on `toolbar.root` instead when the name should not be visible.
 */
export type ToolbarLabelProps = PropsOf<'span'>;

/**
 * One plain button in the bar, belonging to no other family. It registers itself
 * in the roster and takes its `tabindex` from the bar.
 *
 * `disabled` writes `aria-disabled` rather than the native attribute, so the
 * control stays focusable and a person walking the bar still meets it - the APG
 * toolbar rule. The consumer's `onClick` is not called while it is set.
 */
export type ToolbarItemProps = Omit<PropsOf<'button'>, 'disabled'> & {
	/** Cannot be activated, but stays in the roster and stays a destination. */
	readonly disabled?: boolean;
};

/**
 * Rooted by `toolbar.item` so the item owns a singular element handle of its
 * own, the way `buttongroup.item` does: its `el` slot is free because a toolbar
 * button is its own label and nothing points at it.
 */
export type ToolbarItemInstanceState = Seeded<ToolbarItemProps, 'disabled'>;
