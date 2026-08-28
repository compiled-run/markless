/**
 * Every calculation the timebox makes, as plain functions over plain values.
 *
 * The family holds one string per segment - what a person has typed there, "" for
 * an emptied one - and everything else is derived from those strings by the
 * functions below. Keeping the arithmetic here means the parts read as markup and
 * the rules can be read on their own. It is the shape `datebox-math.ts` uses, for
 * the segment machinery the two families share.
 *
 * There is no date library behind this. `@markless/ui` depends on `@markless/core`
 * and nothing else, so the locale's hour cycle, segment order and AM/PM words all
 * come out of the platform `Intl.DateTimeFormat.formatToParts`.
 */

/** A time of day as `HH:mm` or `HH:mm:ss`, always 24-hour: the value the family reports and submits. */
export type IsoTime = string;

/** Which part of the time one segment holds. */
export type SegmentType = 'hour' | 'minute' | 'second' | 'dayperiod';

export const MIN_MINUTE = 0;
export const MAX_MINUTE = 59;
export const MIN_HOUR_24 = 0;
export const MAX_HOUR_24 = 23;
export const MIN_HOUR_12 = 1;
export const MAX_HOUR_12 = 12;
/** The period reads as a two-valued spinbutton: 0 is AM, 1 is PM. */
export const AM = 0;
export const PM = 1;

/** How many digits fit in one segment before it is full. The period takes none. */
export const SEGMENT_WIDTH: Record<SegmentType, number> = {
	hour: 2,
	minute: 2,
	second: 2,
	dayperiod: 0,
};

/**
 * How far PageUp and PageDown move each segment. React Aria's `PAGE_STEP` has no
 * time entries, so these are its spirit applied to a clock: an hour, a quarter of
 * an hour, a quarter of a minute.
 */
export const PAGE_STEP: Record<SegmentType, number> = {
	hour: 1,
	minute: 15,
	second: 15,
	dayperiod: 1,
};

const timePattern = /^\d{1,2}:\d{2}(:\d{2})?$/;

const digits = (count: number, value: number) => `${value}`.padStart(count, '0');

/** The number a segment's typed text stands for, or null while it is empty. */
export function segmentNumber(text: string): number | null {
	if (text === '') return null;
	const value = Number(text);
	return Number.isFinite(value) ? value : null;
}

/**
 * A fixed instant to ask `Intl` about. The date is irrelevant and never shown; it
 * exists because `formatToParts` needs something to format. 9am and 9pm are the
 * two the AM/PM words are read from.
 */
function probe(hour: number): Date {
	return new Date(Date.UTC(2024, 0, 1, hour, 30, 45));
}

function timeParts(locale: string, hour12: boolean | undefined, hour: number) {
	const options: Intl.DateTimeFormatOptions = {
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		timeZone: 'UTC',
	};
	if (hour12 !== undefined) options.hour12 = hour12;
	// An empty locale means "whatever this runtime is set to", which is what
	// passing undefined asks Intl for.
	return new Intl.DateTimeFormat(locale === '' ? undefined : locale, options).formatToParts(
		probe(hour),
	);
}

/**
 * Whether this locale writes a 12-hour clock, answered by whether it writes a
 * dayPeriod part at all. That is the fact itself rather than a flag about it, so
 * it needs no `resolvedOptions().hour12` quirk-handling.
 */
export function localeHour12(locale: string, hour12: boolean | undefined): boolean {
	if (hour12 !== undefined) return hour12;
	return timeParts(locale, undefined, 13).some((part) => part.type === 'dayPeriod');
}

/**
 * The order this locale writes the segments this field has in, as a
 * space-separated list. `en-US` answers `hour minute dayperiod`; `de-DE` answers
 * `hour minute`; `ko-KR` answers `dayperiod hour minute`, which is why the order
 * is worth reporting at all - the period is not always a suffix.
 *
 * Reported for a consumer to lay out against. The family itself still reads the
 * segments in the order they were written, which is `datebox`'s rule.
 */
