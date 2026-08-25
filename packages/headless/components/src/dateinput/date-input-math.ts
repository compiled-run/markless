/**
 * Every calculation the date input makes, as plain functions over plain values.
 *
 * The family holds one string per segment - what a person has typed there, "" for
 * an untouched segment - and everything else is derived from those three strings
 * by the functions below. Keeping the arithmetic here means the parts read as
 * markup and the rules can be read on their own.
 *
 * There is no date library behind this. `@markless/ui` depends on `@markless/core`
 * and nothing else, so month lengths are worked out from the platform `Date` and
 * an ISO date is composed and compared as text.
 */

/** A date as `yyyy-mm-dd`, the value the family reports and submits. */
export type IsoDate = string;

/** Which part of the date one segment holds. */
export type SegmentType = 'day' | 'month' | 'year';

export const MIN_DAY = 1;
export const MAX_DAY = 31;
export const MIN_MONTH = 1;
export const MAX_MONTH = 12;
export const MIN_YEAR = 0;
export const MAX_YEAR = 10000;

/** How many digits fit in one segment before it is full. */
export const SEGMENT_WIDTH: Record<SegmentType, number> = { day: 2, month: 2, year: 4 };

/**
 * How far PageUp and PageDown move each segment, taken from React Aria's
 * `PAGE_STEP`: a week, two months, five years.
 */
export const PAGE_STEP: Record<SegmentType, number> = { day: 7, month: 2, year: 5 };

const isoPattern = /^\d{1,4}-\d{2}-\d{2}$/;

const digits = (count: number, value: number) => `${value}`.padStart(count, '0');

/** The number a segment's typed text stands for, or null while it is empty. */
export function segmentNumber(text: string): number | null {
	if (text === '') return null;
	const value = Number(text);
	return Number.isFinite(value) ? value : null;
}

/**
 * The last day of a month, from the platform `Date`: month is 1-based here and
 * 0-based there, so passing our month with day 0 underflows to the previous
 * month's last day - which is the month we asked about.
 */
export function lastDayOfMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

/** The largest day this field can hold, once its month and year are known. */
export function dayCeiling(yearText: string, monthText: string): number {
	const year = segmentNumber(yearText);
	const month = segmentNumber(monthText);
	if (year === null || month === null || month < MIN_MONTH || month > MAX_MONTH) return MAX_DAY;
	return lastDayOfMonth(year, month);
}

export function segmentMin(type: SegmentType): number {
	if (type === 'day') return MIN_DAY;
	if (type === 'month') return MIN_MONTH;
	return MIN_YEAR;
}

export function segmentMax(type: SegmentType, yearText: string, monthText: string): number {
	if (type === 'day') return dayCeiling(yearText, monthText);
	if (type === 'month') return MAX_MONTH;
	return MAX_YEAR;
}

export function segmentText(type: SegmentType, day: string, month: string, year: string): string {
	if (type === 'day') return day;
	if (type === 'month') return month;
	return year;
}

/** The whole date the three segments spell, or null while any of them is empty. */
export function composeIso(yearText: string, monthText: string, dayText: string): IsoDate | null {
	const year = segmentNumber(yearText);
	const month = segmentNumber(monthText);
	const day = segmentNumber(dayText);
	if (year === null || month === null || day === null) return null;
	if (month < MIN_MONTH || month > MAX_MONTH) return null;
	if (day < MIN_DAY || day > lastDayOfMonth(year, month)) return null;
	return `${digits(4, year)}-${digits(2, month)}-${digits(2, day)}`;
}

/** True for the `yyyy-mm-dd` shape the family accepts as a bound or a value. */
export function isIsoDate(value: string): boolean {
	return isoPattern.test(value);
}

/** Both bounds are zero-padded here, so the comparison is plain text order. */
export function clampIso(value: IsoDate, min: string, max: string): IsoDate {
	if (min !== '' && isIsoDate(min) && value < normaliseIso(min)) return normaliseIso(min);
	if (max !== '' && isIsoDate(max) && value > normaliseIso(max)) return normaliseIso(max);
	return value;
}

/** A bound written with a short year still compares against a composed date. */
export function normaliseIso(value: IsoDate): IsoDate {
	const [year, month, day] = value.split('-');
	return `${digits(4, Number(year))}-${month}-${day}`;
}

export function isoPart(value: IsoDate, type: SegmentType): string {
	const [year, month, day] = value.split('-');
	if (type === 'day') return `${Number(day)}`;
	if (type === 'month') return `${Number(month)}`;
	return `${Number(year)}`;
}

/** What an empty segment starts from when a person steps it: today's date. */
export function todayValue(type: SegmentType, now: Date): number {
	if (type === 'day') return now.getDate();
	if (type === 'month') return now.getMonth() + 1;
	return now.getFullYear();
}

