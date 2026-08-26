import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	type ColorChannel,
	areaFraction,
	areaKeyMove,
	channelName,
	channelRange,
	channelValue,
	clamp,
	colorOf,
	cssText,
	hexText,
	hsbText,
	hslText,
	isAmong,
	isRightToLeft,
	landFocus,
	measureBounds,
	parseChannelEntry,
	parseColor,
	parseHexEntry,
	railFraction,
	railKeyTarget,
	rgbText,
	rootStyleText,
	thumbStyleText,
	valueAtFraction,
	withChannel,
} from './colorpicker-math.ts';
import { areaValueText, colorName, railValueText, swatchLabel } from './colorpicker-names.ts';
import type {
	ColorpickerAreaProps,
	ColorpickerContentProps,
	ColorpickerDescriptionProps,
	ColorpickerErrorProps,
	ColorpickerFieldProps,
	ColorpickerInputProps,
	ColorpickerInstanceState,
	ColorpickerItemInstanceState,
	ColorpickerItemProps,
	ColorpickerLabelProps,
	ColorpickerRootProps,
	ColorpickerThumbProps,
	ColorpickerTrackProps,
	ColorpickerTriggerProps,
	ColorpickerValueLabelProps,
} from './colorpicker-types.ts';

// One computed() cell per derivation, and every one of them re-reads the colour
// out of `text ?? seed` rather than a neighbour: the copy that carries a
// computed's body does not carry its siblings.

