/**
 * Every number `pad` computes: where a point sits, where a key or a pointer
 * sends it, and what a reader is told about it. The family's `.tsrx` holds
 * markup and gesture wiring and nothing else.
 *
 * The stepping and snapping here are `slider-math.ts`'s, copied rather than
 * imported: two families sharing a helper is a refactor to make when a third 2D
 * consumer appears, not a coupling to take on the first one.
 */
import type { PadAxis, PadBounds, PadBox, PadPoint } from './pad-types.ts';

/** How much bigger a shifted arrow is than one step. */
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
 * an axis from 5 in steps of 10 lands on 5, 15, 25.
 */
export function snapToStep(raw: number, min: number, max: number, step: number): number {
	if (!(step > 0)) return clamp(raw, min, max);

	const steps = Math.round((raw - min) / step);
	const landed = Number((min + steps * step).toFixed(decimalsOf(step)));
	return clamp(landed, min, max);
}

/** The four ends as one value. Written as a call so a part reads its cells into locals first. */
export function boundsOf(minX: number, maxX: number, minY: number, maxY: number): PadBounds {
	return { minX, maxX, minY, maxY };
}

export function boxOf(left: number, top: number, width: number, height: number): PadBox {
	return { left, top, width, height };
}

/** A handle with no `value` prop draws the first point, which is the one-handle case. */
export function idOf(point: PadPoint | undefined): string {
	if (point === undefined) return '';
	return point.id;
}

/** The points as they stand: the controlled array, what a gesture wrote, or the seed. */
export function heldPoints(
	given: readonly PadPoint[] | undefined,
	own: readonly PadPoint[] | null,
	seed: readonly PadPoint[],
): readonly PadPoint[] {
	if (given !== undefined) return given;
	if (own !== null) return own;
	return seed;
}

/** Where a point sits in the list, or -1. A handle with no id takes the first. */
export function pointIndex(points: readonly PadPoint[], id: string): number {
	if (id === '') return points.length > 0 ? 0 : -1;
	for (let at = 0; at < points.length; at++) {
		if (points[at].id === id) return at;
	}
	return -1;
}

/** The point a handle draws. A pad with no points at all reports its low corner. */
export function heldPoint(
	points: readonly PadPoint[],
	id: string,
	bounds: PadBounds,
): PadPoint {
	const at = pointIndex(points, id);
	if (at >= 0) return points[at];
	return { id, x: bounds.minX, y: bounds.minY };
}

/**
 * The list with one point moved. The same array comes back when nothing moved,
 * so a caller can drop a no-op rather than reporting one.
 */
export function movedPoints(
	points: readonly PadPoint[],
	id: string,
	x: number,
	y: number,
): readonly PadPoint[] {
	const at = pointIndex(points, id);
	if (at < 0) return points;

	const held = points[at];
	if (held.x === x && held.y === y) return points;

	const next = points.slice();
	next[at] = { id: held.id, x, y };
	return next;
}

function fractionOf(value: number, min: number, max: number): number {
	if (max <= min) return 0;
	return clamp((value - min) / (max - min), 0, 1);
}

function percentOf(value: number, min: number, max: number): string {
	const share = fractionOf(value, min, max) * 100;
	return `${Math.round(share * 100) / 100}%`;
}

/**
 * Where one handle sits, as a share of each axis. `--pad-y` is the value's own
 * share with 0% at `minY`, so the CSS default paints it from the bottom and a
 * y that means "up" points up.
 */
export function thumbStyleText(point: PadPoint, bounds: PadBounds): string {
	const x = percentOf(point.x, bounds.minX, bounds.maxX);
	const y = percentOf(point.y, bounds.minY, bounds.maxY);
	return `--pad-x: ${x}; --pad-y: ${y}`;
}

/** Where a pointer landed, in value units, snapped to the step. */
export function valueAtPointer(
	clientX: number,
	clientY: number,
	box: PadBox,
	bounds: PadBounds,
	step: number,
): { readonly x: number; readonly y: number } {
	const alongX = box.width > 0 ? clamp((clientX - box.left) / box.width, 0, 1) : 0;
	const downY = box.height > 0 ? clamp((clientY - box.top) / box.height, 0, 1) : 0;
	const x = bounds.minX + alongX * (bounds.maxX - bounds.minX);
	const y = bounds.minY + (1 - downY) * (bounds.maxY - bounds.minY);
	return {
		x: snapToStep(x, bounds.minX, bounds.maxX, step),
		y: snapToStep(y, bounds.minY, bounds.maxY, step),
	};
}

/**
 * Which handle a press moves: the nearest one, measured on each axis as a share
 * of its own range so a pad whose axes hold different units still picks the
 * handle a person aimed at. The earlier handle wins a tie.
 */
