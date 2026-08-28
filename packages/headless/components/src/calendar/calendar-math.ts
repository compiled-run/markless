import { isIsoDate, lastDayOfMonth, normaliseIso } from '../datebox/datebox-math.ts';

/** Always six weeks of seven: the grid never shrinks, so a row is never removed. */
export const GRID_DAYS = 42;
export const WEEK_LENGTH = 7;

/** A whole date as `yyyy-mm-dd`, the spelling `datebox` already reads and writes. */
export type IsoDate = string;

/** What the consumer hands `calendar.root` and gets back from `onChange`. */
export type CalendarValue =
	| IsoDate
	| readonly IsoDate[]
	| { readonly start: IsoDate; readonly end: IsoDate }
	| null;

const pad = (count: number, value: number) => `${value}`.padStart(count, '0');

export function isoOf(year: number, month: number, day: number): IsoDate {
	return `${pad(4, year)}-${pad(2, month)}-${pad(2, day)}`;
}

export function partsOf(iso: IsoDate): { year: number; month: number; day: number } {
	const [year, month, day] = iso.split('-');
	return { year: Number(year), month: Number(month), day: Number(day) };
}

// `setFullYear(year, month, day)` rather than the constructor: the constructor
// maps years under 100 into the 1900s, and setting all three at once never lands
// on an intermediate date the calendar does not have.
function dateOf(iso: IsoDate): Date {
	const { year, month, day } = partsOf(iso);
	const at = new Date(2000, 0, 1);
	at.setFullYear(year, month - 1, day);
	return at;
}

function isoFrom(at: Date): IsoDate {
	return isoOf(at.getFullYear(), at.getMonth() + 1, at.getDate());
}