/**
 * One arrow, page or Home/End step. Day and month wrap around their bounds and
 * year stops at them, which is QDS's rule and the one a person expects when
 * clicking past December.
 */
export function steppedText(
	type: SegmentType,
	text: string,
	by: number,
	yearText: string,
	monthText: string,
	now: Date,
): string {
	const low = segmentMin(type);
	const high = segmentMax(type, yearText, monthText);
	const current = segmentNumber(text);
	if (current === null) return `${Math.min(Math.max(todayValue(type, now), low), high)}`;

	const next = current + by;
	if (type === 'year') return `${Math.min(Math.max(next, low), high)}`;
	if (next < low) return `${high}`;
	if (next > high) return `${low}`;
	return `${next}`;
}

/** Home and End: straight to the segment's own bound. */
export function boundText(
	type: SegmentType,
	edge: 'min' | 'max',
	yearText: string,
	monthText: string,
): string {
	return `${edge === 'min' ? segmentMin(type) : segmentMax(type, yearText, monthText)}`;
}

/**
 * What one typed digit does to a segment.
 *
 * The rules are QDS's: a digit is appended, except where appending could only
 * produce a number the segment cannot hold - a month already showing 1 followed
 * by 3, a day already showing 3 followed by 2, or a segment already full - and
 * then the digit replaces what was there. `full` says the segment cannot take
 * another digit, which is what moves focus on.
 *
 * A lone "0" is kept as typed rather than rounded up to the segment's minimum:
 * the element's text is drawn from this value, so an interim zero has nowhere
 * else to live while the second digit is on its way.
 */
export function typedText(
	type: SegmentType,
	text: string,
	digit: string,
	yearText: string,
	monthText: string,
): { readonly text: string; readonly full: boolean } {
	const stripped = text.startsWith('0') ? text.slice(1) : text;
	const appended = stripped + digit;
	const replace =
		stripped.length >= SEGMENT_WIDTH[type] ||
		(type === 'month' && (stripped === '1' ? digit > '2' : Number(appended) > MAX_MONTH)) ||
		(type === 'day' && (stripped === '3' ? digit > '1' : Number(appended) > MAX_DAY));
	const next = replace ? digit : appended;
	const held = Number(next);
	const high = segmentMax(type, yearText, monthText);
	const settled = held > high ? `${high}` : next;
	return { text: settled, full: isFull(type, settled) };
}

/**
 * When a segment can hold no more. A day showing 4 or a month showing 2 is full
 * at one digit, because a second digit could only overflow.
 */
export function isFull(type: SegmentType, text: string): boolean {
	const value = segmentNumber(text);
	if (value === null || value === 0) return false;
	if (text.length >= SEGMENT_WIDTH[type]) return true;
	if (type === 'month') return value >= 2;
	if (type === 'day') return value >= 4;
	return false;
}

/** Backspace takes the last digit off, leaving the segment empty at the end. */
export function erasedText(text: string): string {
	return text.slice(0, -1);
}

/** The text the element shows: the typed digits, zero-padded when asked for. */
export function displayText(type: SegmentType, text: string, showLeadingZero: boolean): string {
	if (text === '' || text === '0') return text;
	const value = Number(text);
	if (showLeadingZero && SEGMENT_WIDTH[type] === 2 && value < 10) return `0${value}`;
	return `${value}`;
}

/** The three segments after one edit, with both corrections the family owes applied. */
export type SegmentTexts = {
	readonly day: string;
	readonly month: string;
	readonly year: string;
};

/**
 * What one box holds: whatever has been typed there, or the matching part of the
 * date the consumer seeded while nothing has.
 *
 * `null` is "nobody has touched this box" and `""` is "somebody emptied it", which
 * is why an override cell cannot simply hold the text.
 */
export function resolvedText(
	type: SegmentType,
	seed: string,
	dayAt: string | null,
	monthAt: string | null,
	yearAt: string | null,
): string {
	const at = type === 'day' ? dayAt : type === 'month' ? monthAt : yearAt;
	if (typeof at === 'string') return at;
	return isIsoDate(seed) ? isoPart(seed, type) : '';
}

export function resolvedTexts(
	seed: string,
	dayAt: string | null,
	monthAt: string | null,
	yearAt: string | null,
): SegmentTexts {
	return {
		day: resolvedText('day', seed, dayAt, monthAt, yearAt),
		month: resolvedText('month', seed, dayAt, monthAt, yearAt),
		year: resolvedText('year', seed, dayAt, monthAt, yearAt),
	};
}

/** The whole date the three boxes currently spell, or null while any is empty. */
export function resolvedValue(
	seed: string,
	dayAt: string | null,
	monthAt: string | null,
	yearAt: string | null,
): IsoDate | null {
	const texts = resolvedTexts(seed, dayAt, monthAt, yearAt);
	return composeIso(texts.year, texts.month, texts.day);
}

