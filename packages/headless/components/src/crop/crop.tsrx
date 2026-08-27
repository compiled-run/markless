// Two measured walls shape this file. Every computed carries a name unique to the
// whole module and reads its cells into locals before calling anything: two parts
// sharing a computed name resolve to one symbol, and a cell read nested inside a
// call has no name to lower to. And a handler has no `currentTarget` — a lazy
// handler symbol runs after the native dispatch — so a part that must ignore an
// event raised by a part inside it hands `event.target` to a shared method and
// lets the method ask the handles.

import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	areaStyleText,
	edgeMax,
	edgeName,
	edgeOrientation,
	edgeValue,
	edgeValueText,
	endStopDelta,
	endStopRect,
	fieldText,
	heldRect,
	inlineAt,
	isInsideAny,
	keyAxisOf,
	keyBlockDelta,
	keyInlineDelta,
	keyStep,
	measureArea,
	movedRect,
	ownsInline,
	rectText,
	resizedRect,
	sameRect,
	selectionStyleText,
} from './crop-math.ts';
import type {
	CropAreaProps,
	CropAxis,
	CropDescriptionProps,
	CropErrorProps,
	CropFieldProps,
	CropIndicatorProps,
	CropInstanceState,
	CropLabelProps,
	CropRect,
	CropRootProps,
	CropSelectionProps,
	CropThumbInstanceState,
	CropThumbProps,
} from './crop-types.ts';

