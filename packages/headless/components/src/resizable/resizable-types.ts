import type { PropsOf, Seeded } from '@markless/core';

/** Which axis the panels are laid along. The dividers run across it. */
export type ResizableOrientation = 'horizontal' | 'vertical';

/**
 * Every panel's size, keyed by the `value` its `resizable.item` was written
 * with, as a share of its group from 0 to 100. One record covers a whole widget,
 * nested groups included, because a name is unique in the page rather than in a
 * group.
 */
export type ResizableSizes = Record<string, number>;

/**
 * A row or column of panels a person can resize by dragging or arrowing the
 * dividers between them.
 *
 * The panels and the dividers go inside the root, in the order they appear.
 * A panel is `resizable.item` and carries the name its size is keyed by; a
 * divider is `resizable.thumb` and carries the name of the panel it resizes,
 * along with that panel's limits.
 */
export type ResizableRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The sizes in force. Passing this makes the widget controlled: a gesture
	 * reports through `onChange` and nothing moves until the new record comes
	 * back in. Leave it out and the widget keeps its own.
	 */
	readonly sizes?: ResizableSizes;
	/** The sizes an uncontrolled widget starts with. A panel left out is an equal share. */
	readonly defaultSizes?: ResizableSizes;
	/** Which axis the panels are laid along. Omit it and they sit side by side. */
	readonly orientation?: ResizableOrientation;
	/** How far one arrow key moves a divider, in points of the group. Defaults to 1; Shift multiplies it by ten. */
	readonly step?: number;
	/** Nothing can be resized. */
	readonly disabled?: boolean;
	/** Called with every panel's size each time one changes, including during a drag. */
	readonly onChange?: (sizes: ResizableSizes) => void;
	/** Called once a change settles: the pointer released, or the key that moved it. */
	readonly onChangeEnd?: (sizes: ResizableSizes) => void;
};

/**
 * The cells every resizable part reads. One instance per widget, nested groups
 * included.
 *
 * `groupSize` and the `grab*` cells are the gesture in flight: the group is
 * measured once when the press lands rather than per frame, so a widget resized
 * mid-drag stays on the measurement the gesture started with.
 */
export type ResizableInstanceState = Seeded<
	ResizableRootProps,
	'orientation' | 'step' | 'disabled'
> & {
	/** `defaultSizes`, untouched. */
	seed: ResizableSizes | undefined;
	/** The `sizes` prop. Defined means controlled. */
	given: ResizableSizes | undefined;
	/** The family's own record. Undefined until a gesture writes one. */
	own: ResizableSizes | undefined;
	/** What each collapsed panel measured before it was collapsed. */
	remembered: ResizableSizes;
	/** Which panels are collapsed right now. */
	collapsed: Record<string, boolean>;
	/** The name of the panel the divider in flight resizes; empty when nothing is being dragged. */
	dragging: string;
	/** The name of the panel it takes from, worked out when the press lands. */
	behind: string;
	/** True once the gesture in flight has actually moved something. */
	changed: boolean;
	/** The record the gesture in flight started from, so a drag that wanders lands where the pointer is. */
	grabbed: ResizableSizes;
	/** Where along the axis the press landed, and the group's size on that axis. */
	grabAlong: number;
	groupSize: number;
	/** The low value sits at the right edge in right-to-left text. */
	isFlipped: boolean;
	onChange?: ResizableRootProps['onChange'];
	onChangeEnd?: ResizableRootProps['onChangeEnd'];
};

/**
 * One panel. `value` names it: the sizes record is keyed by it, it is minted as
 * the panel's `id` so a divider's `aria-controls` can point here, and it must
 * therefore be unique in the page.
 *
 * The family owns this element's `style` attribute to carry `--size`, so style a
 * panel from a stylesheet rather than a `style` prop.
 */
export type ResizableItemProps = PropsOf<'div'> & {
	/** This panel's name. */
	readonly value: string;
	/** Set it to host a nested group inside this panel, laid along that axis. */
	readonly orientation?: ResizableOrientation;
};

/** One instance per rendered `resizable.item`: the name and axis it was written with. */
export type ResizableItemInstanceState = Seeded<ResizableItemProps, 'value'> & {
	orientation: ResizableOrientation | undefined;
};

/**
 * The divider between two panels, and the APG window splitter a reader
 * announces: a focusable `role="separator"` carrying the primary panel's size as
 * its value. It resizes the panel it names and the panel that follows it in the
 * same group.
 *
 * It carries no name of its own: write `aria-label` on every divider, naming the
 * panel it resizes, since a group with several of them needs them told apart.
 */
export type ResizableThumbProps = PropsOf<'div'> & {
	/** The name of the primary panel: the one this divider resizes and reports. */
	readonly value: string;
	/** The smallest the primary panel may be, as a share of the group. Defaults to 0. */
	readonly min?: number;
	/** The largest the primary panel may be. Defaults to 100. */
	readonly max?: number;
	/** Enter collapses the primary panel and restores it. */
	readonly collapsible?: boolean;
	/** What the primary panel measures when collapsed. Defaults to 0. */
	readonly collapsedSize?: number;
	/** The axis of the group this divider sits in. Omit it and the root's axis is used. */
	readonly orientation?: ResizableOrientation;
};

/** One instance per rendered `resizable.thumb`: the limits it was written with. */
export type ResizableThumbInstanceState = Seeded<
	ResizableThumbProps,
	'value' | 'min' | 'max' | 'collapsible' | 'collapsedSize'
> & {
	orientation: ResizableOrientation | undefined;
};