export const colorpickerState = shared(
	() => {
		const picker: ColorpickerInstanceState = state({
			seed: '',
			text: '',
			withAlpha: false,
			swatches: [] as readonly string[],
			disabled: false,
			readonly: false,
			required: false,
			invalid: false,
			fieldName: '',
			popup: false,
			open: false,
			dragging: false,
			axisAt: 'x' as 'x' | 'y',
			stepping: false,
			dragChannel: '' as ColorChannel | '',
			boundsLeft: 0,
			boundsTop: 0,
			boundsWidth: 0,
			boundsHeight: 0,
			boundsFlipped: false,
		});
		const labelEl = element<HTMLLabelElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const areaEl = element<HTMLDivElement>();
		const axisEls = element<HTMLDivElement[]>();
		// Every focusable element the family owns, bound rather than found: the
		// family never queries the DOM for its own parts.
		const thumbEls = element<HTMLDivElement[]>();
		const inputEls = element<HTMLInputElement[]>();
		const itemEls = element<HTMLButtonElement[]>();
		const contentEl = element<HTMLDivElement>();
		const triggerEl = element<HTMLButtonElement>();

		const value = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			return hsbText(held);
		});
		const hex = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			const on = picker.withAlpha;
			return hexText(held, on);
		});
		const rgb = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			const on = picker.withAlpha;
			return rgbText(held, on);
		});
		const hsl = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			const on = picker.withAlpha;
			return hslText(held, on);
		});
		const hsb = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			return hsbText(held);
		});
		const alpha = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			return held.a;
		});
		const css = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			const on = picker.withAlpha;
			return cssText(held, on);
		});
		const name = computed(() => {
			const held = colorOf(picker.text, picker.seed);
			const on = picker.withAlpha;
			return colorName(held, on);
		});

		return {
			...picker,
			labelEl,
			descriptionEl,
			errorEl,
			areaEl,
			axisEls,
			thumbEls,
			inputEls,
			itemEls,
			contentEl,
			triggerEl,
			value,
			hex,
			rgb,
			hsl,
			hsb,
			alpha,
			css,
			name,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			onChangeEnd: undefined as ((value: string) => void) | undefined,

			/** Take any CSS colour the family accepts. A swatch press and a committed hex both land here. */
			setColor(next: string) {
				if (picker.disabled === true || picker.readonly === true) return;
				const parsed = parseColor(next);
				if (parsed === null) return;
				const landed =
					picker.withAlpha === true
						? parsed
						: { h: parsed.h, s: parsed.s, b: parsed.b, a: 1 };
				const written = hsbText(landed);
				if (written === hsbText(colorOf(picker.text, picker.seed))) return;
				picker.text = written;
				picker.stepping = false;
				const reported = hexText(landed, picker.withAlpha);
				picker.onChange?.(reported);
				picker.onChangeEnd?.(reported);
			},

			/** One channel to one number. A keystroke is a whole interaction, so it settles here too. */
			setChannel(channel: ColorChannel, next: number, settle: boolean) {
				if (picker.disabled === true || picker.readonly === true) return;
				if (channel === 'alpha' && picker.withAlpha !== true) return;
				const now = colorOf(picker.text, picker.seed);
				const moved = withChannel(now, channel, next);
				const written = hsbText(moved);
				if (written === hsbText(now)) return;
				picker.text = written;
				const reported = hexText(moved, picker.withAlpha);
				picker.onChange?.(reported);
				if (settle) picker.onChangeEnd?.(reported);
			},

			/** One key of the area's model. Focus follows the axis the key moved, so both stay reachable from one tab stop. */
			stepArea(key: string, shift: boolean) {
				const move = areaKeyMove(key, shift, isRightToLeft(areaEl));
				if (move === null) return;

				picker.axisAt = move.axis;
				picker.stepping = true;
				const stops = axisEls ?? [];
				landFocus(move.axis === 'x' ? stops[0] : stops[1]);

				if (picker.disabled === true || picker.readonly === true) return;
				const channel: ColorChannel = move.axis === 'x' ? 'saturation' : 'brightness';
				const now = colorOf(picker.text, picker.seed);
				const moved = withChannel(now, channel, channelValue(now, channel) + move.delta);
				const written = hsbText(moved);
				if (written === hsbText(now)) return;
				picker.text = written;
				const reported = hexText(moved, picker.withAlpha);
				picker.onChange?.(reported);
				picker.onChangeEnd?.(reported);
			},

			/** One key of a rail's model, which is `slider`'s: Home and End reach the channel's own ends. */
			stepRail(channel: ColorChannel | '', key: string, shift: boolean) {
				if (channel === '') return;
				if (picker.disabled === true || picker.readonly === true) return;
				if (channel === 'alpha' && picker.withAlpha !== true) return;
				const now = colorOf(picker.text, picker.seed);
				const next = railKeyTarget(
					key,
					shift,
					channelValue(now, channel),
					channel,
					isRightToLeft(areaEl),
				);
				if (next === null) return;
				const moved = withChannel(now, channel, next);
				const written = hsbText(moved);
				if (written === hsbText(now)) return;
				picker.text = written;
				const reported = hexText(moved, picker.withAlpha);
				picker.onChange?.(reported);
				picker.onChangeEnd?.(reported);
			},

			// Pointer capture rather than window listeners: the gesture keeps arriving
			// at the element it started on once the pointer leaves it.
			beginArea(clientX: number, clientY: number, pointerId: number) {
				if (picker.disabled === true || picker.readonly === true) return;
				const area = areaEl;
				if (!area) return;

				const box = measureBounds(area);
				picker.boundsLeft = box.left;
				picker.boundsTop = box.top;
				picker.boundsWidth = box.width;
				picker.boundsHeight = box.height;
				picker.boundsFlipped = box.flipX;
				picker.dragging = true;
				picker.dragChannel = '';
				picker.stepping = false;
				area.setPointerCapture(pointerId);
				const stops = axisEls ?? [];
				landFocus(picker.axisAt === 'y' ? stops[1] : stops[0]);
			},

			dragArea(clientX: number, clientY: number) {
				if (picker.dragging !== true || picker.dragChannel !== '') return;
				// Each cell read on its own line: a state read nested inside an object
				// literal inside a call has no name to lower to and arrives undefined.
				const left = picker.boundsLeft;
				const top = picker.boundsTop;
				const width = picker.boundsWidth;
				const height = picker.boundsHeight;
				const flipX = picker.boundsFlipped;
				const at = areaFraction(clientX, clientY, { left, top, width, height, flipX });
				const now = colorOf(picker.text, picker.seed);
				const moved = {
					h: now.h,
					s: Math.round(clamp(at.x * 100, 0, 100)),
					b: Math.round(clamp(at.y * 100, 0, 100)),
					a: now.a,
				};
				const written = hsbText(moved);
				if (written === hsbText(now)) return;
				picker.text = written;
				picker.onChange?.(hexText(moved, picker.withAlpha));
			},

			beginRail(rail: HTMLElement | undefined, channel: ColorChannel, pointerId: number) {
				if (picker.disabled === true || picker.readonly === true) return;
				if (channel === 'alpha' && picker.withAlpha !== true) return;
				if (!rail) return;

				const box = measureBounds(rail);
				picker.boundsLeft = box.left;
				picker.boundsTop = box.top;
				picker.boundsWidth = box.width;
				picker.boundsHeight = box.height;
				picker.boundsFlipped = box.flipX;
				picker.dragging = true;
				picker.dragChannel = channel;
				picker.stepping = false;
				rail.setPointerCapture(pointerId);
			},

			dragRail(clientX: number) {
				if (picker.dragging !== true) return;
				const channel = picker.dragChannel;
				if (channel === '') return;
				const left = picker.boundsLeft;
				const top = picker.boundsTop;
				const width = picker.boundsWidth;
				const height = picker.boundsHeight;
				const flipX = picker.boundsFlipped;
				const fraction = railFraction(clientX, { left, top, width, height, flipX });
				const now = colorOf(picker.text, picker.seed);
				const moved = withChannel(now, channel, valueAtFraction(fraction, channel));
				const written = hsbText(moved);
				if (written === hsbText(now)) return;
				picker.text = written;
				picker.onChange?.(hexText(moved, picker.withAlpha));
			},

			endDrag() {
				if (picker.dragging !== true) return;
				picker.dragging = false;
				picker.dragChannel = '';
				picker.onChangeEnd?.(
					hexText(colorOf(picker.text, picker.seed), picker.withAlpha),
				);
			},

			/** A typed entry, committed on Enter or when the box is left. An entry that will not parse changes nothing. */
			commitEntry(channel: ColorChannel | '', raw: string) {
				if (picker.disabled === true || picker.readonly === true) return;
				const now = colorOf(picker.text, picker.seed);

				if (channel === '') {
					const parsed = parseHexEntry(raw);
					if (parsed === null) return;
					const landed =
						picker.withAlpha === true
							? parsed
							: { h: parsed.h, s: parsed.s, b: parsed.b, a: 1 };
					const written = hsbText(landed);
					if (written === hsbText(now)) return;
					picker.text = written;
					const reported = hexText(landed, picker.withAlpha);
					picker.onChange?.(reported);
					picker.onChangeEnd?.(reported);
					return;
				}

				if (channel === 'alpha' && picker.withAlpha !== true) return;
				const amount = parseChannelEntry(raw, channel);
				if (amount === null) return;
				const moved = withChannel(now, channel, amount);
				const written = hsbText(moved);
				if (written === hsbText(now)) return;
				picker.text = written;
				const reported = hexText(moved, picker.withAlpha);
				picker.onChange?.(reported);
				picker.onChangeEnd?.(reported);
			},

			/** The full three-channel announcement is what a person hears on the first key after focus arrives. */
			enterArea(from: EventTarget | null) {
				// Focus moving between the plane's own two axis controls is not an
				// arrival, and identity against their handles says so without a DOM walk.
				if (isAmong(from, [axisEls])) return;
				picker.stepping = false;
			},

			setOpen(next: boolean) {
				if (picker.open === next) return;
				picker.open = next;
			},
		};
	},
	{ scope: 'widget' },
);