export const cropState = shared(
	() => {
		const crop: CropInstanceState = state({
			seed: undefined,
			given: undefined,
			own: undefined,
			aspect: undefined,
			minWidth: 40,
			minHeight: 40,
			maxWidth: Number.POSITIVE_INFINITY,
			maxHeight: Number.POSITIVE_INFINITY,
			fixed: false,
			step: 1,
			disabled: false,
			required: false,
			invalid: false,
			name: '',
			moving: false,
			resizing: false,
			changed: false,
			keyAxis: 'inline' as CropAxis,
			areaInline: 0,
			areaBlock: 0,
			originInline: 0,
			originBlock: 0,
			inlineSign: 1,
			pointerId: -1,
			grabInline: 0,
			grabBlock: 0,
			grabX: 0,
			grabY: 0,
			grabWidth: 0,
			grabHeight: 0,
			dragInlineStart: false,
			dragInlineEnd: false,
			dragBlockStart: false,
			dragBlockEnd: false,
		});
		const areaEl = element<HTMLDivElement>();
		const labelEl = element<HTMLSpanElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const readoutEl = element<HTMLOutputElement>();
		const fieldEl = element<HTMLInputElement>();
		const selectionEl = element<HTMLDivElement>();
		const thumbEls = element<HTMLDivElement[]>();

		const held = computed(() => {
			const given = crop.given;
			const own = crop.own;
			const seed = crop.seed;
			const narrowest = crop.minWidth;
			const shortest = crop.minHeight;
			return heldRect(given, own, seed, narrowest, shortest);
		});
		const readoutText = computed(() => {
			const now = held;
			return rectText(now);
		});
		const fieldValue = computed(() => {
			const now = held;
			return fieldText(now);
		});
		const panStyle = computed(() => {
			const now = held;
			const pinned = crop.fixed;
			return areaStyleText(now, pinned);
		});
		const selectionStyle = computed(() => {
			const now = held;
			const pinned = crop.fixed;
			return selectionStyleText(now, pinned);
		});

		return {
			...crop,
			areaEl,
			labelEl,
			descriptionEl,
			errorEl,
			readoutEl,
			fieldEl,
			selectionEl,
			thumbEls,
			held,
			readoutText,
			fieldValue,
			panStyle,
			selectionStyle,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((rect: { x: number; y: number; width: number; height: number }) => void) | undefined,
			onDrag: undefined as ((rect: { x: number; y: number; width: number; height: number }) => void) | undefined,

			/**
			 * The area's box, in the units the rectangle speaks. There is no mount
			 * hook and no frame polling, so this runs from the first focus, press or
			 * key that reaches the widget — all three of which bubble to the area.
			 */
			measure() {
				const surface = areaEl;
				if (!surface) return;

				const box = measureArea(surface);
				crop.areaInline = box.inlineSize;
				crop.areaBlock = box.blockSize;
				crop.originInline = box.originInline;
				crop.originBlock = box.originBlock;
				crop.inlineSign = box.inlineSign;
			},

			/** Starts a move. Ignored when the press landed on a handle, which resizes instead. */
			beginMove(target: EventTarget | null, clientX: number, clientY: number, pointerId: number) {
				const off = crop.disabled;
				if (off) return;
				const surface = areaEl;
				if (!surface) return;
				const handles = thumbEls;
				const known = handles ? handles : [];
				if (isInsideAny(target, known)) return;

				const box = measureArea(surface);
				crop.areaInline = box.inlineSize;
				crop.areaBlock = box.blockSize;
				crop.originInline = box.originInline;
				crop.originBlock = box.originBlock;
				crop.inlineSign = box.inlineSign;

				crop.grabX = held.x;
				crop.grabY = held.y;
				crop.grabWidth = held.width;
				crop.grabHeight = held.height;
				crop.grabInline = inlineAt(clientX, box.originInline, box.inlineSign);
				crop.grabBlock = clientY - box.originBlock;
				crop.moving = true;
				crop.resizing = false;
				crop.changed = false;
				crop.pointerId = pointerId;
				// Pointer capture rather than window listeners: the gesture keeps
				// arriving here once the pointer leaves the area.
				surface.setPointerCapture(pointerId);
			},

			/** Starts a resize on the edges the handle owns. */
			beginResize(
				clientX: number,
				clientY: number,
				pointerId: number,
				atInlineStart: boolean,
				atInlineEnd: boolean,
				atBlockStart: boolean,
				atBlockEnd: boolean,
			) {
				const off = crop.disabled;
				if (off) return;
				const surface = areaEl;
				if (!surface) return;

				const box = measureArea(surface);
				crop.areaInline = box.inlineSize;
				crop.areaBlock = box.blockSize;
				crop.originInline = box.originInline;
				crop.originBlock = box.originBlock;
				crop.inlineSign = box.inlineSign;

				crop.grabX = held.x;
				crop.grabY = held.y;
				crop.grabWidth = held.width;
				crop.grabHeight = held.height;
				crop.grabInline = inlineAt(clientX, box.originInline, box.inlineSign);
				crop.grabBlock = clientY - box.originBlock;
				crop.dragInlineStart = atInlineStart;
				crop.dragInlineEnd = atInlineEnd;
				crop.dragBlockStart = atBlockStart;
				crop.dragBlockEnd = atBlockEnd;
				crop.moving = false;
				crop.resizing = true;
				crop.changed = false;
				crop.pointerId = pointerId;
				surface.setPointerCapture(pointerId);
			},

			/**
			 * Carries the gesture in flight. Travel is measured from where it was
			 * grabbed rather than from the last move, so a drag that leaves the area
			 * and comes back lands where the pointer is.
			 */
			dragTo(clientX: number, clientY: number) {
				const isMoving = crop.moving;
				const isResizing = crop.resizing;
				if (!isMoving && !isResizing) return;

				const origin = crop.originInline;
				const sign = crop.inlineSign;
				const top = crop.originBlock;
				const heldInline = crop.grabInline;
				const heldBlock = crop.grabBlock;
				const deltaInline = inlineAt(clientX, origin, sign) - heldInline;
				const deltaBlock = clientY - top - heldBlock;

				const grabX = crop.grabX;
				const grabY = crop.grabY;
				const grabWidth = crop.grabWidth;
				const grabHeight = crop.grabHeight;
				const grabbed = { x: grabX, y: grabY, width: grabWidth, height: grabHeight };
				const across = crop.areaInline;
				const down = crop.areaBlock;

				if (isMoving) {
					const moved = movedRect(grabbed, deltaInline, deltaBlock, across, down);
					if (sameRect(moved, held)) return;
					crop.own = moved;
					crop.changed = true;
					crop.onDrag?.(moved);
					return;
				}

				const atInlineStart = crop.dragInlineStart;
				const atInlineEnd = crop.dragInlineEnd;
				const atBlockStart = crop.dragBlockStart;
				const atBlockEnd = crop.dragBlockEnd;
				const low = crop.minWidth;
				const short = crop.minHeight;
				const wide = crop.maxWidth;
				const tall = crop.maxHeight;
				const ratio = crop.aspect;
				const sized = resizedRect(
					grabbed,
					atInlineStart,
					atInlineEnd,
					atBlockStart,
					atBlockEnd,
					deltaInline,
					deltaBlock,
					across,
					down,
					low,
					short,
					wide,
					tall,
					ratio,
				);
				if (sameRect(sized, held)) return;
				crop.own = sized;
				crop.changed = true;
				crop.onDrag?.(sized);
			},

			/** Commits the gesture. A gesture that changed nothing reports nothing. */
			endDrag() {
				const isMoving = crop.moving;
				const isResizing = crop.resizing;
				if (!isMoving && !isResizing) return;

				const moved = crop.changed;
				const own = crop.own;
				crop.moving = false;
				crop.resizing = false;
				crop.changed = false;
				crop.pointerId = -1;
				if (!moved || own === undefined) return;
				// What the gesture produced, not what is on screen: a controlled crop
				// has not been handed the new rectangle yet.
				crop.onChange?.(own);
			},

			/** Drops the gesture in flight without reporting it. */
			cancelDrag() {
				const isMoving = crop.moving;
				const isResizing = crop.resizing;
				if (!isMoving && !isResizing) return;
				crop.moving = false;
				crop.resizing = false;
				crop.changed = false;
				crop.pointerId = -1;
			},

			/**
			 * A keystroke on the rectangle. It is a whole interaction, so the value
			 * both changes and settles here. Keys raised inside a handle belong to
			 * that handle and are dropped, because the press bubbles here too.
			 */
			moveByKey(
				target: EventTarget | null,
				key: string,
				isShift: boolean,
				isCtrl: boolean,
				isMeta: boolean,
			) {
				const off = crop.disabled;
				if (off) return;
				const handles = thumbEls;
				const known = handles ? handles : [];
				if (isInsideAny(target, known)) return;
				const surface = areaEl;
				if (!surface) return;

				const box = measureArea(surface);
				crop.areaInline = box.inlineSize;
				crop.areaBlock = box.blockSize;
				crop.originInline = box.originInline;
				crop.originBlock = box.originBlock;
				crop.inlineSign = box.inlineSign;

				const across = box.inlineSize;
				const down = box.blockSize;
				const stepping = crop.step;
				const axis = keyAxisOf(key);

				if (axis !== null) {
					const size = keyStep(isShift, isCtrl || isMeta, stepping);
					const alongInline = keyInlineDelta(key, size);
					const alongBlock = keyBlockDelta(key, size);
					const moved = movedRect(held, alongInline, alongBlock, across, down);
					crop.keyAxis = axis;
					if (sameRect(moved, held)) return;
					crop.own = moved;
					crop.onChange?.(moved);
					return;
				}

				if (key !== 'Home' && key !== 'End') return;

				const lastAxis = crop.keyAxis;
				const parked = endStopRect(held, key, lastAxis, across, down);
				if (sameRect(parked, held)) return;
				crop.own = parked;
				crop.onChange?.(parked);
			},

			/** A keystroke on one handle: the arrows along its axis move its edge. */
			resizeByKey(
				key: string,
				isShift: boolean,
				isCtrl: boolean,
				isMeta: boolean,
				atInlineStart: boolean,
				atInlineEnd: boolean,
				atBlockStart: boolean,
				atBlockEnd: boolean,
			) {
				const off = crop.disabled;
				if (off) return;
				const surface = areaEl;
				if (!surface) return;

				const box = measureArea(surface);
				crop.areaInline = box.inlineSize;
				crop.areaBlock = box.blockSize;
				crop.originInline = box.originInline;
				crop.originBlock = box.originBlock;
				crop.inlineSign = box.inlineSign;

				const across = box.inlineSize;
				const down = box.blockSize;
				const stepping = crop.step;
				const size = keyStep(isShift, isCtrl || isMeta, stepping);
				const stop = endStopDelta(
					held,
					key,
					atInlineStart,
					atInlineEnd,
					atBlockStart,
					atBlockEnd,
					across,
					down,
				);
				const parking = key === 'Home' || key === 'End';
				const deltaInline = parking ? stop.inline : keyInlineDelta(key, size);
				const deltaBlock = parking ? stop.block : keyBlockDelta(key, size);
				if (deltaInline === 0 && deltaBlock === 0) return;

				const low = crop.minWidth;
				const short = crop.minHeight;
				const wide = crop.maxWidth;
				const tall = crop.maxHeight;
				const ratio = crop.aspect;
				const sized = resizedRect(
					held,
					atInlineStart,
					atInlineEnd,
					atBlockStart,
					atBlockEnd,
					deltaInline,
					deltaBlock,
					across,
					down,
					low,
					short,
					wide,
					tall,
					ratio,
				);
				if (sameRect(sized, held)) return;
				crop.own = sized;
				crop.onChange?.(sized);
			},
		};
	},
	{ scope: 'widget' },
);

