import type { PropsOf } from '@markless/core';

/**
 * The progress bar itself; the label, track and indicator go inside it. It
 * renders the `role="progressbar"` element and holds the value and range every
 * other part reads. It sets no `aria-label` of its own - name it with a
 * `progress.label`, or spread your own label in.
 */
export type ProgressRootProps = PropsOf<'div'> & {
	/** How far along the task is. Omit it, or pass `null`, for an unknown amount. */
	readonly value?: number | null;
	/** The bottom of the range. Omit it and the range starts at 0. */
	readonly min?: number;
	/** The top of the range. Omit it and the range ends at 100. */
	readonly max?: number;
};

/** What `progress.root` hands the bar it renders: everything it was given. */
export type ProgressBarProps = PropsOf<'div'>;

/**
 * The bar's name. Mounting it is what names the `role="progressbar"` element,
 * and like every other part it carries `ui-progress`, `ui-value`, `ui-min` and
 * `ui-max` for styling.
 */
export type ProgressLabelProps = PropsOf<'span'>;

/** The full length of the range; the indicator sits inside it. */
export type ProgressTrackProps = PropsOf<'div'>;

/**
 * The filled part of the track. The family owns its `style` attribute - the fill
 * is a `translateX` written from the value - so style this part from a
 * stylesheet rather than a `style` prop.
 */
export type ProgressIndicatorProps = PropsOf<'div'>;
