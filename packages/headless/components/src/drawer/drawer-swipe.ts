import type { DrawerOrientation } from './drawer-types.ts';

/**
 * The swipe's arithmetic, as a pure module: no DOM beyond one measurement and one
 * direction reading, no state, nothing that renders.
 *
 * Everything here speaks in *fractions of the drawer's own size along its axis*
 * rather than pixels. `open` is how much of the drawer is showing (1 is fully
 * open), `hidden` is `1 - open`, and `hidden` is what the family publishes as
 * `--offset` for CSS to multiply by 100% of the element. Fractions are why a rest
 * position needs no measurement at all, which is what makes a snap point work on
 * a drawer the server sent open.
 */

/** Pixels per millisecond past which a release is a flick. Vaul's `VELOCITY_THRESHOLD`. */
export const VELOCITY_THRESHOLD = 0.4;

/** How far past the lowest rest position a slow release closes the drawer. Ark's and Vaul's number. */
export const CLOSE_THRESHOLD = 0.25;

/** The one rest position a drawer has unless the consumer configures more. Ark's default. */
export const DEFAULT_SNAP_POINTS: readonly number[] = [1];

const EPSILON = 1e-6;

/** One configured rest position: the value the consumer authored, and where it puts the drawer. */
export type ResolvedSnap = {
	/** The number the consumer wrote, and the number `onSnapPointChange` reports. */
	readonly value: number;
	/** How much of the drawer is showing there, as a fraction from 0 to 1. */
	readonly open: number;
};

/** What a released swipe settles into. */
export type DrawerRelease = {
	readonly close: boolean;
	readonly snap: number;
};

