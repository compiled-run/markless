import type { PropsOf } from '@markless/core';
import type { InkPoint } from './ink-stroke.ts';

/**
 * A freehand drawing surface. A signature pad is one styled consumer of it: the
 * family knows nothing about signatures, only about strokes.
 *
 * The label, description, error, drawing area, guide line and the form field all
 * go inside the root, which holds the drawing and reports `ui-disabled`,
 * `ui-readonly`, `ui-empty` and `ui-drawing` for styling.
 *
 * There is no clear or undo part. Both are one line in a consumer's own button —
 * `ink.state().clear()`, `ink.state().undo()` — and a button the family owned
 * would only be a button the consumer had to restyle.
 */
export type InkRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The strokes, as SVG path data. Passing this makes the drawing controlled:
	 * a gesture reports through `onChange` and nothing appears until the new array
	 * comes back in. Leave it out and the drawing keeps its own strokes.
	 */
	readonly paths?: readonly string[];
	/** The strokes an uncontrolled drawing starts with. */
	readonly defaultPaths?: readonly string[];
	/** Stroke width in px at full pressure. Defaults to 2. */
	readonly size?: number;
	/**
	 * Vary the stroke width with pointer pressure. On by default. A device that
	 * reports no pressure of its own has it derived from how fast the pointer
	 * moved, which is what gives a mouse or a trackpad the same tapering.
	 */
	readonly pressure?: boolean;
	/** Nothing can be drawn, undone or cleared. */
	readonly disabled?: boolean;
	/** The drawing is shown but cannot be changed. */
	readonly readonly?: boolean;
	/** Something must be drawn before a form submits. */
	readonly required?: boolean;
	/** Submitted under this name by the field the family renders. */
	readonly name?: string;
	/** Called with the whole drawing whenever a stroke lands, or is undone, redone or cleared. */
	readonly onChange?: (paths: readonly string[]) => void;
	/** Called with the in-progress stroke's path data as it is being drawn. */
	readonly onDraw?: (current: string) => void;
};

/** The cells every ink part reads and writes. One instance per drawing. */
export type InkInstanceState = {
	/** `defaultPaths`, untouched. */
	seed: readonly string[];
	/** The `paths` prop. Defined means controlled. */
	given: readonly string[] | undefined;
	/**
	 * The family's own copy of the drawing: what gestures, undo, redo and clear
	 * have written, and `null` until one of them has. A consumer's own button
	 * writes this cell directly — `drawing.strokes = []` clears — because a
	 * shared() method called from another module does not compile yet.
	 */
	strokes: readonly string[] | null;
	/** Strokes taken off by `undo`, newest last. The next committed stroke empties it. */
	undone: readonly string[];
	/** The samples of the stroke being drawn right now, in area-local coordinates. */
	points: readonly InkPoint[];
	drawing: boolean;
	/** True when the device drawing this stroke reports no pressure of its own. */
	simulate: boolean;
	size: number;
	pressure: boolean;
	disabled: boolean;
	readonly: boolean;
	required: boolean;
	/** Set by mounting `ink.error`, the same way textbox does it. */
	invalid: boolean;
	name: string;
	/** The area's top-left in client coordinates, measured once when a stroke begins. */
	boxLeft: number;
	boxTop: number;
	/** The pointer that owns the stroke in flight; -1 when none does. */
	pointerId: number;
	onChange?: InkRootProps['onChange'];
	onDraw?: InkRootProps['onDraw'];
};

/** The drawing's name. It names the area for a reader. */
export type InkLabelProps = PropsOf<'span'>;

/** Supporting text. It reaches the area through `aria-describedby`. */
export type InkDescriptionProps = PropsOf<'div'>;

/** The validation message. Mounting it is what marks the drawing invalid. */
export type InkErrorProps = PropsOf<'div'>;

/**
 * The surface a person draws on: an `<svg>` the family owns, with one `<path>`
 * per committed stroke and one more for the stroke in flight.
 *
 * It is `role="img"` named by the label, described by the description and by a
 * live stroke count the root keeps, and it is a tab stop — the keyboard route to
 * the drawing, though not a way to draw with. Give it a size in CSS; the family
 * sets no width or height of its own.
 *
 * Keys, when it has focus: Cmd/Ctrl+Z undoes the last stroke, Shift+Cmd/Ctrl+Z
 * or Ctrl+Y redoes it, Escape drops the stroke being drawn.
 */
export type InkAreaProps = PropsOf<'svg'>;

/**
 * The guide line a signature is written on: an SVG `<line>`, `aria-hidden`, with
 * no behaviour at all. Give it `x1`/`y1`/`x2`/`y2` — percentages work — or leave
 * them and it spans the area three quarters of the way down.
 */
export type InkIndicatorProps = PropsOf<'line'>;

/**
 * The element that submits. It carries every stroke's path data joined into one
 * `d` string, and it is clipped, `aria-hidden` and out of the tab order, so the
 * area is the only thing a person reaches.
 */
export type InkFieldProps = PropsOf<'input'>;
