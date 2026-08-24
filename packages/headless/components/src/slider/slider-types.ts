import type { PropsOf, Seeded } from '@markless/core';

/** Which axis the slider runs along, and the axis each thumb reports. */
export type SliderOrientation = 'horizontal' | 'vertical';

/**
 * Which of the two values a thumb holds. Flow-relative rather than left/right,
 * so the same markup reads correctly in right-to-left text and when the slider
 * runs vertically.
 */
export type SliderSide = 'start' | 'end';

/** What the callbacks report: one number, or the pair a two-value slider holds. */
export type SliderValue = number | [number, number];

/**
 * The slider itself; the label, track and thumbs go inside it. It holds the
 * range and the current value, and the shape of `value` is what decides the
 * slider: one number for one thumb, a pair for two. The family owns this
 * element's `style` attribute to carry the filled portion, so style the root
 * from a stylesheet rather than a `style` prop.
 */
export type SliderRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Where the slider sits now. A pair means two values. Omit it and it starts at `min`. */
	readonly value?: SliderValue;
	/** The bottom of the range. Omit it and the range starts at 0. */
	readonly min?: number;
	/** The top of the range. Omit it and the range ends at 100. */
	readonly max?: number;
	/** The smallest change a person can make. Omit it and it is 1. */
	readonly step?: number;
	/** Which axis the slider runs along. Omit it and it runs left to right. */
	readonly orientation?: SliderOrientation;
	/** Nobody can change the value. */
	readonly disabled?: boolean;
	/** Called with the new value every time it changes, including during a drag. */
	readonly onChange?: (value: SliderValue) => void;
	/** Called once the change settles: the pointer released, or the key that moved it. */
	readonly onChangeEnd?: (value: SliderValue) => void;
};

/**
 * The shared instance every slider part reads. `seed` is the root's `value` prop
 * untouched, because a seed position takes a prop or a constant and nothing else
 * — a pair cannot be split there. `startAt` and `endAt` are what a gesture has
 * written since, null until one has; the effective numbers are `start` and `end`
 * on the instance the factory returns.
 *
 * `axisStart`, `axisSize` and `isFlipped` are the track's measurement, taken
 * once per gesture — there is no resize observation, so a slider resized
 * mid-drag stays on the bounds the gesture started with.
 */
export type SliderInstanceState = Seeded<
	SliderRootProps,
	'min' | 'max' | 'step' | 'orientation' | 'disabled'
> & {
	seed: SliderValue | undefined;
	startAt: number | null;
	endAt: number | null;
	isDragging: boolean;
	dragSide: SliderSide;
	axisStart: number;
	axisSize: number;
	isFlipped: boolean;
	onChange?: SliderRootProps['onChange'];
	onChangeEnd?: SliderRootProps['onChangeEnd'];
};

/** Names the slider for a reader: every thumb points its `aria-labelledby` here. */
export type SliderLabelProps = PropsOf<'span'>;

/**
 * The rail, and the hit area a pointer gesture runs on. The family ships no CSS,
 * so the consumer owes it `position: relative` and `touch-action: none` —
 * without the second one a touch scrolls the page instead of moving a thumb.
 */
export type SliderTrackProps = PropsOf<'div'>;

/**
 * The handle a person drags or arrows, and the `role="slider"` element a reader
 * announces - a two-value slider has two of them, one per side. The family owns
 * its `style` attribute to carry the position along the track, so style it from
 * a stylesheet rather than a `style` prop.
 */
export type SliderThumbProps = PropsOf<'div'> & {
	/** Which of the two values this thumb holds. Omit it on a one-value slider. */
	readonly side?: SliderSide;
};

/** One instance per rendered `slider.thumb`: the side it was written with. */
export type SliderThumbInstanceState = Seeded<SliderThumbProps, 'side'>;

/**
 * The current value as text: one number, or both separated by an en dash. It
 * takes no children — a consumer who wants their own wording writes their own
 * element and reads `ui-value` off it.
 */
export type SliderValueLabelProps = Omit<PropsOf<'output'>, 'children'>;
