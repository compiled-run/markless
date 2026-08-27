import { computed, element, shared, state } from '@markless/core';
import {
	boundedValue,
	currentEnd,
	currentStart,
	keyTarget,
	nearerSide,
	pointerFraction,
	reportedValue,
	rootStyleText,
	thumbStyleText,
	valueAtFraction,
	valueText,
} from './slider-math.ts';
import { isRightToLeft, measureTrack } from './slider-track.ts';
import type {
	SliderInstanceState,
	SliderLabelProps,
	SliderOrientation,
	SliderRootProps,
	SliderSide,
	SliderThumbInstanceState,
	SliderThumbProps,
	SliderTrackProps,
	SliderValueLabelProps,
} from './slider-types.ts';

export const sliderState = shared(
	() => {
		const slider: SliderInstanceState = state({
			seed: undefined,
			startAt: null,
			endAt: null,
			min: 0,
			max: 100,
			step: 1,
			orientation: 'horizontal' as SliderOrientation,
			disabled: false,
			isDragging: false,
			dragSide: 'end' as SliderSide,
			axisStart: 0,
			axisSize: 0,
			isFlipped: false,
		});
		const labelEl = element<HTMLSpanElement>();
		const trackEl = element<HTMLDivElement>();
		const thumbEls = element<HTMLDivElement[]>();

		const start = computed(() => currentStart(slider.startAt, slider.seed, slider.min));
		const end = computed(() => currentEnd(slider.endAt, slider.seed, slider.min));

		return {
			...slider,
			labelEl,
			trackEl,
			thumbEls,
			start,
			end,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: number | [number, number]) => void) | undefined,
			onChangeEnd: undefined as ((value: number | [number, number]) => void) | undefined,

			/** A keystroke is a whole interaction, so the value both changes and settles here. */
			moveTo(side: SliderSide, next: number) {
				if (slider.disabled) return;

				const isRange = Array.isArray(slider.seed);
				const from = start;
				const to = end;
				const bounded = boundedValue(
					next,
					slider.min,
					slider.max,
					slider.step,
					from,
					to,
					side,
					isRange,
				);
				if (bounded === (side === 'start' ? from : to)) return;

				if (side === 'start') slider.startAt = bounded;
				else slider.endAt = bounded;

				const landed = reportedValue(
					isRange,
					side === 'start' ? bounded : from,
					side === 'start' ? to : bounded,
				);
				slider.onChange?.(landed);
				slider.onChangeEnd?.(landed);
			},

			beginDrag(clientX: number, clientY: number, pointerId: number) {
				if (slider.disabled) return;

				const track = trackEl;
				if (!track) return;

				const axis = measureTrack(track, slider.orientation);
				slider.axisStart = axis.start;
				slider.axisSize = axis.size;
				slider.isFlipped = axis.isFlipped;

				const along = slider.orientation === 'vertical' ? clientY : clientX;
				const fraction = pointerFraction(along, axis.start, axis.size, axis.isFlipped);
				const landed = valueAtFraction(fraction, slider.min, slider.max, slider.step);
				const side = nearerSide(landed, start, end, Array.isArray(slider.seed));
				slider.dragSide = side;
				slider.isDragging = true;

				// Pointer capture rather than window listeners: the gesture keeps arriving here once the pointer leaves the track.
				track.setPointerCapture(pointerId);

				const thumbs = thumbEls ?? [];
				const moved = side === 'start' ? thumbs[0] : thumbs[thumbs.length - 1];
				moved?.focus();
			},

			dragTo(clientX: number, clientY: number) {
				if (!slider.isDragging) return;

				const along = slider.orientation === 'vertical' ? clientY : clientX;
				const fraction = pointerFraction(
					along,
					slider.axisStart,
					slider.axisSize,
					slider.isFlipped,
				);
				const aimed = valueAtFraction(fraction, slider.min, slider.max, slider.step);
				const side = slider.dragSide;
				const isRange = Array.isArray(slider.seed);
				const from = start;
				const to = end;
				const bounded = boundedValue(
					aimed,
					slider.min,
					slider.max,
					slider.step,
					from,
					to,
					side,
					isRange,
				);
				if (bounded === (side === 'start' ? from : to)) return;

				if (side === 'start') slider.startAt = bounded;
				else slider.endAt = bounded;

				slider.onChange?.(
					reportedValue(
						isRange,
						side === 'start' ? bounded : from,
						side === 'start' ? to : bounded,
					),
				);
			},

			endDrag() {
				if (!slider.isDragging) return;

				slider.isDragging = false;
				slider.onChangeEnd?.(reportedValue(Array.isArray(slider.seed), start, end));
			},
		};
	},
	{ scope: 'widget' },
);

