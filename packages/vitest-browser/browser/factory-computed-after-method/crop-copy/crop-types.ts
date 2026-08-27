import type { PropsOf, Seeded } from '@markless/core';

/**
 * The crop rectangle, in area pixels: `x` and `y` are offsets from the crop
 * area's inline-start and block-start edges, `width` and `height` are sizes in
 * the area's own pixels.
 *
 * Not natural-image pixels. The family has no image — `crop.area` may hold a
 * picture, a video, a map or nothing — so the conversion to a media's intrinsic
 * size belongs to the consumer, and `scenarios/image.tsrx` shows it.
 */
export type CropRect = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

/**
 * A movable, resizable rectangle over a bounded area. An image cropper is one
 * styled consumer of it: the family knows nothing about bitmaps, only about a
 * rectangle and the box it lives in.
 *
 * The label, description, error, area, selection, handles and the form field all
 * go inside the root, which holds the rectangle and reports `ui-disabled`,
 * `ui-fixed`, `ui-dragging` and `ui-resizing` for styling.
 *
 * The family owns this element's `style` attribute to carry `--pan-x` and
 * `--pan-y`, so style the root from a stylesheet rather than a `style` prop.
 * Custom properties inherit, so content anywhere inside the area can apply them.
 */
export type CropRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * Where the rectangle sits now. Passing this makes the crop controlled: a
	 * gesture reports through `onChange` and nothing moves until the new rect
	 * comes back in. Leave it out and the crop keeps its own.
	 */
	readonly value?: CropRect;
	/** The rectangle an uncontrolled crop starts with. */
	readonly defaultValue?: CropRect;
	/**
	 * Width over height. Set it and a resize keeps that ratio; leave it out and
	 * the two axes are free. A declared `value` is never rewritten to fit — the
	 * lock applies to what a gesture produces.
	 */
	readonly aspect?: number;
	/** The narrowest the rectangle may be resized, in area pixels. Defaults to 40. */
	readonly minWidth?: number;
	/** The shortest the rectangle may be resized, in area pixels. Defaults to 40. */
	readonly minHeight?: number;
	/** The widest the rectangle may be resized. Defaults to no limit but the area. */
	readonly maxWidth?: number;
	/** The tallest the rectangle may be resized. Defaults to no limit but the area. */
	readonly maxHeight?: number;
	/**
	 * The rectangle stays where it is and the content pans underneath it. The
	 * area publishes `--pan-x` and `--pan-y`, which the consumer applies to their
	 * own content — the family never moves anything it does not own.
	 */
	readonly fixed?: boolean;
	/**
	 * How far one arrow key moves an edge or the rectangle, in area pixels.
	 * Defaults to 1. Shift multiplies it by 10 and Ctrl/Cmd by 50.
	 */
	readonly step?: number;
	/** Nothing can be moved or resized. */
	readonly disabled?: boolean;
	/** The form will not submit without a rectangle. */
	readonly required?: boolean;
	/** Submitted under this name by the field the family renders. */
	readonly name?: string;
	/** Called with the rectangle once a move or resize settles: the pointer released, or the key that moved it. */
	readonly onChange?: (rect: CropRect) => void;
	/** Called with the rectangle on every pointer move while a gesture is in flight. */
	readonly onDrag?: (rect: CropRect) => void;
};

/** Which axis Home and End act on. The last arrow key sets it; inline until one does. */
export type CropAxis = 'inline' | 'block';

/**
 * The cells every crop part reads and writes. One instance per crop.
 *
 * `areaInline`, `areaBlock`, `originInline`, `originBlock` and `inlineSign` are
 * the area's measurement. It is taken inside a gesture — on the first pointer
 * press, key or focus that reaches the widget — because this framework has no
 * mount hook and SPEC forbids polling frames for one. Zero sizes mean the area
 * has not been measured yet.
 */
export type CropInstanceState = Seeded<
	CropRootProps,
	| 'minWidth'
	| 'minHeight'
	| 'fixed'
	| 'step'
	| 'disabled'
	| 'required'
	| 'name'
