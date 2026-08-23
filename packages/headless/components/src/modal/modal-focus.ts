/**
 * The two focus moves the overlay behaviour deliberately leaves to the family.
 *
 * Both are retried per frame rather than done on the call: the surface is still
 * `hidden` when the opening handler runs, and the invoker is still `inert` when
 * the closing one does, so neither target can take focus yet. The retry gives
 * up rather than spinning.
 */

const TRIES = 12;

function land(target: HTMLElement | undefined): void {
	if (!target) return;

	let tries = TRIES;
	const step = () => {
		if (document.activeElement === target) return;
		target.focus();
		tries = tries - 1;
		if (tries > 0 && document.activeElement !== target) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}

/**
 * Land focus in the dialog.
 *
 * The surface itself takes it, not the first control inside it. Naming that
 * control would mean asking the DOM for the surface's focusable descendants,
 * and the library selects no DOM nodes. An alert is the exception the ruling
 * names: it prefers its close control, which is a part and so has a handle.
 */
export function focusIntoSurface(
	content: HTMLElement | undefined,
	close: HTMLElement | undefined,
	isAlert: boolean,
): void {
	if (isAlert && close) return land(close);
	land(content);
}

/** Hand focus back to the control that opened the dialog. */
export function focusBackToInvoker(invoker: HTMLElement | undefined): void {
	land(invoker);
}
