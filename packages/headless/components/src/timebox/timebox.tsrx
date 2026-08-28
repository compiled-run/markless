import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	AM,
	MAX_HOUR_12,
	MAX_HOUR_24,
	MAX_MINUTE,
	MIN_HOUR_12,
	MIN_HOUR_24,
	MIN_MINUTE,
	PM,
	composeIso,
	keyOutcome,
	localeHour12,
	localeOrder,
	resolvedDisplay,
	resolvedEmpty,
	resolvedNumber,
	resolvedPeriodWord,
	resolvedTexts,
	resolvedValue,
	type SegmentType,
} from './timebox-math.ts';
import type {
	TimeBoxDayPeriodInputProps,
	TimeBoxDescriptionProps,
	TimeBoxErrorProps,
	TimeBoxFieldProps,
	TimeBoxGroupProps,
	TimeBoxHourInputProps,
	TimeBoxInstanceState,
	TimeBoxItemInstanceState,
	TimeBoxItemProps,
	TimeBoxLabelProps,
	TimeBoxMinuteInputProps,
	TimeBoxRootProps,
	TimeBoxSecondInputProps,
} from './timebox-types.ts';

// One computed() cell per comparison: a comparison written inline in an attribute
// renders once and then goes stale.

export const timeboxState = shared(
	() => {
		const timebox: TimeBoxInstanceState = state({
			seed: '',
			hourAt: null,
			minuteAt: null,
			secondAt: null,
			periodAt: null,
			min: '',
			max: '',
			locale: '',
			hour12Prop: undefined,
			seconds: false,
			disabled: false,
			readonly: false,
			required: false,
			invalid: false,
			name: '',
		});
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const labelEl = element<HTMLLabelElement>();
		const segmentEls = element<HTMLSpanElement[]>();

		// Whether this field shows a 12-hour clock is the locale's answer unless the
		// consumer overrode it, and almost every other cell is derived through it.
		const hour12 = computed(() => localeHour12(timebox.locale, timebox.hour12Prop));
		const order = computed(() =>
			localeOrder(timebox.locale, timebox.hour12Prop, timebox.seconds),
		);
		const value = computed(() =>
			resolvedValue(
				timebox.seed,
				timebox.hourAt,
				timebox.minuteAt,
				timebox.secondAt,
				timebox.periodAt,
				localeHour12(timebox.locale, timebox.hour12Prop),
				timebox.seconds,
			),
		);
		const isEmpty = computed(() =>
			resolvedEmpty(
				timebox.seed,
				timebox.hourAt,
				timebox.minuteAt,
				timebox.secondAt,
				timebox.periodAt,
				localeHour12(timebox.locale, timebox.hour12Prop),
			),
		);

		return {
			...timebox,
			descriptionEl,
			errorEl,
			labelEl,
			segmentEls,
			hour12,
			order,
			value,
			isEmpty,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string | null) => void) | undefined,

			// `event.target`, never `currentTarget`: a dispatch runs after the browser
			// has finished with the event, and `currentTarget` is null by then.
			press(from: EventTarget | null, key: string) {
				if (timebox.disabled || timebox.readonly) return;

				const box = from as HTMLSpanElement | null;
				if (!box) return;

				const boxes = segmentEls ?? [];
				const at = boxes.indexOf(box);
				// The element says which part of the time it holds; nothing has to be
				// carried into the dispatch to know it.
				const type = (box.getAttribute('ui-type') ?? 'hour') as SegmentType;
				const clock = localeHour12(timebox.locale, timebox.hour12Prop);
				const texts = resolvedTexts(
					timebox.seed,
					timebox.hourAt,
					timebox.minuteAt,
					timebox.secondAt,
					timebox.periodAt,
					clock,
				);
				const before = composeIso(texts, clock, timebox.seconds);
				const outcome = keyOutcome(
					type,
					key,
					texts,
					timebox.min,
					timebox.max,
					clock,
					timebox.seconds,
				);
				if (outcome === null) return;

				timebox.hourAt = outcome.hour;
				timebox.minuteAt = outcome.minute;
				timebox.secondAt = outcome.second;
				timebox.periodAt = outcome.dayperiod;

				if (outcome.move !== 0) {
					const landing = boxes[at + outcome.move];
					landing?.focus();
				}

				const after = composeIso(outcome, clock, timebox.seconds);
				if (after !== before) timebox.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

export function TimeBoxRoot({
	value = '',
	min = '',
	max = '',
	locale = '',
	hour12,
	disabled = false,
	readonly = false,
	required = false,
	name = '',
	onChange,
	children,
	...rest
}: TimeBoxRootProps) @{
	const timebox = timeboxState();
	timebox.onChange = onChange;
	timebox.seed = value;
	timebox.min = min;
	timebox.max = max;
	timebox.locale = locale;
	timebox.hour12Prop = hour12;
	timebox.disabled = disabled;
	timebox.readonly = readonly;
	timebox.required = required;
	timebox.name = name;

	<TimeBoxGroup {...rest}>{children}</TimeBoxGroup>
}

// A separate part rather than the root's own element: a widget root cannot read its
// own instance token, so the label IDREF only resolves one component deeper.
function TimeBoxGroup({ children, ...rest }: TimeBoxGroupProps) @{
	const timebox = timeboxState();
	const isEmpty = computed(() =>
		resolvedEmpty(
			timebox.seed,
			timebox.hourAt,
			timebox.minuteAt,
			timebox.secondAt,
			timebox.periodAt,
			localeHour12(timebox.locale, timebox.hour12Prop),
		),
	);
	const ariaDisabled = computed(() => (timebox.disabled ? 'true' : 'false'));

	<div
		{...rest}
		role="group"
		aria-labelledby={timebox.labelEl}
		aria-disabled={ariaDisabled}
		ui-disabled={timebox.disabled}
		ui-readonly={timebox.readonly}
		ui-required={timebox.required}
		ui-empty={isEmpty}
		ui-hour12={timebox.hour12}
		ui-order={timebox.order}
	>{children}</div>
}

export function TimeBoxLabel({ children, ...rest }: TimeBoxLabelProps) @{
	const timebox = timeboxState();

	<label {...rest} el={timebox.labelEl} ui-disabled={timebox.disabled}>{children}</label>
}

// A focusable element drawing its own digits, not an `<input>`: an input's shown
// text is its `value` property, which stops following the attribute once a person
// types, so the graph could never be the one thing that says what a box shows.
// `datebox` records the same reasoning in full.
function TimeBoxItem({
	type,
	placeholder,
	showLeadingZero = false,
	onKeydown,
	onPaste,
	...rest
}: Omit<TimeBoxItemProps, 'placeholder'> & {
	readonly type: SegmentType;
	readonly placeholder: string;
}) @{
	const timebox = timeboxState();
	// The type as a graph cell: compared against the prop instead, the comparison
	// stops refreshing once the page has resumed.
	const segment: TimeBoxItemInstanceState = state({ type, showLeadingZero, placeholder });

	const shown = computed(() =>
		resolvedDisplay(
			segment.type,
			timebox.seed,
			timebox.hourAt,
			timebox.minuteAt,
			timebox.secondAt,
			timebox.periodAt,
			localeHour12(timebox.locale, timebox.hour12Prop),
			segment.showLeadingZero,
			segment.placeholder,
			timebox.locale,
		),
	);
	const now = computed(() =>
		resolvedNumber(
			segment.type,
			timebox.seed,
			timebox.hourAt,
			timebox.minuteAt,
			timebox.secondAt,
			timebox.periodAt,
			localeHour12(timebox.locale, timebox.hour12Prop),
		),
	);
	const digits = computed(() =>
		resolvedDisplay(
			segment.type,
			timebox.seed,
			timebox.hourAt,
			timebox.minuteAt,
			timebox.secondAt,
			timebox.periodAt,
			localeHour12(timebox.locale, timebox.hour12Prop),
			segment.showLeadingZero,
			'',
			timebox.locale,
		),
	);
	const isPlaceholder = computed(
		() =>
			resolvedDisplay(
				segment.type,
				timebox.seed,
				timebox.hourAt,
				timebox.minuteAt,
				timebox.secondAt,
				timebox.periodAt,
				localeHour12(timebox.locale, timebox.hour12Prop),
				segment.showLeadingZero,
				'',
				timebox.locale,
			) === '',
	);
	// The one place this family renders `aria-valuetext` where `datebox` renders
	// none: the period's value is 0 or 1, and a reader speaking a bare number here
	// has conveyed nothing. Null keeps the attribute off the numeric boxes.
	const spoken = computed(() =>
		segment.type === 'dayperiod'
			? resolvedPeriodWord(
					timebox.seed,
					timebox.hourAt,
					timebox.minuteAt,
					timebox.secondAt,
					timebox.periodAt,
					localeHour12(timebox.locale, timebox.hour12Prop),
					timebox.locale,
				) || null
			: null,
	);
	const named = computed(() =>
		segment.type === 'dayperiod' ? 'AM or PM' : `${segment.type} input`,
	);
	const lowest = computed(() =>
		segment.type === 'hour'
			? localeHour12(timebox.locale, timebox.hour12Prop)
				? MIN_HOUR_12
				: MIN_HOUR_24
			: segment.type === 'dayperiod'
				? AM
				: MIN_MINUTE,
	);
	const highest = computed(() =>
		segment.type === 'hour'
			? localeHour12(timebox.locale, timebox.hour12Prop)
				? MAX_HOUR_12
				: MAX_HOUR_24
			: segment.type === 'dayperiod'
				? PM
				: MAX_MINUTE,
	);
	const ariaInvalid = computed(() => (timebox.invalid ? 'true' : 'false'));
	const ariaDisabled = computed(() => (timebox.disabled ? 'true' : 'false'));
	const ariaReadOnly = computed(() => (timebox.readonly ? 'true' : 'false'));
	const tabStop = computed(() => (timebox.disabled ? -1 : 0));

	<span
		{...rest}
		el={timebox.segmentEls}
		role="spinbutton"
		tabindex={tabStop}
		aria-label={named}
		// Error before description: what is wrong is conveyed before the format hint,
		// wherever the two parts sit in the page.
		aria-describedby={[timebox.errorEl, timebox.descriptionEl]}
		aria-valuenow={now}
		aria-valuemin={lowest}
		aria-valuemax={highest}
		aria-valuetext={spoken}
		aria-invalid={ariaInvalid}
		aria-disabled={ariaDisabled}
		aria-readonly={ariaReadOnly}
		ui-type={segment.type}
		ui-value={digits}
		ui-placeholder={isPlaceholder}
		ui-disabled={timebox.disabled}
		ui-readonly={timebox.readonly}
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

			timebox.press(event.target, event.key);
			onKeydown?.(event);
		}}
		onPaste={(event) => {
			event.preventDefault();
			onPaste?.(event);
		}}
	>{shown}</span>
}

