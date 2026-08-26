import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import { landFocus, landFocusAt } from './calendar-focus.ts';
import {
	type CalendarValue,
	addMonths,
	dayLabel,
	dayNumber,
	gridDays,
	heldList,
	isBlocked,
	previewSpan,
	resolvedFocus,
	sameMonth,
	startOfMonth,
	steppedDate,
	textOf,
	toggledList,
	todayIso,
	visibleMonth,
} from './calendar-math.ts';
import type {
	CalendarBackTriggerProps,
	CalendarContentProps,
	CalendarDescriptionProps,
	CalendarErrorProps,
	CalendarFieldProps,
	CalendarForwardTriggerProps,
	CalendarInstanceState,
	CalendarItemInstanceState,
	CalendarItemProps,
	CalendarLabelProps,
	CalendarRootProps,
	CalendarTitleProps,
	CalendarTriggerProps,
} from './calendar-types.ts';

// One computed() cell per comparison: a comparison written inline in an attribute
// renders once and then goes stale. Handlers read the plain cells instead - a
// computed() read from a handler body does not guard.

export const calendarState = shared(
	() => {
		const calendar: CalendarInstanceState = state({
			seed: null,
			pickedText: null,
			monthSeed: '',
			monthAt: '',
			focusAt: '',
			anchorAt: '',
			min: '',
			max: '',
			unavailable: [],
			startofweek: 0,
			multiple: false,
			range: false,
			disabled: false,
			readonly: false,
			required: false,
			invalid: false,
			popup: false,
			open: false,
			name: '',
		});
		const titleEl = element<HTMLHeadingElement>();
		const contentEl = element<HTMLDivElement>();
		const triggerEl = element<HTMLButtonElement>();
		const labelEl = element<HTMLLabelElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const dayEls = element<HTMLButtonElement[]>();

		// Every computed() on this factory is written out of platform globals rather
		// than out of ./calendar-math.ts, and it is not a style choice. When a
		// CONSUMER's module reads any one of them, the whole factory's derived set
		// is copied into that module, and this module's imports do not travel with
		// the copy - the read dies with a ReferenceError naming the first helper it
		// reaches. Measured: the name moved from `visibleMonth` to `heldList` as
		// each was made self-contained in turn. So the factory carries the cells
		// `calendar.state()` promises and nothing else; every other derived fact is
		// a computed() on the part that needs it, where the imports do resolve.
		// `calendar.browser.ts` pins these against the month the keyboard walks
		// through ./calendar-math.ts, which is the one place the two could drift.

		/** The first of the month on show. */
		const month = computed(() => {
			const seed = calendar.monthAt !== '' ? calendar.monthAt : calendar.monthSeed;
			const at = new Date(2000, 0, 1);
			if (seed !== '') {
				const parts = seed.split('-');
				at.setFullYear(Number(parts[0]), Number(parts[1]) - 1, 1);
			} else {
				const now = new Date();
				at.setFullYear(now.getFullYear(), now.getMonth(), 1);
			}
			return `${`${at.getFullYear()}`.padStart(4, '0')}-${`${at.getMonth() + 1}`.padStart(2, '0')}-01`;
		});
		const days = computed(() => {
			const seed = calendar.monthAt !== '' ? calendar.monthAt : calendar.monthSeed;
			const at = new Date(2000, 0, 1);
			if (seed !== '') {
				const parts = seed.split('-');
				at.setFullYear(Number(parts[0]), Number(parts[1]) - 1, 1);
			} else {
				const now = new Date();
				at.setFullYear(now.getFullYear(), now.getMonth(), 1);
			}
			const back = (((at.getDay() - calendar.startofweek) % 7) + 7) % 7;
			at.setDate(at.getDate() - back);
			const rows: string[] = [];
			for (let step = 0; step < 42; step += 1) {
				const year = `${at.getFullYear()}`.padStart(4, '0');
				const month = `${at.getMonth() + 1}`.padStart(2, '0');
				const day = `${at.getDate()}`.padStart(2, '0');
				rows.push(`${year}-${month}-${day}`);
				at.setDate(at.getDate() + 1);
			}
			return rows;
		});
		const weeks = computed(() => {
			const seed = calendar.monthAt !== '' ? calendar.monthAt : calendar.monthSeed;
			const at = new Date(2000, 0, 1);
			if (seed !== '') {
				const parts = seed.split('-');
				at.setFullYear(Number(parts[0]), Number(parts[1]) - 1, 1);
			} else {
				const now = new Date();
				at.setFullYear(now.getFullYear(), now.getMonth(), 1);
			}
			const back = (((at.getDay() - calendar.startofweek) % 7) + 7) % 7;
			at.setDate(at.getDate() - back);
			const rows: string[][] = [];
			for (let week = 0; week < 6; week += 1) {
				const row: string[] = [];
				for (let step = 0; step < 7; step += 1) {
					const year = `${at.getFullYear()}`.padStart(4, '0');
					const month = `${at.getMonth() + 1}`.padStart(2, '0');
					const day = `${at.getDate()}`.padStart(2, '0');
					row.push(`${year}-${month}-${day}`);
					at.setDate(at.getDate() + 1);
				}
				rows.push(row);
			}
			return rows;
		});
		const weekdays = computed(() => {
			// 2024-01-07 is a Sunday, so `startofweek` counts forward from it.
			const at = new Date(2024, 0, 7 + calendar.startofweek);
			const spell = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
			const names: string[] = [];
			for (let step = 0; step < 7; step += 1) {
				names.push(spell.format(at));
				at.setDate(at.getDate() + 1);
			}
			return names;
		});
		const title = computed(() => {
			const seed = calendar.monthAt !== '' ? calendar.monthAt : calendar.monthSeed;
			const at = new Date(2000, 0, 1);
			if (seed !== '') {
				const parts = seed.split('-');
				at.setFullYear(Number(parts[0]), Number(parts[1]) - 1, 1);
			} else {
				const now = new Date();
				at.setFullYear(now.getFullYear(), now.getMonth(), 1);
			}
			return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' }).format(at);
		});
		const focused = computed(() => {
			const seed = calendar.monthAt !== '' ? calendar.monthAt : calendar.monthSeed;
			const at = new Date(2000, 0, 1);
			if (seed !== '') {
				const parts = seed.split('-');
				at.setFullYear(Number(parts[0]), Number(parts[1]) - 1, 1);
			} else {
				const now = new Date();
				at.setFullYear(now.getFullYear(), now.getMonth(), 1);
			}
			const opensOn = `${`${at.getFullYear()}`.padStart(4, '0')}-${`${at.getMonth() + 1}`.padStart(2, '0')}`;
			at.setDate(at.getDate() - ((((at.getDay() - calendar.startofweek) % 7) + 7) % 7));
			const first = `${`${at.getFullYear()}`.padStart(4, '0')}-${`${at.getMonth() + 1}`.padStart(2, '0')}-${`${at.getDate()}`.padStart(2, '0')}`;
			at.setDate(at.getDate() + 41);
			const last = `${`${at.getFullYear()}`.padStart(4, '0')}-${`${at.getMonth() + 1}`.padStart(2, '0')}-${`${at.getDate()}`.padStart(2, '0')}`;
			// A focus the `month` prop moved out from under is dropped, rather than
			// leaving the grid with no tab stop at all.
			if (calendar.focusAt !== '' && calendar.focusAt >= first && calendar.focusAt <= last) {
				return calendar.focusAt;
			}
			const raw = calendar.seed;
			const written =
				typeof raw === 'string'
					? raw
					: Array.isArray(raw)
						? raw.join(',')
						: raw === null || raw === undefined
							? ''
							: `${(raw as { start: string }).start},${(raw as { end: string }).end}`;
			const text = calendar.pickedText === null ? written : calendar.pickedText;
			const list = text === '' ? [] : text.split(',');
			if (list.length > 0 && list[0].slice(0, 7) === opensOn) return list[0];
			const now = new Date();
			const today = `${`${now.getFullYear()}`.padStart(4, '0')}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
			if (today.slice(0, 7) === opensOn) return today;
			return `${opensOn}-01`;
		});
		const anchor = computed(() => (calendar.anchorAt === '' ? null : calendar.anchorAt));
		const value = computed(() => {
			const raw = calendar.seed;
			const written =
				typeof raw === 'string'
					? raw
					: Array.isArray(raw)
						? raw.join(',')
						: raw === null || raw === undefined
							? ''
							: `${(raw as { start: string }).start},${(raw as { end: string }).end}`;
			const text = calendar.pickedText === null ? written : calendar.pickedText;
			const list = text === '' ? [] : text.split(',');
			if (calendar.multiple === true) return list;
			if (calendar.range === true) {
				return list.length === 2 ? { start: list[0], end: list[1] } : null;
			}
			return list.length > 0 ? list[0] : null;
		});
		return {
			...calendar,
			titleEl,
			contentEl,
			triggerEl,
			labelEl,
			descriptionEl,
			errorEl,
			dayEls,
			month,
			days,
			weeks,
			weekdays,
			title,
			value,
			focused,
			anchor,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: CalendarValue) => void) | undefined,

			/** Move the month on one, carrying the day the keyboard is on with it. */
			next() {
				const shown = visibleMonth(calendar.monthAt, calendar.monthSeed, todayIso(new Date()));
				calendar.monthAt = addMonths(shown, 1);
				if (calendar.focusAt !== '') calendar.focusAt = addMonths(calendar.focusAt, 1);
			},

			/** Move the month back one, carrying the day the keyboard is on with it. */
			prev() {
				const shown = visibleMonth(calendar.monthAt, calendar.monthSeed, todayIso(new Date()));
				calendar.monthAt = addMonths(shown, -1);
				if (calendar.focusAt !== '') calendar.focusAt = addMonths(calendar.focusAt, -1);
			},

			/** Put the tab stop on one day, following it into another month where it is in one. */
			focus(iso: string) {
				const shown = visibleMonth(calendar.monthAt, calendar.monthSeed, todayIso(new Date()));
				const landing = sameMonth(iso, shown) ? shown : startOfMonth(iso);
				calendar.monthAt = landing;
				calendar.focusAt = iso;
				landFocusAt(dayEls, gridDays(landing, calendar.startofweek).indexOf(iso));
			},

			/**
			 * Choose one day. A locked calendar, a bound and an unavailable day all
			 * refuse here rather than in the markup, so a day stays reachable while
			 * refusing to be chosen.
			 */
			select(iso: string) {
				if (calendar.disabled === true || calendar.readonly === true) return;
				if (isBlocked(iso, calendar.min, calendar.max)) return;
				if (calendar.unavailable.indexOf(iso) !== -1) return;

				const held = heldList(calendar.seed, calendar.pickedText);
				calendar.focusAt = iso;

				if (calendar.range === true) {
					if (calendar.anchorAt === '') {
						calendar.anchorAt = iso;
						calendar.pickedText = '';
						return;
					}
					const first = calendar.anchorAt;
					const start = first <= iso ? first : iso;
					const end = first <= iso ? iso : first;
					calendar.anchorAt = '';
					calendar.pickedText = textOf([start, end]);
					calendar.onChange?.({ start, end });
					return;
				}

				if (calendar.multiple === true) {
					const next = toggledList(held, iso);
					calendar.pickedText = textOf(next);
					calendar.onChange?.(next);
					return;
				}

				calendar.pickedText = iso;
				calendar.onChange?.(iso);
				if (calendar.popup === true) {
					calendar.open = false;
					landFocus(triggerEl);
				}
			},

			/** One key of the roving model. The month follows the day rather than the day being held inside it. */
			walk(key: string, shift: boolean) {
				const now = todayIso(new Date());
				const shown = visibleMonth(calendar.monthAt, calendar.monthSeed, now);
				const held = heldList(calendar.seed, calendar.pickedText);
				const from = resolvedFocus(shown, calendar.focusAt, held, now, calendar.startofweek);
				const next = steppedDate(from, key, shift, calendar.startofweek);
				if (next === null) return;

				const landing = sameMonth(next, shown) ? shown : startOfMonth(next);
				calendar.monthAt = landing;
				calendar.focusAt = next;
				landFocusAt(dayEls, gridDays(landing, calendar.startofweek).indexOf(next));
			},

			setOpen(next: boolean) {
				if (calendar.open === next) return;
				calendar.open = next;
			},
		};
	},
	{ scope: 'widget' },
);

export function CalendarRoot({
	value = null,
	month = '',
	multiple = false,
	range = false,
	min = '',
	max = '',
	unavailable = [],
	startofweek = 0,
	disabled = false,
	readonly = false,
	required = false,
	invalid = false,
	name = '',
	popup = false,
	onChange,
	children,
	...rest
}: CalendarRootProps) @{
	const calendar = calendarState();
	calendar.onChange = onChange;
	calendar.seed = value;
	calendar.monthSeed = month;
	calendar.multiple = multiple;
	calendar.range = range;
	calendar.min = min;
	calendar.max = max;
	calendar.unavailable = unavailable;
	calendar.startofweek = startofweek;
	calendar.disabled = disabled;
	calendar.readonly = readonly;
	calendar.required = required;
	calendar.invalid = invalid;
	calendar.name = name;
	calendar.popup = popup;

	const isShowing = computed(() => calendar.popup !== true || calendar.open === true);

	<div
		{...rest}
		ui-disabled={calendar.disabled}
		ui-readonly={calendar.readonly}
		ui-required={calendar.required}
		ui-invalid={calendar.invalid}
		ui-multiple={calendar.multiple}
		ui-range={calendar.range}
		ui-popup={calendar.popup}
		ui-open={isShowing}
		ui-closed={isShowing !== true}
	>{children}</div>
}

// One surface, both shapes. Inline it is part of the page; with `popup` the same
// element is what the trigger reveals. `overlay` is written unconditionally,
// which is combobox's known deviation for its inline list: the compiler takes a
// boolean literal there and nothing else, so an inline month still enlists and
// the dismissal it reports is ignored below.
export function CalendarContent({ children, onKeydown, onDismiss, ...rest }: CalendarContentProps) @{
	const calendar = calendarState();
	const isShowing = computed(() => calendar.popup !== true || calendar.open === true);
	const ariaDisabled = computed(() => (calendar.disabled ? 'true' : 'false'));

	<div
		{...rest}
		el={calendar.contentEl}
		overlay
		role="group"
		aria-labelledby={calendar.titleEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[calendar.errorEl, calendar.descriptionEl]}
		aria-disabled={ariaDisabled}
		hidden={isShowing !== true}
		ui-open={isShowing}
		ui-closed={isShowing !== true}
		onKeydown={(event) => {
			// Guarded by event fields alone, and only `===` chains extract: a guard
			// over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			// Enter and Space are absent on purpose - the day is a real button and
			// the browser activates it, so handling them here would choose twice.
			if (
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'PageUp' ||
				event.key === 'PageDown'
			) {
				event.preventDefault();
				calendar.walk(event.key, event.shiftKey);
			}

			onKeydown?.(event);
		}}
		onDismiss={(event) => {
			const surface = calendar.contentEl;
			const back = calendar.triggerEl;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards the answer is gone.
			const isFocusInside = surface !== undefined && surface.contains(document.activeElement);
			// A half-picked range is abandoned whichever shape the month is in.
			calendar.anchorAt = '';
			if (calendar.popup === true) {
				calendar.setOpen(false);
				// The primitive moves no focus, and a press elsewhere is a person choosing where to be.
				if (event.detail.reason === 'escape' && isFocusInside) landFocus(back);
			}
			onDismiss?.(event);
		}}
	>{children}</div>
}

export function CalendarTitle({ children, ...rest }: CalendarTitleProps) @{
	const calendar = calendarState();

	<h2 {...rest} el={calendar.titleEl} aria-live="polite">
		@if (children) {
			<>{children}</>
		} @else {
			<>{calendar.title}</>
		}
	</h2>
}

export function CalendarBackTrigger({ children, onClick, ...rest }: CalendarBackTriggerProps) @{
	const calendar = calendarState();

	<button
		{...rest}
		type="button"
		aria-label="Previous month"
		onClick={(event) => {
			calendar.prev();
			onClick?.(event);
		}}
	>{children}</button>
}

export function CalendarForwardTrigger({
	children,
	onClick,
	...rest
}: CalendarForwardTriggerProps) @{
	const calendar = calendarState();

	<button
		{...rest}
		type="button"
		aria-label="Next month"
		onClick={(event) => {
			calendar.next();
			onClick?.(event);
		}}
	>{children}</button>
}

/**
 * A real `<button>`, not a grid cell: the whole date is its name, so a voice
 * control user can say it and a reader conveys the day without depending on the
 * column it sits in. `aria-pressed` rather than `aria-selected`, which a button
 * does not support.
 */
export function CalendarItem({ value, children, onClick, ...rest }: CalendarItemProps) @{
	const calendar = calendarState();
	// The day as a graph cell: compared against the prop instead, the comparison
	// stops refreshing once the page has resumed.
	const day: CalendarItemInstanceState = state({ value });

	const named = computed(() => dayLabel(day.value));
	const shown = computed(() => `${dayNumber(day.value)}`);
	// A day's own facts are derived here rather than off the shared instance: a
	// part is in this module, so ./calendar-math.ts resolves for it.
	const isOutside = computed(
		() =>
			sameMonth(
				day.value,
				visibleMonth(calendar.monthAt, calendar.monthSeed, todayIso(new Date())),
			) !== true,
	);
	const isToday = computed(() => day.value === todayIso(new Date()));
	const isSelected = computed(
		() => heldList(calendar.seed, calendar.pickedText).indexOf(day.value) !== -1,
	);
	const isUnavailable = computed(() => calendar.unavailable.indexOf(day.value) !== -1);
	const isBounded = computed(
		() => calendar.disabled || isBlocked(day.value, calendar.min, calendar.max),
	);
	const isLocked = computed(
		() =>
			calendar.disabled ||
			isBlocked(day.value, calendar.min, calendar.max) ||
			calendar.unavailable.indexOf(day.value) !== -1,
	);
	const isFocused = computed(() => {
		const now = todayIso(new Date());
		const shown = visibleMonth(calendar.monthAt, calendar.monthSeed, now);
		return (
			resolvedFocus(
				shown,
				calendar.focusAt,
				heldList(calendar.seed, calendar.pickedText),
				now,
				calendar.startofweek,
			) === day.value
		);
	});
	const inSpan = computed(() => {
		const drawn = previewSpan(
			calendar.seed,
			calendar.pickedText,
			calendar.anchorAt,
			calendar.focusAt,
			calendar.monthAt,
			calendar.monthSeed,
			calendar.startofweek,
		);
		if (drawn === null) return false;
		return day.value >= drawn.start && day.value <= drawn.end;
	});
	const isSpanStart = computed(() => {
		const drawn = previewSpan(
			calendar.seed,
			calendar.pickedText,
			calendar.anchorAt,
			calendar.focusAt,
			calendar.monthAt,
			calendar.monthSeed,
			calendar.startofweek,
		);
		return drawn !== null && drawn.start === day.value;
	});
	const isSpanEnd = computed(() => {
		const drawn = previewSpan(
			calendar.seed,
			calendar.pickedText,
			calendar.anchorAt,
			calendar.focusAt,
			calendar.monthAt,
			calendar.monthSeed,
			calendar.startofweek,
		);
		return drawn !== null && drawn.end === day.value;
	});
	const ariaPressed = computed(() => (isSelected ? 'true' : 'false'));
	const ariaDisabled = computed(() => (isLocked ? 'true' : 'false'));
	// Locked days stay reachable: only a disabled calendar leaves the tab order.
	const tabStop = computed(() => (calendar.disabled ? -1 : isFocused ? 0 : -1));

	<button
		{...rest}
		el={calendar.dayEls}
		type="button"
		value={day.value}
		aria-label={named}
		aria-pressed={ariaPressed}
		aria-disabled={ariaDisabled}
		tabindex={tabStop}
		ui-today={isToday}
		ui-outside={isOutside}
		ui-selected={isSelected}
		ui-unavailable={isUnavailable}
		ui-disabled={isBounded}
		ui-inrange={inSpan}
		ui-rangestart={isSpanStart}
		ui-rangeend={isSpanEnd}
		onClick={(event) => {
			calendar.select(day.value);
			onClick?.(event);
		}}
	>
		@if (children) {
			<>{children}</>
		} @else {
			<>{shown}</>
		}
	</button>
}

export function CalendarTrigger({ children, onClick, ...rest }: CalendarTriggerProps) @{
	const calendar = calendarState();

	<button
		{...rest}
		el={calendar.triggerEl}
		type="button"
		aria-haspopup="dialog"
		aria-expanded={calendar.open ? 'true' : 'false'}
		aria-controls={calendar.contentEl}
		ui-open={calendar.open}
		ui-closed={calendar.open !== true}
		onClick={(event) => {
			const wasOpen = calendar.open === true;
			calendar.setOpen(wasOpen !== true);
			if (wasOpen !== true) {
				const now = todayIso(new Date());
				const shown = visibleMonth(calendar.monthAt, calendar.monthSeed, now);
				const held = heldList(calendar.seed, calendar.pickedText);
				const landing = resolvedFocus(shown, calendar.focusAt, held, now, calendar.startofweek);
				landFocusAt(calendar.dayEls, gridDays(shown, calendar.startofweek).indexOf(landing));
			}
			onClick?.(event);
		}}
	>{children}</button>
}

export function CalendarLabel({ children, ...rest }: CalendarLabelProps) @{
	const calendar = calendarState();

	<label {...rest} el={calendar.labelEl} ui-disabled={calendar.disabled}>{children}</label>
}

export function CalendarDescription({ children, ...rest }: CalendarDescriptionProps) @{
	const calendar = calendarState();

	<div {...rest} el={calendar.descriptionEl}>{children}</div>
}

export function CalendarError({ children, ...rest }: CalendarErrorProps) @{
	const calendar = calendarState();

	<div {...rest} el={calendar.errorEl}>{children}</div>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it. A `multiple` or `range`
// calendar submits nothing here - one input cannot carry two dates, and encoding
// a span into one string would invent a wire format no server expects.
export function CalendarField({ ...rest }: CalendarFieldProps) @{
	const calendar = calendarState();
	const submitted = computed(() => {
		if (calendar.multiple || calendar.range) return '';
		const held = heldList(calendar.seed, calendar.pickedText);
		return held.length > 0 ? held[0] : '';
	});
	const ariaInvalid = computed(() => (calendar.invalid ? 'true' : 'false'));

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={calendar.name}
			value={submitted}
			aria-invalid={ariaInvalid}
			required={calendar.required}
			disabled={calendar.disabled}
		/>
	</VisuallyHidden>
}