export function localeOrder(
	locale: string,
	hour12: boolean | undefined,
	withSeconds: boolean,
): string {
	const wanted = new Set(['hour', 'minute', 'dayPeriod']);
	if (withSeconds) wanted.add('second');
	return timeParts(locale, hour12, 13)
		.filter((part) => wanted.has(part.type))
		.map((part) => (part.type === 'dayPeriod' ? 'dayperiod' : part.type))
		.join(' ');
}

/** This locale's own words for the two halves of the day, read off a morning and an evening. */
export function periodWords(locale: string): { readonly am: string; readonly pm: string } {
	const read = (hour: number) => {
		const found = timeParts(locale, true, hour).find((part) => part.type === 'dayPeriod');
		return found?.value ?? '';
	};
	const am = read(9);
	const pm = read(21);
	// A locale Intl formats without a dayPeriod still needs two distinguishable
	// words, because the consumer may have asked for a 12-hour clock anyway.
	return { am: am === '' ? 'AM' : am, pm: pm === '' ? 'PM' : pm };
}

export function segmentMin(type: SegmentType, hour12: boolean): number {
	if (type === 'hour') return hour12 ? MIN_HOUR_12 : MIN_HOUR_24;
	if (type === 'dayperiod') return AM;
	return MIN_MINUTE;
}

export function segmentMax(type: SegmentType, hour12: boolean): number {
	if (type === 'hour') return hour12 ? MAX_HOUR_12 : MAX_HOUR_24;
	if (type === 'dayperiod') return PM;
	return MAX_MINUTE;
}

/** What an empty segment starts from when a person steps it: React Aria's placeholder default. */
export function baseValue(type: SegmentType, hour12: boolean): number {
	if (type === 'hour') return hour12 ? MAX_HOUR_12 : MIN_HOUR_24;
	return 0;
}

export function segmentText(type: SegmentType, texts: SegmentTexts): string {
	if (type === 'hour') return texts.hour;
	if (type === 'minute') return texts.minute;
	if (type === 'second') return texts.second;
	return texts.dayperiod;
}

/** The 24-hour hour a shown hour and a period stand for. */
export function to24(shown: number, period: number, hour12: boolean): number {
	if (!hour12) return shown;
	const noon = shown === MAX_HOUR_12 ? 0 : shown;
	return period === PM ? noon + MAX_HOUR_12 : noon;
}

/** The hour a 12-hour clock shows for a 24-hour hour. */
export function to12(hour: number): number {
	const shown = hour % MAX_HOUR_12;
	return shown === 0 ? MAX_HOUR_12 : shown;
}

/** Which half of the day a 24-hour hour falls in. */
export function periodOf(hour: number): number {
	return hour >= MAX_HOUR_12 ? PM : AM;
}

/**
 * The whole time the segments spell, or null while any segment they need is
 * empty. A 12-hour field needs its period before it spells anything, and a field
 * showing seconds needs its seconds.
 */
export function composeIso(
	texts: SegmentTexts,
	hour12: boolean,
	withSeconds: boolean,
): IsoTime | null {
	const shown = segmentNumber(texts.hour);
	const minute = segmentNumber(texts.minute);
	if (shown === null || minute === null) return null;
	if (minute < MIN_MINUTE || minute > MAX_MINUTE) return null;

	const period = segmentNumber(texts.dayperiod);
	if (hour12) {
		if (period === null) return null;
		if (shown < MIN_HOUR_12 || shown > MAX_HOUR_12) return null;
	} else if (shown < MIN_HOUR_24 || shown > MAX_HOUR_24) return null;

	const hour = to24(shown, period ?? AM, hour12);
	const head = `${digits(2, hour)}:${digits(2, minute)}`;
	if (!withSeconds) return head;

	const second = segmentNumber(texts.second);
	if (second === null || second < MIN_MINUTE || second > MAX_MINUTE) return null;
	return `${head}:${digits(2, second)}`;
}

/** True for the `HH:mm` or `HH:mm:ss` shape the family accepts as a bound or a value. */
export function isIsoTime(value: string): boolean {
	return timePattern.test(value);
}

