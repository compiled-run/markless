/**
 * The two-phase guard that makes a press on the backdrop a dismissal.
 *
 * A dismissal has to begin and end on the layer itself. A drag that starts on a
 * control inside the dialog and releases on the layer fires a `click` whose
 * target is the layer, and without this guard that drag would close the dialog.
 *
 * Two things are deliberate here. The layer is identified by its own `element()`
 * handle rather than by `event.currentTarget`, which is null by the time a lazily
 * loaded handler runs. And the armed set lives in this module rather than in the
 * widget's graph state, because a state write starts a dispatch that lands after
 * the handler returns while both halves of this guard run inside one gesture.
 * The flag never renders and never survives a resume, and it does not need to.
 */

const armed = new WeakSet<HTMLElement>();

function isOnBackdrop(backdrop: HTMLElement | undefined, target: EventTarget | null): boolean {
	return backdrop !== undefined && target === backdrop;
}

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
 * Whether the click now finishing is a dismissal. Reading disarms, so one press
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
