import type { ResizableOrientation, ResizableSizes } from './resizable-types.ts';

/** How much bigger a shifted arrow is than one step. Slider ships the same factor. */
export const BIG_STEP = 10;

/** A share of the group, in points. The splitter's value speaks this scale. */
export const FULL = 100;

export function clamp(value: number, low: number, high: number): number {
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

/** Two decimals is finer than a pixel on any group a person can see. */
export function rounded(size: number): number {
	return Math.round(size * 100) / 100;
}

/** The sizes in force: the controlled record, then the family's own, then the seed. */
export function heldSizes(
	given: ResizableSizes | undefined,
	own: ResizableSizes | undefined,
	seed: ResizableSizes | undefined,
): ResizableSizes {
	if (given !== undefined) return given;
	if (own !== undefined) return own;
	if (seed !== undefined) return seed;
	return {};
}

/** What one panel measures, or undefined when nobody has said and it is an equal share. */
export function sizeOf(sizes: ResizableSizes, name: string): number | undefined {
	const held = sizes[name];
	if (typeof held !== 'number') return undefined;
	return held;
}

/** A panel's share, published for the consumer's stylesheet. Nothing is written when nobody has said. */
export function itemStyleText(size: number | undefined): string {
	if (size === undefined) return '';
	return `--size: ${rounded(size)}`;
}

/** What a reader speaks instead of a bare decimal. */
export function valueText(size: number | undefined): string | undefined {
	if (size === undefined) return undefined;
	return `${rounded(size)}%`;
}

/**
 * A separator's own axis is the perpendicular of the group it parts: panels side
 * by side are divided by a vertical splitter, which is the axis APG's Left and
 * Right arrows move.
 */
export function separatorAxis(orientation: ResizableOrientation): ResizableOrientation {
	return orientation === 'vertical' ? 'horizontal' : 'vertical';
}

/** Travel along the axis, as a share of the group. */
export function percentDelta(deltaAlong: number, groupSize: number): number {
	if (groupSize <= 0) return 0;
	return (deltaAlong / groupSize) * FULL;
}

/**
 * The pair after the primary panel is asked to measure `next`. The two exchange
 * the same number of points, so the group still sums to what it summed to: the
 * primary is held to its own limits and to whatever the panel behind it can give
 * up, and the rest of the group is untouched.
 */
export function resizedSizes(
	sizes: ResizableSizes,
	primary: string,
	secondary: string | undefined,
	next: number,
	min: number,
	max: number,
): ResizableSizes {
	const from = sizes[primary];
	if (typeof from !== 'number') return sizes;

	const behind = secondary === undefined ? undefined : sizes[secondary];
	const pair = typeof behind === 'number' ? from + behind : from;
	const highest = typeof behind === 'number' ? Math.min(max, pair) : max;
	const landed = rounded(clamp(next, Math.min(min, highest), highest));
	if (landed === rounded(from)) return sizes;

	const moved: ResizableSizes = { ...sizes, [primary]: landed };
	if (secondary !== undefined && typeof behind === 'number') {
		moved[secondary] = rounded(pair - landed);
	}
	return moved;
}

export function sameSizes(a: ResizableSizes, b: ResizableSizes): boolean {
	const names = Object.keys(a);
	if (names.length !== Object.keys(b).length) return false;
	return names.every((name) => a[name] === b[name]);
}

function arrowDelta(
	key: string,
	isBig: boolean,
	step: number,
	orientation: ResizableOrientation,
	isRtl: boolean,
): number {
	const size = isBig ? step * BIG_STEP : step;
	if (orientation === 'vertical') {
		if (key === 'ArrowDown') return size;
		if (key === 'ArrowUp') return -size;
		return 0;
	}
	if (key === 'ArrowRight') return isRtl ? -size : size;
	if (key === 'ArrowLeft') return isRtl ? size : -size;
	return 0;
}

/**
 * Where a keystroke sends the primary panel, or null when the key is not one of
 * ours. Home and End are APG's optional pair: the smallest and largest size the
 * panel is allowed.
 */
export function keyTarget(
	key: string,
	isBig: boolean,
	from: number,
	min: number,
	max: number,
	step: number,
	orientation: ResizableOrientation,
	isRtl: boolean,
): number | null {
	if (key === 'Home') return min;
	if (key === 'End') return max;

	const delta = arrowDelta(key, isBig, step, orientation, isRtl);
	if (delta === 0) return null;
	return from + delta;
}

/** The keys a divider consumes, so a press it will never act on costs nothing. */
export function isResizeKey(key: string, orientation: ResizableOrientation): boolean {
	if (key === 'Home' || key === 'End') return true;
	if (orientation === 'vertical') return key === 'ArrowUp' || key === 'ArrowDown';
	return key === 'ArrowLeft' || key === 'ArrowRight';
}
