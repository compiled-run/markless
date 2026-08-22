import type { PropsOf } from '@markless/core';

export type ProgressRootProps = PropsOf<'div'> & {
	/** How far along the task is. Omit it, or pass `null`, for an unknown amount. */
	readonly value?: number | null;
	/** The bottom of the range. Omit it and the range starts at 0. */
	readonly min?: number;
	/** The top of the range. Omit it and the range ends at 100. */
	readonly max?: number;
};

export type ProgressLabelProps = PropsOf<'span'>;

/** The full length of the range; the indicator sits inside it. */
export type ProgressTrackProps = PropsOf<'div'>;

export type ProgressIndicatorProps = PropsOf<'div'>;