export function CropRoot({
	value,
	defaultValue,
	aspect,
	minWidth = 40,
	minHeight = 40,
	maxWidth = Number.POSITIVE_INFINITY,
	maxHeight = Number.POSITIVE_INFINITY,
	fixed = false,
	step = 1,
	disabled = false,
	required = false,
	name = '',
	onChange,
	onDrag,
	children,
	...rest
}: CropRootProps) @{
	const crop = cropState();
	crop.onChange = onChange;
	crop.onDrag = onDrag;
	crop.given = value;
	crop.seed = defaultValue;
	crop.aspect = aspect;
	crop.minWidth = minWidth;
	crop.minHeight = minHeight;
	crop.maxWidth = maxWidth;
	crop.maxHeight = maxHeight;
	crop.fixed = fixed;
	crop.step = step;
	crop.disabled = disabled;
	crop.required = required;
	crop.name = name;

	<div
		{...rest}
		style={crop.panStyle}
		ui-disabled={crop.disabled}
		ui-fixed={crop.fixed}
		ui-dragging={crop.moving}
		ui-resizing={crop.resizing}
	>
		{/* Always rendered, not a part: a rectangle that moves has no text of its
		    own, so this is the only thing that tells a reader where it went. */}
		<VisuallyHidden>
			<output el={crop.readoutEl} aria-live="polite" aria-atomic="true">{crop.readoutText}</output>
		</VisuallyHidden>
		{children}
	</div>
}