export function todayIso(now: Date): IsoDate {
	return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(iso: IsoDate, count: number): IsoDate {
	const at = dateOf(iso);
	at.setDate(at.getDate() + count);
	return isoFrom(at);
}

/** Keeps the day number where the landing month allows it, and pulls it back to that month's last day where it does not. */
export function addMonths(iso: IsoDate, count: number): IsoDate {
	const { year, month, day } = partsOf(iso);
	const total = year * 12 + (month - 1) + count;
	const nextYear = Math.floor(total / 12);
	const nextMonth = (((total % 12) + 12) % 12) + 1;
	return isoOf(nextYear, nextMonth, Math.min(day, lastDayOfMonth(nextYear, nextMonth)));
}

export function addYears(iso: IsoDate, count: number): IsoDate {
	return addMonths(iso, count * 12);
}

export function startOfMonth(iso: IsoDate): IsoDate {
	const { year, month } = partsOf(iso);
	return isoOf(year, month, 1);
}

export function dayOfWeek(iso: IsoDate): number {
	return dateOf(iso).getDay();
}

export function startOfWeek(iso: IsoDate, startofweek: number): IsoDate {
	return addDays(iso, -((((dayOfWeek(iso) - startofweek) % 7) + 7) % 7));
}

export function endOfWeek(iso: IsoDate, startofweek: number): IsoDate {
	return addDays(startOfWeek(iso, startofweek), WEEK_LENGTH - 1);
}

export function sameMonth(one: IsoDate, other: IsoDate): boolean {
	return one.slice(0, 7) === other.slice(0, 7);
}

/**
 * The 42 days a month's grid shows, leading and trailing days included.
 *
 * Six weeks always covers a month: the longest leading run is six days and the
 * longest month is 31, so 37 is the most the grid ever has to hold.
 */
export function gridDays(monthIso: IsoDate, startofweek: number): IsoDate[] {
	const first = startOfWeek(startOfMonth(monthIso), startofweek);
	const days: IsoDate[] = [];
	for (let at = 0; at < GRID_DAYS; at += 1) days.push(addDays(first, at));
	return days;
}

export function gridWeeks(monthIso: IsoDate, startofweek: number): IsoDate[][] {
	const days = gridDays(monthIso, startofweek);
	const weeks: IsoDate[][] = [];
	for (let at = 0; at < GRID_DAYS; at += WEEK_LENGTH) {
		weeks.push(days.slice(at, at + WEEK_LENGTH));
	}
	return weeks;
}

// Display strings only. `Intl` is the platform's answer for how a date reads in
// the document's own locale; none of the arithmetic above goes through it.
const titleFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' });
const dayFormat = new Intl.DateTimeFormat(undefined, {
	weekday: 'long',
	year: 'numeric',
	month: 'long',
	day: 'numeric',
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

/** A Sunday, so a `startofweek` offset counts forward from index 0. */
const FIRST_SUNDAY = '2024-01-07';

export function monthTitle(monthIso: IsoDate): string {
	return titleFormat.format(dateOf(monthIso));
}

export function dayLabel(iso: IsoDate): string {
	return dayFormat.format(dateOf(iso));
}

export function weekdayNames(startofweek: number): string[] {
	const names: string[] = [];
	for (let at = 0; at < WEEK_LENGTH; at += 1) {
		names.push(weekdayFormat.format(dateOf(addDays(FIRST_SUNDAY, startofweek + at))));
	}
	return names;
}

export function dayNumber(iso: IsoDate): number {
	return partsOf(iso).day;
}

/** Both bounds are zero-padded, so the comparison is plain text order. */
export function isBlocked(iso: IsoDate, min: string, max: string): boolean {
	if (min !== '' && isIsoDate(min) && iso < normaliseIso(min)) return true;
	if (max !== '' && isIsoDate(max) && iso > normaliseIso(max)) return true;
	return false;
}

// Every cell the family holds is a string: a list of dates travels as one
// comma-joined cell rather than as an array, which is the cell shape this
// library's graph carries everywhere else.
export function listOf(text: string): IsoDate[] {
	return text === '' ? [] : text.split(',');
}

export function textOf(list: readonly IsoDate[]): string {
	return list.join(',');
}

/** What the consumer wrote, until somebody picks a day; what was picked from then on. */
export function heldList(seed: CalendarValue | undefined, pickedText: string | null): IsoDate[] {
	return listOf(pickedText === null ? seedTextOf(seed) : pickedText);
}

/** Adding one day to a chosen set, or taking it out again when it is already in. */
export function toggledList(held: readonly IsoDate[], iso: IsoDate): IsoDate[] {
	if (held.indexOf(iso) !== -1) return held.filter((one) => one !== iso);
	return held.concat([iso]).sort();
}

export function seedTextOf(value: CalendarValue | undefined): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return textOf(value as readonly IsoDate[]);
	const span = value as { start: IsoDate; end: IsoDate };
	if (typeof span.start !== 'string' || typeof span.end !== 'string') return '';
	return textOf([span.start, span.end]);
}

export function shapedValue(
	list: readonly IsoDate[],
	multiple: boolean,
	range: boolean,
): CalendarValue {
	if (multiple) return [...list];
	if (range) return list.length === 2 ? { start: list[0], end: list[1] } : null;
	return list.length > 0 ? list[0] : null;
}

/**
 * The span drawn now: the live anchor against the focused day while a range is
 * being picked, and the settled endpoints once it is not.
 */
export function rangeSpan(
	list: readonly IsoDate[],
	anchor: string,
	focused: IsoDate,
): { start: IsoDate; end: IsoDate } | null {
	if (anchor !== '') {
		return anchor <= focused ? { start: anchor, end: focused } : { start: focused, end: anchor };
	}
	if (list.length === 2) return { start: list[0], end: list[1] };
	return null;
}

/**
 * The span a day should draw itself against, built from the cells alone.
 *
 * Takes the cells rather than the instance: a module-scope helper handed a graph
 * object is `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`, and this is the
 * `datebox-math.ts` shape - plain values in, a plain answer out.
 */
export function previewSpan(
	seed: CalendarValue | undefined,
	pickedText: string | null,
	anchorAt: string,
	focusAt: string,
	monthAt: string,
	monthSeed: string,
	startofweek: number,
): { start: IsoDate; end: IsoDate } | null {
	const now = todayIso(new Date());
	const shown = visibleMonth(monthAt, monthSeed, now);
	const held = heldList(seed, pickedText);
	return rangeSpan(held, anchorAt, resolvedFocus(shown, focusAt, held, now, startofweek));
}

export function visibleMonth(monthAt: string, monthSeed: string, today: IsoDate): IsoDate {
	if (monthAt !== '') return startOfMonth(monthAt);
	if (monthSeed !== '' && isIsoDate(monthSeed)) return startOfMonth(monthSeed);
	return startOfMonth(today);
}

/** Where the tab stop sits before anybody has moved it: the chosen day, else today, else the first of the month. */
export function defaultFocus(monthIso: IsoDate, list: readonly IsoDate[], today: IsoDate): IsoDate {
	if (list.length > 0 && sameMonth(list[0], monthIso)) return list[0];
	if (sameMonth(today, monthIso)) return today;
	return startOfMonth(monthIso);
}

/**
 * The day carrying `tabindex="0"`. A focus that has fallen outside the grid -
 * a `month` prop moved under it - is dropped rather than leaving the grid with
 * no tab stop at all.
 */
export function resolvedFocus(
	monthIso: IsoDate,
	focusAt: string,
	list: readonly IsoDate[],
	today: IsoDate,
	startofweek: number,
): IsoDate {
	if (focusAt !== '') {
		const days = gridDays(monthIso, startofweek);
		if (focusAt >= days[0] && focusAt <= days[GRID_DAYS - 1]) return focusAt;
	}
	return defaultFocus(monthIso, list, today);
}

/** One key of the roving model, or null for a key the grid does not handle. */
export function steppedDate(
	iso: IsoDate,
	key: string,
	shift: boolean,
	startofweek: number,
): IsoDate | null {
	if (key === 'ArrowLeft') return addDays(iso, -1);
	if (key === 'ArrowRight') return addDays(iso, 1);
	if (key === 'ArrowUp') return addDays(iso, -WEEK_LENGTH);
	if (key === 'ArrowDown') return addDays(iso, WEEK_LENGTH);
	if (key === 'Home') return startOfWeek(iso, startofweek);
	if (key === 'End') return endOfWeek(iso, startofweek);
	if (key === 'PageUp') return shift ? addYears(iso, -1) : addMonths(iso, -1);
	if (key === 'PageDown') return shift ? addYears(iso, 1) : addMonths(iso, 1);
	return null;
}