/** Both bounds are padded to seconds here, so the comparison is plain text order. */
export function normaliseIso(value: IsoTime): IsoTime {
	const [hour, minute, second] = value.split(':');
	return `${digits(2, Number(hour))}:${minute}:${second ?? '00'}`;
}

export function clampIso(value: IsoTime, min: string, max: string): IsoTime {
	const now = normaliseIso(value);
	if (min !== '' && isIsoTime(min) && now < normaliseIso(min)) return trimTo(normaliseIso(min), value);
	if (max !== '' && isIsoTime(max) && now > normaliseIso(max)) return trimTo(normaliseIso(max), value);
	return value;
}

/** A clamped time comes back at the same granularity the field is working in. */
function trimTo(value: IsoTime, like: IsoTime): IsoTime {
	return like.length === 5 ? value.slice(0, 5) : value;
}

/** What one segment of a whole time reads as, in the clock the field is showing. */
export function isoPart(value: IsoTime, type: SegmentType, hour12: boolean): string {
	const [hourText, minuteText, secondText] = value.split(':');
	const hour = Number(hourText);
	if (type === 'hour') return `${hour12 ? to12(hour) : hour}`;
	if (type === 'minute') return `${Number(minuteText)}`;
	if (type === 'second') return `${Number(secondText ?? 0)}`;
	return `${periodOf(hour)}`;
}

/**
 * One arrow, page or Home/End step. Every segment wraps at its bounds, which is
 * what a person expects when clicking past 59 or past midnight, and the period
 * toggles because two values wrapped is a toggle.
 */
export function steppedText(
	type: SegmentType,
	text: string,
	by: number,
	hour12: boolean,
): string {
	const low = segmentMin(type, hour12);
	const high = segmentMax(type, hour12);
	const current = segmentNumber(text);
	if (current === null) return `${Math.min(Math.max(baseValue(type, hour12), low), high)}`;

	const span = high - low + 1;
	const next = low + (((current - low + by) % span) + span) % span;
	return `${next}`;
}

/** Home and End: straight to the segment's own bound. */
export function boundText(type: SegmentType, edge: 'min' | 'max', hour12: boolean): string {
	return `${edge === 'min' ? segmentMin(type, hour12) : segmentMax(type, hour12)}`;
}

/**
 * When a segment can hold no more, which is what moves focus on. An hour showing
 * 2 on a 12-hour clock is full at one digit, because a second digit could only
 * overflow; a minute is full from 6 up for the same reason.
 */
export function isFull(type: SegmentType, text: string, hour12: boolean): boolean {
	if (type === 'dayperiod') return true;
	const value = segmentNumber(text);
	if (value === null || value === 0) return false;
	if (text.length >= SEGMENT_WIDTH[type]) return true;
	if (type === 'hour') return hour12 ? value >= 2 : value >= 3;
	return value >= 6;
}

/**
 * What one typed digit does to a segment.
 *
 * The rules are `datebox`'s: a digit is appended, except where appending could
 * only produce a number the segment cannot hold - and then the digit replaces
 * what was there. A lone "0" is kept as typed rather than rounded up to the
 * segment's minimum: the element's text is drawn from this value, so an interim
 * zero has nowhere else to live while the second digit is on its way.
 */
export function typedText(
	type: SegmentType,
	text: string,
	digit: string,
	hour12: boolean,
): { readonly text: string; readonly full: boolean } {
	const stripped = text.startsWith('0') ? text.slice(1) : text;
	const appended = stripped + digit;
	const high = segmentMax(type, hour12);
	const replace = stripped.length >= SEGMENT_WIDTH[type] || Number(appended) > high;
	const next = replace ? digit : appended;
	const held = Number(next);
	const settled = held > high ? `${high}` : next;
	return { text: settled, full: isFull(type, settled, hour12) };
}

/** Backspace takes the last digit off, leaving the segment empty at the end. */
export function erasedText(text: string): string {
	return text.slice(0, -1);
}

