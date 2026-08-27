// Every symbol this family compares against is read out of `Intl.NumberFormat`
// rather than written down: there is no format prop, so the locale is the only
// place the decimal, group, minus and currency characters can come from.

/** How much bigger a Page key and a shifted arrow are than one step. */
export const BIG_STEP = 10;

/** One press steps at once; a held press waits this long, then repeats. */
export const HOLD_DELAY_MS = 500;
export const REPEAT_MS = 50;

/** What an announcement says for a field holding nothing. */
export const EMPTY_SPOKEN = 'Empty';

/** A sample with a group, a fraction and a sign, so one format call names every symbol. */
const SAMPLE = -10000.111;

const MINUS_SIGN = '−';
const SPACES = [' ', ' ', ' ', ' '] as const;

export type NumberSymbols = {
	readonly decimal: string;
	readonly group: string;
	readonly minusSign: string;
	readonly plusSign: string;
	/** Every non-numeric character the format renders, so a pasted `$1,299.00` is typeable. */
	readonly extras: readonly string[];
};

/** The document's own language, or the runtime default when it declares none. */
function activeLocale(): string | undefined {
	if (typeof document === 'undefined') return undefined;
	const lang = document.documentElement.lang;
	return lang === '' ? undefined : lang;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, least: number, most: number): Intl.NumberFormat {
	const locale = activeLocale();
	const key = `${locale ?? ''}|${currency}|${least}|${most}`;
	const known = formatters.get(key);
	if (known) return known;

	const made = build(locale, currency, least, most);
	formatters.set(key, made);
	return made;
}

function build(
	locale: string | undefined,
	currency: string,
	least: number,
	most: number,
): Intl.NumberFormat {
	const digits = {
		minimumFractionDigits: least,
		maximumFractionDigits: Math.max(least, most),
	};
	if (currency !== '') {
		try {
			return new Intl.NumberFormat(locale, { style: 'currency', currency, ...digits });
		} catch {
			// An unknown code formats as a plain number rather than throwing at render.
		}
	}
	return new Intl.NumberFormat(locale, digits);
}

/** How many fraction digits this currency spends, or -1 when the code is not one. */
export function currencyScale(currency: string): number {
	if (currency === '') return -1;
	try {
		const resolved = new Intl.NumberFormat(activeLocale(), {
			style: 'currency',
			currency,
		}).resolvedOptions();
		return resolved.maximumFractionDigits ?? 2;
	} catch {
		return -1;
	}
}

const symbolTable = new Map<string, NumberSymbols>();

/**
 * The characters this locale spells a number with. React Aria's and Base UI's
 * mechanism: format a known sample and read the answer apart, so no symbol is
 * ever hardcoded and no consumer has to hand one over.
 */
export function localeSymbols(currency: string): NumberSymbols {
	const key = `${activeLocale() ?? ''}|${currency}`;
	const known = symbolTable.get(key);
	if (known) return known;

	const made = readSymbols(currency);
	symbolTable.set(key, made);
	return made;
}

function readSymbols(currency: string): NumberSymbols {
	const locale = activeLocale();
	const parts = formatterFor(currency, 0, 3).formatToParts(SAMPLE);
	// The chosen format may spend no fraction digits at all, so the decimal comes
	// from a plain formatter that certainly renders one.
	const fraction = new Intl.NumberFormat(locale).formatToParts(0.1);
	const positive = new Intl.NumberFormat(locale, { signDisplay: 'always' }).formatToParts(1);

	const extras: string[] = [];
	for (const part of parts) {
		if (part.type !== 'currency' && part.type !== 'literal') continue;
		for (const character of part.value) {
			if (!extras.includes(character)) extras.push(character);
		}
	}

	return {
		decimal: valueOfPart(fraction, 'decimal') ?? '.',
		group: valueOfPart(parts, 'group') ?? '',
		minusSign: valueOfPart(parts, 'minusSign') ?? '-',
		plusSign: valueOfPart(positive, 'plusSign') ?? '+',
		extras,
	};
}

function valueOfPart(
	parts: readonly Intl.NumberFormatPart[],
	type: Intl.NumberFormatPart['type'],
): string | undefined {
	for (const part of parts) if (part.type === type) return part.value;
	return undefined;
}

export function decimalsOf(value: number): number {
	const text = String(value);
	const dot = text.indexOf('.');
	if (dot < 0) return 0;
	return text.length - dot - 1;
}

export function clampTo(value: number, min: number | undefined, max: number | undefined): number {
	if (min !== undefined && value < min) return min;
	if (max !== undefined && value > max) return max;
	return value;
}