export function nearestId(
	points: readonly PadPoint[],
	x: number,
	y: number,
	bounds: PadBounds,
): string {
	let winner = '';
	let best = Number.POSITIVE_INFINITY;
	for (const point of points) {
		const dx = fractionOf(point.x, bounds.minX, bounds.maxX) - fractionOf(x, bounds.minX, bounds.maxX);
		const dy = fractionOf(point.y, bounds.minY, bounds.maxY) - fractionOf(y, bounds.minY, bounds.maxY);
		const away = dx * dx + dy * dy;
		if (away < best) {
			best = away;
			winner = point.id;
		}
	}
	return winner;
}

/** Where a key sends a handle, and which axis it moved. */
export type PadStep = {
	readonly x: number;
	readonly y: number;
	readonly axis: PadAxis;
};

/**
 * Where a keystroke sends a handle, or null when the key is not one of ours.
 *
 * `Home` and `End` take the axis the handle is on to that axis's own ends -
 * colorpicker's per-axis `Home`/`End` ported onto one element, except that the
 * ends are the ends: a colour plane's corners are meaningful and its edges are
 * not, and a generic pad has no such claim.
 */
export function keyTarget(
	key: string,
	isBig: boolean,
	from: PadPoint,
	bounds: PadBounds,
	step: number,
	axisAt: PadAxis,
): PadStep | null {
	const size = isBig ? step * BIG_STEP : step;

	if (key === 'Home') {
		if (axisAt === 'y') return { x: from.x, y: bounds.minY, axis: 'y' };
		return { x: bounds.minX, y: from.y, axis: 'x' };
	}
	if (key === 'End') {
		if (axisAt === 'y') return { x: from.x, y: bounds.maxY, axis: 'y' };
		return { x: bounds.maxX, y: from.y, axis: 'x' };
	}
	if (key === 'ArrowRight') return { x: from.x + size, y: from.y, axis: 'x' };
	if (key === 'ArrowLeft') return { x: from.x - size, y: from.y, axis: 'x' };
	// Up increases y: screen y runs down, and what a value means runs up.
	if (key === 'ArrowUp') return { x: from.x, y: from.y + size, axis: 'y' };
	if (key === 'ArrowDown') return { x: from.x, y: from.y - size, axis: 'y' };
	return null;
}

export function axisValue(point: PadPoint, axis: PadAxis): number {
	return axis === 'y' ? point.y : point.x;
}

export function axisLowest(bounds: PadBounds, axis: PadAxis): number {
	return axis === 'y' ? bounds.minY : bounds.minX;
}

export function axisHighest(bounds: PadBounds, axis: PadAxis): number {
	return axis === 'y' ? bounds.maxY : bounds.maxX;
}

/** Both axes, in the order a person reads them. This is `pad.valuelabel`'s text too. */
export function pointText(point: PadPoint): string {
	return `X ${point.x}, Y ${point.y}`;
}

/**
 * What a handle announces. Both axes when focus has just arrived or the key
 * changed axis, the moved axis alone on every step after - colorpicker's
 * measured "long then short", which is the one idea worth keeping from React
 * Aria's colour work and costs one boolean cell.
 */
export function valueText(point: PadPoint, axis: PadAxis, stepping: boolean): string {
	if (!stepping) return pointText(point);
	if (axis === 'y') return `Y ${point.y}`;
	return `X ${point.x}`;
}

/**
 * The axis a handle reports as its value: the one a run of keys left it on, and
 * x for every handle that run is not on.
 */
export function axisFor(movingId: string, id: string, axisAt: PadAxis): PadAxis {
	return movingId === id ? axisAt : 'x';
}

/**
 * Whether a handle announces the short form. Only inside a run of keys along
 * that handle's own axis: focus arriving, a change of axis and any pointer
 * gesture all restore the form that names both numbers.
 */
export function shortFor(movingId: string, id: string, stepping: boolean): boolean {
	return movingId === id && stepping;
}

/** Which axis a key moves. A key that is not ours leaves the handle where it was. */
export function nextAxis(key: string, axisAt: PadAxis): PadAxis {
	if (key === 'ArrowUp' || key === 'ArrowDown') return 'y';
	if (key === 'ArrowLeft' || key === 'ArrowRight') return 'x';
	return axisAt;
}

/**
 * Whether the next announcement is the short form. Changing axis goes back to
 * the long one, so no axis is ever silently dropped from what a person hears.
 */
export function nextStepping(key: string, axisAt: PadAxis, stepping: boolean): boolean {
	if (key === 'Home' || key === 'End') return true;
	if (key === 'ArrowUp' || key === 'ArrowDown') return axisAt === 'y';
	if (key === 'ArrowLeft' || key === 'ArrowRight') return axisAt === 'x';
	return stepping;
}

/** What one handle submits: the two numbers, comma-separated, in x,y order. */
export function fieldText(point: PadPoint): string {
	return `${point.x},${point.y}`;
}