function clampFraction(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/** Direction lives on the element, so it is read from the element rather than taken as a prop. */
export function isRightToLeft(surface: HTMLElement | null | undefined): boolean {
	if (!surface) return false;
	return window.getComputedStyle(surface).direction === 'rtl';
}

/** The surface's size along the axis it travels on, in pixels. */
export function measureSurface(surface: HTMLElement, orientation: DrawerOrientation): number {
	const box = surface.getBoundingClientRect();
	return orientation === 'vertical' ? box.height : box.width;
}

/** Where a pointer is along the drawer's axis, in client pixels. */
export function axisAt(clientX: number, clientY: number, orientation: DrawerOrientation): number {
	return orientation === 'vertical' ? clientY : clientX;
}

/**
 * Which way along the axis takes the drawer out of view: +1 when a rising client
 * coordinate closes it, -1 when a falling one does.
 *
 * A bottom sheet closes downward and a top sheet upward; on the inline axis the
 * page's own direction flips the answer, which is why an end-anchored drawer in a
 * right-to-left page closes leftward without the consumer saying so.
 */
export function closeSign(
	orientation: DrawerOrientation,
	start: boolean,
	flipped: boolean,
): number {
	const alongAxis = start ? -1 : 1;
	return orientation === 'horizontal' && flipped ? -alongAxis : alongAxis;
}

/** Where one authored snap point puts the drawer. Above 1 it is pixels, and pixels need the measurement. */
export function openFractionOf(snap: number, size: number): number {
	if (!Number.isFinite(snap) || snap <= 0) return 0;
	if (snap <= 1) return snap;
	// A pixel snap before the first gesture has no size to divide by, so it rests fully open.
	if (size <= 0) return 1;
	return clampFraction(snap / size);
}

/**
 * The configured rest positions, ascending by how open they are, deduplicated,
 * and never empty. This is the list every walk over snap points iterates.
 */
export function resolveSnaps(points: readonly number[], size: number): ResolvedSnap[] {
	const resolved: ResolvedSnap[] = [];
	for (const point of points) {
		const open = openFractionOf(point, size);
		if (open <= 0) continue;
		if (resolved.some((already) => Math.abs(already.open - open) < EPSILON)) continue;
		resolved.push({ value: point, open });
	}
	if (resolved.length === 0) return [{ value: 1, open: 1 }];
	return resolved.sort((one, other) => one.open - other.open);
}

/** The rest position in force: the controlled one, then what a gesture left, then the seed, then fully open. */
export function activeSnapOf(
	given: number | undefined,
	own: number | undefined,
	seed: number | undefined,
	snaps: readonly ResolvedSnap[],
): number {
	const held = given !== undefined ? given : own !== undefined ? own : seed;
	if (held !== undefined && snaps.some((snap) => snap.value === held)) return held;
	return snaps[snaps.length - 1].value;
}

/** How open the drawer is at rest, given the snap point in force. */
export function openAtSnap(active: number, snaps: readonly ResolvedSnap[]): number {
	for (const snap of snaps) {
		if (snap.value === active) return snap.open;
	}
	return 1;
}

/** What the family writes into `style` for CSS to translate against. */
export function offsetText(hidden: number): string {
	return `--offset: ${Math.round(clampFraction(hidden) * 10000) / 10000}`;
}

/** Where a swipe in flight has dragged the drawer to, as a hidden fraction. */
export function hiddenDuringDrag(grabHidden: number, travelled: number, size: number): number {
	if (size <= 0) return clampFraction(grabHidden);
	return clampFraction(grabHidden + travelled / size);
}

/** Pixels per millisecond toward closed. A move that took no measurable time reports the last reading. */
export function velocityOf(travelled: number, elapsed: number, previous: number): number {
	if (elapsed <= 0) return previous;
	return travelled / elapsed;
}

/**
 * Where a released swipe lands.
 *
 * A flick faster than the cutoff moves exactly one rest position in its own
 * direction, and closes the drawer when there is none left below - sequential
 * stepping, which is Base UI's `snapToSequentialPoints` behaviour made the only
 * rule, because "one flick, one step" is the predictable one. A slow release goes
 * to the nearest rest position, and closes only once the drawer has been pulled
 * more than `closeThreshold` of the way past its lowest one.
 */
export function decideRelease(
	hidden: number,
	grabHidden: number,
	velocity: number,
	snaps: readonly ResolvedSnap[],
	closeThreshold: number,
): DrawerRelease {
	const open = 1 - clampFraction(hidden);
	const grabOpen = 1 - clampFraction(grabHidden);
	const lowest = snaps[0];
	const highest = snaps[snaps.length - 1];

	if (velocity <= -VELOCITY_THRESHOLD) {
		for (const snap of snaps) {
			if (snap.open > grabOpen + EPSILON) return { close: false, snap: snap.value };
		}
		return { close: false, snap: highest.value };
	}

	if (velocity >= VELOCITY_THRESHOLD) {
		for (let index = snaps.length - 1; index >= 0; index--) {
			if (snaps[index].open < grabOpen - EPSILON) {
				return { close: false, snap: snaps[index].value };
			}
		}
		return { close: true, snap: lowest.value };
	}

	if (open < lowest.open && lowest.open - open >= closeThreshold * lowest.open) {
		return { close: true, snap: lowest.value };
	}

	let nearest = lowest;
	let distance = Math.abs(open - lowest.open);
	for (const snap of snaps) {
		const away = Math.abs(open - snap.open);
		if (away < distance) {
			nearest = snap;
			distance = away;
		}
	}
	return { close: false, snap: nearest.value };
}

/**
 * Which way an arrow key moves the drawer: +1 toward open, -1 toward closed, 0
 * for a key that is not on the drawer's axis.
 *
 * No reference library gives a keyboard any way to reach an intermediate rest
 * position; this is the family's own addition, and it is why the mapping is
 * derived from the close direction rather than written out four times.
 */
export function keyIntent(
	key: string,
	orientation: DrawerOrientation,
	start: boolean,
	flipped: boolean,
): number {
	const pressed =
		orientation === 'vertical'
			? key === 'ArrowDown'
				? 1
				: key === 'ArrowUp'
					? -1
					: 0
			: key === 'ArrowRight'
				? 1
				: key === 'ArrowLeft'
					? -1
					: 0;
	if (pressed === 0) return 0;
	return pressed === closeSign(orientation, start, flipped) ? -1 : 1;
}

/** One step along the configured rest positions. The walk stops at either end rather than cycling. */
export function stepSnap(active: number, snaps: readonly ResolvedSnap[], intent: number): number {
	let at = -1;
	for (let index = 0; index < snaps.length; index++) {
		if (snaps[index].value === active) at = index;
	}
	if (at === -1) return active;
	const next = at + intent;
	if (next < 0 || next >= snaps.length) return active;
	return snaps[next].value;
}
