import type { PropsOf } from '@markless/core';
import type { CalendarValue, IsoDate } from './calendar-math.ts';

export type { CalendarValue, IsoDate } from './calendar-math.ts';

/**
 * A month of days a person can choose from.
 *
 * It holds the date, the month on show and the day the keyboard is on, and it
 * draws nothing itself: put a `calendar.content` inside it, and inside that a
 * `calendar.title`, a `calendar.backtrigger`, a `calendar.forwardtrigger` and one
 * `calendar.item` per day of `calendar.state().days`. Add a `calendar.field` when
 * a form has to submit the date, and `popup` with a `calendar.trigger` when the
 * month should be revealed rather than always shown.
 *
 * It reports `ui-disabled`, `ui-readonly`, `ui-required`, `ui-invalid`,
 * `ui-multiple`, `ui-range`, `ui-popup`, `ui-open` and `ui-closed` for styling.
 */
export type CalendarRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The date chosen, as `yyyy-mm-dd`. An array of them under `multiple`, and
	 * `{ start, end }` under `range`. Omit it and nothing is chosen to begin with.
	 */
	readonly value?: CalendarValue;
	/**
	 * The month on show, as any `yyyy-mm-dd` date inside it. Defaults to the month
	 * today is in. Once somebody moves the month, this is no longer what is shown.
	 */
	readonly month?: IsoDate;
	/** More than one day can be chosen, and `value` is a list of them. */
	readonly multiple?: boolean;
	/**
	 * Two days bound a span, and `value` is `{ start, end }`. The first press sets
	 * an endpoint and reports nothing; the second completes the span and reports
	 * it once. Not to be set alongside `multiple`.
	 */
	readonly range?: boolean;
	/** The earliest day that can be chosen, as `yyyy-mm-dd`. Earlier days stay reachable and refuse to be chosen. */
	readonly min?: IsoDate;
	/** The latest day that can be chosen, as `yyyy-mm-dd`. Later days stay reachable and refuse to be chosen. */
	readonly max?: IsoDate;
	/**
	 * Days that cannot be chosen, as `yyyy-mm-dd`. They stay focusable so a person
	 * reading with the keyboard can land on one and hear that it is unavailable.
	 */
	readonly unavailable?: readonly IsoDate[];
	/** Which weekday a row starts on, `0` for Sunday through `6` for Saturday. Defaults to `0`. */
	readonly startofweek?: number;
	/** Nothing can be chosen and no day is a tab stop. */
	readonly disabled?: boolean;
	/** The days can be walked and read, and none of them will change the date. */
	readonly readonly?: boolean;
	/** A date is needed before a form submits. */
	readonly required?: boolean;
	/** The date chosen is not an acceptable one. Reported as `ui-invalid` and on `calendar.field`. */
	readonly invalid?: boolean;
	/** Submitted under this name by `calendar.field`. */
	readonly name?: string;
	/**
	 * The month is revealed by a `calendar.trigger` rather than shown in place.
	 * Escape and a press outside close it; choosing a single date closes it too,
	 * while a range or a list of days stays open.
	 */
	readonly popup?: boolean;
	/**
	 * Called with the whole date once a choice is complete - once per press for a
	 * single date and for `multiple`, and once for a range, on the press that
	 * completes it. Omit it and the days still work.
	 */
	readonly onChange?: (value: CalendarValue) => void;
};

/**
 * The month itself: the one surface, whether it is shown in place or revealed by
 * a `calendar.trigger`.
 *
 * It is the group a reader announces, named by `calendar.title`, and it owns the
 * whole keyboard model - arrows walk days and weeks, `Home` and `End` reach the
 * week's ends, `PageUp` and `PageDown` step a month, and with Shift a year. Put
 * the title, the two month triggers, the weekday names and the days inside it.
 */
export type CalendarContentProps = PropsOf<'div'>;

/**
 * The month and year on show, as text. With no children it draws that text
 * itself; give it children and they are shown instead.
 *
 * It is announced when it changes, which is how moving the month is conveyed
 * without moving anybody's focus, and it is the name the month's group carries.
 */
export type CalendarTitleProps = PropsOf<'h2'>;

/** Steps the month back one. */
export type CalendarBackTriggerProps = PropsOf<'button'>;

/** Steps the month on one. */
export type CalendarForwardTriggerProps = PropsOf<'button'>;

/**
 * One day of the month, as a real button.
 *
 * With no children it draws its own day number; give it children and they are
 * shown instead. It carries the whole date as its name - "Tuesday, August 25,
 * 2026" - so a reader conveys the day without depending on the column it sits
 * in, and it reports `ui-today`, `ui-outside`, `ui-selected`, `ui-unavailable`,
 * `ui-disabled`, `ui-inrange`, `ui-rangestart` and `ui-rangeend`.
 */
export type CalendarItemProps = Omit<PropsOf<'button'>, 'value' | 'type'> & {
	/** Which day this is, as `yyyy-mm-dd`. One of `calendar.state().days`. */
	readonly value: IsoDate;
};

/** Reveals the month. Only for a root that was given `popup`. */
export type CalendarTriggerProps = PropsOf<'button'>;

/**
 * A visible caption for the calendar. The month's group is named by
 * `calendar.title` rather than by this, so that the name a reader hears follows
 * the month on show.
 */
export type CalendarLabelProps = PropsOf<'label'>;

/** Supporting text, named by the month's `aria-describedby` behind `calendar.error`. */
export type CalendarDescriptionProps = PropsOf<'div'>;

/** The validation message, named by the month's `aria-describedby` ahead of `calendar.description`. */
export type CalendarErrorProps = PropsOf<'div'>;

/**
 * The element a form submits. It is clipped, out of the tab order and hidden from
 * readers, and it carries the chosen date as `yyyy-mm-dd` under the root's
 * `name`. A `multiple` or `range` calendar submits nothing through it.
 */
export type CalendarFieldProps = Omit<PropsOf<'input'>, 'value' | 'type'>;

/**
 * The graph cells every calendar part reads and writes.
 *
 * `seed` is what the consumer wrote, in whichever of the value shapes they
 * wrote it, and `pickedText` is what has been chosen over it: `null` while
 * nobody has chosen, a comma-joined list of ISO dates once somebody has. It is a
 * joined string rather than an array because a cell a handler writes is a
 * scalar here; `seed` stays raw because a shared cell is seeded from a bare prop
 * and nothing else. `monthAt` and `focusAt` are empty until the month or the
 * keyboard moves, at which point they take over from `monthSeed` and the
 * default.
 */
export type CalendarInstanceState = {
	seed: CalendarValue;
	pickedText: string | null;
	monthSeed: string;
	monthAt: string;
	focusAt: string;
	anchorAt: string;
	min: string;
	max: string;
	unavailable: readonly IsoDate[];
	startofweek: number;
	multiple: boolean;
	range: boolean;
	disabled: boolean;
	readonly: boolean;
	required: boolean;
	invalid: boolean;
	popup: boolean;
	open: boolean;
	name: string;
	onChange?: CalendarRootProps['onChange'];
};

/** Which day one `calendar.item` stands for. */
export type CalendarItemInstanceState = {
	value: IsoDate;
};