// One instance per rendered rail: the channel it carries, and its own element,
// which the pointer gesture measures. A part factory of its own rather than a
// cell on the family's, because a picker has as many rails as the consumer writes.
export const colorpickerRailState = shared(
	() => {
		const rail = state({ channel: 'hue' as ColorChannel });
		const el = element<HTMLDivElement>();

		return { ...rail, el };
	},
	{ scope: 'widget' },
);

export function ColorpickerRoot({
	value = '',
	swatches = [],
	alpha = false,
	disabled = false,
	readonly = false,
	required = false,
	invalid = false,
	name = '',
	popup = false,
	onChange,
	onChangeEnd,
	children,
	...rest
}: ColorpickerRootProps) @{
	const picker = colorpickerState();
	picker.onChange = onChange;
	picker.onChangeEnd = onChangeEnd;
	picker.seed = value;
	picker.swatches = swatches;
	picker.withAlpha = alpha;
	picker.disabled = disabled;
	picker.readonly = readonly;
	picker.required = required;
	picker.invalid = invalid;
	picker.fieldName = name;
	picker.popup = popup;

	const rootShowing = computed(() => {
		const asPopup = picker.popup;
		const showing = picker.open;
		return asPopup !== true || showing === true;
	});
	const rootPainted = computed(() => {
		const held = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		return rootStyleText(held, on);
	});

	<div
		{...rest}
		style={rootPainted}
		ui-picker={true}
		ui-disabled={picker.disabled}
		ui-readonly={picker.readonly}
		ui-required={picker.required}
		ui-invalid={picker.invalid}
		ui-alpha={picker.withAlpha}
		ui-dragging={picker.dragging}
		ui-popup={picker.popup}
		ui-open={rootShowing}
		ui-closed={rootShowing !== true}
	>
		<style>
			@layer markless { [ui-picker] { anchor-scope: --ui-colorpicker; } }
		</style>
		{children}
	</div>
}