export function CropLabel({ children, ...rest }: CropLabelProps) @{
	const crop = cropState();

	<span {...rest} el={crop.labelEl} ui-disabled={crop.disabled}>{children}</span>
}

export function CropDescription({ children, ...rest }: CropDescriptionProps) @{
	const crop = cropState();

	<div {...rest} el={crop.descriptionEl}>{children}</div>
}

export function CropError({ children, ...rest }: CropErrorProps) @{
	const crop = cropState();
	// Mounting the error part is what marks the crop invalid.
	crop.invalid = true;

	<div {...rest} el={crop.errorEl}>{children}</div>
}

/**
 * The box the rectangle lives in. It owns the gesture in flight — pointer capture
 * is taken here, so a drag that leaves the area keeps arriving — and it is what
 * the family measures.
 */
export function CropArea({
	children,
	onPointermove,
	onPointerup,
	onPointercancel,
	onFocusin,
	...rest
}: CropAreaProps) @{
	const crop = cropState();

	<div
		{...rest}
		el={crop.areaEl}
		ui-area={true}
		ui-disabled={crop.disabled}
		ui-fixed={crop.fixed}
		ui-dragging={crop.moving}
		ui-resizing={crop.resizing}
		onPointermove={(event) => {
			crop.dragTo(event.clientX, event.clientY);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			crop.endDrag();
			onPointerup?.(event);
		}}
		onPointercancel={(event) => {
			crop.cancelDrag();
			onPointercancel?.(event);
		}}
		onFocusin={(event) => {
			// The one route that measures without changing anything: arriving by tab
			// is what makes a handle's reported range the area's rather than its own.
			crop.measure();
			onFocusin?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-area] {
					position: relative;
					overflow: hidden;
					touch-action: none;
				}
			}
		</style>
		{children}
	</div>
}