/**
 * The nearest reachable value. Steps are counted from `min` rather than zero, so
 * a field from 5 in steps of 10 lands on 5, 15, 25.
 */
export function snapToStep(
	raw: number,
	min: number | undefined,
	max: number | undefined,
	step: number,
): number {
	if (!(step > 0)) return clampTo(raw, min, max);

	const base = min ?? 0;
	const steps = Math.round((raw - base) / step);
	const digits = Math.max(decimalsOf(step), decimalsOf(base));
	const landed = Number((base + steps * step).toFixed(Math.min(digits, 15)));
	return clampTo(landed, min, max);
}

/**
 * Where a step lands. Snapping runs first: an off-grid value typed by hand is
 * pulled onto the grid in the direction pressed rather than carrying its offset
 * forward, and an empty field starts from the bound it is stepping away from.
 */
export function steppedValue(
	from: number | null,
	up: boolean,
	big: boolean,
	min: number | undefined,
	max: number | undefined,
	step: number,
): number {
	if (from === null) return snapToStep(up ? (min ?? 0) : (max ?? 0), min, max, step);

	const snapped = snapToStep(from, min, max, step);
	if (up ? snapped > from : snapped < from) return snapped;

	const amount = (big ? BIG_STEP : 1) * step;
	const digits = Math.max(decimalsOf(step), decimalsOf(from));
	const moved = Number((from + (up ? amount : -amount)).toFixed(Math.min(digits, 15)));
	return snapToStep(moved, min, max, step);
}

/** What a commit settles on: a currency rounds to its own scale, a plain number keeps what was typed. */
export function committedValue(
	raw: number | null,
	min: number | undefined,
	max: number | undefined,
	step: number,
	currency: string,
): number | null {
	if (raw === null) return null;

	const scale = currencyScale(currency);
	if (scale < 0) return clampTo(raw, min, max);

	const digits = Math.max(scale, decimalsOf(step));
	return clampTo(Number(raw.toFixed(Math.min(digits, 15))), min, max);
}

/** The formatted text: grouping, the locale's decimal, and the currency when there is one. */
export function formatNumber(value: number | null, step: number, currency: string): string {
	if (value === null) return '';

	const scale = currencyScale(currency);
	const least = scale < 0 ? decimalsOf(step) : Math.max(scale, decimalsOf(step));
	const most = scale < 0 ? Math.max(least, decimalsOf(value)) : least;
	const code = scale < 0 ? '' : currency;
	return formatterFor(code, Math.min(least, 20), Math.min(most, 20)).format(value);
}

/** What a form submits: the plain number, `.` for a decimal point and no grouping. */
export function canonicalText(value: number | null): string {
	if (value === null) return '';
	return String(value);
}

function withoutAll(text: string, mark: string): string {
	if (mark === '') return text;
	return text.split(mark).join('');
}

function countOf(text: string, mark: string): number {
	if (mark === '') return 0;
	return text.split(mark).length - 1;
}

function stripped(text: string, symbols: NumberSymbols, spaces: boolean): string {
	let left = text;
	for (const extra of symbols.extras) left = withoutAll(left, extra);
	if (spaces) for (const space of SPACES) left = withoutAll(left, space);
	return left;
}

// Only a locale that groups with a space has a space in its numbers. Everywhere
// else a typed space is a typed space, and the guard has to say so.
function groupsWithSpace(symbols: NumberSymbols): boolean {
	for (const space of SPACES) if (symbols.group === space) return true;
	return false;
}

/**
 * The number a string spells, or `null` when it spells none. Group separators are
 * dropped, the locale's decimal and a plain `.` both count as the point, and the
 * currency's own characters are subtracted before anything else is read.
 */
export function parseNumber(text: string, currency: string): number | null {
	const symbols = localeSymbols(currency);
	let left = stripped(text.trim(), symbols, true);
	if (left === '') return null;

	left = withoutAll(left, symbols.plusSign);
	left = withoutAll(left, '+');
	left = left.split(symbols.minusSign).join('-');
	// A plain point on a locale that spells its decimal otherwise is the person's
	// keyboard, not a group mark, so it is promoted before grouping is dropped.
	if (symbols.decimal !== '.' && countOf(left, symbols.decimal) === 0 && countOf(left, '.') === 1) {
		left = left.split('.').join(symbols.decimal);
	}
	left = withoutAll(left, symbols.group);
	if (symbols.decimal !== '.') left = left.split(symbols.decimal).join('.');

	if (!/^-?\d*\.?\d*$/.test(left)) return null;
	if (left === '' || left === '-' || left === '.' || left === '-.') return null;

	const held = Number(left);
	return Number.isFinite(held) ? held : null;
}

