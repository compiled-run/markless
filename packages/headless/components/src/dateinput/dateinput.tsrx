import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	MAX_MONTH,
	MAX_YEAR,
	MIN_DAY,
	MIN_MONTH,
	MIN_YEAR,
	composeIso,
	keyOutcome,
	resolvedDayMax,
	resolvedDisplay,
	resolvedEmpty,
	resolvedNumber,
	resolvedText,
	resolvedTexts,
	resolvedValue,
	type SegmentType,
} from './date-input-math.ts';
import type {
	DateInputDayInputProps,
	DateInputDescriptionProps,
	DateInputErrorProps,
	DateInputFieldProps,
	DateInputInstanceState,
	DateInputLabelProps,
	DateInputMonthInputProps,
	DateInputRootProps,
	DateInputItemInstanceState,
	DateInputItemProps,
	DateInputYearInputProps,
} from './dateinput-types.ts';

// One computed() cell per comparison: a comparison written inline in an attribute
// renders once and then goes stale.

export const dateinputState = shared(
	() => {
		const dateinput: DateInputInstanceState = state({
			seed: '',
			dayAt: null,
			monthAt: null,
			yearAt: null,
			min: '',
			max: '',
			disabled: false,
			required: false,
			invalid: false,
			name: '',
		});
		const describedEl = element<HTMLDivElement>();
		const segmentEls = element<HTMLSpanElement[]>();

		const value = computed(() =>
			resolvedValue(dateinput.seed, dateinput.dayAt, dateinput.monthAt, dateinput.yearAt),
		);
		const dayMax = computed(() =>
			resolvedDayMax(dateinput.seed, dateinput.dayAt, dateinput.monthAt, dateinput.yearAt),
		);
		const isEmpty = computed(() =>
			resolvedEmpty(dateinput.seed, dateinput.dayAt, dateinput.monthAt, dateinput.yearAt),
		);

		return {
			...dateinput,
			describedEl,
			segmentEls,
			value,
			dayMax,
			isEmpty,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string | null) => void) | undefined,

			// `event.target`, never `currentTarget`: a dispatch runs after the browser
			// has finished with the event, and `currentTarget` is null by then.
			press(from: EventTarget | null, key: string) {
				if (dateinput.disabled) return;

				const box = from as HTMLSpanElement | null;
				if (!box) return;

				const boxes = segmentEls ?? [];
				const at = boxes.indexOf(box);
				// The element says which part of the date it holds; nothing has to be
				// carried into the dispatch to know it.
				const type = (box.getAttribute('ui-type') ?? 'day') as SegmentType;
				const texts = resolvedTexts(
					dateinput.seed,
					dateinput.dayAt,
					dateinput.monthAt,
					dateinput.yearAt,
				);
				const before = composeIso(texts.year, texts.month, texts.day);
				const outcome = keyOutcome(
					type,
					key,
					texts,
					dateinput.min,
					dateinput.max,
					new Date(),
				);
				if (outcome === null) return;

				dateinput.dayAt = outcome.day;
				dateinput.monthAt = outcome.month;
				dateinput.yearAt = outcome.year;

				if (outcome.move !== 0) {
					const landing = boxes[at + outcome.move];
					landing?.focus();
				}

				const after = composeIso(outcome.year, outcome.month, outcome.day);
				if (after !== before) dateinput.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

// A <fieldset> named by its <legend>: three boxes have no single control to point
// a `for` at, and a widget root cannot mint an id for a part it contains.
export function DateInputRoot({
	value = '',
	min = '',
	max = '',
	disabled = false,
	required = false,
	name = '',
	onChange,
	children,
	...rest
}: DateInputRootProps) @{
	const dateinput = dateinputState();
	dateinput.onChange = onChange;
	dateinput.seed = value;
	dateinput.min = min;
	dateinput.max = max;
	dateinput.disabled = disabled;
	dateinput.required = required;
	dateinput.name = name;

	// The root's own cell: a widget root cannot render a computed declared in the
	// factory it is creating.
	const isEmpty = computed(() =>
		resolvedEmpty(dateinput.seed, dateinput.dayAt, dateinput.monthAt, dateinput.yearAt),
	);
	const ariaDisabled = computed(() => (dateinput.disabled ? 'true' : 'false'));

	<fieldset
		{...rest}
		role="group"
		aria-disabled={ariaDisabled}
		ui-disabled={dateinput.disabled}
		ui-required={dateinput.required}
		ui-empty={isEmpty}
	>{children}</fieldset>
}

export function DateInputLabel({ children, ...rest }: DateInputLabelProps) @{
	const dateinput = dateinputState();

	<legend {...rest} ui-disabled={dateinput.disabled}>{children}</legend>
}

// A focusable element drawing its own digits, not an `<input>`: an input's shown
// text is its `value` property, which stops following the attribute once a person
// types, so the graph could never be the one thing that says what a box shows.
function DateInputItem({
	type,
	placeholder,
	showLeadingZero = false,
	onKeydown,
	onPaste,
	...rest
}: Omit<DateInputItemProps, 'placeholder'> & {
	readonly type: SegmentType;
	readonly placeholder: string;
}) @{
	const dateinput = dateinputState();
	// The type as a graph cell: compared against the prop instead, the comparison
	// stops refreshing once the page has resumed.
	const segment: DateInputItemInstanceState = state({ type, showLeadingZero, placeholder });

	const shown = computed(() =>
		resolvedDisplay(
			segment.type,
			dateinput.seed,
			dateinput.dayAt,
			dateinput.monthAt,
			dateinput.yearAt,
			segment.showLeadingZero,
			segment.placeholder,
		),
	);
	const now = computed(() =>
		resolvedNumber(
			segment.type,
			dateinput.seed,
			dateinput.dayAt,
			dateinput.monthAt,
			dateinput.yearAt,
		),
	);
	const digits = computed(() =>
		resolvedDisplay(
			segment.type,
			dateinput.seed,
			dateinput.dayAt,
			dateinput.monthAt,
			dateinput.yearAt,
			segment.showLeadingZero,
			'',
		),
	);
	const isPlaceholder = computed(
		() =>
			resolvedText(
				segment.type,
				dateinput.seed,
				dateinput.dayAt,
				dateinput.monthAt,
				dateinput.yearAt,
			) === '',
	);
	const named = computed(() => `${segment.type} input`);
	const lowest = computed(() =>
		segment.type === 'day' ? MIN_DAY : segment.type === 'month' ? MIN_MONTH : MIN_YEAR,
	);
	const highest = computed(() =>
		segment.type === 'day'
			? dateinput.dayMax
			: segment.type === 'month'
				? MAX_MONTH
				: MAX_YEAR,
	);
	const ariaInvalid = computed(() => (dateinput.invalid ? 'true' : 'false'));
	const ariaDisabled = computed(() => (dateinput.disabled ? 'true' : 'false'));
	const tabStop = computed(() => (dateinput.disabled ? -1 : 0));

	<span
		{...rest}
		el={dateinput.segmentEls}
		role="spinbutton"
		tabindex={tabStop}
		aria-label={named}
		aria-describedby={dateinput.describedEl}
		aria-valuenow={now}
		aria-valuemin={lowest}
		aria-valuemax={highest}
		aria-invalid={ariaInvalid}
		aria-disabled={ariaDisabled}
		ui-type={segment.type}
		ui-value={digits}
		ui-placeholder={isPlaceholder}
		ui-disabled={dateinput.disabled}
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
				event.key === 'End' ||
				event.key === 'Backspace' ||
				event.key === 'Delete'
			) {
				event.preventDefault();
			}

			dateinput.press(event.target, event.key);
			onKeydown?.(event);
		}}
		onPaste={(event) => {
			event.preventDefault();
			onPaste?.(event);
		}}
	>{shown}</span>
}