// One surface, both shapes. Inline it renders in place; with `popup` the same
// element is what the trigger reveals, and the markup inside is identical either
// way. `overlay` is written unconditionally - the compiler takes a boolean
// literal there and nothing else - so an inline picker enlists too and ignores
// the dismissal it reports.
export function ColorpickerContent({
	children,
	onDismiss,
	...rest
}: ColorpickerContentProps) @{
	const picker = colorpickerState();
	const surfaceShowing = computed(() => {
		const asPopup = picker.popup;
		const showing = picker.open;
		return asPopup !== true || showing === true;
	});

	<div
		{...rest}
		el={picker.contentEl}
		overlay
		role="group"
		aria-labelledby={picker.labelEl}
		hidden={surfaceShowing !== true}
		ui-popup={picker.popup}
		ui-open={surfaceShowing}
		ui-closed={surfaceShowing !== true}
		onDismiss={(event) => {
			const back = picker.triggerEl;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards
			// the answer is gone. Identity against the handles the family binds, never
			// a `contains` walk - every element that can hold focus in here is one of
			// these four groups.
			const isFocusInside = isAmong(document.activeElement, [
				picker.axisEls,
				picker.thumbEls,
				picker.inputEls,
				picker.itemEls,
			]);
			if (picker.popup === true) {
				picker.setOpen(false);
				// The primitive moves no focus, and a press elsewhere is a person choosing where to be.
				if (event.detail.reason === 'escape' && isFocusInside) landFocus(back);
			}
			onDismiss?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-popup] { position: absolute; position-anchor: --ui-colorpicker; }
			}
		</style>
		{children}
	</div>
}

export function ColorpickerTrigger({ children, onClick, ...rest }: ColorpickerTriggerProps) @{
	const picker = colorpickerState();

	<button
		{...rest}
		el={picker.triggerEl}
		type="button"
		aria-haspopup="dialog"
		aria-expanded={picker.open ? 'true' : 'false'}
		aria-controls={picker.contentEl}
		disabled={picker.disabled}
		ui-open={picker.open}
		ui-closed={picker.open !== true}
		onClick={(event) => {
			const wasOpen = picker.open === true;
			picker.setOpen(wasOpen !== true);
			if (wasOpen !== true) {
				const stops = picker.axisEls ?? [];
				landFocus(stops[0]);
			}
			onClick?.(event);
		}}
	>
		<style>
			@layer markless { button { anchor-name: --ui-colorpicker; } }
		</style>
		{children}
	</button>
}

export function ColorpickerLabel({ children, ...rest }: ColorpickerLabelProps) @{
	const picker = colorpickerState();

	<label {...rest} el={picker.labelEl} ui-disabled={picker.disabled}>{children}</label>
}

export function ColorpickerDescription({ children, ...rest }: ColorpickerDescriptionProps) @{
	const picker = colorpickerState();

	<div {...rest} el={picker.descriptionEl}>{children}</div>
}

export function ColorpickerError({ children, ...rest }: ColorpickerErrorProps) @{
	const picker = colorpickerState();

	<div {...rest} el={picker.errorEl}>{children}</div>
}

/**
 * One `role="slider"` per axis, rendered by the area rather than written by the
 * consumer - the `progress.bar` idiom. Two controls because one element carries
 * one `aria-valuenow`: a single slider over the plane would leave brightness
 * unreachable to anyone adjusting it with a reader.
 */
