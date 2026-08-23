import { computed, element, shared, state } from '@markless/core';
import type {
	ProgressBarProps,
	ProgressIndicatorProps,
	ProgressLabelProps,
	ProgressRootProps,
	ProgressTrackProps,
} from './progress-types.ts';

export const progressState = shared(
	() => {
		const progress = state({
			value: null as number | null,
			min: 0,
			max: 100,
		});
		const labelEl = element<HTMLSpanElement>();

		return {
			...progress,
			labelEl,
			status: computed(() => {
				if (progress.value === null) return 'indeterminate';
				const covered = (progress.value - progress.min) / (progress.max - progress.min);
				return covered >= 1 ? 'complete' : 'loading';
			}),
			// ARIA: an indeterminate bar reports no current value at all, so null here
			// rather than a percentage computed from `min`.
			valueText: computed(() => {
				if (progress.value === null) return null;
				const covered = (progress.value - progress.min) / (progress.max - progress.min);
				return `${Math.round(covered * 100)}%`;
			}),
			indicatorStyle: computed(() => {
				const value = progress.value === null ? progress.min : progress.value;
				const covered = (value - progress.min) / (progress.max - progress.min);
				return `transform: translateX(-${100 - covered * 100}%)`;
			}),
		};
	},
	{ scope: 'widget' },
);

export function ProgressRoot({
	value = null,
	min = 0,
	max = 100,
	children,
	...rest
}: ProgressRootProps) @{
	const progress = progressState();
	progress.value = value;
	progress.min = min;
	progress.max = max;

	<ProgressBar {...rest}>{children}</ProgressBar>
}

// A separate part rather than the root's own element: a widget root cannot read its
// own instance token, so the label IDREF only resolves one component deeper.
function ProgressBar({ children, ...rest }: ProgressBarProps) @{
	const progress = progressState();

	// No aria-label default. A hard-coded one would name every bar on the page the
	// same and would beat whatever the consumer spreads in; a bar with no
	// `progress.label` takes the consumer's own name through `{...rest}`.
	<div
		{...rest}
		role="progressbar"
		aria-labelledby={progress.labelEl}
		aria-valuemin={progress.min}
		aria-valuemax={progress.max}
		aria-valuenow={progress.value}
		aria-valuetext={progress.valueText}
		ui-progress={progress.status}
		ui-value={progress.value}
		ui-min={progress.min}
		ui-max={progress.max}
	>{children}</div>
}

export function ProgressLabel({ children, ...rest }: ProgressLabelProps) @{
	const progress = progressState();

	<span
		{...rest}
		el={progress.labelEl}
		ui-progress={progress.status}
		ui-value={progress.value}
		ui-min={progress.min}
		ui-max={progress.max}
	>{children}</span>
}

export function ProgressTrack({ children, ...rest }: ProgressTrackProps) @{
	const progress = progressState();

	<div
		{...rest}
		ui-progress={progress.status}
		ui-value={progress.value}
		ui-min={progress.min}
		ui-max={progress.max}
	>{children}</div>
}

export function ProgressIndicator({ children, ...rest }: ProgressIndicatorProps) @{
	const progress = progressState();

	<div
		{...rest}
		style={progress.indicatorStyle}
		ui-progress={progress.status}
		ui-value={progress.value}
		ui-min={progress.min}
		ui-max={progress.max}
	>{children}</div>
}