export function DateInputDayInput({ ...rest }: DateInputDayInputProps) @{
	<DateInputItem placeholder="dd" {...rest} type="day" />
}

export function DateInputMonthInput({ ...rest }: DateInputMonthInputProps) @{
	<DateInputItem placeholder="mm" {...rest} type="month" />
}

export function DateInputYearInput({ ...rest }: DateInputYearInputProps) @{
	<DateInputItem placeholder="yyyy" {...rest} type="year" />
}

// One part stands behind both `dateinput.description` and `dateinput.error`: an
// element() handle binds in exactly one place, and aria-describedby names exactly
// one id. A field that mounts both messages is described by the first.
function DateInputMessage({ children, ...rest }: DateInputDescriptionProps) @{
	const dateinput = dateinputState();

	<div {...rest} el={dateinput.describedEl}>{children}</div>
}

export function DateInputDescription({ children, ...rest }: DateInputDescriptionProps) @{
	<DateInputMessage {...rest}>{children}</DateInputMessage>
}

export function DateInputError({ children, ...rest }: DateInputErrorProps) @{
	const dateinput = dateinputState();
	// Mounting the error part is what marks the boxes invalid.
	dateinput.invalid = true;

	<DateInputMessage {...rest}>{children}</DateInputMessage>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it.
export function DateInputField({ ...rest }: DateInputFieldProps) @{
	const dateinput = dateinputState();
	const submitted = computed(() => dateinput.value ?? '');

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={dateinput.name}
			value={submitted}
			required={dateinput.required}
			disabled={dateinput.disabled}
		/>
	</VisuallyHidden>
}