function ColorpickerAxis({ axis }: { readonly axis: 'x' | 'y' }) @{
	const picker = colorpickerState();
	const own = state({ axis });

	const axisNow = computed(() => {
		const held = colorOf(picker.text, picker.seed);
		return channelValue(held, own.axis === 'x' ? 'saturation' : 'brightness');
	});
	const axisNamed = computed(() => (own.axis === 'x' ? 'Saturation' : 'Brightness'));
	const axisSpoken = computed(() => {
		const held = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		const stepped = picker.stepping;
		return areaValueText(held, own.axis, on, stepped !== true);
	});
	const axisTabStop = computed(() => {
		const locked = picker.disabled;
		const here = picker.axisAt;
		return locked || here !== own.axis ? -1 : 0;
	});
	const axisAlong = computed(() => (own.axis === 'y' ? 'vertical' : undefined));
	const axisAriaDisabled = computed(() => (picker.disabled ? 'true' : 'false'));
	const axisAriaReadonly = computed(() => (picker.readonly ? 'true' : undefined));

	<div
		el={picker.axisEls}
		role="slider"
		aria-roledescription="2D Slider"
		aria-label={axisNamed}
		aria-orientation={axisAlong}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={axisNow}
		aria-valuetext={axisSpoken}
		aria-disabled={axisAriaDisabled}
		aria-readonly={axisAriaReadonly}
		tabindex={axisTabStop}
		ui-axis={own.axis}
		ui-value={axisNow}
		onKeydown={(event) => {
			// Guarded by event fields alone, and only `===` chains extract: a guard
			// over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
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

			picker.stepArea(event.key, event.shiftKey);
		}}
	>
		<style>
			@layer markless { [ui-axis] { position: absolute; inset: 0; } }
		</style>
	</div>
}

export function ColorpickerArea({
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	onFocusin,
	...rest
}: ColorpickerAreaProps) @{
	const picker = colorpickerState();
	<div
		{...rest}
		el={picker.areaEl}
		role="group"
		aria-labelledby={picker.labelEl}
		ui-plane={true}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[picker.errorEl, picker.descriptionEl]}
		ui-disabled={picker.disabled}
		ui-readonly={picker.readonly}
		ui-dragging={picker.dragging}
		onPointerdown={(event) => {
			if (event.button === 0) {
				picker.beginArea(event.clientX, event.clientY, event.pointerId);
				picker.dragArea(event.clientX, event.clientY);
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			picker.dragArea(event.clientX, event.clientY);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			picker.endDrag();
			onPointerup?.(event);
		}}
		onFocusin={(event) => {
			picker.enterArea(event.relatedTarget);
			onFocusin?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-plane] {
					position: relative;
					touch-action: none;
					forced-color-adjust: none;
				}
			}
		</style>
		<ColorpickerAxis axis="x" />
		<ColorpickerAxis axis="y" />
		{children}
	</div>
}

