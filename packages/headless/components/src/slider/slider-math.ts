import type { SliderSide, SliderValue } from './slider-types.ts';

/** How much bigger a Page key and a shifted arrow are than one step. */
const BIG_STEP = 10;

export function clamp(value: number, low: number, high: number): number {
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

function decimalsOf(step: number): number {
	const text = String(step);
	const dot = text.indexOf('.');
	if (dot < 0) return 0;
	return text.length - dot - 1;
}

/**
 * The nearest reachable value. Steps are counted from `min`, not from zero, so
 * a slider from 5 in steps of 10 lands on 5, 15, 25.
 */
export function snapToStep(raw: number, min: number, max: number, step: number): number {
	if (!(step > 0)) return clamp(raw, min, max);

	const steps = Math.round((raw - min) / step);
	const landed = Number((min + steps * step).toFixed(decimalsOf(step)));
	return clamp(landed, min, max);
}

/** Where a thumb may go: the slider's own ends, narrowed by the other thumb. */
export function boundedValue(
	next: number,
	min: number,
	max: number,
	step: number,
	start: number,
	end: number,
	side: SliderSide,
	isRange: boolean,
): number {
	const landed = snapToStep(next, min, max, step);
	if (side === 'start') return clamp(landed, min, isRange ? end : max);
	return clamp(landed, isRange ? start : min, max);
}

export function reportedValue(isRange: boolean, start: number, end: number): SliderValue {
	if (isRange) return [start, end];
	return end;
}

export function valueText(isRange: boolean, start: number, end: number): string {
	if (isRange) return `${start} – ${end}`;
	return `${end}`;
}

/** The low value a pair carries. A one-value slider has none, so its low end is `min`. */
function startSeed(value: SliderValue | undefined, min: number): number {
	if (Array.isArray(value)) return value[0];
	return min;
}

function endSeed(value: SliderValue | undefined, min: number): number {
	if (value === undefined) return min;
	if (Array.isArray(value)) return value[1];
	return value;
}

/**
 * Where a thumb is now: what a gesture last wrote, or the seed the root was
 * given. The two are separate because the seed may be one number or a pair,
 * which is a shape a seed position cannot split.
 */
export function currentStart(
	startAt: number | null,
	value: SliderValue | undefined,
	min: number,
): number {
	return startAt ?? startSeed(value, min);
}

export function currentEnd(
	endAt: number | null,
	value: SliderValue | undefined,
	min: number,
): number {
	return endAt ?? endSeed(value, min);
}

export function currentOf(
	side: SliderSide,
	startAt: number | null,
	endAt: number | null,
	value: SliderValue | undefined,
	min: number,
): number {
	if (side === 'start') return currentStart(startAt, value, min);
	return currentEnd(endAt, value, min);
}

function fractionOf(value: number, min: number, max: number): number {
	if (max <= min) return 0;
	return clamp((value - min) / (max - min), 0, 1);
}

function percentOf(value: number, min: number, max: number): string {
	const share = fractionOf(value, min, max) * 100;
	return `${Math.round(share * 100) / 100}%`;
}

/** The filled span, published on the root so any descendant can paint against it. */
export function rootStyleText(start: number, end: number, min: number, max: number): string {
	return `--slider-start: ${percentOf(start, min, max)}; --slider-end: ${percentOf(end, min, max)}`;
}

/** Where one thumb sits, as a share of the rail. */
export function thumbStyleText(value: number, min: number, max: number): string {
	return `--slider-offset: ${percentOf(value, min, max)}`;
}

/** Where a pointer landed, as a share of the rail, with 0 always at the low value. */
export function pointerFraction(
	along: number,
	axisStart: number,
	axisSize: number,
	isFlipped: boolean,
): number {
	if (axisSize <= 0) return 0;

	const raw = (along - axisStart) / axisSize;
	return clamp(isFlipped ? 1 - raw : raw, 0, 1);
}

export function valueAtFraction(
	fraction: number,
	min: number,
	max: number,
	step: number,
): number {
	return snapToStep(min + fraction * (max - min), min, max, step);
}

/** Which thumb a track press moves: the nearer one, and the low one on a tie. */
export function nearerSide(
	value: number,
	start: number,
	end: number,
	isRange: boolean,
): SliderSide {
	if (!isRange) return 'end';
	if (value <= start) return 'start';
	if (value >= end) return 'end';
	if (value - start <= end - value) return 'start';
	return 'end';
}

function keyDelta(key: string, isBig: boolean, step: number, isRtl: boolean): number {
	const big = step * BIG_STEP;
	if (key === 'PageUp') return big;
	if (key === 'PageDown') return -big;

	const size = isBig ? big : step;
	if (key === 'ArrowUp') return size;
	if (key === 'ArrowDown') return -size;
	if (key === 'ArrowRight') return isRtl ? -size : size;
	if (key === 'ArrowLeft') return isRtl ? size : -size;
	return 0;
}

/** Where a keystroke sends a thumb, or null when the key is not one of ours. */
export function keyTarget(
	key: string,
	isBig: boolean,
	from: number,
	min: number,
	max: number,
	step: number,
	isRtl: boolean,
): number | null {
	if (key === 'Home') return min;
	if (key === 'End') return max;

	const delta = keyDelta(key, isBig, step, isRtl);
	if (delta === 0) return null;
	return from + delta;
}