export function CropSelection({
	children,
	onPointerdown,
	onKeydown,
	...rest
}: CropSelectionProps) @{
	const crop = cropState();
	const selectionTabStop = computed(() => (crop.disabled ? -1 : 0));
	const selectionAriaDisabled = computed(() => (crop.disabled ? 'true' : 'false'));

	<div
		{...rest}
		el={crop.selectionEl}
		role="group"
		aria-roledescription="crop area"
		tabindex={selectionTabStop}
		style={crop.selectionStyle}
		aria-labelledby={crop.labelEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[crop.errorEl, crop.descriptionEl, crop.readoutEl]}
		aria-disabled={selectionAriaDisabled}
		ui-selection={true}
		ui-disabled={crop.disabled}
		ui-fixed={crop.fixed}
		ui-dragging={crop.moving}
		ui-resizing={crop.resizing}
		onPointerdown={(event) => {
			if (event.button === 0) {
				crop.beginMove(event.target, event.clientX, event.clientY, event.pointerId);
			}
			onPointerdown?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph
			// state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
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
			crop.moveByKey(
				event.target,
				event.key,
				event.shiftKey,
				event.ctrlKey === true,
				event.metaKey === true,
			);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-selection] {
					position: absolute;
					inset-inline-start: var(--x, 0px);
					inset-block-start: var(--y, 0px);
					inline-size: var(--width, 0px);
					block-size: var(--height, 0px);
					touch-action: none;
				}
			}
		</style>
		{children}
	</div>
}

/**
 * One resize handle. The edges it owns are written as booleans, and the name a
 * reader hears sits before the spread so a consumer's own `aria-label` wins.
 */