/** The text a numeric segment shows: its digits, zero-padded when asked for. */
export function displayText(
	type: SegmentType,
	text: string,
	showLeadingZero: boolean,
): string {
	if (text === '' || text === '0') return text;
	const value = Number(text);
	if (showLeadingZero && SEGMENT_WIDTH[type] === 2 && value < 10) return `0${value}`;
	return `${value}`;
}

/** What the segments hold, whichever of them the consumer wrote. */
export type SegmentTexts = {
	readonly hour: string;
	readonly minute: string;
	readonly second: string;
	readonly dayperiod: string;
};

/**
 * What one segment holds: whatever has been typed there, or the matching part of
 * the time the consumer seeded while nothing has.
 *
 * `null` is "nobody has touched this segment" and `""` is "somebody emptied it",
 * which is why an override cell cannot simply hold the text.
 */
export function resolvedText(
	type: SegmentType,
	seed: string,
	hourAt: string | null,
	minuteAt: string | null,
	secondAt: string | null,
	periodAt: string | null,
	hour12: boolean,
): string {
	const at =
		type === 'hour'
			? hourAt
			: type === 'minute'
				? minuteAt
				: type === 'second'
					? secondAt
					: periodAt;
	if (typeof at === 'string') return at;
	return isIsoTime(seed) ? isoPart(seed, type, hour12) : '';
}

export function resolvedTexts(
	seed: string,
	hourAt: string | null,
	minuteAt: string | null,
	secondAt: string | null,
	periodAt: string | null,
	hour12: boolean,
): SegmentTexts {
	return {
		hour: resolvedText('hour', seed, hourAt, minuteAt, secondAt, periodAt, hour12),
		minute: resolvedText('minute', seed, hourAt, minuteAt, secondAt, periodAt, hour12),
		second: resolvedText('second', seed, hourAt, minuteAt, secondAt, periodAt, hour12),
		dayperiod: resolvedText('dayperiod', seed, hourAt, minuteAt, secondAt, periodAt, hour12),
	};
}

/** The whole time the segments currently spell, or null while they do not spell one. */
export function resolvedValue(
	seed: string,
	hourAt: string | null,
	minuteAt: string | null,
	secondAt: string | null,
	periodAt: string | null,
	hour12: boolean,
	withSeconds: boolean,
): IsoTime | null {
	return composeIso(
		resolvedTexts(seed, hourAt, minuteAt, secondAt, periodAt, hour12),
		hour12,
		withSeconds,
	);
}

export function resolvedEmpty(
	seed: string,
	hourAt: string | null,
	minuteAt: string | null,
	secondAt: string | null,
	periodAt: string | null,
	hour12: boolean,
): boolean {
	const texts = resolvedTexts(seed, hourAt, minuteAt, secondAt, periodAt, hour12);
	return (
		texts.hour === '' && texts.minute === '' && texts.second === '' && texts.dayperiod === ''
	);
}

/**
 * The number one segment stands for right now, or null while it is empty. Null
 * rather than undefined: an undefined attribute value leaves the old one in place.
 */
export function resolvedNumber(
	type: SegmentType,
	seed: string,
	hourAt: string | null,
	minuteAt: string | null,
	secondAt: string | null,
	periodAt: string | null,
	hour12: boolean,
): number | null {
	return segmentNumber(
		resolvedText(type, seed, hourAt, minuteAt, secondAt, periodAt, hour12),
	);
}

/** The text one segment shows right now: its digits or its period word, or its placeholder while it is empty. */
export function resolvedDisplay(
	type: SegmentType,
	seed: string,
	hourAt: string | null,
	minuteAt: string | null,
	secondAt: string | null,
	periodAt: string | null,
	hour12: boolean,
	showLeadingZero: boolean,
	placeholder: string,
	locale: string,
): string {
	const text = resolvedText(type, seed, hourAt, minuteAt, secondAt, periodAt, hour12);
	if (type === 'dayperiod') {
		if (text === '') return placeholder;
		return segmentNumber(text) === PM ? periodWords(locale).pm : periodWords(locale).am;
	}
	const drawn = displayText(type, text, showLeadingZero);
	return drawn === '' ? placeholder : drawn;
}

