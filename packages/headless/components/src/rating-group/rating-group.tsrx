// Every computed carries a name unique to the whole module and reads its cells
// into locals before calling anything: two parts sharing a computed name resolve
// to one symbol, and a cell read nested inside a call has no name to lower to.

import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	boundedValue,
	fillStyleText,
	hasPreview,
	heldValue,
	isChecked,
	isFilled,
	isHalfFilled,
	isTabStop,
	itemName,
	keyTarget,
	noPreview,
	positionsOf,
	shownValue,
	valueAtPointer,
	valueText,
} from './rating-group-math.ts';
import { isRightToLeft, markAt, markBox, markToFocus } from './rating-group-walk.ts';
import type {
	RatingGroupBoxProps,
	RatingGroupDescriptionProps,
	RatingGroupErrorProps,
	RatingGroupFieldProps,
	RatingGroupInstanceState,
	RatingGroupItemPosition,
	RatingGroupItemProps,
	RatingGroupLabelProps,
	RatingGroupRootProps,
	RatingGroupValueLabelProps,
} from './rating-group-types.ts';

export const ratinggroupState = shared(
	() => {
		const rating: RatingGroupInstanceState = state({
			seed: 0,
			given: undefined,
			held: null,
			count: 5,
			half: false,
			readonly: false,
			disabled: false,
			required: false,
			name: '',
			// -1, the "no hover is offering anything" sentinel `noPreview()` names.
			previewAt: -1,
		});
		const groupEl = element<HTMLDivElement>();
		const labelEl = element<HTMLSpanElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		// The array type argument makes the handle plural: bound on every mark, read back live and in document order.
		const itemEls = element<HTMLDivElement[]>();

		// `rated`, not `value`: a lifted symbol inside `ratinggroup.item` that reads
		// `instance.value` while the part declares a `value` prop is refused by capture analysis.
		const rated = computed(() => {
			const given = rating.given;
			const own = rating.held;
			const seed = rating.seed;
			return heldValue(given, own, seed);
		});
		// What the marks draw. A preview never reaches `rated`, which is the whole of "transient".
		const shown = computed(() => {
			const now = rated;
			const offered = rating.previewAt;
			return shownValue(now, offered);
		});
		const positions = computed(() => {
			const total = rating.count;
			return positionsOf(total);
		});

		return {
			...rating,
			groupEl,
			labelEl,
			descriptionEl,
			errorEl,
			itemEls,
			rated,
			shown,
			positions,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: number) => void) | undefined,

			/** What a hover over one mark is offering. Nothing is written back. */
			previewFrom(at: number, clientX: number) {
				if (rating.disabled || rating.readonly) return;

				const marks = itemEls;
				const halves = rating.half;
				const box = markBox(markAt(marks, at));
				const rtl = isRightToLeft(groupEl);
				rating.previewAt = valueAtPointer(at, clientX, box.left, box.width, halves, rtl);
			},

			clearPreview() {
				rating.previewAt = noPreview();
			},

			/** A press on one mark takes the half the pointer is standing on. */
			pressAt(at: number, clientX: number, fromPointer: boolean) {
				if (rating.disabled || rating.readonly) return;

				const total = rating.count;
				const now = rated;
				const halves = rating.half;
				const marks = itemEls;
				const box = markBox(markAt(marks, at));
				const rtl = isRightToLeft(groupEl);
				// A keyboard-synthesised click carries no coordinates, so it takes the whole mark.
				const aimed = fromPointer
					? valueAtPointer(at, clientX, box.left, box.width, halves, rtl)
					: at;
				const landed = boundedValue(aimed, total);
				if (landed === now) return;

				rating.held = landed;
				rating.onChange?.(landed);
			},

			/** A key moves the rating, and focus follows it onto the mark it reaches. */
			stepTo(key: string, shiftKey: boolean) {
				if (rating.disabled || rating.readonly) return;

				const total = rating.count;
				const now = rated;
				const halves = rating.half;
				const marks = itemEls;
				const rtl = isRightToLeft(groupEl);
				const next = keyTarget(key, now, total, halves, rtl);
				if (next === null) return;

				if (next !== now) {
					// A key ends any hover offer: what is heard and what is drawn must agree.
					rating.previewAt = noPreview();
					rating.held = next;
					rating.onChange?.(next);
				}
				// After the write, never before it: the mark focus lands on is the one the new rating reaches.
				markToFocus(marks, next, total)?.focus();
			},
		};
	},
	{ scope: 'widget' },
);

export function RatingGroupRoot({
	value,
	defaultValue = 0,
	count = 5,
	half = false,
	readonly: isReadonly = false,
	disabled = false,
	required = false,
	name = '',
	onChange,
	children,
	...rest
}: RatingGroupRootProps) @{
	const rating = ratinggroupState();
	rating.onChange = onChange;
	rating.given = value;
	rating.seed = defaultValue;
	rating.count = count;
	rating.half = half;
	rating.readonly = isReadonly;
	rating.disabled = disabled;
	rating.required = required;
	rating.name = name;

	<RatingGroupBox {...rest}>{children}</RatingGroupBox>
}

