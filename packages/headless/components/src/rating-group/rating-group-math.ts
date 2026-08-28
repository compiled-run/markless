/**
 * Every number `rating-group` computes: what the group holds, what a hover is
 * offering, how far a position is filled, and where a key or a pointer sends
 * the rating. The family's `.tsrx` holds markup and gesture wiring and nothing
 * else.
 */

/**
 * No hover is offering anything. Not 0: 0 is a rating a person can give.
 *
 * It is reached through calls rather than read as a constant, because a family
 * body is lifted into its own symbol where a module constant is out of scope.
 */
const NO_PREVIEW = -1;

export function noPreview(): number {
	return NO_PREVIEW;
}

export function hasPreview(previewAt: number): boolean {
	return previewAt !== NO_PREVIEW;
}

export function clamp(value: number, low: number, high: number): number {
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

/** The rating as it stands: the controlled prop, what a gesture wrote, or the seed. */
export function heldValue(
	given: number | undefined,
	own: number | null,
	seed: number,
): number {
	if (given !== undefined) return given;
	if (own !== null) return own;
	return seed;
}

/**
 * What the marks draw: the hover's offer while one is in flight, the committed
 * rating otherwise. Every fill, half and preview attribute reads this one
 * number, which is what makes the preview transient - nothing writes it back.
 */
export function shownValue(value: number, previewAt: number): number {
	if (previewAt === NO_PREVIEW) return value;
	return previewAt;
}

/**
 * The positions, `1 … count`. The root derives this from `count` and the
 * consumer repeats over it, which is how an item carries the rating it commits
 * without anybody counting rendered elements.
 */
export function positionsOf(count: number): readonly number[] {
	const list: number[] = [];
	for (let at = 1; at <= count; at += 1) list.push(at);
	return list;
}

/** How far one key moves the rating. */
export function stepSize(half: boolean): number {
	return half ? 0.5 : 1;
}

/** A rating runs from nothing rated to every position filled. */
export function boundedValue(raw: number, count: number): number {
	return clamp(raw, 0, count);
}

/**
 * How much of one position is filled, 0 to 1. A fraction between the two is a
 * half mark, which is the only fraction a `half` group can produce and the
 * reason this is a share rather than a boolean pair.
 */
export function fillShare(at: number, shown: number): number {
	return clamp(shown - at + 1, 0, 1);
}

export function isFilled(at: number, shown: number): boolean {
	return fillShare(at, shown) === 1;
}

export function isHalfFilled(at: number, shown: number): boolean {
	const share = fillShare(at, shown);
	return share > 0 && share < 1;
}

/** What the consumer paints the mark against. */
export function fillStyleText(at: number, shown: number): string {
	const share = Math.round(fillShare(at, shown) * 10000) / 100;
	return `--rating-fill: ${share}%`;
}

/**
 * Which position holds the group's single tab stop: the one the rating reaches,
 * and the first position while nothing is rated. Derived from the rating rather
 * than from construction order, so no part counts anything.
 */
export function focusPosition(value: number, count: number): number {
	if (value <= 0) return 1;
	return Math.min(count, Math.ceil(value));
}

export function isTabStop(at: number, value: number, count: number): boolean {
	return at === focusPosition(value, count);
}

/**
 * Whether a position is the checked radio. A half rating checks the position it
 * half fills: `aria-checked` takes one member, and the half mark is the one a
 * person is standing on.
 */
export function isChecked(at: number, value: number): boolean {
	if (value <= 0) return false;
	return Math.ceil(value) === at;
}

/** What a position is called when the consumer names none of them. */
export function itemName(at: number, count: number): string {
	return `${at} of ${count}`;
}

/** The rating as text. `ratinggroup.valuelabel` renders this, and `ui-value` carries it. */
export function valueText(value: number, count: number): string {
	return `${value} of ${count}`;
}

/**
 * Where a keystroke sends the rating, or null when the key is not one of ours.
 * `Home` is no rating rather than the first position: unlike a radio group a
 * rating has a way back to nothing, and that is the key that spells it.
 */
export function keyTarget(
	key: string,
	from: number,
	count: number,
	half: boolean,
	isRtl: boolean,
): number | null {
	if (key === 'Home') return 0;
	if (key === 'End') return count;

	const step = stepSize(half);
	// Only the horizontal pair flips: a vertical arrow means the same thing in either direction of text.
	const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
	const back = isRtl ? 'ArrowRight' : 'ArrowLeft';
	if (key === forward || key === 'ArrowUp') return boundedValue(from + step, count);
	if (key === back || key === 'ArrowDown') return boundedValue(from - step, count);
	return null;
}

/**
 * What a pointer inside one position picked. Without `half` a position is all
 * or nothing; with it, the near half of the mark is the half value - the
 * midway test both surveyed libraries use, measured against the mark's own box
 * rather than the group's, so an uneven layout still splits each mark evenly.
 */
export function valueAtPointer(
	at: number,
	clientX: number,
	left: number,
	width: number,
	half: boolean,
	isRtl: boolean,
): number {
	if (!half || width <= 0) return at;

	const share = isRtl ? (left + width - clientX) / width : (clientX - left) / width;
	if (share < 0.5) return at - 0.5;
	return at;
}