export function SliderRoot({
	value,
	min = 0,
	max = 100,
	step = 1,
	orientation = 'horizontal',
	disabled = false,
	onChange,
	onChangeEnd,
	children,
	...rest
}: SliderRootProps) @{
	const slider = sliderState();
	slider.onChange = onChange;
	slider.onChangeEnd = onChangeEnd;
	slider.seed = value;
	slider.min = min;
	slider.max = max;
	slider.step = step;
	slider.orientation = orientation;
	slider.disabled = disabled;

	// A group only when there are two thumbs: one thumb is the whole control and needs no wrapper role.
	const groupRole = computed(() => (Array.isArray(slider.seed) ? 'group' : undefined));
	const filled = computed(() =>
		rootStyleText(slider.start, slider.end, slider.min, slider.max),
	);

	<div
		{...rest}
		role={groupRole}
		style={filled}
		ui-orientation={slider.orientation}
		ui-disabled={slider.disabled}
		ui-min={slider.min}
		ui-max={slider.max}
	>{children}</div>
}

export function SliderLabel({ children, ...rest }: SliderLabelProps) @{
	const slider = sliderState();

	<span {...rest} el={slider.labelEl} ui-disabled={slider.disabled}>{children}</span>
}

export function SliderTrack({
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	...rest
}: SliderTrackProps) @{
	const slider = sliderState();

	<div
		{...rest}
		el={slider.trackEl}
		ui-orientation={slider.orientation}
		ui-disabled={slider.disabled}
		ui-dragging={slider.isDragging}
		ui-min={slider.min}
		ui-max={slider.max}
		onPointerdown={(event) => {
			if (event.button === 0) {
				slider.beginDrag(event.clientX, event.clientY, event.pointerId);
				slider.dragTo(event.clientX, event.clientY);
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			slider.dragTo(event.clientX, event.clientY);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			slider.endDrag();
			onPointerup?.(event);
		}}
	>{children}</div>
}

export function SliderThumb({ side = 'end', children, onKeydown, ...rest }: SliderThumbProps) @{
	const slider = sliderState();
	// The side as a graph cell: compared against the prop instead, the comparison stops refreshing once the page has resumed.
	const thumb: SliderThumbInstanceState = state({ side });

	const now = computed(() => (thumb.side === 'start' ? slider.start : slider.end));
	const lowest = computed(() =>
		thumb.side === 'end' && Array.isArray(slider.seed) ? slider.start : slider.min,
	);
	const highest = computed(() =>
		thumb.side === 'start' && Array.isArray(slider.seed) ? slider.end : slider.max,
	);
	const offset = computed(() =>
		thumbStyleText(thumb.side === 'start' ? slider.start : slider.end, slider.min, slider.max),
	);
	const sideName = computed(() => (Array.isArray(slider.seed) ? thumb.side : undefined));
	const isActive = computed(() => slider.isDragging && slider.dragSide === thumb.side);
	const tabStop = computed(() => (slider.disabled ? -1 : 0));
	const ariaDisabled = computed(() => (slider.disabled ? 'true' : 'false'));

	<div
		{...rest}
		el={slider.thumbEls}
		role="slider"
		tabindex={tabStop}
		style={offset}
		aria-labelledby={slider.labelEl}
		aria-valuemin={lowest}
		aria-valuemax={highest}
		aria-valuenow={now}
		aria-disabled={ariaDisabled}
		ui-orientation={slider.orientation}
		ui-disabled={slider.disabled}
		ui-dragging={isActive}
		ui-side={sideName}
		ui-value={now}
		ui-min={slider.min}
		ui-max={slider.max}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'PageUp' ||
				event.key === 'PageDown' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const next = keyTarget(
				event.key,
				event.shiftKey,
				now,
				slider.min,
				slider.max,
				slider.step,
				isRightToLeft(slider.trackEl),
			);
			if (next === null) {
				onKeydown?.(event);
				return;
			}

			slider.moveTo(thumb.side, next);
			onKeydown?.(event);
		}}
	>{children}</div>
}

// Renders the value rather than accepting children: a part cannot tell whether it
// was given any, so a fallback branch would render nothing for everybody.
export function SliderValueLabel({ ...rest }: SliderValueLabelProps) @{
	const slider = sliderState();
	const text = computed(() => valueText(Array.isArray(slider.seed), slider.start, slider.end));

	<output
		{...rest}
		ui-orientation={slider.orientation}
		ui-disabled={slider.disabled}
		ui-value={text}
		ui-min={slider.min}
		ui-max={slider.max}
	>{text}</output>
}
