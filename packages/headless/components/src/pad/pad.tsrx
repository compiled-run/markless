// Two measured walls shape this file. Every computed carries a name unique to the
// whole module and reads its cells into locals before calling anything: two parts
// sharing a computed name resolve to one symbol, and a cell read nested inside a
// call has no name to lower to.

import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	axisFor,
	axisHighest,
	axisLowest,
	axisValue,
	boundsOf,
	boxOf,
	capturePointer,
	fieldText,
	heldPoint,
	heldPoints,
	idOf,
	keyTarget,
	movedPoints,
	nearestId,
	nextAxis,
	nextStepping,
	pointIndex,
	pointText,
	shortFor,
	snapToStep,
	thumbStyleText,
	valueAtPointer,
	valueText,
} from './pad-math.ts';
import type {
	PadAreaProps,
	PadAxis,
	PadDescriptionProps,
	PadErrorProps,
	PadFieldProps,
	PadIndicatorProps,
	PadInstanceState,
	PadLabelProps,
	PadPoint,
	PadRootProps,
	PadThumbInstanceState,
	PadThumbProps,
	PadValueLabelProps,
} from './pad-types.ts';

export const padState = shared(
	() => {
		const pad: PadInstanceState = state({
			seed: [] as readonly PadPoint[],
			given: undefined,
			held: null,
			minX: 0,
			maxX: 1,
			minY: 0,
			maxY: 1,
			step: 0.01,
			disabled: false,
			dragging: false,
			dragId: '',
			focusAt: '',
			movingId: '',
			axisAt: 'x' as PadAxis,
			stepping: false,
			boxLeft: 0,
			boxTop: 0,
			boxWidth: 0,
			boxHeight: 0,
		});
		const areaEl = element<HTMLDivElement>();
		const labelEl = element<HTMLSpanElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const thumbEls = element<HTMLDivElement[]>();

		const points = computed(() => {
			const given = pad.given;
			const own = pad.held;
			const seed = pad.seed;
			return heldPoints(given, own, seed);
		});

		return {
			...pad,
			areaEl,
			labelEl,
			descriptionEl,
			errorEl,
			thumbEls,
			points,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((points: readonly PadPoint[]) => void) | undefined,
			onDrag: undefined as ((points: readonly PadPoint[]) => void) | undefined,

			/**
			 * Moves one handle by a key. A keystroke is a whole interaction, so the
			 * value changes and settles in the same call and only `onChange` fires.
			 */
			stepTo(id: string, key: string, isBig: boolean) {
				if (pad.disabled) return;

				const lowX = pad.minX;
				const highX = pad.maxX;
				const lowY = pad.minY;
				const highY = pad.maxY;
				const size = pad.step;
				const list = points;
				const running = pad.movingId;
				const held = pad.axisAt;
				const short = pad.stepping;
				const ends = boundsOf(lowX, highX, lowY, highY);
				const from = heldPoint(list, id, ends);
				const axisAt = axisFor(running, from.id, held);
				const aimed = keyTarget(key, isBig, from, ends, size, axisAt);
				if (aimed === null) return;

				// Set before the no-op guard: a key stopped by a clamp still says which axis it tried.
				pad.axisAt = nextAxis(key, axisAt);
				pad.stepping = nextStepping(key, axisAt, shortFor(running, from.id, short));
				pad.movingId = from.id;

				const next = movedPoints(
					list,
					from.id,
					snapToStep(aimed.x, lowX, highX, size),
					snapToStep(aimed.y, lowY, highY, size),
				);
				if (next === list) return;

				pad.held = next;
				pad.onChange?.(next);
			},

			/**
			 * A press anywhere in the area takes the nearest handle, focuses it and
			 * drags it from there. The box is measured once here rather than per move.
			 */
			beginDrag(clientX: number, clientY: number, pointerId: number) {
				if (pad.disabled) return;

				const surface = areaEl;
				if (!surface) return;

				const box = surface.getBoundingClientRect();
				pad.boxLeft = box.left;
				pad.boxTop = box.top;
				pad.boxWidth = box.width;
				pad.boxHeight = box.height;

				const lowX = pad.minX;
				const highX = pad.maxX;
				const lowY = pad.minY;
				const highY = pad.maxY;
				const size = pad.step;
				const list = points;
				const ends = boundsOf(lowX, highX, lowY, highY);
				const aimed = valueAtPointer(
					clientX,
					clientY,
					boxOf(box.left, box.top, box.width, box.height),
					ends,
					size,
				);
				const id = nearestId(list, aimed.x, aimed.y, ends);

				pad.dragId = id;
				pad.dragging = true;
				pad.focusAt = id;
				// A drag moves both axes, so it ends any run of keys and its short announcement.
				pad.movingId = '';
				pad.axisAt = 'x';
				pad.stepping = false;

				// Pointer capture rather than window listeners: the gesture keeps arriving here once the pointer leaves the area.
				capturePointer(surface, pointerId);

				const handles = thumbEls ?? [];
				handles[pointIndex(list, id)]?.focus();
			},

			dragTo(clientX: number, clientY: number) {
				if (!pad.dragging) return;

				const left = pad.boxLeft;
				const top = pad.boxTop;
				const width = pad.boxWidth;
				const height = pad.boxHeight;
				const lowX = pad.minX;
				const highX = pad.maxX;
				const lowY = pad.minY;
				const highY = pad.maxY;
				const size = pad.step;
				const list = points;
				const id = pad.dragId;
				const aimed = valueAtPointer(
					clientX,
					clientY,
					boxOf(left, top, width, height),
					boundsOf(lowX, highX, lowY, highY),
					size,
				);
				const next = movedPoints(list, id, aimed.x, aimed.y);
				if (next === list) return;

				pad.held = next;
				pad.onDrag?.(next);
			},

			endDrag() {
				if (!pad.dragging) return;

				pad.dragging = false;
				pad.dragId = '';
				const landed = points;
				pad.onChange?.(landed);
			},
		};
	},
	{ scope: 'widget' },
);