/**
 * Whether a half-typed string could still become a number here. Everything that
 * could legitimately belong to one in this locale is subtracted and what is left
 * must be nothing. A minus needs somewhere below zero to go, and a decimal point
 * needs a step that spends fraction digits.
 */
export function isValidPartial(
	text: string,
	min: number | undefined,
	max: number | undefined,
	step: number,
	currency: string,
): boolean {
	if (text === '') return true;

	const symbols = localeSymbols(currency);
	let left = stripped(text, symbols, groupsWithSpace(symbols));
	if (left === '') return true;

	if (left.startsWith('-') || left.startsWith(symbols.minusSign)) {
		if (min !== undefined && min >= 0) return false;
		left = left.slice(left.startsWith('-') ? 1 : symbols.minusSign.length);
	} else if (left.startsWith('+') || left.startsWith(symbols.plusSign)) {
		if (max !== undefined && max <= 0) return false;
		left = left.slice(left.startsWith('+') ? 1 : symbols.plusSign.length);
	}

	const scale = currencyScale(currency);
	const digits = scale < 0 ? decimalsOf(step) : Math.max(scale, decimalsOf(step));
	const points =
		countOf(left, symbols.decimal) + (symbols.decimal === '.' ? 0 : countOf(left, '.'));
	if (points > 1) return false;
	if (points === 1 && digits === 0) return false;

	left = withoutAll(left, symbols.group);
	left = withoutAll(left, symbols.decimal);
	if (symbols.decimal !== '.') left = withoutAll(left, '.');
	return /^\d*$/.test(left);
}

/**
 * What a reader is told. The minus is swapped for U+2212 so VoiceOver speaks it
 * even with a currency symbol between the sign and the digits, and an empty field
 * says so rather than being read as whatever sits around it.
 */
export function announcedText(text: string): string {
	if (text === '') return EMPTY_SPOKEN;
	return text.replace('-', MINUS_SIGN);
}

/** What the input shows: the typed text mid-edit, the formatted number otherwise. */
export function shownText(
	typed: string | null,
	settled: boolean,
	held: number | null,
	seed: number | null,
	step: number,
	currency: string,
): string {
	if (typed !== null) return typed;
	return formatNumber(settled ? held : seed, step, currency);
}

/**
 * What the field holds right now, for a handler about to act on it. A dispatch
 * runs after the browser has finished with the event, so mid-edit the element is
 * ahead of the graph and its own text is the truth; once a step or a commit has
 * settled a number, the graph is, and re-reading the element would step twice
 * from the same value while the DOM catches up.
 */
export function liveNumber(
	showing: string | undefined,
	typed: string | null,
	settled: boolean,
	held: number | null,
	seed: number | null,
	currency: string,
): number | null {
	if (settled && typed === null) return held;
	if (showing !== undefined) return parseNumber(showing, currency);
	return heldNumber(typed, settled, held, seed, currency);
}

/** What the field holds for a commit, which always takes the element's own word. */
export function typedNumber(
	showing: string | undefined,
	typed: string | null,
	settled: boolean,
	held: number | null,
	seed: number | null,
	currency: string,
): number | null {
	if (showing !== undefined) return parseNumber(showing, currency);
	return heldNumber(typed, settled, held, seed, currency);
}

/** The number the family holds: the live parse mid-edit, the committed number otherwise. */
export function heldNumber(
	typed: string | null,
	settled: boolean,
	held: number | null,
	seed: number | null,
	currency: string,
): number | null {
	if (typed !== null) return parseNumber(typed, currency);
	return settled ? held : seed;
}

/**
 * The most of what is in the field that could still become a number. Derived from
 * the field's own text and nothing else: a dispatch runs after the browser has
 * finished with the event, so any answer read out of the graph is one keystroke
 * behind the element it is about to rewrite.
 */
export function keptText(
	raw: string,
	min: number | undefined,
	max: number | undefined,
	step: number,
	currency: string,
): string {
	let kept = '';
	for (const character of raw) {
		if (isValidPartial(kept + character, min, max, step, currency)) kept += character;
	}
	return kept;
}

/** Where a rejected keystroke leaves the caret: back by however much was refused. */
export function caretAfterRefusal(caret: number | null, typed: number, kept: number): number {
	const at = caret ?? kept;
	const back = at - (typed - kept);
	if (back < 0) return 0;
	if (back > kept) return kept;
	return back;
}