/** The day box's live ceiling, from whatever month and year the boxes hold. */
export function resolvedDayMax(
	seed: string,
	dayAt: string | null,
	monthAt: string | null,
	yearAt: string | null,
): number {
	const texts = resolvedTexts(seed, dayAt, monthAt, yearAt);
	return dayCeiling(texts.year, texts.month);
}

export function resolvedEmpty(
	seed: string,
	dayAt: string | null,
	monthAt: string | null,
	yearAt: string | null,
): boolean {
	const texts = resolvedTexts(seed, dayAt, monthAt, yearAt);
	return texts.day === '' && texts.month === '' && texts.year === '';
}

/**
 * The number one box stands for right now, or null while it is empty. Null rather
 * than undefined: an undefined attribute value leaves the old one in place.
 */
export function resolvedNumber(
	type: SegmentType,
	seed: string,
	dayAt: string | null,
	monthAt: string | null,
	yearAt: string | null,
): number | null {
	return segmentNumber(resolvedText(type, seed, dayAt, monthAt, yearAt));
}

/** The text one box shows right now: its digits, or its placeholder while it is empty. */
export function resolvedDisplay(
	type: SegmentType,
	seed: string,
	dayAt: string | null,
	monthAt: string | null,
	yearAt: string | null,
	showLeadingZero: boolean,
	placeholder: string,
): string {
	const drawn = displayText(
		type,
		resolvedText(type, seed, dayAt, monthAt, yearAt),
		showLeadingZero,
	);
	return drawn === '' ? placeholder : drawn;
}

/**
 * The two corrections a date owes after any one box changes: a day that the
 * chosen month does not have drops to the last day it does (30 February becomes
 * 29 February in a leap year), and a whole date beyond `min` or `max` is pulled
 * back to that bound - which can move all three boxes at once.
 */
export function settled(next: SegmentTexts, min: string, max: string): SegmentTexts {
	const ceiling = dayCeiling(next.year, next.month);
	const day = segmentNumber(next.day);
	const withinMonth = day !== null && day > ceiling ? `${ceiling}` : next.day;

	const composed = composeIso(next.year, next.month, withinMonth);
	if (composed === null) return { day: withinMonth, month: next.month, year: next.year };

	const clamped = clampIso(composed, min, max);
	if (clamped === composed) return { day: withinMonth, month: next.month, year: next.year };
	return {
		day: isoPart(clamped, 'day'),
		month: isoPart(clamped, 'month'),
		year: isoPart(clamped, 'year'),
	};
}

/** What one keystroke does: the three boxes after it, and how far focus moves. */
export type KeyOutcome = SegmentTexts & {
	/** -1 for the box before this one, 1 for the box after, 0 to stay put. */
	readonly move: number;
};

function replaced(type: SegmentType, texts: SegmentTexts, text: string): SegmentTexts {
	if (type === 'day') return { day: text, month: texts.month, year: texts.year };
	if (type === 'month') return { day: texts.day, month: text, year: texts.year };
	return { day: texts.day, month: texts.month, year: text };
}

/**
 * The whole keyboard model in one place: arrows step, PageUp and PageDown step
 * further, Home and End jump to the box's bounds, digits type, Backspace erases
 * and then walks back, and left and right move between boxes. `null` is a key
 * this family does not handle.
 */
export function keyOutcome(
	type: SegmentType,
	key: string,
	texts: SegmentTexts,
	min: string,
	max: string,
	now: Date,
): KeyOutcome | null {
	const text = segmentText(type, texts.day, texts.month, texts.year);
	const step = (by: number): KeyOutcome => ({
		...settled(
			replaced(type, texts, steppedText(type, text, by, texts.year, texts.month, now)),
			min,
			max,
		),
		move: 0,
	});

	if (key === 'ArrowLeft') return { ...texts, move: -1 };
	if (key === 'ArrowRight') return { ...texts, move: 1 };
	if (key === 'ArrowUp') return step(1);
	if (key === 'ArrowDown') return step(-1);
	if (key === 'PageUp') return step(PAGE_STEP[type]);
	if (key === 'PageDown') return step(-PAGE_STEP[type]);
	if (key === 'Home' || key === 'End') {
		const edge = boundText(type, key === 'Home' ? 'min' : 'max', texts.year, texts.month);
		return { ...settled(replaced(type, texts, edge), min, max), move: 0 };
	}
	if (key === 'Backspace') {
		if (text === '') return { ...texts, move: -1 };
		return { ...settled(replaced(type, texts, erasedText(text)), min, max), move: 0 };
	}
	if (key === 'Delete') return { ...settled(replaced(type, texts, ''), min, max), move: 0 };
	if (key.length === 1 && key >= '0' && key <= '9') {
		const typed = typedText(type, text, key, texts.year, texts.month);
		return { ...settled(replaced(type, texts, typed.text), min, max), move: typed.full ? 1 : 0 };
	}
	return null;
}