export function PadRoot({
	value,
	defaultValue = [],
	minX = 0,
	maxX = 1,
	minY = 0,
	maxY = 1,
	step = 0.01,
	disabled = false,
	onChange,
	onDrag,
	children,
	...rest
}: PadRootProps) @{
	const pad = padState();
	pad.onChange = onChange;
	pad.onDrag = onDrag;
	pad.given = value;
	pad.seed = defaultValue;
	pad.minX = minX;
	pad.maxX = maxX;
	pad.minY = minY;
	pad.maxY = maxY;
	pad.step = step;
	pad.disabled = disabled;

	<div {...rest} ui-disabled={pad.disabled} ui-dragging={pad.dragging}>{children}</div>
}

export function PadLabel({ children, ...rest }: PadLabelProps) @{
	const pad = padState();

	<span {...rest} el={pad.labelEl} ui-disabled={pad.disabled}>{children}</span>
}

export function PadDescription({ children, ...rest }: PadDescriptionProps) @{
	const pad = padState();

	<div {...rest} el={pad.descriptionEl}>{children}</div>
}

export function PadError({ children, ...rest }: PadErrorProps) @{
	const pad = padState();

	<div {...rest} el={pad.errorEl}>{children}</div>
}

/**
 * The field. It is a group rather than a control of its own: the handles inside
 * it carry the values, and this owns the pointer gesture on their behalf so that
 * N handles never overlap each other's hit testing.
 */
