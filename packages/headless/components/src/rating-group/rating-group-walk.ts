/**
 * The walk over the group's marks. The roster is the `element()` handle the
 * family binds on every `ratinggroup.item`, read back live and in document
 * order, so the mark at rating position `at` is the one at `at - 1`. Nothing
 * here queries the DOM and nothing counts rendered elements: the positions are
 * `1 … count`, which the root derived before any mark rendered.
 */
import { focusPosition } from './rating-group-math.ts';

type Marks = ReadonlyArray<HTMLElement>;

/** The mark standing at a rating position, or undefined when there is none. */
export function markAt(marks: Marks | undefined, at: number): HTMLElement | undefined {
	if (!marks) return undefined;
	return marks[at - 1];
}

/**
 * Which mark a rating change focuses: the one the new rating reaches, and the
 * first while nothing is rated. A half rating leaves focus on the mark it half
 * fills, so stepping 3 → 2.5 → 2 moves focus once, not twice.
 */
export function markToFocus(
	marks: Marks | undefined,
	value: number,
	count: number,
): HTMLElement | undefined {
	return markAt(marks, focusPosition(value, count));
}

/** The mark's box, for the midway test a half rating needs. */
export function markBox(mark: HTMLElement | undefined): { left: number; width: number } {
	if (!mark) return { left: 0, width: 0 };
	const box = mark.getBoundingClientRect();
	return { left: box.left, width: box.width };
}

/** Direction lives on the element, so it is read from the element rather than taken as a prop. */
export function isRightToLeft(group: HTMLElement | null | undefined): boolean {
	if (!group) return false;
	return window.getComputedStyle(group).direction === 'rtl';
}
