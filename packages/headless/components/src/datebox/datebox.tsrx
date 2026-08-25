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
} from './datebox-math.ts';
import type {
	DateBoxDayInputProps,
	DateBoxDescriptionProps,
	DateBoxErrorProps,
	DateBoxFieldProps,
	DateBoxGroupProps,
	DateBoxInstanceState,
	DateBoxLabelProps,
	DateBoxMonthInputProps,
	DateBoxRootProps,
	DateBoxItemInstanceState,
	DateBoxItemProps,
	DateBoxYearInputProps,
} from './datebox-types.ts';

// One computed() cell per comparison: a comparison written inline in an attribute
// renders once and then goes stale.

export const dateboxState = shared(
	() => {
		const datebox: DateBoxInstanceState = state({
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
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const labelEl = element<HTMLLabelElement>();
		const segmentEls = element<HTMLSpanElement[]>();

		const value = computed(() =>
			resolvedValue(datebox.seed, datebox.dayAt, datebox.monthAt, datebox.yearAt),
		);
		const dayMax = computed(() =>
			resolvedDayMax(datebox.seed, datebox.dayAt, datebox.monthAt, datebox.yearAt),
		);
		const isEmpty = computed(() =>
			resolvedEmpty(datebox.seed, datebox.dayAt, datebox.monthAt, datebox.yearAt),
		);

		return {
			...datebox,
			descriptionEl,
			errorEl,
			labelEl,
			segmentEls,
			value,
			dayMax,
			isEmpty,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string | null) => void) | undefined,

			// `event.target`, never `currentTarget`: a dispatch runs after the browser
			// has finished with the event, and `currentTarget` is null by then.
			press(from: EventTarget | null, key: string) {
				if (datebox.disabled) return;

				const box = from as HTMLSpanElement | null;
				if (!box) return;

				const boxes = segmentEls ?? [];
				const at = boxes.indexOf(box);
				// The element says which part of the date it holds; nothing has to be
				// carried into the dispatch to know it.
				const type = (box.getAttribute('ui-type') ?? 'day') as SegmentType;
				const texts = resolvedTexts(
					datebox.seed,
					datebox.dayAt,
					datebox.monthAt,
					datebox.yearAt,
				);
				const before = composeIso(texts.year, texts.month, texts.day);
				const outcome = keyOutcome(
					type,
					key,
					texts,
					datebox.min,
					datebox.max,
					new Date(),
				);
				if (outcome === null) return;

				datebox.dayAt = outcome.day;
				datebox.monthAt = outcome.month;
				datebox.yearAt = outcome.year;

				if (outcome.move !== 0) {
					const landing = boxes[at + outcome.move];
					landing?.focus();
				}

				const after = composeIso(outcome.year, outcome.month, outcome.day);
				if (after !== before) datebox.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

export function DateBoxRoot({
	value = '',
	min = '',
	max = '',
	disabled = false,
	required = false,
	name = '',
	onChange,
	children,
	...rest
}: DateBoxRootProps) @{
	const datebox = dateboxState();
	datebox.onChange = onChange;
	datebox.seed = value;
	datebox.min = min;
	datebox.max = max;
	datebox.disabled = disabled;
	datebox.required = required;
	datebox.name = name;

	<DateBoxGroup {...rest}>{children}</DateBoxGroup>
}

// A separate part rather than the root's own element: a widget root cannot read its
// own instance token, so the label IDREF only resolves one component deeper.
function DateBoxGroup({ children, ...rest }: DateBoxGroupProps) @{
	const datebox = dateboxState();
	const isEmpty = computed(() =>
		resolvedEmpty(datebox.seed, datebox.dayAt, datebox.monthAt, datebox.yearAt),
	);
	const ariaDisabled = computed(() => (datebox.disabled ? 'true' : 'false'));

	<div
		{...rest}
		role="group"
		aria-labelledby={datebox.labelEl}
		aria-disabled={ariaDisabled}
		ui-disabled={datebox.disabled}
		ui-required={datebox.required}
		ui-empty={isEmpty}
	>{children}</div>
}

export function DateBoxLabel({ children, ...rest }: DateBoxLabelProps) @{
	const datebox = dateboxState();

	<label {...rest} el={datebox.labelEl} ui-disabled={datebox.disabled}>{children}</label>
}

// A focusable element drawing its own digits, not an `<input>`: an input's shown
// text is its `value` property, which stops following the attribute once a person
// types, so the graph could never be the one thing that says what a box shows.
function DateBoxItem({
	type,
	placeholder,
	showLeadingZero = false,
	onKeydown,
	onPaste,
	...rest
}: Omit<DateBoxItemProps, 'placeholder'> & {
	readonly type: SegmentType;
	readonly placeholder: string;
}) @{
	const datebox = dateboxState();
	// The type as a graph cell: compared against the prop instead, the comparison
	// stops refreshing once the page has resumed.
	const segment: DateBoxItemInstanceState = state({ type, showLeadingZero, placeholder });

	const shown = computed(() =>
		resolvedDisplay(
			segment.type,
			datebox.seed,
			datebox.dayAt,
			datebox.monthAt,
			datebox.yearAt,
			segment.showLeadingZero,
			segment.placeholder,
		),
	);
	const now = computed(() =>
		resolvedNumber(
			segment.type,
			datebox.seed,
			datebox.dayAt,
			datebox.monthAt,
			datebox.yearAt,
		),
	);
	const digits = computed(() =>
		resolvedDisplay(
			segment.type,
			datebox.seed,
			datebox.dayAt,
			datebox.monthAt,
			datebox.yearAt,
			segment.showLeadingZero,
			'',
		),
	);
	const isPlaceholder = computed(
		() =>
			resolvedText(
				segment.type,
				datebox.seed,
				datebox.dayAt,
				datebox.monthAt,
				datebox.yearAt,
			) === '',
	);
	const named = computed(() => `${segment.type} input`);
	const lowest = computed(() =>
		segment.type === 'day' ? MIN_DAY : segment.type === 'month' ? MIN_MONTH : MIN_YEAR,
	);
	const highest = computed(() =>
		segment.type === 'day'
			? datebox.dayMax
			: segment.type === 'month'
				? MAX_MONTH
				: MAX_YEAR,
	);
	const ariaInvalid = computed(() => (datebox.invalid ? 'true' : 'false'));
	const ariaDisabled = computed(() => (datebox.disabled ? 'true' : 'false'));
	const tabStop = computed(() => (datebox.disabled ? -1 : 0));

	<span
		{...rest}
		el={datebox.segmentEls}
		role="spinbutton"
		tabindex={tabStop}
		aria-label={named}
		// Error before description: what is wrong is conveyed before the format hint,
		// wherever the two parts sit in the page.
		aria-describedby={[datebox.errorEl, datebox.descriptionEl]}
		aria-valuenow={now}
		aria-valuemin={lowest}
		aria-valuemax={highest}
		aria-invalid={ariaInvalid}
		aria-disabled={ariaDisabled}
		ui-type={segment.type}
		ui-value={digits}
		ui-placeholder={isPlaceholder}
		ui-disabled={datebox.disabled}
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

			datebox.press(event.target, event.key);
			onKeydown?.(event);
		}}
		onPaste={(event) => {
			event.preventDefault();
			onPaste?.(event);
		}}
	>{shown}</span>
}

export function DateBoxDayInput({ ...rest }: DateBoxDayInputProps) @{
	<DateBoxItem placeholder="dd" {...rest} type="day" />
}

export function DateBoxMonthInput({ ...rest }: DateBoxMonthInputProps) @{
	<DateBoxItem placeholder="mm" {...rest} type="month" />
}

export function DateBoxYearInput({ ...rest }: DateBoxYearInputProps) @{
	<DateBoxItem placeholder="yyyy" {...rest} type="year" />
}

export function DateBoxDescription({ children, ...rest }: DateBoxDescriptionProps) @{
	const datebox = dateboxState();

	<div {...rest} el={datebox.descriptionEl}>{children}</div>
}

export function DateBoxError({ children, ...rest }: DateBoxErrorProps) @{
	const datebox = dateboxState();
	// Mounting the error part is what marks the boxes invalid.
	datebox.invalid = true;

	<div {...rest} el={datebox.errorEl}>{children}</div>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it.
export function DateBoxField({ ...rest }: DateBoxFieldProps) @{
	const datebox = dateboxState();
	const submitted = computed(() => datebox.value ?? '');

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={datebox.name}
			value={submitted}
			required={datebox.required}
			disabled={datebox.disabled}
		/>
	</VisuallyHidden>
}