export function PadArea({
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	onPointercancel,
	...rest
}: PadAreaProps) @{
	const pad = padState();

	<div
		{...rest}
		el={pad.areaEl}
		role="group"
		aria-labelledby={pad.labelEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[pad.errorEl, pad.descriptionEl]}
		ui-plane={true}
		ui-disabled={pad.disabled}
		ui-dragging={pad.dragging}
		onPointerdown={(event) => {
			if (event.button === 0) {
				pad.beginDrag(event.clientX, event.clientY, event.pointerId);
				pad.dragTo(event.clientX, event.clientY);
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			pad.dragTo(event.clientX, event.clientY);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			pad.endDrag();
			onPointerup?.(event);
		}}
		onPointercancel={(event) => {
			pad.endDrag();
			onPointercancel?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-plane] { position: relative; touch-action: none; }
			}
		</style>
		{children}
	</div>
}

/**
 * One handle, and one tab stop. `role="slider"` with `aria-roledescription`
 * rather than two axis elements: colorpicker can afford full-plane axis overlays
 * because a colour plane has one thumb, and N of them would intercept each
 * other's pointer events. What colorpicker measured is kept instead - both axes
 * always reachable, and the long-then-short value text - by reporting the axis
 * the last key moved and naming both axes whenever the axis changes.
 */
export function PadThumb({ value, children, onKeydown, onFocusin, ...rest }: PadThumbProps) @{
	const pad = padState();
	// The point as a graph cell: a computed() that closes over the prop itself is
	// MARKLESS_CAPTURE_OPAQUE_PROP, because the prop is one loop row's own value.
	const handle: PadThumbInstanceState = state({ point: value });

	const thumbPoint = computed(() => {
		const list = pad.points;
		const drawn = handle.point;
		const lowX = pad.minX;
		const highX = pad.maxX;
		const lowY = pad.minY;
		const highY = pad.maxY;
		return heldPoint(list, idOf(drawn), boundsOf(lowX, highX, lowY, highY));
	});
	const thumbAxis = computed(() => {
		const held = thumbPoint;
		const running = pad.movingId;
		const which = pad.axisAt;
		return axisFor(running, held.id, which);
	});
	const thumbNow = computed(() => {
		const held = thumbPoint;
		const which = thumbAxis;
		return axisValue(held, which);
	});
	const thumbLowest = computed(() => {
		const which = thumbAxis;
		const lowX = pad.minX;
		const highX = pad.maxX;
		const lowY = pad.minY;
		const highY = pad.maxY;
		return axisLowest(boundsOf(lowX, highX, lowY, highY), which);
	});
	const thumbHighest = computed(() => {
		const which = thumbAxis;
		const lowX = pad.minX;
		const highX = pad.maxX;
		const lowY = pad.minY;
		const highY = pad.maxY;
		return axisHighest(boundsOf(lowX, highX, lowY, highY), which);
	});
	const thumbSpoken = computed(() => {
		const held = thumbPoint;
		const which = thumbAxis;
		const running = pad.movingId;
		const short = pad.stepping;
		return valueText(held, which, shortFor(running, held.id, short));
	});
	const thumbOffset = computed(() => {
		const held = thumbPoint;
		const lowX = pad.minX;
		const highX = pad.maxX;
		const lowY = pad.minY;
		const highY = pad.maxY;
		return thumbStyleText(held, boundsOf(lowX, highX, lowY, highY));
	});
	const thumbTabStop = computed(() => (pad.disabled ? -1 : 0));
	const thumbAriaDisabled = computed(() => (pad.disabled ? 'true' : 'false'));
	const thumbActive = computed(() => {
		const moving = pad.dragging;
		const under = pad.dragId;
		const drawn = handle.point;
		const held = thumbPoint;
		return moving === true && (under === idOf(drawn) || under === held.id);
	});

	<div
		{...rest}
		el={pad.thumbEls}
		role="slider"
		aria-roledescription="2D slider"
		tabindex={thumbTabStop}
		style={thumbOffset}
		aria-labelledby={pad.labelEl}
		aria-valuemin={thumbLowest}
		aria-valuemax={thumbHighest}
		aria-valuenow={thumbNow}
		aria-valuetext={thumbSpoken}
		aria-disabled={thumbAriaDisabled}
		ui-handle={true}
		ui-active={thumbActive}
		ui-disabled={pad.disabled}
		onFocusin={(event) => {
			const held = thumbPoint;
			pad.focusAt = held.id;
			// Focus arriving ends any run of keys, so the next thing heard names both axes.
			pad.movingId = '';
			pad.axisAt = 'x';
			pad.stepping = false;
			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const drawn = handle.point;
			pad.stepTo(idOf(drawn), event.key, event.shiftKey);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-handle] { position: absolute; left: var(--pad-x, 0%); bottom: var(--pad-y, 0%); }
			}
		</style>
		{children}
	</div>
}

// Renders the value rather than accepting children: a part cannot tell whether it
// was given any, so a fallback branch would render nothing for everybody.
export function PadValueLabel({ ...rest }: PadValueLabelProps) @{
	const pad = padState();
	const readoutText = computed(() => {
		const list = pad.points;
		const at = pad.focusAt;
		const lowX = pad.minX;
		const highX = pad.maxX;
		const lowY = pad.minY;
		const highY = pad.maxY;
		return pointText(heldPoint(list, at, boundsOf(lowX, highX, lowY, highY)));
	});

	<output {...rest} ui-value={readoutText} ui-disabled={pad.disabled}>{readoutText}</output>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it.
export function PadField({ value, ...rest }: PadFieldProps) @{
	const pad = padState();
	const own = state({ point: value });
	const fieldSubmitted = computed(() => {
		const list = pad.points;
		const drawn = own.point;
		const lowX = pad.minX;
		const highX = pad.maxX;
		const lowY = pad.minY;
		const highY = pad.maxY;
		return fieldText(heldPoint(list, idOf(drawn), boundsOf(lowX, highX, lowY, highY)));
	});

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			value={fieldSubmitted}
			disabled={pad.disabled}
		/>
	</VisuallyHidden>
}

// The grid, the crosshair, whatever the field is drawn with. It fills the area
// and never takes a pointer event, so it cannot come between a press and a handle.
export function PadIndicator({ ...rest }: PadIndicatorProps) @{
	<div {...rest} aria-hidden="true" ui-grid={true}>
		<style>
			@layer markless {
				[ui-grid] { position: absolute; inset: 0; pointer-events: none; }
			}
		</style>
	</div>
}