export function ColorpickerTrack({
	channel = 'hue',
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	...rest
}: ColorpickerTrackProps) @{
	const picker = colorpickerState();
	// The channel as a graph cell: compared against the prop instead, the comparison
	// stops refreshing once the page has resumed.
	const rail = colorpickerRailState();
	rail.channel = channel;

	const railActive = computed(() => {
		const moving = picker.dragging;
		const under = picker.dragChannel;
		return moving === true && under === rail.channel;
	});

	<div
		{...rest}
		el={rail.el}
		ui-rail={true}
		ui-channel={rail.channel}
		ui-disabled={picker.disabled}
		ui-readonly={picker.readonly}
		ui-dragging={railActive}
		onPointerdown={(event) => {
			if (event.button === 0) {
				picker.beginRail(rail.el, rail.channel, event.pointerId);
				picker.dragRail(event.clientX);
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			picker.dragRail(event.clientX);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			picker.endDrag();
			onPointerup?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-rail] {
					position: relative;
					touch-action: none;
					forced-color-adjust: none;
				}
			}
		</style>
		{children}
	</div>
}

/**
 * Inside a rail this is that channel's control; inside the area it is the marker
 * the family positions and nothing more. One part rather than two because the
 * consumer writes the same tag either way - what it is follows from where it sits.
 */
export function ColorpickerThumb({ channel, children, onKeydown, ...rest }: ColorpickerThumbProps) @{
	const picker = colorpickerState();
	const handle = state({ channel: channel ?? ('' as ColorChannel | '') });

	const thumbRole = computed(() => (handle.channel === '' ? 'presentation' : 'slider'));
	const thumbTabStop = computed(() => {
		const locked = picker.disabled;
		const which = handle.channel;
		if (which === '') return undefined;
		return locked ? -1 : 0;
	});
	const thumbNamed = computed(() => {
		const which = handle.channel;
		return which === '' ? undefined : channelName(which);
	});
	const thumbLowest = computed(() => {
		const which = handle.channel;
		return which === '' ? undefined : channelRange(which).min;
	});
	const thumbHighest = computed(() => {
		const which = handle.channel;
		return which === '' ? undefined : channelRange(which).max;
	});
	const thumbNow = computed(() => {
		const held = colorOf(picker.text, picker.seed);
		const which = handle.channel;
		return which === '' ? undefined : channelValue(held, which);
	});
	const thumbSpoken = computed(() => {
		const held = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		const which = handle.channel;
		return which === '' ? undefined : railValueText(held, which, on);
	});
	const thumbOffset = computed(() => {
		const held = colorOf(picker.text, picker.seed);
		const which = handle.channel;
		return thumbStyleText(held, which);
	});
	const thumbMarked = computed(() => {
		const which = handle.channel;
		return which === '' ? undefined : which;
	});
	const thumbAriaDisabled = computed(() => {
		const locked = picker.disabled;
		const which = handle.channel;
		if (which === '') return undefined;
		return locked ? 'true' : 'false';
	});
	const thumbAriaReadonly = computed(() => {
		const fixed = picker.readonly;
		const which = handle.channel;
		return which !== '' && fixed ? 'true' : undefined;
	});
	const thumbActive = computed(() => {
		const moving = picker.dragging;
		const under = picker.dragChannel;
		const which = handle.channel;
		return which !== '' && moving === true && under === which;
	});

	<div
		{...rest}
		el={picker.thumbEls}
		role={thumbRole}
		tabindex={thumbTabStop}
		style={thumbOffset}
		aria-label={thumbNamed}
		aria-valuemin={thumbLowest}
		aria-valuemax={thumbHighest}
		aria-valuenow={thumbNow}
		aria-valuetext={thumbSpoken}
		aria-disabled={thumbAriaDisabled}
		aria-readonly={thumbAriaReadonly}
		ui-channel={thumbMarked}
		ui-disabled={picker.disabled}
		ui-dragging={thumbActive}
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

			picker.stepRail(handle.channel, event.key, event.shiftKey);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[role='slider'][ui-channel] {
					position: absolute;
					left: var(--colorpicker-offset);
					forced-color-adjust: none;
				}
				[role='presentation'] {
					position: absolute;
					left: var(--colorpicker-x);
					bottom: var(--colorpicker-y);
					forced-color-adjust: none;
				}
			}
		</style>
		{children}
	</div>
}

/**
 * A box a person types into. The graph writes attributes and an input's shown
 * text is its `value` property, so this part only exists because the write was
 * measured to re-display a box a person had already typed into - the gate is
 * `packages/vitest-browser/browser/colorpicker-gates`.
 */
export function ColorpickerInput({
	channel,
	onInput,
	onKeydown,
	onBlur,
	...rest
}: ColorpickerInputProps) @{
	const picker = colorpickerState();
	const box = state({ channel: channel ?? ('' as ColorChannel | ''), typed: '' });

	const boxShown = computed(() => {
		const held = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		const which = box.channel;
		if (which === '') return hexText(held, on);
		return String(channelValue(held, which));
	});
	const boxKind = computed(() => (box.channel === '' ? 'text' : 'number'));
	const boxNamed = computed(() => {
		const which = box.channel;
		return which === '' ? 'Hex' : channelName(which);
	});
	const boxLowest = computed(() => {
		const which = box.channel;
		return which === '' ? undefined : channelRange(which).min;
	});
	const boxHighest = computed(() => {
		const which = box.channel;
		return which === '' ? undefined : channelRange(which).max;
	});
	const boxGrain = computed(() => {
		const which = box.channel;
		return which === '' ? undefined : channelRange(which).step;
	});
	const boxMarked = computed(() => {
		const which = box.channel;
		return which === '' ? 'hex' : which;
	});
	// An entry that cannot be read as a colour is the one invalid state this box
	// reports; every other invalidity is the root's `invalid` prop.
	const boxAriaInvalid = computed(() => {
		const said = picker.invalid;
		const entry = box.typed;
		const which = box.channel;
		if (entry === '') return said ? 'true' : 'false';
		const read = which === '' ? parseHexEntry(entry) : parseChannelEntry(entry, which);
		if (read === null) return 'true';
		return said ? 'true' : 'false';
	});

	<input
		{...rest}
		el={picker.inputEls}
		type={boxKind}
		value={boxShown}
		aria-label={boxNamed}
		aria-describedby={[picker.errorEl, picker.descriptionEl]}
		aria-invalid={boxAriaInvalid}
		min={boxLowest}
		max={boxHighest}
		step={boxGrain}
		autocomplete="off"
		spellcheck="false"
		disabled={picker.disabled}
		readonly={picker.readonly}
		ui-channel={boxMarked}
		onInput={(event) => {
			box.typed = (event.target as HTMLInputElement).value;
			onInput?.(event);
		}}
		onKeydown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				const field = event.target as HTMLInputElement;
				const raw = field.value;
				const read =
					box.channel === '' ? parseHexEntry(raw) : parseChannelEntry(raw, box.channel);
				picker.commitEntry(box.channel, raw);
				box.typed = '';
				// A refused entry leaves the graph alone, so nothing would re-display it.
				if (read === null) field.value = boxShown;
			}

			onKeydown?.(event);
		}}
		onBlur={(event) => {
			const field = event.target as HTMLInputElement;
			const raw = field.value;
			const read =
				box.channel === '' ? parseHexEntry(raw) : parseChannelEntry(raw, box.channel);
			picker.commitEntry(box.channel, raw);
			box.typed = '';
			if (read === null) field.value = boxShown;
			onBlur?.(event);
		}}
	/>
}