export function CropThumb({
	inlineStart = false,
	inlineEnd = false,
	blockStart = false,
	blockEnd = false,
	children,
	onPointerdown,
	onKeydown,
	...rest
}: CropThumbProps) @{
	const crop = cropState();
	// The edges as graph cells: compared against the props instead, the comparison
	// stops refreshing once the page has resumed.
	const handle: CropThumbInstanceState = state({ inlineStart, inlineEnd, blockStart, blockEnd });

	const handleName = computed(() => {
		const atStart = handle.inlineStart;
		const atEnd = handle.inlineEnd;
		const atTop = handle.blockStart;
		const atBottom = handle.blockEnd;
		return edgeName(atStart, atEnd, atTop, atBottom);
	});
	const handleAxis = computed(() => {
		const atStart = handle.inlineStart;
		const atEnd = handle.inlineEnd;
		const atTop = handle.blockStart;
		const atBottom = handle.blockEnd;
		return edgeOrientation(atStart, atEnd, atTop, atBottom);
	});
	const handleNow = computed(() => {
		const held = crop.held;
		const atStart = handle.inlineStart;
		const atEnd = handle.inlineEnd;
		const atTop = handle.blockStart;
		const atBottom = handle.blockEnd;
		return edgeValue(held, atStart, atEnd, atTop, atBottom);
	});
	const handleText = computed(() => {
		const held = crop.held;
		const atStart = handle.inlineStart;
		const atEnd = handle.inlineEnd;
		const atTop = handle.blockStart;
		const atBottom = handle.blockEnd;
		return edgeValueText(held, atStart, atEnd, atTop, atBottom);
	});
	const handleHighest = computed(() => {
		const held = crop.held;
		const across = crop.areaInline;
		const down = crop.areaBlock;
		const atStart = handle.inlineStart;
		const atEnd = handle.inlineEnd;
		return edgeMax(held, ownsInline(atStart, atEnd), across, down);
	});
	const handleTabStop = computed(() => (crop.disabled ? -1 : 0));
	const handleAriaDisabled = computed(() => (crop.disabled ? 'true' : 'false'));
	const handleActive = computed(() => {
		const busy = crop.resizing;
		const dragStart = crop.dragInlineStart;
		const dragEnd = crop.dragInlineEnd;
		const dragTop = crop.dragBlockStart;
		const dragBottom = crop.dragBlockEnd;
		const atStart = handle.inlineStart;
		const atEnd = handle.inlineEnd;
		const atTop = handle.blockStart;
		const atBottom = handle.blockEnd;
		return (
			busy === true &&
			dragStart === atStart &&
			dragEnd === atEnd &&
			dragTop === atTop &&
			dragBottom === atBottom
		);
	});

	<div
		aria-label={handleName}
		{...rest}
		el={crop.thumbEls}
		role="slider"
		tabindex={handleTabStop}
		aria-orientation={handleAxis}
		aria-valuemin="0"
		aria-valuemax={handleHighest}
		aria-valuenow={handleNow}
		aria-valuetext={handleText}
		aria-disabled={handleAriaDisabled}
		ui-handle={true}
		ui-inline-start={handle.inlineStart}
		ui-inline-end={handle.inlineEnd}
		ui-block-start={handle.blockStart}
		ui-block-end={handle.blockEnd}
		ui-disabled={crop.disabled}
		ui-resizing={handleActive}
		onPointerdown={(event) => {
			if (event.button === 0) {
				crop.beginResize(
					event.clientX,
					event.clientY,
					event.pointerId,
					handle.inlineStart,
					handle.inlineEnd,
					handle.blockStart,
					handle.blockEnd,
				);
			}
			onPointerdown?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone, the same rule as the selection's keys.
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
			crop.resizeByKey(
				event.key,
				event.shiftKey,
				event.ctrlKey === true,
				event.metaKey === true,
				handle.inlineStart,
				handle.inlineEnd,
				handle.blockStart,
				handle.blockEnd,
			);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-handle] { position: absolute; touch-action: none; }
				[ui-handle][ui-inline-start] { inset-inline-start: 0; }
				[ui-handle][ui-inline-end] { inset-inline-end: 0; }
				[ui-handle][ui-block-start] { inset-block-start: 0; }
				[ui-handle][ui-block-end] { inset-block-end: 0; }
				[ui-handle]:not([ui-inline-start]):not([ui-inline-end]) {
					inset-inline-start: 0;
					inset-inline-end: 0;
				}
				[ui-handle]:not([ui-block-start]):not([ui-block-end]) {
					inset-block-start: 0;
					inset-block-end: 0;
				}
			}
		</style>
		{children}
	</div>
}

export function CropIndicator({ children, ...rest }: CropIndicatorProps) @{
	<div {...rest} aria-hidden="true" ui-grid={true}>
		<style>
			@layer markless {
				[ui-grid] { position: absolute; inset: 0; pointer-events: none; }
			}
		</style>
		{children}
	</div>
}

export function CropField({ ...rest }: CropFieldProps) @{
	const crop = cropState();
	const fieldAriaInvalid = computed(() => (crop.invalid ? 'true' : 'false'));

	<VisuallyHidden>
		<input
			{...rest}
			el={crop.fieldEl}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={crop.name}
			value={crop.fieldValue}
			aria-invalid={fieldAriaInvalid}
			required={crop.required}
			disabled={crop.disabled}
		/>
	</VisuallyHidden>
}
