import type { CarouselMove } from './carousel-types.ts';

/**
 * Where a slide keeps its own name. The array-typed handle answers the slide
 * elements in document order, and this attribute is how that order is read back
 * as values without selecting for anything.
 */
export const SLIDE_VALUE_ATTRIBUTE = 'ui-value';

export function slideValues(slideEls: readonly HTMLElement[]): string[] {
	return slideEls.map((slide) => slide.getAttribute(SLIDE_VALUE_ATTRIBUTE) ?? '');
}

/**
 * The slides a trigger may actually stop on, by value. Stepping by `move` from
 * the first slide leaves a remainder at the end, so the last reachable slide is
 * added and the far end is always reachable.
 */
export function reachableValues(
	slideEls: readonly HTMLElement[],
	slidesPerView: number,
	move: CarouselMove,
	isLoop: boolean,
): string[] {
	const values = slideValues(slideEls);
	const step = move === 'view' ? Math.max(1, slidesPerView) : Math.max(1, move);
	const last = isLoop ? values.length - 1 : values.length - slidesPerView;

	if (values.length === 0) return [];
	if (last < 0) return [];

	const reachable: string[] = [];
	for (let index = 0; index <= last; index += step) {
		reachable.push(values[index] ?? '');
	}

	if (last % step !== 0) reachable.push(values[last] ?? '');

	return reachable;
}

/**
 * The value one step away, or undefined when there is nowhere to go. A wrapping
 * carousel comes round; otherwise the ends stop.
 */
export function stepValue(
	reachable: readonly string[],
	current: string,
	direction: number,
	isWrapping: boolean,
): string | undefined {
	if (reachable.length === 0) return undefined;

	const last = reachable.length - 1;
	const at = reachable.indexOf(current);
	const raw = at + direction;

	if (raw < 0) return isWrapping ? reachable[last] : reachable[0];
	if (raw > last) return isWrapping ? reachable[0] : reachable[last];

	return reachable[raw];
}

/** Where a key lands. Home and End jump; the arrows step and may wrap. */
export function keyValue(
	reachable: readonly string[],
	current: string,
	key: string,
	isWrapping: boolean,
): string | undefined {
	if (reachable.length === 0) return undefined;
	if (key === 'Home') return reachable[0];
	if (key === 'End') return reachable[reachable.length - 1];

	return stepValue(reachable, current, key === 'ArrowRight' ? 1 : -1, isWrapping);
}

/** Autoplay always comes round, whatever `loop` says. */
export function autoplayValue(
	reachable: readonly string[],
	current: string,
): string | undefined {
	if (reachable.length === 0) return undefined;

	const at = reachable.indexOf(current);
	return reachable[(at + 1) % reachable.length];
}