/**
 * A real `<button>` carrying `aria-pressed`, boxNamed by the colour and the value it
 * stands for. `aria-selected` is not supported on `button`, which is calendar's
 * shipped ruling applied unchanged.
 */
export function ColorpickerItem({ value, children, onClick, ...rest }: ColorpickerItemProps) @{
	const picker = colorpickerState();
	// The colour as a graph cell: a computed() that closes over the prop itself is
	// MARKLESS_CAPTURE_OPAQUE_PROP, because the prop is one loop row's own value.
	const swatch: ColorpickerItemInstanceState = state({ value });

	const swatchNamed = computed(() => {
		const now = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		const held = parseColor(swatch.value);
		return swatchLabel(held === null ? now : held, on, swatch.value);
	});
	const swatchPainted = computed(() => {
		const on = picker.withAlpha;
		const held = parseColor(swatch.value);
		return held === null ? '' : rootStyleText(held, on);
	});
	const swatchPressed = computed(() => {
		const now = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		const held = parseColor(swatch.value);
		if (held === null) return false;
		return hexText(held, on) === hexText(now, on);
	});

	<button
		{...rest}
		el={picker.itemEls}
		type="button"
		value={swatch.value}
		style={swatchPainted}
		aria-label={swatchNamed}
		aria-pressed={swatchPressed ? 'true' : 'false'}
		disabled={picker.disabled}
		ui-value={swatch.value}
		ui-selected={swatchPressed}
		onClick={(event) => {
			picker.setColor(swatch.value);
			onClick?.(event);
		}}
	>{children}</button>
}

/** The colour as words and as hex, or whatever the consumer writes instead. */
export function ColorpickerValueLabel({ children, ...rest }: ColorpickerValueLabelProps) @{
	const picker = colorpickerState();
	const labelText = computed(() => {
		const now = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		return `${colorName(now, on)}, ${hexText(now, on)}`;
	});
	const labelShown = computed(() => {
		const now = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		return hexText(now, on);
	});

	<output {...rest} ui-value={labelShown} ui-disabled={picker.disabled}>
		@if (children) {
			<>{children}</>
		} @else {
			<>{labelText}</>
		}
	</output>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it. `type="text"` rather than
// `type="color"`, which coerces its own value, cannot be empty, and carries alpha
// only through an attribute barely any engine ships.
export function ColorpickerField({ ...rest }: ColorpickerFieldProps) @{
	const picker = colorpickerState();
	const fieldSubmitted = computed(() => {
		const now = colorOf(picker.text, picker.seed);
		const on = picker.withAlpha;
		return hexText(now, on);
	});
	const fieldAriaInvalid = computed(() => (picker.invalid ? 'true' : 'false'));

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={picker.fieldName}
			value={fieldSubmitted}
			aria-invalid={fieldAriaInvalid}
			required={picker.required}
			disabled={picker.disabled}
		/>
	</VisuallyHidden>
}
