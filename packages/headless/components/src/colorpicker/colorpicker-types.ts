import type { PropsOf, Seeded } from '@markless/core';
import type { ColorChannel } from './colorpicker-math.ts';

export type { ColorChannel, ChannelRange, Hsb, Hsl, Rgb } from './colorpicker-math.ts';

// The family ships no CSS, so the consumer owes `colorpicker.area` and every
// `colorpicker.track` a size, `position: relative` and `touch-action: none` —
// without the last one a touch scrolls the page instead of moving a thumb.

/**
 * The colour picker itself; the label, the area, the rails, the swatches and the
 * form element all go inside it.
 *
 * `value` is a seed, not a controlled mirror: once a gesture has run the picker
 * holds its own colour and the prop is never read again. Feeding every `onChange`
 * back into `value` is redundant rather than harmful — and it is what would make
 * the 8-bit hex quantisation visible, since `#5A8FB3` parses back a fraction of a
 * degree off the hue it was written from.
 */
export type ColorpickerRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The colour to start on: `#rgb`, `#rrggbb`, `rgb()`, `hsl()` or `hsb()`, with or without alpha. Omit it and the picker starts white. */
	readonly value?: string;
	/** The colours `colorpicker.state().swatches` hands back for the consumer to repeat over. */
	readonly swatches?: readonly string[];
	/** Keep and show the alpha channel. HTML's own spelling, from `<input type="color" alpha>`. */
	readonly alpha?: boolean;
	/** Nobody can change the colour, and every control drops out of the tab order. */
	readonly disabled?: boolean;
	/** The colour can be read but not changed. */
	readonly readonly?: boolean;
	/** The form element must carry a colour before a form submits. */
	readonly required?: boolean;
	/** Report the control as invalid. A prop, not a consequence of mounting `colorpicker.error`. */
	readonly invalid?: boolean;
	/** Submitted under this name by `colorpicker.field`. */
	readonly name?: string;
	/** The picker lives behind `colorpicker.trigger` instead of rendering in place. */
	readonly popup?: boolean;
	/** Called with the new colour every time it changes, including during a drag. */
	readonly onChange?: (value: string) => void;
	/** Called once the change settles: the pointer released, the key that moved it, or a typed entry committed. */
	readonly onChangeEnd?: (value: string) => void;
};

/**
 * The shared instance every colorpicker part reads.
 *
 * `seed` is the root's `value` prop untouched — a shared cell takes a bare prop
 * and nothing else, so the parse happens at every read rather than on the way in.
 * `text` is the canonical `hsb(h, s%, b%, a)` string a gesture has written since,
 * empty until one has. `bounds*` are the gesture's measurement, taken once when it
 * starts.
 */
export type ColorpickerInstanceState = Seeded<
	ColorpickerRootProps,
	'disabled' | 'readonly' | 'required' | 'invalid' | 'popup'
> & {
	seed: string;
	/** The form name. Spelled apart from the `name` the state hands back, which is the colour's. */
	fieldName: string;
	text: string;
	withAlpha: boolean;
	swatches: readonly string[];
	open: boolean;
	dragging: boolean;
	/** Which of the area's two axis controls owns the tab stop. */
	axisAt: 'x' | 'y';
	/** True once a key has moved the area since focus arrived, which shortens what each axis announces. */
	stepping: boolean;
	dragChannel: ColorChannel | '';
	boundsLeft: number;
	boundsTop: number;
	boundsWidth: number;
	boundsHeight: number;
	boundsFlipped: boolean;
	onChange?: ColorpickerRootProps['onChange'];
	onChangeEnd?: ColorpickerRootProps['onChangeEnd'];
};

/** Names the picker for a reader: `colorpicker.area` and `colorpicker.content` point their `aria-labelledby` here. */
export type ColorpickerLabelProps = PropsOf<'label'>;

/** Supporting text, named by the area's `aria-describedby` after any error. */
export type ColorpickerDescriptionProps = PropsOf<'div'>;

/** The validation message, named ahead of the description. `invalid` on the root is what marks the control invalid. */
export type ColorpickerErrorProps = PropsOf<'div'>;

/**
 * The saturation-by-brightness plane. It is `role="group"` and renders its own two
 * one-axis `role="slider"` controls, because one element carries one
 * `aria-valuenow` — a single slider would leave brightness unreachable to anyone
 * adjusting it with a reader. Put a `colorpicker.thumb` with no `channel` inside
 * it as the visible marker.
 */
export type ColorpickerAreaProps = PropsOf<'div'>;

/**
 * One channel's rail and the hit area its pointer gesture runs on. The family
 * publishes `--colorpicker-start` and `--colorpicker-end` for the gradient rather
 * than painting one, so the stylesheet owns the look.
 */
export type ColorpickerTrackProps = PropsOf<'div'> & {
	/** Which number this rail carries. Omit it and the rail is the hue rail. */
	readonly channel?: ColorChannel;
};

/**
 * The handle. Inside a `colorpicker.track` it is that channel's `role="slider"`
 * control and takes the same `channel`; inside `colorpicker.area` it takes none
 * and is the `role="presentation"` marker the area positions. The family owns its
 * `style` attribute, so style it from a stylesheet rather than a `style` prop.
 */
export type ColorpickerThumbProps = PropsOf<'div'> & {
	/** The rail this handle belongs to. Omit it inside `colorpicker.area`. */
	readonly channel?: ColorChannel;
};

/**
 * A box a person types a colour into. Omit `channel` for hex; name one for that
 * channel's number. A character that could not lead to a valid entry never lands,
 * and an entry that is still incomplete when the box is left reverts — so the box
 * has no invalid state of its own, and `aria-invalid` comes from the root's
 * `invalid` prop alone.
 */
export type ColorpickerInputProps = PropsOf<'input'> & {
	/** Which number this box carries. Omit it and the box holds the hex. */
	readonly channel?: ColorChannel;
};

/** One swatch: a real `<button>` carrying `aria-pressed`, named by its colour and its value. */
export type ColorpickerItemProps = PropsOf<'button'> & {
	/** The colour this swatch chooses, in any notation `value` accepts. */
	readonly value: string;
};

/** The colour as text — its name and its hex — or whatever children are written instead. */
export type ColorpickerValueLabelProps = PropsOf<'output'>;

/** The element a form submits: an `<input type="text">`, clipped and out of the tab order. */
export type ColorpickerFieldProps = PropsOf<'input'>;

/** Opens the popup shape. Only rendered when the root carries `popup`. */
export type ColorpickerTriggerProps = PropsOf<'button'>;

/** The one surface both shapes use: in place when the picker is inline, revealed by the trigger under `popup`. */
export type ColorpickerContentProps = PropsOf<'div'>;

/** One instance per rendered rail or handle: the channel it was written with. */
export type ColorpickerChannelInstanceState = { channel: ColorChannel | '' };

/** One instance per rendered swatch: the colour it stands for. */
export type ColorpickerItemInstanceState = Seeded<ColorpickerItemProps, 'value'>;