export function TimeBoxHourInput({ ...rest }: TimeBoxHourInputProps) @{
	<TimeBoxItem placeholder="hh" {...rest} type="hour" />
}

export function TimeBoxMinuteInput({ ...rest }: TimeBoxMinuteInputProps) @{
	<TimeBoxItem placeholder="mm" {...rest} type="minute" />
}

// Mounting this part is what makes the reported time carry seconds: the parts a
// consumer wrote are the granularity, so there is no prop to keep in step.
export function TimeBoxSecondInput({ ...rest }: TimeBoxSecondInputProps) @{
	const timebox = timeboxState();
	timebox.seconds = true;

	<TimeBoxItem placeholder="ss" {...rest} type="second" />
}

export function TimeBoxDayPeriodInput({ ...rest }: TimeBoxDayPeriodInputProps) @{
	<TimeBoxItem placeholder="--" {...rest} type="dayperiod" />
}

export function TimeBoxDescription({ children, ...rest }: TimeBoxDescriptionProps) @{
	const timebox = timeboxState();

	<div {...rest} el={timebox.descriptionEl}>{children}</div>
}

export function TimeBoxError({ children, ...rest }: TimeBoxErrorProps) @{
	const timebox = timeboxState();
	// Mounting the error part is what marks the boxes invalid.
	timebox.invalid = true;

	<div {...rest} el={timebox.errorEl}>{children}</div>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it.
export function TimeBoxField({ ...rest }: TimeBoxFieldProps) @{
	const timebox = timeboxState();
	const submitted = computed(() => timebox.value ?? '');

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={timebox.name}
			value={submitted}
			required={timebox.required}
			disabled={timebox.disabled}
		/>
	</VisuallyHidden>
}