// A separate part rather than the root's own element: a widget root cannot read its
// own instance token, so the label IDREF only resolves one component deeper.
function RatingGroupBox({ children, onPointerleave, ...rest }: RatingGroupBoxProps) @{
	const rating = ratinggroupState();
	const boxAriaDisabled = computed(() => (rating.disabled ? 'true' : undefined));
	const boxAriaReadonly = computed(() => (rating.readonly ? 'true' : undefined));
	const boxAriaRequired = computed(() => (rating.required ? 'true' : undefined));

	<div
		{...rest}
		el={rating.groupEl}
		role="radiogroup"
		aria-labelledby={rating.labelEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[rating.errorEl, rating.descriptionEl]}
		aria-disabled={boxAriaDisabled}
		aria-readonly={boxAriaReadonly}
		// The marks are `role="radio"` elements, not native controls, so nothing
		// here can carry constraint validation: `required` is announced, not enforced.
		aria-required={boxAriaRequired}
		ui-disabled={rating.disabled}
		ui-readonly={rating.readonly}
		ui-required={rating.required}
		ui-count={rating.count}
		ui-value={rating.rated}
		onPointerleave={(event) => {
			rating.clearPreview();
			onPointerleave?.(event);
		}}
	>{children}</div>
}

export function RatingGroupLabel({ children, ...rest }: RatingGroupLabelProps) @{
	const rating = ratinggroupState();

	<span {...rest} el={rating.labelEl} ui-disabled={rating.disabled}>{children}</span>
}

export function RatingGroupDescription({ children, ...rest }: RatingGroupDescriptionProps) @{
	const rating = ratinggroupState();

	<div {...rest} el={rating.descriptionEl}>{children}</div>
}

export function RatingGroupError({ children, ...rest }: RatingGroupErrorProps) @{
	const rating = ratinggroupState();

	<div {...rest} el={rating.errorEl}>{children}</div>
}

/**
 * One position. `role="radio"` on the mark itself rather than a native input
 * beside it: a rating carries half values, and a radio cannot be half checked,
 * so the number a form receives lives on `ratinggroup.field` alone.
 */
export function RatingGroupItem({
	value,
	children,
	onClick,
	onKeydown,
	onPointermove,
	...rest
}: RatingGroupItemProps) @{
	const rating = ratinggroupState();
	// The position as a graph cell: a computed() that closes over the prop itself
	// is MARKLESS_CAPTURE_OPAQUE_PROP, because the prop is one repeat row's own value.
	const star: RatingGroupItemPosition = state({ value });

	const starChecked = computed(() => {
		const at = star.value;
		const now = rating.rated;
		return isChecked(at, now) ? 'true' : 'false';
	});
	const starFilled = computed(() => {
		const at = star.value;
		const drawn = rating.shown;
		return isFilled(at, drawn);
	});
	const starHalf = computed(() => {
		const at = star.value;
		const drawn = rating.shown;
		return isHalfFilled(at, drawn);
	});
	const starPreviewed = computed(() => {
		const offered = rating.previewAt;
		return hasPreview(offered);
	});
	const starFill = computed(() => {
		const at = star.value;
		const drawn = rating.shown;
		return fillStyleText(at, drawn);
	});
	const starName = computed(() => {
		const at = star.value;
		const total = rating.count;
		return itemName(at, total);
	});
	// Hoisted rather than written inline: radio-group measured an inline tabindex
	// conditional destabilising the first gesture after resume.
	const starTabStop = computed(() => {
		const at = star.value;
		const now = rating.rated;
		const total = rating.count;
		if (rating.disabled) return -1;
		return isTabStop(at, now, total) ? 0 : -1;
	});
	const starAriaDisabled = computed(() => (rating.disabled ? 'true' : 'false'));

	<div
		// Before the spread so a consumer's own name for this mark replaces it.
		aria-label={starName}
		{...rest}
		el={rating.itemEls}
		role="radio"
		tabindex={starTabStop}
		style={starFill}
		aria-checked={starChecked}
		aria-disabled={starAriaDisabled}
		aria-setsize={rating.count}
		aria-posinset={star.value}
		ui-star={true}
		ui-value={star.value}
		ui-filled={starFilled}
		ui-half={starHalf}
		ui-preview={starPreviewed}
		ui-disabled={rating.disabled}
		ui-readonly={rating.readonly}
		onPointermove={(event) => {
			const at = star.value;
			rating.previewFrom(at, event.clientX);
			onPointermove?.(event);
		}}
		onClick={(event) => {
			const at = star.value;
			// `detail` is 0 only for a click nobody pointed at, which is the one a key made.
			rating.pressAt(at, event.clientX, event.detail !== 0);
			onClick?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === ' '
			) {
				event.preventDefault();
			}

			if (event.key === ' ' || event.key === 'Enter') {
				const at = star.value;
				rating.pressAt(at, 0, false);
				onKeydown?.(event);
				return;
			}

			rating.stepTo(event.key, event.shiftKey);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				/* The containing block for a half fill the consumer paints over the
				   mark, and the selection a drag across the marks would otherwise make. */
				[ui-star] {
					position: relative;
					-webkit-user-select: none;
					user-select: none;
				}
			}
		</style>
		{children}
	</div>
}

// Renders the value rather than accepting children: a part cannot tell whether it
// was given any, so a fallback branch would render nothing for everybody.
export function RatingGroupValueLabel({ ...rest }: RatingGroupValueLabelProps) @{
	const rating = ratinggroupState();
	const readoutText = computed(() => {
		const now = rating.rated;
		const total = rating.count;
		return valueText(now, total);
	});

	<output
		{...rest}
		ui-value={readoutText}
		ui-disabled={rating.disabled}
		ui-readonly={rating.readonly}
	>{readoutText}</output>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it.
export function RatingGroupField({ ...rest }: RatingGroupFieldProps) @{
	const rating = ratinggroupState();
	const fieldSubmitted = computed(() => {
		const now = rating.rated;
		return `${now}`;
	});

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={rating.name}
			value={fieldSubmitted}
			disabled={rating.disabled}
			readonly={rating.readonly}
		/>
	</VisuallyHidden>
}
