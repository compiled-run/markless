import type { CarouselMove } from './carousel-types.ts';

/**
 * Where a slide keeps its own name. The array-typed handle answers the slide
 * elements in document order, and this attribute is how that order is read back
 * as values without selecting for anything.
 */
export const SLIDE_VALUE_ATTRIBUTE = 'ui-value';

export function slideValues(slideEls: readonly HTMLElement[]): string[] {
	return slideEls.map(slideValue);
}

function slideValue(slide: HTMLElement | undefined): string {
	return slide?.getAttribute(SLIDE_VALUE_ATTRIBUTE) ?? '';
}

/**
 * The slides a trigger may actually stop on, by value. Stepping by `move` from
 * the first slide leaves a remainder at the end, so the last reachable slide is
 * added and the far end is always reachable.
 *
 * `slidesPerView` is one unless the carousel moves by `view`; the engine will
 * not hand a measured count to a carousel that steps by a fixed number. A count
 * larger than the slides would otherwise push `last` negative and leave nothing
 * reachable at all, which is a dead carousel rather than a stopped one.
 */
export function reachableValues(
	slideEls: readonly HTMLElement[],
	slidesPerView: number,
	move: CarouselMove,
	isLoop: boolean,
): string[] {
	const step = move === 'view' ? Math.max(1, slidesPerView) : Math.max(1, move);
	const last = isLoop ? slideEls.length - 1 : slideEls.length - Math.max(1, slidesPerView);

	if (slideEls.length === 0) return [];
	if (last < 0) return [];

	// Read straight off the reachable slides: naming every slide first reads an
	// attribute per slide to keep one in `step` of them.
	const reachable: string[] = [];
	for (let index = 0; index <= last; index += step) {
		reachable.push(slideValue(slideEls[index]));
	}

	if (last % step !== 0) reachable.push(slideValue(slideEls[last]));

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
