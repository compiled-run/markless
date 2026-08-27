import type { PropsOf } from '@markless/core';

/** One handle's value. `id` is what a keyed repeat keys on and what a move writes back to. */
export type PadPoint = {
	readonly id: string;
	readonly x: number;
	readonly y: number;
};

/** Both axes' ends, carried together because every calculation needs all four. */
export type PadBounds = {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
};

/** The area's box in client coordinates, measured once when a gesture starts. */
export type PadBox = {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
};

/** Which axis a key moved. It decides which number the handle reports as its value. */
export type PadAxis = 'x' | 'y';

/**
 * A two-dimensional value control - an XY pad. Cartesian only: there is no polar
 * mode and no third axis, because ARIA exposes one value per control, so a third
 * axis is a `slider` composed beside this rather than an axis inside it.
 *
 * The label, the area, the handles, the readout and the form elements all go
 * inside the root. Units are the value range, not pixels: an audio pad holds Hz
 * and a pan/tilt pad holds degrees without rescaling in every callback.
 */
export type PadRootProps = Omit<PropsOf<'div'>, 'onChange' | 'onDrag'> & {
	/**
	 * The points. Passing this makes the pad controlled: a gesture reports
	 * through `onChange` and nothing moves until the new array comes back in.
	 * Leave it out and the pad keeps its own points.
	 */
	readonly value?: readonly PadPoint[];
	/** The points an uncontrolled pad starts with. */
	readonly defaultValue?: readonly PadPoint[];
	/** The low end of the x axis. Defaults to 0. */
	readonly minX?: number;
	/** The high end of the x axis. Defaults to 1. */
	readonly maxX?: number;
	/** The low end of the y axis. Defaults to 0. */
	readonly minY?: number;
	/** The high end of the y axis. Defaults to 1. */
	readonly maxY?: number;
	/** How far one arrow key moves a handle, on both axes. Defaults to 0.01. */
	readonly step?: number;
	/** Nothing can be moved, and every handle drops out of the tab order. */
	readonly disabled?: boolean;
	/** Called with every point once a move settles: the pointer released, or the key that moved it. */
	readonly onChange?: (points: readonly PadPoint[]) => void;
	/**
	 * Called with every point as a drag moves one, before it settles. The name
	 * shadows the DOM's own `ondrag`, which the root drops in exchange - a pad's
	 * area is not an HTML drag source, and `onChange` is dropped the same way.
	 */
	readonly onDrag?: (points: readonly PadPoint[]) => void;
};

/** The cells every pad part reads and writes. One instance per pad. */
export type PadInstanceState = {
	/** `defaultValue`, untouched. */
	seed: readonly PadPoint[];
	/** The `value` prop. Defined means controlled. */
	given: readonly PadPoint[] | undefined;
	/** The family's own copy of the points, and `null` until a gesture has written one. */
	held: readonly PadPoint[] | null;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	step: number;
	disabled: boolean;
	dragging: boolean;
	/** The handle a drag in flight owns; empty when none does. */
	dragId: string;
	/** The handle focus last reached, which is the one `pad.valuelabel` reads. */
	focusAt: string;
	/** The handle a run of keys is moving, and '' whenever no run is in progress. */
	movingId: string;
	/** The axis that run left the handle on. It is the number that handle reports. */
	axisAt: PadAxis;
	/** True once a key has moved the run's handle along the axis it was already on. */
	stepping: boolean;
	/** The area's box, measured once when a gesture begins rather than per move. */
	boxLeft: number;
	boxTop: number;
	boxWidth: number;
	boxHeight: number;
	onChange?: PadRootProps['onChange'];
	onDrag?: PadRootProps['onDrag'];
};

/** The handle's own cell: which point it draws. */
export type PadThumbInstanceState = {
	point: PadPoint | undefined;
};

/** Names the pad. `pad.area` and every `pad.thumb` point their labelling here. */
export type PadLabelProps = PropsOf<'span'>;

/** Supporting text. It reaches the area through `aria-describedby`. */
export type PadDescriptionProps = PropsOf<'div'>;

/** The validation message. It reaches the area before the description. */
export type PadErrorProps = PropsOf<'div'>;

/**
 * The bounded field. It owns the pointer gesture and nothing else: a press
 * anywhere inside it jumps the nearest handle and drags it from there.
 *
 * The consumer owes it a size. The family ships `position: relative` and
 * `touch-action: none` and no dimensions at all.
 */
export type PadAreaProps = PropsOf<'div'>;

/**
 * One handle: a real focusable control, one tab stop each, moved by the arrow
 * keys. Write one per point inside a keyed repeat, or a single bare
 * `<pad.thumb />` for a one-handle pad.
 */
export type PadThumbProps = PropsOf<'div'> & {
	/** The point this handle draws. Omit it on a one-handle pad and it takes the first point. */
	readonly value?: PadPoint;
};

/** The focused handle's value as text, or the first handle's on a pad nobody has touched. */
export type PadValueLabelProps = PropsOf<'output'>;

/** One handle's value as a form field. Write one per handle, each under its own name. */
export type PadFieldProps = Omit<PropsOf<'input'>, 'value'> & {
	/** The handle this field submits. Omit it on a one-handle pad. */
	readonly value?: PadPoint;
};

/** A grid, a crosshair or whatever else the field is drawn with. It carries no value. */
export type PadIndicatorProps = PropsOf<'div'>;