> & {
	/** `defaultValue`, untouched. */
	seed: CropRect | undefined;
	/** The `value` prop. Defined means controlled. */
	given: CropRect | undefined;
	/**
	 * The family's own copy of the rectangle, as four numbers rather than one
	 * object: a whole-object write to a state cell does not reach the graph, so a
	 * gesture that replaced a rect cell would leave the page showing the old one.
	 */
	hasOwn: boolean;
	ownX: number;
	ownY: number;
	ownWidth: number;
	ownHeight: number;
	/** The `aspect` prop. Undefined means the two axes are free. */
	aspect: number | undefined;
	/** The `maxWidth` / `maxHeight` props. Undefined means no cap but the area. */
	maxWidth: number | undefined;
	maxHeight: number | undefined;
	/** Set by mounting `crop.error`, the same way textbox does it. */
	invalid: boolean;
	moving: boolean;
	resizing: boolean;
	/** True once the gesture in flight has actually changed the rectangle. */
	changed: boolean;
	keyAxis: CropAxis;
	areaInline: number;
	areaBlock: number;
	originInline: number;
	originBlock: number;
	/** -1 when the area computes to `direction: rtl`, so the inline axis runs the other way. */
	inlineSign: number;
	/** The pointer that owns the gesture in flight; -1 when none does. */
	pointerId: number;
	/** Where the pointer went down, in area units, and the rectangle it went down on. */
	grabInline: number;
	grabBlock: number;
	grabX: number;
	grabY: number;
	grabWidth: number;
	grabHeight: number;
	/** Which edges the resize in flight owns. */
	dragInlineStart: boolean;
	dragInlineEnd: boolean;
	dragBlockStart: boolean;
	dragBlockEnd: boolean;
	onChange?: CropRootProps['onChange'];
	onDrag?: CropRootProps['onDrag'];
};

/** The crop's name. It names the selection and every handle for a reader. */
export type CropLabelProps = PropsOf<'span'>;

/** Supporting text. It reaches the selection through `aria-describedby`. */
export type CropDescriptionProps = PropsOf<'div'>;

/** The validation message. Mounting it is what marks the crop invalid. */
export type CropErrorProps = PropsOf<'div'>;

/**
 * The bounded box the rectangle lives in. The consumer's content — an `<img>`, a
 * video, a chart — goes inside it, and so does `crop.selection`.
 *
 * Give it a size in CSS; the family sets no width or height of its own, and
 * measures whatever the consumer laid out. The pan offsets live on the root and
 * inherit down to here.
 */
export type CropAreaProps = PropsOf<'div'>;

/**
 * The rectangle itself: a `role="group"` named by `crop.label`, described by the
 * error, the description and a live rect readout the root keeps, and carrying
 * `aria-roledescription="crop area"`. It is a tab stop and it owns the move keys.
 *
 * The family owns its `style` attribute to carry `--x`, `--y`, `--width` and
 * `--height`, so style it from a stylesheet rather than a `style` prop.
 *
 * Keys, when it has focus: arrows move it by `step`, Shift by ten steps,
 * Ctrl/Cmd by fifty; Home and End send it to the area's edges on the axis the
 * last arrow used. A drag moves it too.
 */
export type CropSelectionProps = PropsOf<'div'>;

/**
 * One resize handle, and a `role="slider"` for the edge it owns. Eight of them
 * make the usual cropper: four edges and four corners.
 *
 * Which edges a handle owns is written as booleans rather than a position enum —
 * one from each axis makes a corner, one on its own makes an edge. They surface
 * as `ui-inline-start`, `ui-inline-end`, `ui-block-start` and `ui-block-end` for
 * the consumer's own CSS to position each handle with.
 *
 * Keys, when it has focus: the arrows along its axis move its edge by `step`,
 * Shift by ten steps, Ctrl/Cmd by fifty; Home and End send that edge to the
 * area's own bounds. A corner takes both axes.
 */
export type CropThumbProps = PropsOf<'div'> & {
	/** The handle owns the rectangle's inline-start edge. */
	readonly inlineStart?: boolean;
	/** The handle owns the rectangle's inline-end edge. */
	readonly inlineEnd?: boolean;
	/** The handle owns the rectangle's block-start edge. */
	readonly blockStart?: boolean;
	/** The handle owns the rectangle's block-end edge. */
	readonly blockEnd?: boolean;
};

/** One instance per rendered `crop.thumb`: the edges it was written with. */
export type CropThumbInstanceState = Seeded<
	CropThumbProps,
	'inlineStart' | 'inlineEnd' | 'blockStart' | 'blockEnd'
>;

/**
 * The rule-of-thirds grid, or any other purely-presentational overlay on the
 * rectangle. `aria-hidden`, no behaviour, and it covers the selection it sits in.
 */
export type CropIndicatorProps = PropsOf<'div'>;

/**
 * The element that submits. It carries `x,y,width,height` as text, and it is
 * clipped, `aria-hidden` and out of the tab order, so the selection and its
 * handles are the only things a person reaches.
 */
export type CropFieldProps = PropsOf<'input'>;