/** What a reader is told the period segment holds, since its number says nothing on its own. */
export function resolvedPeriodWord(
	seed: string,
	hourAt: string | null,
	minuteAt: string | null,
	secondAt: string | null,
	periodAt: string | null,
	hour12: boolean,
	locale: string,
): string {
	const text = resolvedText('dayperiod', seed, hourAt, minuteAt, secondAt, periodAt, hour12);
	if (text === '') return '';
	return segmentNumber(text) === PM ? periodWords(locale).pm : periodWords(locale).am;
}

/**
 * The one correction a time owes after any segment changes: a whole time beyond
 * `min` or `max` is pulled back to that bound, which can move several segments at
 * once.
 */
export function settled(
	next: SegmentTexts,
	min: string,
	max: string,
	hour12: boolean,
	withSeconds: boolean,
): SegmentTexts {
	const composed = composeIso(next, hour12, withSeconds);
	if (composed === null) return next;

	const clamped = clampIso(composed, min, max);
	if (clamped === composed) return next;
	return {
		hour: isoPart(clamped, 'hour', hour12),
		minute: isoPart(clamped, 'minute', hour12),
		second: withSeconds ? isoPart(clamped, 'second', hour12) : next.second,
		dayperiod: hour12 ? isoPart(clamped, 'dayperiod', hour12) : next.dayperiod,
	};
}

/** What one keystroke does: the segments after it, and how far focus moves. */
export type KeyOutcome = SegmentTexts & {
	/** -1 for the segment before this one, 1 for the segment after, 0 to stay put. */
	readonly move: number;
};

function replaced(type: SegmentType, texts: SegmentTexts, text: string): SegmentTexts {
	if (type === 'hour') return { ...texts, hour: text };
	if (type === 'minute') return { ...texts, minute: text };
	if (type === 'second') return { ...texts, second: text };
	return { ...texts, dayperiod: text };
}

/**
 * The whole keyboard model in one place: arrows step, PageUp and PageDown step
 * further, Home and End jump to the segment's bounds, digits type, `a` and `p`
 * set the period, Backspace erases and then walks back, and left and right move
 * between segments. `null` is a key this family does not handle.
 */
export function keyOutcome(
	type: SegmentType,
	key: string,
	texts: SegmentTexts,
	min: string,
	max: string,
	hour12: boolean,
	withSeconds: boolean,
): KeyOutcome | null {
	const text = segmentText(type, texts);
	const land = (next: string, move: number): KeyOutcome => ({
		...settled(replaced(type, texts, next), min, max, hour12, withSeconds),
		move,
	});
	const step = (by: number) => land(steppedText(type, text, by, hour12), 0);

	if (key === 'ArrowLeft') return { ...texts, move: -1 };
	if (key === 'ArrowRight') return { ...texts, move: 1 };
	if (key === 'ArrowUp') return step(1);
	if (key === 'ArrowDown') return step(-1);
	if (key === 'PageUp') return step(PAGE_STEP[type]);
	if (key === 'PageDown') return step(-PAGE_STEP[type]);
	if (key === 'Home') return land(boundText(type, 'min', hour12), 0);
	if (key === 'End') return land(boundText(type, 'max', hour12), 0);
	if (key === 'Backspace') {
		if (text === '') return { ...texts, move: -1 };
		return land(erasedText(text), 0);
	}
	if (key === 'Delete') return land('', 0);
	if (type === 'dayperiod') {
		if (key === 'a' || key === 'A') return land(`${AM}`, 0);
		if (key === 'p' || key === 'P') return land(`${PM}`, 0);
		return null;
	}
	if (key.length === 1 && key >= '0' && key <= '9') {
		const typed = typedText(type, text, key, hour12);
		return land(typed.text, typed.full ? 1 : 0);
	}
	return null;
}
