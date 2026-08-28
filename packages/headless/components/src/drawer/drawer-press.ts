import { velocityOf } from './drawer-swipe.ts';

/**
 * The gesture bookkeeping that must not live in the graph.
 *
 * Both things here are read back inside the gesture that wrote them, and a state
 * write starts a dispatch that lands only after the handler returns - so a cell
 * written by one pointer event and read by the next of the same swipe reads
 * stale. Neither renders, and neither needs to survive a resume.
 */

const armed = new WeakSet<HTMLElement>();

function isOnBackdrop(backdrop: HTMLElement | undefined, target: EventTarget | null): boolean {
	return backdrop !== undefined && target === backdrop;
}

/**
 * Arms the two-phase guard that makes a press on the backdrop a dismissal.
 *
 * A dismissal has to begin and end on the layer itself. A drag that starts on a
 * control inside the drawer and releases on the layer fires a `click` whose
 * target is the layer, and without this guard that drag would close the drawer -
 * which for a swipe-driven family is not hypothetical, it is the ordinary
 * gesture. The layer is identified by its own `element()` handle rather than by
 * `event.currentTarget`, which is null by the time a lazily loaded handler runs.
 */
export function armBackdropPress(
	backdrop: HTMLElement | undefined,
	target: EventTarget | null,
	button: number,
): void {
	if (!backdrop) return;
	if (isOnBackdrop(backdrop, target) && button === 0) {
		armed.add(backdrop);
		return;
	}
	armed.delete(backdrop);
}

/**
 * Whether the press now finishing is a dismissal. Reading disarms, so one press
 * can only ever answer once.
 */
export function isBackdropPressFinished(
	backdrop: HTMLElement | undefined,
	target: EventTarget | null,
): boolean {
	if (!backdrop) return false;
	const isArmed = armed.has(backdrop);
	armed.delete(backdrop);
	return isArmed && isOnBackdrop(backdrop, target);
}

/** Where the swipe was last seen, in pixels toward closed, and when. */
type SwipeReading = {
	at: number;
	time: number;
	velocity: number;
};

const readings = new WeakMap<HTMLElement, SwipeReading>();

/** Starts the speed record for one swipe. `at` counts pixels in the closing direction. */
export function beginSwipeReading(surface: HTMLElement, at: number, time: number): void {
	readings.set(surface, { at, time, velocity: 0 });
}

/**
 * Folds one pointer move into the speed record and answers the current speed, in
 * pixels per millisecond toward closed. A move that took no measurable time keeps
 * the previous reading rather than dividing by zero.
 */
export function recordSwipeReading(surface: HTMLElement, at: number, time: number): number {
	const last = readings.get(surface);
	if (!last) return 0;
	const velocity = velocityOf(at - last.at, time - last.time, last.velocity);
	readings.set(surface, { at, time, velocity });
	return velocity;
}

/** The speed the swipe was carrying when it was released. Reading forgets it. */
export function endSwipeReading(surface: HTMLElement): number {
	const last = readings.get(surface);
	readings.delete(surface);
	return last ? last.velocity : 0;
}
